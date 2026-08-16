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
//   - Notification carries NO conversation content — the push service
//     (FCM/APNs/Mozilla) never sees what you and the agent said.
export const name = 'dsh-mobile-pwa-push'
export const inject = []

const GATEWAY_PORT = Number(process.env.LAN_GATE_PORT || 3088)
const EVENTS = String(process.env.DSH_PUSH_EVENTS || 'agent/turn-stopping').split(',').map((s) => s.trim()).filter(Boolean)
const DEBOUNCE_MS = Number(process.env.DSH_PUSH_DEBOUNCE_MS || 15000)

export function apply(ctx) {
  let lastSent = 0

  const notify = () => {
    const now = Date.now()
    if (now - lastSent < DEBOUNCE_MS) return
    lastSent = now
    // Best-effort; never raise into the host.
    fetch(`http://127.0.0.1:${GATEWAY_PORT}/pwa/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'DSH 任务完成', body: '智能体已完成当前回合' })
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
