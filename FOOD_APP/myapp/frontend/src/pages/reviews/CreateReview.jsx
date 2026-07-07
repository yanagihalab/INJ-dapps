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
    <div className="page">
      <h2>来店レビューを投稿</h2>
      <label>レビューする来店</label>
      <select value={visitId} onChange={(e) => setVisitId(e.target.value)}>
        <option value="">来店を選択</option>
        {visits.filter((v) => !v.reviewed && !v.revoked).map((visit) => (
          <option key={visit.id} value={visit.id}>{visitLabel(visit, stores)}</option>
        ))}
      </select>
      <label>評価</label>
      <select value={String(rating)} onChange={(e) => setRating(e.target.value)}>
        {RATING_OPTIONS.map((value) => (
          <option key={value} value={value}>★{value}</option>
        ))}
      </select>
      <label>タイトル</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>口コミ本文</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="toolbar">
        <button className="btn ok" onClick={exec}>レビューを投稿する</button>
        <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
      </div>
      <h3>結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
