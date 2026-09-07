# Aindle 官网与品牌图标验收合同

用户目标：先用生图工具生成应用 icon，制作简单、高级、优雅、符合 Kindle 用户品味的官网，部署 Cloudflare Pages，并尽力绑定 aindle.octoooo.com；统一应用内品牌图标入口。部署若受外部权限阻碍，交付可直接连接 GitHub 仓库的配置与操作说明。

## 验收范围

- A1（P1）：使用本轮内置 imagegen 生成的 A / 书页图标作为唯一品牌来源，原图保存到仓库；导出清晰的 32/48/180/192/512 PNG 与 favicon.ico。保留原图 alpha，机械缩放/格式转换使用 Node 工具，不用 Python 重绘。应用标识不替换各 AI 供应商标识。
- A2（P1）：响应式静态官网，暖纸色、墨黑、书籍感衬线字体、宽松留白和细分隔线；桌面 1440px 与手机 390px 完整可用，无横向溢出。默认中文，简洁的英文副标题可用。导航、开始使用、GitHub、在线示例与复制命令等实际可操作；含产品介绍、Kindle 场景、核心能力和最小安装说明。明确示例数据、私网部署、Kindle Oasis 1 越狱前提以及解锁恢复读书；不夸大设备/额度/审批支持。
- A3（P1）：品牌标识覆盖官网页眉页脚、网站 favicon/Apple touch/manifest、monitor 页眉与 favicon、eink HTML/PNG 品牌位置、生成的静态 Demo、README 中英顶部、Kindle 本地操作入口。无网络字体或 CDN 依赖引入旧 Kindle 页面；monitor 保持 ES5。独立 PNG 渲染不依赖相对资源 URL；现有交互、鉴权语义和数据不变。
- A4（P1）：Cloudflare Pages 仅发布官网、品牌资源、白名单 mock 示例，不暴露私网 Hub、config、真实 snapshot、环境文件、整个仓库或 .git。提供 npm run site:build 输出 dist/site、npm run site:check 与 Cloudflare 配置/文档。保留 Git integration 路线；用户未明确授权 commit/push，因此实施者不 commit/push。
- A5（P1）：官网具备真实标题/description、canonical（aindle.octoooo.com）、OG/Twitter 分享卡、robots、sitemap、404、基础安全 headers、语义 HTML、可见焦点、图片 alt、减少动画支持。README 和 docs 索引最小更新，补充品牌源文件/尺寸清单/内置工具最终 prompt 与 Pages Git 配置、域名添加顺序和本地预览步骤。
- A6（P1）：执行受影响编译和 Hub 测试、Demo freshness、官网构建/验证；保存桌面和手机截图以及实际 DOM/链接/console/本地 Hub logo 和 eink PNG 验证证据。独立只读 review 完成后再跑全仓门禁。只审此有限范围，不开放式 fuzz，不自动扩展产品功能。

## 实施与验证

实现目录建议 site/（静态 HTML/CSS/少量 JS），scripts/build-site.mjs、scripts/check-site.mjs。输出 dist/site；可复用现有 mock 和截图。网站不需要 React、后端或复杂动画。独立实施者只完成候选并停止；语义 review 由全新零上下文 reviewer 承担。

Focused：npm run build -w @aindle/core；npm run build -w @aindle/hub；node --import tsx --test packages/hub/test/*.test.ts；node scripts/build-demo.mjs --check；npm run site:build；npm run site:check；git diff --check。

Full（review GREEN 后，由 supervisor）：bash scripts/check.sh；bash scripts/check-release.sh；bash docs/plan/website-branding/full-website-check.sh（仅运行 site:build 与 site:check）。本地门禁模式 local_first。部署与域名验证由 supervisor 使用现有 Cloudflare 登录完成，外部权限缺口须如实说明，不算代码验收失败。

唯一 Deferred P2 ledger：docs/plan/website-branding/deferred-p2.md（私有控制面）。最终交付仅一次 sweep。控制面与 cycle-state 保持 gitignored。

## 2026-09-05 补充：Hero 设备摄影

用户认可官网其余部分，要求将 Hero 的拼接示意改为两张内置生图：小屏 Kindle Oasis 与大屏 Kindle Scribe，屏内均为 Mock 数据，真实设备摄影质感。沿用已授权上线与自定义域名，不 commit/push。

本阶段 `task=website-branding / stage=hero-devices / cycle=refinement-1`。上一阶段已验收交付，其记录保留；本阶段只修改 Hero、所需图片、静态构建/检查、现有浏览器 QA 和品牌文档的相关段落。

- H1（P1）：两张独立内置 imagegen 图片，Oasis 黑色不对称握柄和两枚按键、Scribe 白色边框与深绿握柄和细笔；统一自然光、纸白墙与浅木桌。屏内是通用虚构任务和 Mock 用量，不能复用用户照片中的私人任务。源 PNG 与压缩网站图保存到仓库；不得以 CSS 壳、SVG 或截图叠层代替生图。
- H2（P1）：保留 Hero 原有文案/CTA、官网其余版式，移除旧设备壳与漂浮动画，以完整摄影图展示。提供 Oasis / Scribe 轻量手动切换；无自动轮播。切换图、设备名、状态一致且高度稳定；按钮有明确可访问名称和选中状态，可用键盘操作。
- H3（P1）：1440、390、320 宽度下照片完整、不拉伸、无横向溢出，两种设备均可切换；图片自然尺寸不为 0，无新增 console/CSP/资源错误。保留复制、导航、Demo 行为。场景和 Mock 标记明确，不因 Scribe 图宣称新增已验证硬件支持。
- H4（P1）：构建继续只用 Node 标准库、精确公开静态白名单，仅发布已压缩图片，保留原始 PNG 在仓库；不发布用户随拍、真实屏幕数据或控制面。更新对应资源与 Hero QA，不扩展 Hub/Kindle 功能。
- H5（P1）：补充两张图的来源、最终 prompt 与路径，运行本阶段 focused、独立只读 review 后的完整门禁，再更新现有 Pages 项目和域名。线上首页和两张图返回 200、图片内容与已验收构建一致。

Focused：`npm run site:build`、`npm run site:check`、`node --check site/site.js`、`git diff --check`、`node --import tsx scripts/qa-website.mjs --update-screenshots`（宿主 Chrome 执行；只更新本阶段截图证据）。这次不改 Hub/agent，所以不重跑无关全仓产品测试。

Full（review GREEN 后 supervisor）：`bash docs/plan/hero-device-photography/full-website-check.sh`（site build/check、JS 语法与现有浏览器 QA），`bash scripts/check-release.sh`。模式 local_first。首次 RED 和后续返工按冻结 V2 3/3 预算。唯一 P2 ledger 沿用 `docs/plan/website-branding/deferred-p2.md`，本次新增 scope 的最终 sweep 记录放新控制目录，旧 sweep 不改写。
