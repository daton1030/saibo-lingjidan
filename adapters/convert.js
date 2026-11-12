import { NO_OFFICIAL_PRICE } from "./types.js";

/**
 * 按公开汇率表把积分估算成 Token 和人民币。
 * 缺少官方「积分→Token」或「每百万 Token 单价」时，不估值、不编造。
 *
 * @param {number|null|undefined} points
 * @param {object|null|undefined} platformRate rates.json 中该平台的条目
 * @returns {{
 *   ok: boolean,
 *   estimate: boolean,
 *   reason: string|null,
 *   tokens: number|null,
 *   cny: number|null,
 *   sourceUrl: string|null,
 *   updatedAt: string|null
 * }}
 */
export function estimateValue(points, platformRate) {
  const empty = {
    ok: false,
    estimate: false,
    reason: NO_OFFICIAL_PRICE,
    tokens: null,
    cny: null,
    sourceUrl: null,
    updatedAt: null
  };

  if (points == null || typeof points !== "number" || !Number.isFinite(points) || points < 0) {
    return { ...empty, reason: points == null ? UNREAD_REASON : "积分数值无效，不估值" };
  }

  if (!platformRate || typeof platformRate !== "object") {
    return empty;
  }

  const sourceUrl = pickSourceUrl(platformRate);
  const updatedAt = platformRate.updatedAt || platformRate.officialBilling?.updatedAt || null;

  const canEstimate =
    platformRate.estimateAvailable === true &&
    isPositiveNumber(platformRate.pointsToToken) &&
    isNonNegativeNumber(platformRate.pricePerMillionTokens);

  if (!canEstimate) {
    return {
      ...empty,
      reason: platformRate.reason || NO_OFFICIAL_PRICE,
      sourceUrl,
      updatedAt
    };
  }

  const tokens = points * platformRate.pointsToToken;
  const cny = (tokens / 1_000_000) * platformRate.pricePerMillionTokens;
  return {
    ok: true,
    estimate: true,
    reason: null,
    tokens,
    cny,
    sourceUrl,
    updatedAt
  };
}

const UNREAD_REASON = "尚未读取余额，不估值";

function isPositiveNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n > 0;
}

function isNonNegativeNumber(n) {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

function pickSourceUrl(rate) {
  if (rate.officialBilling?.sourceUrl) return rate.officialBilling.sourceUrl;
  if (Array.isArray(rate.sources) && rate.sources[0]?.url) return rate.sources[0].url;
  return null;
}

/**
 * @param {string|object} raw JSON 文本或已解析对象
 * @returns {object}
 */
export function loadRateTable(raw) {
  const table = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!table || typeof table !== "object" || !table.platforms || typeof table.platforms !== "object") {
    throw new Error("汇率表格式无效：缺少 platforms");
  }
  return table;
}

/**
 * @param {object} table
 * @param {string} platformId
 */
export function getPlatformRate(table, platformId) {
  if (!table?.platforms) return null;
  return table.platforms[platformId] || null;
}
