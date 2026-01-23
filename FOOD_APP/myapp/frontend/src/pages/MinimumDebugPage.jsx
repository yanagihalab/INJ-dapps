// frontend/src/pages/MinimumDebugPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { API } from "../api";

const j = (x) => {
  try {
    return JSON.stringify(x, null, 2);
  } catch {
    return String(x);
  }
};

function getWasmAttrsFromTx(txJson) {
  const evs = txJson?.events || [];
  const wasm = evs.filter((e) => e.type === "wasm");
  const attrs = [];
  for (const e of wasm) for (const a of e.attributes || []) attrs.push(a);
  return attrs;
}
function pickAttr(attrs, key) {
  const hit = attrs.find((a) => a.key === key);
  return hit ? hit.value : "";
}

// sha256(code) -> base64 (browser)
async function sha256Base64(str) {
  const data = new TextEncoder().encode(str);
  const hashBuf = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hashBuf);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function Badge({ children }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded border text-xs">
      {children}
    </span>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <div className="p-4 border rounded space-y-3">
      <div className="space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {subtitle ? <p className="text-sm text-gray-600">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <div className="space-y-1">
      <div className="text-sm font-medium">{label}</div>
      {children}
      {hint ? <div className="text-xs text-gray-600">{hint}</div> : null}
    </div>
  );
}

