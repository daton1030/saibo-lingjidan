/**
 * 公开「薅羊毛」活动表的加载、校验与状态计算。
 *
 * 只收录有官方来源页的活动 / 折扣 / 注册优惠 / 邀请奖励 / 免费额度。
 * 不得编造金额、日期或价格；不清楚时省略该字段或写「以官方页为准」。
 *
 * 领取频次、核验状态、档期状态是三个独立维度，不能混在一个字段里。
 * - claimFrequency 入库且必填。
 * - verificationStatus 可入库：待核验 / 已失效应尊重人工标注；
 *   若入库为已核验，则按 VERIFICATION_STALE_DAYS（默认 7 个 Asia/Shanghai 日历日，从 verifiedAt 起算）计算，
 *   满 7 天后变为「需重新核验」。已结束不等于自动已失效。
 * - availabilityStatus 由加载器计算，不入库。无截止日期不得判为「进行中」。
 * 仅有日期、没有时刻的 startAt / endAt 按 Asia/Shanghai 当日 00:00:00 / 23:59:59.999 解释。
 */

export const DEAL_TYPES = Object.freeze(["活动", "折扣", "注册优惠", "邀请奖励", "免费额度"]);
export const DEAL_REGIONS = Object.freeze(["国内", "国际"]);
export const CLAIM_FREQUENCIES = Object.freeze(["每日", "每周", "每月", "一次性", "长期免费", "限时活动", "无需领取自动发放"]);
export const VERIFICATION_STATUSES = Object.freeze(["已核验", "待核验", "需重新核验", "已失效"]);
export const AVAILABILITY_STATUSES = Object.freeze(["未开始", "进行中", "即将结束", "已结束", "截止时间未知"]);
export const CLAIM_ACTIONS = Object.freeze(["自动到账", "去官方领取", "暂不支持"]);
/** @deprecated 请使用 AVAILABILITY_STATUSES；保留以便旧调用读取档期枚举。 */
export const DEAL_STATUSES = AVAILABILITY_STATUSES;
export const ENDING_SOON_MS = 3 * 24 * 60 * 60 * 1000;
export const UNKNOWN_DEADLINE_LABEL = "截止时间未知";
export const SHORT_UNKNOWN_DEADLINE_LABEL = "截止未知";
export const LONG_TERM_VALID_LABEL = "长期有效";
/** 已核验条目的合理核验周期：自 verifiedAt 起算的 Asia/Shanghai 日历日。满 7 天后进入「需重新核验」。 */
export const VERIFICATION_STALE_DAYS = 7;
export const DEAL_FREQUENCY_FILTERS = Object.freeze(["全部", ...CLAIM_FREQUENCIES]);
export const DEAL_VERIFICATION_FILTERS = Object.freeze(["全部", ...VERIFICATION_STATUSES]);
export const DEAL_AVAILABILITY_FILTERS = Object.freeze(["全部", ...AVAILABILITY_STATUSES]);

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
 * 档期状态。无 endAt 时一律为「截止时间未知」，不得判为「进行中」。
 * 展示「长期有效」是文案，不是本枚举的新值。
 * @param {object} deal
 * @param {Date} [now]
 * @returns {"未开始"|"进行中"|"即将结束"|"已结束"|"截止时间未知"}
 */
export function computeAvailabilityStatus(deal, now = new Date()) {
  const end = parseDealDate(deal?.endAt, "end");
  const start = parseDealDate(deal?.startAt, "start");
  if (end instanceof Date && now.getTime() > end.getTime()) return "已结束";
  if (start instanceof Date && now.getTime() < start.getTime()) return "未开始";
  if (end instanceof Date && end.getTime() - now.getTime() <= ENDING_SOON_MS) return "即将结束";
  if (end instanceof Date) return "进行中";
  return "截止时间未知";
}

/**
 * 兼容旧名：返回档期状态（availabilityStatus）。
 * @param {object} deal
 * @param {Date} [now]
 */
export function computeDealStatus(deal, now = new Date()) {
  return computeAvailabilityStatus(deal, now);
}

/**
 * 两个 Asia/Shanghai 日历日之间的整天差（now 当天减去 fromDateOnly）。
 * @param {string} fromDateOnly YYYY-MM-DD
 * @param {Date} now
 * @returns {number|null}
 */
