# STATE.md · dsh-mobile-pwa

<!-- 阶段：stage / 当前任务 task / 状态 status / 下一步 next -->

- **stage**: `rework/public-auth-push（fork KyoMio/dsh-mobile-pwa）· v0.2.0 开发完成待实机验收`
- **task**: 公网部署改造：配对码 + 设备令牌认证、反代对接（X-Forwarded-*）、真 Web Push（VAPID + aes128gcm）
- **status**: `代码 + 测试完成（13 用例，10/10 轮全绿）· 文档重写完成 · 待用户配反代后端到端验收`
- **本轮改动**（细节见 docs/spec-public-auth-push.md + .ai/DECISIONS.md rework 一节）:
  - 认证：废除按 IP 审批 / LAN 直通 / ?t= URL 令牌；配对码（一次性、10 分钟、5 错锁 15 分钟）→ lg_device Cookie；管理面仅本机直连
  - 网络：默认监听 127.0.0.1，信任回环/白名单反代的 X-Forwarded-For/Proto；修复 chunked+Content-Length、连接毒化、gzip 注入损坏三个代理层 bug
  - 推送：web-push 依赖（放弃零依赖）、VAPID 持久化、订阅要求已配对设备并设上限、404/410 自动清理、通知不带对话正文
  - 宿主插件 dsh-push.mjs：零注入、事件名 DSH_PUSH_EVENTS 可配、去抖
- **next**:
  1. 用户侧：配反代（README 有 nginx/Caddy 模板）→ 实机安装 → 手机配对 → PWA 安装 + 推送验收
  2. DSH_PUSH_EVENTS 事件名在实机核对（默认 turn.end 是猜测值）
  3. 验收通过后合回 main、打 tag、考虑发 npm 或给上游提 PR
