// frontend/src/pages/DebugPage.jsx
import React, { useEffect, useState } from 'react';
import { API } from '../api.js';

const j = (v) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2));

export default function DebugPage() {
  // 共通設定
  const [cfg, setCfg] = useState(null);

  // list-contracts-by-code
  const [codeId, setCodeId] = useState('');
  const [listOut, setListOut] = useState('');

  // contract
  const [contract, setContract] = useState('');
  const [contractOut, setContractOut] = useState('');

  // smart: config
  const [smartCfgOut, setSmartCfgOut] = useState('');

  // register_store
  const [storeRef, setStoreRef] = useState('sushi-suwa');
  const [storeOwner, setStoreOwner] = useState('');
  const [registerOut, setRegisterOut] = useState('');

  // stores
  const [storesOut, setStoresOut] = useState('');

  // record_visit
  const [rvStoreId, setRvStoreId] = useState('');
  const [rvVisitor, setRvVisitor] = useState('');
  const [rvVisitedAt, setRvVisitedAt] = useState(''); // null=自動
  const [rvMemo, setRvMemo] = useState('dinner');
  const [rvOut, setRvOut] = useState('');

  // visits_by_visitor
  const [vbvVisitor, setVbvVisitor] = useState('');
  const [vbvLimit, setVbvLimit] = useState(20);
  const [vbvOut, setVbvOut] = useState('');

  // create_review
  const [crVisitId, setCrVisitId] = useState('');
  const [crRating, setCrRating] = useState(5);
  const [crTitle, setCrTitle] = useState('最高');
  const [crBody, setCrBody] = useState('とても美味しかった');
  const [crOut, setCrOut] = useState('');

  // tip_review_native
  const [tipReviewId, setTipReviewId] = useState('');
  const [tipAmount, setTipAmount] = useState('150000000000000000inj'); // 0.15 INJ
  const [tipOut, setTipOut] = useState('');

  // tips_for_review
  const [tfrReviewId, setTfrReviewId] = useState('');
  const [tfrOut, setTfrOut] = useState('');

  // withdraw
  const [wdDenom, setWdDenom] = useState('inj');
  const [wdAmount, setWdAmount] = useState(''); // 空=全額
  const [wdTipsOut, setWdTipsOut] = useState('');
  const [wdFeesOut, setWdFeesOut] = useState('');

  // health
  const [healthOut, setHealthOut] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const c = await API.config();
        setCfg(c);
        setCodeId(c.codeId || '');
        setContract(c.contract || '');
        setRvVisitor(c.myAddr || '');
        setVbvVisitor(c.myAddr || '');
      } catch (e) {
        setCfg({ error: String(e) });
      }
    })();
  }, []);

  const doHealth = async () => {
    try {
      const r = await API.get('/health'); // → /api/health
      setHealthOut(j(r));
    } catch (e) {
      setHealthOut(j({ error: String(e) }));
    }
  };

  const doListByCode = async () => {
    try {
      const r = await API.listContractsByCode(codeId);
      setListOut(j(r));
    } catch (e) {
      setListOut(j({ error: String(e) }));
    }
  };

  const doContract = async () => {
    try {
      const r = await API.contractInfo(contract);
      setContractOut(j(r));
    } catch (e) {
      setContractOut(j({ error: String(e) }));
    }
  };

  const doSmartConfig = async () => {
    try {
      const r = await API.smart({ config: {} }, contract || undefined);
      setSmartCfgOut(j(r));
    } catch (e) {
      setSmartCfgOut(j({ error: String(e) }));
    }
  };

  const doRegisterStore = async () => {
    try {
      const msg = { register_store: { store_ref: storeRef, owner: storeOwner || null } };
      const r = await API.execute(msg);
      setRegisterOut(j(r));
    } catch (e) {
      setRegisterOut(j({ error: String(e) }));
    }
  };

  const doStores = async () => {
    try {
      const r = await API.smart({ stores: { start_after: null, limit: 50 } }, contract || undefined);
      setStoresOut(j(r));
    } catch (e) {
      setStoresOut(j({ error: String(e) }));
    }
  };

  const doRecordVisit = async () => {
    try {
      const msg = {
        record_visit: {
          store_id: Number(rvStoreId),
          visitor: rvVisitor.trim(),
          visited_at: rvVisitedAt.trim() ? rvVisitedAt.trim() : null,
          memo: rvMemo || null,
        },
      };
      const r = await API.execute(msg);
      setRvOut(j(r));
    } catch (e) {
      setRvOut(j({ error: String(e) }));
    }
  };

  const doVisitsByVisitor = async () => {
    try {
      const r = await API.smart(
        { visits_by_visitor: { visitor: vbvVisitor.trim(), start_after: null, limit: Number(vbvLimit) || 20 } },
        contract || undefined,
      );
      setVbvOut(j(r));
    } catch (e) {
      setVbvOut(j({ error: String(e) }));
    }
  };

  const doCreateReview = async () => {
    try {
      const msg = {
        create_review: {
          visit_id: Number(crVisitId),
          rating: Number(crRating),
          title: crTitle,
          body: crBody,
        },
      };
      const r = await API.execute(msg);
      setCrOut(j(r));
    } catch (e) {
      setCrOut(j({ error: String(e) }));
    }
  };

  const doTip = async () => {
    try {
      const msg = { tip_review_native: { review_id: Number(tipReviewId) } };
      const r = await API.execute(msg, { amount: tipAmount.trim() });
      setTipOut(j(r));
    } catch (e) {
      setTipOut(j({ error: String(e) }));
    }
  };

  const doTipsForReview = async () => {
    try {
      const r = await API.smart({ tips_for_review: { review_id: Number(tfrReviewId) } }, contract || undefined);
      setTfrOut(j(r));
    } catch (e) {
      setTfrOut(j({ error: String(e) }));
    }
  };

  const doWithdrawTips = async () => {
    try {
      const msg = { withdraw_tips: { to: null, denom: wdDenom.trim(), amount: wdAmount.trim() || null } };
      const r = await API.execute(msg);
      setWdTipsOut(j(r));
    } catch (e) {
      setWdTipsOut(j({ error: String(e) }));
    }
  };

  const doWithdrawFees = async () => {
    try {
      const msg = { withdraw_platform_fees: { to: null, denom: wdDenom.trim(), amount: wdAmount.trim() || null } };
      const r = await API.execute(msg);
      setWdFeesOut(j(r));
    } catch (e) {
      setWdFeesOut(j({ error: String(e) }));
    }
  };

  return (
    <div className="grid">
      {/* Health / Config */}
      <div className="card">
        <h3>Health</h3>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={doHealth}>GET /api/health</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{healthOut}</pre>
      </div>

      <div className="card">
        <h3>Config (現在値)</h3>
        <pre className="out">{j(cfg ?? {})}</pre>
      </div>

      {/* list-contracts-by-code / contract / smart:config */}
      <div className="card">
        <h3>list-contract(s)-by-code</h3>
        <label>code_id</label>
        <input value={codeId} onChange={(e) => setCodeId(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={doListByCode}>Run</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{listOut}</pre>
      </div>

      <div className="card">
        <h3>contract</h3>
        <label>address</label>
        <input value={contract} onChange={(e) => setContract(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={doContract}>Run</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{contractOut}</pre>
      </div>

      <div className="card">
        <h3>smart: config</h3>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={doSmartConfig}>{'{}'}</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{smartCfgOut}</pre>
      </div>

      {/* register_store / stores */}
      <div className="card">
        <h3>register_store</h3>
        <label>store_ref</label>
        <input value={storeRef} onChange={(e) => setStoreRef(e.target.value)} />
        <label>owner (optional)</label>
        <input value={storeOwner} onChange={(e) => setStoreOwner(e.target.value)} placeholder="空→null" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ok" onClick={doRegisterStore}>Execute</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{registerOut}</pre>
      </div>

      <div className="card">
        <h3>stores</h3>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={doStores}>Run</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{storesOut}</pre>
      </div>

      {/* record_visit / visits_by_visitor */}
      <div className="card">
        <h3>record_visit</h3>
        <label>store_id</label>
        <input value={rvStoreId} onChange={(e) => setRvStoreId(e.target.value)} />
        <label>visitor</label>
        <input value={rvVisitor} onChange={(e) => setRvVisitor(e.target.value)} />
        <label>visited_at (optional)</label>
        <input value={rvVisitedAt} onChange={(e) => setRvVisitedAt(e.target.value)} placeholder="空→null (ブロック時刻)" />
        <label>memo</label>
        <input value={rvMemo} onChange={(e) => setRvMemo(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ok" onClick={doRecordVisit}>Execute</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{rvOut}</pre>
      </div>

      <div className="card">
        <h3>visits_by_visitor</h3>
        <label>visitor</label>
        <input value={vbvVisitor} onChange={(e) => setVbvVisitor(e.target.value)} />
        <label>limit</label>
        <input type="number" value={vbvLimit} onChange={(e) => setVbvLimit(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={doVisitsByVisitor}>Run</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{vbvOut}</pre>
      </div>

      {/* create_review / tip / tips_for_review */}
      <div className="card">
        <h3>create_review</h3>
        <label>visit_id</label>
        <input value={crVisitId} onChange={(e) => setCrVisitId(e.target.value)} />
        <label>rating</label>
        <input type="number" value={crRating} onChange={(e) => setCrRating(e.target.value)} />
        <label>title</label>
        <input value={crTitle} onChange={(e) => setCrTitle(e.target.value)} />
        <label>body</label>
        <textarea value={crBody} onChange={(e) => setCrBody(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ok" onClick={doCreateReview}>Execute</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{crOut}</pre>
      </div>

      <div className="card">
        <h3>tip_review_native</h3>
        <label>review_id</label>
        <input value={tipReviewId} onChange={(e) => setTipReviewId(e.target.value)} />
        <label>amount</label>
        <input value={tipAmount} onChange={(e) => setTipAmount(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn ok" onClick={doTip}>Execute</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{tipOut}</pre>
      </div>

      <div className="card">
        <h3>tips_for_review</h3>
        <label>review_id</label>
        <input value={tfrReviewId} onChange={(e) => setTfrReviewId(e.target.value)} />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn" onClick={doTipsForReview}>Run</button>
        </div>
        <pre className="out" style={{ marginTop: 8 }}>{tfrOut}</pre>
      </div>

      {/* withdraw */}
      <div className="card">
        <h3>withdraw</h3>
        <label>denom</label>
        <input value={wdDenom} onChange={(e) => setWdDenom(e.target.value)} />
        <label>amount (optional)</label>
        <input value={wdAmount} onChange={(e) => setWdAmount(e.target.value)} placeholder="空で全額" />
        <div className="row" style={{ marginTop: 8 }}>
          <button className="btn warn" onClick={doWithdrawTips}>withdraw_tips</button>
          <button className="btn warn" onClick={doWithdrawFees}>withdraw_platform_fees</button>
        </div>
        <h4 style={{ marginTop: 10 }}>Result (tips)</h4>
        <pre className="out">{wdTipsOut}</pre>
        <h4 style={{ marginTop: 10 }}>Result (fees)</h4>
        <pre className="out">{wdFeesOut}</pre>
      </div>
    </div>
  );
}
