import React, { useState } from "react";
import { API } from "../../api.js";

export default function TipsSummary() {
  const [reviewId, setReviewId] = useState("");
  const [out, setOut] = useState("");

  const load = async () => {
    const r = await API.smart({ tips_for_review: { review_id: Number(reviewId) } });
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>投げ銭合計</h2>
      <label>review_id</label>
      <input value={reviewId} onChange={(e) => setReviewId(e.target.value)} />
      <div className="toolbar">
        <button className="btn" onClick={load}>取得</button>
      </div>
      <h3>結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
