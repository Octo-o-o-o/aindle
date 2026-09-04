# 参考：alexishida/kindle-dashboard

本地参考路径：`~/WorkSpace/Reference/kindle-dashboard`
上游：<https://github.com/alexishida/kindle-dashboard>
本会话读到的版本：`package.json` 为 **1.0.7**。

这是三份参考里 **唯一已经把「AI 用量 → 越狱 Kindle 屏」串起来的产品**。它证明设备契约可行，但产品范围比 Aindle 窄一个数量级。

## 它实际做什么

Windows 上的 Electron 应用：

1. 采集本机 Claude Code 与 Codex 的限额。
2. 打开隐藏窗口加载 `/render`，截一张图，旋转成竖屏 PNG。
3. 在 `0.0.0.0:8787` 提供 `/dash.png`。
4. 通过 SSH（密码）把脚本装到 Kindle，Upstart 开机后循环 `curl` + `fbink`。

README 原话：PC 负责采集和渲染；Kindle 只下载并绘制。项目不负责越狱。

## 架构要点

```
Electron main
  ├─ backend HTTP :8787
  ├─ 按 Kindle 下载间隔渲染（默认 45s，两边同一间隔）
  ├─ collectors → GET /api/usage
  ├─ hidden BrowserWindow → /render
  ├─ capturePage（横屏 1448×1072）→ 顺时针旋转 → 原子写 dash.png
  └─ GET /dash.png

Kindle
  ├─ /etc/upstart/kindle-dashboard.conf
  ├─ /mnt/us/dash-autostart.sh   等 Wi-Fi
  └─ /mnt/us/dash-loop.sh
        curl PNG → /mnt/us/dash.png
        周期性 fbink -f -c
        fbink -g file=... -W GC16
```

证据：`README.md` 工作原理；`src/main/render.ts`；`kindle/dash-loop.sh`；`src/main/constants.ts` 的 `1072×1448`。

## Kindle 脚本（可复用的部分）

| 路径 | 作用 |
|---|---|
| `/mnt/us/dash-loop.sh` | 拉图、画屏、失败计数、Wi-Fi 重连 |
| `/mnt/us/dash-autostart.sh` | 等 `cmState=CONNECTED`（最多 90s）再启动 loop |
| `/mnt/us/dash-autostart.env` | `PC` / `INTERVAL` / `FULL_EVERY` / `WIFI_RETRY_EVERY` |
| `/etc/upstart/kindle-dashboard.conf` | `framework_ready` 拉起 |

循环里每圈 `lipc-set-prop com.lab126.powerd preventScreenSaver 1`。`FBINK=/usr/bin/fbink`，**没有 `eips` 回落**。Wi-Fi 恢复写死 `wlan0`。连续失败默认 6 次后 **退出 loop**（约 4–5 分钟），直到下次开机或手动 Start——这是 1.0.4 为了避免 PC 关机后死循环加上的，但对「常亮副屏」是个坑。

## 屏上到底有什么

`render/dashboard.html`：白底黑字、两张等宽卡片。

- Claude：`5h` / `7d` 条、重置时间、可选 extra usage
- Codex：`5h` / `7d` 条、可选 lifetime tokens

**没有** 当前会话、任务队列、模型名、仓库、机器名、Cursor、Grok。标题就叫 Token Dashboard。

OpenCode 采集器文件还在，但 `backend/collectors/index.js` 注释写明已关掉，live `/api/usage` 不会带它。

## 数据采集

### Claude（`backend/collectors/claude.js`）

- 读 `~/.claude/.credentials.json` → `claudeAiOauth.accessToken`
- `GET https://api.anthropic.com/api/oauth/usage`
- Header：`anthropic-beta: oauth-2025-04-20`
- 最少间隔 180 秒，避免 429
- **单账号。** 不扫 `CLAUDE_CONFIG_DIR`，也不读 Keychain

### Codex（`backend/collectors/codex.js`）

- 默认：拉起 `codex app-server`，JSON-RPC `account/rateLimits/read` + `account/usage/read`
- 失败则扫 `~/.codex/sessions` 与 `archived_sessions` 的 `rollout-*.jsonl` 里 `token_count` / `rate_limits`
- Windows 额外扫 WSL UNC 家目录；macOS 没有对等扫描，除非 `CODEX_EXTRA_HOMES`
- 多个 home **合并成一张 Codex 卡**，不是多订阅

### 多机

不存在。一台 PC 喂一台 Kindle。

## 网络与安全

- Bind `0.0.0.0`，CORS `*`
- `/api/usage`、`/dash.png`、`/kindle/*` **无鉴权**
- SSH 仅密码；Electron `safeStorage` 存 Kindle 密码
- 默认 PC IP = 第一块非 internal IPv4，VPN/utun 可能抢到错误地址

## Windows vs Mac

文档和 `electron-builder.yml` 只谈 Windows 安装包。采集器用 `os.homedir()`，Node 后端在 Mac 上理论上能跑 Claude/Codex，但：

- 没有 macOS 打包 / 登录项
- 旧版 supervisor 用 Windows Chrome 路径
- WSL 扫描在非 win32 直接返回空

**不能把这个仓库当 Mac + 三机方案来装。**

## 对 Aindle 的借用裁决

| 借 | 不借 / 改造 |
|---|---|
| 「主机渲染、Kindle 只拉 PNG」的职责切分 | 1072×1448 写死。Oasis 要设备档 |
| `dash-loop.sh` 的 pidfile、原子替换、失败保留旧图 | `preventScreenSaver=1` 作为默认；改学 jefftko 的唤醒恢复 |
| 采集失败与渲染失败隔离（`Promise.allSettled`） | 无鉴权的 `0.0.0.0` |
| 180s Claude 限额缓存，避免打爆官方接口 | 单账号、单机、只有两条限额 |
| FBInk GC16 + 周期性全刷 | 把 OpenCode 死代码和 Electron 重 UI 整仓搬来 |
| | 任务监控、Cursor、Grok、多机 |

## 另：jefftko/kindle-dashboard（Oasis 实物参考）

不是用户点名的仓库，但和 Oasis 更贴：

- 实物：Oasis 3，1264×1680，固件 5.18.2
- Kindle 本地 FBInk + OpenType CJK 画板
- 合盖可睡，唤醒后整板恢复
- 可选 LAN 文本协议，**正文上限 2 KiB**，字段是营收/天气/3 条任务

Aindle 借它的 **设备生命周期和分辨率**，不借 2 KiB 文本协议当 AI monitor 的数据面。
