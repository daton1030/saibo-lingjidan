import { CLAIM_REVIEWS } from "./vendor/adapters/claim-catalog.js";
import { PAGE_ORIGIN_ALLOWLIST } from "./vendor/scheduler/official-page.js";
import { formatLastRun } from "./vendor/scheduler/shell.js";

const PLATFORM = "modelscope";
const statusEl = document.getElementById("status");
const pill = document.getElementById("keyStatus");
const input = document.getElementById("tokenInput");
const claimStatusEl = document.getElementById("claimStatus");
const claimPill = document.getElementById("claimPill");
const reviewList = document.getElementById("reviewList");
const dailyBtn = document.getElementById("dailyBtn");

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

function setClaimStatus(text, kind) {
  claimStatusEl.textContent = text;
  claimStatusEl.className = "status" + (kind ? " " + kind : "");
}

function renderReviews() {
  reviewList.innerHTML = "";
  for (const review of CLAIM_REVIEWS) {
    const li = document.createElement("li");
    const label = review.balanceOnly
      ? "不进入领取队列，只刷新余额"
      : "暂不支持";
    li.textContent = review.name + "：" + label + "。" + review.rejectReason;
    reviewList.appendChild(li);
  }
}

function applyClaimState(state) {
  const on = Boolean(state && state.consented);
  claimPill.textContent = on ? "已授权本机执行" : "未授权";
  claimPill.classList.toggle("is-on", on);
  dailyBtn.textContent = state && state.dailyEnabled ? "关闭每日自动领取" : "开启每日自动领取";
  setClaimStatus(formatLastRun(state && state.lastRun, { demoMode: false }), "");
}

async function refreshClaim() {
  const state = await send("options.claimStatus", {});
  applyClaimState(state);
}

document.getElementById("authorizeBtn").addEventListener("click", async () => {
  try {
    let grantedOrigins = [];
    if (PAGE_ORIGIN_ALLOWLIST.length && chrome.permissions && chrome.permissions.request) {
      const origins = PAGE_ORIGIN_ALLOWLIST.map((origin) => origin.replace(/\/$/, "") + "/*");
      const granted = await chrome.permissions.request({ origins });
      if (!granted) {
        setClaimStatus("未授予官网页权限。未执行领取。", "err");
        return;
      }
      grantedOrigins = PAGE_ORIGIN_ALLOWLIST.slice();
    }
    const state = await send("options.authorizeAutoClaim", { grantedOrigins });
    applyClaimState(state);
    setClaimStatus(state.message || "已授权。", "ok");
  } catch (err) {
    setClaimStatus(err.message || "授权失败", "err");
  }
});

document.getElementById("revokeBtn").addEventListener("click", async () => {
  try {
    const state = await send("options.revokeAutoClaim", {});
    applyClaimState(state);
    setClaimStatus(state.message || "已取消授权。", "ok");
  } catch (err) {
    setClaimStatus(err.message || "取消失败", "err");
  }
});

document.getElementById("runOnceBtn").addEventListener("click", async () => {
  setClaimStatus("正在执行…");
  try {
    const state = await send("options.runClaimOnce", {});
    applyClaimState(state);
    setClaimStatus((state.message || "已执行。") + formatLastRun(state.lastRun, { demoMode: false }), state.claimed ? "ok" : "");
  } catch (err) {
    setClaimStatus(err.message || "执行失败", "err");
  }
});

dailyBtn.addEventListener("click", async () => {
  try {
    const current = await send("options.claimStatus", {});
    const state = await send("options.setDailyClaim", { enabled: !current.dailyEnabled });
    applyClaimState(state);
    setClaimStatus(state.message || "已更新定时。", state.ok === false ? "err" : "ok");
  } catch (err) {
    setClaimStatus(err.message || "无法更新定时", "err");
  }
});

renderReviews();

if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
  setStatus("请在 Chrome 中通过「扩展选项」打开本页，才能把令牌保存到本机。当前是静态预览。", "");
  setClaimStatus("当前是静态预览。请在扩展选项页里授权、执行或开启定时。令牌不会出现在本页。", "");
} else {
  refreshStatus().catch((err) => setStatus(err.message || "无法读取保存状态", "err"));
  refreshClaim().catch((err) => setClaimStatus(err.message || "无法读取自动领取状态", "err"));
}
