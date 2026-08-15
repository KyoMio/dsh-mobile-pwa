/* dsh-mobile-pwa · PWA bootstrap (injected into DSH page)
 * Registers the service worker (offline cache + notifications), loads touch
 * gestures, and wires agent-done push. Runs only on phone devices
 * (`html[data-lan-device="phone"]`).
 */
(function () {
  'use strict'
  if (!window.__DSH_PWA__) window.__DSH_PWA__ = {}

  // ---- Register service worker ----------------------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/pwa/sw.js').then((reg) => {
        window.__DSH_PWA__.reg = reg
      }).catch((err) => {
        console.warn('[dsh-pwa] SW registration failed:', err)
      })
    })
  }

  // ---- Load touch gestures when on a phone device ---------------------
  var isPhone = document.documentElement.getAttribute('data-lan-device') === 'phone'
  if (isPhone) {
    var g = document.createElement('script')
    g.src = '/pwa/touch-gestures.js'
    g.async = true
    document.head.appendChild(g)
  }

  // ---- Agent-done notification (Web Push) -----------------------------
  // Subscribes to a gateway push endpoint. The gateway polls DSH event state and
  // triggers push. Grant & subscribe are opt-in via the button appended below.
  window.__DSH_PWA__.subscribe = function subscribe() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      alert('当前浏览器不支持推送通知')
      return Promise.reject(new Error('push unsupported'))
    }
    return new Promise(function (resolve, reject) {
      if (!window.__DSH_PWA__.reg) {
        navigator.serviceWorker.ready.then(function (reg) {
          window.__DSH_PWA__.reg = reg
          doSubscribe(reg).then(resolve).catch(reject)
        }).catch(reject)
      } else {
        doSubscribe(window.__DSH_PWA__.reg).then(resolve).catch(reject)
      }
    })
  }

  function doSubscribe(reg) {
    return reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: window.__DSH_PWA__._vapidKey || undefined
    }).then(function (sub) {
      // Notify the gateway so it can route push to this subscription.
      return fetch('/pwa/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
      })
    })
  }

  // Set VAPID when provided by the gateway.
  window.__DSH_PWA__.setVapidKey = function setVapidKey(ab) {
    window.__DSH_PWA__._vapidKey = ab
  }

  // ---- Notification enable hint (only when a phone, once) -------------
  if (isPhone && 'Notification' in window) {
    var seen = localStorage.getItem('dsh-pwa-notif-hint')
    if (!seen && window.Notification && window.Notification.permission === 'default') {
      var toast = document.createElement('div')
      toast.id = 'dsh-pwa-notif-hint'
      toast.style.cssText =
        'position:fixed;left:max(12px,env(safe-area-inset-left));right:max(12px,env(safe-area-inset-right));' +
        'bottom:max(96px,calc(env(safe-area-inset-bottom) + 96px));z-index:2147483005;' +
        'background:rgba(22,26,34,.96);border:1px solid #2a2f3a;border-radius:14px;' +
        'padding:14px 16px;color:#e6e8ec;font:13px/1.6 system-ui;' +
        '-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);box-shadow:0 10px 30px rgba(0,0,0,.5)'
      toast.innerHTML =
        '<div style="font-weight:600;margin-bottom:4px">🧭 任务完成提醒</div>' +
        '<div style="color:#9aa3b2;margin-bottom:10px">在你的服务器上开启后，智能体完成工作时会通过推送通知提醒你，即使切到别的 App。</div>' +
        '<div style="display:flex;gap:8px">' +
        '<button data-act="on" style="flex:1;background:#4c8dff;color:#fff;border:0;border-radius:9px;padding:9px 0;font-weight:600">开启</button>' +
        '<button data-act="off" style="flex:1;background:#2a2f3a;color:#9aa3b2;border:0;border-radius:9px;padding:9px 0">暂不</button>' +
        '</div>'
      toast.querySelector('[data-act="on"]').addEventListener('click', function () {
        try { window.__DSH_PWA__.subscribe() } catch (err) { /* ignore */ }
        toast.remove()
      })
      toast.querySelector('[data-act="off"]').addEventListener('click', function () {
        localStorage.setItem('dsh-pwa-notif-hint', '1')
        toast.remove()
      })
      document.body.appendChild(toast)
    }
  }
})()
