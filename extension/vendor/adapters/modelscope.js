import { unreadBalance, safeErrorMessage } from "./types.js";

/** 官方 OpenAPI 基址。规范见 https://modelscope.cn/.well-known/openapi.json */
export const MODELSCOPE_DEFAULT_BASE = "https://modelscope.cn";
export const MODELSCOPE_BALANCE_PATH = "/openapi/v1/magicubes/balance";

export const productInfo = {
  id: "modelscope",
  name: "魔搭社区",
  vendor: "ModelScope",
  unit: "魔粒",
  checkinSupported: false,
  checkinNote:
    "魔搭没有每日签到接口。官方说明：注册并登录后每日魔粒自动到账。本适配器不会模拟登录，也不会调用非公开接口。",
  claimPath: "official_api",
  docs: [
    "https://modelscope.cn/.well-known/openapi.json",
    "https://modelscope.cn/posts/435591"
  ],
  tokenPage: "https://modelscope.cn/my/myaccesstoken",
  usagePage: "https://modelscope.cn/magicube/usage",
  officialHome: "https://modelscope.cn"
};

/**
 * 魔搭没有官方签到接口。必须返回 unsupported / no_activity，不得假装领取成功。
 * @returns {Promise<import("./types.js").CheckinResult>}
 */
export async function checkin() {
  return {
    ok: true,
    status: "unsupported",
    claimed: false,
    pointsAwarded: null,
    message:
      "魔搭没有每日签到活动接口。每日魔粒在登录官方网站时自动到账，请到官方页面查看：https://modelscope.cn/magicube/usage"
  };
}

/**
 * 解析官方 GET /openapi/v1/magicubes/balance 的响应体。
 * 形状以 OpenAPI 组件 GetBalanceResponse 为准：
 * { success, data: { total_balance, available_balance, frozen_amount }, request_id }
 *
 * @param {unknown} json
 * @param {{ now?: () => Date, httpStatus?: number }} [opts]
 * @returns {import("./types.js").Balance}
 */
export function parseBalanceResponse(json, opts = {}) {
  const now = opts.now || (() => new Date());
  const unit = productInfo.unit;

  if (opts.httpStatus === 401) {
    return unreadBalance(unit, "访问令牌无效或已失效，请在扩展选项页更新。令牌只保存在本机。", now);
  }
  if (opts.httpStatus && opts.httpStatus >= 400) {
    return unreadBalance(unit, `官方接口返回 HTTP ${opts.httpStatus}，尚未读取。`, now);
  }

  if (!json || typeof json !== "object") {
    return unreadBalance(unit, "官方响应无法解析，尚未读取。", now);
  }

  const body = /** @type {Record<string, unknown>} */ (json);
  if (body.success === false) {
    const msg = typeof body.message === "string" && body.message ? body.message : "官方接口未成功，尚未读取。";
    return unreadBalance(unit, msg, now);
  }

  const data = body.data;
  if (!data || typeof data !== "object") {
    return unreadBalance(unit, "官方响应缺少 data，尚未读取。", now);
  }

  const available = /** @type {Record<string, unknown>} */ (data).available_balance;
  if (typeof available !== "number" || !Number.isFinite(available)) {
    return unreadBalance(unit, "官方响应缺少可用额度 available_balance，尚未读取。", now);
  }

  const total = /** @type {Record<string, unknown>} */ (data).total_balance;
  const frozen = /** @type {Record<string, unknown>} */ (data).frozen_amount;

  return {
    points: available,
    unit,
    expiresAt: null,
    updatedAt: now().toISOString(),
    source: "official_api",
    message: "已从官方 OpenAPI 读取可用魔粒。官方余额接口不返回过期时间。",
    meta: {
      total_balance: typeof total === "number" ? total : null,
      available_balance: available,
      frozen_amount: typeof frozen === "number" ? frozen : null,
      request_id: typeof body.request_id === "string" ? body.request_id : null
    }
  };
}

/**
 * 使用用户自己的魔搭访问令牌，调用官方 OpenAPI 查询魔粒余额。
 * 令牌只作为 Authorization: Bearer 发送给 modelscope.cn，不得写入日志或返回值。
 *
 * @param {import("./types.js").AdapterContext} [ctx]
 * @returns {Promise<import("./types.js").Balance>}
 */
export async function getBalance(ctx = {}) {
  const now = ctx.now || (() => new Date());
  const apiKey = typeof ctx.apiKey === "string" ? ctx.apiKey.trim() : "";
  if (!apiKey) {
    return unreadBalance(productInfo.unit, "尚未配置魔搭访问令牌，尚未读取。请在扩展选项页保存你自己的令牌。", now);
  }

  const baseUrl = (ctx.baseUrl || MODELSCOPE_DEFAULT_BASE).replace(/\/$/, "");
  const fetchImpl = ctx.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") {
    return unreadBalance(productInfo.unit, "当前环境没有 fetch，无法请求官方接口，尚未读取。", now);
  }

  const url = baseUrl + MODELSCOPE_BALANCE_PATH;
  try {
    const res = await fetchImpl(url, {
      method: "GET",
      headers: {
        Authorization: "Bearer " + apiKey,
        Accept: "application/json"
      }
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return parseBalanceResponse(json, { now, httpStatus: res.status });
  } catch (err) {
    return unreadBalance(
      productInfo.unit,
      "请求官方接口失败，尚未读取。" + (safeErrorMessage(err) ? " " + safeErrorMessage(err) : ""),
      now
    );
  }
}

export const modelscopeAdapter = {
  productInfo,
  checkin,
  getBalance
};
