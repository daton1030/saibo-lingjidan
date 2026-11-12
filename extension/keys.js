/** chrome.storage.local 键名。不要改用 storage.sync，以免令牌被同步到其他设备或云端。 */
export const KEY_PREFIX = "saibo.apiKey.";

export function storageKeyFor(platformId) {
  return KEY_PREFIX + platformId;
}

/**
 * @param {string} platformId
 * @returns {Promise<string>}
 */
export async function readApiKey(platformId) {
  const key = storageKeyFor(platformId);
  const bag = await chrome.storage.local.get(key);
  const value = bag[key];
  return typeof value === "string" ? value : "";
}

/**
 * @param {string} platformId
 * @param {string} token
 */
export async function writeApiKey(platformId, token) {
  const key = storageKeyFor(platformId);
  const trimmed = String(token || "").trim();
  if (!trimmed) {
    await chrome.storage.local.remove(key);
    return;
  }
  await chrome.storage.local.set({ [key]: trimmed });
}

export async function deleteApiKey(platformId) {
  await chrome.storage.local.remove(storageKeyFor(platformId));
}

export async function hasApiKey(platformId) {
  const value = await readApiKey(platformId);
  return value.length > 0;
}

/**
 * 只返回是否已保存，绝不返回令牌本身。
 */
export async function keyStatusMap(ids) {
  const out = {};
  for (const id of ids) out[id] = await hasApiKey(id);
  return out;
}
