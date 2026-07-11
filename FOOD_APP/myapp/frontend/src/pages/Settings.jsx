import React, { useEffect, useState } from "react";
import { API, getAdminApiToken, setAdminApiToken } from "../api.js";

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    keyname: "", myAddr: "", codeId: "", contract: "",
    injNode: "", chainId: "", injectiveHomeHostPath: "",
    gasAdjustment: "", defaultFees: "", wasmHostPath: ""
  });
  const [keys, setKeys] = useState([]);
  const [out, setOut] = useState("");
  const [adminToken, setAdminToken] = useState(() => getAdminApiToken());

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      setForm({
        keyname: c.keyname ?? "", myAddr: c.myAddr ?? "", codeId: c.codeId ?? "", contract: c.contract ?? "",
        injNode: c.injNode ?? "", chainId: c.chainId ?? "", injectiveHomeHostPath: c.injectiveHomeHostPath ?? "",
        gasAdjustment: c.gasAdjustment ?? "", defaultFees: c.defaultFees ?? "", wasmHostPath: c.wasmHostPath ?? ""
      });
      const ks = await API.keysList().catch(() => null);
      setKeys(ks?.keys || []);
    })();
  }, []);

  const save = async () => {
    setAdminApiToken(adminToken);
    const r = await API.saveConfig(form, adminToken);
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>サービス接続設定</h2>

      <div className="row" style={{flexDirection:"column", alignItems:"stretch"}}>
        <label>admin API token（このタブのセッションのみ）</label>
        <input
          type="password"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          placeholder="サーバーの ADMIN_API_TOKEN"
        />
      </div>

      {["keyname","myAddr","codeId","contract","injNode","chainId","injectiveHomeHostPath","gasAdjustment","defaultFees","wasmHostPath"].map(k => (
        <div className="row" key={k} style={{flexDirection:"column", alignItems:"stretch"}}>
          <label>{k}</label>
          {k === "keyname" ? (
            <select value={form[k]} onChange={(e)=>setForm(s=>({ ...s, [k]: e.target.value }))}>
              <option value="">未選択</option>
              {keys.map((key) => <option key={key.name} value={key.name}>{key.name}</option>)}
            </select>
          ) : k === "chainId" ? (
            <select value={form[k]} onChange={(e)=>setForm(s=>({ ...s, [k]: e.target.value }))}>
              <option value="injective-888">injective-888</option>
            </select>
          ) : k === "gasAdjustment" ? (
            <select value={form[k]} onChange={(e)=>setForm(s=>({ ...s, [k]: e.target.value }))}>
              <option value="1.2">1.2</option>
              <option value="1.4">1.4</option>
              <option value="1.6">1.6</option>
              <option value="2.0">2.0</option>
            </select>
          ) : k === "defaultFees" ? (
            <select value={form[k]} onChange={(e)=>setForm(s=>({ ...s, [k]: e.target.value }))}>
              <option value="1000000000000000inj">0.001 INJ</option>
              <option value="2000000000000000inj">0.002 INJ</option>
              <option value="5000000000000000inj">0.005 INJ</option>
              <option value="10000000000000000inj">0.01 INJ</option>
            </select>
          ) : (
            <input value={form[k]} onChange={(e)=>setForm(s=>({ ...s, [k]: e.target.value }))} />
          )}
        </div>
      ))}

      <div className="toolbar">
        <button className="btn" onClick={save}>保存</button>
      </div>

      <h3>現在の接続先</h3>
      <pre className="out">{JSON.stringify(cfg ?? {}, null, 2)}</pre>

      <h3>保存結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
