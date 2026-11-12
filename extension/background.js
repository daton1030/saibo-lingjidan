import { getAdapter, estimateValue, loadRateTable, getPlatformRate, listAdapters } from "./vendor/adapters/index.js";
import { readApiKey, writeApiKey, deleteApiKey, keyStatusMap } from "./keys.js";

const PAGE_TYPES = new Set([
  "ping",
  "getBalance",
  "checkin",
  "productInfo",
  "getRates",
  "hasKey",
  "openOptions"
]);

const OPTIONS_TYPES = new Set([
  "options.hasKey",
  "options.saveKey",
  "options.deleteKey",
  "options.testBalance"
]);

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
      adapters: listAdapters()
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
  throw new Error("不支持的选项消息");
}
