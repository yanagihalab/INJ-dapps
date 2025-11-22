import React, { useState } from "react";
import { API } from "../../api.js";

export default function CreateReview() {
  const [visitId, setVisitId] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("最高");
  const [body, setBody] = useState("とても美味しかった");
  const [out, setOut] = useState("");

  const run = async () => {
    try {
      const msg = { create_review: { visit_id: Number(visitId), rating: Number(rating), title, body } };
      const res = await API.execute({ msg });
      setOut(JSON.stringify(res, null, 2));
    } catch (e) {
      setOut(`ERROR: ${e?.message || e}`);
    }
  };

  return (
    <div className="page">
      <h2 style={{ marginTop: 0 }}>レビュー作成（create_review）</h2>
      <div className="card">
        <label>visit_id</label>
        <input value={visitId} onChange={(e) => setVisitId(e.target.value)} placeholder="例: 1" />
        <label>rating (1..5)</label>
        <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(e.target.value)} />
        <label>title</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} />
        <label>body</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ok" onClick={run}>Execute</button>
        </div>
        <h4 style={{ marginTop: 12 }}>結果</h4>
        <pre className="out">{out}</pre>
      </div>
    </div>
  );
}
