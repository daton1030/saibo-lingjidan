import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  checkin,
  getBalance,
  parseBalanceResponse,
  productInfo,
  MODELSCOPE_BALANCE_PATH
} from "../adapters/modelscope.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
const load = (name) => JSON.parse(readFileSync(join(fixtures, name), "utf8"));
const frozenNow = () => new Date("2026-11-11T05:43:00.000Z");

test("productInfo points at official OpenAPI and token page", () => {
  assert.equal(productInfo.id, "modelscope");
  assert.equal(productInfo.checkinSupported, false);
  assert.ok(productInfo.docs.includes("https://modelscope.cn/.well-known/openapi.json"));
  assert.equal(productInfo.tokenPage, "https://modelscope.cn/my/myaccesstoken");
  assert.equal(MODELSCOPE_BALANCE_PATH, "/openapi/v1/magicubes/balance");
});

test("checkin is unsupported and never claims success", async () => {
  const result = await checkin();
  assert.equal(result.claimed, false);
  assert.equal(result.status, "unsupported");
  assert.equal(result.pointsAwarded, null);
  assert.ok(result.ok);
  assert.match(result.message, /没有每日签到/);
});

test("parses official OpenAPI example balance", () => {
  const json = load("modelscope-balance-ok.json");
  const bal = parseBalanceResponse(json, { now: frozenNow });
  assert.equal(bal.points, 998.5);
  assert.equal(bal.unit, "魔粒");
  assert.equal(bal.source, "official_api");
  assert.equal(bal.expiresAt, null);
  assert.equal(bal.updatedAt, "2026-11-11T05:43:00.000Z");
  assert.equal(bal.meta.total_balance, 1000);
  assert.equal(bal.meta.frozen_amount, 1.5);
  assert.equal(bal.meta.request_id, "c55709d2-4e09-4bd8-be84-d8518bc46363");
});

test("parses schema example with different totals", () => {
  const json = load("modelscope-balance-ok-schema-example.json");
  const bal = parseBalanceResponse(json, { now: frozenNow });
  assert.equal(bal.points, 1300);
  assert.equal(bal.meta.total_balance, 1500);
  assert.equal(bal.meta.frozen_amount, 200);
});

test("success:false does not become a zero balance", () => {
  const json = load("modelscope-balance-fail.json");
  const bal = parseBalanceResponse(json, { now: frozenNow });
  assert.equal(bal.points, null);
  assert.equal(bal.source, "unread");
  assert.match(bal.message, /invalid token|尚未读取/);
});

test("missing data is unread, not zero", () => {
  const json = load("modelscope-balance-missing-data.json");
  const bal = parseBalanceResponse(json, { now: frozenNow });
  assert.equal(bal.points, null);
  assert.equal(bal.source, "unread");
  assert.match(bal.message, /尚未读取/);
});

test("HTTP 401 is unread with a token hint and no invented points", () => {
  const bal = parseBalanceResponse({}, { now: frozenNow, httpStatus: 401 });
  assert.equal(bal.points, null);
  assert.equal(bal.source, "unread");
  assert.match(bal.message, /访问令牌/);
});

test("getBalance without a key does not call the network", async () => {
  let called = 0;
  const bal = await getBalance({
    apiKey: "  ",
    now: frozenNow,
    fetchImpl: async () => {
      called += 1;
      throw new Error("should not fetch");
    }
  });
  assert.equal(called, 0);
  assert.equal(bal.points, null);
  assert.match(bal.message, /尚未配置/);
});

test("getBalance uses official path and Bearer header, and never echoes the key", async () => {
  const secret = "ms-FIXTURE-NOT-A-REAL-KEY";
  let seenUrl = "";
  let seenAuth = "";
  const fixture = load("modelscope-balance-ok.json");
  const bal = await getBalance({
    apiKey: secret,
    now: frozenNow,
    fetchImpl: async (url, init) => {
      seenUrl = String(url);
      seenAuth = init.headers.Authorization;
      return {
        status: 200,
        json: async () => fixture
      };
    }
  });
  assert.equal(seenUrl, "https://modelscope.cn/openapi/v1/magicubes/balance");
  assert.equal(seenAuth, "Bearer " + secret);
  assert.equal(bal.points, 998.5);
  const dumped = JSON.stringify(bal);
  assert.equal(dumped.includes(secret), false);
  assert.equal(dumped.includes("FIXTURE-NOT-A-REAL-KEY"), false);
});

test("network failure is unread and redacts Bearer tokens in the message", async () => {
  const bal = await getBalance({
    apiKey: "ms-secret",
    now: frozenNow,
    fetchImpl: async () => {
      throw new Error("connect failed Bearer ms-secret");
    }
  });
  assert.equal(bal.points, null);
  assert.equal(bal.source, "unread");
  assert.equal(bal.message.includes("ms-secret"), false);
  assert.match(bal.message, /redacted|失败|尚未读取/i);
});
