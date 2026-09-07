# 官网 Hero 设备摄影

首页右侧设备图来自 Codex 内置 imagegen，不是 CSS 壳、也不是用户随拍。屏内是通用 Mock 数据。

## 文件

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `hero-oasis-source.png` | 1122×1402 | Oasis 原图，保留在仓库，不发布到 `dist/site` |
| `hero-scribe-source.png` | 1122×1402 | Scribe 原图，保留在仓库，不发布到 `dist/site` |
| `hero-oasis.jpg` | 1122×1402 | 官网默认 Hero 图 |
| `hero-scribe.jpg` | 1122×1402 | 官网手动切换图 |

## 当前版本（v2，2026-09-05）

v1 的暖墙 + 木桌实景与页面的平面纸张质感割裂。v2 改为**无缝暖纸摄影棚背景**（纯色 #f1ecdf、无墙脚线、无木纹、无道具），两张图共用同一布光与色调，切换时不跳色；设备像印在纸面上的图版，与官网的纸墨编辑风格一体。

生成：Codex CLI `codex exec` 调用内置 imagegen，输出 1024×1536 PNG，居中裁为 4:5 后用 `sips` 重采样到 1122×1402，再转 JPEG（quality 89）。不叠加 UI、不裁设备、不重绘。构建把两张 JPEG 拷到 `dist/site/images/`。

最终 prompt 见 [`docs/plan/hero-device-photography/oasis-prompt-v2.txt`](../../docs/plan/hero-device-photography/oasis-prompt-v2.txt) 与 [`scribe-prompt-v2.txt`](../../docs/plan/hero-device-photography/scribe-prompt-v2.txt)。v1 的实景 prompt 保留在同目录 `oasis-prompt.txt` / `scribe-prompt.txt`。

Scribe 图只是场景示意，不表示已验证 Scribe 锁屏安装。
