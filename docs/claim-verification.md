# 官方领取核验记录

核验日期：2026-11-13（Asia/Shanghai）。只根据当天打开的官方文档或官方页面记录。没有公开领取 API、也没有可核对的官网页按钮时，不接入自动领取，`checkinSupported` 与 `executable` 都是 false。

机器可读的同一份记录在 `adapters/claim-catalog.js`。扩展只把来源站放进 `scheduler/official-page.js` 的 `PAGE_ORIGIN_ALLOWLIST`，并同步写到 `extension/manifest.json` 的 `optional_host_permissions`。当前白名单是空的，所以不会申请任何官网页权限。

| 平台 | 结论 | claimPath（本仓库实际执行） | 官方来源 | 看到的动作 |
| --- | --- | --- | --- | --- |
| 魔搭社区 | 不进领取队列。定时只刷新余额 | official_api（仅余额） | https://modelscope.cn/.well-known/openapi.json ；说明帖 https://modelscope.cn/posts/435591 | 2026-11-13 拉取的 OpenAPI 1.1.0+master.20261103T083422Z 里，魔粒相关路径只有 `GET /magicubes/balance`。没有签到路径。说明帖当日返回 HTTP 500，登录后自动到账沿用该帖此前已核实的正文。 |
| Qoder | 拒绝接入 | official_only | https://docs.qoder.cn/events/100credits ；国际版 https://docs.qoder.com/zh/events/100credits | 每天 100 Credits 要主动领，渠道写明仅限桌面端：用量面板 → 礼物图标。官网只用来看 Usage。没有公开领取 API。领取窗口是当天 10:00 到次日 10:00，不是自然日 0 点。 |
| Trae | 拒绝接入 | official_only | https://docs.trae.cn/ide_plans-and-billing?lang=zh | 文档更新于 2026-10-26：免费用户每日签到 100 积分，会员 200 积分。操作是「在 TRAE，点击头像，再点菜单里的签到」。没有给出可点击的网页 URL。1024 活动签到在 IDE 内，且已于 2026-10-24 18:00 结束。 |
| 通义灵码 | 拒绝接入 | official_only | https://help.aliyun.com/zh/lingma/daily-check-in-100-credits-reward-program-terms | 页面标题为 7 月 30 日截止。入口是 QoderWork CN 桌面端右上角签到浮窗，点击「签到」。页内指向现在的 Qoder CN 文档，后者仍限定桌面端。 |
| 即梦 | 拒绝接入 | official_only | https://lf26-cdn-tos.draftstatic.com/obj/ies-hotsoon-draft/dreamina/bbb8a810-1fd5-4962-a24a-9b01acd3dec4.html | 积分规则写每日免费积分的获得方式是「登录即梦AI」。这和魔搭的登录到账同类，不能当成可代点的签到。官网首页本次没有核对到签到按钮。 |
| 豆包 | 拒绝接入 | official_only | https://www.doubao.com/pc/agent-explore | 该地址返回前端脚本壳，HTML 里没有签到或领取按钮。公开摘要写明免费领额度只在豆包电脑版。不猜按钮。 |
| 硅基流动 | 拒绝接入 | official_only | https://www.siliconflow.cn/developer-talk/od7wj9rr23p95uhihmhrombp | 推荐官计划写了一次性路径：活动中心 → 认证专享礼 → 点击领取代金券。不是每日签到，文内没有活动中心的稳定 URL，快速开始文档也没有领取 API。 |
| 智谱清言 | 拒绝接入 | official_only | https://docs.bigmodel.cn/cn/api/introduction | API 文档是对话和套餐，没有每日签到或领取接口。 |
| MiniMax | 拒绝接入 | official_only | https://platform.minimaxi.com/docs/api-reference/api-overview.md | 接口概览没有签到 API。海螺付费协议里的贝壳来自订阅，不是每日按钮。第三方博客不算官方依据。 |
| 讯飞星火 | 拒绝接入 | official_only | https://xinghuo.xfyun.cn/doc/ | 文档中心页面没有每日签到。讯飞文书的星火值签到是另一个产品，不挪到这张卡。 |
| Kimi | 拒绝接入 | official_only | https://www.kimi.com/help/kimi-api/api-free-trial | 国内手机号新用户注册即赠送 15 元代金券，完成实名后发放，有效期 3 个月。一次性发放，不是每日签到。 |
| Cloudflare Workers AI | 拒绝接入 | official_only | https://developers.cloudflare.com/workers-ai/platform/pricing/ | 定价按 Neurons，并有免费的每日额度。页面没有签到按钮或领取 API。 |

以上平台的看板入口仍只跳转仓库里已经核实过的官网地址。公开页和 Surge 测试站不能自动领取。
