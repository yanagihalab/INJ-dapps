// frontend/src/api.js
// Unified wrapper to backend /api (Vite proxy 前提)

async function _request(path, init = {}) {
  const r = await fetch(`/api${path}`, {
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
const GET  = (p) => _request(p, { method: "GET" });
const POST = (p, body = {}) => _request(p, { method: "POST", body: JSON.stringify(body) });

export const API = {
  // ---- health / config ------------------------------------------------------
  health:     () => GET("/health"),
  getConfig:  () => GET("/config"),
  config:     () => GET("/config"),           // 互換
  saveConfig: (cfg) => POST("/config", cfg),

  // ---- tx / smart / tx query ------------------------------------------------
  execute: ({ msg, amount, fees, contract } = {}) =>
    POST("/tx/execute", { msg, amount, fees, contract }),

  smart: (msg, contract) =>
    POST("/query/smart", contract ? { msg, contract } : { msg }),

  tx: (hash) => GET(`/query/tx?hash=${encodeURIComponent(hash || "")}`),

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

  visitsByVisitor: (addr, limit = 50) =>
    GET(`/steps/visits_by_visitor?visitor=${encodeURIComponent(addr || "")}&limit=${Number(limit)}`),

  // ---- keys (local keyring helpers) ----------------------------------------
  keysList: () => GET("/keys/list"),
  keyShow:  (name) => GET(`/keys/show?name=${encodeURIComponent(name || "")}`),
  keysAdd:  ({ name, overwrite = false, setCurrent = false }) =>
    POST("/keys/add", { name, overwrite, setCurrent }),
  setCurrent: ({ keyname, myAddr }) =>
    POST("/config", { keyname, myAddr }),

  // ---- accounts (app password; /api/accounts/*) ----------------------------
  // name / address のどちらでも指定可（address 優先）
  authStatus: ({ address, name } = {}) => {
    const qs = new URLSearchParams();
    if (address) qs.set("address", address);
    else if (name) qs.set("name", name);
    return GET(`/accounts/password_status?${qs.toString()}`);
  },
  authSetPassword: ({ address, name, password, hint } = {}) =>
    POST("/accounts/set_password", { address, name, password, hint }),
  authVerifyPassword: ({ address, name, password } = {}) =>
    POST("/accounts/verify_password", { address, name, password }),

  // ---- 旧名互換 -------------------------------------------------------------
  accounts: {
    passwordStatus: ({ address, name } = {}) => {
      const qs = new URLSearchParams();
      if (address) qs.set("address", address);
      else if (name) qs.set("name", name);
      return GET(`/accounts/password_status?${qs.toString()}`);
    },
    setPassword: ({ address, name, password, hint } = {}) =>
      POST("/accounts/set_password", { address, name, password, hint }),
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
