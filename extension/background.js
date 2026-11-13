import { getAdapter, estimateValue, loadRateTable, getPlatformRate, listAdapters, CLAIM_REVIEWS, platformsForSchedule } from "./vendor/adapters/index.js";
import { readApiKey, writeApiKey, deleteApiKey, keyStatusMap, hasApiKey } from "./keys.js";
import {
  decideDailyTick,
  executeOfficialDay,
  mergeDailyUpdate,
  presentStoredRun,
  redactClaimRecord,
  settleOfficialClaim,
  shanghaiDayKey
} from "./vendor/scheduler/shell.js";
import { PAGE_ORIGIN_ALLOWLIST } from "./vendor/scheduler/official-page.js";
import { runOfficialPageClaim } from "./official-click.js";

const PAGE_TYPES = new Set([
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
  "runClaimOnce"
]);

const OPTIONS_TYPES = new Set([
  "options.hasKey",
  "options.saveKey",
  "options.deleteKey",
  "options.testBalance",
  "options.claimStatus",
  "options.authorizeAutoClaim",
  "options.revokeAutoClaim",
  "options.setDailyClaim",
  "options.runClaimOnce"
]);

const CONSENT_KEY = "saibo.claim.consent";
const DAILY_KEY = "saibo.claim.dailyEnabled";
const LAST_KEY = "saibo.claim.lastRun";
const CLAIM_DAY_KEY = "saibo.claim.lastDay";
const BALANCE_DAY_KEY = "saibo.claim.modelscopeBalanceDay";
const DONE_KEY = "saibo.claim.doneDays";
const ALARM_NAME = "saibo.daily.tick";

const RATE_URL = chrome.runtime.getURL("vendor/rates/rates.json");
let rateTablePromise = null;

async function loadRates() {
  if (!rateTablePromise) {
    rateTablePromise = fetch(RATE_URL)
      .then((r) => r.json())
      .then((json) => loadRateTable(json));
  }
  try {
    return await rateTablePromise;
  } catch (err) {
    rateTablePromise = null;
    throw err;
  }
}

function unwrapSenderError(err) {
  const message = err && err.message ? String(err.message) : "扩展内部错误";
  return message
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/ms-[A-Za-z0-9._-]+/g, "<redacted>");
}

function isExtensionPage(sender) {
  return Boolean(
    sender &&
      sender.id === chrome.runtime.id &&
      typeof sender.url === "string" &&
      sender.url.startsWith(chrome.runtime.getURL(""))
  );
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handle(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((err) => sendResponse({ ok: false, error: unwrapSenderError(err) }));
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm || alarm.name !== ALARM_NAME) return;
  runScheduledTick("alarm").catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarmFromStorage()
    .then(() => runScheduledTick("startup"))
    .catch(() => {});
});

chrome.runtime.onInstalled.addListener(() => {
  ensureAlarmFromStorage().catch(() => {});
});