export default function MinimumDebugPage() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);

  // last result (for debugging)
  const [out, setOut] = useState(null);

  // RunAll history
  const [runLog, setRunLog] = useState([]); // [{ts, step, txhash, storeId?, visitId?, reviewId?}]

  // config-derived (display only)
  const [contract, setContract] = useState("");
  const [rpc, setRpc] = useState("");
  const [chainId, setChainId] = useState("");
  const [fees, setFees] = useState("");

  // signer keys (backend will use --from)
  const [fromKey, setFromKey] = useState("mykey");
  const [tipperKey, setTipperKey] = useState("mykey");

  // flow state (IDs)
  const [storeId, setStoreId] = useState("");
  const [visitId, setVisitId] = useState("");
  const [reviewId, setReviewId] = useState("");

  // Step4 polling helper state (for manual repoll)
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
      setFees(c.defaultFees || "");
    })().catch((e) => setOut({ step: "load_config", ok: false, error: String(e) }));
  }, []);

  const run = async (step, fn) => {
    setBusy(true);
    setOut({ step, running: true });
    try {
      const r = await fn();
      setOut({ step, ok: true, result: r });
      return r;
    } catch (e) {
      setOut({ step, ok: false, error: String(e?.message || e) });
      throw e;
    } finally {
      setBusy(false);
    }
  };

  // backend wrappers
  const exec = (step, msg, from, amount) =>
    run(step, () => API.execute({ msg, from, amount }));

  const qTx = (step, txhash) =>
    run(step, () =>
      fetch(`/api/query/tx?hash=${encodeURIComponent(txhash)}`).then((r) => r.json())
    );

  // ---- polling helpers ----
  async function qTxOnce(txhash) {
    const r = await fetch(`/api/query/tx?hash=${encodeURIComponent(txhash)}`);
    const js = await r.json();
    if (r.ok && js?.json) return { ok: true, txJson: js.json, raw: js };

    const msg = String(js?.error || js?.raw || "").trim();
    const notFound = /not found/i.test(msg) || /tx .* not found/i.test(msg);
    return { ok: false, notFound, msg: msg || "query tx failed", raw: js };
  }

  async function qTxPoll(txhash, opts = {}) {
    const {
      timeoutMs = 30000,
      intervalMs = 800,
      backoff = 1.25,
      maxIntervalMs = 3000,
    } = opts;

    const started = Date.now();
    let wait = intervalMs;

    while (true) {
      const res = await qTxOnce(txhash);
      if (res.ok) return res.txJson;

      // not found -> keep polling
      if (res.notFound) {
        if (Date.now() - started > timeoutMs) {
          const e = new Error(`tx not found within timeout: ${txhash}`);
          e.details = res;
          throw e;
        }
        await new Promise((r) => setTimeout(r, wait));
        wait = Math.min(maxIntervalMs, Math.floor(wait * backoff));
        continue;
      }

      // other errors -> stop
      const e = new Error(res.msg);
      e.details = res;
      throw e;
    }
  }

  // ---- Step 1: Register Store ----
  const stepRegisterStore = async () => {
    const r = await exec(
      "Execute: register_store",
      { register_store: { store_ref: storeRef, owner: null } },
      fromKey,
      null
    );

    const txhash = r?.txhash || r?.json?.txhash || null;
    if (!txhash) {
      appendRunLog({ step: "1.register_store", txhash: null });
      return r;
    }

    const tx = await qTx("QueryTx: register_store", txhash);
    const attrs = getWasmAttrsFromTx(tx.json);
    const sid = pickAttr(attrs, "store_id");
    if (sid) setStoreId(sid);

    appendRunLog({ step: "1.register_store", txhash, storeId: sid || null });
    return { exec: r, tx };
  };

  // ---- Step 2: Provision QR commits ----
  const stepProvisionQr = async () => {
    if (!storeIdNum) throw new Error("store_id is empty");

    const c1 = await sha256Base64(code1);
    const c2 = await sha256Base64(code2);

    const r = await exec(
      "Execute: provision_qr_commits",
      { provision_qr_commits: { store_id: storeIdNum, commits: [c1, c2] } },
      fromKey,
      null
    );

    const txhash = r?.txhash || r?.json?.txhash || null;
    if (!txhash) {
      appendRunLog({
        step: "2.provision_qr_commits",
        txhash: null,
        storeId: String(storeIdNum),
      });
      return r;
    }

    const tx = await qTx("QueryTx: provision_qr_commits", txhash);

    appendRunLog({
      step: "2.provision_qr_commits",
      txhash,
      storeId: String(storeIdNum),
    });

    return { commits: { c1, c2 }, exec: r, tx };
  };

  // ---- Step 3: Record Visit by QR ----
  const stepVisitByQr = async () => {
    if (!storeIdNum) throw new Error("store_id is empty");

    const r = await exec(
      "Execute: record_visit_by_qr",
      { record_visit_by_qr: { store_id: storeIdNum, code: code1, memo } },
      fromKey,
      null
    );

    const txhash = r?.txhash || r?.json?.txhash || null;
    if (!txhash) {
      appendRunLog({
        step: "3.record_visit_by_qr",
        txhash: null,
        storeId: String(storeIdNum),
      });
      return r;
    }

    // visit_id もインデックス遅延が出るのでポーリングで確実化
    const txJson = await run("PollTx: record_visit_by_qr", () => qTxPoll(txhash, { timeoutMs: 20000 }));
    const attrs = getWasmAttrsFromTx(txJson);
    const vid = pickAttr(attrs, "visit_id");
    if (vid) setVisitId(vid);

    appendRunLog({
      step: "3.record_visit_by_qr",
      txhash,
      storeId: String(storeIdNum),
      visitId: vid || null,
    });
    return { exec: r, txJson };
  };

  // ---- Step 4: Create Review (polling mandatory) ----
  const stepCreateReview = async () => {
    if (!visitIdNum) throw new Error("visit_id is empty");

    const r = await exec(
      "Execute: create_review",
      {
        create_review: {
          visit_id: visitIdNum,
          rating: Number(rating),
          title,
          body,
        },
      },
      fromKey,
      null
    );

    const txhash = r?.txhash || r?.json?.txhash || null;
    if (!txhash) {
      appendRunLog({
        step: "4.create_review",
        txhash: null,
        visitId: String(visitIdNum),
      });
      throw new Error("create_review returned no txhash");
    }

    // keep txhash for manual repoll
    setStep4Txhash(txhash);

    // mandatory polling
    const txJson = await run("PollTx: create_review (mandatory)", () => qTxPoll(txhash, { timeoutMs: 30000 }));
    const attrs = getWasmAttrsFromTx(txJson);
    const rid = pickAttr(attrs, "review_id");
    if (!rid) {
      const e = new Error("review_id not found in wasm events (create_review)");
      e.details = { txhash, txJson };
      throw e;
    }
    setReviewId(rid);

    appendRunLog({
      step: "4.create_review",
      txhash,
      visitId: String(visitIdNum),
      reviewId: rid,
    });

    return { exec: r, txJson };
  };

  // ---- Step 4 manual repoll button ----
  const step4ManualPoll = async () => {
    if (!step4Txhash) throw new Error("Step4 txhash is empty");

    const txJson = await run("Step4: manual poll tx", () => qTxPoll(step4Txhash, { timeoutMs: 30000 }));
    const attrs = getWasmAttrsFromTx(txJson);
    const rid = pickAttr(attrs, "review_id");
    if (!rid) throw new Error("review_id not found in wasm events");
    setReviewId(rid);

    appendRunLog({
      step: "4.create_review.manual_poll",
      txhash: step4Txhash,
      reviewId: rid,
    });

    return { txhash: step4Txhash, reviewId: rid, txJson };
  };

  // ---- Step 5: Tip Review ----
  const stepTip = async () => {
    if (!reviewIdNum) throw new Error("review_id is empty");

    const r = await exec(
      "Execute: tip_review_native",
      { tip_review_native: { review_id: reviewIdNum } },
      tipperKey,
      tipAmount
    );

    const txhash = r?.txhash || r?.json?.txhash || null;
    if (!txhash) {
      appendRunLog({
        step: "5.tip_review_native",
        txhash: null,
        reviewId: String(reviewIdNum),
      });
      return r;
    }

    const tx = await qTx("QueryTx: tip_review_native", txhash);

    appendRunLog({
      step: "5.tip_review_native",
      txhash,
      reviewId: String(reviewIdNum),
    });

    return { exec: r, tx };
  };

  // ---- Step 6: Withdraw Tips ----
  const stepWithdraw = async () => {
    const r = await exec(
      "Execute: withdraw_tips",
      { withdraw_tips: { to: null, denom: withdrawDenom, amount: null } },
      fromKey,
      null
    );

    const txhash = r?.txhash || r?.json?.txhash || null;
    if (!txhash) {
      appendRunLog({ step: "6.withdraw_tips", txhash: null });
      return r;
    }

    const tx = await qTx("QueryTx: withdraw_tips", txhash);

    appendRunLog({ step: "6.withdraw_tips", txhash });

    return { exec: r, tx };
  };

  const runAll = async () => {
    setRunLog([]);
    await stepRegisterStore();
    await stepProvisionQr();
    await stepVisitByQr();
    // Step4 includes mandatory polling
    await stepCreateReview();
    await stepTip();
    await stepWithdraw();
  };

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">Minimum Debug Page</h1>
        <p className="text-sm text-gray-600">
          ユーザー導線（店舗準備 → 来店 → レビュー → 投げ銭 → 引き出し）をページ上のボタンで順序立てて確認します。
          Step4(create_review) は tx index 遅延対策としてポーリング必須です。
        </p>
      </div>

      <Section
        title="Environment"
        subtitle="バックエンド /api/config の値を表示します（Tx の署名・実行先・手数料のベース）。"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="space-y-2">
            <div><Badge>contract</Badge> <span className="break-all">{contract}</span></div>
            <div><Badge>rpc</Badge> <span className="break-all">{rpc}</span></div>
          </div>
          <div className="space-y-2">
            <div><Badge>chainId</Badge> {chainId}</div>
            <div><Badge>fees</Badge> {fees}</div>
          </div>
        </div>
      </Section>

      <Section
        title="Signers"
        subtitle="どの鍵で Tx を送るかを指定します（server.js が --from に渡します）。"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="fromKey（通常操作）" hint="register_store / provision_qr_commits / record_visit_by_qr / create_review / withdraw_tips">
            <input className="w-full border rounded p-2" value={fromKey} onChange={(e) => setFromKey(e.target.value)} />
          </Field>
          <Field label="tipperKey（投げ銭）" hint="tip_review_native の送信者">
            <input className="w-full border rounded p-2" value={tipperKey} onChange={(e) => setTipperKey(e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section
        title="Flow Runner"
        subtitle="Run All は Step 1〜6 を順に実行します。完了するたびに txhash が下の Progress に追加されます。"
      >
        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="px-4 py-2 border rounded font-semibold" onClick={runAll}>
            Run All
          </button>
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={() => setRunLog([])}>
            Clear Progress
          </button>
        </div>

        <div className="pt-2 text-sm">
          <div className="flex flex-wrap gap-2">
            <Badge>store_id</Badge> <span>{storeId || "-"}</span>
            <Badge>visit_id</Badge> <span>{visitId || "-"}</span>
            <Badge>review_id</Badge> <span>{reviewId || "-"}</span>
          </div>
        </div>
      </Section>

      <Section
        title="Step 1: Register Store"
        subtitle="店舗を登録します。成功すると wasm event から store_id を自動抽出します。"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="store_ref" hint="店舗識別子（文字列）">
            <input className="w-full border rounded p-2" value={storeRef} onChange={(e) => setStoreRef(e.target.value)} />
          </Field>
          <Field label="store_id（結果）" hint="実行後に自動で埋まります（手動上書きも可）">
            <input className="w-full border rounded p-2" value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="auto" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={stepRegisterStore}>
            Execute register_store
          </button>
        </div>
      </Section>

      <Section
        title="Step 2: Provision QR Commits"
        subtitle="来店用 QR のコミット（base64(sha256(code))) を補充します。code1/code2 はページ側で SHA-256→base64 変換して送ります。"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="store_id（対象）">
            <input className="w-full border rounded p-2" value={storeId} onChange={(e) => setStoreId(e.target.value)} />
          </Field>
          <Field label="code1" hint="来店で提示する平文コード">
            <input className="w-full border rounded p-2" value={code1} onChange={(e) => setCode1(e.target.value)} />
          </Field>
          <Field label="code2" hint="予備コード（同時にコミット補充）">
            <input className="w-full border rounded p-2" value={code2} onChange={(e) => setCode2(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={stepProvisionQr}>
            Execute provision_qr_commits
          </button>
        </div>
      </Section>

      <Section
        title="Step 3: Record Visit by QR"
        subtitle="来店記録を作ります。visit_id は確定が必要なのでポーリングで取得します。"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="store_id">
            <input className="w-full border rounded p-2" value={storeId} onChange={(e) => setStoreId(e.target.value)} />
          </Field>
          <Field label="code（code1を使用）">
            <input className="w-full border rounded p-2" value={code1} onChange={(e) => setCode1(e.target.value)} />
          </Field>
          <Field label="memo">
            <input className="w-full border rounded p-2" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </Field>
          <Field label="visit_id（結果）" hint="ポーリング後に自動で埋まります">
            <input className="w-full border rounded p-2" value={visitId} onChange={(e) => setVisitId(e.target.value)} placeholder="auto" />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={stepVisitByQr}>
            Execute record_visit_by_qr (poll)
          </button>
        </div>
      </Section>

      <Section
        title="Step 4: Create Review"
        subtitle="レビューを投稿します。review_id の確定取得は必須のため、tx をポーリングして wasm event から抽出します。"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="visit_id">
            <input className="w-full border rounded p-2" value={visitId} onChange={(e) => setVisitId(e.target.value)} />
          </Field>
          <Field label="rating (1..5)">
            <input className="w-full border rounded p-2" value={rating} onChange={(e) => setRating(e.target.value)} />
          </Field>
          <Field label="review_id（結果）">
            <input className="w-full border rounded p-2" value={reviewId} onChange={(e) => setReviewId(e.target.value)} placeholder="auto" />
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
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={stepCreateReview}>
            Execute create_review (poll mandatory)
          </button>

          <button disabled={busy || !step4Txhash} className="px-3 py-2 border rounded" onClick={step4ManualPoll}>
            Step4 manual poll → set review_id
          </button>

          <div className="text-xs break-all">
            Step4 txhash: {step4Txhash || "-"}
          </div>
        </div>
      </Section>

      <Section
        title="Step 5: Tip Review"
        subtitle="review_id に対して投げ銭します。tipAmount は denom 付き（例: 1000inj）で指定します。"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="review_id">
            <input className="w-full border rounded p-2" value={reviewId} onChange={(e) => setReviewId(e.target.value)} />
          </Field>
          <Field label="tipAmount (--amount)">
            <input className="w-full border rounded p-2" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} />
          </Field>
          <Field label="tipperKey">
            <input className="w-full border rounded p-2" value={tipperKey} onChange={(e) => setTipperKey(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={stepTip}>
            Execute tip_review_native
          </button>
        </div>
      </Section>

      <Section
        title="Step 6: Withdraw Tips"
        subtitle="投げ銭を引き出します。denom は通常 inj です。"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="withdraw denom">
            <input className="w-full border rounded p-2" value={withdrawDenom} onChange={(e) => setWithdrawDenom(e.target.value)} />
          </Field>
          <Field label="fromKey">
            <input className="w-full border rounded p-2" value={fromKey} onChange={(e) => setFromKey(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="px-3 py-2 border rounded" onClick={stepWithdraw}>
            Execute withdraw_tips
          </button>
        </div>
      </Section>

      <Section
        title="Run Progress"
        subtitle="txhash をクリックすると /api/query/tx の結果を別タブで開きます。"
      >
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
                      ]
                        .filter(Boolean)
                        .join(", ") || "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Result (Last Step)" subtitle="最後に実行したステップの生レスポンス（デバッグ用）">
        <pre className="text-xs whitespace-pre-wrap break-words">{j(out)}</pre>
      </Section>

      <details className="p-4 border rounded">
        <summary className="cursor-pointer font-semibold">Loaded /api/config</summary>
        <pre className="text-xs whitespace-pre-wrap break-words">{j(cfg)}</pre>
      </details>
    </div>
  );
}
