/**
 * 平台适配器的共享契约（JSDoc）。
 *
 * 三条领取路径（按产品约定，不得越过）：
 * 1. official_api：官方 OpenAPI / 用户自备 Key
 * 2. official_page：扩展在用户已登录的官方页面上点击官方按钮（本切片仅保留接口，不实现具体点击）
 * 3. official_only：只提供「去官方领取」，不得假装一键签到成功
 *
 * 余额来源顺序：official_api → page_read（可先做桩）→ manual。
 * 读不到余额时 points 必须为 null，不得写成 0，界面显示「尚未读取」。
 */

/**
 * @typedef {Object} ProductInfo
 * @property {string} id
 * @property {string} name
 * @property {string} vendor
 * @property {string} unit
 * @property {boolean} checkinSupported
 * @property {string} checkinNote
 * @property {"official_api"|"official_page"|"official_only"} claimPath
 * @property {string[]} [docs]
 * @property {string} [tokenPage]
 * @property {string} [usagePage]
 * @property {string} [officialHome]
 */

/**
 * @typedef {Object} AdapterContext
 * @property {string} [apiKey] 仅适配器内部使用，不得写入日志、页面或返回值
 * @property {typeof fetch} [fetchImpl]
 * @property {string} [baseUrl]
 * @property {() => Date} [now]
 */

/**
 * @typedef {Object} Balance
 * @property {number|null} points  null 表示尚未读取或无法解析，不能当作 0
 * @property {string} unit
 * @property {string|null} expiresAt ISO 8601，官方未返回则为 null
 * @property {string} updatedAt ISO 8601
 * @property {"official_api"|"page_read"|"manual"|"unread"} source
 * @property {string} [message]
 * @property {Record<string, unknown>} [meta]
 */

/**
 * @typedef {Object} CheckinResult
 * @property {boolean} ok
 * @property {"claimed"|"already"|"unsupported"|"no_activity"|"failed"|"official_only"} status
 * @property {boolean} claimed
 * @property {string} message
 * @property {number|null} [pointsAwarded]
 */

/**
 * @typedef {Object} PlatformAdapter
 * @property {ProductInfo} productInfo
 * @property {(ctx?: AdapterContext) => Promise<CheckinResult>} checkin
 * @property {(ctx?: AdapterContext) => Promise<Balance>} getBalance
 */

export const UNREAD_LABEL = "尚未读取";
export const NO_OFFICIAL_PRICE = "暂无官方价，不估值";

/**
 * 构造「尚未读取」余额，避免把失败写成 0。
 * @param {string} unit
 * @param {string} message
 * @param {() => Date} [now]
 * @returns {Balance}
 */
export function unreadBalance(unit, message, now = () => new Date()) {
  return {
    points: null,
    unit,
    expiresAt: null,
    updatedAt: now().toISOString(),
    source: "unread",
    message
  };
}

/**
 * 从返回对象中去掉可能泄露令牌的字段。
 * @param {unknown} err
 * @returns {string}
 */
export function safeErrorMessage(err) {
  let text = "";
  if (err && typeof err === "object" && "message" in err) text = String(err.message || "");
  else text = String(err || "未知错误");
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/ms-[A-Za-z0-9._-]+/g, "<redacted>")
    .replace(/(api[_-]?key|token|secret|authorization)\s*[:=]\s*\S+/gi, "$1=<redacted>");
}
