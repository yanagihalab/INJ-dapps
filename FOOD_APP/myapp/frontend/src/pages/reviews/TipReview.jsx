import React, { useState } from "react";
import { reviewLabel, TIP_AMOUNT_OPTIONS, useChainOptions } from "../../lib/useChainOptions.js";
import { executeWithKeplr } from "../../lib/walletExecute.js";

export default function TipReview() {
  const [reviewId, setReviewId] = useState("");
  const [amount, setAmount] = useState("150000000000000000inj"); // 0.15 INJ
  const [out, setOut] = useState("");
  const { stores, reviews, busy: optionsBusy, reload } = useChainOptions();

  const exec = async () => {
    const msg = { tip_review_native: { review_id: Number(reviewId) } };
    const r = await executeWithKeplr({ msg, amount: amount.trim() });
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>レビューを応援</h2>
      <label>応援するレビュー</label>
      <select value={reviewId} onChange={(e) => setReviewId(e.target.value)}>
        <option value="">レビューを選択</option>
        {reviews.filter((r) => !r.hidden).map((review) => (
          <option key={review.id} value={review.id}>{reviewLabel(review, stores)}</option>
        ))}
      </select>
      <label>応援金額</label>
      <select value={amount} onChange={(e) => setAmount(e.target.value)}>
        {TIP_AMOUNT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <div className="toolbar">
        <button className="btn ok" onClick={exec}>レビューに送る</button>
        <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
      </div>
      <h3>結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
