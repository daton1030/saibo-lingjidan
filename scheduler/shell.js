/**
 * 调度外壳。
 *
 * 约定：
 * - 以 Asia/Shanghai 自然日判断「今日是否已领」
 * - 账号 / 平台串行执行
 * - 当日已领则跳过
 * - 某一项失败不中断其余项
 * - checkinSupported === false（例如魔搭）不得进入执行队列
 * - 未授权、无官方动作、模拟结果都不得写成 claimed
 * - 本文件不调用任何非公开签到接口
 */

const CLAIM_SUCCESS = new Set(["claimed"]);
const NON_CLAIM = new Set(["unsupported", "official_only", "no_activity"]);

/**
 * @param {Date} [now]
 * @param {string} [timezone]
 */
export function shanghaiDayKey(now = new Date(), timezone = "Asia/Shanghai") {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

/**
 * @param {unknown} text
 */
export function redactText(text) {
  return String(text || "")
    .replace(/Bearer\s+\S+/gi, "Bearer <redacted>")
    .replace(/ms-[A-Za-z0-9._-]{6,}/g, "<redacted>")
    .replace(/(api[_-]?key|token|secret|cookie|password|authorization)\s*[:=]\s*\S+/gi, "$1=<redacted>");
}

/**
 * @param {unknown} value
 */
export function redactClaimRecord(value) {
  if (Array.isArray(value)) return value.map((item) => redactClaimRecord(item));
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (/apiKey|token|cookie|password|authorization|secret/i.test(key)) continue;
    out[key] = redactClaimRecord(item);
  }
  return out;
}

/**
 * @param {Array<{id: string, checkinSupported?: boolean, claimedToday?: boolean}>} platforms
 * @param {{ now?: Date, timezone?: string }} [opts]
 */
export function planSchedule(platforms, opts = {}) {
  const timezone = opts.timezone || "Asia/Shanghai";
  const now = opts.now || new Date();
  const dayKey = shanghaiDayKey(now, timezone);

  const toRun = [];
  const skipped = [];
  for (const p of platforms || []) {
    if (!p.checkinSupported) {
      skipped.push({ ...p, reason: "unsupported" });
      continue;
    }
    if (p.claimedToday) {
      skipped.push({ ...p, reason: "already_claimed_today" });
      continue;
    }
    toRun.push({ ...p, reason: "due" });
  }

  return {
    timezone,
    dayKey,
    serial: true,
    abortAllOnFailure: false,
    toRun,
    skipped
  };
}

/**
 * 把适配器或页面点击的原始结果收成可展示记录。
 * 只有 status === "claimed" 且 claimed === true 且不是模拟，才保留领取成功。
 * @param {unknown} raw
 */
export function normalizeAdapterResult(raw) {
  const body = raw && typeof raw === "object" ? /** @type {Record<string, unknown>} */ (raw) : {};
  const status = typeof body.status === "string" ? body.status : "failed";
  const message = redactText(typeof body.message === "string" ? body.message : "");
  if (body.simulated === true || body.demoClaim === true) {
    return {
      ok: false,
      status: "unsupported",
      claimed: false,
      pointsAwarded: null,
      simulated: true,
      message: message.includes("模拟") ? message : "暂不支持"
    };
  }
  if (status === "needs_relogin" || status === "unauthorized") {
    return {
      ok: false,
      status: "needs_relogin",
      claimed: false,
      pointsAwarded: null,
      simulated: false,
      message: message.includes("需重新登录") ? message : "需重新登录"
    };
  }
  if (NON_CLAIM.has(status)) {
    return {
      ok: status !== "failed",
      status,
      claimed: false,
      pointsAwarded: null,
      simulated: false,
      message: message || "暂不支持"
    };
  }
  if (status === "already") {
    return {
      ok: true,
      status: "already",
      claimed: false,
      pointsAwarded: null,
      simulated: false,
      message: message || "当日已领"
    };
  }
  if (CLAIM_SUCCESS.has(status) && body.claimed === true) {
    const points = body.pointsAwarded;
    return {
      ok: true,
      status: "claimed",
      claimed: true,
      pointsAwarded: typeof points === "number" && Number.isFinite(points) ? points : null,
      simulated: false,
      message: message || "已领取"
    };
  }
  return {
    ok: false,
    status: status === "claimed" ? "failed" : status,
    claimed: false,
    pointsAwarded: null,
    simulated: false,
    message: message || "未领取"
  };
}

/**
 * 未授权或没有官方领取动作时，忽略适配器里任何「成功」标记。
 * @param {{ authorized?: boolean, checkinSupported?: boolean, adapterResult?: unknown }} input
 */
