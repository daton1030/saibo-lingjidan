/**
 * 2026-11-13（Asia/Shanghai）核验的领取动作。
 * 接入条件：官方文档或官方页面写明领取/签到动作，并且扩展能在该官网页面上点击，
 * 或官方公开了可由用户自备令牌调用的领取 API。
 * 核不到的平台 checkinSupported 与 executable 都保持 false，不得假装领取成功。
 */

export const VERIFICATION_DATE = "2026-11-13";
export const VERIFICATION_TIMEZONE = "Asia/Shanghai";

export const CLAIM_REVIEWS = Object.freeze([
  {
    id: "modelscope",
    name: "魔搭社区",
    inCatalog: true,
    connected: false,
    balanceOnly: true,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_api",
    observedSurface: "login_auto",
    sourceUrl: "https://modelscope.cn/.well-known/openapi.json",
    extraSources: ["https://modelscope.cn/posts/435591"],
    verifiedAt: VERIFICATION_DATE,
    what: "2026-11-13 拉取的 OpenAPI 1.1.0+master.20261103T083422Z 与魔粒相关的路径只有 GET /magicubes/balance，规范正文没有签到或领取路径。说明帖 https://modelscope.cn/posts/435591 当日返回 HTTP 500，登录后自动到账的结论沿用该帖此前已核实的正文。",
    rejectReason: "没有官方领取接口。只定时刷新余额，不进入领取队列。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "qoder",
    name: "Qoder",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "desktop_client",
    sourceUrl: "https://docs.qoder.cn/events/100credits",
    extraSources: ["https://docs.qoder.com/zh/events/100credits"],
    verifiedAt: VERIFICATION_DATE,
    what: "Qoder CN 与国际版文档都写明：每日 100 Credits 需主动领取，领取渠道仅限桌面端。操作是客户端左下角用量面板的礼物图标，不是官网页按钮。网页只用于查看 Usage。",
    rejectReason: "官方领取在桌面客户端。没有公开的官方领取 API，扩展不能代点桌面端，也不猜测接口。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "trae",
    name: "Trae",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "desktop_client",
    sourceUrl: "https://docs.trae.cn/ide_plans-and-billing?lang=zh",
    extraSources: ["https://docs.trae.cn/ide_million-credits-giveaway-on-oct-24?lang=zh"],
    verifiedAt: VERIFICATION_DATE,
    what: "计费文档（更新时间 2026-10-26）写明免费用户每日签到 100 积分、会员 200 积分，操作是「在 TRAE，点击你的头像，然后点击菜单中的签到按钮」。1024 活动签到入口在 IDE 客户端，且已于 2026-10-24 18:00 结束。文档没有给出可点击的官网 URL 或公开领取 API。",
    rejectReason: "签到按钮在 TRAE 客户端菜单，未核实到官网页上的同一按钮，不能猜选择器。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "tongyi",
    name: "通义灵码",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "desktop_client",
    sourceUrl: "https://help.aliyun.com/zh/lingma/daily-check-in-100-credits-reward-program-terms",
    extraSources: ["https://docs.qoder.cn/events/100credits"],
    verifiedAt: VERIFICATION_DATE,
    what: "阿里云帮助中心该页标题为「7月30日截止」，入口是 QoderWork CN 桌面端右上角签到浮窗，主操作是点击「签到」。页内说明文档可能过期，并指向 docs.qoder.cn。当前 Qoder CN 文档仍限定桌面端领取。",
    rejectReason: "已结束或仍限定在桌面端的签到，不在 lingma.aliyun.com 上提供可核验的网页按钮。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "jimeng",
    name: "即梦",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "login_auto",
    sourceUrl: "https://lf26-cdn-tos.draftstatic.com/obj/ies-hotsoon-draft/dreamina/bbb8a810-1fd5-4962-a24a-9b01acd3dec4.html",
    extraSources: ["https://jimeng.jianying.com/"],
    verifiedAt: VERIFICATION_DATE,
    what: "即梦 AI 积分规则写明每日免费积分的获得方式是「登录即梦AI」，不是单独的公开 API。本次打开的官网首页没有可核对的签到按钮文案。",
    rejectReason: "官方动作是登录后获得额度，和魔搭一样不能当成签到接口去代领。未看到可核验的网页按钮，不猜测。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "doubao",
    name: "豆包",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "desktop_client",
    sourceUrl: "https://www.doubao.com/pc/agent-explore",
    extraSources: [],
    verifiedAt: VERIFICATION_DATE,
    what: "官方「免费领额度」地址返回的是前端脚本壳，HTML 中没有签到或领取按钮。检索到的官方页摘要写明该活动仅支持在豆包电脑版参与。没有公开领取 API。",
    rejectReason: "不能从空页面猜按钮。电脑版活动不接入浏览器扩展。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "siliconflow",
    name: "硅基流动",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "official_page_unlocated",
    sourceUrl: "https://www.siliconflow.cn/developer-talk/od7wj9rr23p95uhihmhrombp",
    extraSources: ["https://docs.siliconflow.cn/docs/userguide/quickstart"],
    verifiedAt: VERIFICATION_DATE,
    what: "推荐官计划写了一次性路径：活动中心 → 认证专享礼 → 点击领取代金券。这不是每日签到。官方文没有给出活动中心的稳定 URL，快速开始文档也没有每日领取 API。",
    rejectReason: "只有散文路径，没有核实到的页面 URL 和按钮，不能猜地址。一次性领券也不进入每日队列。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "zhipu",
    name: "智谱清言",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "none",
    sourceUrl: "https://docs.bigmodel.cn/cn/api/introduction",
    extraSources: ["https://docs.bigmodel.cn/llms.txt"],
    verifiedAt: VERIFICATION_DATE,
    what: "开放平台 API 文档是对话、工具和套餐说明，使用用户自备 API Key。文档目录和快速开始里没有每日签到或领取接口。",
    rejectReason: "没有官方领取动作，不接入。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "minimax",
    name: "MiniMax",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "none",
    sourceUrl: "https://platform.minimaxi.com/docs/api-reference/api-overview.md",
    extraSources: ["https://hailuoai.com/doc/zh/payment-policy.html"],
    verifiedAt: VERIFICATION_DATE,
    what: "开放平台接口概览没有签到 API。海螺付费协议里的贝壳来自订阅计划，不是每日签到按钮。",
    rejectReason: "官方文档没有可执行的领取动作。第三方博客里的签到入口未当作官方依据。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "spark",
    name: "讯飞星火",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "none",
    sourceUrl: "https://xinghuo.xfyun.cn/doc/",
    extraSources: [],
    verifiedAt: VERIFICATION_DATE,
    what: "星火文档中心的使用攻略没有每日签到。讯飞文书的星火值签到属于另一产品，不挪到这张卡上。",
    rejectReason: "星火官网文档没有领取按钮或领取 API。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "kimi",
    name: "Kimi",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "one_time_manual",
    sourceUrl: "https://www.kimi.com/help/kimi-api/api-free-trial",
    extraSources: [],
    verifiedAt: VERIFICATION_DATE,
    what: "帮助中心写明国内手机号新用户注册即赠送 15 元代金券，完成实名认证后发放，自发放起 3 个月内有效。这是一次性发放，不是每日签到，也没有公开领取 API。",
    rejectReason: "实名后发放的一次性代金券保持「去官方领取」，不进入自动队列。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  },
  {
    id: "cloudflare",
    name: "Cloudflare",
    inCatalog: true,
    connected: false,
    balanceOnly: false,
    checkinSupported: false,
    executable: false,
    implementedClaimPath: "official_only",
    observedSurface: "none",
    sourceUrl: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
    extraSources: [],
    verifiedAt: VERIFICATION_DATE,
    what: "定价页说明 Workers AI 按 Neurons 计费，并有免费的每日额度（free daily allocation）和按模型单价。页面没有签到按钮，也没有领取 API。",
    rejectReason: "每日免费额度是定价规则，不是可点击的领取动作。",
    pageOrigin: null,
    claimPageUrl: null,
    click: null
  }
]);

/**
 * @param {readonly object[]} [reviews]
 * @param {{ claimedDayMarks?: Record<string, string>, dayKey?: string }} [opts]
 */
export function platformsForSchedule(reviews = CLAIM_REVIEWS, opts = {}) {
  const marks = opts.claimedDayMarks || {};
  const dayKey = opts.dayKey || "";
  return reviews.filter((review) => review && review.id).map((review) => ({
    id: review.id,
    name: review.name,
    checkinSupported: review.checkinSupported === true && review.executable === true,
    claimedToday: Boolean(dayKey && marks[review.id] === dayKey),
    claimPath: review.implementedClaimPath,
    executable: review.executable === true,
    balanceOnly: review.balanceOnly === true
  }));
}

export function reviewById(id) {
  return CLAIM_REVIEWS.find((review) => review.id === id) || null;
}
