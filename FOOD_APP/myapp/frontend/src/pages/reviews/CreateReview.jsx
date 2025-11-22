import React, { useState } from "react";
import { API } from "../../api.js";

export default function CreateReview() {
  const [visitId, setVisitId] = useState("");
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("最高");
  const [body, setBody] = useState("とても美味しかった");
  const [out, setOut] = useState("");

  const exec = async () => {
    const msg = { create_review: {
      visit_id: Number(visitId),
      rating: Number(rating),
      title, body
    }};
    const r = await API.execute({ msg });
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>レビュー作成</h2>
      <label>visit_id</label>
      <input value={visitId} onChange={(e) => setVisitId(e.target.value)} />
      <label>rating</label>
      <input type="number" min="1" max="5" value={rating} onChange={(e) => setRating(e.target.value)} />
      <label>title</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} />
      <label>body</label>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="toolbar">
        <button className="btn ok" onClick={exec}>Execute</button>
      </div>
      <h3>結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