export function settleOfficialClaim(input) {
  if (!input || input.checkinSupported !== true) {
    return {
      ok: true,
      status: "unsupported",
      claimed: false,
      pointsAwarded: null,
      simulated: false,
      message: "暂不支持"
    };
  }
  if (input.authorized !== true) {
    return {
      ok: false,
      status: "needs_relogin",
      claimed: false,
      pointsAwarded: null,
      simulated: false,
      message: "需重新登录"
    };
  }
  return normalizeAdapterResult(input.adapterResult);
}

/**
 * 串行执行计划。runner 抛错只记入该项。
 * @param {Array<{id: string, name?: string, checkinSupported?: boolean, claimedToday?: boolean}>} platforms
 * @param {(item: object) => Promise<unknown>} runner
 * @param {{ now?: Date, timezone?: string }} [opts]
 */
export async function executeSchedule(platforms, runner, opts = {}) {
  const plan = planSchedule(platforms, opts);
  const results = [];
  for (const item of plan.toRun) {
    try {
      const raw = await runner(item);
      const normalized = normalizeAdapterResult(raw);
      results.push({ ...normalized, id: item.id, name: item.name || item.id });
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message || "") : String(err || "");
      results.push({
        id: item.id,
        name: item.name || item.id,
        ok: false,
        status: "failed",
        claimed: false,
        pointsAwarded: null,
        simulated: false,
        message: redactText(message || "执行失败")
      });
    }
  }
  return { ...plan, results };
}

/**
 * @param {{
 *   platforms: Array<object>,
 *   runner: (item: object) => Promise<unknown>,
 *   refreshBalance?: boolean,
 *   balanceRunner?: () => Promise<unknown>,
 *   now?: Date,
 *   timezone?: string
 * }} input
 */
export async function executeOfficialDay(input) {
  const now = input.now || new Date();
  const claimExec = await executeSchedule(input.platforms || [], input.runner, {
    now,
    timezone: input.timezone
  });
  let balance = null;
  if (input.refreshBalance && typeof input.balanceRunner === "function") {
    try {
      balance = sanitizeBalance(await input.balanceRunner());
    } catch (err) {
      const message = err && typeof err === "object" && "message" in err ? String(err.message || "") : "刷新失败";
      balance = {
        id: "modelscope",
        kind: "balance",
        claimed: false,
        points: null,
        unit: "魔粒",
        source: "unread",
        message: redactText(message)
      };
    }
  }
  return {
    at: now.toISOString(),
    dayKey: claimExec.dayKey,
    timezone: claimExec.timezone,
    serial: true,
    abortAllOnFailure: false,
    simulated: false,
    claimed: claimExec.results.some((item) => item.claimed === true),
    claimMessage: claimExec.results.length ? "" : "暂不支持",
    results: claimExec.results,
    skipped: claimExec.skipped,
    balance
  };
}

/**
 * @param {{
 *   consented?: boolean,
 *   enabled?: boolean,
 *   lastClaimDay?: string|null,
 *   lastBalanceDay?: string|null,
 *   hasModelscopeKey?: boolean,
 *   now?: Date,
 *   timezone?: string
 * }} input
 */
export function decideDailyTick(input) {
  const dayKey = shanghaiDayKey(input.now || new Date(), input.timezone || "Asia/Shanghai");
  if (input.consented !== true) {
    return { dayKey, runClaims: false, refreshBalance: false, reason: "needs_relogin" };
  }
  if (input.enabled !== true) {
    return { dayKey, runClaims: false, refreshBalance: false, reason: "disabled" };
  }
  const runClaims = input.lastClaimDay !== dayKey;
  const refreshBalance = input.hasModelscopeKey === true && input.lastBalanceDay !== dayKey;
  return {
    dayKey,
    runClaims,
    refreshBalance,
    reason: runClaims || refreshBalance ? "due" : "already_done_today"
  };
}

/**
 * @param {unknown} previous
 * @param {object} update
 * @param {{ ranClaims?: boolean, refreshedBalance?: boolean }} flags
 */
export function mergeDailyUpdate(previous, update, flags) {
  const prev = previous && typeof previous === "object" ? /** @type {Record<string, unknown>} */ (previous) : {};
  const ranClaims = flags.ranClaims === true;
  const refreshedBalance = flags.refreshedBalance === true;
  return redactClaimRecord({
    at: update.at,
    dayKey: update.dayKey,
    timezone: update.timezone,
    serial: true,
    simulated: false,
    reason: update.reason || prev.reason || null,
    results: ranClaims ? update.results : (Array.isArray(prev.results) ? prev.results : []),
    skipped: ranClaims ? update.skipped : (Array.isArray(prev.skipped) ? prev.skipped : []),
    claimMessage: ranClaims ? update.claimMessage : (typeof prev.claimMessage === "string" ? prev.claimMessage : "暂不支持"),
    balance: refreshedBalance ? sanitizeBalance(update.balance) : sanitizeBalance(prev.balance),
    claimed: false
  });
}

/**
 * 公开模式不得把模拟签到带回成领取成功。
 * @param {unknown} run
 * @param {{ demoMode?: boolean }} [opts]
 */
