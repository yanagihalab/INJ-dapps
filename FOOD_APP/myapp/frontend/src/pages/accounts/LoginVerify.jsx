// frontend/src/pages/accounts/LoginVerify.jsx
import React, { useEffect, useState } from 'react';
import API from '../../api.js';

const j = (v) => JSON.stringify(v, null, 2);

export default function LoginVerify() {
  const [address, setAddress] = useState('');
  const [statusOut, setStatusOut] = useState('');
  const [password, setPassword] = useState('');
  const [resultOut, setResultOut] = useState('');
  const [keys, setKeys] = useState([]);

  useEffect(() => {
    // 初期値: CFG からアドレスを読み込み、ステータスを取得
    (async () => {
      try {
        const cfg = await API.getConfig();
        const addr = cfg?.myAddr || '';
        setAddress(addr);
        const keyResp = await API.keysList().catch(() => null);
        setKeys(keyResp?.keys || []);
        if (addr) await refreshStatus(addr);
      } catch (e) {
        setStatusOut(j({ error: String(e) }));
      }
    })();
  }, []);

  async function refreshStatus(addr) {
    if (!addr) { setStatusOut(j({ error: 'address is empty' })); return; }
    try {
      let r = null;
      if (API.authStatus) {
        // 推奨エンドポイント
        r = await API.authStatus(addr);
      } else if (API.accounts?.passwordStatus) {
        // 互換（古い実装のためのフォールバック）
        r = await API.accounts.passwordStatus(addr);
      } else {
        r = { note: 'auth status endpoint not found' };
      }
      setStatusOut(j(r));
    } catch (e) {
      setStatusOut(j({ error: String(e) }));
    }
  }

  async function onVerify() {
    setResultOut('');
    if (!address) { setResultOut(j({ error: 'address is empty' })); return; }
    if (!password) { setResultOut(j({ error: 'password is empty' })); return; }

    try {
      const r = await API.authVerifyPassword({ address, password });
      setResultOut(j(r));
    } catch (e) {
      setResultOut(j({ error: String(e) }));
    }
  }

  return (
    <div className="page">
      <h2>ログイン検証（アプリ内パスワード確認）</h2>
      <p className="muted">※ ブロックチェーンの鍵とは無関係な、アプリ内のアカウントパスワードを検証します。</p>

      <div className="grid">

        {/* 対象アドレス */}
        <div className="card">
          <h3>対象アドレス</h3>
          <label>address</label>
          <select
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          >
            <option value="">アドレスを選択</option>
            {keys.map((key) => (
              <option key={key.address || key.name} value={key.address}>{key.name} - {key.address}</option>
            ))}
          </select>
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => refreshStatus(address)}>状態を更新</button>
          </div>
          <h4 style={{ marginTop: 10 }}>Status</h4>
          <pre className="out">{statusOut}</pre>
        </div>

        {/* 検証 */}
        <div className="card">
          <h3>パスワード検証</h3>
          <label>password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn ok" onClick={onVerify}>ログイン検証</button>
          </div>

          <h4 style={{ marginTop: 10 }}>結果</h4>
          <pre className="out">{resultOut}</pre>

          <p className="muted" style={{ marginTop: 10 }}>
            パスワード未設定の場合は <b>/accounts</b> の「アプリ内パスワード」から設定してください。
          </p>
        </div>

      </div>
    </div>
  );
}
