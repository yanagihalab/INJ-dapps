import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { API } from "../../api.js";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80";

function unwrapStores(resp) {
  return resp?.json?.data?.stores ?? resp?.data?.stores ?? resp?.stores ?? [];
}

function unwrapAgg(resp) {
  return resp?.json?.data ?? resp?.data ?? resp;
}

function ratingFromAgg(agg) {
  const count = Number(agg?.review_count || 0);
  const sum = Number(agg?.rating_sum || 0);
  if (!count) return null;
  return sum / count;
}

function Stars({ value }) {
  const score = value == null ? 0 : Math.round(value);
  return <span className="review-stars">{"★".repeat(score)}{"☆".repeat(5 - score)}</span>;
}

export default function StoreList() {
  const [out, setOut] = useState("");
  const [rows, setRows] = useState([]);
  const [aggs, setAggs] = useState({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [activeFilter, setActiveFilter] = useState("active");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await API.smart({ stores: { start_after: null, limit: 50 } });
      const stores = unwrapStores(r);
      setRows(stores);
      const pairs = await Promise.all(
        stores.map(async (store) => {
          try {
            const agg = await API.smart({ store_agg: { store_id: Number(store.id) } });
            return [store.id, unwrapAgg(agg)];
          } catch {
            return [store.id, null];
          }
        })
      );
      setAgsSafe(pairs);
      setOut(JSON.stringify({ stores: r, aggs: Object.fromEntries(pairs) }, null, 2));
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setOut(JSON.stringify({ ok: false, error: message }, null, 2));
    } finally {
      setBusy(false);
    }
  };

  function setAgsSafe(pairs) {
    setAggs(Object.fromEntries(pairs));
  }

  useEffect(() => {
    load();
  }, []);

  const categories = useMemo(
    () => Array.from(new Set(rows.map((s) => s.category).filter(Boolean))).sort(),
    [rows]
  );

  const prices = useMemo(
    () => Array.from(new Set(rows.map((s) => s.price_range).filter(Boolean))).sort(),
    [rows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((s) => {
      const text = [s.id, s.name, s.category, s.address, s.opening_hours, s.price_range, s.store_ref, s.owner]
        .join(" ")
        .toLowerCase();
      return (
        (!q || text.includes(q)) &&
        (!category || s.category === category) &&
        (!price || s.price_range === price) &&
        (activeFilter === "all" || (activeFilter === "active" ? s.active : !s.active))
      );
    });
  }, [rows, query, category, price, activeFilter]);

  return (
    <div className="review-list-page">
      <section className="review-list-hero">
        <div>
          <span className="review-kicker">Restaurant Search</span>
          <h1>店舗を探す</h1>
          <p>店名、ジャンル、住所、価格帯からオンチェーン登録済みの店舗を絞り込めます。</p>
        </div>
        <NavLink to="/stores/register">店舗登録</NavLink>
      </section>

      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="review-search-panel">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="店名・ジャンル・エリア・owner で検索"
        />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">すべてのジャンル</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={price} onChange={(e) => setPrice(e.target.value)}>
          <option value="">すべての価格帯</option>
          {prices.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value)}>
          <option value="active">active のみ</option>
          <option value="inactive">inactive のみ</option>
          <option value="all">すべて</option>
        </select>
        <button className="btn" disabled={busy} onClick={load}>再読み込み</button>
      </section>

      <section className="review-results-head">
        <strong>{filtered.length}</strong>
        <span>件の店舗</span>
      </section>

      {filtered.length ? (
        <div className="review-result-list">
          {filtered.map((s) => {
            const agg = aggs[s.id];
            const rating = ratingFromAgg(agg);
            const reviewCount = Number(agg?.review_count || 0);
            return (
              <article className="review-result-card" key={s.id}>
                <div
                  className="review-result-photo"
                  style={{ backgroundImage: `url(${s.image_url || FALLBACK_IMAGE})` }}
                />
                <div className="review-result-main">
                  <div className="review-result-title">
                    <div>
                      <h2>{s.name || s.store_ref || `Store #${s.id}`}</h2>
                      <p>{s.category || "ジャンル未設定"} · {s.price_range || "価格帯未設定"}</p>
                    </div>
                    <span className="review-score">{rating == null ? "-" : rating.toFixed(1)}</span>
                  </div>
                  <div className="review-rating-line">
                    <Stars value={rating} />
                    <span>{reviewCount ? `${reviewCount} reviews` : "レビュー待ち"}</span>
                    <span>{s.active ? "受付中" : "停止中"}</span>
                  </div>
                  <p>{s.address || "住所未設定"}</p>
                  <p>{s.opening_hours || "営業時間未設定"}</p>
                  {s.description ? <p className="review-description">{s.description}</p> : null}
                  <div className="review-result-meta">
                    <span>ID: {s.id}</span>
                    <span>{s.store_ref}</span>
                    <span>{s.owner || "owner未設定"}</span>
                  </div>
                  <div className="review-card-actions">
                    <NavLink to="/visits/record">来店記録</NavLink>
                    <NavLink to="/reviews/list">レビュー</NavLink>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="review-empty">
          <strong>条件に合う店舗がありません。</strong>
          <span>検索条件を変えるか、新しい店舗を登録してください。</span>
        </div>
      )}

      <details className="review-raw">
        <summary>生データ</summary>
        <pre className="out">{out}</pre>
      </details>
    </div>
  );
}
