/**
 * 官网页点击的门禁。
 *
 * 只有核验记录把 executable 设为 true，并且来源站写进 PAGE_ORIGIN_ALLOWLIST 时，
 * 扩展才可以在用户已经打开的官方页面上点击官方按钮。
 * 当前白名单为空：没有一个平台同时具备「官网上的明确按钮」和「可核对的成功文案」。
 * 这里不读取 Cookie，不填写密码，也不调用非官方接口。
 */

/** 与 extension/manifest.json 的 optional_host_permissions 必须一致。空数组表示暂不申请任何官网页权限。 */
export const PAGE_ORIGIN_ALLOWLIST = Object.freeze([]);

/**
 * @param {object|null|undefined} review
 */
export function buildClickPlan(review) {
  const rejected = { ok: false, status: "unsupported", claimed: false, message: "暂不支持" };
  if (!review || review.executable !== true || review.implementedClaimPath !== "official_page" || review.checkinSupported !== true) {
    return rejected;
  }
  const origin = typeof review.pageOrigin === "string" ? review.pageOrigin : "";
  if (!origin || !PAGE_ORIGIN_ALLOWLIST.includes(origin)) return rejected;
  const click = review.click;
  if (!click || typeof click.buttonText !== "string" || !click.buttonText || typeof click.successText !== "string" || !click.successText) {
    return rejected;
  }
  if (typeof review.claimPageUrl !== "string" || !review.claimPageUrl) return rejected;
  let url;
  try {
    url = new URL(review.claimPageUrl);
  } catch {
    return rejected;
  }
  if (url.protocol !== "https:" || url.origin !== origin) return rejected;
  return {
    ok: true,
    origin,
    claimPageUrl: url.href,
    buttonText: click.buttonText,
    alreadyText: typeof click.alreadyText === "string" ? click.alreadyText : "",
    successText: click.successText,
    loggedOutText: typeof click.loggedOutText === "string" ? click.loggedOutText : ""
  };
}

/**
 * 只根据布尔信号下结论。成功文案没出现时不得返回 claimed。
 * @param {{ authorized?: boolean, loggedOut?: boolean, buttonFound?: boolean, already?: boolean, clicked?: boolean, successTextSeen?: boolean }} signals
 */
export function interpretPageSignals(signals) {
  const input = signals || {};
  if (input.authorized !== true || input.loggedOut === true) {
    return { ok: false, status: "needs_relogin", claimed: false, pointsAwarded: null, simulated: false, message: "需重新登录" };
  }
  if (input.already === true) {
    return { ok: true, status: "already", claimed: false, pointsAwarded: null, simulated: false, message: "当日已领" };
  }
  if (input.buttonFound !== true) {
    return { ok: true, status: "unsupported", claimed: false, pointsAwarded: null, simulated: false, message: "暂不支持" };
  }
  if (input.clicked === true && input.successTextSeen === true) {
    return { ok: true, status: "claimed", claimed: true, pointsAwarded: null, simulated: false, message: "已点击官方按钮" };
  }
  if (input.clicked === true) {
    return {
      ok: false,
      status: "failed",
      claimed: false,
      pointsAwarded: null,
      simulated: false,
      message: "已点击官方按钮，但页面没有出现已核验的成功文案，不记为领取成功"
    };
  }
  return { ok: false, status: "failed", claimed: false, pointsAwarded: null, simulated: false, message: "未点击官方按钮" };
}
