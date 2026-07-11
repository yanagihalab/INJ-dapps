// frontend/src/api.js
// Unified wrapper to backend /api (Vite proxy 前提)

export const API_BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;
export const apiPath = (path = "") => `${API_BASE}${path}`;

async function _request(path, init = {}) {
  const r = await fetch(apiPath(path), {
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new Error(t || `HTTP ${r.status}`);
  }
  return r.json();
}

// shorthand
const GET = (p) => _request(p, { method: "GET" });
const POST = (p, body = {}) => _request(p, { method: "POST", body: JSON.stringify(body) });
const ADMIN_TOKEN_STORAGE_KEY = "injReviews.adminApiToken";

function adminHeaders(token) {
  const value = String(token || "").trim();
  return value ? { "X-Admin-Api-Key": value } : {};
}

export function getAdminApiToken() {
  try {
    return sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

export function setAdminApiToken(token) {
  try {
    const value = String(token || "").trim();
    if (value) sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, value);
    else sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {}
}

const ADMIN_POST = (p, body = {}, token = getAdminApiToken()) =>
  _request(p, {
    method: "POST",
    headers: adminHeaders(token),
    body: JSON.stringify(body),
  });

function normalizeExecuteArgs(input = {}, opts = {}) {
  if (input && typeof input === "object" && Object.prototype.hasOwnProperty.call(input, "msg")) {
    return { ...input, ...opts };
  }
  return { msg: input, ...opts };
}

function normalizeIdentity(input = {}) {
  if (typeof input === "string") return { address: input };
  return input || {};
}

function identityQuery(input = {}) {
  const { address, name } = normalizeIdentity(input);
  const qs = new URLSearchParams();
  if (address) qs.set("address", address);
  else if (name) qs.set("name", name);
  return qs.toString();
}

export const API = {
  // ---- health / config ------------------------------------------------------
  health: () => GET("/health"),
  getConfig: () => GET("/config"),
  config: () => GET("/config"), // 互換
  saveConfig: (cfg, adminToken) => ADMIN_POST("/config", cfg, adminToken),
  saveStoreRegistrationMetadata: (entries = [], adminToken) =>
    ADMIN_POST("/store-registration/metadata", { entries }, adminToken),
  resolveStoreRegistration: (authCode) =>
    POST("/store-registration/resolve", { auth_code: authCode }),

  // ---- tx / smart / tx query ------------------------------------------------
  execute: (input = {}, opts = {}) => {
    const { msg, amount, fees, contract, from } = normalizeExecuteArgs(input, opts);
    return POST("/tx/execute", { msg, amount, fees, contract, from });
  },

  smart: (msg, contract) =>
    POST("/query/smart", contract ? { msg, contract } : { msg }),

  tx: (hash) => GET(`/query/tx?hash=${encodeURIComponent(hash || "")}`),
  storeCode: (body = {}) => POST("/tx/store-code", body),
  instantiate: (body = {}) => POST("/tx/instantiate", body),
  deploy: (body = {}) => POST("/tx/deploy", body),

  // ---- bank/balances --------------------------------------------------------
  /** bank/balances を返す（バックエンドの /api/balance を叩く） */
  balance: (address) => {
    const qs = address ? `?address=${encodeURIComponent(address)}` : "";
    return GET(`/balance${qs}`);
  },

  // ---- common queries -------------------------------------------------------
  listByCode: (codeId) =>
    GET(`/query/list-contracts-by-code?code_id=${encodeURIComponent(codeId || "")}`),
  listContractsByCode: (codeId) =>
    GET(`/query/list-contracts-by-code?code_id=${encodeURIComponent(codeId || "")}`),
  queryListByCode: (codeId) =>
    GET(`/query/list-contracts-by-code?code_id=${encodeURIComponent(codeId || "")}`),

  queryContract: (address) =>
    GET(`/query/contract?address=${encodeURIComponent(address || "")}`),
  contractInfo: (address) =>
    GET(`/query/contract?address=${encodeURIComponent(address || "")}`),

  // ---- convenience (app specific) ------------------------------------------
  stores: (contract) =>
    POST("/query/smart", {
      msg: { stores: { start_after: null, limit: 50 } },
      ...(contract ? { contract } : {}),
    }),

  tipsForReview: (reviewId, contract) =>
    POST("/query/smart", {
      msg: { tips_for_review: { review_id: Number(reviewId) } },
      ...(contract ? { contract } : {}),
    }),

  visitsByVisitor: (addr, limit = 50, contract) =>
    POST("/query/smart", {
      msg: {
        visits_by_visitor: {
          visitor: addr || "",
          start_after: null,
          limit: Number(limit) || 50,
        },
      },
      ...(contract ? { contract } : {}),
    }),

  latestReviews: (limit = 10, contract) => {
    const qs = new URLSearchParams();
    qs.set("limit", String(Number(limit) || 10));
    if (contract) qs.set("contract", contract);
    return GET(`/reviews/latest?${qs.toString()}`);
  },

  // ---- keys (local keyring helpers) ----------------------------------------
  keysList: () => GET("/keys/list"),
  keyShow: (name) => GET(`/keys/show?name=${encodeURIComponent(name || "")}`),
  keysAdd: ({ name, overwrite = false, setCurrent = false }) =>
    POST("/keys/add", { name, overwrite, setCurrent }),
  setCurrent: ({ keyname, myAddr }, adminToken) =>
    ADMIN_POST("/config", { keyname, myAddr }, adminToken),

  // ---- accounts (app password; /api/accounts/*) ----------------------------
  // name / address のどちらでも指定可（address 優先）
  authStatus: (input = {}) => GET(`/accounts/password_status?${identityQuery(input)}`),
  authSetPassword: ({ address, name, password, hint, adminToken } = {}) =>
    ADMIN_POST("/accounts/set_password", { address, name, password, hint }, adminToken),
  authVerifyPassword: ({ address, name, password } = {}) =>
    POST("/accounts/verify_password", { address, name, password }),

  // ---- 旧名互換 -------------------------------------------------------------
  accounts: {
    passwordStatus: (input = {}) => GET(`/accounts/password_status?${identityQuery(input)}`),
    setPassword: ({ address, name, password, hint, adminToken } = {}) =>
      ADMIN_POST("/accounts/set_password", { address, name, password, hint }, adminToken),
    verifyPassword: ({ address, name, password } = {}) =>
      POST("/accounts/verify_password", { address, name, password }),
  },
};

/** /api/balance のレスポンスから INJ 残高（wei）を取り出す */
export function pickInjBalance(resp) {
  // /api/balance は { cmd, json, raw, ... } 形式を想定
  const j = resp?.json ?? resp;
  const list = j?.balances || [];
  const hit = list.find((b) => b.denom === "inj");
  return hit?.amount ?? "0";
}

/** 18 桁の INJ wei 文字列を見やすく整形（小数 6 桁まで） */
export function formatInj(weiStr) {
  try {
    const W = 10n ** 18n;
    const v = BigInt(String(weiStr || "0"));
    const int = v / W;
    const frac = v % W;
    const fracStr = frac.toString().padStart(18, "0").slice(0, 6);
    if (fracStr === "000000") return `${int.toString()} INJ`;
    return `${int.toString()}.${fracStr} INJ`;
  } catch {
    return `${weiStr ?? "0"} (wei INJ)`;
  }
}

export default API;
export const backend = API;
