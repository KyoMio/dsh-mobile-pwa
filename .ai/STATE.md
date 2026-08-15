# STATE.md · dsh-mobile-pwa

<!-- 阶段：stage / 当前任务 task / 状态 status / 下一步 next -->

- **stage**: `v0.1.0 骨架+核心闭环`
- **task**: 安全网关 + PWA 注入 + 触屏 + 推送 + 文档
- **status**: `MVP 完成，测试通过，待真机验证`
- **next**:
  1. 在真实 DSH 服务器上 `dsh plugin add ./dsh-mobile-pwa` 验证安装
  2. 真机（iOS/Android）验证「添加到主屏 + 触屏手势 + 通知」
  3. 决定 VAPID 推送方案（需要公网 push service）
  4. 提交 GitHub、发 PR 进 awesome-dsh-plugin
