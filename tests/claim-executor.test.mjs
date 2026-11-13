import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { checkin as modelscopeCheckin } from "../adapters/modelscope.js";
import { CLAIM_REVIEWS, platformsForSchedule } from "../adapters/claim-catalog.js";
import { buildClickPlan, interpretPageSignals, PAGE_ORIGIN_ALLOWLIST } from "../scheduler/official-page.js";
import {
  decideDailyTick,
  executeOfficialDay,
  executeSchedule,
  formatLastRun,
  mergeDailyUpdate,
  presentStoredRun,
  redactClaimRecord,
  settleOfficialClaim
} from "../scheduler/shell.js";

test("runs due items serially and continues after one failure", async () => {
  const order = [];
  const out = await executeSchedule(
    [
      { id: "a", name: "A", checkinSupported: true },
      { id: "b", name: "B", checkinSupported: true },
      { id: "c", name: "C", checkinSupported: true },
      { id: "modelscope", name: "魔搭社区", checkinSupported: false }
    ],
    async (item) => {
      order.push("start:" + item.id);
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (item.id === "b") throw new Error("boom Bearer ms-secret-token");
      order.push("end:" + item.id);
      return { ok: true, status: "claimed", claimed: true, message: "ok", pointsAwarded: 1 };
    },
    { now: new Date("2026-11-13T10:00:00+08:00") }
  );
  assert.deepEqual(order, ["start:a", "end:a", "start:b", "start:c", "end:c"]);
  assert.deepEqual(out.results.map((item) => item.id), ["a", "b", "c"]);
  assert.equal(out.results.find((item) => item.id === "a").claimed, true);
  assert.equal(out.results.find((item) => item.id === "b").claimed, false);
  assert.equal(out.results.find((item) => item.id === "b").status, "failed");
  assert.equal(out.results.find((item) => item.id === "c").claimed, true);
  assert.equal(out.results.some((item) => item.id === "modelscope"), false);
  assert.equal(out.skipped.find((item) => item.id === "modelscope").reason, "unsupported");
  assert.equal(JSON.stringify(out).includes("ms-secret-token"), false);
  assert.match(out.results.find((item) => item.id === "b").message, /redacted/);
});

test("skips a platform already claimed on the Shanghai day", async () => {
  let called = 0;
  const out = await executeSchedule(
    [
      { id: "a", checkinSupported: true, claimedToday: true },
      { id: "b", checkinSupported: true, claimedToday: false }
    ],
    async () => {
      called += 1;
      return { ok: true, status: "claimed", claimed: true };
    }
  );
  assert.equal(called, 1);
  assert.deepEqual(out.toRun.map((item) => item.id), ["b"]);
  assert.equal(out.skipped[0].reason, "already_claimed_today");
});

test("modelscope checkin stays unsupported and stays out of the queue", async () => {
  const result = await modelscopeCheckin();
  assert.equal(result.claimed, false);
  assert.equal(result.status, "unsupported");
  const review = CLAIM_REVIEWS.find((item) => item.id === "modelscope");
  assert.equal(review.balanceOnly, true);
  assert.equal(review.checkinSupported, false);
  assert.equal(review.executable, false);
  const platforms = platformsForSchedule(CLAIM_REVIEWS, { dayKey: "2026-11-13" });
  assert.equal(platforms.find((item) => item.id === "modelscope").checkinSupported, false);
  assert.equal(platforms.every((item) => item.checkinSupported === false), true);
  let ran = 0;
  const day = await executeOfficialDay({
    platforms,
    now: new Date("2026-11-13T09:00:00+08:00"),
    refreshBalance: true,
    runner: async () => {
      ran += 1;
      return { ok: true, status: "claimed", claimed: true };
    },
    balanceRunner: async () => ({
      points: 12,
      unit: "魔粒",
      source: "official_api",
      message: "已读取",
      apiKey: "ms-should-not-leak"
    })
  });
  assert.equal(ran, 0);
  assert.equal(day.claimed, false);
  assert.equal(day.claimMessage, "暂不支持");
  assert.equal(day.balance.claimed, false);
  assert.equal(day.balance.points, 12);
  assert.equal(JSON.stringify(day).includes("ms-should-not-leak"), false);
  assert.equal(day.balance.apiKey, undefined);
});

test("unauthorized or missing official action never returns claimed", () => {
  const forced = { ok: true, status: "claimed", claimed: true, pointsAwarded: 100, message: "假装成功" };
  const unsupported = settleOfficialClaim({ authorized: true, checkinSupported: false, adapterResult: forced });
  assert.equal(unsupported.claimed, false);
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.message, "暂不支持");
  const relogin = settleOfficialClaim({ authorized: false, checkinSupported: true, adapterResult: forced });
  assert.equal(relogin.claimed, false);
  assert.equal(relogin.status, "needs_relogin");
  assert.equal(relogin.message, "需重新登录");
  const simulated = settleOfficialClaim({
    authorized: true,
    checkinSupported: true,
    adapterResult: { ...forced, simulated: true, message: "已模拟领取" }
  });
  assert.equal(simulated.claimed, false);
  assert.equal(simulated.simulated, true);
});

