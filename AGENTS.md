# AGENTS.md — Guide for AI agents

This file helps AI coding agents and LLM tooling understand and work in this repo.

## What this repo is

`dsh-mobile-pwa` is a **Cordis plugin for DeepSeek Harness (DSH)** that turns the DSH
Web UI into a complete mobile **PWA**. It runs a **standalone Node gateway child
process** that securely exposes the local DSH Web UI to LAN/Tailscale phones, and
injects PWA capability (manifest, service worker, touch layout, gestures, agent-done
push) into the served HTML.

- Gateway listens on `0.0.0.0:3088`; proxies approved devices to `127.0.0.1:3080`.
- DSH's own webserver stays `127.0.0.1` — the gateway never touches DSH config or
  its `/api` trust fence.

## Layout

| Path | Role |
| --- | --- |
| `lan-gate.mjs` | Cordis entry. `inject: ['subprocess']`; resolves `node`, spawns `lib/lan-gate-server.cjs`, wires disposal via `ctx.effect`. Never import the server into the DSH process. |
| `dsh-push.mjs` | OPTIONAL agent-done push host plugin. Best-effort hooks into a DSH turn-close service and POSTs to the gateway's local `/pwa/push/send`. Must never throw. |
| `lib/lan-gate-server.cjs` | The gateway. Single-file, **zero-dependency CommonJS**. HTTP + WebSocket reverse proxy, approval state machine, tokens, rate limit, admin page, and **HTML PWA injection** + `/pwa/*` static serving + `/pwa/push/*`. |
| `pwa/manifest.json` | PWA install manifest. |
| `pwa/sw.js` | Service worker: cache strategies + push notifications. |
| `pwa/inject.js` | Injected page bootstrap: SW register, gesture loader, push subscribe. |
| `pwa/touch-gestures.js` | Pull-to-refresh / edge-swipe / pinch-zoom. |
| `pwa/app.css` | Mobile touch-first CSS (< 44px targets, safe-area, compact type). |
| `pwa/offline.html` | Offline fallback page. |
| `pwa/icons/` | SVG source + rasterized PNGs (192/512 + maskable). |
| `cordis.patch.yml(.example)` | Bundle patch layer / static-mount example. |
| `test/gateway.test.cjs` | Smoke tests (boots gateway behind a mock upstream). |

## Key behaviours — don't break these

1. **Isolation**: the gateway is a child process. Never import its server code into
   the DSH process; keep spawn + lifecycle in `lan-gate.mjs`.
2. **`pwa/` serves the real browser scripts**: `/pwa/manifest.json`, `/pwa/sw.js`,
   `/pwa/app.css`, `/pwa/icons/*` are served from disk (read via `servePwaAsset`).
   The service worker MUST live at a fixed path (`/pwa/sw.js`) for registration to
   scope correctly.
3. **Scope mobile CSS**: every mobile rule must be prefixed with
   `html[data-lan-device="phone"]` (or the `@media (max-width:820px)` fallback that
   excludes `desktop`). Desktop must never be affected.
4. **Stable selectors**: prefer `[data-slot]`/ARIA selectors over hashed build class
   names (`Sh0Q9G_` etc.), which change per frontend build.
5. **Persistence**: approvals stored at `~/.dsh/lan-gate-state.json`; the pending
   list (`seen`) is in-memory and resets on restart.
6. **Local-only admin**: `/lan-gate/status`, `/lan-gate/action`, `/pwa/push/send`
   must reject non-local sockets (403).
7. **Port fallback**: on `EADDRINUSE`, server increments the port (up to +20).
8. **Injection quoting**: the HTML-injected inline CSS/JS strings in
   `lib/lan-gate-server.cjs` are JS string literals — keep quote usage consistent
   (historical bug: double quotes inside double quotes broke the injected script).

## Common tasks

- **Change port / rate / target**: top-of-file constants in
  `lib/lan-gate-server.cjs` or env vars `LAN_GATE_PORT`, `LAN_GATE_HOST`,
  `LAN_GATE_TARGET_PORT`, `LAN_GATE_RATE_LIMIT`, `LAN_GATE_VAPID_PUBLICKEY`.
- **Add a mobile CSS tweak**: append a `html[data-lan-device="phone"] ...` rule to
  `pwa/app.css` (kept in the file loaded by the injected `<link>`).
- **Change injected page behaviour**: edit `pwa/inject.js` (wired into the injected
  bootstrap) and touch gestures in `pwa/touch-gestures.js`.
- **Change PWA metadata/icons**: edit `pwa/manifest.json` and `pwa/icons/*`; re-run
  `rsvg-convert` if you change the SVG.

## Testing

```bash
npm test
```

Runs `node --test test/*.test.cjs`, booting `lib/lan-gate-server.cjs` behind a mock
DSH upstream (isolated temp `DSH_HOME`) and asserting `/pwa` asset serving, HTML
injection, and PWA status reporting.
