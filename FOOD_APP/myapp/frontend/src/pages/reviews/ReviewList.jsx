import React, { useState } from "react";
import { API } from "../../api.js";

export default function ReviewList() {
  const [rows, setRows] = useState([]);
  const [out, setOut] = useState("");

  // （コントラクト側が reviews 一覧クエリを持っていない場合は実装後に差し替え）
  const load = async () => {
    // 例: API.smart({ reviews_by_store: { store_id, ... } })
    setRows([]);
    setOut("// TODO: 実装待ち（コントラクトの一覧クエリが必要）");
  };

  return (
    <div className="page">
      <h2>投稿されたレビューの一覧</h2>
      <div className="toolbar">
        <button className="btn" onClick={load}>読み込み</button>
      </div>
      <table>
        <thead>
          <tr><th>ID</th><th>store_id</th><th>rating</th><th>title</th><th>at</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan="5" className="muted">データなし</td></tr>
          ) : rows.map(r => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.store_id}</td>
              <td>{r.rating}</td>
              <td>{r.title}</td>
              <td>{r.created_at}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>生データ</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
