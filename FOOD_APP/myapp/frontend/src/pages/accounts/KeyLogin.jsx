// frontend/src/pages/accounts/KeyLogin.jsx
import React, { useEffect, useState } from "react";
import API from "../../api.js";

const j = (v) => JSON.stringify(v, null, 2);

export default function KeyLogin() {
  // キー名 & アドレス解決
  const [keyName, setKeyName] = useState("reviewer1");
  const [address, setAddress] = useState("");
  const [resolveNote, setResolveNote] = useState("");

  // 状態確認 / 検証
  const [statusOut, setStatusOut] = useState("");
  const [password, setPassword] = useState("");
  const [verifyOut, setVerifyOut] = useState("");

  // テスト用：ローカル key 一覧
  const [keys, setKeys] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        await reloadKeys();
        await resolveAddress(keyName);
      } catch (e) {
        setResolveNote(String(e.message || e));
      }
    })();
  }, []);

  async function reloadKeys() {
    const r = await API.keysList();
    setKeys(r.keys || []);
  }

  async function resolveAddress(name) {
    setStatusOut(""); setVerifyOut("");
    setResolveNote("");
    if (!name?.trim()) {
      setAddress("");
      setResolveNote("name is empty");
      return;
    }
    try {
      const r = await API.keyShow(name.trim());
      setAddress(r?.address || "");
      if (!r?.address) setResolveNote("address not found for this key");
    } catch (e) {
      setAddress("");
      setResolveNote(String(e.message || e));
    }
  }

  async function checkStatus() {
    setStatusOut("");
    try {
      const r = await API.authStatus({ address: address || undefined, name: keyName || undefined });
      setStatusOut(j(r));
    } catch (e) {
      setStatusOut(j({ error: String(e.message || e) }));
    }
  }

  async function verify() {
    setVerifyOut("");
    try {
      const r = await API.authVerifyPassword({
        address: address || undefined,
        name: address ? undefined : (keyName || undefined),
        password,
      });
      setVerifyOut(j(r));
    } catch (e) {
      setVerifyOut(j({ ok: false, error: String(e.message || e) }));
    }
  }

  function pickKey(k) {
    setKeyName(k.name);
    setAddress(k.address);
    setResolveNote("");
    setStatusOut("");
    setVerifyOut("");
  }

  return (
    <div className="container">
      <div className="page">
        <h2>ログイン検証（キー名 + パスワード）</h2>

        {/* 対象キー */}
        <div className="card">
          <h3>対象キー</h3>
          <label>key name</label>
          <input
            value={keyName}
            onChange={(e) => setKeyName(e.target.value)}
            onBlur={() => resolveAddress(keyName)}
            placeholder="reviewer1"
          />
          <div className="muted" style={{ marginTop: 6 }}>
            resolved address: <span style={{ fontFamily: "monospace" }}>{address || "-"}</span>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => resolveAddress(keyName)}>状態を確認</button>
          </div>
          {resolveNote && <div className="muted" style={{ marginTop: 8 }}>{resolveNote}</div>}
        </div>

        {/* 検証 */}
        <div className="card">
          <h3>検証（ログイン）</h3>
          <label>password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={checkStatus}>status</button>
            <button className="btn ok" style={{ marginLeft: 8 }} onClick={verify}>verify_password</button>
          </div>

          <h4 style={{ marginTop: 12 }}>status</h4>
          <pre className="out">{statusOut}</pre>

          <h4 style={{ marginTop: 12 }}>verify</h4>
          <pre className="out">{verifyOut}</pre>
        </div>

        {/* テスト用：ログイン可能ユーザー候補 */}
        <div className="card">
          <h3>（テスト用）ログイン可能ユーザー候補</h3>
          <div className="muted">* ローカル keyring の一覧です</div>
          {keys.length === 0 ? (
            <div className="muted" style={{ marginTop: 8 }}>（キーがありません）</div>
          ) : (
            <table style={{ width: "100%", marginTop: 8 }}>
              <thead><tr><th>name</th><th>address</th><th>操作</th></tr></thead>
              <tbody>
                {keys.map(k => (
                  <tr key={k.name}>
                    <td>{k.name}</td>
                    <td style={{ fontFamily: "monospace" }}>{k.address}</td>
                    <td>
                      <button className="btn secondary" onClick={() => pickKey(k)}>選択</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  );
}
