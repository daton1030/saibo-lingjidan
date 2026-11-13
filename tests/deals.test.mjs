import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  AVAILABILITY_STATUSES,
  CLAIM_ACTIONS,
  CLAIM_FREQUENCIES,
  LONG_TERM_VALID_LABEL,
  UNKNOWN_DEADLINE_LABEL,
  VERIFICATION_STALE_DAYS,
  computeAvailabilityStatus,
  computeDealStatus,
  dealClaimButton,
  filterDeals,
  formatAvailabilityLabel,
  formatDeadline,
  groupDealsForHome,
  loadDealTable,
  parseDealDate,
  resolveVerificationStatus,
  sortDeals,
  validateDeal
} from "../deals/deals.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "deals/deals.json"), "utf8");

const now = new Date("2026-11-13T12:00:00+08:00");

const ORIGINAL_FIELDS = [
  "id", "vendor", "title", "type", "summary", "conditions", "region",
  "startAt", "endAt", "sourceUrl", "officialEntryUrl", "verifiedAt"
];

const EXPECTED = {
  "siliconflow-signup": { claimFrequency: "一次性", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "去官方领取" },
  "siliconflow-ambassador": { claimFrequency: "限时活动", verificationStatus: "已核验", availabilityStatus: "进行中", claimAction: "去官方领取" },
  "aliyun-bailian-newuser": { claimFrequency: "一次性", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "自动到账" },
  "kimi-api-trial": { claimFrequency: "一次性", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "去官方领取" },
  "tencent-tokenhub-newuser": { claimFrequency: "一次性", verificationStatus: "已核验", availabilityStatus: "进行中", claimAction: "去官方领取" },
  "baidu-qianfan-newuser": { claimFrequency: "一次性", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "自动到账" },
  "volcengine-ark-newuser": { claimFrequency: "一次性", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "自动到账" },
  "gemini-api-free-tier": { claimFrequency: "长期免费", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "去官方领取" },
  "anthropic-batches-discount": { claimFrequency: "长期免费", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "去官方领取" },
  "deepseek-offpeak": { claimFrequency: "长期免费", verificationStatus: "已核验", availabilityStatus: "截止时间未知", claimAction: "自动到账" }
};

function sample(overrides = {}) {
  return {
    id: "sample-deal",
    vendor: "示例厂商",
    title: "示例优惠",
    type: "活动",
    summary: "用于单元测试的合法条目。",
    conditions: "测试条件",
    region: "国内",
    claimFrequency: "限时活动",
    verificationStatus: "已核验",
    claimAction: "去官方领取",
    startAt: "2026-11-01",
    endAt: "2026-12-01",
    sourceUrl: "https://example.invalid/official",
    officialEntryUrl: "https://example.invalid/claim",
    verifiedAt: "2026-11-12",
    ...overrides
  };
}

