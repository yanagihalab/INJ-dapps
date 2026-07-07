import React, { useState } from "react";
import { TIP_AMOUNT_OPTIONS, useChainOptions } from "../../lib/useChainOptions.js";
import { executeWithKeplr } from "../../lib/walletExecute.js";

export default function Withdraw() {
  const [denom, setDenom] = useState("inj");
  const [amount, setAmount] = useState("");
  const [outTips, setOutTips] = useState("");
  const [outFees, setOutFees] = useState("");
  const { denoms, busy: optionsBusy, reload } = useChainOptions();

  const doTips = async () => {
    const msg = { withdraw_tips: { to: null, denom: denom.trim(), amount: amount.trim() || null } };
    const r = await executeWithKeplr({ msg });
    setOutTips(JSON.stringify(r, null, 2));
  };

  const doFees = async () => {
    const msg = { withdraw_platform_fees: { to: null, denom: denom.trim(), amount: amount.trim() || null } };
    const r = await executeWithKeplr({ msg });
    setOutFees(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>売上・手数料の出金</h2>
      <label>通貨</label>
      <select value={denom} onChange={(e) => setDenom(e.target.value)}>
        {denoms.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      <label>金額（任意）</label>
      <select value={amount} onChange={(e) => setAmount(e.target.value)}>
        <option value="">全額</option>
        {TIP_AMOUNT_OPTIONS.map((option) => (
          <option key={option.value} value={option.value.replace("inj", "")}>{option.label}</option>
        ))}
      </select>
      <div className="toolbar">
        <button className="btn warn" onClick={doTips}>レビュー応援残高を出金</button>
        <button className="btn warn" onClick={doFees}>プラットフォーム手数料を出金</button>
        <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
      </div>
      <h3>結果（tips）</h3>
      <pre className="out">{outTips}</pre>
      <h3>結果（fees）</h3>
      <pre className="out">{outFees}</pre>
    </div>
  );
}
