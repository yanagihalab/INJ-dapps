import React, { useEffect, useState } from "react";
import { API } from "../../api.js";

export default function VisitList() {
  const [visitor, setVisitor] = useState("");
  const [limit, setLimit] = useState(20);
  const [rows, setRows] = useState([]);
  const [out, setOut] = useState("");

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setVisitor(c.myAddr || "");
    })();
  }, []);

  const load = async () => {
    const r = await API.smart({ visits_by_visitor: {
      visitor: visitor.trim(),
      start_after: null,
      limit: Number(limit) || 20
    }});
    setOut(JSON.stringify(r, null, 2));
    const vs = r?.json?.data?.visits ?? r?.data?.visits ?? [];
    setRows(vs);
  };

  return (
    <div className="page">
      <h2>来店一覧</h2>
      <label>visitor</label>
      <input value={visitor} onChange={(e)=>setVisitor(e.target.value)} />
      <label>limit</label>
      <input value={limit} onChange={(e)=>setLimit(e.target.value)} />
      <div className="toolbar">
        <button className="btn" onClick={load}>読み込み</button>
      </div>

      <table>
        <thead>
          <tr><th>ID</th><th>store_id</th><th>memo</th><th>visited_at</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan="4" className="muted">データなし</td></tr>
          ) : rows.map(s => (
            <tr key={s.id}>
              <td>{s.id}</td>
              <td>{s.store_id}</td>
              <td>{s.memo || ""}</td>
              <td>{s.visited_at || ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>生データ</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
