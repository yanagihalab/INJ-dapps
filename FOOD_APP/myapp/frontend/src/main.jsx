import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.jsx";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


// // frontend/src/main.js

// // ====== 小さなユーティリティ ======
// const $ = (sel, root = document) => root.querySelector(sel);
// const el = (tag, attrs = {}, ...children) => {
//   const n = document.createElement(tag);
//   for (const [k, v] of Object.entries(attrs || {})) {
//     if (k === 'class') n.className = v;
//     else if (k === 'style') n.style.cssText = v;
//     else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
//     else n.setAttribute(k, v);
//   }
//   for (const c of children) n.append(c instanceof Node ? c : document.createTextNode(c));
//   return n;
// };
// const jsonFmt = (o) => JSON.stringify(o, null, 2);

// const store = {
//   get k() { return JSON.parse(localStorage.getItem('inj-ui') || '{}'); },
//   set k(v) { localStorage.setItem('inj-ui', JSON.stringify(v || {})); },
//   get(path, def = null) {
//     const o = store.k; const parts = path.split('.');
//     let cur = o; for (const p of parts) { if (!cur || !(p in cur)) return def; cur = cur[p]; }
//     return cur;
//   },
//   set(path, val) {
//     const o = store.k; const parts = path.split('.');
//     let cur = o; for (let i=0;i<parts.length-1;i++) { const p = parts[i]; cur[p] = cur[p] || {}; cur = cur[p]; }
//     cur[parts[parts.length-1]] = val; store.k = o;
//   },
//   del(path) {
//     const o = store.k; const parts = path.split('.');
//     let cur = o; for (let i=0;i<parts.length-1;i++) { const p = parts[i]; if (!cur[p]) return; cur = cur[p]; }
//     delete cur[parts[parts.length-1]]; store.k = o;
//   }
// };

// // ====== /api ラッパ ======
// const API = {
//   async get(p) {
//     const r = await fetch('/api' + p); if (!r.ok) throw new Error(await r.text());
//     return r.json();
//   },
//   async post(p, body = {}) {
//     const r = await fetch('/api' + p, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
//     if (!r.ok) throw new Error(await r.text()); return r.json();
//   },
//   // よく使う
//   config: () => API.get('/config'),
//   saveConfig: (cfg) => API.post('/config', cfg),
//   execute: (msg, opts={}) => API.post('/tx/execute', { msg, ...opts }),
//   smart: (msg, contract=null) => API.post('/query/smart', { msg, ...(contract?{contract}:{} ) }),
//   tx: (hash) => API.get('/query/tx?hash=' + encodeURIComponent(hash)),
//   listContractsByCode: (codeId) => API.get('/query/list-contracts-by-code?code_id=' + encodeURIComponent(codeId)),
//   contractInfo: (addr) => API.get('/query/contract?address=' + encodeURIComponent(addr)),
//   stores: () => API.get('/steps/stores'),
//   visitsByVisitor: (addr, limit=50) => API.get(`/steps/visits_by_visitor?visitor=${encodeURIComponent(addr)}&limit=${limit}`),
//   tipsSummary: (reviewId) => API.get(`/steps/tips_for_review?review_id=${Number(reviewId)}`),
// };

// // TX イベントから属性抽出（visit_id / review_id など）
// function findAttrInTx(txJson, key) {
//   const logs = txJson?.logs || txJson?.tx_response?.logs || [];
//   for (const log of logs) {
//     for (const ev of (log.events || [])) {
//       for (const at of (ev.attributes || [])) {
//         if (at.key === key) return at.value;
//       }
//     }
//   }
//   return null;
// }

// // ====== ページ描画 ======
// const app = $('#app');

// async function pageSettings() {
//   app.innerHTML = '';
//   const cfgNow = await API.config();