test("public mode does not surface a simulated check-in as success", () => {
  const stored = {
    simulated: true,
    demoClaim: true,
    apiKey: "ms-hidden",
    results: [{ id: "meeo", name: "Meeo", status: "claimed", claimed: true, simulated: true, message: "已模拟领取 +2000" }],
    balance: { points: 1, unit: "魔粒", message: "余额", cookie: "nope" }
  };
  const shown = presentStoredRun(stored, { demoMode: false });
  assert.equal(shown.blockedDemo, true);
  assert.equal(shown.claimed, false);
  assert.equal(shown.claims.length, 0);
  assert.equal(shown.claimMessage, "公开模式不展示模拟领取成功");
  assert.equal(shown.balance.claimed, false);
  assert.equal(JSON.stringify(shown).includes("ms-hidden"), false);
  assert.equal(JSON.stringify(shown).includes("nope"), false);
  const text = formatLastRun(stored, { demoMode: false });
  assert.match(text, /公开模式不展示模拟领取成功/);
  assert.equal(text.includes("已模拟领取 +2000"), false);
  const demo = presentStoredRun(stored, { demoMode: true });
  assert.equal(demo.claimed, false);
  assert.equal(demo.simulated, true);
  assert.match(demo.claims[0].message, /模拟/);
});

test("daily tick stays idle until consent and a new Shanghai day", () => {
  const now = new Date("2026-11-13T00:30:00+08:00");
  const locked = decideDailyTick({ consented: false, enabled: true, hasModelscopeKey: true, now });
  assert.equal(locked.runClaims, false);
  assert.equal(locked.refreshBalance, false);
  assert.equal(locked.reason, "needs_relogin");
  const off = decideDailyTick({ consented: true, enabled: false, hasModelscopeKey: true, now });
  assert.equal(off.reason, "disabled");
  const due = decideDailyTick({
    consented: true,
    enabled: true,
    lastClaimDay: "2026-11-12",
    lastBalanceDay: "2026-11-12",
    hasModelscopeKey: true,
    now
  });
  assert.equal(due.dayKey, "2026-11-13");
  assert.equal(due.runClaims, true);
  assert.equal(due.refreshBalance, true);
  const done = decideDailyTick({
    consented: true,
    enabled: true,
    lastClaimDay: "2026-11-13",
    lastBalanceDay: "2026-11-13",
    hasModelscopeKey: true,
    now
  });
  assert.equal(done.runClaims, false);
  assert.equal(done.refreshBalance, false);
  assert.equal(done.reason, "already_done_today");
  const noKey = decideDailyTick({
    consented: true,
    enabled: true,
    lastClaimDay: null,
    hasModelscopeKey: false,
    now
  });
  assert.equal(noKey.runClaims, true);
  assert.equal(noKey.refreshBalance, false);
});

test("page click without a verified success signal is not a claim", () => {
  assert.deepEqual(PAGE_ORIGIN_ALLOWLIST, []);
  const plan = buildClickPlan({
    executable: true,
    implementedClaimPath: "official_page",
    checkinSupported: true,
    pageOrigin: "https://example.com",
    claimPageUrl: "https://example.com/claim",
    click: { buttonText: "签到", successText: "领取成功" }
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.claimed, false);
  assert.equal(plan.message, "暂不支持");
  const missed = interpretPageSignals({ authorized: true, buttonFound: true, clicked: true, successTextSeen: false });
  assert.equal(missed.claimed, false);
  assert.equal(missed.status, "failed");
  const loggedOut = interpretPageSignals({ authorized: true, loggedOut: true, buttonFound: true, clicked: true, successTextSeen: true });
  assert.equal(loggedOut.claimed, false);
  assert.equal(loggedOut.message, "需重新登录");
});

test("claim reviews keep a source, a Shanghai date, and no executable target", () => {
  const doc = readFileSync(new URL("../docs/claim-verification.md", import.meta.url), "utf8");
  assert.ok(CLAIM_REVIEWS.length >= 8);
  for (const review of CLAIM_REVIEWS) {
    assert.equal(review.verifiedAt, "2026-11-13");
    assert.match(review.sourceUrl, /^https:\/\//);
    assert.ok(review.what);
    assert.ok(review.rejectReason);
    assert.equal(review.executable, false);
    assert.equal(review.checkinSupported, false);
    assert.ok(["official_api", "official_page", "official_only"].includes(review.implementedClaimPath));
    assert.ok(doc.includes(review.sourceUrl));
    assert.equal(review.click, null);
  }
});

test("merged run records drop secrets and do not treat balance as a claim", () => {
  const merged = mergeDailyUpdate(
    { results: [{ id: "old", status: "unsupported", claimed: false }], claimMessage: "暂不支持" },
    {
      at: "2026-11-13T02:00:00.000Z",
      dayKey: "2026-11-13",
      timezone: "Asia/Shanghai",
      results: [],
      skipped: [],
      claimMessage: "暂不支持",
      balance: { points: 3, unit: "魔粒", message: "ok", token: "secret" }
    },
    { ranClaims: false, refreshedBalance: true }
  );
  assert.equal(merged.balance.claimed, false);
  assert.equal(merged.balance.points, 3);
  assert.equal(merged.balance.token, undefined);
  assert.equal(merged.results[0].id, "old");
  const redacted = redactClaimRecord({ apiKey: "ms-abc", note: "Bearer ms-abc" });
  assert.equal(redacted.apiKey, undefined);
  assert.match(redacted.note, /redacted/);
});
