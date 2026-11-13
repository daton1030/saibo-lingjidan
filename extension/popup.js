document.getElementById("optionsBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
document.getElementById("dashBtn").addEventListener("click", () => {
  chrome.tabs.create({ url: "http://localhost:8080/web/?guide=1" });
});
chrome.runtime.sendMessage({ type: "ping" }, (response) => {
  const el = document.getElementById("status");
  if (chrome.runtime.lastError || !response || !response.ok) {
    el.textContent = "扩展后台暂时不可用。";
    return;
  }
  const result = response.result || {};
  const hasKey = Boolean(result.keys && result.keys.modelscope);
  const claim = result.claim || {};
  const parts = [];
  parts.push(hasKey ? "已在本机保存魔搭访问令牌。" : "尚未保存魔搭访问令牌。");
  if (claim.dailyEnabled) parts.push("已开启每日自动领取（北京时间）。");
  else if (claim.consented) parts.push("已授权本机执行，每日定时未开启。");
  else parts.push("尚未授权自动领取。");
  el.textContent = parts.join("");
});
