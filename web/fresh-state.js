/**
 * 检测 ?fresh=1 并持久清除本页允许的本机状态键。
 * 只清除卡片演示状态和羊毛本机标记，不影响 ?demo=1，也不会清空浏览器里的其他数据。
 */
export const CARD_STORAGE_KEY = "saibo-lingjidan-demo-v2";
export const DEAL_STORAGE_KEY = "saibo-lingjidan-deals-v1";
export const FRESH_STORAGE_KEYS = Object.freeze([CARD_STORAGE_KEY, DEAL_STORAGE_KEY]);

/**
 * @param {string} [search] location.search、`fresh=1` 或完整 URL
 */
export function isFreshRequested(search) {
  let s = String(search == null ? "" : search);
  try {
    if (/^https?:\/\//i.test(s)) s = new URL(s).search;
  } catch {
    /* use raw string */
  }
  const q = new URLSearchParams(s);
  return q.has("fresh") && q.get("fresh") !== "0";
}

/**
 * 若 URL 带 fresh（且不是 fresh=0），从给定 storage 中 removeItem 指定键。
 * @param {string} search
 * @param {{ removeItem: (key: string) => void }} storage
 * @param {readonly string[]} [keys]
 * @returns {{ cleared: boolean, keys: string[] }}
 */
export function applyFreshStorage(search, storage, keys = FRESH_STORAGE_KEYS) {
  if (!isFreshRequested(search)) return { cleared: false, keys: [] };
  const cleared = [];
  for (const key of keys) {
    try {
      storage.removeItem(key);
      cleared.push(key);
    } catch {
      /* ignore quota / private mode */
    }
  }
  return { cleared: true, keys: cleared };
}
