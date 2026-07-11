// backend/server.js
// Local dev only. Runs whitelisted injectived commands via host docker (docker.sock).
// Exposes API consumed by the Vite front-end.
// Security: do not expose this backend port directly to the internet.

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const corsOrigin = String(process.env.CORS_ORIGIN || "").trim();
app.use(cors(corsOrigin ? { origin: corsOrigin.split(",").map((v) => v.trim()).filter(Boolean) } : undefined));
app.use(express.json({ limit: "2mb" }));
const KEYLESS_MODE = String(process.env.KEYLESS_MODE || "false").toLowerCase() === "true";
const ADMIN_API_TOKEN = String(process.env.ADMIN_API_TOKEN || "").trim();
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 12);
const rateLimitBuckets = new Map();

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

function clientIp(req) {
  const forwarded = String(req.get("x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || "unknown";
}

function rateLimit({ windowMs = RATE_LIMIT_WINDOW_MS, max = RATE_LIMIT_MAX, name = "default" } = {}) {
  return (req, res, next) => {
    const now = Date.now();
    const key = `${name}:${clientIp(req)}`;
    const bucket = rateLimitBuckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (bucket.resetAt <= now) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    rateLimitBuckets.set(key, bucket);
    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count > max) {
      return res.status(429).json({
        error: "rate limit exceeded",
        message: "試行回数が多すぎます。時間を置いて再試行してください。",
        retry_after_seconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      });
    }
    return next();
  };
}

// ---- Data dir for app-internal password store ----
const DATA_DIR = process.env.DATA_DIR || "/data";
fs.mkdirSync(DATA_DIR, { recursive: true });
const AUTH_PATH = path.join(DATA_DIR, "auth_store.json");
const CONFIG_PATH = path.join(DATA_DIR, "config.json");
const STORE_REGISTRATION_META_PATH = path.join(DATA_DIR, "store_registration_meta.json");
const ADMIN_AUDIT_LOG_PATH = path.join(DATA_DIR, "admin_audit_log.json");

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
}
function writeJsonSafe(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2)); }

function codeHash(code) {
  return crypto.createHash("sha256").update(String(code || "").trim()).digest("hex");
}

function loadStoreRegistrationMetaDb() {
  const db = readJsonSafe(STORE_REGISTRATION_META_PATH);
  db.codes = db.codes || {};
  return db;
}

function saveStoreRegistrationMetaDb(db) {
  writeJsonSafe(STORE_REGISTRATION_META_PATH, db);
}

function loadAdminAuditLog() {
  const db = readJsonSafe(ADMIN_AUDIT_LOG_PATH);
  db.entries = Array.isArray(db.entries) ? db.entries : [];
  return db;
}

function appendAdminAuditLog(entry = {}) {
  const db = loadAdminAuditLog();
  const next = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    actor: String(entry.actor || "").trim(),
    action: String(entry.action || "").trim() || "unknown",
    txhash: String(entry.txhash || "").trim(),
    target: entry.target || null,
    details: entry.details || null,
  };
  db.entries.unshift(next);
  db.entries = db.entries.slice(0, 500);
  writeJsonSafe(ADMIN_AUDIT_LOG_PATH, db);
  return next;
}

