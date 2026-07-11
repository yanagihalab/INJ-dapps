const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "inj-reviews-backend-"));
process.env.DATA_DIR = tempDir;
process.env.ADMIN_API_TOKEN = "test-admin-token";
process.env.RATE_LIMIT_WINDOW_MS = "60000";
process.env.RATE_LIMIT_MAX = "2";
process.env.KEYLESS_MODE = "true";

const { app } = require("../server.js");

function listen() {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}/api` });
    });
  });
}

async function request(baseUrl, pathName, init = {}) {
  const res = await fetch(`${baseUrl}${pathName}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init.headers || {}) },
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { res, text, json };
}

test("admin write APIs require the admin token", async () => {
  const { server, baseUrl } = await listen();
  try {
    const denied = await request(baseUrl, "/config", {
      method: "POST",
      body: JSON.stringify({ contract: "inj1denied" }),
    });
    assert.equal(denied.res.status, 401);

    const allowed = await request(baseUrl, "/config", {
      method: "POST",
      headers: { "X-Admin-Api-Key": "test-admin-token" },
      body: JSON.stringify({ contract: "inj1allowed" }),
    });
    assert.equal(allowed.res.status, 200);
    assert.equal(allowed.json.ok, true);
    assert.equal(allowed.json.CFG.contract, "inj1allowed");
  } finally {
    server.close();
  }
});

test("config is persisted to DATA_DIR/config.json", async () => {
  const { server, baseUrl } = await listen();
  try {
    await request(baseUrl, "/config", {
      method: "POST",
      headers: { "X-Admin-Api-Key": "test-admin-token" },
      body: JSON.stringify({ chainId: "injective-888", defaultFees: "100inj" }),
    });
    const saved = JSON.parse(fs.readFileSync(path.join(tempDir, "config.json"), "utf8"));
    assert.equal(saved.chainId, "injective-888");
    assert.equal(saved.defaultFees, "100inj");
  } finally {
    server.close();
  }
});

test("password verification is rate limited", async () => {
  const { server, baseUrl } = await listen();
  try {
    for (let i = 0; i < 2; i += 1) {
      const res = await request(baseUrl, "/accounts/verify_password", {
        method: "POST",
        body: JSON.stringify({ address: `inj1ratelimit${i}`, password: "pw" }),
      });
      assert.notEqual(res.res.status, 429);
    }
    const limited = await request(baseUrl, "/accounts/verify_password", {
      method: "POST",
      body: JSON.stringify({ address: "inj1ratelimit2", password: "pw" }),
    });
    assert.equal(limited.res.status, 429);
    assert.match(limited.json.message, /時間を置いて再試行/);
  } finally {
    server.close();
  }
});
