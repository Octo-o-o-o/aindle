# 官网、品牌与 Cloudflare Pages

公开站是介绍 + 白名单 mock 示例，不是 Hub。源码在 [`site/`](../site/)，品牌原图在 [`assets/brand/`](../assets/brand/)。公开地址是 [https://aindle.octoooo.com](https://aindle.octoooo.com)，由 Cloudflare Pages 从本仓库 Git 构建。

## 品牌源文件

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `assets/brand/aindle-source.png` | 1254×1254，PNG alpha | 内置 imagegen 生成的唯一品牌原图，黑标 + 透明底 |
| `assets/brand/icon-32.png` | 32 | favicon / masthead |
| `assets/brand/icon-48.png` | 48 | README、页眉 |
| `assets/brand/icon-180.png` | 180 | Apple touch |
| `assets/brand/icon-192.png` | 192 | manifest |
| `assets/brand/icon-512.png` | 512 | manifest |
| `assets/brand/favicon.ico` | 16/32/48 | ICO 容器（内嵌 PNG，保留 alpha） |
| `assets/brand/og.png` | 1200×630 | Open Graph / Twitter 卡 |
| `assets/website/hero-desk.jpg` | 1024×576 | 官网 Hero 场景图：小屏与大屏同框，场景示意。构建拷到 `dist/site/images/hero-desk.jpg` |
| `assets/website/hero-oasis-source.png` | 1122×1402 | 内置 imagegen 的 Oasis 摄影原图，不进 dist |
| `assets/website/hero-scribe-source.png` | 1122×1402 | 内置 imagegen 的 Scribe 摄影原图，不进 dist |
| `assets/website/hero-oasis.jpg` | 1122×1402 | 早期 imagegen 设备摄影，不再用于 Hero |
| `assets/website/hero-scribe.jpg` | 1122×1402 | 早期 imagegen 设备摄影，不再用于 Hero |
| `docs/screenshots/eink-local.png` | 1072×1448 | 当前锁屏 mock（`demo/mock-view.json` → `renderEinkHtml`）。README 主图，官网「屏上长这样」。用 `node --import tsx scripts/capture-readme-screenshots.mjs` 重拍。 |
| `docs/screenshots/complex-scribe.png` | 1860×2480 | README：复杂 mock 的 Scribe 大屏账本 |
| `docs/screenshots/simple-oasis.png` | 1072×1448 | README：Hub 看板，Oasis 1 画布（`?device=oasis1&kindle=1`） |
| `docs/screenshots/simple-scribe.png` | 1860×2480 | README：Hub 看板，Scribe 画布（`?device=scribe`）大屏账本 |
| `docs/screenshots/website-eink-demo.png` | 1072×1448 | 早期 CSS 壳所用的 Hub `/dash.png` mock 记录，不再用于 Hero。不要覆盖 `eink-local.png` |

机械缩放由 [`scripts/export-brand-icons.mjs`](../scripts/export-brand-icons.mjs) 用 Node `sharp` 完成，不重绘 SVG、不用 Python。Cloudflare 构建**不要**跑它。运行时 Hub / Demo 只使用已经拷进 `packages/hub/public/` 与 `demo/` 的副本。eink PNG 用 `packages/hub/src/brand-mark.ts` 里的 data URI，不依赖相对路径。

各 AI 供应商标识仍走 `eink-icons.ts`，不要换成 Aindle 标。

### 生成 prompt（内置 imagegen）

> Use case: logo-brand. Asset type: production app icon for Aindle, an open source private AI work-status board for the desk and a Kindle e-ink lock screen. Create ONE exceptionally refined minimalist icon on a square canvas. Primary subject: one bold, beautifully balanced ink-black monogram that subtly combines a capital A with the folded leaves of an open book. Think quiet literary publishing imprint, beautiful book design, a modern reading companion. The silhouette must read immediately at 24 pixels: a strong simple arched A-like book form, a small deliberate white negative-space opening, gently rounded corners, harmonious optical weight. Flat vector-like geometry, solid black shapes on a uniform warm ivory background #F4F1E9. Mark centered, occupying about 66 percent of canvas width and 62 percent height, ample breathing room. Render very clean sharp edges suitable for deterministic icon size exports. No wordmark, no letters beyond the single abstract A, no captions, no mockup, no gradients, no shadow, no 3D, no texture, no decorative sparkle, no border, no watermark. Tasteful, confident, timeless and serene.

交付原图是透明底黑色标识，适合铺在浅暖纸色上。来源是本轮内置 imagegen，不是手绘第二份 SVG。

重新导出（开发机需要一次性 `sharp`，例如把含 sharp 的 `node_modules` 加进 `NODE_PATH`）：

```bash
node scripts/export-brand-icons.mjs
```

## 本地预览官网

```bash
npm run site:build
npm run site:check
python3 -m http.server 4173 --directory dist/site
# http://127.0.0.1:4173/
# 浏览器 QA（Playwright，需本机 Chrome；会按 Pages 规则套上 _headers）：
# NODE_PATH=<node_modules-with-playwright> node --import tsx scripts/qa-website.mjs
# 普通 QA 只写 .tmp/website-branding/。更新 docs/screenshots/site-desktop.png 时加 --update-screenshots。
# 也可用 wrangler pages dev dist/site 看真实 Pages headers。
```

`site:build` 只用 Node 标准库，输出 `dist/site`。不要把 `config/`、`.env`、Hub、真实 snapshot 或整个仓库拷进去。首页不再推广用短地址在设备浏览器里预览 Demo。`/oasis` 与 `/scribe` 仍会生成完整 HTML（设备档写进 `AINDLE_PRESET`，不经过 meta refresh、query string，也不引用 PNG/ICO），给旧链接用，不作为官网入口。公开站还带 `/llms.txt`（给编程 agent）、`/images/hero-desk.jpg`（Hero 场景图）和 `/images/eink-local.png`（锁屏 mock）。首页与 404 用同一套 `site.js` 做中/英与浅色/深色切换，偏好存在 `localStorage`，英文可用 `?lang=en`。默认中文；中文页不再夹一句英文摘要。

## Cloudflare Pages（Git integration）

Direct Upload 项目日后不能改成 Git。优先新建 **Git 连接** 的 Pages 项目。有权限的人可以用 Pages API 建好 Git 项目，再把已经本地校验过的 `dist/site` 直接上传作首次发布。实施者不 commit / push。

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git。
2. 选 `Octo-o-o-o/aindle`，不要用 Direct Upload 当长期方案。
3. 构建设置：
   - Root directory：仓库根（留空）
   - Build command：`npm run site:build`
   - Build output directory：`dist/site`
   - Node.js：`20`（可设环境变量 `NODE_VERSION=20`，仓库有 `.nvmrc`）
4. 框架预设：None。不要部署 Hub、不要装 Chrome、不要在构建里跑 `export-brand-icons`。
5. 仓库里的 [`wrangler.jsonc`](../wrangler.jsonc) 声明 `pages_build_output_dir = dist/site`，给本地 `wrangler pages dev dist/site` 用。远端创建与绑定域名由有权限的人做。

`_headers` 会随输出发布。通用安全头挂在 `/*`。CSP **不要**写在 `/*` 上：Cloudflare Pages 会让所有匹配规则同时生效，两份 `Content-Security-Policy` 会叠加收紧（后面的不会覆盖前面的）。首页 `/`、`/index.html` 与 `/404.html` 各自一条严格 CSP；`/demo/*` 单独一条允许 inline 的 CSP（monitor 是 ES5 内联页）。404 用外部 `/styles.css`，没有内联样式或脚本。

## 自定义域名顺序

域名是 `aindle.octoooo.com`。

1. `octoooo.com` 已在 Cloudflare 托管的前提下，先在该 zone 准备好 DNS（不要先到别的 DNS 商加乱记录）。
2. Pages 项目 → Custom domains → 添加 `aindle.octoooo.com`。
3. 让 Cloudflare 写入 CNAME（通常是指向 `aindle.pages.dev` 的 CNAME，proxied）。
4. 等 TLS 就绪后再改 canonical。源码里的 canonical / OG / sitemap 已经写成 `https://aindle.octoooo.com`。
5. 若 Pages 项目当初是 Direct Upload，不要指望能改成 Git；应新建 Git 项目再绑同一域名。

## Kindle / KUAL

`kindle/oasis1/operate.html` 与 `operate.sh` 把 32px 品牌图做成 data URI，因此 `/mnt/us/aindle/operate.html` 与 `/mnt/us/documents/Aindle操作.html` 都能显示图标。`host-push.sh` 仍把 `brand-icon.png` 放进 `/aindle/`，但 documents 入口不依赖旁边那张 PNG。KUAL `config.xml` 没有官方 logo 字段，不要编造。
