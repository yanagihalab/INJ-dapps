// Local dev only. Runs whitelisted injectived commands via host docker.
// Exposes API consumed by the Vite front-end.
// Security: do NOT expose to the internet.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- Data dir for app-internal password store ----
const DATA_DIR = process.env.DATA_DIR || '/data';
fs.mkdirSync(DATA_DIR, { recursive: true });
const AUTH_PATH = path.join(DATA_DIR, 'auth_store.json');
function readJsonSafe(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } }
function writeJsonSafe(p, o) { fs.writeFileSync(p, JSON.stringify(o, null, 2)); }
function loadAuthDb() {
  const db = readJsonSafe(AUTH_PATH);
  db.users = db.users || {}; // { [addressLower]: {salt,hash,hint,updatedAt} }
  return db;
}
function saveAuthDb(db) { writeJsonSafe(AUTH_PATH, db); }
function pwSet(address, password, hint) {
  const addr = String(address || '').toLowerCase();
  if (!addr || !password) throw new Error('address & password are required');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  const db = loadAuthDb();
  db.users[addr] = { salt, hash, hint: hint || '', updatedAt: new Date().toISOString() };
  saveAuthDb(db);
  return { ok: true, address: addr, updatedAt: db.users[addr].updatedAt };
}
function pwVerify(address, password) {
  const addr = String(address || '').toLowerCase();
  const db = loadAuthDb();
  const rec = db.users[addr];
  if (!rec) return { ok: false, reason: 'not_set', address: addr };
  const cand = crypto.scryptSync(password, rec.salt, 64);
  const stored = Buffer.from(rec.hash, 'hex');
  const ok = stored.length === cand.length && crypto.timingSafeEqual(stored, cand);
  return { ok, address: addr, updatedAt: rec.updatedAt };
}
function pwStatus(address) {
  const addr = String(address || '').toLowerCase();
  const db = loadAuthDb();
  const rec = db.users[addr];
  return { address: addr, hasPassword: !!rec, hint: rec?.hint ? true : false, updatedAt: rec?.updatedAt || null };
}

// ---- Config (editable via /api/config) ----
let CFG = {
  keyname: process.env.KEYNAME || 'mykey',
  myAddr: process.env.MY_ADDR || '',
  codeId: process.env.CODE_ID || '',
  contract: process.env.CONTRACT || '',
  injNode: process.env.INJ_NODE || 'https://testnet.sentry.tm.injective.network:443', // 'https://k8s.testnet.tm.injective.network:443',
  chainId: process.env.INJ_CHAIN_ID || 'injective-888',
  injectiveHomeHostPath: process.env.INJ_HOME_HOST_PATH || '', // absolute host path
  gasAdjustment: '1.5',
  defaultFees: '900000000000000inj',
};

// ---- docker helpers ----
function dockerArgs(entrypointArgs) {
  const args = ['run', '--rm'];
  if (!CFG.injectiveHomeHostPath) {
    console.warn('[WARN] INJ_HOME_HOST_PATH is not set; some calls may fail.');
  } else {
    args.push('-v', `${CFG.injectiveHomeHostPath}:/home/inj/.injective`);
  }
  args.push('--entrypoint', 'injectived', 'injective-ubuntu', ...entrypointArgs);
  return args;
}
function runDocker(entrypointArgs) {
  return new Promise((resolve) => {
    const args = dockerArgs(entrypointArgs);
    const child = spawn('docker', args, { shell: false });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('close', (code) => resolve({ code, stdout, stderr, args }));
  });
}

// ---- parse helpers ----
function tryParseTxJson(raw) {
  const lines = raw.split('\n');
  if (lines[0] && /^gas estimate:\s*\d+/.test(lines[0])) lines.shift();
  const cleaned = lines.join('\n').trim();
  try { return { json: JSON.parse(cleaned), raw }; }
  catch { return { json: null, raw, note: 'Failed to parse JSON (returning raw).' }; }
}
function tryParseSmartJson(raw) {
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.data !== 'undefined' && typeof obj.data === 'string') {
      try { obj.data = JSON.parse(obj.data); } catch {}
    }
    return { json: obj, raw };
  } catch {
    return { json: null, raw, note: 'Failed to parse JSON (returning raw).' };
  }
}
function buildExecuteArgs(contract, msgObj, { amount, fees } = {}) {
  const base = [
    'tx', 'wasm', 'execute', contract, JSON.stringify(msgObj),
    '--from', CFG.keyname,
    '--home', '/home/inj/.injective', '--keyring-backend', 'test',
    '--node', CFG.injNode, '--chain-id', CFG.chainId,
    '--gas', 'auto', '--gas-adjustment', CFG.gasAdjustment,
    '--fees', fees || CFG.defaultFees,
    '-b', 'sync', '-y', '-o', 'json',
  ];
  if (amount) base.push('--amount', amount);
  return base;
}

