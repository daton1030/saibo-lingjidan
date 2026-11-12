import assert from "node:assert/strict";
import { test } from "node:test";
import { planSchedule } from "../scheduler/shell.js";

test("plans serial runs in Asia/Shanghai and skips already claimed or unsupported", () => {
  const now = new Date("2026-11-11T08:00:00+08:00");
  const plan = planSchedule(
    [
      { id: "a", checkinSupported: true, claimedToday: false },
      { id: "b", checkinSupported: true, claimedToday: true },
      { id: "modelscope", checkinSupported: false, claimedToday: false },
      { id: "c", checkinSupported: true, claimedToday: false }
    ],
    { now, timezone: "Asia/Shanghai" }
  );
  assert.equal(plan.timezone, "Asia/Shanghai");
  assert.deepEqual(plan.toRun.map((x) => x.id), ["a", "c"]);
  assert.deepEqual(plan.skipped.map((x) => x.id), ["b", "modelscope"]);
  assert.equal(plan.serial, true);
  assert.equal(plan.abortAllOnFailure, false);
});
