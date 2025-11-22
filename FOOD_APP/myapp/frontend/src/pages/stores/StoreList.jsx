import React, { useState } from "react";
import { API } from "../../api.js";

export default function StoreList() {
  const [out, setOut] = useState("");
  const [rows, setRows] = useState([]);

  const load = async () => {
    const r = await API.smart({ stores: { start_after: null, limit: 50 } });
    setOut(JSON.stringify(r, null, 2));
    const stores = r?.json?.data?.stores ?? r?.data?.stores ?? [];
    setRows(stores);
  };

  return (
    <div className="page">
      <h2>店舗一覧</h2>
      <div className="toolbar">
        <button className="btn" onClick={load}>読み込み</button>
      </div>
      <table>
        <thead>
          <tr><th>ID</th><th>store_ref</th><th>owner</th><th>active</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan="4" className="muted">データなし</td></tr>
          ) : rows.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.store_ref}</td>
              <td>{s.owner ?? <span className="muted">null</span>}</td>
              <td>{String(s.active)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>生データ</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
