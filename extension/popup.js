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
  const hasKey = Boolean(response.result && response.result.keys && response.result.keys.modelscope);
  el.textContent = hasKey
    ? "已在本机保存魔搭访问令牌。打开看板即可读取余额。"
    : "尚未保存魔搭访问令牌。请先打开设置。";
});
