import React, { useEffect, useMemo, useState } from "react";
import { API } from "../../api.js";
import { LIMIT_OPTIONS, storeLabel, useChainOptions, visitLabel } from "../../lib/useChainOptions.js";
import { executeWithKeplr } from "../../lib/walletExecute.js";

function pretty(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function unwrapVisits(resp) {
  return resp?.json?.data?.visits ?? resp?.data?.visits ?? resp?.visits ?? [];
}

function formatTime(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const ms = n > 10_000_000_000 ? n : n * 1000;
  return new Date(ms).toLocaleString("ja-JP");
}

export default function VisitList() {
  const [mode, setMode] = useState("visitor");
  const [visitor, setVisitor] = useState("");
  const [storeId, setStoreId] = useState("");
  const [startAfter, setStartAfter] = useState("");
  const [limit, setLimit] = useState("20");
  const [rows, setRows] = useState([]);
  const [out, setOut] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { stores, visits, reviewers, busy: optionsBusy, reload } = useChainOptions();

  const lastVisitId = useMemo(() => {
    const last = rows[rows.length - 1];
    return last?.id == null ? "" : String(last.id);
  }, [rows]);

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setVisitor(c.myAddr || "");
    })().catch(() => {});
  }, []);

  function buildQuery(nextStartAfter = startAfter) {
    const page = {
      start_after: String(nextStartAfter || "").trim() ? Number(nextStartAfter) : null,
      limit: Number(limit) || 20,
    };
    if (mode === "store") {
      if (!storeId.trim()) throw new Error("store_id を入力してください。");
      return { visits_by_store: { store_id: Number(storeId), ...page } };
    }
    if (!visitor.trim()) throw new Error("visitor address を入力してください。");
    return { visits_by_visitor: { visitor: visitor.trim(), ...page } };
  }

  async function load(nextStartAfter = startAfter) {
    setBusy(true);
    setError("");
    try {
      const query = buildQuery(nextStartAfter);
      const r = await API.smart(query);
      setRows(unwrapVisits(r));
      setOut(pretty({ query, response: r }));
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setOut(pretty({ ok: false, error: message }));
    } finally {
      setBusy(false);
    }
  }

  async function loadNext() {
    if (!lastVisitId) return;
    setStartAfter(lastVisitId);
    await load(lastVisitId);
  }

  async function revokeVisit(visitId) {
    setBusy(true);
    setError("");
    try {
      const msg = { revoke_visit: { visit_id: Number(visitId) } };
      const r = await executeWithKeplr({ msg });
      setOut(pretty({ msg, response: r }));
      await load();
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setOut(pretty({ ok: false, error: message }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h2>来店履歴</h2>

      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="review-filter-grid">
        <label>
          検索方法
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="visitor">訪問者別</option>
            <option value="store">店舗別</option>
          </select>
        </label>

        {mode === "store" ? (
          <label>
            店舗
            <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">店舗を選択</option>
              {stores.map((store) => (
                <option key={store.id} value={store.id}>{storeLabel(store)}</option>
              ))}
            </select>
          </label>
        ) : (
          <label>
            訪問者
            <select value={visitor} onChange={(e) => setVisitor(e.target.value)}>
              <option value="">visitor を選択</option>
              {reviewers.map((addr) => (
                <option key={addr} value={addr}>{addr}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          start_after
          <select value={startAfter} onChange={(e) => setStartAfter(e.target.value)}>
            <option value="">先頭から</option>
            {visits.map((visit) => (
              <option key={visit.id} value={visit.id}>{visitLabel(visit, stores)} の後</option>
            ))}
          </select>
        </label>

        <label>
          limit
          <select value={limit} onChange={(e) => setLimit(e.target.value)}>
            {LIMIT_OPTIONS.map((value) => (
              <option key={value} value={value}>{value}件</option>
            ))}
          </select>
        </label>
      </div>

      <div className="toolbar">
        <button className="btn" disabled={busy} onClick={() => load()}>読み込み</button>
        <button className="btn secondary" disabled={busy || !lastVisitId} onClick={loadNext}>次のページ</button>
        <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>ID</th>
            <th>店舗</th>
            <th>visitor</th>
            <th>memo</th>
            <th>visited_at</th>
            <th>reviewable_until</th>
            <th>reviewed</th>
            <th>revoked</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan="9" className="muted">データなし</td></tr>
          ) : rows.map((v) => (
            <tr key={v.id}>
              <td>{v.id}</td>
              <td>{v.store_id}</td>
              <td className="break-all">{v.visitor}</td>
              <td>{v.memo || ""}</td>
              <td>{formatTime(v.visited_at)}</td>
              <td>{formatTime(v.reviewable_until)}</td>
              <td>{String(Boolean(v.reviewed))}</td>
              <td>{String(Boolean(v.revoked))}</td>
              <td>
                <button
                  className="btn warn"
                  disabled={busy || v.reviewed || v.revoked}
                  onClick={() => revokeVisit(v.id)}
                >
                  revoke_visit
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>生データ</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