async function handle(message, sender) {
  const type = message && message.type;
  if (OPTIONS_TYPES.has(type)) {
    if (!isExtensionPage(sender)) throw new Error("拒绝来源");
    return handleOptions(message);
  }
  if (!PAGE_TYPES.has(type)) throw new Error("不支持的消息类型");
  const payload = (message && message.payload) || {};

  if (type === "ping") {
    const keys = await keyStatusMap(["modelscope"]);
    return {
      connected: true,
      name: "赛博领鸡蛋",
      version: chrome.runtime.getManifest().version,
      keys,
      adapters: listAdapters(),
      claim: await publicClaimState()
    };
  }

  if (type === "hasKey") {
    const id = payload.platformId || "modelscope";
    const map = await keyStatusMap([id]);
    return { platformId: id, hasKey: Boolean(map[id]) };
  }

  if (type === "openOptions") {
    await chrome.runtime.openOptionsPage();
    return { opened: true };
  }

  if (type === "getRates") {
    return await loadRates();
  }

  if (type === "productInfo") {
    return getAdapter(payload.platformId).productInfo;
  }

  if (type === "checkin") {
    return await getAdapter(payload.platformId).checkin();
  }

  if (type === "getBalance") {
    const platformId = payload.platformId;
    if (!platformId) throw new Error("缺少 platformId");
    const adapter = getAdapter(platformId);
    const apiKey = await readApiKey(platformId);
    const balance = await adapter.getBalance({ apiKey });
    let estimate = null;
    try {
      const table = await loadRates();
      estimate = estimateValue(balance.points, getPlatformRate(table, platformId));
    } catch {
      estimate = null;
    }
    return { balance, estimate };
  }

  if (type === "claimStatus") return publicClaimState();
  if (type === "authorizeAutoClaim") return authorizeAutoClaim(payload.grantedOrigins);
  if (type === "revokeAutoClaim") return revokeAutoClaim();
  if (type === "setDailyClaim") return setDailyClaim(payload.enabled === true);
  if (type === "runClaimOnce") return runClaimOnce("manual");

  throw new Error("不支持的消息类型");
}

async function handleOptions(message) {
  const payload = message.payload || {};
  const platformId = payload.platformId || "modelscope";
  if (message.type === "options.hasKey") {
    const map = await keyStatusMap([platformId]);
    return { hasKey: Boolean(map[platformId]) };
  }
  if (message.type === "options.saveKey") {
    const token = typeof payload.token === "string" ? payload.token : "";
    await writeApiKey(platformId, token);
    return { saved: token.trim().length > 0 };
  }
  if (message.type === "options.deleteKey") {
    await deleteApiKey(platformId);
    return { deleted: true };
  }
  if (message.type === "options.testBalance") {
    const adapter = getAdapter(platformId);
    const apiKey = await readApiKey(platformId);
    return { balance: await adapter.getBalance({ apiKey }) };
  }
  if (message.type === "options.claimStatus") return publicClaimState();
  if (message.type === "options.authorizeAutoClaim") return authorizeAutoClaim(payload.grantedOrigins);
  if (message.type === "options.revokeAutoClaim") return revokeAutoClaim();
  if (message.type === "options.setDailyClaim") return setDailyClaim(payload.enabled === true);
  if (message.type === "options.runClaimOnce") return runClaimOnce("manual");
  throw new Error("不支持的选项消息");
}

async function readBag() {
  return chrome.storage.local.get([CONSENT_KEY, DAILY_KEY, LAST_KEY, CLAIM_DAY_KEY, BALANCE_DAY_KEY, DONE_KEY]);
}

async function publicClaimState() {
  const bag = await readBag();
  const consent = bag[CONSENT_KEY] && bag[CONSENT_KEY].granted === true;
  const last = presentStoredRun(bag[LAST_KEY] || null, { demoMode: false });
  return {
    consented: consent,
    dailyEnabled: bag[DAILY_KEY] === true && consent,
    executableCount: platformsForSchedule(CLAIM_REVIEWS).filter((item) => item.checkinSupported).length,
    allowlistEmpty: PAGE_ORIGIN_ALLOWLIST.length === 0,
    reviews: CLAIM_REVIEWS.map((review) => ({
      id: review.id,
      name: review.name,
      connected: review.executable === true && review.checkinSupported === true,
      balanceOnly: review.balanceOnly === true,
      claimPath: review.implementedClaimPath,
      verifiedAt: review.verifiedAt,
      sourceUrl: review.sourceUrl,
      rejectReason: review.rejectReason
    })),
    lastRun: last,
    claimed: false
  };
}