function constantTimeEqualString(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function requireAdminApi(req, res, next) {
  if (!ADMIN_API_TOKEN) {
    return res.status(403).json({
      error: "admin API token is not configured",
      hint: "Set ADMIN_API_TOKEN on the server to enable this write endpoint.",
    });
  }
  const supplied = String(
    req.get("x-admin-api-key") ||
    req.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    ""
  ).trim();
  if (!constantTimeEqualString(supplied, ADMIN_API_TOKEN)) {
    return res.status(401).json({ error: "invalid admin API token" });
  }
  return next();
}

function loadAuthDb() {
  const db = readJsonSafe(AUTH_PATH);
  db.users = db.users || {};
  return db;
}
function saveAuthDb(db) { writeJsonSafe(AUTH_PATH, db); }

function pwSet(address, password, hint) {
  const addr = String(address || "").toLowerCase();
  if (!addr || !password) throw new Error("address & password are required");
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  const db = loadAuthDb();
  db.users[addr] = { salt, hash, hint: hint || "", updatedAt: new Date().toISOString() };
  saveAuthDb(db);
  return { ok: true, address: addr, updatedAt: db.users[addr].updatedAt };
}
function pwVerify(address, password) {
  const addr = String(address || "").toLowerCase();
  const db = loadAuthDb();
  const rec = db.users[addr];
  if (!rec) return { ok: false, reason: "not_set", address: addr };
  const cand = crypto.scryptSync(password, rec.salt, 64);
  const stored = Buffer.from(rec.hash, "hex");
  const ok = stored.length === cand.length && crypto.timingSafeEqual(stored, cand);
  return { ok, address: addr, updatedAt: rec.updatedAt };
}
function pwStatus(address) {
  const addr = String(address || "").toLowerCase();
  const db = loadAuthDb();
  const rec = db.users[addr];
  return {
    address: addr,
    hasPassword: !!rec,
    hint: rec?.hint ? true : false,
    updatedAt: rec?.updatedAt || null,
  };
}

// ---- Config (editable via /api/config) ----
const CONFIG_KEYS = [
  "keyname","myAddr","codeId","contract","injNode","chainId",
  "injectiveHomeHostPath","gasAdjustment","defaultFees","keyringBackend","injectiveImage",
  "wasmHostPath","lcdRest"
];

function defaultConfigFromEnv() {
  return {
  keyname: process.env.KEYNAME || "mykey",
  myAddr: process.env.MY_ADDR || "",
  codeId: process.env.CODE_ID || "",
  contract: process.env.CONTRACT || "",
  injNode: process.env.INJ_NODE || "https://testnet.sentry.tm.injective.network:443",
  lcdRest: process.env.INJ_LCD_REST || "https://testnet.sentry.lcd.injective.network:443",
  chainId: process.env.INJ_CHAIN_ID || "injective-888",
  injectiveHomeHostPath: process.env.INJ_HOME_HOST_PATH || "",
  gasAdjustment: process.env.GAS_ADJ || "1.6",
  defaultFees: process.env.DEFAULT_FEES || "1000000000000000inj",
  keyringBackend: process.env.KEYRING_BACKEND || "test",
  injectiveImage: process.env.INJ_IMAGE || "injective-ubuntu:latest",
  wasmHostPath: process.env.WASM_HOST_PATH || "",
  };
}

function loadConfig() {
  const saved = readJsonSafe(CONFIG_PATH);
  const cfg = { ...defaultConfigFromEnv() };
  for (const k of CONFIG_KEYS) {
    if (Object.prototype.hasOwnProperty.call(saved, k)) cfg[k] = saved[k];
  }
  if (KEYLESS_MODE) {
    cfg.keyname = "";
    cfg.injectiveHomeHostPath = "";
    cfg.wasmHostPath = "";
  }
  return cfg;
}

function saveConfig(cfg) {
  const out = {};
  for (const k of CONFIG_KEYS) out[k] = cfg[k] ?? "";
  if (KEYLESS_MODE) {
    out.keyname = "";
    out.injectiveHomeHostPath = "";
    out.wasmHostPath = "";
  }
  writeJsonSafe(CONFIG_PATH, out);
}

let CFG = loadConfig();

// ---- docker helpers ----
function dockerArgs(entrypointArgs, dockerFlags = []) {
  const args = ["run", "--rm", ...dockerFlags];
  const homePath = String(CFG.injectiveHomeHostPath || "").trim();
  if (homePath && fs.existsSync(homePath)) {
    args.push("-v", `${homePath}:/home/inj/.injective`);
  } else if (homePath) {
    console.warn(`[WARN] INJ_HOME_HOST_PATH does not exist; running without keyring mount: ${homePath}`);
  }
  args.push("--entrypoint", "injectived", CFG.injectiveImage, ...entrypointArgs);
  return args;
}
function runDocker(entrypointArgs, dockerFlags = []) {
  return new Promise((resolve) => {
    const args = dockerArgs(entrypointArgs, dockerFlags);
    const child = spawn("docker", args, { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr, args }));
  });
}

function parseJsonOrNull(raw) {
  try { return JSON.parse(String(raw || "").trim()); } catch { return null; }
}

async function keyAddressByName(name) {
  const keyName = String(name || "").trim();
  if (!keyName) return "";
  const out = await runDocker([
    "keys", "show", keyName,
    "--home", "/home/inj/.injective",
    "--keyring-backend", CFG.keyringBackend,
    "--output", "json",
  ]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = parseJsonOrNull(rawSrc);
  return String(parsed?.address || "").trim();
}

async function resolveIdentityAddress({ address, name } = {}) {
  const direct = String(address || "").trim();
  if (direct) return direct;
  return keyAddressByName(name);
}

// ---- parse helpers ----
function stripGasEstimateLine(raw) {
  const lines = String(raw || "").split("\n");
  if (lines[0] && /^gas estimate:\s*\d+/.test(lines[0])) lines.shift();
  return lines.join("\n").trim();
}
function tryParseTxJson(raw) {
  const cleaned = stripGasEstimateLine(raw);
  try { return { json: JSON.parse(cleaned), raw: cleaned }; }
  catch { return { json: null, raw: cleaned, note: "Failed to parse JSON (returning raw)." }; }
}
function tryParseSmartJson(raw) {
  const cleaned = String(raw || "").trim();
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj.data !== "undefined" && typeof obj.data === "string") {
      try { obj.data = JSON.parse(obj.data); } catch {}
    }
    return { json: obj, raw: cleaned };
  } catch {
    return { json: null, raw: cleaned, note: "Failed to parse JSON (returning raw)." };
  }
}

function buildExecuteArgs(contract, msgObj, { from, amount, fees } = {}) {
  const signer = (from && String(from).trim()) ? String(from).trim() : CFG.keyname;
  const base = [
    "tx", "wasm", "execute", contract, JSON.stringify(msgObj),
    "--from", signer,
    "--home", "/home/inj/.injective",
    "--keyring-backend", CFG.keyringBackend,
    "--node", CFG.injNode,
    "--chain-id", CFG.chainId,
    "--gas", "auto",
    "--gas-adjustment", CFG.gasAdjustment,
    "--fees", fees || CFG.defaultFees,
    "-b", "sync",
    "-y",
    "-o", "json",
  ];
  if (amount) base.push("--amount", amount);
  return base;
}

function buildTxBase({ from, fees } = {}) {
  const signer = (from && String(from).trim()) ? String(from).trim() : CFG.keyname;
  return [
    "--from", signer,
    "--home", "/home/inj/.injective",
    "--keyring-backend", CFG.keyringBackend,
    "--node", CFG.injNode,
    "--chain-id", CFG.chainId,
    "--gas", "auto",
    "--gas-adjustment", CFG.gasAdjustment,
    "--fees", fees || CFG.defaultFees,
    "-b", "sync",
    "-y",
    "-o", "json",
  ];
}

