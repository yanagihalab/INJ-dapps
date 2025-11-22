import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../api.js";

const j = (v) => JSON.stringify(v, null, 2);
const getLS = (k, d = null) => { try { const x = localStorage.getItem(k); return x ? JSON.parse(x) : d; } catch { return d; } };
const setLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// TX logs から属性抽出（visit_id など）
function findAttrInTx(txJson, key) {
  const logs = txJson?.logs || txJson?.tx_response?.logs || [];
  for (const log of logs) for (const ev of (log.events || [])) for (const at of (ev.attributes || []))
    if (at.key === key) return at.value;
  return null;
}

export default function RecordVisit() {
  const nav = useNavigate();

  // ---- 設定 / 署名者（= 現在の KEYNAME） ----
  const [cfg, setCfg] = useState(null);
  const [signerName, setSignerName] = useState("");
  const [signerAddr, setSignerAddr] = useState("");
  const [signerBal, setSignerBal] = useState(null);
  const [signerInfoOut, setSignerInfoOut] = useState("");

  // キー切替用（プルダウン）
  const [keys, setKeys] = useState([]);
  const [switchTo, setSwitchTo] = useState("");

  // ---- 店舗 ----
  const [stores, setStores] = useState([]);
  const [storeFilter, setStoreFilter] = useState("");
  const [storeId, setStoreId] = useState(getLS("ctx.storeId", ""));

  // ---- 入力 ----
  const [visitor, setVisitor] = useState("");
  const [visitedAt, setVisitedAt] = useState("");
  const [memo, setMemo] = useState(getLS("ctx.lastVisitMemo", "dinner"));
  const [autoJump, setAutoJump] = useState(true);

  // visitor を署名者に追従させるか（既定 ON）
  const [followSigner, setFollowSigner] = useState(getLS("ctx.followVisitorSigner", true));

  // ---- 出力 / 最近の visit ----
  const [outExec, setOutExec] = useState("");
  const [outTx, setOutTx] = useState("");
  const [recent, setRecent] = useState([]);

  // 初期化
  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      setSignerName(c?.keyname || "");
      setSignerAddr(c?.myAddr || "");
      // 追従 ON なら visitor も同期
      setVisitor(followSigner ? (c?.myAddr || "") : (getLS("ctx.lastVisitor", "") || c?.myAddr || ""));

      // 残高
      if (c?.myAddr) {
        try { const b = await API.balance(c.myAddr); setSignerBal(b); }
        catch (e) { setSignerBal({ error: String(e) }); }
      }

      // 店舗一覧
      try {
        const r = await API.stores();
        setStores(r?.json?.data?.stores ?? []);
      } catch {}

      // キー一覧
      try {
        const r = await API.keysList();
        const list = r?.keys || [];
        setKeys(list);
        const def =
          (c?.keyname && list.some(k => k.name === c.keyname)) ? c.keyname :
          (list[0]?.name || "");
        setSwitchTo(def);
      } catch {}

      // 最近の来店（自分）
      if (c?.myAddr) reloadRecent(c.myAddr);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 署名者アドレスが変わったら、追従 ON のときだけ visitor を更新
  useEffect(() => {
    if (followSigner) setVisitor(signerAddr || "");
  }, [signerAddr, followSigner]);

  async function reloadRecent(addr) {
    try {
      const r = await API.smart({ visits_by_visitor: { visitor: addr, start_after: null, limit: 20 } });
      setRecent(r?.json?.data?.visits || []);
    } catch { setRecent([]); }
  }

  // 店舗フィルタ
  const filteredStores = useMemo(() => {
    const q = (storeFilter || "").toLowerCase().trim();
    if (!q) return stores;
    return stores.filter((s) =>
      String(s.id).includes(q) ||
      (s.store_ref || "").toLowerCase().includes(q) ||
      (s.owner || "").toLowerCase().includes(q)
    );
  }, [stores, storeFilter]);

  // 署名者の情報を読み直し
  async function refreshSignerInfo() {
    const c = await API.getConfig();
    setSignerName(c?.keyname || "");
    setSignerAddr(c?.myAddr || "");
    try { const b = await API.balance(c?.myAddr || ""); setSignerBal(b); }
    catch (e) { setSignerBal({ error: String(e) }); }
    setSignerInfoOut(j(c));
  }

  // 署名者を mykey に切り替え
  async function useMykey() {
    try {
      const info = await API.keyShow("mykey");
      await API.setCurrent({ keyname: "mykey", myAddr: info?.address || "" });
      await refreshSignerInfo();
      if (followSigner) setVisitor(info?.address || "");
      alert("署名者を mykey に切り替えました。");
    } catch (e) {
      alert("mykey への切替に失敗: " + String(e));
    }
  }

  // プルダウンで選んだキーに切り替え
  async function switchSigner() {
    if (!switchTo) return;
    try {
      const info = await API.keyShow(switchTo);
      await API.setCurrent({ keyname: switchTo, myAddr: info?.address || "" });
      await refreshSignerInfo();
      if (followSigner) setVisitor(info?.address || "");
    } catch (e) {
      alert("切替に失敗: " + String(e));
    }
  }

  // visitor 手入力時：追従を自動解除し、上書きを記憶
  function onVisitorChange(e) {
    const v = e.target.value;
    setVisitor(v);
    if (followSigner && v !== signerAddr) {
      setFollowSigner(false);
      setLS("ctx.followVisitorSigner", false);
    }
    setLS("ctx.lastVisitor", v || "");
  }

  // 便利: 署名者と visitor の一致状態
  const senderEqualsVisitor = useMemo(() => {
    const a = (signerAddr || "").trim();
    const b = (visitor || "").trim();
    return !!a && !!b && a === b;
  }, [signerAddr, visitor]);

  // 実行
  async function exec() {
    setOutExec(""); setOutTx("");

    // store の存在 / active チェック（分かりやすい前検証）
    const sid = Number(storeId);
    if (!sid || Number.isNaN(sid)) { setOutExec("store_id が無効です"); return; }
    const st = stores.find(s => Number(s.id) === sid);
    if (!st) { setOutExec(j({ error: "指定した store_id が存在しません" })); return; }
    if (st && st.active === false) { setOutExec(j({ error: "指定した店舗は非アクティブです" })); return; }

    // visitor 未入力
    if (!visitor) { setOutExec("visitor が空です"); return; }

    // 重要: 署名者 ＝ visitor を満たすように調整/阻止
    let effectiveVisitor = (visitor || "").trim();
    if (!senderEqualsVisitor) {
      if (followSigner) {
        // 追従 ON の場合は自動で署名者に合わせる
        effectiveVisitor = (signerAddr || "").trim();
        setVisitor(effectiveVisitor);
      } else {
        // 追従 OFF なら誤送信を止めて具体的に指示
        setOutExec(j({
          error: "visitor と署名者アドレスが一致していません（コントラクトが拒否します）",
          signer: signerAddr || "",
          visitor: visitor || "",
          hint: "上部のチェック『visitor を署名者と同じにする』を ON にするか、署名者と同じアドレスを入力してください。"
        }));
        return;
      }
    }

    const msg = {
      record_visit: {
        store_id: sid,
        visitor: effectiveVisitor,
        visited_at: visitedAt.trim() ? visitedAt.trim() : null,
        memo: memo || null,
      },
    };

    try {
      const r = await API.execute({ msg });
      setOutExec(j(r));

      const txh = r?.txhash || r?.json?.txhash || r?.tx_response?.txhash;
      if (txh) {
        const t = await API.tx(txh);
        setOutTx(j(t));
        const vid = findAttrInTx(t?.json || t, "visit_id");
        if (vid) {
          setLS("ctx.visitId", Number(vid));
          setLS("ctx.lastVisitMemo", memo || "");
          alert(`VISIT_ID=${vid} を保存しました。`);
          if (autoJump) nav("/reviews/create");
        }
      }
      if (signerAddr) reloadRecent(signerAddr);
    } catch (e) {
      const msg = String(e);
      const hint =
        /account.*not\s*found/i.test(msg) || /NotFound desc.*account/i.test(msg)
          ? "署名者（現在の KEYNAME）のアカウントが未作成/未資金です。設定で mykey に戻すか、そのアドレスへ少額 INJ を送金してください。"
          : (senderEqualsVisitor ? null : "visitor と署名者が一致しているか確認してください。");
      setOutExec(j({ error: msg, hint }));
    }
  }

  return (
    <div className="page">
      <h2>来店記録（record_visit）</h2>

      {/* 署名者（送信元）セクション */}
      <div className="card">
        <h3>現在の署名者（送信元）</h3>
        <div className="row">
          <div style={{ flex: 1 }}>
            <label>KEYNAME</label>
            <input value={signerName} readOnly />
          </div>
          <div style={{ flex: 2 }}>
            <label>ADDRESS</label>
            <input value={signerAddr} readOnly style={{ fontFamily: "monospace" }} />
          </div>
          <div style={{ flex: 2 }}>
            <label>残高（bank/balances）</label>
            <input
              readOnly
              value={
                signerBal?.error
                  ? `ERROR: ${signerBal.error}`
                  : (() => {
                      const coins = signerBal?.json?.balances || signerBal?.balances || [];
                      const inj = coins.find((c) => c.denom === "inj");
                      return inj ? `${inj.amount} inj` : "(inj 残高なし)";
                    })()
              }
            />
          </div>
        </div>

        <div className="row" style={{ marginTop: 8, gap: 8 }}>
          <button className="btn" onClick={refreshSignerInfo}>情報を再読込</button>
          <button className="btn secondary" onClick={() => nav("/settings")}>設定を開く</button>
          <button className="btn warn" onClick={useMykey}>署名者を mykey に切替</button>

          {/* キー切替プルダウン（幅を短く固定） */}
          <select
            className="key-select"
            style={{ width: 240, maxWidth: 240 }}
            value={switchTo}
            onChange={(e) => setSwitchTo(e.target.value)}
            title="切り替えたいキーを選択"
          >
            {keys.map(k => (
              <option key={k.name} value={k.name} title={`${k.name} — ${k.address}`}>
                {`${k.name} — ${String(k.address || "").slice(0, 10)}...`}
              </option>
            ))}
          </select>
          <button className="btn" onClick={switchSigner}>選択キーに切替</button>
        </div>

        {/* 署名者 ≠ visitor の可視化 */}
        {!senderEqualsVisitor && (
          <div className="muted" style={{ marginTop: 6 }}>
            <b>注意:</b> 現在、visitor と署名者アドレスが一致していません（コントラクトは一致を要求します）。
          </div>
        )}

        <div className="row" style={{ marginTop: 6 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              checked={followSigner}
              onChange={(e) => {
                const v = e.target.checked;
                setFollowSigner(v);
                setLS("ctx.followVisitorSigner", v);
                if (v) setVisitor(signerAddr || "");
              }}
            />
            visitor を署名者（上の ADDRESS）と同じにする
          </label>
          <button
            className="btn secondary"
            onClick={() => { setVisitor(signerAddr || ""); setFollowSigner(true); setLS("ctx.followVisitorSigner", true); }}
          >
            visitor を署名者に合わせる
          </button>
        </div>

        <details style={{ marginTop: 8 }}>
          <summary>CFG（デバッグ）</summary>
          <pre className="out">{signerInfoOut || j(cfg || {})}</pre>
        </details>
      </div>

      <div className="grid" style={{ marginTop: 12 }}>
        {/* 店舗選択 */}
        <div className="card">
          <h3>店舗選択</h3>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>store_id（手入力 or 下の一覧から）</label>
              <input
                value={storeId}
                onChange={(e) => { setStoreId(e.target.value); setLS("ctx.storeId", e.target.value || null); }}
                placeholder="例: 3"
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>検索</label>
              <input
                value={storeFilter}
                onChange={(e) => setStoreFilter(e.target.value)}
                placeholder="id / store_ref / owner"
              />
            </div>
          </div>

          <div style={{ marginTop: 8, maxHeight: 260, overflow: "auto" }}>
            <table>
              <thead>
                <tr><th>id</th><th>store_ref</th><th>owner</th><th>active</th><th>操作</th></tr>
              </thead>
              <tbody>
                {filteredStores.map((s) => (
                  <tr key={s.id}>
                    <td>{s.id}</td>
                    <td>{s.store_ref}</td>
                    <td style={{ fontFamily: "monospace" }}>{s.owner || <span className="muted">null</span>}</td>
                    <td>{s.active ? "true" : "false"}</td>
                    <td><button className="btn secondary" onClick={() => { setStoreId(String(s.id)); setLS("ctx.storeId", s.id); }}>選択</button></td>
                  </tr>
                ))}
                {filteredStores.length === 0 && (
                  <tr><td colSpan={5} className="muted">（店舗がありません）</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* 送信フォーム */}
        <div className="card">
          <h3>来店記録を作成</h3>

          <label>store_id</label>
          <input value={storeId} onChange={(e) => setStoreId(e.target.value)} placeholder="id" />

          <label>visitor</label>
          <input
            value={visitor}
            onChange={onVisitorChange}
            placeholder="inj1..."
            style={{ fontFamily: "monospace" }}
          />

          <label>visited_at（空=ブロック時刻）</label>
          <input value={visitedAt} onChange={(e) => setVisitedAt(e.target.value)} placeholder="空で null" />

          <label>memo</label>
          <input value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="例: dinner" />

          <div className="row" style={{ marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={autoJump} onChange={(e) => setAutoJump(e.target.checked)} />
              作成後にレビュー作成ページへ移動
            </label>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn ok" onClick={exec}>record_visit を送信</button>
            <button className="btn secondary" onClick={() => nav("/reviews/create")}>レビュー作成へ</button>
          </div>

          <h4 style={{ marginTop: 10 }}>結果（execute）</h4>
          <pre className="out">{outExec}</pre>

          <h4 style={{ marginTop: 10 }}>結果（tx）</h4>
          <pre className="out">{outTx}</pre>
        </div>
      </div>

      {/* 最近の来店（自分） */}
      <div className="card" style={{ marginTop: 12 }}>
        <h3>最近の来店（自分）</h3>
        <div className="row" style={{ marginBottom: 8 }}>
          <button className="btn" onClick={() => reloadRecent(signerAddr)}>再読込</button>
        </div>
        <div style={{ overflow: "auto" }}>
          <table>
            <thead>
              <tr><th>id</th><th>store_id</th><th>memo</th><th>visited_at</th><th>操作</th></tr>
            </thead>
            <tbody>
              {recent.map((v) => (
                <tr key={v.id}>
                  <td>{v.id}</td>
                  <td>{v.store_id}</td>
                  <td>{v.memo || ""}</td>
                  <td>{v.visited_at || ""}</td>
                  <td className="row" style={{ gap: 8 }}>
                    <button className="btn secondary" onClick={() => { setLS("ctx.visitId", v.id); alert(`VISIT_ID=${v.id} を保存しました`); }}>
                      この id を保存
                    </button>
                    <button className="btn" onClick={() => { setLS("ctx.visitId", v.id); nav("/reviews/create"); }}>
                      この id でレビュー作成へ
                    </button>
                  </td>
                </tr>
              ))}
              {recent.length === 0 && (
                <tr><td colSpan={5} className="muted">（来店履歴がありません）</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