// keys list text fallback parser
function parseKeysList(raw) {
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return arr
        .map((k) => ({ name: k.name, address: k.address, type: k.type }))
        .filter((k) => k.name && k.address);
    }
  } catch {}
  const out = [];
  const re = /name:\s*([^\n]+)[\s\S]*?address:\s*([^\s\n]+)/g;
  let m;
  while ((m = re.exec(raw))) out.push({ name: m[1].trim(), address: m[2].trim() });
  return out;
}

// ---- API ----

// health
app.get('/api/health', (req, res) => {
  const hasKeyPath = !!CFG.injectiveHomeHostPath;
  const hp = CFG.myAddr ? pwStatus(CFG.myAddr) : { hasPassword: false };
  res.json({
    ok: true,
    hasKeyPath,
    node: CFG.injNode,
    chainId: CFG.chainId,
    hasPassword: !!hp.hasPassword,
  });
});

// config
app.get('/api/config', (req, res) => res.json(CFG));
app.post('/api/config', (req, res) => {
  const allow = ['keyname','myAddr','codeId','contract','injNode','chainId','injectiveHomeHostPath','gasAdjustment','defaultFees'];
  for (const k of allow) if (k in req.body) CFG[k] = req.body[k];
  res.json({ ok: true, CFG });
});

// simple bank balance (debug)
app.get('/api/balance', async (req, res) => {
  const addr = req.query.address || CFG.myAddr;
  const out = await runDocker(['query', 'bank', 'balances', addr, '--node', CFG.injNode, '-o', 'json']);
  const parsed = tryParseTxJson(out.stdout);
  res.json({ cmd: out.args.join(' '), ...parsed });
});

// list-contract(s)-by-code (both variants)
app.get('/api/query/list-contracts-by-code', async (req, res) => {
  const codeId = req.query.code_id || CFG.codeId;
  const try1 = await runDocker(['query','wasm','list-contract-by-code', codeId, '--node', CFG.injNode, '-o', 'json']);
  let parsed = tryParseTxJson(try1.stdout);
  let contracts = parsed.json?.contracts || [];
  if (!Array.isArray(contracts) || contracts.length === 0) {
    const try2 = await runDocker(['query','wasm','list-contracts-by-code', codeId, '--node', CFG.injNode, '-o', 'json']);
    parsed = tryParseTxJson(try2.stdout);
    contracts = parsed.json?.contracts || [];
  }
  res.json({ contracts, raw: parsed.raw });
});

app.get('/api/query/contract', async (req, res) => {
  const address = req.query.address || CFG.contract;
  const out = await runDocker(['query','wasm','contract', address, '--node', CFG.injNode, '-o', 'json']);
  const parsed = tryParseTxJson(out.stdout);
  res.json({ ...parsed });
});

app.post('/api/query/smart', async (req, res) => {
  const contract = req.body.contract || CFG.contract;
  const msg = req.body.msg || {};
  const out = await runDocker(['query','wasm','contract-state','smart', contract, JSON.stringify(msg), '--node', CFG.injNode, '-o', 'json']);
  const parsed = tryParseSmartJson(out.stdout);
  res.json({ ...parsed });
});

app.get('/api/query/tx', async (req, res) => {
  const h = req.query.hash;
  if (!h) return res.status(400).json({ error: 'hash is required' });
  const out = await runDocker(['query','tx', h, '--node', CFG.injNode, '-o', 'json']);
  const parsed = tryParseTxJson(out.stdout);
  res.json({ ...parsed });
});

app.post('/api/tx/execute', async (req, res) => {
  const contract = req.body.contract || CFG.contract;
  const msg = req.body.msg || {};
  const amount = req.body.amount;
  const fees = req.body.fees;
  const args = buildExecuteArgs(contract, msg, { amount, fees });
  const out = await runDocker(args);
  const parsed = tryParseTxJson(out.stdout);
  const txhash = parsed.json?.txhash || parsed.json?.tx_response?.txhash || null;
  res.json({ txhash, stderr: out.stderr, ...parsed });
});

// convenience steps
app.get('/api/steps/stores', async (req, res) => {
  const q = { stores: { start_after: null, limit: 50 } };
  const out = await runDocker(['query','wasm','contract-state','smart', CFG.contract, JSON.stringify(q), '--node', CFG.injNode, '-o', 'json']);
  res.json(tryParseSmartJson(out.stdout));
});
app.get('/api/steps/tips_for_review', async (req, res) => {
  const review_id = Number(req.query.review_id || 1);
  const q = { tips_for_review: { review_id } };
  const out = await runDocker(['query','wasm','contract-state','smart', CFG.contract, JSON.stringify(q), '--node', CFG.injNode, '-o', 'json']);
  res.json(tryParseSmartJson(out.stdout));
});
// optional: visits_by_visitor (GET)
app.get('/api/steps/visits_by_visitor', async (req, res) => {
  const visitor = String(req.query.visitor || CFG.myAddr || '');
  const start_after = req.query.start_after ? Number(req.query.start_after) : null;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const q = { visits_by_visitor: { visitor, start_after, limit } };
  const out = await runDocker(['query','wasm','contract-state','smart', CFG.contract, JSON.stringify(q), '--node', CFG.injNode, '-o', 'json']);
  res.json(tryParseSmartJson(out.stdout));
});

