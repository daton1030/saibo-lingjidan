import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  CARD_STORAGE_KEY,
  DEAL_STORAGE_KEY,
  FRESH_STORAGE_KEYS,
  applyFreshStorage,
  isFreshRequested
} from "../web/fresh-state.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    removeItem(key) { delete data[key]; },
    getItem(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setItem(key, value) { data[key] = String(value); }
  };
}

test("isFreshRequested recognizes fresh=1 and ignores demo=1", () => {
  assert.equal(isFreshRequested("?fresh=1"), true);
  assert.equal(isFreshRequested("fresh=1"), true);
  assert.equal(isFreshRequested("?fresh=1&guide=0"), true);
  assert.equal(isFreshRequested("?demo=1&fresh=1"), true);
  assert.equal(isFreshRequested("https://saibo-lingjidan.surge.sh/?fresh=1&guide=0"), true);
  assert.equal(isFreshRequested("?fresh"), true);
  assert.equal(isFreshRequested(""), false);
  assert.equal(isFreshRequested("?guide=0"), false);
  assert.equal(isFreshRequested("?demo=1&guide=0"), false);
  assert.equal(isFreshRequested("?fresh=0"), false);
});

test("applyFreshStorage persistently clears only the page keys when fresh=1", () => {
  const storage = memoryStorage({
    [CARD_STORAGE_KEY]: JSON.stringify({ cards: [{ id: "meeo", status: "claimed" }] }),
    [DEAL_STORAGE_KEY]: JSON.stringify({ claimed: { "kimi-api-trial": true }, skipped: {} }),
    "unrelated-key": "keep-me"
  });

  const skipped = applyFreshStorage("?guide=0", storage);
  assert.equal(skipped.cleared, false);
  assert.equal(storage.getItem(CARD_STORAGE_KEY) != null, true);
  assert.equal(storage.getItem("unrelated-key"), "keep-me");

  const demoOnly = applyFreshStorage("?demo=1&guide=0", storage);
  assert.equal(demoOnly.cleared, false);
  assert.equal(storage.getItem(DEAL_STORAGE_KEY) != null, true);

  const cleared = applyFreshStorage("?fresh=1&guide=0", storage);
  assert.equal(cleared.cleared, true);
  assert.deepEqual(cleared.keys, [...FRESH_STORAGE_KEYS]);
  assert.equal(storage.getItem(CARD_STORAGE_KEY), null);
  assert.equal(storage.getItem(DEAL_STORAGE_KEY), null);
  assert.equal(storage.getItem("unrelated-key"), "keep-me");

  // A later visit without fresh=1 must not see the old values (they were removed, not merely skipped).
  const later = applyFreshStorage("?guide=0", storage);
  assert.equal(later.cleared, false);
  assert.equal(storage.getItem(CARD_STORAGE_KEY), null);
  assert.equal(storage.getItem(DEAL_STORAGE_KEY), null);
});

test("page wiring still clears both keys instead of only skipping reads", () => {
  const html = readFileSync(join(root, "web/index.html"), "utf8");
  assert.match(html, /function isFreshRequested\(/);
  assert.match(html, /function applyFreshStorage\(/);
  assert.match(html, /function clearFreshLocalState\(/);
  assert.match(html, /clearFreshLocalState\(\)/);
  assert.match(html, /storage\.removeItem\(key\)/);
  assert.match(html, /applyFreshStorage\(location\.search, localStorage, \[STORAGE_KEY, DEAL_STORAGE_KEY\]\)/);
  assert.doesNotMatch(
    html,
    /function loadState\(\) \{\s*cards = DEFAULT_CARDS\.map\(\(c\) => \(\{ \.\.\.c \}\)\);\s*if \(freshRequested\(\)\) return;/
  );
  assert.doesNotMatch(
    html,
    /function loadDealMarks\(\) \{\s*if \(freshRequested\(\)\) \{\s*dealMarks = \{ claimed: \{\}, skipped: \{\} \};\s*return;/
  );
});
