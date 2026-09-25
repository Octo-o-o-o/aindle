# r6 只读输出与恢复

本候选新增入口为 `packages/hub/src/octoooo-cli.ts`。它只读取 Octoooo Core 已授权的设备快照，不调用 Aindle collector，不启动真实账号采样，不公开旧 8787。

构建：`npm run check`；启动制品：`node --import tsx packages/hub/src/octoooo-cli.ts`。必须显式设置 `AINDLE_OCTOOOO_CORE` 为当前受控 HTTPS Core 设备入口；端口 `AINDLE_OCTOOOO_PORT` 默认 8792。默认仅绑定 127.0.0.1。软件验证时使用注入的临时 Core fixture；不能把测试 loopback 选项带到实际远程配置。

需要远程输出时，C2 确认准确监听地址、域名和证书后，设置 `AINDLE_OCTOOOO_TLS_ENABLED=true`、`AINDLE_OCTOOOO_TLS_HOST`、`AINDLE_OCTOOOO_TLS_KEY_FILE` 和 `AINDLE_OCTOOOO_TLS_CERT_FILE`；证书和私钥均须为当前用户所有的 0600 常规文件，symlink 拒绝。原生 Node TLS 最低 TLS1.2；没有 TLS 自动降级。系统服务安装与证书申请尚未授权，未执行。

`/` 是弱屏凭据登录页；`POST /session` 使用独立 weak deviceId/token，返回 HttpOnly/Secure/SameSite cookie，有效 15 分钟。只读输出为 `/eink.html`、`/dash.png?page=N` 和 `/projection.json`。每次输出前重新核验当前授权；PNG 渲染结束再核验。第二页以上必须复用 60 秒内的同一快照，授权/快照失效时从第一页重建。设备 token 不进入 URL、日志或命令行。

PNG 设置 `AINDLE_CHROME` 指向已验证的 Chromium headless shell。本机软件证据用 `/Users/wangyixiao/WorkSpace/Octoooo/.playwright-browsers/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell`。系统 Google Chrome 首次渲染超时；不能据此声称所有浏览器可用。

Q10 与微雪 bridge 消费相同受限 `octoooo.weak.v1` 投影，每台使用独立 token；不把 owner/source token、原始 Aindle 账号字段、私有任务正文或动作参数下发。静态 E-Ink 断网后不能远程物理擦屏，因此页面明确 generated_at/valid_until，旧图不代表当前授权。

恢复：停本次新输出进程/服务，撤销本次弱设备 grant 和 token，恢复旧设备书签/固件；保留原 8787、Aindle 数据和来源配置。实际 Kindle、Q10、圆屏安装与 CA 兼容性、断网物理残影仍待 C2 实机验收。

## Oasis shell adapter（重复实施整合）

迁入另一 r6 候选的分页、失效缓存清理与30秒PNG租约检查，改用本候选 `/dash.png`、`/eink-meta.json` 以及 Bearer + `x-octo-device-id` 认证。`OCTOOOO_MODE=1` 才启用；HUB必须为独立输出HTTPS入口，OCTOOOO_DEVICE_ID/TOKEN必须是独立弱身份，不能使用旧8787或owner凭据。metadata复用已经取得的PNG快照，不重新生成或续租；PNG渲染后授权变化或租约到期不返回旧图。翻页复用同一快照，过期需第一页重新获取。原模式不变；实际深睡像素清除、阅读恢复和Kindle CA兼容性仍待实体验收。
