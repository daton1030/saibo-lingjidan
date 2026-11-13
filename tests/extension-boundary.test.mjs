import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { PAGE_ORIGIN_ALLOWLIST } from "../scheduler/official-page.js";

const root = new URL("../", import.meta.url);

function read(path) {
  return readFileSync(new URL(path, root), "utf8");
}

test("extension host access stays on a strict allowlist", () => {
  const manifest = JSON.parse(read("extension/manifest.json"));
  assert.deepEqual(manifest.content_scripts[0].matches, ["http://localhost/*", "http://127.0.0.1/*"]);
  assert.deepEqual(manifest.host_permissions, ["https://modelscope.cn/*"]);
  assert.deepEqual(manifest.optional_host_permissions || [], PAGE_ORIGIN_ALLOWLIST.map((origin) => origin.replace(/\/$/, "") + "/*"));
  assert.equal(JSON.stringify(manifest).includes("<all_urls>"), false);
  assert.ok(manifest.permissions.includes("storage"));
  assert.ok(manifest.permissions.includes("alarms"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.equal(manifest.permissions.includes("cookies"), false);
  assert.equal(manifest.permissions.includes("tabs"), false);
});

test("extension code does not sync tokens or read cookies", () => {
  const files = [
    "extension/background.js",
    "extension/content.js",
    "extension/keys.js",
    "extension/options.js",
    "extension/official-click.js",
    "extension/popup.js"
  ];
  const combined = files.map((file) => read(file)).join("\n");
  assert.equal(/chrome\.storage\.sync/.test(combined), false);
  assert.equal(combined.includes("chrome.cookies"), false);
  assert.equal(combined.includes("document.cookie"), false);
  assert.equal(combined.includes("<all_urls>"), false);
  assert.match(read("extension/background.js"), /getAdapter\(payload\.platformId\)\.checkin\(\)/);
  assert.match(read("extension/keys.js"), /chrome\.storage\.local/);
});

test("dashboard real actions stay off the simulated check-in path", () => {
  const page = read("web/index.html");
  assert.match(page, /id="authorizeClaimBtn"/);
  assert.match(page, /id="revokeClaimBtn"/);
  assert.match(page, /id="runOnceBtn"/);
  assert.match(page, /id="dailyClaimBtn"/);
  assert.match(page, /公开页不能自动领取/);
  assert.match(page, /我已在官网完成登录/);
  assert.match(page, /没有统一扫码页/);
  const loginFn = read("extension/background.js");
  const openLogin = loginFn.slice(loginFn.indexOf("async function openOfficialLogin"), loginFn.indexOf("async function confirmPlatformLogin"));
  assert.equal(openLogin.includes("permissions"), false);
  assert.equal(openLogin.includes("cookie"), false);
  assert.equal(openLogin.includes("document.cookie"), false);
  assert.match(page, /mutateClaim\("runClaimOnce"\)/);
  assert.equal(page.includes("startCheckin(\"runClaimOnce\")"), false);
  const checkin = page.slice(page.indexOf("function startCheckin"), page.indexOf("function formatBalance"));
  const demoGate = checkin.indexOf("if (!demoMode)");
  const claimedWrite = checkin.indexOf('current.status = "claimed"');
  assert.ok(demoGate > 0);
  assert.ok(claimedWrite > demoGate);
});