//   const form = el('div', {class:'panel'},
//     el('h2', {}, '設定'),
//     ...[
//       ['keyname','Key name'],
//       ['myAddr','My address'],
//       ['codeId','Code ID'],
//       ['contract','Contract'],
//       ['injNode','INJ Node'],
//       ['chainId','Chain ID'],
//       ['injectiveHomeHostPath','Host ~/.injective'],
//       ['gasAdjustment','Gas adjustment'],
//       ['defaultFees','Default fees'],
//     ].map(([k,l]) => el('div',{class:'row'},
//         el('label',{}, l),
//         el('input',{type:'text', value: cfgNow[k] ?? '', id:'cfg-'+k})
//     )),
//     el('div', {class:'toolbar'},
//       el('button',{class:'btn', onclick: async ()=>{
//         const payload = {};
//         for (const id of ['keyname','myAddr','codeId','contract','injNode','chainId','injectiveHomeHostPath','gasAdjustment','defaultFees']) {
//           payload[id] = $('#cfg-'+id).value.trim();
//         }
//         const r = await API.saveConfig(payload);
//         out.textContent = jsonFmt(r);
//       }}, '保存'),
//       el('button',{class:'btn secondary', onclick: async ()=>{
//         const r = await API.config();
//         out.textContent = jsonFmt(r);
//       }}, '現在値を取得')
//     ),
//     el('div',{class:'help'}, '保存はバックエンドの CFG に反映され、以降の実行に使われます。'),
//     el('h3',{}, '結果'),
//     el('pre',{id:'settings-out'}, '')
//   );

//   app.append(form);
//   const out = $('#settings-out');
//   out.textContent = jsonFmt(cfgNow);
// }

// async function pageRegisterStore() {
//   app.innerHTML = '';
//   const wrap = el('div',{class:'panel'},
//     el('h2',{}, '店舗登録（register_store）'),
//     el('div',{class:'row'},
//       el('label',{}, 'store_ref'),
//       el('input',{type:'text', id:'ref', value:'sushi-suwa'})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'owner（任意）'),
//       el('input',{type:'text', id:'owner', placeholder:'空でOK → null'})
//     ),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn', onclick: exec}, '送信')
//     ),
//     el('h3',{}, '結果'),
//     el('pre',{id:'out'}, '')
//   );
//   app.append(wrap);

//   async function exec() {
//     const ref = $('#ref').value.trim();
//     const owner = $('#owner').value.trim();
//     const msg = { register_store: { store_ref: ref, owner: owner ? owner : null } };
//     const r = await API.execute(msg);
//     $('#out').textContent = jsonFmt(r);
//   }
// }

// async function pageStoresList() {
//   app.innerHTML = '';
//   const box = el('div',{class:'panel'},
//     el('h2',{}, '店舗一覧（stores）'),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn', onclick: load}, '再読込')
//     ),
//     el('div',{id:'tbl'}),
//     el('h3',{}, '生データ'),
//     el('pre',{id:'out'}, '')
//   );
//   app.append(box);
//   await load();

//   async function load() {
//     const r = await API.stores();
//     $('#out').textContent = jsonFmt(r);
//     const stores = r?.json?.data?.stores || [];
//     const table = el('table',{},
//       el('thead',{}, el('tr',{}, el('th',{},'id'), el('th',{},'store_ref'), el('th',{},'owner'), el('th',{},'active'), el('th',{},'操作'))),
//       el('tbody',{},
//         ...stores.map(s => el('tr',{},
//           el('td',{}, String(s.id)),
//           el('td',{}, s.store_ref),
//           el('td',{}, s.owner ?? el('span',{class:'muted'}, 'null')),
//           el('td',{}, s.active ? 'true':'false'),
//           el('td',{},
//             el('button',{class:'btn secondary', onclick:()=>{ store.set('ctx.storeId', s.id); alert('STORE_ID='+s.id+' を保存しました'); }}, 'この id を保存')
//           )
//         ))
//       )
//     );
//     $('#tbl').innerHTML = '';
//     $('#tbl').append(table);
//   }
// }

// async function pageRecordVisit() {
//   app.innerHTML = '';
//   const cfg = await API.config();
//   const savedStore = store.get('ctx.storeId','');
//   const wrap = el('div',{class:'panel'},
//     el('h2',{}, '来店記録（record_visit）'),
//     el('div',{class:'row'},
//       el('label',{}, 'store_id'),
//       el('input',{type:'number', id:'sid', value: savedStore || ''})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'visitor'),
//       el('input',{type:'text', id:'visitor', value: cfg.myAddr || ''})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'visited_at'),
//       el('input',{type:'text', id:'visited', placeholder:'null=ブロック時刻', value:''})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'memo'),
//       el('input',{type:'text', id:'memo', value:'dinner'})
//     ),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn', onclick: exec}, '送信')
//     ),
//     el('h3',{}, '結果'),
//     el('pre',{id:'out'}, ''),
//     el('div',{class:'help'}, 'TX 内イベントから visit_id を抽出して自動表示します。')
//   );
//   app.append(wrap);

