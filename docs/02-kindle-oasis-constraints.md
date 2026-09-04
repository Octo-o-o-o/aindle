# Kindle Oasis 与电子墨水约束

本文件区分三类说法：**硬件规格（公开资料）**、**越狱后社区实践（他人仓库/文章）**、**本会话未验证**。

## 1. 面板与分辨率

| 型号 | 尺寸 | 常见 framebuffer | 备注 |
|---|---|---|---|
| Oasis 1（2016, 8th） | 6" | 1072×1448 | 与当时 Paperwhite 同级 |
| Oasis 2（2017, 9th） | 7" | 1264×1680 | 物理翻页键 |
| Oasis 3（2019, 10th） | 7" | 1264×1680 | 与 Oasis 2 同分辨率 |

[jefftko/kindle-dashboard](https://github.com/jefftko/kindle-dashboard) 写明：布局在 **Kindle Oasis 3，1264×1680，固件 5.18.2** 上实物测过。这是目前最接近「Oasis 专用看板」的公开证据。

alexishida/kindle-dashboard **写死 Paperwhite 1072×1448**，仓库内零命中 Oasis / 1264 / 1680。直接拿它的 PNG 往 Oasis 3 上 `fbink -g`，大概率顶左对齐或居中留白，不会自动铺满。

**Owner 已确认设备是 Oasis 1。** Demo 默认设备档为 **1072×1448**（横屏 1448×1072）。Oasis 3 的 1264×1680 仍可作为对照档，不能当这台机器的默认画板。

## 2. 为什么不要用 Kindle 浏览器当主界面

越狱后 Kindle 仍有实验浏览器，但作监控墙有这些硬伤：

- 引擎旧，CSS/字体/字重表现和桌面 Chrome 差很远。
- 没有可靠的 kiosk；休眠、屏保、Home 会把网页盖掉。
- 滚动、半透明、阴影、动画在 e-ink 上既慢又残影。
- WebSocket / 复杂 React（OctoMonitor remote viewer 就是这种）不适合低刷新。
- 浏览器自己耗电，且断线时容易白屏。

社区能长期当 dashboard 用的做法几乎都是：

**主机算好一帧图（或 Kindle 本地用 FBInk 画字）→ 写 framebuffer。**

Max Dietrich 的 homelab 文也明确：他选择服务端出 PNG + `eips`/`fbink`，而不是浏览器 kiosk。

## 3. 刷新、残影、电池

E-ink 不是 HDMI：

| 策略 | 观感 | 代价 |
|---|---|---|
| 局部 / 非闪刷新（GC16 / GL16） | 快，不闪 | 3–4 次后残影 |
| 全屏闪刷新（`fbink -f`） | 干净 | 黑白闪一下，更耗电 |
| 高频（15–45s） | 像监控 | 电池按「周」而不是「月」掉；Wi-Fi 常开 |
| 低频（5–15min） | 像台历 | 任务「正在跑」会滞后 |

经验区间（来自 TerminalBytes / 社区 Kindle dashboard 文，**不是本机实测**）：

- 30 分钟一刷，电池大约 2–4 周。
- 一直 `preventScreenSaver=1` + 45 秒拉 PNG，更像「插着电的副屏」。

alexishida 的循环默认 45 秒拉图、每 20 次全刷，并每圈设置 `preventScreenSaver 1`。这适合插电或接受几天一充。

jefftko 相反：故意 **不** 禁用 screensaver，合盖仍可睡；只拉长 idle timeout；醒来后等 8 秒再整板重绘，避免把钟画在屏保上。更省电，但「正在跑的任务」延迟更大。

Aindle 建议默认采用 **双速**：

- 有 `active` / `waitingApproval` 任务：60–90 秒一帧，每 8–12 帧全刷一次。
- 全闲：5 分钟一帧，每 3 帧全刷一次。
- 合盖睡觉，醒来整板恢复。不要学 alexishida 把屏保彻底按死，除非你明确要「永远亮着」。

## 4. 设备侧软件栈（越狱后）

典型可用件（社区，不是本项目安装清单）：

- **KUAL + MRPI**：菜单里启动/停止看板
- **USBNetwork**：SSH
- **FBInk**（NiLuJe）：画图/画字。Oasis 2/3 在 FBInk 文档里被提到与硬件 dither 相关；alexishida 用 `/usr/bin/fbink`，jefftko 用 `/mnt/us/libkh/bin/fbink`（带 OpenType）
- **Upstart**：`framework_ready` 后拉起 daemon
- **lipc / powerd**：Wi-Fi 状态、屏保、唤醒事件 `outOfScreenSaver`

WinterBreak 文档写：Mesquito **不支持固件 5.18.1+**。但 jefftko 的 Oasis 3 跑在 **5.18.2** 且已越狱——说明「先越狱再升级 + hotfix」是可能的。你说已经越狱，Aindle 只假设 SSH + FBInk 可用，不处理越狱本身。

## 5. 两种 Kindle 渲染哲学

### A. 主机出 PNG（alexishida）

```
PC 采集 + Chrome/Electron 截图 → HTTP /dash.png → Kindle curl → fbink -g
```

优点：排版在主机用现代 HTML，中文、表格、多栏都简单；Kindle 脚本极瘦。
缺点：PNG 分辨率必须匹配 framebuffer；截图质量受主机显示器缩放影响；45 秒一次的隐藏 BrowserWindow 在 Windows 上能跑，在 Mac 上要自己做截图管线。

### B. Kindle 本地排版（jefftko）

```
主机只给很小的只读文本协议（≤2 KiB）→ Kindle 用 FBInk + OpenType 自己画
```

优点：省流量、省主机截图；唤醒/USB 模式恢复更仔细；CJK 字体在设备上。
缺点：2 KiB 装不下「三机 × 多订阅 × 任务列表」。他们的协议是天气/营收/3 条任务，不是 AI monitor。

### Aindle 建议

**第一版用 A（主机出 PNG）**，协议用比 jefftko 更大的 JSON/HTML，但 Kindle 仍然只下载图片。
设备生命周期（唤醒、屏保、USB、残影）**抄 jefftko 的谨慎，不抄 alexishida 的 preventScreenSaver 死撑。**

若 PNG 管线在 Mac 上别扭，再考虑「主机出 SVG/中间帧，Kindle 用 FBInk 画」的混合方案。不要一上来就在 Kindle 上解析完整 JSON 任务流。

## 6. 版式约束（直接约束 Demo）

来自 OctoMonitor 历史稿 `docs/history/kindle-eink-design-system-guidelines.md`（该文件自称不是现行 UI SoT，但作为墨水原则可用）以及 alexishida 的实装：

- 只用黑 / 白 / 有限灰。不要红绿表示健康。
- 不要阴影、渐变、动画。用粗边框和实心条。
- 字重尽量 ≤ 500；数字用 `tabular-nums`。
- 字号按「一臂距离」来，不要用 12px 网页字。alexishida 标题 52px、条高 40px，是 Paperwhite 上能读的量级。
- 一屏只放「现在最该看的」：过热的限额 + 进行中任务 + 少量刚完成。完整订阅表可以第二页（Oasis 物理键很适合翻页）。
- 必须有「数据新鲜度」时间戳。拉取失败时保留上一帧，不要画空白错误页把信息冲掉。

## 7. 网络与安全

- Kindle 和 hub 必须在可路由的私网。`127.0.0.1` 对 Kindle 是它自己。
- HTTP 即可；不要在 Kindle 上存 Anthropic / Cursor cookie。
- alexishida 把后端绑在 `0.0.0.0:8787` 且无鉴权——LAN 里谁都能读 `/api/usage`。Aindle 至少要共享口令或配对码。
- 防火墙：macOS / Windows 都要放行 Kindle → hub 的端口。

## 8. 本会话未验证

- 你的 Oasis 代数、固件、是否已装 FBInk / KUAL / USBNetwork
- 竖屏还是横屏当书桌副屏更舒服（Oasis 有实体键，横屏 1680×1264 也很合理）
- 实际残影和电池
- Kindle 实验浏览器打开 OctoMonitor `:46322` 会不会卡死（强烈不建议当主方案）
