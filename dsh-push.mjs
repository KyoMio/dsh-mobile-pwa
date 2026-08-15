// dsh-mobile-pwa · dsh-push.mjs — agent-done push host plugin (OPTIONAL)
//
// Delivers a mobile push notification when a DSH agent finishes a turn, so the
// phone owner can step away and be nudged when work completes.
//
// This is deliberately decoupled from the gateway: the gateway exposes
//   POST /pwa/push/send  (local-only) -> { title, body, tag?, data? }
// and the phone subscribes via  POST /pwa/push/subscribe  (see pwa/inject.js).
// This plugin detects turn-end locally and calls the gateway's local send
// endpoint, wiring "agent done" -> phone notification.
//
// It hooks the DSH conversation/turn lifecycle. The exact hook name depends on
// the DSH host API; below we use a best-effort subscription to a turn-close
// event and a conservative fallback: no crash if the hook is unavailable.
import { fileURLToPath } from 'node:url'

export const name = 'dsh-mobile-pwa-push'
export const inject = ['http', 'conversation'] // adjust to available host services

const GATEWAY_PORT = Number(process.env.LAN_GATE_PORT || 3088)

function sendToGateway(payload) {
  // Best-effort; never raise.
  return fetch('http://127.0.0.1:' + GATEWAY_PORT + '/pwa/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {})
}

export function apply(ctx) {
  const conv = ctx.get('conversation')

  // Attempt to register for turn-close notifications. Hook names vary by DSH
  // version; this is defensive and logs instead of failing.
  const candidates = [
    'message', 'message.create', 'turn.end', 'assistant.done',
    'session.message', 'onAssistantMessage'
  ]
  let wired = false
  for (const hook of candidates) {
    if (typeof (conv && conv[hook]) === 'function' || typeof (conv && conv.on) === 'function') {
      try {
        ;(conv.on || conv[hook].bind ? conv.on.bind(conv) : conv[hook].bind(conv))(hook, (payload) => {
          notify(payload)
        })
        wired = true
        break
      } catch (e) { /* try next */ }
    }
  }
  if (!wired && conv && typeof conv.on === 'function') {
    // Generic catch-all attempt.
    try {
      conv.on('message', (payload) => notify(payload))
    } catch (e) { /* ignore */ }
  }

  function notify(payload) {
    const p = payload || {}
    // Only notify for new assistant content that signals a completed step.
    const role = (p && (p.role || (p.message && p.message.role))) || ''
    const content = (p && (p.content || (p.message && p.message.content))) || ''
    if (role !== 'assistant' && role !== '') return
    if (!content) return
    sendToGateway({ title: 'DSH 任务完成', body: '智能体已完成：' + String(content).slice(0, 120) })
  }

  return () => {}
}
