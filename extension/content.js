/**
 * 把看板页的 postMessage 转发给 service worker。
 * 只处理带有约定 source 的消息，令牌不会出现在这些消息里。
 */
const PAGE_SOURCE = "saibo-lingjidan-page";
const EXT_SOURCE = "saibo-lingjidan-extension";
const ALLOWED = new Set([
  "ping",
  "getBalance",
  "checkin",
  "productInfo",
  "getRates",
  "hasKey",
  "openOptions",
  "claimStatus",
  "authorizeAutoClaim",
  "revokeAutoClaim",
  "setDailyClaim",
  "runClaimOnce",
  "openOfficialLogin",
  "confirmPlatformLogin",
  "markPlatformRelogin"
]);

function isOurDashboard() {
  const meta = document.querySelector('meta[name="saibo-lingjidan"]');
  return Boolean(meta);
}

function reply(id, ok, result, error) {
  window.postMessage(
    { source: EXT_SOURCE, id, ok, result: ok ? result : undefined, error: ok ? undefined : error },
    window.location.origin
  );
}

window.addEventListener("message", (event) => {
  if (event.source !== window) return;
  if (event.origin !== window.location.origin) return;
  const data = event.data;
  if (!data || data.source !== PAGE_SOURCE || typeof data.id !== "string") return;
  if (!isOurDashboard()) return;
  const type = data.type;
  if (!ALLOWED.has(type)) {
    reply(data.id, false, undefined, "不支持的消息类型");
    return;
  }
  chrome.runtime.sendMessage({ type, payload: data.payload || {} }, (response) => {
    const runtimeError = chrome.runtime.lastError;
    if (runtimeError) {
      reply(data.id, false, undefined, runtimeError.message || "扩展未响应");
      return;
    }
    if (!response || response.ok !== true) {
      reply(data.id, false, undefined, (response && response.error) || "扩展返回失败");
      return;
    }
    reply(data.id, true, response.result);
  });
});

function announce() {
  if (!isOurDashboard()) return;
  window.postMessage({ source: EXT_SOURCE, type: "ready" }, window.location.origin);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", announce, { once: true });
} else {
  announce();
}