function artifactMountFor(wasmHostPath) {
  const hostPath = String(wasmHostPath || CFG.wasmHostPath || "").trim();
  if (!hostPath) throw new Error("wasmHostPath is required");
  const hostDir = path.dirname(hostPath);
  const fileName = path.basename(hostPath);
  return {
    dockerFlags: ["-v", `${hostDir}:/artifacts:ro`],
    containerPath: `/artifacts/${fileName}`,
    hostPath,
  };
}

function assertSigningConfig() {
  if (KEYLESS_MODE) {
    throw new Error("server-side signing is disabled in KEYLESS_MODE");
  }
  if (!String(CFG.keyname || "").trim()) {
    throw new Error("KEYNAME is required before deploying");
  }
  const home = String(CFG.injectiveHomeHostPath || "").trim();
  if (!home || home.includes("/your-name/")) {
    throw new Error("INJ_HOME_HOST_PATH must point to an existing Injective keyring directory before deploying");
  }
}

function extractTxhash(parsed) {
  return (
    parsed?.json?.txhash ||
    parsed?.json?.tx_response?.txhash ||
    parsed?.json?.txResponse?.txhash ||
    parsed?.json?.hash ||
    null
  );
}

function collectTxAttributes(json) {
  const attrs = [];
  const logs = json?.tx_response?.logs || json?.txResponse?.logs || json?.logs || [];
  for (const log of logs) {
    for (const ev of (log.events || [])) {
      for (const a of (ev.attributes || [])) {
        attrs.push({
          type: ev.type || "",
          key: a.key,
          value: a.value,
        });
      }
    }
  }
  const events = json?.tx_response?.events || json?.txResponse?.events || json?.events || [];
  for (const ev of events) {
    for (const a of (ev.attributes || [])) {
      attrs.push({
        type: ev.type || "",
        key: a.key,
        value: a.value,
      });
    }
  }
  return attrs;
}

function findTxAttr(json, names) {
  const wanted = new Set(names);
  const attrs = collectTxAttributes(json);
  for (const a of attrs) {
    const key = String(a.key || "").replace(/^wasm\./, "");
    if (wanted.has(key)) return String(a.value || "");
  }
  return "";
}