export function shanghaiCalendarDayDiff(fromDateOnly, now = new Date()) {
  const start = parseDealDate(fromDateOnly, "start");
  if (!(start instanceof Date)) return null;
  const today = parseDealDate(formatShanghaiDate(now), "start");
  if (!(today instanceof Date)) return null;
  return Math.round((today.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * 解析入库核验状态，并在入库为「已核验」时按周期计算。
 * 待核验、已失效、需重新核验尊重人工标注，不会因已结束而自动改成已失效。
 * @param {object} deal
 * @param {Date} [now]
 */
export function resolveVerificationStatus(deal, now = new Date()) {
  const stored = typeof deal?.verificationStatus === "string" ? deal.verificationStatus.trim() : "";
  if (stored === "待核验" || stored === "已失效" || stored === "需重新核验") return stored;
  if (stored && stored !== "已核验") return stored;
  const diff = shanghaiCalendarDayDiff(deal?.verifiedAt, now);
  if (diff == null) return stored === "已核验" ? "已核验" : "待核验";
  if (diff >= VERIFICATION_STALE_DAYS) return "需重新核验";
  return "已核验";
}

export function isConfirmedVerification(deal) {
  return (deal?.verificationStatus || "") === "已核验";
}

/**
 * 无截止日期时：长期免费且已核验展示「长期有效」，否则「截止时间未知」。
 * 有截止日期时沿用剩余天数 / 已结束文案。
 * @param {object} deal
 * @param {Date} [now]
 */
export function formatDeadline(deal, now = new Date()) {
  const end = parseDealDate(deal?.endAt, "end");
  if (!(end instanceof Date)) return formatAvailabilityLabel(deal, now);
  const avail = deal?.availabilityStatus || computeAvailabilityStatus(deal, now);
  if (avail === "已结束" || now.getTime() > end.getTime()) {
    const day = formatShanghaiDate(end);
    return day ? `已于 ${day} 结束` : "已结束";
  }
  const ms = end.getTime() - now.getTime();
  const days = Math.max(1, Math.ceil(ms / (24 * 60 * 60 * 1000)));
  if (days <= 1) return "今日截止";
  return `剩余 ${days} 天`;
}

/**
 * 档期展示文案。枚举本身不含「长期有效」。
 * @param {object} deal
 * @param {Date} [now]
 */
export function formatAvailabilityLabel(deal, now = new Date()) {
  const avail = deal?.availabilityStatus || computeAvailabilityStatus(deal, now);
  const ver = deal?.verificationStatus || resolveVerificationStatus(deal, now);
  if (avail === "截止时间未知") {
    if (deal?.claimFrequency === "长期免费" && ver === "已核验") return LONG_TERM_VALID_LABEL;
    return UNKNOWN_DEADLINE_LABEL;
  }
  return avail;
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
  const claimFrequency = requireEnum(raw.claimFrequency, "claimFrequency", CLAIM_FREQUENCIES, errors);
  const verificationStatus = requireEnum(raw.verificationStatus, "verificationStatus", VERIFICATION_STATUSES, errors);
  const claimAction = requireEnum(raw.claimAction, "claimAction", CLAIM_ACTIONS, errors);
  const sourceUrl = requireUrl(raw.sourceUrl, "sourceUrl", errors);
  const officialEntryUrl = normalizeOfficialEntryUrl(raw.officialEntryUrl, claimAction, errors);
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
    claimFrequency,
    verificationStatus,
    claimAction,
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
    const availabilityStatus = computeAvailabilityStatus(result.deal, now);
    const verificationStatus = resolveVerificationStatus(result.deal, now);
    deals.push({
      ...result.deal,
      verificationStatusStored: result.deal.verificationStatus,
      verificationStatus,
      availabilityStatus,
      status: availabilityStatus
    });
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
 * 已确认的「即将结束」「每日可领」优先；需重新核验 / 待核验 / 已失效不得排在这些已确认项前面。
 * 同档内：有截止日期的越近越前，无截止日期靠后；已结束则较近结束的在前。
 * @param {object[]} deals
 * @returns {object[]}
 */
export function sortDeals(deals) {
  return [...deals].sort((a, b) => {
    const ra = sortRank(a);
    const rb = sortRank(b);
    if (ra !== rb) return ra - rb;
    const ea = parseDealDate(a.endAt, "end");
    const eb = parseDealDate(b.endAt, "end");
    const aHas = ea instanceof Date;
    const bHas = eb instanceof Date;
    const avail = a.availabilityStatus || a.status;
    if (avail === "已结束" && (b.availabilityStatus || b.status) === "已结束") {
      if (aHas && bHas) return eb.getTime() - ea.getTime();
      if (aHas !== bHas) return aHas ? -1 : 1;
    } else {
      if (aHas && bHas) return ea.getTime() - eb.getTime();
      if (aHas !== bHas) return aHas ? -1 : 1;
    }
    return String(a.title || "").localeCompare(String(b.title || ""), "zh-CN");
  });
}

function sortRank(deal) {
  const confirmed = isConfirmedVerification(deal);
  const avail = deal.availabilityStatus || deal.status;
  const freq = deal.claimFrequency;
  let base;
  if (avail === "即将结束") base = 0;
  else if (freq === "每日" && avail !== "已结束" && avail !== "未开始") base = 1;
  else if (avail === "已结束") base = 4;
  else if (avail === "未开始") base = 3;
  else base = 2;
  return confirmed ? base : base + 10;
}

/**
 * 组合筛选。多条件同时生效，「全部」表示不限制该项。
 * @param {object[]} deals
 * @param {{
 *   type?: string,
 *   region?: string,
 *   claimFrequency?: string,
 *   verificationStatus?: string,
 *   availabilityStatus?: string,
 *   hideEnded?: boolean
 * }} [filters]
 */
export function filterDeals(deals, filters = {}) {
  const type = filters.type || "全部";
  const region = filters.region || "全部";
  const claimFrequency = filters.claimFrequency || "全部";
  const verificationStatus = filters.verificationStatus || "全部";
  const availabilityStatus = filters.availabilityStatus || "全部";
  const hideEnded = !!filters.hideEnded;
  return (deals || []).filter((d) => {
    if (type !== "全部" && d.type !== type) return false;
    if (region !== "全部" && d.region !== region) return false;
    if (claimFrequency !== "全部" && d.claimFrequency !== claimFrequency) return false;
    if (verificationStatus !== "全部" && d.verificationStatus !== verificationStatus) return false;
    const avail = d.availabilityStatus || d.status;
    if (availabilityStatus !== "全部" && avail !== availabilityStatus) return false;
    if (hideEnded && avail === "已结束") return false;
    return true;
  });
}

/**
 * 首页分组：已确认的即将结束、每日可领优先；一次性单独分组，且不会进入每日可领。
 * 每条活动只出现在一个分组，避免重复。未确认项不会进入「即将结束」「每日可领」。
 * @param {object[]} deals
 */
export function groupDealsForHome(deals) {
  const used = new Set();
  const take = (pred) => {
    const items = [];
    for (const d of deals || []) {
      if (used.has(d.id) || !pred(d)) continue;
      used.add(d.id);
      items.push(d);
    }
    return items;
  };
  const confirmed = (d) => isConfirmedVerification(d);
  const ending = take((d) => confirmed(d) && (d.availabilityStatus || d.status) === "即将结束");
  const daily = take((d) => {
    const avail = d.availabilityStatus || d.status;
    return confirmed(d) && d.claimFrequency === "每日" && avail !== "已结束" && avail !== "未开始";
  });
  const onetime = take((d) => d.claimFrequency === "一次性");
  const other = take(() => true);
  return [
    { id: "ending", title: "即将结束", items: ending },
    { id: "daily", title: "每日可领", items: daily },
    { id: "onetime", title: "新用户一次性", items: onetime },
    { id: "other", title: "其他福利", items: other }
  ].filter((g) => g.items.length);
}

/**
 * 领取按钮语义。无 officialEntryUrl 或 claimAction 为「暂不支持」时，
 * 不得出现可点击的「去官方领取」。
 * @param {object} deal
 */
export function dealClaimButton(deal) {
  const action = deal?.claimAction;
  const raw = typeof deal?.officialEntryUrl === "string" ? deal.officialEntryUrl.trim() : "";
  let url = "";
  if (raw) {
    try {
      const parsed = new URL(raw);
      if (parsed.protocol === "http:" || parsed.protocol === "https:") url = parsed.href;
    } catch { url = ""; }
  }
  if (action === "自动到账") {
    return {
      kind: "auto",
      label: "自动到账",
      enabled: false,
      openOfficial: !!url,
      officialLabel: url ? "打开官网" : "",
      officialUrl: url,
      note: "需在官网登录后由官方发放，本站不会显示领取成功。"
    };
  }
  if (action === "去官方领取" && url) {
    return {
      kind: "official",
      label: "去官方领取",
      enabled: true,
      openOfficial: true,
      officialLabel: "去官方领取",
      officialUrl: url,
      note: "将在新标签页打开已核实的官方入口。"
    };
  }
  return {
    kind: "unsupported",
    label: "暂不支持",
    enabled: false,
    openOfficial: false,
    officialLabel: "",
    officialUrl: "",
    note: "尚未提供可跳转的官方领取入口，本站不会假装可领。"
  };
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

function normalizeOfficialEntryUrl(value, claimAction, errors) {
  if (value == null || value === "") {
    if (claimAction === "去官方领取") {
      errors.push("officialEntryUrl 必须是官方 http(s) 链接");
    }
    return "";
  }
  return requireUrl(value, "officialEntryUrl", errors);
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
