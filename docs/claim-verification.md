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
| WorkBuddy 国内站 | 拒绝接入。可打开官网登录 | official_only | https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting | 登录后从头像菜单进「成长计划」，完成成长任务获取能量。积分文档没有签到 API。关注公众号的二维码是一次性任务，不是登录扫码。登录页用 https://www.workbuddy.cn/ 上官网自己的登录。 |
| WorkBuddy 国际站 | 拒绝接入。可打开官网登录 | official_only | https://www.workbuddy.ai/docs/workbuddy/Subscription | 每日奖励要在客户端发起对话后由系统自动发放，网页对话不算，no manual claim。登录用 https://www.workbuddy.ai/ 官网自己的登录框。 |
| OfficeAce | 拒绝接入。可打开官网登录 | official_only | https://www.huaweicloud.com/product/officeace.html | 页面写首次注册登录赠送 4000 积分，每日登录赠送 100 积分且当日有效。没有单独签到按钮。 |
| ima | 拒绝接入。可打开官网登录 | official_only | https://ima.qq.com/ | 页面有登录和打开电脑版，没有签到或领取按钮。 |
| AStudio | 拒绝接入。可打开官网登录 | official_only | https://agent.xfyun.cn/overview/ | 页面有登录 / 注册、新用户赠送 1,000 积分和训练营说明。没有每日签到按钮或公开领取 API。 |
| Cline | 拒绝接入。可打开官网登录 | official_only | https://cline.bot/ | 官网有 Sign In。本次没有看到每日领取按钮。 |
| fal | 拒绝接入 | official_only | https://fal.ai/pricing | 定价按计算量。没有每日签到。 |
| Meeo | 拒绝接入 | official_only | https://meoo.com/ | 官网是 AI 建站介绍，没有签到或领取说明。 |
| 华为云 CodeArts | 拒绝接入 | official_only | https://codearts.huaweicloud.com/portal/ | 门户正文几乎为空，没有可核对的领取按钮。 |
| EdgeOne | 拒绝接入 | official_only | https://pages.edgeone.ai/ | 官网没有签到或领取积分按钮。 |
| ElevenLabs | 拒绝接入 | official_only | https://elevenlabs.io/pricing | 定价页没有出现签到或领取按钮文案。 |
| 火山方舟 | 拒绝接入 | official_only | https://docs.volcengine.com/docs/ark/free-inference-quota?lang=zh | 文档页没有签到按钮。已核实的新用户额度仍是自动发放。 |

授权只打开上表里写明的官网，让用户自己登录。扩展不读取 Cookie，不代填密码，也不制作统一扫码页。确认「我已在官网完成登录」之后，看板显示已授权；没有可点击的官方按钮时，一键执行仍是「暂不支持」。点「重新登录」会清掉该平台的已授权状态，并再次打开官网。

公开页和 Surge 测试站不能自动领取。
