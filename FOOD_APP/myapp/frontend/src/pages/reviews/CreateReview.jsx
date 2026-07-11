import React, { useState } from "react";
import { RATING_OPTIONS, useChainOptions, visitLabel } from "../../lib/useChainOptions.js";
import { executeWithKeplr } from "../../lib/walletExecute.js";

export default function CreateReview() {
  const [visitId, setVisitId] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("最高");
  const [body, setBody] = useState("とても美味しかった");
  const [out, setOut] = useState("");
  const { stores, visits, busy: optionsBusy, reload } = useChainOptions();
  const reviewableVisits = visits.filter((v) => !v.reviewed && !v.revoked);

  const exec = async () => {
    const msg = { create_review: {
      visit_id: Number(visitId),
      rating: Number(rating),
      title, body
    }};
    const r = await executeWithKeplr({ msg });
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page create-review-page">
      <h2>来店レビューを投稿</h2>
      <section className="mobile-form-card">
        <div className="mobile-form-head">
          <span className={visitId ? "visit-status-pill" : "visit-status-pill muted-pill"}>
            {visitId ? "来店選択済み" : "来店を選択"}
          </span>
          <p>QR来店記録後、未レビューの来店だけを選択できます。</p>
        </div>

        <label>レビューする来店</label>
        <select value={visitId} onChange={(e) => setVisitId(e.target.value)}>
          <option value="">来店を選択</option>
          {reviewableVisits.map((visit) => (
            <option key={visit.id} value={visit.id}>{visitLabel(visit, stores)}</option>
          ))}
        </select>
        {reviewableVisits.length === 0 ? (
          <p className="input-guide">レビュー可能な来店がありません。先に店舗QRから来店を記録してください。</p>
        ) : null}

        <label>評価</label>
        <select value={String(rating)} onChange={(e) => setRating(e.target.value)}>
          {RATING_OPTIONS.map((value) => (
            <option key={value} value={value}>★{value}</option>
          ))}
        </select>

        <label>タイトル</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例: また行きたいお店" />

        <label>口コミ本文</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="料理、接客、雰囲気などを入力" />

        <div className="mobile-sticky-actions">
          <button className="btn ok" disabled={!visitId} onClick={exec}>レビューを投稿する</button>
          <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
        </div>
      </section>

      {out ? (
        <details className="review-raw" open>
          <summary>結果</summary>
          <pre className="out">{out}</pre>
        </details>
      ) : null}
    </div>
  );
}