export function presentStoredRun(run, opts = {}) {
  if (!run || typeof run !== "object") return null;
  const safe = redactClaimRecord(run);
  const demoMode = opts.demoMode === true;
  const results = Array.isArray(safe.results) ? safe.results : [];
  const simulated = safe.simulated === true || safe.demoClaim === true || results.some((item) => item && item.simulated === true);
  if (simulated && !demoMode) {
    return {
      at: typeof safe.at === "string" ? safe.at : null,
      dayKey: safe.dayKey || null,
      claimed: false,
      simulated: false,
      blockedDemo: true,
      claimMessage: "公开模式不展示模拟领取成功",
      claims: [],
      balance: sanitizeBalance(safe.balance),
      skipped: compactSkipped(safe.skipped)
    };
  }
  let claims = results.map((item) => {
    const normalized = normalizeAdapterResult(item);
    return { ...normalized, id: item && item.id, name: item && (item.name || item.id) };
  });
  if (demoMode && simulated) {
    claims = claims.map((item) => ({
      ...item,
      claimed: false,
      simulated: true,
      status: "unsupported",
      message: String(item.message || "").includes("模拟") ? item.message : "模拟"
    }));
  }
  return {
    at: typeof safe.at === "string" ? safe.at : null,
    dayKey: safe.dayKey || null,
    claimed: claims.some((item) => item.claimed === true),
    simulated: demoMode && simulated,
    blockedDemo: false,
    claimMessage: claims.length ? "" : (typeof safe.claimMessage === "string" ? safe.claimMessage : "暂不支持"),
    claims,
    balance: sanitizeBalance(safe.balance),
    skipped: compactSkipped(safe.skipped)
  };
}

/**
 * @param {unknown} run
 * @param {{ demoMode?: boolean }} [opts]
 */
export function formatLastRun(run, opts = {}) {
  const view = run && Array.isArray(run.claims) ? run : presentStoredRun(run, opts);
  if (!view) return "最近一次结果：尚未执行";
  const parts = ["最近一次结果："];
  if (view.blockedDemo) parts.push(view.claimMessage);
  else if (!view.claims.length) parts.push(view.claimMessage || "暂不支持");
  else parts.push(view.claims.map((item) => `${item.name || item.id} ${item.message}`).join("；"));
  if (view.balance) {
    const amount = view.balance.points == null ? "尚未读取" : `${view.balance.points} ${view.balance.unit || "魔粒"}`;
    parts.push(`魔搭余额刷新：${amount}。${view.balance.message || ""}`);
  }
  parts.push(view.claimed === true ? "领取队列中有成功项。" : "未记为领取成功。");
  return parts.join("");
}

/**
 * 已确认官网登录仍不等于领取成功。没有可执行按钮时返回「暂不支持」。
 * @param {readonly object[]} reviews
 * @param {Record<string, { confirmed?: boolean, needsRelogin?: boolean }>} [authById]
 */
export function buildHonestQueue(reviews, authById = {}) {
  const results = [];
  for (const review of reviews || []) {
    if (!review || !review.id) continue;
    if (!review.loginUrl && review.balanceOnly !== true) continue;
    const auth = authById[review.id] || {};
    if (review.balanceOnly === true) {
      results.push({
        id: review.id,
        name: review.name,
        ok: true,
        status: "unsupported",
        claimed: false,
        simulated: false,
        message: "暂不支持"
      });
      continue;
    }
    if (auth.needsRelogin === true || auth.confirmed !== true) {
      results.push({
        id: review.id,
        name: review.name,
        ok: false,
        status: "needs_relogin",
        claimed: false,
        simulated: false,
        message: "需重新登录"
      });
      continue;
    }
    if (review.executable !== true || review.checkinSupported !== true) {
      results.push({
        id: review.id,
        name: review.name,
        ok: true,
        status: "unsupported",
        claimed: false,
        simulated: false,
        message: "暂不支持"
      });
      continue;
    }
    results.push({
      id: review.id,
      name: review.name,
      ok: true,
      status: "ready",
      claimed: false,
      simulated: false,
      message: "可在已打开的官网页面上执行"
    });
  }
  return results;
}

function compactSkipped(skipped) {
  if (!Array.isArray(skipped)) return [];
  return skipped.map((item) => ({ id: item && item.id, reason: item && item.reason }));
}

function sanitizeBalance(balance) {
  if (!balance || typeof balance !== "object") return null;
  const body = /** @type {Record<string, unknown>} */ (balance);
  return {
    id: "modelscope",
    kind: "balance",
    claimed: false,
    points: typeof body.points === "number" ? body.points : null,
    unit: typeof body.unit === "string" ? body.unit : "魔粒",
    source: typeof body.source === "string" ? body.source : "unread",
    message: redactText(typeof body.message === "string" ? body.message : "")
  };
}
