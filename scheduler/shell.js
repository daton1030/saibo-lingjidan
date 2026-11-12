/**
 * 调度外壳（仅规划，不执行非官方自动领取）。
 *
 * 约定：
 * - 以 Asia/Shanghai 自然日判断「今日是否已领」
 * - 账号 / 平台串行执行
 * - 当日已领则跳过
 * - 某一项失败不中断其余项
 * - checkinSupported === false（例如魔搭）不得进入执行队列
 * - 本文件不实现、不调用任何非公开签到接口
 */

/**
 * @param {Array<{id: string, checkinSupported?: boolean, claimedToday?: boolean}>} platforms
 * @param {{ now?: Date, timezone?: string }} [opts]
 */
export function planSchedule(platforms, opts = {}) {
  const timezone = opts.timezone || "Asia/Shanghai";
  const now = opts.now || new Date();
  const dayKey = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);

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