async function authorizeAutoClaim(grantedOrigins) {
  const origins = Array.isArray(grantedOrigins) ? grantedOrigins.filter((origin) => PAGE_ORIGIN_ALLOWLIST.includes(origin)) : [];
  await chrome.storage.local.set({
    [CONSENT_KEY]: {
      granted: true,
      grantedAt: new Date().toISOString(),
      pageOrigins: origins
    }
  });
  return {
    ...(await publicClaimState()),
    claimed: false,
    status: "unsupported",
    message: PAGE_ORIGIN_ALLOWLIST.length
      ? "已授权本机执行器。只会在已允许的官网上点击已核验按钮。"
      : "已授权本机执行器。当前没有可自动点击的官方领取动作，暂不支持把任何平台记为领取成功。魔搭只在立即执行或每日定时里刷新余额。"
  };
}

async function revokeAutoClaim() {
  await chrome.storage.local.set({
    [CONSENT_KEY]: { granted: false, revokedAt: new Date().toISOString(), pageOrigins: [] },
    [DAILY_KEY]: false
  });
  await chrome.alarms.clear(ALARM_NAME);
  if (PAGE_ORIGIN_ALLOWLIST.length) {
    await chrome.permissions.remove({ origins: PAGE_ORIGIN_ALLOWLIST.map((origin) => origin.replace(/\/$/, "") + "/*") });
  }
  return {
    ...(await publicClaimState()),
    claimed: false,
    message: "已取消授权。每日自动领取已关闭。访问令牌仍留在本机，直到你单独删除。"
  };
}

async function setDailyClaim(enabled) {
  const bag = await readBag();
  const consented = Boolean(bag[CONSENT_KEY] && bag[CONSENT_KEY].granted === true);
  if (enabled && !consented) {
    return {
      ...(await publicClaimState()),
      ok: false,
      enabled: false,
      claimed: false,
      status: "needs_relogin",
      message: "需重新登录：请先点击「授权自动领取」。未授权不会执行，也不会记为领取成功。"
    };
  }
  await chrome.storage.local.set({ [DAILY_KEY]: enabled });
  if (enabled) {
    await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 30 });
  } else {
    await chrome.alarms.clear(ALARM_NAME);
  }
  return {
    ...(await publicClaimState()),
    ok: true,
    enabled,
    claimed: false,
    message: enabled
      ? "已开启每日自动领取。浏览器打开时按北京时间自然日检查；当日已执行会跳过。魔搭只刷新余额。"
      : "已关闭每日自动领取。"
  };
}

async function ensureAlarmFromStorage() {
  const bag = await readBag();
  const on = bag[DAILY_KEY] === true && bag[CONSENT_KEY] && bag[CONSENT_KEY].granted === true;
  if (!on) {
    await chrome.alarms.clear(ALARM_NAME);
    return;
  }
  const existing = await chrome.alarms.get(ALARM_NAME);
  if (!existing) await chrome.alarms.create(ALARM_NAME, { periodInMinutes: 30 });
}

async function runScheduledTick(reason) {
  const bag = await readBag();
  const consented = Boolean(bag[CONSENT_KEY] && bag[CONSENT_KEY].granted === true);
  if (!consented || bag[DAILY_KEY] !== true) return { skipped: true, claimed: false, status: "unsupported" };
  return runClaimOnce(reason);
}