async function queryTxByHash(hash) {
  const out = await runDocker(["query","tx", hash, "--node", CFG.injNode, "-o", "json"]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseTxJson(rawSrc);
  return { cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed };
}

function lcdBase() {
  return String(CFG.lcdRest || "https://testnet.sentry.lcd.injective.network:443").replace(/\/+$/, "");
}

async function fetchJson(url, options = {}) {
  const r = await fetch(url, options);
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  if (!r.ok) {
    const err = new Error(`HTTP ${r.status}`);
    err.status = r.status;
    err.url = url;
    err.body = text;
    throw err;
  }
  if (!json) {
    const err = new Error("non-JSON response");
    err.status = 500;
    err.url = url;
    err.body = text;
    throw err;
  }
  return json;
}

function shouldUseLcdFallback() {
  return KEYLESS_MODE || !String(CFG.injectiveImage || "").trim();
}

async function smartQuery(contract, msg) {
  if (!contract) throw new Error("contract is required");
  if (shouldUseLcdFallback()) {
    const queryData = Buffer.from(JSON.stringify(msg)).toString("base64");
    const url = `${lcdBase()}/cosmwasm/wasm/v1/contract/${encodeURIComponent(contract)}/smart/${encodeURIComponent(queryData)}`;
    const json = await fetchJson(url);
    return { ok: true, url, json, data: json?.data ?? json };
  }

  const out = await runDocker([
    "query","wasm","contract-state","smart",
    contract, JSON.stringify(msg),
    "--node", CFG.injNode,
    "-o", "json",
  ]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseSmartJson(rawSrc);
  return { cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed };
}

function unwrapSmartData(resp) {
  return resp?.json?.data ?? resp?.data ?? resp?.json ?? resp;
}

function reviewSortValue(review) {
  const created = Number(review?.created_at);
  if (Number.isFinite(created)) return created;
  const id = Number(review?.id);
  return Number.isFinite(id) ? id : 0;
}

function reviewCursor(review) {
  return `${reviewSortValue(review)}:${Number(review?.id || 0)}`;
}

function compareReviewDesc(a, b) {
  const createdDiff = reviewSortValue(b) - reviewSortValue(a);
  if (createdDiff !== 0) return createdDiff;
  return Number(b?.id || 0) - Number(a?.id || 0);
}

async function collectLatestReviews(contract, { pageLimit = 100 } = {}) {
  const stores = [];
  let startAfterStore = null;
  for (let page = 0; page < 20; page += 1) {
    const resp = await smartQuery(contract, {
      stores: { start_after: startAfterStore, limit: pageLimit },
    });
    const batch = unwrapSmartData(resp)?.stores || [];
    stores.push(...batch);
    if (batch.length < pageLimit) break;
    startAfterStore = Number(batch[batch.length - 1]?.id);
    if (!startAfterStore) break;
  }

  const reviews = [];
  for (const store of stores) {
    let startAfterReview = null;
    for (let page = 0; page < 20; page += 1) {
      const resp = await smartQuery(contract, {
        reviews_by_store: {
          store_id: Number(store.id),
          start_after: startAfterReview,
          limit: pageLimit,
        },
      });
      const batch = unwrapSmartData(resp)?.reviews || [];
      for (const review of batch) {
        reviews.push({
          ...review,
          store: {
            id: store.id,
            store_ref: store.store_ref,
            name: store.name,
            category: store.category,
            address: store.address,
            price_range: store.price_range,
          },
          cursor: reviewCursor(review),
        });
      }
      if (batch.length < pageLimit) break;
      startAfterReview = Number(batch[batch.length - 1]?.id);
      if (!startAfterReview) break;
    }
  }

  return { stores, reviews };
}

async function pollTxAttr(hash, attrNames, { attempts = 12, delayMs = 2500 } = {}) {
  for (let i = 0; i < attempts; i += 1) {
    const tx = await queryTxByHash(hash);
    const value = findTxAttr(tx.json, attrNames);
    if (value) return { value, tx, attempts: i + 1 };
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return { value: "", tx: null, attempts };
}

// ---- API ----
app.get("/api/health", (_req, res) => {
  const hasKeyPath = !!CFG.injectiveHomeHostPath;
  res.json({
    ok: true,
    keylessMode: KEYLESS_MODE,
    hasKeyPath,
    node: CFG.injNode,
    chainId: CFG.chainId,
    configPersisted: fs.existsSync(CONFIG_PATH),
    adminApiConfigured: Boolean(ADMIN_API_TOKEN),
  });
});

function rejectKeyless(res, feature) {
  return res.status(403).json({
    error: `${feature} is disabled in KEYLESS_MODE`,
    hint: "Use browser wallet signing such as Keplr. Do not place important keys on the public server.",
  });
}

// config
app.get("/api/config", (_req, res) => res.json({ ...CFG, configPath: CONFIG_PATH }));
app.post("/api/config", requireAdminApi, (req, res) => {
  for (const k of CONFIG_KEYS) if (k in req.body) CFG[k] = req.body[k];
  saveConfig(CFG);
  appendAdminAuditLog({
    actor: req.get("x-admin-actor") || "admin-api",
    action: "config.update",
    details: { keys: CONFIG_KEYS.filter((k) => k in req.body) },
  });
  res.json({ ok: true, CFG: { ...CFG, configPath: CONFIG_PATH } });
});

app.post("/api/store-registration/metadata", requireAdminApi, (req, res) => {
  try {
    const entries = Array.isArray(req.body?.entries) ? req.body.entries : [];
    if (!entries.length) return res.status(400).json({ error: "entries is required" });
    const db = loadStoreRegistrationMetaDb();
    const saved = [];
    for (const entry of entries) {
      const code = String(entry?.code || "").trim();
      const storeRef = String(entry?.store_ref || entry?.storeRef || "").trim();
      const name = String(entry?.name || "").trim();
      if (!code || !storeRef || !name) {
        return res.status(400).json({ error: "code, store_ref and name are required for every entry" });
      }
      const hash = codeHash(code);
      db.codes[hash] = {
        store_ref: storeRef,
        name,
        updatedAt: new Date().toISOString(),
      };
      saved.push({ store_ref: storeRef, name });
    }
    saveStoreRegistrationMetaDb(db);
    appendAdminAuditLog({
      actor: req.get("x-admin-actor") || "admin-api",
      action: "store_registration.metadata_save",
      details: { count: saved.length, stores: saved },
    });
    res.json({ ok: true, saved });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

app.get("/api/admin/audit", requireAdminApi, (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 50) || 50, 1), 200);
  const db = loadAdminAuditLog();
  res.json({ ok: true, entries: db.entries.slice(0, limit) });
});

app.post("/api/admin/audit", requireAdminApi, (req, res) => {
  const entry = appendAdminAuditLog({
    actor: req.body?.actor || req.get("x-admin-actor") || "",
    action: req.body?.action,
    txhash: req.body?.txhash,
    target: req.body?.target,
    details: req.body?.details,
  });
  res.json({ ok: true, entry });
});

app.post("/api/store-registration/resolve", rateLimit({ name: "store-registration-resolve", max: 20 }), (req, res) => {
  try {
    const code = String(req.body?.auth_code || req.body?.code || "").trim();
    if (!code) return res.status(400).json({ error: "auth_code is required" });
    const db = loadStoreRegistrationMetaDb();
    const rec = db.codes[codeHash(code)];
    if (!rec) return res.status(404).json({ error: "store registration metadata not found" });
    res.json({ ok: true, store_ref: rec.store_ref, name: rec.name, updatedAt: rec.updatedAt });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

// bank balance
app.get("/api/balance", async (req, res) => {
  const addr = String(req.query.address || CFG.myAddr || "").trim();
  if (!addr) return res.status(400).json({ error: "address is required" });
  if (shouldUseLcdFallback()) {
    try {
      const url = `${lcdBase()}/cosmos/bank/v1beta1/balances/${addr}`;
      const json = await fetchJson(url);
      return res.json({ ok: true, url, json, balances: json?.balances || [] });
    } catch (e) {
      return res.status(e.status || 500).json({ error: String(e.message || e), url: e.url, body: e.body });
    }
  }
  const out = await runDocker(["query", "bank", "balances", addr, "--node", CFG.injNode, "-o", "json"]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseSmartJson(rawSrc);
  res.json({ cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

// ---- LCD proxy (account JSON) ----
app.get("/api/lcd/account", async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    if (!address) return res.status(400).json({ error: "address is required" });

    const lcdBase = String(req.query.lcdBase || "https://testnet.sentry.lcd.injective.network:443").replace(/\/+$/, "");
    const url = `${lcdBase}/cosmos/auth/v1beta1/accounts/${address}`;

    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: `LCD request failed: ${r.status}`, url, body: text });

    let json = null;
    try { json = JSON.parse(text); } catch {}
    if (!json) return res.status(500).json({ error: "LCD returned non-JSON", url, body: text });

    return res.json({ ok: true, url, json });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ---- LCD normalized (may differ from RPC) ----
app.get("/api/lcd/account_basic", async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    if (!address) return res.status(400).json({ error: "address is required" });

    const lcdBase = String(req.query.lcdBase || "https://testnet.sentry.lcd.injective.network:443").replace(/\/+$/, "");
    const url = `${lcdBase}/cosmos/auth/v1beta1/accounts/${address}`;

    const r = await fetch(url);
    const text = await r.text();
    if (!r.ok) return res.status(r.status).json({ error: `LCD request failed: ${r.status}`, url, body: text });

    const js = JSON.parse(text);
    const acc = js?.account || {};
    const base = acc.base_account || acc.baseAccount || null;
    if (!base) return res.status(500).json({ error: "base_account not found", url, js });

    const accountNumber = base.account_number ?? base.accountNumber;
    const sequence = base.sequence;
    const pubKeyB64 = base?.pub_key?.key || base?.pubKey?.key || "";

    if (accountNumber == null || sequence == null) {
      return res.status(500).json({ error: "account_number/sequence missing", url, base, js });
    }

    return res.json({
      ok: true,
      address,
      accountNumber: String(accountNumber),
      sequence: String(sequence),
      pubKeyB64: String(pubKeyB64),
      url,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ---- RPC normalized (THIS is the source of truth for signing) ----
app.get("/api/rpc/account_basic", async (req, res) => {
  try {
    const address = String(req.query.address || "").trim();
    if (!address) return res.status(400).json({ error: "address is required" });

    if (shouldUseLcdFallback()) {
      const url = `${lcdBase()}/cosmos/auth/v1beta1/accounts/${address}`;
      const js = await fetchJson(url);
      const acc = js?.account || {};
      const base = acc.base_account || acc.baseAccount || null;
      if (!base) return res.status(500).json({ error: "base_account not found", url, js });
      const accountNumber = base.account_number ?? base.accountNumber;
      const sequence = base.sequence ?? "0";
      const pubKeyB64 = base?.pub_key?.key || base?.pubKey?.key || "";
      if (accountNumber == null || sequence == null) {
        return res.status(500).json({ error: "account_number/sequence missing", url, base, js });
      }
      return res.json({
        ok: true,
        address,
        accountNumber: String(accountNumber),
        sequence: String(sequence),
        pubKeyB64: String(pubKeyB64),
        url,
      });
    }

    const out = await runDocker([
      "query", "auth", "account", address,
      "--node", CFG.injNode,
      "-o", "json"
    ]);

    const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
    let json = null;
    try { json = JSON.parse(rawSrc); } catch {}

    if (!json) {
      return res.status(500).json({
        error: "RPC account query returned non-JSON",
        cmd: `docker ${out.args.join(" ")}`,
        exitCode: out.code,
        stderr: out.stderr,
        raw: rawSrc
      });
    }

    const acc = json?.account || json;

    // 形態A: acc.base_account
    // 形態B: acc.value.base_account
    const base =
      acc?.base_account ||
      acc?.baseAccount ||
      acc?.value?.base_account ||
      acc?.value?.baseAccount ||
      null;

    if (!base) {
      return res.status(500).json({
        error: "base_account not found in RPC response",
        cmd: `docker ${out.args.join(" ")}`,
        exitCode: out.code,
        stderr: out.stderr,
        json
      });
    }

    const accountNumber = base.account_number ?? base.accountNumber;
    const sequence = base.sequence ?? "0"; // sequence が無い場合のフォールバック
    const pubKeyB64 = base?.pub_key?.key || base?.pubKey?.key || "";

    if (accountNumber == null || sequence == null) {
      return res.status(500).json({
        error: "account_number/sequence missing in RPC base_account",
        cmd: `docker ${out.args.join(" ")}`,
        exitCode: out.code,
        stderr: out.stderr,
        base,
        json
      });
    }

    return res.json({
      ok: true,
      address,
      accountNumber: String(accountNumber),
      sequence: String(sequence),
      pubKeyB64: String(pubKeyB64),
      node: CFG.injNode,
      cmd: `docker ${out.args.join(" ")}`
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// contract info
app.get("/api/query/contract", async (req, res) => {
  const address = req.query.address || CFG.contract;
  if (shouldUseLcdFallback()) {
    try {
      const url = `${lcdBase()}/cosmwasm/wasm/v1/contract/${encodeURIComponent(address)}`;
      const json = await fetchJson(url);
      return res.json({ ok: true, url, json, data: json?.contract_info || json?.contractInfo || json });
    } catch (e) {
      return res.status(e.status || 500).json({ error: String(e.message || e), url: e.url, body: e.body });
    }
  }
  const out = await runDocker(["query", "wasm", "contract", address, "--node", CFG.injNode, "-o", "json"]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseTxJson(rawSrc);
  res.json({ cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

app.get("/api/query/list-contracts-by-code", async (req, res) => {
  const codeId = String(req.query.code_id || CFG.codeId || "").trim();
  if (!codeId) return res.status(400).json({ error: "code_id is required" });

  if (shouldUseLcdFallback()) {
    try {
      const url = `${lcdBase()}/cosmwasm/wasm/v1/code/${encodeURIComponent(codeId)}/contracts`;
      const json = await fetchJson(url);
      return res.json({ ok: true, url, json, data: json?.contracts || [] });
    } catch (e) {
      return res.status(e.status || 500).json({ error: String(e.message || e), url: e.url, body: e.body });
    }
  }

  const out = await runDocker([
    "query", "wasm", "list-contract-by-code", codeId,
    "--node", CFG.injNode,
    "-o", "json",
  ]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseSmartJson(rawSrc);
  res.json({ cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

// smart query
app.post("/api/query/smart", async (req, res) => {
  const contract = req.body.contract || CFG.contract;
  const msg = req.body.msg || {};
  if (!contract) return res.status(400).json({ error: "contract is required" });

  try {
    return res.json(await smartQuery(contract, msg));
  } catch (e) {
    return res.status(e.status || 500).json({ error: String(e.message || e), url: e.url, body: e.body });
  }
});

app.get("/api/reviews/latest", async (req, res) => {
  const contract = String(req.query.contract || CFG.contract || "").trim();
  const limit = Math.min(Math.max(Number(req.query.limit || 10) || 10, 1), 50);
  const pageLimit = Math.min(Math.max(Number(req.query.page_limit || 100) || 100, 1), 100);
  const cursor = String(req.query.cursor || "").trim();
  if (!contract) return res.status(400).json({ error: "contract is required" });

  try {
    const { stores, reviews } = await collectLatestReviews(contract, { pageLimit });
    const allSorted = reviews
      .filter((review) => !review.hidden)
      .sort(compareReviewDesc);
    const startIndex = cursor
      ? Math.max(0, allSorted.findIndex((review) => review.cursor === cursor) + 1)
      : 0;
    const latest = allSorted
      .slice(startIndex)
      .slice(0, limit);
    const nextCursor = latest.length === limit
      ? latest[latest.length - 1]?.cursor || null
      : null;

    return res.json({
      ok: true,
      contract,
      stores_scanned: stores.length,
      reviews_scanned: reviews.length,
      cursor: cursor || null,
      next_cursor: nextCursor,
      reviews: latest,
    });
  } catch (e) {
    return res.status(e.status || 500).json({ error: String(e.message || e), url: e.url, body: e.body });
  }
});

// query tx
app.get("/api/query/tx", async (req, res) => {
  const h = req.query.hash;
  if (!h) return res.status(400).json({ error: "hash is required" });

  if (shouldUseLcdFallback()) {
    try {
      const url = `${lcdBase()}/cosmos/tx/v1beta1/txs/${encodeURIComponent(h)}`;
      const json = await fetchJson(url);
      return res.json({ ok: true, url, json, data: json?.tx_response || json?.txResponse || json });
    } catch (e) {
      return res.status(e.status || 500).json({ error: String(e.message || e), url: e.url, body: e.body });
    }
  }

  const out = await runDocker(["query","tx", h, "--node", CFG.injNode, "-o", "json"]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseTxJson(rawSrc);

  res.json({ cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

// tx execute (backend-signing)
app.post("/api/tx/execute", async (req, res) => {
  if (KEYLESS_MODE) return rejectKeyless(res, "server-side execute");
  const contract = req.body.contract || CFG.contract;
  const msg = req.body.msg || {};
  const from = req.body.from || CFG.keyname;
  const amount = req.body.amount || req.body.funds || null;
  const fees = req.body.fees || null;

  const args = buildExecuteArgs(contract, msg, { from, amount, fees });
  const out = await runDocker(args);

  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseTxJson(rawSrc);
  const txhash =
    parsed.json?.txhash ||
    parsed.json?.tx_response?.txhash ||
    parsed.json?.txResponse?.txhash ||
    parsed.json?.hash ||
    null;

  res.json({ txhash, cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

// tx wasm store (backend-signing)
app.post("/api/tx/store-code", async (req, res) => {
  if (KEYLESS_MODE) return rejectKeyless(res, "store-code");
  try {
    assertSigningConfig();
    const { dockerFlags, containerPath, hostPath } = artifactMountFor(req.body?.wasmHostPath);
    const from = req.body?.from || CFG.keyname;
    const fees = req.body?.fees || null;
    const args = [
      "tx", "wasm", "store", containerPath,
      ...buildTxBase({ from, fees }),
    ];

    const out = await runDocker(args, dockerFlags);
    const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
    const parsed = tryParseTxJson(rawSrc);
    const txhash = extractTxhash(parsed);
    let codeId = "";
    let indexed = null;

    if (txhash) {
      indexed = await pollTxAttr(txhash, ["code_id"]);
      codeId = indexed.value;
      if (codeId) {
        CFG.codeId = codeId;
        saveConfig(CFG);
      }
    }

    res.json({
      ok: out.code === 0,
      txhash,
      codeId,
      hostPath,
      configSaved: !!codeId,
      indexed,
      cmd: `docker ${out.args.join(" ")}`,
      exitCode: out.code,
      stderr: out.stderr,
      ...parsed,
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// tx wasm instantiate (backend-signing)
app.post("/api/tx/instantiate", async (req, res) => {
  if (KEYLESS_MODE) return rejectKeyless(res, "instantiate");
  try {
    assertSigningConfig();
    const codeId = String(req.body?.codeId || CFG.codeId || "").trim();
    if (!codeId) return res.status(400).json({ error: "codeId is required" });

    const from = req.body?.from || CFG.keyname;
    const fees = req.body?.fees || null;
    const label = String(req.body?.label || `tabelog-review-${Date.now()}`);
    const instantiateMsg = req.body?.msg || req.body?.instantiateMsg || {
      admin: null,
      fee_bps: 500,
      fee_receiver: null,
      review_window_secs: 604800,
      min_text_len: 5,
      max_text_len: 2000,
      native_tip_denoms: ["inj"],
      record_policy: null,
      max_tip_per_tx: null,
    };

    const args = [
      "tx", "wasm", "instantiate", codeId, JSON.stringify(instantiateMsg),
      "--label", label,
      ...buildTxBase({ from, fees }),
    ];
    const admin = String(req.body?.admin || "").trim();
    if (admin) args.push("--admin", admin);

    const out = await runDocker(args);
    const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
    const parsed = tryParseTxJson(rawSrc);
    const txhash = extractTxhash(parsed);
    let contract = "";
    let indexed = null;

    if (txhash) {
      indexed = await pollTxAttr(txhash, ["_contract_address", "contract_address"]);
      contract = indexed.value;
      if (contract) {
        CFG.codeId = codeId;
        CFG.contract = contract;
        saveConfig(CFG);
      }
    }

    res.json({
      ok: out.code === 0,
      txhash,
      codeId,
      contract,
      label,
      instantiateMsg,
      configSaved: !!contract,
      indexed,
      cmd: `docker ${out.args.join(" ")}`,
      exitCode: out.code,
      stderr: out.stderr,
      ...parsed,
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

// store + instantiate in one request. Returns partial data if chain indexing lags.
app.post("/api/tx/deploy", async (req, res) => {
  if (KEYLESS_MODE) return rejectKeyless(res, "deploy");
  try {
    assertSigningConfig();
    const { dockerFlags, containerPath, hostPath } = artifactMountFor(req.body?.wasmHostPath);
    const from = req.body?.from || CFG.keyname;
    const fees = req.body?.fees || null;

    const storeArgs = [
      "tx", "wasm", "store", containerPath,
      ...buildTxBase({ from, fees }),
    ];
    const storeOut = await runDocker(storeArgs, dockerFlags);
    const storeRaw = (storeOut.stdout && storeOut.stdout.trim().length > 0) ? storeOut.stdout : storeOut.stderr;
    const storeParsed = tryParseTxJson(storeRaw);
    const storeTxhash = extractTxhash(storeParsed);
    const codePoll = storeTxhash ? await pollTxAttr(storeTxhash, ["code_id"]) : { value: "", tx: null, attempts: 0 };
    const codeId = codePoll.value;

    if (!codeId) {
      return res.json({
        ok: false,
        phase: "store",
        error: "code_id not found yet; retry instantiate after tx indexing completes",
        hostPath,
        store: {
          txhash: storeTxhash,
          cmd: `docker ${storeOut.args.join(" ")}`,
          exitCode: storeOut.code,
          stderr: storeOut.stderr,
          ...storeParsed,
          indexed: codePoll,
        },
      });
    }

    CFG.codeId = codeId;
    saveConfig(CFG);

    const label = String(req.body?.label || `tabelog-review-${Date.now()}`);
    const instantiateMsg = req.body?.msg || req.body?.instantiateMsg || {
      admin: null,
      fee_bps: 500,
      fee_receiver: null,
      review_window_secs: 604800,
      min_text_len: 5,
      max_text_len: 2000,
      native_tip_denoms: ["inj"],
      record_policy: null,
      max_tip_per_tx: null,
    };
    const instantiateArgs = [
      "tx", "wasm", "instantiate", codeId, JSON.stringify(instantiateMsg),
      "--label", label,
      ...buildTxBase({ from, fees }),
    ];
    const admin = String(req.body?.admin || "").trim();
    if (admin) instantiateArgs.push("--admin", admin);

    const instantiateOut = await runDocker(instantiateArgs);
    const instantiateRaw = (instantiateOut.stdout && instantiateOut.stdout.trim().length > 0) ? instantiateOut.stdout : instantiateOut.stderr;
    const instantiateParsed = tryParseTxJson(instantiateRaw);
    const instantiateTxhash = extractTxhash(instantiateParsed);
    const contractPoll = instantiateTxhash
      ? await pollTxAttr(instantiateTxhash, ["_contract_address", "contract_address"])
      : { value: "", tx: null, attempts: 0 };
    const contract = contractPoll.value;

    if (contract) {
      CFG.contract = contract;
      saveConfig(CFG);
    }

    res.json({
      ok: !!contract,
      phase: contract ? "complete" : "instantiate",
      hostPath,
      codeId,
      contract,
      label,
      instantiateMsg,
      configSaved: !!contract,
      store: {
        txhash: storeTxhash,
        cmd: `docker ${storeOut.args.join(" ")}`,
        exitCode: storeOut.code,
        stderr: storeOut.stderr,
        ...storeParsed,
        indexed: codePoll,
      },
      instantiate: {
        txhash: instantiateTxhash,
        cmd: `docker ${instantiateOut.args.join(" ")}`,
        exitCode: instantiateOut.code,
        stderr: instantiateOut.stderr,
        ...instantiateParsed,
        indexed: contractPoll,
      },
    });
  } catch (e) {
    res.status(400).json({ error: String(e.message || e) });
  }
});

/**
 * POST /api/tx/broadcast  { txBytesBase64: "..." }
 * Keplrで署名した TxRaw bytes(base64) を受け取り、CometBFT RPC の broadcast_tx_sync へ送る。
 */
app.post("/api/tx/broadcast", async (req, res) => {
  const txBytesBase64 = String(req.body?.txBytesBase64 || "");
  if (!txBytesBase64) return res.status(400).json({ error: "txBytesBase64 is required" });

  try {
    const payload = {
      jsonrpc: "2.0",
      id: 1,
      method: "broadcast_tx_sync",
      params: { tx: txBytesBase64 },
    };

    const r = await fetch(CFG.injNode, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await r.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (!r.ok) {
      return res.status(r.status).json({
        error: `RPC broadcast failed: HTTP ${r.status}`,
        node: CFG.injNode,
        body: text,
      });
    }

    // Typical response: { result: { hash: "0x...", code: 0, ... } }
    const hashHex = json?.result?.hash || null;
    const txhash = hashHex ? String(hashHex).replace(/^0x/i, "").toUpperCase() : null;

    return res.json({
      txhash,
      node: CFG.injNode,
      rpc: json,
      raw: text,
    });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
});

// ---------- Keys ----------
app.get("/api/keys/list", async (_req, res) => {
  if (KEYLESS_MODE) return rejectKeyless(res, "keyring list");
  const out = await runDocker([
    "keys", "list",
    "--home", "/home/inj/.injective",
    "--keyring-backend", CFG.keyringBackend,
    "--output", "json",
  ]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = parseJsonOrNull(rawSrc);
  const keys = Array.isArray(parsed)
    ? parsed.map((k) => ({ name: k.name, address: k.address, type: k.type })).filter((k) => k.name)
    : [];
  res.json({ keys, cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, raw: rawSrc });
});

app.get("/api/keys/show", async (req, res) => {
  if (KEYLESS_MODE) return rejectKeyless(res, "keyring show");
  const name = String(req.query.name || "").trim();
  if (!name) return res.status(400).json({ error: "name is required" });

  const out = await runDocker([
    "keys", "show", name,
    "--home", "/home/inj/.injective",
    "--keyring-backend", CFG.keyringBackend,
    "--output", "json",
  ]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = parseJsonOrNull(rawSrc);
  if (!parsed) {
    return res.status(out.code === 0 ? 500 : 404).json({
      error: "key not found or non-JSON keyring response",
      cmd: `docker ${out.args.join(" ")}`,
      exitCode: out.code,
      stderr: out.stderr,
      raw: rawSrc,
    });
  }
  res.json({
    name: parsed.name || name,
    address: parsed.address || "",
    type: parsed.type || "",
    pubkey: parsed.pubkey || null,
    cmd: `docker ${out.args.join(" ")}`,
  });
});

app.post("/api/keys/add", async (req, res) => {
  if (KEYLESS_MODE) return rejectKeyless(res, "keyring add");
  const name = String(req.body?.name || "").trim();
  const overwrite = Boolean(req.body?.overwrite);
  const setCurrent = Boolean(req.body?.setCurrent);
  if (!name) return res.status(400).json({ error: "name is required" });
  if (!/^[a-zA-Z0-9._-]{1,64}$/.test(name)) {
    return res.status(400).json({ error: "name must be 1-64 chars: letters, numbers, dot, underscore, hyphen" });
  }

  const existingAddress = await keyAddressByName(name).catch(() => "");
  if (existingAddress && !overwrite) {
    return res.status(409).json({
      error: "key already exists",
      name,
      address: existingAddress,
      hint: "set overwrite=true to recreate it",
    });
  }

  if (existingAddress && overwrite) {
    const del = await runDocker([
      "keys", "delete", name,
      "--home", "/home/inj/.injective",
      "--keyring-backend", CFG.keyringBackend,
      "-y",
    ]);
    if (del.code !== 0) {
      return res.status(500).json({
        error: "failed to delete existing key before overwrite",
        name,
        exitCode: del.code,
        stderr: del.stderr,
      });
    }
  }

  const out = await runDocker([
    "keys", "add", name,
    "--home", "/home/inj/.injective",
    "--keyring-backend", CFG.keyringBackend,
    "--output", "json",
  ]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = parseJsonOrNull(rawSrc);
  const address = String(parsed?.address || await keyAddressByName(name).catch(() => "") || "").trim();

  if (out.code !== 0 || !address) {
    return res.status(500).json({
      error: "failed to create key",
      name,
      exitCode: out.code,
      stderr: out.stderr,
    });
  }

  if (setCurrent) {
    CFG.keyname = name;
    CFG.myAddr = address;
    saveConfig(CFG);
  }

  res.json({
    ok: true,
    name,
    address,
    type: parsed?.type || "",
    setCurrent,
    configSaved: setCurrent,
    note: "key created in the configured local test keyring; mnemonic/raw output is not returned by this API",
  });
});

// ---------- Auth ----------
app.get("/api/auth/status", (req, res) => {
  const address = req.query.address || CFG.myAddr || "";
  if (!address) return res.status(400).json({ error: "address required" });
  return res.json(pwStatus(address));
});
app.post("/api/auth/set_password", requireAdminApi, (req, res) => {
  const { address, password, hint } = req.body || {};
  try { return res.json(pwSet(address, password, hint)); }
  catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
});
app.post("/api/auth/verify_password", rateLimit({ name: "auth-verify-password" }), (req, res) => {
  const { address, password } = req.body || {};
  if (!address || !password) return res.status(400).json({ error: "address & password are required" });
  return res.json(pwVerify(address, password));
});

app.get("/api/accounts/password_status", async (req, res) => {
  try {
    const address = await resolveIdentityAddress(req.query);
    if (!address) return res.status(400).json({ error: "address or resolvable name is required" });
    return res.json(pwStatus(address));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

app.post("/api/accounts/set_password", requireAdminApi, async (req, res) => {
  try {
    const address = await resolveIdentityAddress(req.body || {});
    const { password, hint } = req.body || {};
    return res.json(pwSet(address, password, hint));
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }
});

app.post("/api/accounts/verify_password", rateLimit({ name: "accounts-verify-password" }), async (req, res) => {
  try {
    const address = await resolveIdentityAddress(req.body || {});
    const { password } = req.body || {};
    if (!address || !password) return res.status(400).json({ error: "address/name & password are required" });
    return res.json(pwVerify(address, password));
  } catch (e) {
    return res.status(500).json({ error: String(e.message || e) });
  }
});

// ---- Start ----
const PORT = process.env.PORT || 8787;
const HOST = process.env.HOST || "0.0.0.0";
if (require.main === module) {
  app.listen(PORT, HOST, () => {
    console.log(`Backend ready on http://${HOST}:${PORT}`);
  });
}

module.exports = {
  app,
  codeHash,
  reviewCursor,
  compareReviewDesc,
};
