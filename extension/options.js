const PLATFORM = "modelscope";
const statusEl = document.getElementById("status");
const pill = document.getElementById("keyStatus");
const input = document.getElementById("tokenInput");

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = "status" + (kind ? " " + kind : "");
}

function send(type, payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type, payload }, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(new Error(err.message));
        return;
      }
      if (!response || response.ok !== true) {
        reject(new Error((response && response.error) || "扩展返回失败"));
        return;
      }
      resolve(response.result);
    });
  });
}

async function refreshStatus() {
  const result = await send("options.hasKey", { platformId: PLATFORM });
  pill.textContent = result.hasKey ? "已在本机保存令牌" : "未保存令牌";
  pill.classList.toggle("is-on", Boolean(result.hasKey));
}

document.getElementById("saveBtn").addEventListener("click", async () => {
  const token = input.value;
  if (!String(token || "").trim()) {
    setStatus("请先粘贴访问令牌。", "err");
    return;
  }
  try {
    await send("options.saveKey", { platformId: PLATFORM, token });
    input.value = "";
    await refreshStatus();
    setStatus("已保存到本机。输入框已清空，令牌不会回显，也不会上传。", "ok");
  } catch (err) {
    setStatus(err.message || "保存失败", "err");
  }
});

document.getElementById("deleteBtn").addEventListener("click", async () => {
  try {
    await send("options.deleteKey", { platformId: PLATFORM });
    input.value = "";
    await refreshStatus();
    setStatus("已从本机删除令牌。", "ok");
  } catch (err) {
    setStatus(err.message || "删除失败", "err");
  }
});

document.getElementById("testBtn").addEventListener("click", async () => {
  setStatus("正在请求官方接口…");
  try {
    const { balance } = await send("options.testBalance", { platformId: PLATFORM });
    if (!balance || balance.points == null) {
      setStatus((balance && balance.message) || "尚未读取到余额。", "err");
      return;
    }
    const frozen = balance.meta && typeof balance.meta.frozen_amount === "number"
      ? `，预扣 ${balance.meta.frozen_amount}`
      : "";
    const total = balance.meta && typeof balance.meta.total_balance === "number"
      ? `，总额度 ${balance.meta.total_balance}`
      : "";
    setStatus(`读取成功：可用 ${balance.points} ${balance.unit}${total}${frozen}。这是官方接口返回的真实余额。`, "ok");
  } catch (err) {
    setStatus(err.message || "测试失败", "err");
  }
});

if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
  setStatus("请在 Chrome 中通过「扩展选项」打开本页，才能把令牌保存到本机。当前是静态预览。", "");
} else {
  refreshStatus().catch((err) => setStatus(err.message || "无法读取保存状态", "err"));
}
