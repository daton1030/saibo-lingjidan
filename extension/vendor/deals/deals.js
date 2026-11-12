/**
 * 公开「薅羊毛」活动表的加载、校验与状态计算。
 *
 * 只收录有官方来源页的活动 / 折扣 / 注册优惠 / 邀请奖励 / 免费额度。
 * 不得编造金额、日期或价格；不清楚时省略该字段或写「以官方页为准」。
 * 状态不入库，由 endAt 相对「现在」计算：进行中 / 即将结束（3 日内到期）/ 已结束。
 * 仅有日期、没有时刻的 startAt / endAt 按 Asia/Shanghai 当日 00:00:00 / 23:59:59.999 解释。
 */

export const DEAL_TYPES = Object.freeze(["活动", "折扣", "注册优惠", "邀请奖励", "免费额度"]);
export const DEAL_REGIONS = Object.freeze(["国内", "国际"]);
export const DEAL_STATUSES = Object.freeze(["进行中", "即将结束", "已结束"]);
export const ENDING_SOON_MS = 3 * 24 * 60 * 60 * 1000;
export const UNKNOWN_DEADLINE_LABEL = "截止时间未知";

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const HTTP_URL = /^https?:\/\/.+/i;

/**
 * @param {unknown} value
 * @param {"start"|"end"} bound
 * @returns {Date|null|undefined} null=未填，undefined=无效，Date=已解析
 */
export function parseDealDate(value, bound = "start") {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (DATE_ONLY.test(trimmed)) {
    const suffix = bound === "end" ? "T23:59:59.999+08:00" : "T00:00:00.000+08:00";
    const d = new Date(trimmed + suffix);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/**
 * @param {object} deal
 * @param {Date} [now]
 * @returns {"进行中"|"即将结束"|"已结束"}
 */
export function computeDealStatus(deal, now = new Date()) {
  const end = parseDealDate(deal?.endAt, "end");
  if (end instanceof Date && now.getTime() > end.getTime()) return "已结束";
  if (end instanceof Date && end.getTime() - now.getTime() <= ENDING_SOON_MS) return "即将结束";
  return "进行中";
}

/**
 * @param {unknown} raw
 * @returns {{ ok: boolean, deal?: object, errors: string[] }}
 */
export function validateDeal(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: ["条目不是对象"] };
  }

  const id = requireText(raw.id, "id", errors, 80);
  const vendor = requireText(raw.vendor, "vendor", errors, 80);
  const title = requireText(raw.title, "title", errors, 160);
  const summary = requireText(raw.summary, "summary", errors, 800);
  const conditions = optionalText(raw.conditions, "conditions", errors, 2000);
  const type = requireEnum(raw.type, "type", DEAL_TYPES, errors);
  const region = requireEnum(raw.region, "region", DEAL_REGIONS, errors);
  const sourceUrl = requireUrl(raw.sourceUrl, "sourceUrl", errors);
  const officialEntryUrl = requireUrl(raw.officialEntryUrl, "officialEntryUrl", errors);
  const verifiedAt = requireDateOnly(raw.verifiedAt, "verifiedAt", errors);

  const startAt = normalizeOptionalDate(raw.startAt, "startAt", "start", errors);
  const endAt = normalizeOptionalDate(raw.endAt, "endAt", "end", errors);

  if (startAt && endAt && startAt.getTime() > endAt.getTime()) {
    errors.push("startAt 晚于 endAt");
  }

  if (errors.length) return { ok: false, errors };

  const deal = {
    id,
    vendor,
    title,
    type,
    summary,
    conditions: conditions || "",
    region,
    startAt: raw.startAt == null || raw.startAt === "" ? null : String(raw.startAt).trim(),
    endAt: raw.endAt == null || raw.endAt === "" ? null : String(raw.endAt).trim(),
    sourceUrl,
    officialEntryUrl,
    verifiedAt
  };
  return { ok: true, deal, errors: [] };
}

/**
 * @param {string|object} raw JSON 文本或已解析对象
 * @param {{ now?: Date }} [options]
 * @returns {{
 *   schemaVersion: number,
 *   updatedAt: string|null,
 *   timezone: string,
 *   notes: string|null,
 *   deals: object[],
 *   dropped: { index: number, id?: string, errors: string[] }[]
 * }}
 */
