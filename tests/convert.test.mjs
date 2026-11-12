import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { estimateValue, loadRateTable, getPlatformRate } from "../adapters/convert.js";
import { NO_OFFICIAL_PRICE } from "../adapters/types.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const table = loadRateTable(readFileSync(join(root, "rates/rates.json"), "utf8"));

test("loadRateTable exposes modelscope and marks estimate unavailable", () => {
  const rate = getPlatformRate(table, "modelscope");
  assert.ok(rate);
  assert.equal(rate.estimateAvailable, false);
  assert.equal(rate.pointsToToken, null);
  assert.equal(rate.pricePerMillionTokens, null);
  assert.equal(rate.reason, NO_OFFICIAL_PRICE);
});

test("modelscope official per-call billing is recorded but not used as ¥ estimate", () => {
  const rate = getPlatformRate(table, "modelscope");
  const result = estimateValue(998.5, rate);
  assert.equal(result.ok, false);
  assert.equal(result.estimate, false);
  assert.equal(result.tokens, null);
  assert.equal(result.cny, null);
  assert.equal(result.reason, NO_OFFICIAL_PRICE);
  assert.equal(rate.officialBilling.model, "per_call");
  assert.equal(rate.officialBilling.sourceUrl, "https://modelscope.cn/posts/435591");
});

test("null points does not become a zero-yuan estimate", () => {
  const rate = getPlatformRate(table, "modelscope");
  const result = estimateValue(null, rate);
  assert.equal(result.ok, false);
  assert.equal(result.tokens, null);
  assert.equal(result.cny, null);
  assert.equal(result.reason, "尚未读取余额，不估值");
});

test("invalid points are rejected", () => {
  const r = estimateValue(-1, { estimateAvailable: true, pointsToToken: 10, pricePerMillionTokens: 1 });
  assert.equal(r.ok, false);
  assert.match(r.reason, /无效/);
});

test("when official points→Token and ¥/MTok are present, compute and mark as 估算", () => {
  const rate = {
    estimateAvailable: true,
    pointsToToken: 2,
    pricePerMillionTokens: 8,
    officialBilling: { sourceUrl: "https://example.invalid/official-price" },
    updatedAt: "2026-11-11"
  };
  const result = estimateValue(100, rate);
  assert.equal(result.ok, true);
  assert.equal(result.estimate, true);
  assert.equal(result.tokens, 200);
  assert.equal(result.cny, 0.0016);
  assert.equal(result.sourceUrl, "https://example.invalid/official-price");
});

test("estimateAvailable true but missing a factor still refuses to invent a price", () => {
  const result = estimateValue(100, {
    estimateAvailable: true,
    pointsToToken: 2,
    pricePerMillionTokens: null
  });
  assert.equal(result.ok, false);
  assert.equal(result.cny, null);
  assert.equal(result.reason, NO_OFFICIAL_PRICE);
});

test("unknown platform has no rate and is not valued", () => {
  assert.equal(getPlatformRate(table, "not-a-platform"), null);
  const result = estimateValue(10, getPlatformRate(table, "not-a-platform"));
  assert.equal(result.ok, false);
  assert.equal(result.reason, NO_OFFICIAL_PRICE);
});

test("loadRateTable rejects malformed input", () => {
  assert.throws(() => loadRateTable({}), /platforms/);
});
