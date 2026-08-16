// dsh-mobile-pwa · dsh-push.mjs — agent-done push host plugin (OPTIONAL)
//
// Sends a mobile push notification (via the gateway's local /pwa/push/send)
// when a DSH agent finishes a turn. Deliberately minimal and defensive:
//
//   - inject: [] — uses only the Cordis event bus (ctx.on), no services, so
//     0811 strict injection can never block loading.
//   - Event names are configurable: DSH_PUSH_EVENTS (comma-separated).
//     Default "agent/turn-stopping" — the official turn-close checkpoint
//     ("the turn is about to close: the model owes no response"), payload
//     { agent, turn, signal }, per deepseek-harness docs/subsystems/core
//     and the scoped-events catalog. An unknown name simply never fires.
//   - Debounced: at most one notification per DSH_PUSH_DEBOUNCE_MS (default
//     15s), so event bursts produce a single nudge.
//   - By default the notification carries NO conversation content. Set
//     DSH_PUSH_SUMMARY=1 to include the turn's final assistant message
//     (truncated). The payload is aes128gcm-encrypted end-to-end, so the
//     push service (FCM/APNs/Mozilla) only ever sees ciphertext — the
//     remaining exposure is your own lock screen / notification center.
export const name = 'dsh-mobile-pwa-push'
export const inject = []

const GATEWAY_PORT = Number(process.env.LAN_GATE_PORT || 3088)
const EVENTS = String(process.env.DSH_PUSH_EVENTS || 'agent/turn-stopping').split(',').map((s) => s.trim()).filter(Boolean)
const DEBOUNCE_MS = Number(process.env.DSH_PUSH_DEBOUNCE_MS || 15000)
const INCLUDE_SUMMARY = process.env.DSH_PUSH_SUMMARY === '1'

// AssistantMessage content may be a plain string or an array of parts.
function messageText(message) {
  if (!message) return ''
  const c = message.content !== undefined ? message.content : message
  if (typeof c === 'string') return c
  if (Array.isArray(c)) {
    return c.map((p) => (typeof p === 'string' ? p : (p && typeof p.text === 'string' ? p.text : ''))).join(' ').trim()
  }
  return ''
}

// Last `assistant/message` of the closing turn, from the session's
// append-only event log (agent.session.events, see docs/subsystems/session).
function turnSummary(payload) {
  try {
    const events = payload && payload.agent && payload.agent.session && payload.agent.session.events
    if (!events || !events.length) return ''
    for (let i = events.length - 1; i >= 0; i--) {
      const ev = events[i]
      if (ev && ev.type === 'assistant/message' && ev.data && (payload.turn === undefined || ev.data.turn === payload.turn)) {
        return messageText(ev.data.message).replace(/\s+/g, ' ').trim().slice(0, 120)
      }
    }
  } catch (e) { /* summary is best-effort */ }
  return ''
}

export function apply(ctx) {
  let lastSent = 0

  const notify = (payload) => {
    const now = Date.now()
    if (now - lastSent < DEBOUNCE_MS) return
    lastSent = now
    const summary = INCLUDE_SUMMARY ? turnSummary(payload) : ''
    // Best-effort; never raise into the host.
    fetch(`http://127.0.0.1:${GATEWAY_PORT}/pwa/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'DSH 任务完成', body: summary || '智能体已完成当前回合' })
    }).catch(() => {})
  }

  for (const event of EVENTS) {
    try {
      ctx.on(event, notify)
    } catch (e) {
      console.warn(`[dsh-mobile-pwa-push] cannot listen on "${event}": ${String(e && e.message || e)}`)
    }
  }
  console.log(`[dsh-mobile-pwa-push] listening for: ${EVENTS.join(', ')} (set DSH_PUSH_EVENTS to adjust)`)
}
