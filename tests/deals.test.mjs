import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  computeDealStatus,
  formatDeadline,
  loadDealTable,
  parseDealDate,
  sortDeals,
  validateDeal,
  UNKNOWN_DEADLINE_LABEL
} from "../deals/deals.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const raw = readFileSync(join(root, "deals/deals.json"), "utf8");

const now = new Date("2026-11-12T12:00:00+08:00");

function sample(overrides = {}) {
  return {
    id: "sample-deal",
    vendor: "示例厂商",
    title: "示例优惠",
    type: "活动",
    summary: "用于单元测试的合法条目。",
    conditions: "测试条件",
    region: "国内",
    startAt: "2026-11-01",
    endAt: "2026-12-01",
    sourceUrl: "https://example.invalid/official",
    officialEntryUrl: "https://example.invalid/claim",
    verifiedAt: "2026-11-12",
    ...overrides
  };
}

test("seeded deals.json loads with no dropped entries and official source URLs", () => {
  const table = loadDealTable(raw, { now });
  assert.equal(table.schemaVersion, 1);
  assert.equal(table.updatedAt, "2026-11-12");
  assert.equal(table.dropped.length, 0);
  assert.ok(table.deals.length >= 6);
  for (const deal of table.deals) {
    assert.match(deal.sourceUrl, /^https?:\/\//);
    assert.match(deal.officialEntryUrl, /^https?:\/\//);
    assert.equal(deal.verifiedAt, "2026-11-12");
    assert.ok(["进行中", "即将结束", "已结束"].includes(deal.status));
  }
});

test("computeDealStatus: ongoing, ending soon within 3 days, and ended", () => {
  assert.equal(computeDealStatus({ endAt: "2026-12-31" }, now), "进行中");
  assert.equal(computeDealStatus({ endAt: "2026-11-14" }, now), "即将结束");
  assert.equal(computeDealStatus({ endAt: "2026-11-12" }, now), "即将结束");
  assert.equal(computeDealStatus({ endAt: "2026-11-11" }, now), "已结束");
  assert.equal(computeDealStatus({ endAt: null }, now), "进行中");
  assert.equal(computeDealStatus({}, now), "进行中");
});

test("date-only endAt uses Asia/Shanghai end of day", () => {
  const end = parseDealDate("2026-11-12", "end");
  assert.ok(end instanceof Date);
  assert.equal(end.toISOString(), new Date("2026-11-12T23:59:59.999+08:00").toISOString());
  assert.equal(computeDealStatus({ endAt: "2026-11-12" }, new Date("2026-11-12T23:50:00+08:00")), "即将结束");
  assert.equal(computeDealStatus({ endAt: "2026-11-12" }, new Date("2026-11-13T00:00:01+08:00")), "已结束");
});

test("invalid entries are dropped and do not appear in deals", () => {
  const table = loadDealTable({
    schemaVersion: 1,
    deals: [
      sample({ id: "good-1", title: "有效活动", endAt: "2026-11-14" }),
      sample({ id: "bad-type", type: "返利" }),
      sample({ id: "bad-url", sourceUrl: "not-a-url" }),
      { title: "缺字段" },
      sample({ id: "bad-date", endAt: "明年夏天" }),
      sample({ id: "good-1", title: "重复 id" }),
      sample({ id: "missing-entry", officialEntryUrl: "" })
    ]
  }, { now });
  assert.equal(table.deals.length, 1);
  assert.equal(table.deals[0].id, "good-1");
  assert.equal(table.dropped.length, 6);
  const reasons = table.dropped.map((d) => d.errors.join(",")).join(" | ");
  assert.match(reasons, /type 无效/);
  assert.match(reasons, /sourceUrl/);
  assert.match(reasons, /缺少/);
  assert.match(reasons, /日期无效/);
  assert.match(reasons, /重复的 id/);
  assert.match(reasons, /officialEntryUrl/);
});

test("sortDeals puts ending soon first, then ongoing with earlier deadlines, unknown deadlines later, ended last", () => {
  const table = loadDealTable({
    deals: [
      sample({ id: "ended", title: "已结束活动", startAt: "2026-09-01", endAt: "2026-10-01" }),
      sample({ id: "open", title: "长期免费额度", type: "免费额度", endAt: null }),
      sample({ id: "later", title: "年底活动", endAt: "2026-12-31" }),
      sample({ id: "soon-b", title: "后天截止乙", endAt: "2026-11-14" }),
      sample({ id: "soon-a", title: "明天截止甲", endAt: "2026-11-13" })
    ]
  }, { now });
  assert.deepEqual(table.deals.map((d) => d.id), ["soon-a", "soon-b", "later", "open", "ended"]);
  assert.deepEqual(table.deals.map((d) => d.status), ["即将结束", "即将结束", "进行中", "进行中", "已结束"]);
});

test("formatDeadline shows 截止时间未知 when endAt is null", () => {
  assert.equal(formatDeadline({ endAt: null, status: "进行中" }, now), UNKNOWN_DEADLINE_LABEL);
  assert.match(formatDeadline({ endAt: "2026-11-14", status: "即将结束" }, now), /剩余/);
  assert.match(formatDeadline({ endAt: "2026-10-01", status: "已结束" }, now), /已于 2026-10-01 结束/);
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
    { id: "b", title: "B", status: "进行中", endAt: null },
    { id: "a", title: "A", status: "即将结束", endAt: "2026-11-13" }
  ]);
  assert.equal(sorted[0].id, "a");
});