export function loadDealTable(raw, options = {}) {
  const table = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!table || typeof table !== "object" || !Array.isArray(table.deals)) {
    throw new Error("活动表格式无效：缺少 deals 数组");
  }
  const now = options.now instanceof Date ? options.now : new Date();
  const dropped = [];
  const seen = new Set();
  const deals = [];

  table.deals.forEach((entry, index) => {
    const result = validateDeal(entry);
    if (!result.ok) {
      dropped.push({ index, id: entry && typeof entry === "object" ? entry.id : undefined, errors: result.errors });
      return;
    }
    if (seen.has(result.deal.id)) {
      dropped.push({ index, id: result.deal.id, errors: ["重复的 id"] });
      return;
    }
    seen.add(result.deal.id);
    const status = computeDealStatus(result.deal, now);
    deals.push({ ...result.deal, status });
  });

  return {
    schemaVersion: table.schemaVersion ?? 1,
    updatedAt: table.updatedAt || null,
    timezone: table.timezone || "Asia/Shanghai",
    notes: table.notes || null,
    deals: sortDeals(deals),
    dropped
  };
}

/**
 * 即将结束优先（截止更近的在前），然后进行中（有截止日期的在前，越近越前；截止日期未知的靠后），最后已结束。
 * @param {object[]} deals
 * @returns {object[]}
 */
export function sortDeals(deals) {
  const rank = { 即将结束: 0, 进行中: 1, 已结束: 2 };
  return [...deals].sort((a, b) => {
    const ra = rank[a.status] ?? 9;
    const rb = rank[b.status] ?? 9;
    if (ra !== rb) return ra - rb;
    const ea = parseDealDate(a.endAt, "end");
    const eb = parseDealDate(b.endAt, "end");
    const aHas = ea instanceof Date;
    const bHas = eb instanceof Date;
    if (a.status === "已结束") {
      if (aHas && bHas) return eb.getTime() - ea.getTime();
      if (aHas !== bHas) return aHas ? -1 : 1;
    } else {
      if (aHas && bHas) return ea.getTime() - eb.getTime();
      if (aHas !== bHas) return aHas ? -1 : 1;
    }
    return String(a.title || "").localeCompare(String(b.title || ""), "zh-CN");
  });
}

/**
 * @param {object} deal
 * @param {Date} [now]
 */
export function formatDeadline(deal, now = new Date()) {
  const end = parseDealDate(deal?.endAt, "end");
  if (!(end instanceof Date)) return UNKNOWN_DEADLINE_LABEL;
  if (deal.status === "已结束" || now.getTime() > end.getTime()) {
    const day = formatShanghaiDate(end);
    return day ? `已于 ${day} 结束` : "已结束";
  }
  const ms = end.getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  if (days <= 1) return "今日截止";
  return `剩余 ${days} 天`;
}

export function formatShanghaiDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
}

function requireText(value, field, errors, max) {
  if (typeof value !== "string" || !value.trim()) {
    errors.push(`缺少 ${field}`);
    return "";
  }
  const text = value.trim();
  if (text.length > max) {
    errors.push(`${field} 过长`);
    return "";
  }
  return text;
}

function optionalText(value, field, errors, max) {
  if (value == null || value === "") return "";
  if (typeof value !== "string") {
    errors.push(`${field} 必须是字符串`);
    return "";
  }
  const text = value.trim();
  if (text.length > max) {
    errors.push(`${field} 过长`);
    return "";
  }
  return text;
}

function requireEnum(value, field, allowed, errors) {
  if (!allowed.includes(value)) {
    errors.push(`${field} 无效`);
    return "";
  }
  return value;
}

function requireUrl(value, field, errors) {
  if (typeof value !== "string" || !HTTP_URL.test(value.trim())) {
    errors.push(`${field} 必须是官方 http(s) 链接`);
    return "";
  }
  const url = value.trim();
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      errors.push(`${field} 必须是官方 http(s) 链接`);
      return "";
    }
  } catch {
    errors.push(`${field} 必须是官方 http(s) 链接`);
    return "";
  }
  return url;
}

function requireDateOnly(value, field, errors) {
  if (typeof value !== "string" || !DATE_ONLY.test(value.trim())) {
    errors.push(`${field} 必须是 YYYY-MM-DD`);
    return "";
  }
  const d = parseDealDate(value.trim(), "start");
  if (!(d instanceof Date)) {
    errors.push(`${field} 必须是 YYYY-MM-DD`);
    return "";
  }
  return value.trim();
}

function normalizeOptionalDate(value, field, bound, errors) {
  const parsed = parseDealDate(value, bound);
  if (parsed === undefined) {
    errors.push(`${field} 日期无效`);
    return null;
  }
  return parsed;
}
