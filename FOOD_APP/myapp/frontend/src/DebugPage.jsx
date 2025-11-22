// frontend/src/pages/DebugPage.jsx
import React, { useEffect, useState } from 'react';
import { API } from '../api.js';

const j = (v) => JSON.stringify(v, null, 2);

// 入力欄のデフォルト値
const DEFAULTS = {
  // list-contracts-by-code / contract
  codeId: '39040',
  contract: 'inj1s337ldwtv94ttd6nst76n00vwpl4crjelv5754',

  // register_store
  storeRef: 'sushi-suwa',
  storeOwner: '',

  // record_visit
  rvStoreId: '3',
  rvVisitor: '',               // backend の myAddr 取得後に上書き
  rvVisitedAt: '',             // 空=自動（ブロック時刻）
  rvMemo: 'dinner',

  // visits_by_visitor
  vbvVisitor: '',              // backend の myAddr 取得後に上書き
  vbvLimit: 20,

  // create_review
  crVisitId: '1',
  crRating: 5,
  crTitle: '最高',
  crBody: 'とても美味しかった',

  // tip_review_native
  tipReviewId: '1',
  tipAmount: '150000000000000000inj', // 0.15 INJ

  // tips_for_review
  tfrReviewId: '1',

  // withdraw
  wdDenom: 'inj',
  wdAmount: '',
};

// シンプルなローカルストレージ保持
function usePersisted(key, initialValue) {
  const storageKey = 'dbg:' + key;
  const [val, setVal] = useState(() => {
    const raw = localStorage.getItem(storageKey);
    if (raw == null) return initialValue;
    try { return JSON.parse(raw); } catch { return raw; }
  });
  const update = (next) => {
    const v = typeof next === 'function' ? next(val) : next;
    setVal(v);
    try { localStorage.setItem(storageKey, JSON.stringify(v)); } catch {}
  };
  return [val, update];
}

