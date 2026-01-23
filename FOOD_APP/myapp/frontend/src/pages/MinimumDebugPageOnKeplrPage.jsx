// frontend/src/pages/MinimumDebugPageOnKeplrPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import Long from "long";
import { API } from "../api";

import {
  TxBody,
  AuthInfo,
  SignerInfo,
  ModeInfo,
  Fee,
  TxRaw,
  SignDoc,
} from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { Any } from "cosmjs-types/google/protobuf/any";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";

const j = (x) => {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
};

// ----------------------
// Helpers
// ----------------------
function parseCoinAmount(coinStr) {
  const m = String(coinStr || "")
    .trim()
    .match(/^(\d+)([a-zA-Z0-9/:\-_\.]+)$/);
  if (!m) throw new Error(`Invalid coin string: ${coinStr}`);
  return { amount: m[1], denom: m[2] };
}

function coinsFromString(coinStr) {
  const { amount, denom } = parseCoinAmount(coinStr);
  return [{ denom, amount }];
}

function utf8ToBytes(s) {
  return new TextEncoder().encode(s);
}

// base64 <-> bytes
function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToBase64(u8) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

// Keplr signDirect returns either Uint8Array or base64 string depending on version.
// Normalize to Uint8Array.
function ensureBytes(x, label = "bytes") {
  if (x instanceof Uint8Array) return x;
  if (typeof x === "string") return base64ToBytes(x);
  if (Array.isArray(x) && x.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return Uint8Array.from(x);
  }
  throw new Error(`Unsupported ${label} type: ${typeof x}`);
}

function sha256Base64(str) {
  return crypto.subtle.digest("SHA-256", utf8ToBytes(str)).then((hashBuf) => {
    const bytes = new Uint8Array(hashBuf);
    return bytesToBase64(bytes);
  });
}

// Extract wasm event attrs from /api/query/tx response
function getWasmAttrsFromTx(txJson) {
  const evs = txJson?.events || [];
  const wasm = evs.filter((e) => e.type === "wasm");
  const attrs = [];
  for (const e of wasm) for (const a of (e.attributes || [])) attrs.push(a);
  return attrs;
}
function pickAttr(attrs, key) {
  const hit = attrs.find((a) => a.key === key);
  return hit ? hit.value : "";
}

// Injective ethsecp256k1 pubkey proto encode (field 1: bytes key)
// message PubKey { bytes key = 1; }
function encodeInjectiveEthSecp256k1PubKey(pubKeyBytes) {
  const key = pubKeyBytes instanceof Uint8Array ? pubKeyBytes : new Uint8Array(pubKeyBytes);
  const len = key.length;

  const varint = [];
  let n = len;
  while (n >= 0x80) {
    varint.push((n & 0x7f) | 0x80);
    n >>= 7;
  }
  varint.push(n);

  const out = new Uint8Array(1 + varint.length + len);
  out[0] = 0x0a; // field 1, wire type 2
  out.set(varint, 1);
  out.set(key, 1 + varint.length);
  return out;
}

// RPC(=injNode)由来の account_number/sequence を使う
async function fetchRpcAccountBasic(bech32Addr) {
  const r = await fetch(`/api/rpc/account_basic?address=${encodeURIComponent(bech32Addr)}`);
  const js = await r.json();
  if (!r.ok || !js?.ok) throw new Error(js?.error || "rpc account_basic failed");
  return {
    accountNumber: Long.fromString(js.accountNumber, true),
    sequence: Long.fromString(js.sequence, true),
  };
}

