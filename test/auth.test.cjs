/* Pairing-token auth model, exercised black-box over the gateway HTTP surface.
 * Remote clients are simulated with X-Forwarded-* headers on a loopback socket
 * (exactly what a same-host reverse proxy produces). */
'use strict'
const { test } = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const net = require('node:net')
const { REMOTE_HEADERS, startMockTarget, startGateway, startGatewayAt, request, cookieFrom, pairDevice, stopAll } = require('./util.cjs')

const PORT = 39212
const TARGET_PORT = 39211

async function boot(extraEnv) {
  const target = await startMockTarget(TARGET_PORT)
  const gw = startGateway(PORT, TARGET_PORT, extraEnv)
  await gw.ready
  return { target, gw, stop: () => stopAll(target, gw.child) }
}

test('unpaired remote gets 401 pairing page; local-only surface rejects proxied requests', async () => {
  const { stop } = await boot()
  try {
    const page = await request(PORT, { path: '/', headers: REMOTE_HEADERS })
    assert.strictEqual(page.status, 401)
    assert.ok(page.body.includes('设备配对'), 'pairing page shown')
    assert.ok(!page.body.includes('?t='), 'no URL token flow anywhere')

    const api = await request(PORT, { path: '/api/session', headers: REMOTE_HEADERS })
    assert.strictEqual(api.status, 401)
    assert.strictEqual(JSON.parse(api.body).reason, 'unpaired')

    for (const p of ['/lan-gate/admin', '/lan-gate/status', '/lan-gate/action', '/lan-gate/pair', '/pwa/push/send']) {
      const isGet = p === '/lan-gate/admin' || p === '/lan-gate/status'
      const r = await request(PORT, { method: isGet ? 'GET' : 'POST', path: p, headers: REMOTE_HEADERS, body: isGet ? undefined : {} })
      assert.strictEqual(r.status, 403, p + ' must be local-only')
    }

    // /pwa assets are not served to unpaired clients either.
    const asset = await request(PORT, { path: '/pwa/manifest.json', headers: REMOTE_HEADERS })
    assert.strictEqual(asset.status, 401)
  } finally { await stop() }
})

test('pairing flow: code -> cookie -> proxied access; kind & revoke via admin', async () => {
  const { stop } = await boot()
  try {
    const { claim, cookie, id } = await pairDevice(PORT, '手机A')
    assert.strictEqual(claim.status, 200)
    assert.ok(cookie && cookie.startsWith('lg_device='), 'device cookie issued')
    assert.ok(String(claim.headers['set-cookie'][0]).includes('Secure'), 'Secure flag under https proxy')
    assert.ok(String(claim.headers['set-cookie'][0]).includes('HttpOnly'))

    // Cookie unlocks proxying + PWA assets, one code is single-use.
    const page = await request(PORT, { path: '/', headers: { ...REMOTE_HEADERS, cookie } })
    assert.strictEqual(page.status, 200)
    assert.ok(page.body.includes('upstream-ok'), 'reached upstream')
    assert.ok(page.body.includes('window.__DSH_PWA__'), 'PWA bootstrap injected')
    assert.ok(!/<html[^>]*data-lan-device/.test(page.body), 'kind auto = no device attr on <html>')
    const asset = await request(PORT, { path: '/pwa/manifest.json', headers: { ...REMOTE_HEADERS, cookie } })
    assert.strictEqual(asset.status, 200)

    // Status (local) sees the device; set kind=phone; injection now labels the page.
    const status = JSON.parse((await request(PORT, { path: '/lan-gate/status' })).body)
    assert.strictEqual(status.devices.length, 1)
    assert.strictEqual(status.devices[0].name, '手机A')
    await request(PORT, { method: 'POST', path: '/lan-gate/action', body: { action: 'set-kind', id, kind: 'phone' } })
    const phonePage = await request(PORT, { path: '/', headers: { ...REMOTE_HEADERS, cookie } })
    assert.ok(phonePage.body.includes('data-lan-device="phone"'), 'phone kind injected')
    assert.ok(!phonePage.body.includes('href="/lan-gate/admin"'), 'paired remote device gets no admin entry chip')

    // Revoke kills the cookie immediately.
    await request(PORT, { method: 'POST', path: '/lan-gate/action', body: { action: 'revoke', id } })
    const after = await request(PORT, { path: '/', headers: { ...REMOTE_HEADERS, cookie } })
    assert.strictEqual(after.status, 401)
  } finally { await stop() }
})

test('websocket upgrade rejected without device cookie', async () => {
  const { stop } = await boot()
  try {
    const reply = await new Promise((resolve, reject) => {
      const sock = net.connect(PORT, '127.0.0.1', () => {
        sock.write('GET / HTTP/1.1\r\nHost: x\r\nX-Forwarded-For: 203.0.113.9\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\n\r\n')
      })
      let buf = ''
      sock.on('data', (d) => { buf += d })
      sock.on('close', () => resolve(buf))
      sock.on('error', reject)
      setTimeout(() => { try { sock.destroy() } catch (e) {} resolve(buf) }, 2000)
    })
    assert.ok(reply.includes('403'), 'upgrade got 403, saw: ' + reply.slice(0, 60))
  } finally { await stop() }
})

test('five wrong codes lock the client out', async () => {
  const { stop } = await boot()
  try {
    await request(PORT, { method: 'POST', path: '/lan-gate/pair' })
    for (let i = 0; i < 5; i++) {
      const r = await request(PORT, { method: 'POST', path: '/lan-gate/pair/claim', headers: REMOTE_HEADERS, body: { code: 'WRONGAAA' } })
      assert.strictEqual(r.status, 403)
    }
    const gen = await request(PORT, { method: 'POST', path: '/lan-gate/pair' })
    const code = JSON.parse(gen.body).code
    const locked = await request(PORT, { method: 'POST', path: '/lan-gate/pair/claim', headers: REMOTE_HEADERS, body: { code } })
    assert.strictEqual(locked.status, 429, 'even the right code is refused while locked')
    assert.strictEqual(JSON.parse(locked.body).reason, 'locked')
  } finally { await stop() }
})

test('v1 state file is archived, not loaded', async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-mobile-pwa-test-'))
  fs.writeFileSync(path.join(home, 'lan-gate-state.json'), JSON.stringify({ decisions: { '192.168.1.5': { allow: true, token: 'x' } } }))
  const target = await startMockTarget(TARGET_PORT)
  const gw = startGatewayAt(home, PORT, TARGET_PORT)
  await gw.ready
  try {
    const status = JSON.parse((await request(PORT, { path: '/lan-gate/status' })).body)
    assert.strictEqual(status.devices.length, 0)
    assert.ok(fs.existsSync(path.join(home, 'lan-gate-state.json.v1.bak')), 'v1 archived')
  } finally { await stopAll(target, gw.child) }
})

test('paired devices survive a gateway restart', async () => {
  const target = await startMockTarget(TARGET_PORT)
  const gw1 = startGateway(PORT, TARGET_PORT)
  await gw1.ready
  let cookie
  try {
    cookie = (await pairDevice(PORT, '重启机')).cookie
  } finally { await stopAll(null, gw1.child) }
  await new Promise((r) => setTimeout(r, 300))
  const gw2 = startGatewayAt(gw1.home, PORT, TARGET_PORT)
  await gw2.ready
  try {
    const page = await request(PORT, { path: '/', headers: { ...REMOTE_HEADERS, cookie } })
    assert.strictEqual(page.status, 200)
    assert.ok(page.body.includes('upstream-ok'))
  } finally { await stopAll(target, gw2.child) }
})
