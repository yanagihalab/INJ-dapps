import React, { useState } from "react";
import { API } from "../../api.js";

export default function Withdraw() {
  const [denom, setDenom] = useState("inj");
  const [amount, setAmount] = useState("");
  const [outTips, setOutTips] = useState("");
  const [outFees, setOutFees] = useState("");

  const doTips = async () => {
    const msg = { withdraw_tips: { to: null, denom: denom.trim(), amount: amount.trim() || null } };
    const r = await API.execute({ msg });
    setOutTips(JSON.stringify(r, null, 2));
  };

  const doFees = async () => {
    const msg = { withdraw_platform_fees: { to: null, denom: denom.trim(), amount: amount.trim() || null } };
    const r = await API.execute({ msg });
    setOutFees(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>引き出し</h2>
      <label>denom</label>
      <input value={denom} onChange={(e) => setDenom(e.target.value)} />
      <label>amount（任意）</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="空=全額" />
      <div className="toolbar">
        <button className="btn warn" onClick={doTips}>withdraw_tips</button>
        <button className="btn warn" onClick={doFees}>withdraw_platform_fees</button>
      </div>
      <h3>結果（tips）</h3>
      <pre className="out">{outTips}</pre>
      <h3>結果（fees）</h3>
      <pre className="out">{outFees}</pre>
    </div>
  );
}