//   async function exec() {
//     const sid = Number($('#sid').value);
//     const visitor = $('#visitor').value.trim();
//     const visited = $('#visited').value.trim();
//     const memo = $('#memo').value.trim();
//     const msg = { record_visit: { store_id: sid, visitor, visited_at: visited ? visited : null, memo } };
//     const r = await API.execute(msg);
//     const txh = r.txhash;
//     let visitId = null;
//     if (txh) {
//       const tx = await API.tx(txh);
//       visitId = findAttrInTx(tx?.json || tx, 'visit_id');
//       if (visitId) {
//         store.set('ctx.visitId', Number(visitId));
//       }
//     }
//     $('#out').textContent = jsonFmt({...r, visit_id: visitId});
//   }
// }

// async function pageVisitsList() {
//   app.innerHTML = '';
//   const cfg = await API.config();
//   const wrap = el('div',{class:'panel'},
//     el('h2',{}, '来店一覧（visits_by_visitor）'),
//     el('div',{class:'row'},
//       el('label',{}, 'visitor'),
//       el('input',{type:'text', id:'vaddr', value: cfg.myAddr || ''})
//     ),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn', onclick: load}, '読込')
//     ),
//     el('div',{id:'tbl'}),
//     el('h3',{}, '生データ'),
//     el('pre',{id:'out'}, '')
//   );
//   app.append(wrap);

//   async function load() {
//     const addr = $('#vaddr').value.trim();
//     const r = await API.visitsByVisitor(addr, 50);
//     $('#out').textContent = jsonFmt(r);
//     const rows = r?.json?.data?.visits || [];
//     const table = el('table',{},
//       el('thead',{}, el('tr',{}, el('th',{},'id'), el('th',{},'store_id'), el('th',{},'memo'), el('th',{},'at'), el('th',{},'操作'))),
//       el('tbody',{},
//         ...rows.map(s => el('tr',{},
//           el('td',{}, String(s.id)),
//           el('td',{}, String(s.store_id)),
//           el('td',{}, s.memo || ''),
//           el('td',{}, s.visited_at || ''),
//           el('td',{},
//             el('button',{class:'btn secondary', onclick:()=>{ store.set('ctx.visitId', s.id); alert('VISIT_ID='+s.id+' を保存しました'); }}, 'この id を保存')
//           )
//         ))
//       )
//     );
//     $('#tbl').innerHTML = ''; $('#tbl').append(table);
//   }
// }

// async function pageCreateReview() {
//   app.innerHTML = '';
//   const visitIdSaved = store.get('ctx.visitId','');
//   const wrap = el('div',{class:'panel'},
//     el('h2',{}, 'レビュー作成（create_review）'),
//     el('div',{class:'row'},
//       el('label',{}, 'visit_id'),
//       el('input',{type:'number', id:'vid', value: visitIdSaved || ''})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'rating (1..5)'),
//       el('input',{type:'number', id:'rating', value: 5})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'title'),
//       el('input',{type:'text', id:'title', value:'最高'})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'body'),
//       el('textarea',{id:'body'}, 'とても美味しかった')
//     ),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn', onclick: exec}, '送信')
//     ),
//     el('h3',{}, '結果'),
//     el('pre',{id:'out'}, ''),
//     el('div',{class:'help'}, 'TX 内イベントから review_id を抽出して自動表示・保存します。')
//   );
//   app.append(wrap);

//   async function exec() {
//     const vid = Number($('#vid').value);
//     const rating = Number($('#rating').value);
//     const title = $('#title').value.trim();
//     const body = $('#body').value.trim();
//     const msg = { create_review: { visit_id: vid, rating, title, body } };
//     const r = await API.execute(msg);
//     const txh = r.txhash;
//     let reviewId = null;
//     if (txh) {
//       const tx = await API.tx(txh);
//       reviewId = findAttrInTx(tx?.json || tx, 'review_id');
//       if (reviewId) store.set('ctx.reviewId', Number(reviewId));
//     }
//     $('#out').textContent = jsonFmt({...r, review_id: reviewId});
//   }
// }

// async function pageTipReview() {
//   app.innerHTML = '';
//   const rid = store.get('ctx.reviewId','');
//   const wrap = el('div',{class:'panel'},
//     el('h2',{}, '投げ銭（tip_review_native）'),
//     el('div',{class:'row'},
//       el('label',{}, 'review_id'),
//       el('input',{type:'number', id:'rid', value: rid || ''})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'amount'),
//       el('input',{type:'text', id:'amt', value:'150000000000000000inj'})
//     ),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn', onclick: exec}, '送信')
//     ),
//     el('h3',{}, '結果'),
//     el('pre',{id:'out'}, '')
//   );
//   app.append(wrap);

