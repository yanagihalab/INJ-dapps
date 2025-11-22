import React, { useState } from "react";
import { API } from "../../api.js";

export default function RegisterStore() {
  const [storeRef, setStoreRef] = useState("sushi-suwa");
  const [owner, setOwner] = useState("");
  const [out, setOut] = useState("");

  const exec = async () => {
    const msg = { register_store: { store_ref: storeRef, owner: owner.trim() || null } };
    const r = await API.execute({ msg });
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>店舗登録</h2>
      <label>store_ref</label>
      <input value={storeRef} onChange={(e) => setStoreRef(e.target.value)} />
      <label>owner（任意）</label>
      <input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="空→null" />
      <div className="toolbar">
        <button className="btn ok" onClick={exec}>Execute</button>
      </div>
      <h3>結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
