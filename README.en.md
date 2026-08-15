# dsh-mobile-pwa · A real PWA for DeepSeek Harness on your phone

> Turn [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) into a **complete mobile PWA**: secure remote access to your own DSH server + install-to-homescreen standalone app + offline capability + touch gestures + agent-done push notifications.

Built on the MIT [dsh-mobile-gate](https://github.com/Bernardxu123/dsh-mobile-gate) secure-gateway base, with PWA differentiation.

---

## Features

| Module | What |
| --- | --- |
| 📡 **Secure remote access** | Isolated child-process gateway. First-visit approval on the host, one-time token per device, per-IP rate limiting. DSH stays `127.0.0.1`-only; the `/api` trust fence is untouched |
| 📱 **Real PWA** | `manifest.json` + service worker → install to homescreen as a standalone full-screen app with icon, splash, theme-color, maskable assets |
| 🌐 **Offline** | SW: shell assets cache-first, API network-first with cache fallback, offline fallback page |
| 👆 **Touch gestures** | Pull-to-refresh, edge-swipe back, pinch-to-resize font (resettable) |
| 🔔 **Agent-done push** | Web Push when the agent finishes a turn, even when the phone shows another app (opt-in) |
| 📐 **Touch layout** | 44px targets, safe-area, full-screen dialogs, compact type, horizontal-scrolling code — **desktop never affected** |
| 🔒 **Desktop unaffected** | Every rule is rooted at `html[data-lan-device="phone"]` or an `@media(max-width:820px)` that excludes `data-lan-device="desktop"` |

---

## Architecture

```
Phone ──> gateway (isolated Node child · 0.0.0.0:3088)
            ├─ not approved       -> "waiting host approval" page (polls /lan-gate/admin)
            ├─ approved + token   -> reverse proxy to DSH Web UI (127.0.0.1:3080)
            │        └─ HTML injected: manifest link + PWA bootstrap + touch CSS + randomUUID polyfill
            ├─ /pwa/*             -> serves manifest / sw.js / app.css / icons / offline.html
            ├─ /pwa/push/*        -> subscribe & send agent-done notifications
            └─ over rate          -> 429 page
Host 127.0.0.1:3088/lan-gate/admin -> approve / deny / revoke devices, pick access mode (phone/desktop/auto)
```

---

## Quick start (on your own DSH server)

```bash
git clone https://github.com/<you>/dsh-mobile-pwa.git
cd dsh-mobile-pwa
dsh plugin --profile web add ./dsh-mobile-pwa
```

Or static-mount via [`cordis.patch.yml.example`](cordis.patch.yml.example).

### Env config

`LAN_GATE_PORT` (3088) · `LAN_GATE_HOST` (0.0.0.0) · `LAN_GATE_TARGET_PORT` (3080) · `LAN_GATE_RATE_LIMIT` (120) · `LAN_GATE_VAPID_PUBLICKEY` (empty, for push).

### Flow

1. Start DSH + this plugin → sees `[lan-gate] listening on 0.0.0.0:3088 -> 127.0.0.1:3080 (pwa=on)`.
2. Phone → open `http://<your-ip>:3088` → "waiting approval".
3. On the host → open `http://127.0.0.1:3088/lan-gate/admin` → approve the device, pick **phone**.
4. Phone → refresh → DSH UI, PWA-injected.
5. Browser menu → **Add to Home Screen** → standalone app.
6. (Optional) enable agent-done notifications from the injected hint.

---

## Test locally

```bash
npm test   # boots a mock upstream, asserts /pwa assets, HTML injection, status
```

---

## Layout

`lan-gate.mjs` (Cordis entry) · `dsh-push.mjs` (optional push host plugin) · `lib/lan-gate-server.cjs` (zero-dep gateway) · `pwa/` (manifest, sw.js, inject.js, touch-gestures.js, app.css, offline.html, icons) · `cordis.patch.yml(.example)` · `test/`

See [`AGENTS.md`](AGENTS.md) for development conventions (do not break isolation / CSS prefix rules / stable selectors).

---

## Security

Installing a plugin runs third-party code with your own permissions. Run only on your own server, keep credentials away, and audit `lib/lan-gate-server.cjs` changes. Always use approval + tokens for remote access; never expose the gateway port raw on the public internet.

## License

MIT. The gateway `lib/lan-gate-server.cjs` extends `dsh-mobile-gate`; original MIT copyright/license retained — see [LICENSE](LICENSE).