export default function DebugPage() {
  // 共通設定のプリセット（表示用）
  const [cfg, setCfg] = useState(null);

  // list-contracts-by-code
  const [codeId, setCodeId] = usePersisted('codeId', DEFAULTS.codeId);
  const [listOut, setListOut] = useState('');

  // contract
  const [contract, setContract] = usePersisted('contract', DEFAULTS.contract);
  const [contractOut, setContractOut] = useState('');

  // smart: config
  const [smartCfgOut, setSmartCfgOut] = useState('');

  // register_store
  const [storeRef, setStoreRef] = usePersisted('storeRef', DEFAULTS.storeRef);
  const [storeOwner, setStoreOwner] = usePersisted('storeOwner', DEFAULTS.storeOwner);
  const [registerOut, setRegisterOut] = useState('');

  // stores
  const [storesOut, setStoresOut] = useState('');

  // record_visit
  const [rvStoreId, setRvStoreId] = usePersisted('rvStoreId', DEFAULTS.rvStoreId);
  const [rvVisitor, setRvVisitor] = usePersisted('rvVisitor', DEFAULTS.rvVisitor);
  const [rvVisitedAt, setRvVisitedAt] = usePersisted('rvVisitedAt', DEFAULTS.rvVisitedAt);
  const [rvMemo, setRvMemo] = usePersisted('rvMemo', DEFAULTS.rvMemo);
  const [rvOut, setRvOut] = useState('');

  // visits_by_visitor
  const [vbvVisitor, setVbvVisitor] = usePersisted('vbvVisitor', DEFAULTS.vbvVisitor);
  const [vbvLimit, setVbvLimit] = usePersisted('vbvLimit', DEFAULTS.vbvLimit);
  const [vbvOut, setVbvOut] = useState('');

  // create_review
  const [crVisitId, setCrVisitId] = usePersisted('crVisitId', DEFAULTS.crVisitId);
  const [crRating, setCrRating] = usePersisted('crRating', DEFAULTS.crRating);
  const [crTitle, setCrTitle] = usePersisted('crTitle', DEFAULTS.crTitle);
  const [crBody, setCrBody] = usePersisted('crBody', DEFAULTS.crBody);
  const [crOut, setCrOut] = useState('');

  // tip_review_native
  const [tipReviewId, setTipReviewId] = usePersisted('tipReviewId', DEFAULTS.tipReviewId);
  const [tipAmount, setTipAmount] = usePersisted('tipAmount', DEFAULTS.tipAmount);
  const [tipOut, setTipOut] = useState('');

  // tips_for_review
  const [tfrReviewId, setTfrReviewId] = usePersisted('tfrReviewId', DEFAULTS.tfrReviewId);
  const [tfrOut, setTfrOut] = useState('');

  // withdraw
  const [wdDenom, setWdDenom] = usePersisted('wdDenom', DEFAULTS.wdDenom);
  const [wdAmount, setWdAmount] = usePersisted('wdAmount', DEFAULTS.wdAmount);
  const [wdTipsOut, setWdTipsOut] = useState('');
  const [wdFeesOut, setWdFeesOut] = useState('');

  // health
  const [healthOut, setHealthOut] = useState('');

  // 初回：バックエンド設定から空欄をプリセット上書き
  useEffect(() => {
    (async () => {
      try {
        const c = await API.getConfig();
        setCfg(c);
        // まだ未入力の項目に限って、設定 or 既定 を反映（ユーザ入力は尊重）
        setCodeId((v) => v || c.codeId || DEFAULTS.codeId);
        setContract((v) => v || c.contract || DEFAULTS.contract);
        setRvVisitor((v) => v || c.myAddr || DEFAULTS.rvVisitor);
        setVbvVisitor((v) => v || c.myAddr || DEFAULTS.vbvVisitor);
      } catch (e) {
        console.warn('getConfig failed:', e);
      }
    })();
  }, []);

  // ---- TX イベントから属性抽出（visit_id / review_id など）
  function findAttrInTx(txJson, key) {
    const logs = txJson?.logs || txJson?.tx_response?.logs || [];
    for (const log of logs) {
      for (const ev of (log.events || [])) {
        for (const at of (ev.attributes || [])) {
          if (at.key === key) return at.value;
        }
      }
    }
    return null;
  }

  // ---- Actions
  const doHealth = async () => {
    const r = await API.health();
    setHealthOut(j(r));
  };

  const doListByCode = async () => {
    const r = await API.queryListByCode(codeId);
    setListOut(j(r));
  };

  const doContract = async () => {
    const r = await API.queryContract(contract);
    setContractOut(j(r));
  };

  const doSmartConfig = async () => {
    const r = await API.smart({ config: {} }, contract || undefined);
    setSmartCfgOut(j(r));
  };

  const doRegisterStore = async () => {
    const msg = { register_store: { store_ref: storeRef, owner: storeOwner || null } };
    const r = await API.execute({ msg });
    setRegisterOut(j(r));
  };

  const doStores = async () => {
    // 汎用 smart を使う（/steps/stores がなくても動く）
    const r = await API.smart({ stores: { start_after: null, limit: 50 } }, contract || undefined);
    setStoresOut(j(r));
  };

  const doRecordVisit = async () => {
    const msg = {
      record_visit: {
        store_id: Number(rvStoreId),
        visitor: rvVisitor.trim(),
        visited_at: rvVisitedAt.trim() ? rvVisitedAt.trim() : null,
        memo: rvMemo || null
      }
    };
    const r = await API.execute({ msg });
    // visit_id を抽出して画面に反映
    const txh = r?.txhash || r?.json?.txhash || r?.tx_response?.txhash;
    let visitId = null;
    if (txh) {
      const tx = await API.tx(txh);
      const body = tx?.json || tx;
      visitId = findAttrInTx(body, 'visit_id');
      if (visitId) setCrVisitId(String(visitId)); // 後続 create_review に流用しやすく
    }
    setRvOut(j({ ...r, visit_id: visitId }));
  };

  const doVisitsByVisitor = async () => {
    // 汎用 smart
    const r = await API.smart({
      visits_by_visitor: { visitor: vbvVisitor.trim(), start_after: null, limit: Number(vbvLimit) || 20 }
    }, contract || undefined);
    setVbvOut(j(r));
  };

  const doCreateReview = async () => {
    const msg = {
      create_review: {
        visit_id: Number(crVisitId),
        rating: Number(crRating),
        title: crTitle,
        body: crBody
      }
    };
    const r = await API.execute({ msg });
    // review_id を抽出して画面に反映
    const txh = r?.txhash || r?.json?.txhash || r?.tx_response?.txhash;
    let reviewId = null;
    if (txh) {
      const tx = await API.tx(txh);
      const body = tx?.json || tx;
      reviewId = findAttrInTx(body, 'review_id');
      if (reviewId) {
        setTipReviewId(String(reviewId));
        setTfrReviewId(String(reviewId));
      }
    }
    setCrOut(j({ ...r, review_id: reviewId }));
  };

  const doTip = async () => {
    const msg = { tip_review_native: { review_id: Number(tipReviewId) } };
    const r = await API.execute({ msg, amount: tipAmount.trim() });
    setTipOut(j(r));
  };

  const doTipsForReview = async () => {
    const r = await API.smart({ tips_for_review: { review_id: Number(tfrReviewId) } }, contract || undefined);
    setTfrOut(j(r));
  };

  const doWithdrawTips = async () => {
    const msg = { withdraw_tips: { to: null, denom: wdDenom.trim(), amount: (wdAmount || '').trim() || null } };
    const r = await API.execute({ msg });
    setWdTipsOut(j(r));
  };

  const doWithdrawFees = async () => {
    const msg = { withdraw_platform_fees: { to: null, denom: wdDenom.trim(), amount: (wdAmount || '').trim() || null } };
    const r = await API.execute({ msg });
    setWdFeesOut(j(r));
  };

  // 便利ボタン
  const resetDefaults = () => {
    setCodeId(DEFAULTS.codeId);
    setContract(DEFAULTS.contract);

    setStoreRef(DEFAULTS.storeRef);
    setStoreOwner(DEFAULTS.storeOwner);

    setRvStoreId(DEFAULTS.rvStoreId);
    setRvVisitor(DEFAULTS.rvVisitor);
    setRvVisitedAt(DEFAULTS.rvVisitedAt);
    setRvMemo(DEFAULTS.rvMemo);

    setVbvVisitor(DEFAULTS.vbvVisitor);
    setVbvLimit(DEFAULTS.vbvLimit);

    setCrVisitId(DEFAULTS.crVisitId);
    setCrRating(DEFAULTS.crRating);
    setCrTitle(DEFAULTS.crTitle);
    setCrBody(DEFAULTS.crBody);

    setTipReviewId(DEFAULTS.tipReviewId);
    setTipAmount(DEFAULTS.tipAmount);

    setTfrReviewId(DEFAULTS.tfrReviewId);

    setWdDenom(DEFAULTS.wdDenom);
    setWdAmount(DEFAULTS.wdAmount);
  };

  const seedFromBackendConfig = async () => {
    const c = await API.getConfig();
    setCfg(c);
    setCodeId(c.codeId || DEFAULTS.codeId);
    setContract(c.contract || DEFAULTS.contract);
    setRvVisitor(c.myAddr || DEFAULTS.rvVisitor);
    setVbvVisitor(c.myAddr || DEFAULTS.vbvVisitor);
  };

  return (
    <div className="grid">
      {/* 操作ヘッダ（便利ボタン） */}
      <div className="card" style={{gridColumn: '1 / -1'}}>
        <div className="row">
          <button className="btn" onClick={seedFromBackendConfig}>バックエンド設定で上書き</button>
          <button className="btn secondary" onClick={resetDefaults}>デフォルト値に戻す</button>
        </div>
      </div>

      {/* Health / Config */}
      <div className="card">
        <h3>Health</h3>
        <div className="row" style={{marginTop:8}}>
          <button className="btn" onClick={doHealth}>GET /api/health</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{healthOut}</pre>
      </div>

      <div className="card">
        <h3>Config（現在値）</h3>
        <pre className="out">{j(cfg ?? {})}</pre>
      </div>

      {/* list-contracts-by-code / contract / smart:config */}
      <div className="card">
        <h3>list-contract(s)-by-code</h3>
        <label>code_id</label>
        <input value={codeId} onChange={(e)=>setCodeId(e.target.value)} />
        <div className="row" style={{marginTop:8}}>
          <button className="btn" onClick={doListByCode}>Run</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{listOut}</pre>
      </div>

      <div className="card">
        <h3>contract</h3>
        <label>address</label>
        <input value={contract} onChange={(e)=>setContract(e.target.value)} />
        <div className="row" style={{marginTop:8}}>
          <button className="btn" onClick={doContract}>Run</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{contractOut}</pre>
      </div>

      <div className="card">
        <h3>smart: config</h3>
        <div className="row" style={{marginTop:8}}>
          <button className="btn" onClick={doSmartConfig}>Run</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{smartCfgOut}</pre>
      </div>

      {/* register_store / stores */}
      <div className="card">
        <h3>register_store</h3>
        <label>store_ref</label>
        <input value={storeRef} onChange={(e)=>setStoreRef(e.target.value)} />
        <label>owner（optional）</label>
        <input value={storeOwner} onChange={(e)=>setStoreOwner(e.target.value)} placeholder="空→null" />
        <div className="row" style={{marginTop:8}}>
          <button className="btn ok" onClick={doRegisterStore}>Execute</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{registerOut}</pre>
      </div>

      <div className="card">
        <h3>stores</h3>
        <div className="row" style={{marginTop:8}}>
          <button className="btn" onClick={doStores}>Run</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{storesOut}</pre>
      </div>

      {/* record_visit / visits_by_visitor */}
      <div className="card">
        <h3>record_visit</h3>
        <label>store_id</label>
        <input value={rvStoreId} onChange={(e)=>setRvStoreId(e.target.value)} />
        <label>visitor</label>
        <input value={rvVisitor} onChange={(e)=>setRvVisitor(e.target.value)} />
        <label>visited_at（optional）</label>
        <input value={rvVisitedAt} onChange={(e)=>setRvVisitedAt(e.target.value)} placeholder="空→null（ブロック時刻）" />
        <label>memo</label>
        <input value={rvMemo} onChange={(e)=>setRvMemo(e.target.value)} />
        <div className="row" style={{marginTop:8}}>
          <button className="btn ok" onClick={doRecordVisit}>Execute</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{rvOut}</pre>
      </div>

      <div className="card">
        <h3>visits_by_visitor</h3>
        <label>visitor</label>
        <input value={vbvVisitor} onChange={(e)=>setVbvVisitor(e.target.value)} />
        <label>limit</label>
        <input value={vbvLimit} onChange={(e)=>setVbvLimit(e.target.value)} />
        <div className="row" style={{marginTop:8}}>
          <button className="btn" onClick={doVisitsByVisitor}>Run</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{vbvOut}</pre>
      </div>

      {/* create_review / tip / tips_for_review */}
      <div className="card">
        <h3>create_review</h3>
        <label>visit_id</label>
        <input value={crVisitId} onChange={(e)=>setCrVisitId(e.target.value)} />
        <label>rating</label>
        <input type="number" value={crRating} onChange={(e)=>setCrRating(e.target.value)} />
        <label>title</label>
        <input value={crTitle} onChange={(e)=>setCrTitle(e.target.value)} />
        <label>body</label>
        <textarea value={crBody} onChange={(e)=>setCrBody(e.target.value)} />
        <div className="row" style={{marginTop:8}}>
          <button className="btn ok" onClick={doCreateReview}>Execute</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{crOut}</pre>
      </div>

      <div className="card">
        <h3>tip_review_native</h3>
        <label>review_id</label>
        <input value={tipReviewId} onChange={(e)=>setTipReviewId(e.target.value)} />
        <label>amount</label>
        <input value={tipAmount} onChange={(e)=>setTipAmount(e.target.value)} />
        <div className="row" style={{marginTop:8}}>
          <button className="btn ok" onClick={doTip}>Execute</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{tipOut}</pre>
      </div>

      <div className="card">
        <h3>tips_for_review</h3>
        <label>review_id</label>
        <input value={tfrReviewId} onChange={(e)=>setTfrReviewId(e.target.value)} />
        <div className="row" style={{marginTop:8}}>
          <button className="btn" onClick={doTipsForReview}>Run</button>
        </div>
        <pre className="out" style={{marginTop:8}}>{tfrOut}</pre>
      </div>

      {/* withdraw */}
      <div className="card">
        <h3>withdraw</h3>
        <label>denom</label>
        <input value={wdDenom} onChange={(e)=>setWdDenom(e.target.value)} />
        <label>amount（optional）</label>
        <input value={wdAmount} onChange={(e)=>setWdAmount(e.target.value)} placeholder="空=全額" />
        <div className="row" style={{marginTop:8}}>
          <button className="btn warn" onClick={doWithdrawTips}>withdraw_tips</button>
          <button className="btn warn" onClick={doWithdrawFees}>withdraw_platform_fees</button>
        </div>
        <h4 style={{marginTop:10}}>Result (tips)</h4>
        <pre className="out">{wdTipsOut}</pre>
        <h4 style={{marginTop:10}}>Result (fees)</h4>
        <pre className="out">{wdFeesOut}</pre>
      </div>
    </div>
  );
}