async function runClaimOnce(reason) {
  const bag = await readBag();
  const consented = Boolean(bag[CONSENT_KEY] && bag[CONSENT_KEY].granted === true);
  if (!consented) {
    const blocked = {
      at: new Date().toISOString(),
      simulated: false,
      claimed: false,
      claimMessage: "需重新登录",
      results: [],
      skipped: [],
      balance: null,
      reason
    };
    await chrome.storage.local.set({ [LAST_KEY]: blocked });
    return { ...(await publicClaimState()), ok: false, claimed: false, status: "needs_relogin", message: "需重新登录" };
  }
  const now = new Date();
  const dayKey = shanghaiDayKey(now);
  const manual = reason === "manual";
  const decision = manual
    ? { runClaims: true, refreshBalance: await hasApiKey("modelscope"), dayKey, reason: "manual" }
    : decideDailyTick({
        consented: true,
        enabled: bag[DAILY_KEY] === true,
        lastClaimDay: bag[CLAIM_DAY_KEY] || null,
        lastBalanceDay: bag[BALANCE_DAY_KEY] || null,
        hasModelscopeKey: await hasApiKey("modelscope"),
        now
      });
  if (!manual && !decision.runClaims && !decision.refreshBalance) {
    const skippedToday = decision.reason === "already_done_today";
    return {
      ...(await publicClaimState()),
      ok: true,
      skipped: true,
      claimed: false,
      status: skippedToday ? "already" : "unsupported",
      message: skippedToday ? "当日已执行，本轮跳过。" : "每日自动领取未开启。"
    };
  }
  const done = bag[DONE_KEY] && typeof bag[DONE_KEY] === "object" ? bag[DONE_KEY] : {};
  const platforms = decision.runClaims
    ? platformsForSchedule(CLAIM_REVIEWS, { claimedDayMarks: done, dayKey: decision.dayKey || dayKey })
    : [];
  const update = await executeOfficialDay({
    platforms,
    now,
    refreshBalance: decision.refreshBalance === true,
    runner: (item) => runOnePlatform(item),
    balanceRunner: refreshModelscopeBalance
  });
  update.reason = reason;
  const merged = mergeDailyUpdate(bag[LAST_KEY], update, {
    ranClaims: decision.runClaims === true,
    refreshedBalance: decision.refreshBalance === true
  });
  const nextDone = { ...done };
  for (const item of merged.results || []) {
    if (item && item.claimed === true && item.id) nextDone[item.id] = update.dayKey;
  }
  const stored = { [LAST_KEY]: merged, [DONE_KEY]: nextDone };
  if (decision.runClaims === true) stored[CLAIM_DAY_KEY] = update.dayKey;
  if (decision.refreshBalance === true) stored[BALANCE_DAY_KEY] = update.dayKey;
  await chrome.storage.local.set(stored);
  const state = await publicClaimState();
  const claimed = Boolean(state.lastRun && state.lastRun.claimed === true);
  return {
    ...state,
    ok: true,
    claimed,
    status: claimed ? "claimed" : "unsupported",
    message: claimed
      ? "已完成本轮执行。"
      : "暂不支持：已核验的平台都没有可自动执行的官方领取动作。若已保存魔搭令牌，本轮只刷新官方余额，不记为领取成功。"
  };
}

async function runOnePlatform(item) {
  const review = CLAIM_REVIEWS.find((entry) => entry.id === item.id);
  if (!review || review.checkinSupported !== true || review.executable !== true) {
    return settleOfficialClaim({ authorized: true, checkinSupported: false, adapterResult: { claimed: true, status: "claimed" } });
  }
  if (review.implementedClaimPath === "official_page") {
    return runOfficialPageClaim(review, { authorized: true });
  }
  if (review.implementedClaimPath === "official_api") {
    const apiKey = await readApiKey(review.id);
    if (!apiKey) return settleOfficialClaim({ authorized: false, checkinSupported: true });
    const result = await getAdapter(review.id).checkin({ apiKey });
    return settleOfficialClaim({ authorized: true, checkinSupported: true, adapterResult: result });
  }
  return settleOfficialClaim({ authorized: true, checkinSupported: false });
}

async function refreshModelscopeBalance() {
  const apiKey = await readApiKey("modelscope");
  if (!apiKey) {
    return {
      id: "modelscope",
      kind: "balance",
      claimed: false,
      points: null,
      unit: "魔粒",
      source: "unread",
      message: "尚未配置魔搭访问令牌，未刷新余额。"
    };
  }
  const balance = await getAdapter("modelscope").getBalance({ apiKey });
  return redactClaimRecord({
    id: "modelscope",
    kind: "balance",
    claimed: false,
    points: balance.points,
    unit: balance.unit,
    source: balance.source,
    message: balance.message,
    updatedAt: balance.updatedAt
  });
}
