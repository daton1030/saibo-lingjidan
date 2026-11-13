import { buildClickPlan, interpretPageSignals } from "./vendor/scheduler/official-page.js";

/**
 * 在用户已经打开并登录的官方页面上点击已核验按钮。
 * 不打开登录框，不读取 Cookie / localStorage，不把页面正文带回扩展。
 * 当前白名单为空时，buildClickPlan 会直接返回「暂不支持」。
 *
 * @param {object} review
 * @param {{ authorized?: boolean }} [opts]
 */
export async function runOfficialPageClaim(review, opts = {}) {
  const plan = buildClickPlan(review);
  if (!plan.ok) {
    return { ok: false, status: "unsupported", claimed: false, pointsAwarded: null, simulated: false, message: "暂不支持" };
  }
  if (opts.authorized !== true) {
    return interpretPageSignals({ authorized: false });
  }
  const originPattern = plan.origin.replace(/\/$/, "") + "/*";
  const allowed = await chrome.permissions.contains({ origins: [originPattern] });
  if (!allowed) {
    return { ok: false, status: "needs_relogin", claimed: false, pointsAwarded: null, simulated: false, message: "需重新登录" };
  }
  const tabs = await chrome.tabs.query({ url: originPattern });
  const tab = (tabs || []).find((item) => typeof item.url === "string" && item.url.startsWith(plan.claimPageUrl));
  if (!tab || typeof tab.id !== "number") {
    return {
      ok: false,
      status: "needs_relogin",
      claimed: false,
      pointsAwarded: null,
      simulated: false,
      message: "需重新登录：请先在该官网打开领取页并完成登录。扩展不会代填密码，也不会读取 Cookie。"
    };
  }
  const injected = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: collectAndClick,
    args: [plan.buttonText, plan.alreadyText, plan.successText, plan.loggedOutText]
  });
  const raw = injected && injected[0] ? injected[0].result : null;
  if (!raw || typeof raw !== "object") {
    return { ok: false, status: "failed", claimed: false, pointsAwarded: null, simulated: false, message: "未能在官网页确认按钮状态，不记为领取成功" };
  }
  return interpretPageSignals({
    authorized: true,
    loggedOut: raw.loggedOut === true,
    buttonFound: raw.buttonFound === true,
    already: raw.already === true,
    clicked: raw.clicked === true,
    successTextSeen: raw.successTextSeen === true
  });
}

/**
 * 跑在页面的隔离世界里。只返回布尔值，不读取 cookie，不回传正文。
 * @param {string} buttonText
 * @param {string} alreadyText
 * @param {string} successText
 * @param {string} loggedOutText
 */
export function collectAndClick(buttonText, alreadyText, successText, loggedOutText) {
  const textOf = (el) => String((el && (el.innerText || el.textContent)) || "").replace(/\s+/g, " ").trim();
  const nodes = Array.from(document.querySelectorAll("button, [role='button'], a"));
  const body = document.body ? String(document.body.innerText || "").slice(0, 8000) : "";
  const loggedOut = Boolean(loggedOutText && body.includes(loggedOutText));
  const button = nodes.find((node) => textOf(node) === buttonText) || null;
  const already = Boolean(
    alreadyText && (nodes.some((node) => textOf(node) === alreadyText) || (!button && body.includes(alreadyText)))
  );
  if (loggedOut || already || !button) {
    return { loggedOut, buttonFound: Boolean(button), already, clicked: false, successTextSeen: false };
  }
  button.click();
  const after = document.body ? String(document.body.innerText || "").slice(0, 8000) : "";
  return {
    loggedOut: false,
    buttonFound: true,
    already: false,
    clicked: true,
    successTextSeen: Boolean(successText && after.includes(successText))
  };
}