test("seeded deals.json loads all 10 entries with new fields and original values kept", () => {
  const table = loadDealTable(raw, { now });
  const file = JSON.parse(raw);
  assert.equal(table.schemaVersion, 2);
  assert.equal(table.updatedAt, "2026-11-13");
  assert.equal(table.dropped.length, 0);
  assert.equal(table.deals.length, 10);
  assert.equal(file.deals.length, 10);
  const byId = new Map(table.deals.map((d) => [d.id, d]));
  for (const rawDeal of file.deals) {
    const deal = byId.get(rawDeal.id);
    assert.ok(deal, rawDeal.id);
    const expect = EXPECTED[rawDeal.id];
    assert.ok(expect, rawDeal.id);
    for (const field of ORIGINAL_FIELDS) {
      assert.equal(deal[field], rawDeal[field], `${rawDeal.id}.${field}`);
    }
    assert.equal(deal.verifiedAt, "2026-11-12");
    assert.equal(deal.claimFrequency, expect.claimFrequency);
    assert.equal(deal.verificationStatus, expect.verificationStatus);
    assert.equal(deal.availabilityStatus, expect.availabilityStatus);
    assert.equal(deal.status, deal.availabilityStatus);
    assert.equal(deal.claimAction, expect.claimAction);
    assert.ok(CLAIM_FREQUENCIES.includes(deal.claimFrequency));
    assert.ok(CLAIM_ACTIONS.includes(deal.claimAction));
    assert.ok(AVAILABILITY_STATUSES.includes(deal.availabilityStatus));
    assert.match(deal.sourceUrl, /^https?:\/\//);
    assert.match(deal.officialEntryUrl, /^https?:\/\//);
  }
  assert.equal(VERIFICATION_STALE_DAYS, 7);
});

test("computeDealStatus: ongoing, ending soon, ended, not started, and unknown deadline is not ongoing", () => {
  assert.equal(computeDealStatus({ endAt: "2026-12-31" }, now), "进行中");
  assert.equal(computeDealStatus({ endAt: "2026-11-15" }, now), "即将结束");
  assert.equal(computeDealStatus({ endAt: "2026-11-13" }, now), "即将结束");
  assert.equal(computeDealStatus({ endAt: "2026-11-12" }, now), "已结束");
  assert.equal(computeDealStatus({ endAt: null }, now), "截止时间未知");
  assert.equal(computeDealStatus({}, now), "截止时间未知");
  assert.equal(computeAvailabilityStatus({ startAt: "2026-11-20", endAt: "2026-12-31" }, now), "未开始");
  assert.notEqual(computeDealStatus({ endAt: null }, now), "进行中");
});

test("date-only endAt uses Asia/Shanghai end of day", () => {
  const end = parseDealDate("2026-11-12", "end");
  assert.ok(end instanceof Date);
  assert.equal(end.toISOString(), new Date("2026-11-12T23:59:59.999+08:00").toISOString());
  assert.equal(computeDealStatus({ endAt: "2026-11-12" }, new Date("2026-11-12T23:50:00+08:00")), "即将结束");
  assert.equal(computeDealStatus({ endAt: "2026-11-12" }, new Date("2026-11-13T00:00:01+08:00")), "已结束");
});

test("no deadline shows 截止时间未知 or 长期有效, never 进行中", () => {
  const unknown = sample({ id: "open-once", claimFrequency: "一次性", endAt: null });
  const loaded = loadDealTable({ schemaVersion: 2, deals: [unknown] }, { now });
  assert.equal(loaded.deals[0].availabilityStatus, "截止时间未知");
  assert.notEqual(loaded.deals[0].status, "进行中");
  assert.equal(formatDeadline(loaded.deals[0], now), UNKNOWN_DEADLINE_LABEL);
  assert.equal(formatAvailabilityLabel(loaded.deals[0], now), UNKNOWN_DEADLINE_LABEL);

  const longTerm = sample({
    id: "open-long",
    title: "长期免费额度",
    type: "免费额度",
    claimFrequency: "长期免费",
    verificationStatus: "已核验",
    endAt: null
  });
  const longLoaded = loadDealTable({ schemaVersion: 2, deals: [longTerm] }, { now });
  assert.equal(longLoaded.deals[0].availabilityStatus, "截止时间未知");
  assert.equal(formatAvailabilityLabel(longLoaded.deals[0], now), LONG_TERM_VALID_LABEL);
  assert.equal(formatDeadline(longLoaded.deals[0], now), LONG_TERM_VALID_LABEL);
});

test("expired deals become 已结束; ended is not automatically 已失效", () => {
  const table = loadDealTable({
    schemaVersion: 2,
    deals: [sample({ id: "ended", startAt: "2026-09-01", endAt: "2026-10-01", verificationStatus: "已核验" })]
  }, { now });
  assert.equal(table.deals[0].availabilityStatus, "已结束");
  assert.equal(table.deals[0].verificationStatus, "已核验");
});

test("pending verification stays pending; stale verified becomes 需重新核验 and is not ranked as confirmed", () => {
  assert.equal(resolveVerificationStatus(sample({ verificationStatus: "待核验" }), now), "待核验");
  assert.equal(resolveVerificationStatus(sample({ verificationStatus: "已失效" }), now), "已失效");
  assert.equal(resolveVerificationStatus(sample({ verificationStatus: "已核验", verifiedAt: "2026-11-12" }), now), "已核验");

  const staleNow = new Date("2026-11-19T00:00:01+08:00");
  assert.equal(resolveVerificationStatus(sample({ verificationStatus: "已核验", verifiedAt: "2026-11-12" }), staleNow), "需重新核验");

  const table = loadDealTable({
    schemaVersion: 2,
    deals: [
      sample({
        id: "stale-daily",
        title: "过期核验的每日项",
        claimFrequency: "每日",
        verificationStatus: "已核验",
        verifiedAt: "2026-11-01",
        endAt: "2026-11-20"
      }),
      sample({
        id: "pending-end",
        title: "待核验却临期",
        claimFrequency: "限时活动",
        verificationStatus: "待核验",
        endAt: "2026-11-15"
      }),
      sample({
        id: "confirmed-end",
        title: "已确认即将结束",
        claimFrequency: "限时活动",
        verificationStatus: "已核验",
        verifiedAt: "2026-11-12",
        endAt: "2026-11-15"
      }),
      sample({
        id: "confirmed-daily",
        title: "已确认每日可领",
        claimFrequency: "每日",
        verificationStatus: "已核验",
        verifiedAt: "2026-11-12",
        endAt: "2026-12-31"
      }),
      sample({
        id: "dead",
        title: "已失效条目",
        claimFrequency: "每日",
        verificationStatus: "已失效",
        endAt: "2026-12-31"
      })
    ]
  }, { now });

  assert.equal(table.deals.find((d) => d.id === "stale-daily").verificationStatus, "需重新核验");
  assert.equal(table.deals.find((d) => d.id === "pending-end").verificationStatus, "待核验");
  const ids = table.deals.map((d) => d.id);
  const confirmedDaily = ids.indexOf("confirmed-daily");
  const confirmedEnd = ids.indexOf("confirmed-end");
  assert.ok(confirmedEnd < ids.indexOf("stale-daily"));
  assert.ok(confirmedEnd < ids.indexOf("pending-end"));
  assert.ok(confirmedEnd < ids.indexOf("dead"));
  assert.ok(confirmedDaily < ids.indexOf("stale-daily"));
  assert.ok(confirmedDaily < ids.indexOf("pending-end"));
  assert.ok(confirmedDaily < ids.indexOf("dead"));
  assert.equal(ids[0], "confirmed-end");

  const groups = groupDealsForHome(table.deals);
  const featured = new Set(groups.filter((g) => g.id === "ending" || g.id === "daily").flatMap((g) => g.items.map((d) => d.id)));
  assert.ok(featured.has("confirmed-end"));
  assert.ok(featured.has("confirmed-daily"));
  assert.ok(!featured.has("stale-daily"));
  assert.ok(!featured.has("pending-end"));
  assert.ok(!featured.has("dead"));
});

test("invalid entries are dropped and do not appear in deals", () => {
  const table = loadDealTable({
    schemaVersion: 2,
    deals: [
      sample({ id: "good-1", title: "有效活动", endAt: "2026-11-15" }),
      sample({ id: "bad-type", type: "返利" }),
      sample({ id: "bad-url", sourceUrl: "not-a-url" }),
      { title: "缺字段" },
      sample({ id: "bad-date", endAt: "明年夏天" }),
      sample({ id: "good-1", title: "重复 id" }),
      sample({ id: "missing-entry", officialEntryUrl: "" }),
      sample({ id: "bad-freq", claimFrequency: "随时" })
    ]
  }, { now });
  assert.equal(table.deals.length, 1);
  assert.equal(table.deals[0].id, "good-1");
  assert.equal(table.dropped.length, 7);
  const reasons = table.dropped.map((d) => d.errors.join(",")).join(" | ");
  assert.match(reasons, /type 无效/);
  assert.match(reasons, /sourceUrl/);
  assert.match(reasons, /缺少/);
  assert.match(reasons, /日期无效/);
  assert.match(reasons, /重复的 id/);
  assert.match(reasons, /officialEntryUrl/);
  assert.match(reasons, /claimFrequency 无效/);
});

test("sortDeals puts confirmed ending soon first; long-term free with no deadline is not 进行中", () => {
  const table = loadDealTable({
    deals: [
      sample({ id: "ended", title: "已结束活动", startAt: "2026-09-01", endAt: "2026-10-01" }),
      sample({ id: "open", title: "长期免费额度", type: "免费额度", claimFrequency: "长期免费", endAt: null }),
      sample({ id: "later", title: "年底活动", endAt: "2026-12-31" }),
      sample({ id: "soon-b", title: "后天截止乙", endAt: "2026-11-15" }),
      sample({ id: "soon-a", title: "明天截止甲", endAt: "2026-11-14" })
    ]
  }, { now });
  assert.deepEqual(table.deals.map((d) => d.id), ["soon-a", "soon-b", "later", "open", "ended"]);
  assert.deepEqual(table.deals.map((d) => d.availabilityStatus), ["即将结束", "即将结束", "进行中", "截止时间未知", "已结束"]);
  assert.equal(formatAvailabilityLabel(table.deals.find((d) => d.id === "open"), now), LONG_TERM_VALID_LABEL);
});

test("formatDeadline shows 截止时间未知 when endAt is null and not long-term verified", () => {
  assert.equal(formatDeadline({ endAt: null, availabilityStatus: "截止时间未知", claimFrequency: "一次性" }, now), UNKNOWN_DEADLINE_LABEL);
  assert.match(formatDeadline({ endAt: "2026-11-15", availabilityStatus: "即将结束" }, now), /剩余/);
  assert.match(formatDeadline({ endAt: "2026-10-01", availabilityStatus: "已结束" }, now), /已于 2026-10-01 结束/);
});

test("filterDeals applies combined conditions", () => {
  const table = loadDealTable(raw, { now });
  const domesticOnce = filterDeals(table.deals, {
    region: "国内",
    claimFrequency: "一次性",
    verificationStatus: "已核验",
    hideEnded: true
  });
  assert.ok(domesticOnce.length >= 1);
  for (const d of domesticOnce) {
    assert.equal(d.region, "国内");
    assert.equal(d.claimFrequency, "一次性");
    assert.equal(d.verificationStatus, "已核验");
    assert.notEqual(d.availabilityStatus, "已结束");
  }
  const longFree = filterDeals(table.deals, { claimFrequency: "长期免费", type: "折扣" });
  assert.ok(longFree.every((d) => d.claimFrequency === "长期免费" && d.type === "折扣"));
  assert.ok(longFree.some((d) => d.id === "anthropic-batches-discount" || d.id === "deepseek-offpeak"));
  const none = filterDeals(table.deals, { type: "邀请奖励", region: "国际" });
  assert.equal(none.length, 0);
  const ending = filterDeals(table.deals, { availabilityStatus: "即将结束" });
  assert.ok(ending.every((d) => d.availabilityStatus === "即将结束"));
});

test("dealClaimButton distinguishes auto credit, official claim, and unsupported", () => {
  const official = dealClaimButton({ claimAction: "去官方领取", officialEntryUrl: "https://example.invalid/claim" });
  assert.equal(official.kind, "official");
  assert.equal(official.enabled, true);
  assert.equal(official.label, "去官方领取");
  assert.equal(official.openOfficial, true);

  const officialMissing = dealClaimButton({ claimAction: "去官方领取", officialEntryUrl: "" });
  assert.equal(officialMissing.kind, "unsupported");
  assert.equal(officialMissing.enabled, false);
  assert.notEqual(officialMissing.label, "去官方领取");
  assert.equal(officialMissing.openOfficial, false);

  const auto = dealClaimButton({ claimAction: "自动到账", officialEntryUrl: "https://example.invalid/console" });
  assert.equal(auto.kind, "auto");
  assert.equal(auto.enabled, false);
  assert.equal(auto.label, "自动到账");
  assert.equal(auto.openOfficial, true);
  assert.equal(auto.officialLabel, "打开官网");
  assert.match(auto.note, /官方发放|登录/);
  assert.doesNotMatch(auto.note, /已领取成功/);
  assert.notEqual(auto.label, "去官方领取");

  const blocked = dealClaimButton({ claimAction: "暂不支持", officialEntryUrl: "https://example.invalid/claim" });
  assert.equal(blocked.kind, "unsupported");
  assert.equal(blocked.enabled, false);
  assert.equal(blocked.openOfficial, false);
  assert.equal(blocked.label, "暂不支持");
});

test("one-time deals are grouped separately and never appear under 每日可领", () => {
  const table = loadDealTable(raw, { now });
  const groups = groupDealsForHome(table.deals);
  const daily = groups.find((g) => g.id === "daily");
  const onetime = groups.find((g) => g.id === "onetime");
  assert.ok(onetime && onetime.items.length >= 1);
  assert.ok(onetime.items.every((d) => d.claimFrequency === "一次性"));
  if (daily) {
    assert.ok(daily.items.every((d) => d.claimFrequency === "每日"));
    const dailyIds = new Set(daily.items.map((d) => d.id));
    for (const d of onetime.items) assert.ok(!dailyIds.has(d.id));
  }
});

test("validateDeal rejects unknown region and inverted dates", () => {
  const region = validateDeal(sample({ region: "全球" }));
  assert.equal(region.ok, false);
  const dates = validateDeal(sample({ startAt: "2026-12-31", endAt: "2026-01-01" }));
  assert.equal(dates.ok, false);
  assert.match(dates.errors.join(","), /startAt 晚于 endAt/);
});

test("loadDealTable rejects malformed input", () => {
  assert.throws(() => loadDealTable({}), /deals/);
});

test("sortDeals can be called independently", () => {
  const sorted = sortDeals([
    { id: "b", title: "B", status: "进行中", availabilityStatus: "进行中", verificationStatus: "已核验", endAt: null },
    { id: "a", title: "A", status: "即将结束", availabilityStatus: "即将结束", verificationStatus: "已核验", endAt: "2026-11-14" }
  ]);
  assert.equal(sorted[0].id, "a");
});