// ---------- Keys (test keyring) ----------
app.get('/api/keys/list', async (req, res) => {
  const out = await runDocker([
    'keys','list',
    '--home','/home/inj/.injective','--keyring-backend','test',
    '--output','json'
  ]);
  let keys = parseKeysList(out.stdout);
  if (!keys.length) { // retry without json
    const out2 = await runDocker(['keys','list','--home','/home/inj/.injective','--keyring-backend','test']);
    keys = parseKeysList(out2.stdout);
    return res.json({ keys, raw: out2.stdout, stderr: out2.stderr });
  }
  res.json({ keys, raw: out.stdout, stderr: out.stderr });
});

app.get('/api/keys/show', async (req, res) => {
  const name = req.query.name;
  if (!name) return res.status(400).json({ error: 'name is required' });
  const out = await runDocker([
    'keys','show', name,
    '--home','/home/inj/.injective','--keyring-backend','test',
    '--output','json'
  ]);
  try {
    const j = JSON.parse(out.stdout);
    return res.json({ name: j.name || name, address: j.address || '', raw: out.stdout });
  } catch {
    // fallback: address only
    const out2 = await runDocker([
      'keys','show', name, '--address',
      '--home','/home/inj/.injective','--keyring-backend','test'
    ]);
    return res.json({ name, address: out2.stdout.trim(), raw: out2.stdout, stderr: out.stderr });
  }
});

app.post('/api/keys/add', async (req, res) => {
  const { name, overwrite = false, recover = false, mnemonic = '', algo = '' } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name is required' });
  const args = [
    'keys','add', name,
    '--home','/home/inj/.injective','--keyring-backend','test',
    '--output','json'
  ];
  if (overwrite) args.push('--overwrite');
  if (algo) { args.push('--algo', String(algo)); }
  if (recover) args.push('--recover'); // NOTE: interactive – mnemonic may not be read non-interactively
  const out = await runDocker(args);
  let resp = { raw: out.stdout, stderr: out.stderr };
  try {
    const j = JSON.parse(out.stdout);
    resp = {
      created: true,
      name: j.name || name,
      address: j.address || '',
      mnemonic: j.mnemonic || '',
      raw: out.stdout, stderr: out.stderr
    };
  } catch {}
  res.json(resp);
});

// ---------- Auth (app-internal password) ----------
app.get('/api/auth/status', (req, res) => {
  const address = req.query.address || CFG.myAddr || '';
  if (!address) return res.status(400).json({ error: 'address required' });
  return res.json(pwStatus(address));
});
app.post('/api/auth/set_password', (req, res) => {
  const { address, password, hint } = req.body || {};
  try { return res.json(pwSet(address, password, hint)); }
  catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
});
app.post('/api/auth/verify_password', (req, res) => {
  const { address, password } = req.body || {};
  if (!address || !password) return res.status(400).json({ error: 'address & password are required' });
  return res.json(pwVerify(address, password));
});

// ---- Compatibility aliases (/api/accounts/*) ----
app.get('/api/accounts/password_status', (req, res) => {
  const address = req.query.address || CFG.myAddr || '';
  if (!address) return res.status(400).json({ error: 'address required' });
  return res.json(pwStatus(address));
});
app.post('/api/accounts/set_password', (req, res) => {
  const { address, password, hint } = req.body || {};
  try { return res.json(pwSet(address, password, hint)); }
  catch (e) { return res.status(400).json({ error: String(e.message || e) }); }
});
app.post('/api/accounts/verify_password', (req, res) => {
  const { address, password } = req.body || {};
  if (!address || !password) return res.status(400).json({ error: 'address & password are required' });
  return res.json(pwVerify(address, password));
});
app.post('/api/accounts/remove_password', (req, res) => {
  const { address } = req.body || {};
  const addr = String(address || '').toLowerCase();
  const db = loadAuthDb();
  if (db.users[addr]) { delete db.users[addr]; saveAuthDb(db); }
  return res.json({ ok: true, address: addr });
});

// ==== 互換エイリアス: /api/auth/* -> /api/accounts/* ====
// POST /api/auth/set_password
app.post('/api/auth/set_password', (req, res) => {
  req.url = '/api/accounts/set_password';
  app._router.handle(req, res, () => {});
});

// GET or POST /api/auth/status
app.get('/api/auth/status', (req, res) => {
  req.url = '/api/accounts/password_status' + (req._parsedUrl.search || '');
  app._router.handle(req, res, () => {});
});
app.post('/api/auth/status', (req, res) => {
  const query = new URLSearchParams({
    address: (req.body?.address || ''),
    name:    (req.body?.name || ''),
  }).toString();
  req.url = '/api/accounts/password_status?' + query;
  app._router.handle(req, res, () => {});
});

// POST /api/auth/verify_password
app.post('/api/auth/verify_password', (req, res) => {
  req.url = '/api/accounts/verify_password';
  app._router.handle(req, res, () => {});
});


// ---- Start ----
const PORT = process.env.PORT || 8787;
app.listen(PORT, () => {
  console.log(`Backend ready on http://localhost:${PORT}`);
});

