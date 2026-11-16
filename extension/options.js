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

function renderReviews(state) {
  reviewList.innerHTML = "";
  const rows = state && Array.isArray(state.platforms) ? state.platforms : [];
  const shown = new Set();
  for (const row of rows) {
    shown.add(row.id);
    const li = document.createElement("li");
    li.style.margin = "12px 0";
    if (row.balanceOnly) {
      const balance = row.officialPoints == null
        ? "余额尚未从官方读取"
        : "官方余额 " + row.officialPoints + " " + (row.officialUnit || "") + "，有效期官方未返回";
      li.textContent = row.name + "：不进入领取队列。" + balance;
      reviewList.appendChild(li);
      continue;
    }
    const stateText = row.needsRelogin ? "需重新登录" : row.confirmed ? "已授权" : "未授权";
    const note = document.createElement("div");
    note.textContent = row.name + "：" + stateText + "。余额：尚未从官方读取。有效期：官方未返回。" + (row.loginNote || "");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "secondary";
    open.textContent = "打开官网登录";
    open.addEventListener("click", () => runPlatform("options.openOfficialLogin", row.id));
    const confirm = document.createElement("button");
    confirm.type = "button";
    confirm.className = "secondary";
    confirm.textContent = "我已在官网完成登录";
    confirm.addEventListener("click", () => runPlatform("options.confirmPlatformLogin", row.id));
    const relogin = document.createElement("button");
    relogin.type = "button";
    relogin.className = "ghost";
    relogin.textContent = "重新登录";
    relogin.addEventListener("click", () => runPlatform("options.markPlatformRelogin", row.id));
    li.append(note, open, confirm, relogin);
    reviewList.appendChild(li);
  }
  for (const review of CLAIM_REVIEWS) {
    if (shown.has(review.id)) continue;
    const li = document.createElement("li");
    li.textContent = review.name + "：暂不支持。" + review.rejectReason;
    reviewList.appendChild(li);
  }
}

async function runPlatform(type, platformId) {
  try {
    const state = await send(type, { platformId });
    applyClaimState(state);
    setClaimStatus(state.message || "已更新。", state.ok === false ? "err" : "ok");
  } catch (err) {
    setClaimStatus(err.message || "操作失败", "err");
  }
}

function applyClaimState(state) {
  const on = Boolean(state && state.consented);
  claimPill.textContent = on ? "已授权本机执行" : "未授权";
  claimPill.classList.toggle("is-on", on);
  dailyBtn.textContent = state && state.dailyEnabled ? "关闭每日自动领取" : "开启每日自动领取";
  renderReviews(state);
  setClaimStatus(formatLastRun(state && state.lastRun, { demoMode: false }), "");
}

async function refreshClaim() {
  const state = await send("options.claimStatus", {});
  applyClaimState(state);
}

document.getElementById("authorizeBtn").addEventListener("click", async () => {
  if (PAGE_ORIGIN_ALLOWLIST.length && chrome.permissions && chrome.permissions.request) {
    try {
      const origins = PAGE_ORIGIN_ALLOWLIST.map((origin) => origin.replace(/\/$/, "") + "/*");
      const granted = await chrome.permissions.request({ origins });
      if (!granted) {
        setClaimStatus("未授予官网页权限。未执行领取。", "err");
        return;
      }
      await send("options.authorizeAutoClaim", { grantedOrigins: PAGE_ORIGIN_ALLOWLIST.slice() });
    } catch (err) {
      setClaimStatus(err.message || "授权失败", "err");
      return;
    }
  }
  setClaimStatus("请在下面选择具体平台，打开它自己的官网登录。本页没有统一扫码，也不会读取 Cookie。", "");
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

renderReviews(null);

if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
  setStatus("请在 Chrome 中通过「扩展选项」打开本页，才能把令牌保存到本机。当前是静态预览。", "");
  setClaimStatus("当前是静态预览。请在扩展选项页里授权、执行或开启定时。令牌不会出现在本页。", "");
} else {
  refreshStatus().catch((err) => setStatus(err.message || "无法读取保存状态", "err"));
  refreshClaim().catch((err) => setClaimStatus(err.message || "无法读取自动领取状态", "err"));
}
