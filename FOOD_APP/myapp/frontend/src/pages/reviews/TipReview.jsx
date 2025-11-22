import React, { useState } from "react";
import { API } from "../../api.js";

export default function TipReview() {
  const [reviewId, setReviewId] = useState("");
  const [amount, setAmount] = useState("150000000000000000inj"); // 0.15 INJ
  const [out, setOut] = useState("");

  const exec = async () => {
    const msg = { tip_review_native: { review_id: Number(reviewId) } };
    const r = await API.execute({ msg, amount: amount.trim() });
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>投げ銭</h2>
      <label>review_id</label>
      <input value={reviewId} onChange={(e) => setReviewId(e.target.value)} />
      <label>amount</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      <div className="toolbar">
        <button className="btn ok" onClick={exec}>Execute</button>
      </div>
      <h3>結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