//   async function exec() {
//     const review_id = Number($('#rid').value);
//     const amount = $('#amt').value.trim();
//     const r = await API.execute({ tip_review_native: { review_id } }, { amount });
//     $('#out').textContent = jsonFmt(r);
//   }
// }

// async function pageTipsSummary() {
//   app.innerHTML = '';
//   const rid = store.get('ctx.reviewId','');
//   const wrap = el('div',{class:'panel'},
//     el('h2',{}, '投げ銭合計（tips_for_review）'),
//     el('div',{class:'row'},
//       el('label',{}, 'review_id'),
//       el('input',{type:'number', id:'rid', value: rid || ''})
//     ),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn', onclick: load}, '取得')
//     ),
//     el('h3',{}, '結果'),
//     el('pre',{id:'out'}, '')
//   );
//   app.append(wrap);

//   async function load() {
//     const review_id = Number($('#rid').value);
//     const r = await API.tipsSummary(review_id);
//     $('#out').textContent = jsonFmt(r);
//   }
// }

// async function pageWithdraw() {
//   app.innerHTML = '';
//   const wrap = el('div',{class:'panel'},
//     el('h2',{}, '引き出し（withdraw）'),
//     el('div',{class:'row'},
//       el('label',{}, 'denom'),
//       el('input',{type:'text', id:'denom', value:'inj'})
//     ),
//     el('div',{class:'row'},
//       el('label',{}, 'amount（空=全額）'),
//       el('input',{type:'text', id:'amount', value:''})
//     ),
//     el('div',{class:'toolbar'},
//       el('button',{class:'btn ok', onclick: withdrawTips}, 'レビュワー: withdraw_tips'),
//       el('button',{class:'btn warn', onclick: withdrawFees}, 'プラットフォーム: withdraw_platform_fees')
//     ),
//     el('h3',{}, '結果'),
//     el('pre',{id:'out'}, ''),
//     el('div',{class:'help'}, 'to を null にするとコーラー宛に送金されます。')
//   );
//   app.append(wrap);

//   async function withdrawTips() {
//     const denom = $('#denom').value.trim();
//     const amount = $('#amount').value.trim() || null;
//     const r = await API.execute({ withdraw_tips: { to: null, denom, amount } });
//     $('#out').textContent = jsonFmt(r);
//   }
//   async function withdrawFees() {
//     const denom = $('#denom').value.trim();
//     const amount = $('#amount').value.trim() || null;
//     const r = await API.execute({ withdraw_platform_fees: { to: null, denom, amount } });
//     $('#out').textContent = jsonFmt(r);
//   }
// }

// async function pageDebug() {
//   app.innerHTML = '';
//   const box = el('div',{class:'grid'},
//     el('div',{class:'panel'},
//       el('h3',{}, 'Health'),
//       el('div',{class:'toolbar'}, el('button',{class:'btn', onclick: async ()=>{
//         $('#o1').textContent = jsonFmt(await API.get('/health'));
//       }}, 'GET /api/health')),
//       el('pre',{id:'o1'}, '')
//     ),
//     el('div',{class:'panel'},
//       el('h3',{}, 'Config'),
//       el('div',{class:'toolbar'},
//         el('button',{class:'btn', onclick: async ()=>{ $('#o2').textContent = jsonFmt(await API.config()); }}, 'GET /api/config')
//       ),
//       el('pre',{id:'o2'}, '')
//     )
//   );
//   app.append(box);
// }

// // ====== ルーター ======
// const routes = {
//   '#/settings': pageSettings,
//   '#/stores/register': pageRegisterStore,
//   '#/stores/list': pageStoresList,
//   '#/visits/record': pageRecordVisit,
//   '#/visits/list': pageVisitsList,
//   '#/reviews/create': pageCreateReview,
//   '#/tips/tip': pageTipReview,
//   '#/tips/summary': pageTipsSummary,
//   '#/admin/withdraw': pageWithdraw,
//   '#/debug': pageDebug,
// };
// async function render() {
//   const h = location.hash || '#/settings';
//   const fn = routes[h] || pageSettings;
//   try { await fn(); }
//   catch(e){ app.innerHTML = ''; app.append( el('div',{class:'panel'}, el('h2',{}, 'Error'), el('pre',{}, String(e?.stack||e))) ); }
// }
// window.addEventListener('hashchange', render);
// render();
