# dsh-mobile-pwa · 让 DeepSeek Harness 在手机上变成真 PWA

> 把 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）变成**手机上的完整 PWA**：安全远程访问你的自建 DSH + 一键「添加到主屏」成独立 App + 离线可用 + 触屏手势 + 任务完成推送。

基于 MIT 的 [`dsh-mobile-gate`](https://github.com/Bernardxu123/dsh-mobile-gate)（安全网关基座）做差异化增强。

📍 生态定位：社区现有移动端方案都停留在「窄屏 CSS 微调」，本项目做的是**移动端 PWA 一站式完整方案**。

---

## ✨ 特性

| 模块 | 说明 |
| --- | --- |
| 📡 **安全远程访问** | 独立子进程网关，首次访问**本机审批** + **每设备一次性令牌** + **每 IP 限流**。DSH 主服务仍只监听 `127.0.0.1`，`/api` 信任栅栏不受影响 |
| 📱 **真 PWA** | `manifest.json` + `service worker`：手机浏览器「**添加到主屏**」后全屏独立窗口运行，带图标/启动屏/主题色 |
| 🧩 **可安装** | 主屏图标、`standalone` 显示、`apple-touch-icon`、maskable 图标 |
| 🌐 **离线可用** | service worker：静态壳缓存优先、API 网络优先、导航离线回退页 |
| 👆 **触屏手势** | 下拉刷新、边缘右滑返回、**捏合缩放字体**（可重置） |
| 🔔 **任务完成推送** | agent 干完活 → Web Push 通知，切到别的 App 也能收到（可选手动开启） |
| 📐 **触屏布局** | 44px 触摸目标、safe-area 适配、全屏弹窗、紧凑排版、代码横向滚动——桌面零影响 |
| 🔒 **桌面不受影响** | 所有规则都以 `html[data-lan-device="phone"]` 或以排除 `data-lan-device="desktop"` 的 `@media` 为根 |

---

## 🏗️ 架构

```
手机 ──> 网关 (独立 Node 子进程 · 0.0.0.0:3088)
           ├─ 未批准 -> 「等待本机批准」页面（轮询 /lan-gate/admin）
           ├─ 已批准+令牌Cookie -> 反向代理到 DSH Web UI (127.0.0.1:3080)
           │      └─ HTML 注入：manifest link + PWA bootstrap + 触屏CSS + randomUUID polyfill
           ├─ /pwa/* -> 直接提供 manifest / sw.js / app.css / 图标 / offline.html
           ├─ /pwa/push/* -> 订阅 / 发送 agent 完成通知
           └─ 超限 -> 429 限流页
电脑 127.0.0.1:3088/lan-gate/admin  -> 批准/拒绝/撤销设备、选择访问方式(手机/电脑/自动)
```

- 网关是**独立子进程**，与 DSH 主进程隔离：挂掉不影响主服务，插件停止时自动终止。
- DSH CLI 官方禁止 `--host 0.0.0.0`（`/api` 无认证层），所以由网关担当地被批准设备与 DSH 之间的唯一通道。

---

## 🚀 快速开始（在你自己的 DSH 服务器上）

### 方式零：`dsh plugin add`（标准安装，推荐）

```bash
git clone https://github.com/<you>/dsh-mobile-pwa.git
cd dsh-mobile-pwa
dsh plugin --profile web add ./dsh-mobile-pwa
```

> 已声明 `dsh.bundle` manifest，安装后自动激活配置层，无需手写 patch。

### 方式一 / 方式二：静态挂载 / 动态插件

- 静态挂载：参考 [`cordis.patch.yml.example`](cordis.patch.yml.example)，把绝对路径替换进你的 profile patch。
- 动态插件：见 `lan-gate.mjs` 的注释（Cordis 动态插件包）。

### 配置（环境变量）

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `LAN_GATE_PORT` | `3088` | 网关监听端口 |
| `LAN_GATE_HOST` | `0.0.0.0` | 网关监听地址 |
| `LAN_GATE_TARGET_PORT` | `3080` | 本机 DSH Web UI 端口 |
| `LAN_GATE_RATE_LIMIT` | `120` | 每 IP 每分钟请求上限 |
| `LAN_GATE_VAPID_PUBLICKEY` | 空 | Web Push VAPID 公钥（用于任务完成通知） |

### 使用流程

1. **服务端**：启动 DSH + 本插件，看到 `[lan-gate] listening on 0.0.0.0:3088 -> 127.0.0.1:3080 (pwa=on)`。
2. **手机**：浏览器打开 `http://<你的IP>:3088` → 出现「等待本机批准」。
3. **电脑**：打开 `http://127.0.0.1:3088/lan-gate/admin` → 批准该设备并选「手机」。
4. **手机**：下拉刷新 → 进入 DSH Web UI（已注入 PWA）。
5. **添加到主屏**：浏览器菜单 → 「添加到主屏」→ 变成独立 App。
6. **（可选）任务完成通知**：注入页会提示开启通知。

---

## ⚙️ 本机安装测试

```bash
npm test   # 起 mock 上游，验证 /pwa 资产、HTML 注入、状态上报
```

---

## 🗂️ 项目结构

| 路径 | 作用 |
| --- | --- |
| `lan-gate.mjs` | Cordis 插件入口：spawn 网关子进程 + 生命周期管理 |
| `dsh-push.mjs` | （可选）agent 完成推送宿主插件，调网关 `/pwa/push/send` |
| `lib/lan-gate-server.cjs` | 网关本体：零依赖单文件（HTTP 代理 + 审批 + 令牌 + 限流 + PWA 注入） |
| `pwa/manifest.json` | PWA 安装清单 |
| `pwa/sw.js` | service worker（离线缓存 + 推送通知） |
| `pwa/inject.js` | 注入页引导：注册 SW + 加载手势 + 通知订阅 |
| `pwa/touch-gestures.js` | 下拉刷新 / 边缘返弹 / 捏合缩放 |
| `pwa/app.css` | 移动触屏布局（`data-lan-device` 前缀，桌面零影响） |
| `pwa/offline.html` | 离线回退页 |
| `pwa/icons/` | SVG 源 + 192/512 PNG + maskable 图标 |
| `cordis.patch.yml` / `.example` | 插件 bundle 挂载层 |
| `test/gateway.test.cjs` | 冒烟测试 |

---

## 🧑‍💻 开发贴士

- **隔离**：网关是子进程，`lan-gate.mjs` 只负责 spawn + 生命周期，永不 import 它的服务代码进 DSH 进程。
- **移动 CSS 前缀**：新规则一律挂 `html[data-lan-device="phone"]` 或排除 `desktop` 的 `@media(max-width:820px)`，**桌面必须永不受影响**。
- **稳定选择器**：用 `[data-slot=...]` / ARIA 而非 hash 类名，避免前端构建后失效。
- **注入页的单引号坑**：`lib/lan-gate-server.cjs` 里的注入脚本字符串，历史上有「双引号套双引号」bug，注意字面量转义。

---

## 🙏 致谢

- [`dsh-mobile-gate`](https://github.com/Bernardxu123/dsh-mobile-gate)（MIT）——安全网关基座。
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin) —— 社区插件精选列表。

---

## ⚠️ 安全须知

安装插件 = 在你的机器上运行第三方代码，权限与你本人相同。收录/发布不等于安全审查。请：**只在你自己的服务器上跑、别放密钥到不熟悉的环境、定期审计 `lib/lan-gate-server.cjs` 的变更**。远程访问务必走审批 + 令牌，别把网关端口裸奔到公网。

## License

MIT。网关 `lib/lan-gate-server.cjs` 基于 `dsh-mobile-gate` 扩展，保留原 MIT 版权与许可，详见 [LICENSE](LICENSE)。
