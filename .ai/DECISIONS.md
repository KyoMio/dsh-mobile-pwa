# DECISIONS.md · 已确认重大决策

| 决策 | 理由 |
| --- | --- |
| 复用 `dsh-mobile-gate` 网关并增强，而非从零写 | MIT 许可，隔离子进程架构成熟，专注 PWA 差异化 |
| 首版做「完整版」而非 MVP | 用户明确选完整 PWA（手势+通知+离线一次做齐） |
| 用 PWA 插件（不建独立 React Native/Flutter App） | 定位是用户自建服务器+手机浏览器访问，插件装一行 `dsh plugin add`，天然进生态 |
| 网关保持零依赖单文件 CJS | 符合参考架构约定，易维护、易审计 |
| PWA 资产独立成文件（`pwa/`）由网关供出 | SW/manifest 需要固定 URL，不能只内嵌字符串 |
| 移动 CSS 走 `data-lan-device` 前缀 + 稳定 selector | 桌面零影响 + 抗前端构建 hash 变更 |
| 项目文档两套都要（普通开源 + `.ai/` 体系） | 用户明确选择 |
