import React, { useEffect, useState } from "react";
import { API } from "../../api.js";
import { reviewLabel, storeLabel, useChainOptions } from "../../lib/useChainOptions.js";

function pretty(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export default function TipsSummary() {
  const [reviewId, setReviewId] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [denom, setDenom] = useState("inj");
  const [storeId, setStoreId] = useState("");
  const [outTips, setOutTips] = useState("");
  const [outReviewer, setOutReviewer] = useState("");
  const [outFees, setOutFees] = useState("");
  const [outStoreAgg, setOutStoreAgg] = useState("");
  const [error, setError] = useState("");
  const { stores, reviews, reviewers, denoms, busy: optionsBusy, reload } = useChainOptions();

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setReviewer(c.myAddr || "");
    })().catch(() => {});
  }, []);

  async function run(setter, query) {
    setError("");
    try {
      const r = await API.smart(query);
      setter(pretty({ query, response: r }));
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setter(pretty({ ok: false, error: message }));
    }
  }

  const loadTips = () => run(setOutTips, {
    tips_for_review: { review_id: Number(reviewId) },
  });

  const loadReviewerBalance = () => run(setOutReviewer, {
    reviewer_balance: { reviewer: reviewer.trim(), denom: denom.trim() },
  });

  const loadPlatformFees = () => run(setOutFees, {
    platform_fees: { denom: denom.trim() },
  });

  const loadStoreAgg = () => run(setOutStoreAgg, {
    store_agg: { store_id: Number(storeId) },
  });

  return (
    <div className="page">
      <h2>売上と口コミ集計</h2>

      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="grid">
        <div className="card">
          <h3>レビュー別の応援金額</h3>
          <label>レビュー</label>
          <select value={reviewId} onChange={(e) => setReviewId(e.target.value)}>
            <option value="">レビューを選択</option>
            {reviews.map((review) => (
              <option key={review.id} value={review.id}>{reviewLabel(review, stores)}</option>
            ))}
          </select>
          <div className="toolbar">
            <button className="btn" disabled={!reviewId} onClick={loadTips}>集計を表示</button>
          </div>
          <pre className="out">{outTips}</pre>
        </div>

        <div className="card">
          <h3>レビュアー受取残高</h3>
          <label>レビュアー</label>
          <select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
            <option value="">レビュアーを選択</option>
            {reviewers.map((addr) => (
              <option key={addr} value={addr}>{addr}</option>
            ))}
          </select>
          <label>通貨</label>
          <select value={denom} onChange={(e) => setDenom(e.target.value)}>
            {denoms.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="toolbar">
            <button className="btn" disabled={!reviewer || !denom} onClick={loadReviewerBalance}>残高を表示</button>
          </div>
          <pre className="out">{outReviewer}</pre>
        </div>

        <div className="card">
          <h3>サービス手数料</h3>
          <label>通貨</label>
          <select value={denom} onChange={(e) => setDenom(e.target.value)}>
            {denoms.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <div className="toolbar">
            <button className="btn" disabled={!denom} onClick={loadPlatformFees}>手数料を表示</button>
          </div>
          <pre className="out">{outFees}</pre>
        </div>

        <div className="card">
          <h3>店舗集計</h3>
          <label>店舗</label>
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">店舗を選択</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{storeLabel(store)}</option>
            ))}
          </select>
          <div className="toolbar">
            <button className="btn" disabled={!storeId} onClick={loadStoreAgg}>店舗集計を表示</button>
          </div>
          <pre className="out">{outStoreAgg}</pre>
        </div>
      </div>
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
      </div>
    </div>
  );
}
