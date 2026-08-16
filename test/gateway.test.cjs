/* dsh-mobile-pwa · gateway smoke test
 * Boots the real lib/lan-gate-server.cjs behind a mock DSH upstream and verifies:
 *   1. gateway starts and reports pwa:true (local admin surface)
 *   2. gateway serves /pwa/* assets to the local user
 *   3. gateway injects PWA bootstrap + manifest link into proxied HTML
 *   4. injected inline scripts stay syntactically sane (quoting bug guard)
 */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const { startMockTarget, startGateway, request, stopAll } = require('./util.cjs')

const PORT = 39202
const TARGET_PORT = 39201

async function boot() {
  const target = await startMockTarget(TARGET_PORT)
  const gw = startGateway(PORT, TARGET_PORT)
  await gw.ready
  return { gw, stop: () => stopAll(target, gw.child) }
}

test('gateway: starts and reports pwa:true', async () => {
  const { stop } = await boot()
  try {
    const status = await request(PORT, { path: '/lan-gate/status' })
    assert.strictEqual(status.status, 200)
    const j = JSON.parse(status.body)
    assert.strictEqual(j.state, 'running')
    assert.strictEqual(j.pwa, true)
  } finally { await stop() }
})

test('gateway: serves PWA assets (/pwa/manifest.json, /pwa/sw.js)', async () => {
  const { stop } = await boot()
  try {
    const manifest = await request(PORT, { path: '/pwa/manifest.json' })
    assert.strictEqual(manifest.status, 200)
    assert.strictEqual(JSON.parse(manifest.body).display, 'standalone')

    const sw = await request(PORT, { path: '/pwa/sw.js' })
    assert.strictEqual(sw.status, 200)
    assert.ok(sw.body.includes('dsh-mobile-pwa'))
  } finally { await stop() }
})

test('gateway: injects manifest link, PWA bootstrap & app.css into HTML (local)', async () => {
  const { stop } = await boot()
  try {
    const page = await request(PORT, { path: '/', headers: { accept: 'text/html' } })
    assert.strictEqual(page.status, 200)
    assert.ok(page.body.includes('rel="manifest"'), 'manifest link injected')
    assert.ok(page.body.includes('/pwa/app.css'), 'app.css linked')
    assert.ok(page.body.includes('window.__DSH_PWA__'), 'PWA bootstrap present')
    assert.match(page.body, /window\.__DSH_PWA__=\{vapid:"[A-Za-z0-9_-]{20,}"\}/, 'real VAPID public key injected')
  } finally { await stop() }
})

function extractInlineScripts(html) {
  const out = []
  const re = /<script([^>]*)>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) { if (!/src\s*=/.test(m[1])) out.push(m[2]) }
  return out
}
function balanced(s) {
  let depth = 0
  for (const ch of s) {
    if (ch === '{') depth++
    else if (ch === '}') { depth--; if (depth < 0) return false }
  }
  return depth === 0
}

test('gateway: injected inline scripts have balanced braces (quoting bug guard)', async () => {
  const { stop } = await boot()
  try {
    const page = await request(PORT, { path: '/', headers: { accept: 'text/html' } })
    const scripts = extractInlineScripts(page.body)
    assert.ok(scripts.length > 0, 'expected inline scripts')
    for (const s of scripts) assert.ok(balanced(s), 'inline script braces balanced: ' + s.slice(0, 40))
    assert.ok(page.body.includes('randomUUID'), 'uuid polyfill present')
  } finally { await stop() }
})
