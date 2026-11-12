import { unreadBalance } from "./types.js";

/**
 * 其他演示卡片使用的桩适配器。
 * getBalance 默认返回尚未读取；page_read 路径仅作为接口占位，不抓取任何页面。
 * checkin 对 official_only 平台只返回「去官方领取」。
 *
 * @param {object} spec
 * @param {string} spec.id
 * @param {string} spec.name
 * @param {string} [spec.vendor]
 * @param {string} [spec.unit]
 * @param {"official_api"|"official_page"|"official_only"} [spec.claimPath]
 * @param {boolean} [spec.checkinSupported]
 */
export function createMockAdapter(spec) {
  const unit = spec.unit || "积分";
  const claimPath = spec.claimPath || "official_only";
  const checkinSupported = spec.checkinSupported === true && claimPath !== "official_only";

  const productInfo = {
    id: spec.id,
    name: spec.name,
    vendor: spec.vendor || spec.name,
    unit,
    checkinSupported,
    checkinNote: checkinSupported
      ? "演示桩：尚未接入官方接口。"
      : "本平台当前只提供「去官方领取」，不在站内自动签到。",
    claimPath,
    officialHome: spec.officialHome || null
  };

  async function checkin() {
    if (!checkinSupported) {
      return {
        ok: true,
        status: claimPath === "official_only" ? "official_only" : "unsupported",
        claimed: false,
        pointsAwarded: null,
        message: "此平台没有在站内执行的签到路径，请前往官方页面领取。"
      };
    }
    return {
      ok: true,
      status: "unsupported",
      claimed: false,
      pointsAwarded: null,
      message: "演示桩未实现真实签到。"
    };
  }

  /**
   * @param {import("./types.js").AdapterContext & { source?: "official_api"|"page_read"|"manual", manualPoints?: number }} [ctx]
   */
  async function getBalance(ctx = {}) {
    const now = ctx.now || (() => new Date());
    const source = ctx.source || "unread";
    if (source === "manual" && typeof ctx.manualPoints === "number") {
      return {
        points: ctx.manualPoints,
        unit,
        expiresAt: null,
        updatedAt: now().toISOString(),
        source: "manual",
        message: "用户手填的余额。"
      };
    }
    if (source === "page_read") {
      // 官方页面读取在本切片只保留接口，不实现抓取。
      return unreadBalance(unit, "页面读取尚未实现，尚未读取。", now);
    }
    return unreadBalance(unit, "此平台尚未接入官方余额接口，尚未读取。", now);
  }

  return { productInfo, checkin, getBalance };
}