// ----------------------
// UI components
// ----------------------
function Section({ title, subtitle, children }) {
  return (
    <div className="p-4 border rounded space-y-3">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{title}</h2>
        {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      {children}
      {hint ? <div className="text-xs text-gray-600">{hint}</div> : null}
    </div>
  );
}

// ----------------------
// Page
// ----------------------
export default function MinimumDebugPageOnKeplrPage() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const [runLog, setRunLog] = useState([]);

  // config
  const [cfg, setCfg] = useState(null);
  const [contract, setContract] = useState("");
  const [rpc, setRpc] = useState("");
  const [chainId, setChainId] = useState("");
  const [defaultFees, setDefaultFees] = useState("1000000000000000inj");
  const [gasLimit, setGasLimit] = useState("400000");

  // keplr state
  const [connected, setConnected] = useState(false);
  const [address, setAddress] = useState("");
  const [keplrPubkey, setKeplrPubkey] = useState(null); // Uint8Array

  // flow IDs
  const [storeId, setStoreId] = useState("");
  const [visitId, setVisitId] = useState("");
  const [reviewId, setReviewId] = useState("");

  // Step4 manual polling state
  const [step4Txhash, setStep4Txhash] = useState("");

  // inputs
  const [storeRef, setStoreRef] = useState("S-001");
  const [code1, setCode1] = useState("code1");
  const [code2, setCode2] = useState("code2");
  const [memo, setMemo] = useState("debug");
  const [rating, setRating] = useState("5");
  const [title, setTitle] = useState("Good");
  const [body, setBody] = useState("This is a test review body");
  const [tipAmount, setTipAmount] = useState("1000000000000000inj");
  const [withdrawDenom, setWithdrawDenom] = useState("inj");

  const storeIdNum = useMemo(() => Number(storeId || "0"), [storeId]);
  const visitIdNum = useMemo(() => Number(visitId || "0"), [visitId]);
  const reviewIdNum = useMemo(() => Number(reviewId || "0"), [reviewId]);

  function appendRunLog(item) {
    setRunLog((prev) => [...prev, { ts: new Date().toISOString(), ...item }]);
  }

  useEffect(() => {
    (async () => {
      const c = await API.config();
      setCfg(c);
      setContract(c.contract || "");
      setRpc(c.injNode || "");
      setChainId(c.chainId || "");
      setDefaultFees(c.defaultFees || "1000000000000000inj");
    })().catch((e) => setOut({ step: "load_config", ok: false, error: String(e) }));
  }, []);

  async function run(step, fn) {
    setBusy(true);
    setOut({ step, running: true });
    try {
      const r = await fn();
      setOut({ step, ok: true, result: r });
      return r;
    } catch (e) {
      setOut({ step, ok: false, error: String(e) });
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function connectKeplr() {
    if (!window.keplr) throw new Error("Keplr not found. Install Keplr and refresh.");
    if (!chainId) throw new Error("chainId is empty");
    if (!rpc) throw new Error("rpc is empty");

    if (window.keplr.experimentalSuggestChain) {
      await window.keplr.experimentalSuggestChain({
        chainId,
        chainName: "Injective Testnet",
        rpc,
        rest: "https://testnet.sentry.lcd.injective.network:443",
        bip44: { coinType: 60 },
        bech32Config: {
          bech32PrefixAccAddr: "inj",
          bech32PrefixAccPub: "injpub",
          bech32PrefixValAddr: "injvaloper",
          bech32PrefixValPub: "injvaloperpub",
          bech32PrefixConsAddr: "injvalcons",
          bech32PrefixConsPub: "injvalconspub",
        },
        currencies: [{ coinDenom: "INJ", coinMinimalDenom: "inj", coinDecimals: 18 }],
        feeCurrencies: [{ coinDenom: "INJ", coinMinimalDenom: "inj", coinDecimals: 18 }],
        stakeCurrency: { coinDenom: "INJ", coinMinimalDenom: "inj", coinDecimals: 18 },
        features: ["cosmwasm"],
      });
    }

    await window.keplr.enable(chainId);
    const key = await window.keplr.getKey(chainId);

    // Injective accounts use compressed pubkey (33 bytes)
    if (!(key.pubKey instanceof Uint8Array) || key.pubKey.length !== 33) {
      throw new Error(`Keplr pubKey length invalid: ${key.pubKey?.length}`);
    }

    setAddress(key.bech32Address);
    setKeplrPubkey(key.pubKey);
    setConnected(true);
  }

  // Polling query tx (handles tx not found)
  async function queryTxViaBackendPoll(txhash, opts = {}) {
    const { timeoutMs = 30000, intervalMs = 800, backoff = 1.25 } = opts;
    const started = Date.now();
    let wait = intervalMs;

    while (true) {
      const r = await fetch(`/api/query/tx?hash=${encodeURIComponent(txhash)}`);
      const js = await r.json();

      if (r.ok && js?.json) return js.json;

      const msg = (js?.error || js?.raw || "").toString();
      const notFound = /not found/i.test(msg) || /tx .* not found/i.test(msg);

      if (!notFound) throw new Error(msg || "query tx failed");

      if (Date.now() - started > timeoutMs) {
        throw new Error(`tx not found within timeout: ${txhash}`);
      }

      await new Promise((res) => setTimeout(res, wait));
      wait = Math.min(3000, Math.floor(wait * backoff));
    }
  }

  async function signAndBroadcastOnly(stepName, executeMsg, funds = []) {
    return run(stepName, async () => {
      if (!connected) throw new Error("Keplr not connected");
      if (!contract) throw new Error("contract is empty");
      if (!chainId) throw new Error("chainId is empty");
      if (!address) throw new Error("address missing");
      if (!keplrPubkey) throw new Error("keplr pubkey missing");

      // account_number/sequence is fetched from RPC source of truth
      const { accountNumber, sequence } = await fetchRpcAccountBasic(address);

      const msg = MsgExecuteContract.fromPartial({
        sender: address,
        contract,
        msg: utf8ToBytes(JSON.stringify(executeMsg)),
        funds,
      });

      const bodyBytes = TxBody.encode(
        TxBody.fromPartial({
          messages: [
            Any.fromPartial({
              typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
              value: MsgExecuteContract.encode(msg).finish(),
            }),
          ],
          memo: "",
          timeoutHeight: Long.UZERO,
        })
      ).finish();

      const injPubAny = Any.fromPartial({
        typeUrl: "/injective.crypto.v1beta1.ethsecp256k1.PubKey",
        value: encodeInjectiveEthSecp256k1PubKey(keplrPubkey),
      });

      const { amount, denom } = parseCoinAmount(defaultFees);
      const fee = Fee.fromPartial({
        amount: [{ denom, amount }],
        gasLimit: Long.fromString(String(gasLimit), true),
      });

      const authInfoBytes = AuthInfo.encode(
        AuthInfo.fromPartial({
          signerInfos: [
            SignerInfo.fromPartial({
              publicKey: injPubAny,
              modeInfo: ModeInfo.fromPartial({
                single: { mode: SignMode.SIGN_MODE_DIRECT },
              }),
              sequence,
            }),
          ],
          fee,
        })
      ).finish();

      const signDoc = SignDoc.fromPartial({
        bodyBytes,
        authInfoBytes,
        chainId,
        accountNumber,
      });

      const signed = await window.keplr.signDirect(chainId, address, signDoc);

      // Normalize returned bytes (Keplr versions differ)
      const signedBodyBytes = ensureBytes(signed.signed.bodyBytes, "signed.bodyBytes");
      const signedAuthInfoBytes = ensureBytes(signed.signed.authInfoBytes, "signed.authInfoBytes");
      const signatureBytes = ensureBytes(signed.signature.signature, "signature.signature");

      const txRaw = TxRaw.fromPartial({
        bodyBytes: signedBodyBytes,
        authInfoBytes: signedAuthInfoBytes,
        signatures: [signatureBytes],
      });

      const txBytes = TxRaw.encode(txRaw).finish();
      const txBytesBase64 = bytesToBase64(txBytes);

      const br = await fetch("/api/tx/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ txBytesBase64 }),
      });
      const js = await br.json();

      if (!br.ok) throw new Error(js?.error || "broadcast failed");
      if (!js.txhash) throw new Error(`broadcast ok but txhash missing: ${JSON.stringify(js).slice(0, 2000)}`);

      return {
        txhash: js.txhash,
        broadcast: js,
        debug: {
          address,
          accountNumber: accountNumber.toString(),
          sequence: sequence.toString(),
          pubkeyLen: keplrPubkey.length,
          pubkeyB64: bytesToBase64(keplrPubkey),
        },
      };
    });
  }

  // ---- Steps ----
  const stepRegisterStore = async () => {
    const res = await signAndBroadcastOnly(
      "Step1: register_store",
      { register_store: { store_ref: storeRef, owner: null } },
      []
    );

    const txJson = await queryTxViaBackendPoll(res.txhash, { timeoutMs: 20000 });
    const attrs = getWasmAttrsFromTx(txJson);
    const sid = pickAttr(attrs, "store_id");
    if (sid) setStoreId(sid);

    appendRunLog({ step: "1.register_store", txhash: res.txhash, storeId: sid || null });
    return { ...res, txJson, attrs };
  };

  const stepProvisionQr = async () => {
    if (!storeIdNum) throw new Error("store_id is empty");

    const c1 = await sha256Base64(code1);
    const c2 = await sha256Base64(code2);

    const res = await signAndBroadcastOnly(
      "Step2: provision_qr_commits",
      { provision_qr_commits: { store_id: storeIdNum, commits: [c1, c2] } },
      []
    );

    // IDs not required; still log txhash
    appendRunLog({ step: "2.provision_qr_commits", txhash: res.txhash, storeId: String(storeIdNum) });
    return res;
  };

  const stepVisitByQr = async () => {
    if (!storeIdNum) throw new Error("store_id is empty");

    const res = await signAndBroadcastOnly(
      "Step3: record_visit_by_qr",
      { record_visit_by_qr: { store_id: storeIdNum, code: code1, memo } },
      []
    );

    const txJson = await queryTxViaBackendPoll(res.txhash, { timeoutMs: 20000 });
    const attrs = getWasmAttrsFromTx(txJson);
    const vid = pickAttr(attrs, "visit_id");
    if (vid) setVisitId(vid);

    appendRunLog({ step: "3.record_visit_by_qr", txhash: res.txhash, storeId: String(storeIdNum), visitId: vid || null });
    return { ...res, txJson, attrs };
  };

  // Step4: broadcast only, manual poll button to extract review_id
  const stepCreateReview = async () => {
    if (!visitIdNum) throw new Error("visit_id is empty");

    const res = await signAndBroadcastOnly(
      "Step4: create_review",
      { create_review: { visit_id: visitIdNum, rating: Number(rating), title, body } },
      []
    );

    setStep4Txhash(res.txhash);
    appendRunLog({ step: "4.create_review", txhash: res.txhash, visitId: String(visitIdNum), reviewId: null });
    return res;
  };

  // Step4 manual polling button
  const step4PollAndSetReviewId = async () => {
    if (!step4Txhash) throw new Error("Step4 txhash is empty");

    const txJson = await run("Step4: poll tx → set review_id", () =>
      queryTxViaBackendPoll(step4Txhash, { timeoutMs: 30000 })
    );

    const attrs = getWasmAttrsFromTx(txJson);
    const rid = pickAttr(attrs, "review_id");
    if (!rid) throw new Error("review_id not found in wasm events");

    setReviewId(rid);
    appendRunLog({ step: "4.create_review.poll", txhash: step4Txhash, reviewId: rid });

    return { txhash: step4Txhash, reviewId: rid, txJson, attrs };
  };

  const stepTip = async () => {
    if (!reviewIdNum) throw new Error("review_id is empty (run Step4 poll first)");

    const funds = coinsFromString(tipAmount);

    const res = await signAndBroadcastOnly(
      "Step5: tip_review_native",
      { tip_review_native: { review_id: reviewIdNum } },
      funds
    );

    appendRunLog({ step: "5.tip_review_native", txhash: res.txhash, reviewId: String(reviewIdNum) });
    return res;
  };

  const stepWithdraw = async () => {
    const res = await signAndBroadcastOnly(
      "Step6: withdraw_tips",
      { withdraw_tips: { to: null, denom: withdrawDenom, amount: null } },
      []
    );

    appendRunLog({ step: "6.withdraw_tips", txhash: res.txhash });
    return res;
  };

  // Run flow up to Step4 broadcast (manual poll required after)
  const runAllToStep4 = async () => {
    setRunLog([]);
    setStep4Txhash("");
    // Keep IDs unless you want reset:
    // setStoreId(""); setVisitId(""); setReviewId("");

    await stepRegisterStore();
    await stepProvisionQr();
    await stepVisitByQr();
    await stepCreateReview();
  };

  const continueFromStep5 = async () => {
    if (!reviewIdNum) throw new Error("review_id is empty. Use Step4 poll button first.");
    await stepTip();
    await stepWithdraw();
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Minimum Debug Page (Keplr)</h1>
        <p className="text-sm text-gray-600">
          Keplrで署名し、バックエンド（broadcast_tx_sync）でブロードキャストします。
          Step4は tx index 遅延対策として「手動ポーリング」ボタンで review_id を回収します。
        </p>
      </div>

      <Section title="Environment (/api/config)">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="space-y-2">
            <div><b>contract</b>: <span className="break-all">{contract}</span></div>
            <div><b>rpc</b>: <span className="break-all">{rpc}</span></div>
            <div><b>chainId</b>: {chainId}</div>
          </div>
          <div className="space-y-2">
            <Field label="defaultFees" hint="例: 1000000000000000inj">
              <input className="w-full border rounded p-2" value={defaultFees} onChange={(e) => setDefaultFees(e.target.value)} />
            </Field>
            <Field label="gasLimit" hint="simulateなし。必要なら大きめに。">
              <input className="w-full border rounded p-2" value={gasLimit} onChange={(e) => setGasLimit(e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Keplr Wallet">
        <div className="flex flex-wrap gap-2 items-center">
          <button disabled={busy} className="px-4 py-2 border rounded font-semibold" onClick={() => run("Connect Keplr", connectKeplr)}>
            Connect Keplr
          </button>
          <div className="text-sm"><b>Status</b>: {connected ? "connected" : "not connected"}</div>
          <div className="text-sm break-all"><b>address</b>: {address || "-"}</div>
        </div>
      </Section>

      <Section title="Flow Runner" subtitle="Run All は Step1〜Step4（broadcast）まで。Step4 の review_id は手動ポーリングで回収してから Continue してください。">
        <div className="flex flex-wrap gap-2">
          <button disabled={busy || !connected} className="px-4 py-2 border rounded font-semibold" onClick={runAllToStep4}>
            Run All (to Step4)
          </button>
          <button disabled={busy || !connected} className="px-4 py-2 border rounded font-semibold" onClick={continueFromStep5}>
            Continue (Step5-6)
          </button>
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={() => setRunLog([])}>
            Clear Progress
          </button>
        </div>
        <div className="pt-2 text-sm">
          <div className="flex flex-wrap gap-3">
            <span><b>store_id</b>: {storeId || "-"}</span>
            <span><b>visit_id</b>: {visitId || "-"}</span>
            <span><b>review_id</b>: {reviewId || "-"}</span>
          </div>
        </div>
      </Section>

      <Section title="Step 1: Register Store">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="store_ref">
            <input className="w-full border rounded p-2" value={storeRef} onChange={(e) => setStoreRef(e.target.value)} />
          </Field>
          <Field label="store_id（自動反映）">
            <input className="w-full border rounded p-2" value={storeId} onChange={(e) => setStoreId(e.target.value)} />
          </Field>
        </div>
        <button disabled={busy || !connected} className="px-3 py-2 border rounded" onClick={stepRegisterStore}>
          Execute register_store
        </button>
      </Section>

      <Section title="Step 2: Provision QR Commits">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="store_id">
            <input className="w-full border rounded p-2" value={storeId} onChange={(e) => setStoreId(e.target.value)} />
          </Field>
          <Field label="code1">
            <input className="w-full border rounded p-2" value={code1} onChange={(e) => setCode1(e.target.value)} />
          </Field>
          <Field label="code2">
            <input className="w-full border rounded p-2" value={code2} onChange={(e) => setCode2(e.target.value)} />
          </Field>
        </div>
        <button disabled={busy || !connected} className="px-3 py-2 border rounded" onClick={stepProvisionQr}>
          Execute provision_qr_commits
        </button>
      </Section>

      <Section title="Step 3: Record Visit by QR">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="store_id">
            <input className="w-full border rounded p-2" value={storeId} onChange={(e) => setStoreId(e.target.value)} />
          </Field>
          <Field label="memo">
            <input className="w-full border rounded p-2" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
          <Field label="visit_id（自動反映）">
            <input className="w-full border rounded p-2" value={visitId} onChange={(e) => setVisitId(e.target.value)} />
          </Field>
        </div>
        <button disabled={busy || !connected} className="px-3 py-2 border rounded" onClick={stepVisitByQr}>
          Execute record_visit_by_qr
        </button>
      </Section>

      <Section title="Step 4: Create Review" subtitle="Step4は broadcast まで行い、review_id の回収は下の手動ボタンで実施します。">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="visit_id">
            <input className="w-full border rounded p-2" value={visitId} onChange={(e) => setVisitId(e.target.value)} />
          </Field>
          <Field label="rating (1..5)">
            <input className="w-full border rounded p-2" value={rating} onChange={(e) => setRating(e.target.value)} />
          </Field>
          <Field label="review_id（手動/自動反映）">
            <input className="w-full border rounded p-2" value={reviewId} onChange={(e) => setReviewId(e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="title">
            <input className="w-full border rounded p-2" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="body">
            <textarea className="w-full border rounded p-2 h-24" value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <button disabled={busy || !connected} className="px-3 py-2 border rounded" onClick={stepCreateReview}>
            Execute create_review (broadcast only)
          </button>

          <button
            disabled={busy || !connected || !step4Txhash}
            className="px-3 py-2 border rounded"
            onClick={step4PollAndSetReviewId}
          >
            Step4: Query (poll) tx → set review_id
          </button>

          <div className="text-xs break-all">
            Step4 txhash: {step4Txhash || "-"}
          </div>
        </div>
      </Section>

      <Section title="Step 5: Tip Review">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="review_id">
            <input className="w-full border rounded p-2" value={reviewId} onChange={(e) => setReviewId(e.target.value)} />
          </Field>
          <Field label="tipAmount (e.g. 1000inj)">
            <input className="w-full border rounded p-2" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} />
          </Field>
          <Field label="withdraw denom">
            <input className="w-full border rounded p-2" value={withdrawDenom} onChange={(e) => setWithdrawDenom(e.target.value)} />
          </Field>
        </div>
        <button disabled={busy || !connected} className="px-3 py-2 border rounded" onClick={stepTip}>
          Execute tip_review_native
        </button>
      </Section>

      <Section title="Step 6: Withdraw Tips">
        <button disabled={busy || !connected} className="px-3 py-2 border rounded" onClick={stepWithdraw}>
          Execute withdraw_tips
        </button>
      </Section>

      <Section title="Run Progress">
        {runLog.length === 0 ? (
          <p className="text-sm text-gray-600">No logs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left">
                  <th className="py-2 pr-2">Time</th>
                  <th className="py-2 pr-2">Step</th>
                  <th className="py-2 pr-2">Txhash</th>
                  <th className="py-2 pr-2">IDs</th>
                </tr>
              </thead>
              <tbody>
                {runLog.map((row, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-2 whitespace-nowrap">{row.ts}</td>
                    <td className="py-2 pr-2 whitespace-nowrap">{row.step}</td>
                    <td className="py-2 pr-2 break-all">
                      {row.txhash ? (
                        <a
                          className="underline"
                          href={`/api/query/tx?hash=${encodeURIComponent(row.txhash)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {row.txhash}
                        </a>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="py-2 pr-2">
                      {[
                        row.storeId ? `store_id=${row.storeId}` : null,
                        row.visitId ? `visit_id=${row.visitId}` : null,
                        row.reviewId ? `review_id=${row.reviewId}` : null,
                      ].filter(Boolean).join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Result (Last Step)">
        <pre className="text-xs whitespace-pre-wrap break-words">{j(out)}</pre>
      </Section>

      <details className="p-4 border rounded">
        <summary className="cursor-pointer font-semibold">Loaded /api/config</summary>
        <pre className="text-xs whitespace-pre-wrap break-words">{j(cfg)}</pre>
      </details>
    </div>
  );
}
