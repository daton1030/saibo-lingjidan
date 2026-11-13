import { modelscopeAdapter } from "./modelscope.js";
import { createMockAdapter } from "./mock.js";
import { estimateValue, loadRateTable, getPlatformRate } from "./convert.js";
import { UNREAD_LABEL, NO_OFFICIAL_PRICE, unreadBalance } from "./types.js";
import { CLAIM_REVIEWS, platformsForSchedule, reviewById, VERIFICATION_DATE } from "./claim-catalog.js";

const registry = new Map();
registry.set("modelscope", modelscopeAdapter);

/**
 * 按 id 取适配器；未知平台返回官方领取桩，避免误走非公开接口。
 * @param {string} id
 */
export function getAdapter(id) {
  if (registry.has(id)) return registry.get(id);
  return createMockAdapter({ id, name: id, claimPath: "official_only" });
}

export function listAdapters() {
  return [...registry.values()].map((a) => a.productInfo);
}

export function registerAdapter(adapter) {
  const id = adapter?.productInfo?.id;
  if (!id) throw new Error("适配器缺少 productInfo.id");
  registry.set(id, adapter);
}

export {
  modelscopeAdapter,
  createMockAdapter,
  estimateValue,
  loadRateTable,
  getPlatformRate,
  UNREAD_LABEL,
  NO_OFFICIAL_PRICE,
  unreadBalance,
  CLAIM_REVIEWS,
  platformsForSchedule,
  reviewById,
  VERIFICATION_DATE
};
