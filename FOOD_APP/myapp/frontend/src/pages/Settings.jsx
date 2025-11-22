import React, { useEffect, useState } from "react";
import { API } from "../api.js";

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [form, setForm] = useState({
    keyname: "", myAddr: "", codeId: "", contract: "",
    injNode: "", chainId: "", injectiveHomeHostPath: "",
    gasAdjustment: "", defaultFees: ""
  });
  const [out, setOut] = useState("");

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      setForm({
        keyname: c.keyname ?? "", myAddr: c.myAddr ?? "", codeId: c.codeId ?? "", contract: c.contract ?? "",
        injNode: c.injNode ?? "", chainId: c.chainId ?? "", injectiveHomeHostPath: c.injectiveHomeHostPath ?? "",
        gasAdjustment: c.gasAdjustment ?? "", defaultFees: c.defaultFees ?? ""
      });
    })();
  }, []);

  const save = async () => {
    const r = await API.saveConfig(form);
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>設定</h2>

      {["keyname","myAddr","codeId","contract","injNode","chainId","injectiveHomeHostPath","gasAdjustment","defaultFees"].map(k => (
        <div className="row" key={k} style={{flexDirection:"column", alignItems:"stretch"}}>
          <label>{k}</label>
          <input value={form[k]} onChange={(e)=>setForm(s=>({ ...s, [k]: e.target.value }))} />
        </div>
      ))}

      <div className="toolbar">
        <button className="btn" onClick={save}>保存</button>
      </div>

      <h3>現在値</h3>
      <pre className="out">{JSON.stringify(cfg ?? {}, null, 2)}</pre>

      <h3>保存結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
