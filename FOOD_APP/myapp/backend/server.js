// backend/server.js
// Local dev only. Runs whitelisted injectived commands via host docker (docker.sock).
// Exposes API consumed by the Vite front-end.
// Security: do NOT expose to the internet.

const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use((req, _res, next) => {
  console.log(`[REQ] ${req.method} ${req.url}`);
  next();
});

// ---- Data dir for app-internal password store ----
const DATA_DIR = process.env.DATA_DIR || "/data";
fs.mkdirSync(DATA_DIR, { recursive: true });
const AUTH_PATH = path.join(DATA_DIR, "auth_store.json");

function readJsonSafe(p) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return {}; }
}
function writeJsonSafe(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2)); }

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
let CFG = {
  keyname: process.env.KEYNAME || "mykey",
  myAddr: process.env.MY_ADDR || "",
  codeId: process.env.CODE_ID || "",
  contract: process.env.CONTRACT || "",
  injNode: process.env.INJ_NODE || "https://testnet.sentry.tm.injective.network:443",
  chainId: process.env.INJ_CHAIN_ID || "injective-888",
  injectiveHomeHostPath: process.env.INJ_HOME_HOST_PATH || "",
  gasAdjustment: process.env.GAS_ADJ || "1.6",
  defaultFees: process.env.DEFAULT_FEES || "1000000000000000inj",
  keyringBackend: process.env.KEYRING_BACKEND || "test",
  injectiveImage: process.env.INJ_IMAGE || "injective-ubuntu:latest",
};

// ---- docker helpers ----
function dockerArgs(entrypointArgs, dockerFlags = []) {
  const args = ["run", "--rm", ...dockerFlags];
  if (!CFG.injectiveHomeHostPath) {
    console.warn("[WARN] INJ_HOME_HOST_PATH is not set; some calls may fail.");
  } else {
    args.push("-v", `${CFG.injectiveHomeHostPath}:/home/inj/.injective`);
  }
  args.push("--entrypoint", "injectived", CFG.injectiveImage, ...entrypointArgs);
  return args;
}
function runDocker(entrypointArgs) {
  return new Promise((resolve) => {
    const args = dockerArgs(entrypointArgs);
    const child = spawn("docker", args, { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => resolve({ code, stdout, stderr, args }));
  });
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

// ---- API ----
app.get("/api/health", (_req, res) => {
  const hasKeyPath = !!CFG.injectiveHomeHostPath;
  res.json({ ok: true, hasKeyPath, node: CFG.injNode, chainId: CFG.chainId });
});

// config
app.get("/api/config", (_req, res) => res.json(CFG));
app.post("/api/config", (req, res) => {
  const allow = [
    "keyname","myAddr","codeId","contract","injNode","chainId",
    "injectiveHomeHostPath","gasAdjustment","defaultFees","keyringBackend","injectiveImage"
  ];
  for (const k of allow) if (k in req.body) CFG[k] = req.body[k];
  res.json({ ok: true, CFG });
});

// bank balance
app.get("/api/balance", async (req, res) => {
  const addr = req.query.address || CFG.myAddr;
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
  const out = await runDocker(["query", "wasm", "contract", address, "--node", CFG.injNode, "-o", "json"]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseTxJson(rawSrc);
  res.json({ cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

// smart query
app.post("/api/query/smart", async (req, res) => {
  const contract = req.body.contract || CFG.contract;
  const msg = req.body.msg || {};

  const out = await runDocker([
    "query","wasm","contract-state","smart",
    contract, JSON.stringify(msg),
    "--node", CFG.injNode,
    "-o", "json",
  ]);

  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseSmartJson(rawSrc);

  res.json({ cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

// query tx
app.get("/api/query/tx", async (req, res) => {
  const h = req.query.hash;
  if (!h) return res.status(400).json({ error: "hash is required" });

  const out = await runDocker(["query","tx", h, "--node", CFG.injNode, "-o", "json"]);
  const rawSrc = (out.stdout && out.stdout.trim().length > 0) ? out.stdout : out.stderr;
  const parsed = tryParseTxJson(rawSrc);

  res.json({ cmd: `docker ${out.args.join(" ")}`, exitCode: out.code, stderr: out.stderr, ...parsed });
});

// tx execute (backend-signing)
app.post("/api/tx/execute", async (req, res) => {
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

// ---------- Auth ----------
app.get("/api/auth/status", (req, res) => {
  const address = req.query.address || CFG.myAddr || "";
  if (!address) return res.status(400).json({ error: "address required" });
  return res.json(pwStatus(address));
});
app.post("/api/auth/set_password", (req, res) => {
  const { address, password, hint } = req.body || {};
  try { return res.json(pwSet(address, password, hint)); }
  catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
});
app.post("/api/auth/verify_password", (req, res) => {
  const { address, password } = req.body || {};
  if (!address || !password) return res.status(400).json({ error: "address & password are required" });
  return res.json(pwVerify(address, password));
});

// ---- Start ----
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Backend ready on http://localhost:${PORT}`);
});
