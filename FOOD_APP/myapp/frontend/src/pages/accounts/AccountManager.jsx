// frontend/src/pages/accounts/AccountManager.jsx
import React, { useEffect, useMemo, useState } from 'react';
import API from '../../api.js';

const j = (v) => JSON.stringify(v, null, 2);

export default function AccountManager() {
  // CFG / 現在
  const [cfg, setCfg] = useState(null);
  const [currentName, setCurrentName] = useState('');
  const [currentAddr, setCurrentAddr] = useState('');

  // ローカル keyring 一覧
  const [keys, setKeys] = useState([]);
  const keyOptions = useMemo(() => (keys || []).map(k => k.name), [keys]);

  // 新規キー（案内用）
  const [newName, setNewName] = useState('reviewer1');
  const [createOut, setCreateOut] = useState('');

  // アプリ内PW
  const [authStatus, setAuthStatus] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [hint, setHint] = useState('');
  const [loginPw, setLoginPw] = useState('');
  const [authOut, setAuthOut] = useState('');

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      setCurrentName(c.keyname || '');
      setCurrentAddr(c.myAddr || '');
      await reloadKeys();
      if (c.myAddr) await refreshAuthStatus({ address: c.myAddr });
    })();
  }, []);

  async function reloadKeys() {
    try {
      const r = await API.keysList();
      setKeys(r.keys || []);
    } catch (e) {
      console.error(e);
      setKeys([]);
    }
  }

  async function resolveAddressByName(name) {
    if (!name) return '';
    try {
      const s = await API.keyShow(name);
      return s.address || '';
    } catch {
      return '';
    }
  }

  async function refreshAuthStatus({ address, name }) {
    try {
      const r = name
        ? await API.accounts.passwordStatus({ name })
        : await API.accounts.passwordStatus({ address });
      setAuthStatus(j(r));
    } catch (e) {
      setAuthStatus(j({ error: String(e?.message || e) }));
    }
  }

  // --------- handlers ---------
  async function onSelectName(nm) {
    setCurrentName(nm);
    const addr = await resolveAddressByName(nm);
    setCurrentAddr(addr);
    setAuthStatus('');
  }

  async function onUseSelected() {
    if (!currentName) return;
    const addr = currentAddr || (await resolveAddressByName(currentName));
    await API.saveConfig({ keyname: currentName, myAddr: addr || '' });
    const c2 = await API.getConfig();
    setCfg(c2);
    setCurrentName(c2.keyname || '');
    setCurrentAddr(c2.myAddr || '');
    if (c2.myAddr) await refreshAuthStatus({ address: c2.myAddr });
  }

  async function onUseKeyRow(k) {
    setCurrentName(k.name);
    setCurrentAddr(k.address);
    await API.saveConfig({ keyname: k.name, myAddr: k.address || '' });
    const c2 = await API.getConfig();
    setCfg(c2);
    setCurrentName(c2.keyname || '');
    setCurrentAddr(c2.myAddr || '');
    if (c2.myAddr) await refreshAuthStatus({ address: c2.myAddr });
  }

  async function onSetPassword() {
    setAuthOut('');
    if (!currentAddr) return setAuthOut('no current address');
    if (!pw || pw !== pw2) return setAuthOut('password mismatch');
    await API.accounts.setPassword({ address: currentAddr, password: pw, hint });
    setPw(''); setPw2('');
    await refreshAuthStatus({ address: currentAddr });
    setAuthOut('password set');
  }

  async function onLogin() {
    setAuthOut('');
    if (!currentAddr) return setAuthOut('no current address');
    const r = await API.accounts.verifyPassword({ address: currentAddr, password: loginPw });
    setAuthOut(j(r));
  }

  async function onCreateDummy() {
    setCreateOut(j({
      created: true,
      name: newName.trim() || 'reviewer1',
      note: '鍵の実作成は inj CLI / 既存 UI を使用してください（このボタンは案内のみ）。'
    }));
  }

  return (
    <div className="container">
      <div className="page">
        <h2>アカウント管理（レビュー投稿者）</h2>

        <div className="grid">

          {/* 現在のアカウント + クイックセレクタ */}
          <div className="card">
            <h3>現在のアカウント</h3>

            <label>Key name（ローカル keyring）</label>
            <div className="row" style={{ gap: 8 }}>
              <select
                value={currentName}
                onChange={(e)=>onSelectName(e.target.value)}
                style={{ minWidth: 240 }}
              >
                <option value="">（未選択）</option>
                {keyOptions.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <button className="btn secondary" onClick={reloadKeys}>一覧を再読込</button>
              <button className="btn" onClick={async ()=>{
                if (keys.length > 0) {
                  setCurrentName(keys[0].name);
                  setCurrentAddr(keys[0].address || '');
                }
              }}>先頭を仮選択</button>
            </div>

            <label style={{ marginTop: 8 }}>Address</label>
            <input readOnly value={currentAddr || ''} style={{ fontFamily: 'monospace' }} />

            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn ok" onClick={onUseSelected}>このキーを使う（CFGへ保存）</button>
              <button
                className="btn secondary"
                onClick={()=>refreshAuthStatus(currentName ? { name: currentName } : { address: currentAddr })}
              >
                Auth 状態を取得
              </button>
            </div>

            <h4 style={{marginTop:10}}>Auth status</h4>
            <pre className="out">{authStatus || j({})}</pre>

            <h4 style={{marginTop:10}}>現在の CFG</h4>
            <pre className="out">{j(cfg || {})}</pre>
          </div>

          {/* 既存キー一覧（選択可能） */}
          <div className="card">
            <h3>ローカル keyring の keyname 一覧</h3>
            {keys.length === 0 ? (
              <div className="muted">（キーが見つかりませんでした）</div>
            ) : (
              <table style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{textAlign:'left'}}>name</th>
                    <th style={{textAlign:'left'}}>address</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map(k => (
                    <tr key={k.name}>
                      <td>{k.name}</td>
                      <td style={{ fontFamily:'monospace' }}>{k.address}</td>
                      <td style={{ textAlign:'right' }}>
                        <button className="btn secondary" onClick={()=>onUseKeyRow(k)}>選択</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 新規キーペア作成（案内） */}
          <div className="card">
            <h3>新規キーペア作成（test keyring の案内）</h3>
            <label>name</label>
            <input value={newName} onChange={(e)=>setNewName(e.target.value)} placeholder="reviewer1" />
            <div className="row" style={{marginTop:8}}>
              <button className="btn" onClick={onCreateDummy}>作成（ダミー）</button>
            </div>
            <pre className="out" style={{marginTop:8}}>{createOut}</pre>
          </div>

          {/* アプリ内パスワード */}
          <div className="card">
            <h3>アプリ内パスワード</h3>
            <div className="muted">* 開発用。ブロックチェーン鍵とは無関係です。</div>

            <h4 style={{marginTop:10}}>設定</h4>
            <label>password</label>
            <input type="password" value={pw} onChange={(e)=>setPw(e.target.value)} />
            <label>password（確認）</label>
            <input type="password" value={pw2} onChange={(e)=>setPw2(e.target.value)} />
            <label>hint（任意・平文保存）</label>
            <input value={hint} onChange={(e)=>setHint(e.target.value)} />
            <div className="row" style={{marginTop:8}}>
              <button className="btn ok" onClick={onSetPassword}>パスワードを設定</button>
            </div>

            <h4 style={{marginTop:10}}>ログイン検証</h4>
            <label>password</label>
            <input type="password" value={loginPw} onChange={(e)=>setLoginPw(e.target.value)} />
            <div className="row" style={{marginTop:8}}>
              <button className="btn" onClick={onLogin}>verify_password</button>
            </div>

            <h4 style={{marginTop:10}}>結果</h4>
            <pre className="out">{authOut}</pre>
          </div>

        </div>
      </div>
    </div>
  );
}
