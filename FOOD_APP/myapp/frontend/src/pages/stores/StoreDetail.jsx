import React, { useEffect, useMemo, useState } from "react";
import { NavLink, useParams } from "react-router-dom";
import { API } from "../../api.js";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1600&q=80";

function unwrap(resp, key) {
  return resp?.json?.data?.[key] ?? resp?.data?.[key] ?? resp?.[key] ?? null;
}

function unwrapStores(resp) {
  return resp?.json?.data?.stores ?? resp?.data?.stores ?? resp?.stores ?? [];
}

function unwrapReviews(resp) {
  return resp?.json?.data?.reviews ?? resp?.data?.reviews ?? resp?.reviews ?? [];
}

function formatTime(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const ms = n > 10_000_000_000 ? n : n * 1000;
  return new Date(ms).toLocaleString("ja-JP");
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

function shortAddress(addr) {
  const value = String(addr || "");
  if (value.length <= 18) return value || "未設定";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function qrPayload(store) {
  return JSON.stringify({
    node_id: store?.store_ref || `store-${store?.id || ""}`,
    store_id: Number(store?.id || 0),
  });
}

export default function StoreDetail() {
  const { storeId } = useParams();
  const [store, setStore] = useState(null);
  const [agg, setAgg] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [out, setOut] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const rating = useMemo(() => ratingFromAgg(agg), [agg]);
  const reviewCount = Number(agg?.review_count || reviews.length || 0);
  const payload = useMemo(() => qrPayload(store), [store]);
  const visitUrl = store ? `/visits/record?node_id=${encodeURIComponent(store.store_ref || "")}&store_id=${store.id}` : "/visits/record";
  const mapUrl = store?.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(store.address)}`
    : "";

  const ratingBars = useMemo(() => {
    const counts = new Map();
    reviews.forEach((review) => {
      const key = Number(review.rating || 0);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [5, 4, 3, 2, 1].map((score) => {
      const count = counts.get(score) || 0;
      const pct = reviews.length ? Math.round((count / reviews.length) * 100) : 0;
      return { score, count, pct };
    });
  }, [reviews]);

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      const id = Number(storeId);
      const [storeResp, aggResp, reviewResp] = await Promise.all([
        API.smart({ store: { store_id: id } }).catch(async () => {
          const list = await API.smart({ stores: { start_after: null, limit: 100 } });
          return unwrapStores(list).find((item) => Number(item.id) === id) || null;
        }),
        API.smart({ store_agg: { store_id: id } }).catch(() => null),
        API.smart({ reviews_by_store: { store_id: id, start_after: null, limit: 50 } }).catch(() => null),
      ]);
      const nextStore = unwrap(storeResp, "store") || storeResp?.json?.data || storeResp?.data || storeResp;
      const nextAgg = aggResp?.json?.data ?? aggResp?.data ?? aggResp;
      const nextReviews = unwrapReviews(reviewResp)
        .filter((review) => !review.hidden)
        .sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
      if (!nextStore) throw new Error("店舗情報を取得できませんでした。");
      setStore(nextStore);
      setAgg(nextAgg);
      setReviews(nextReviews);
      setOut(JSON.stringify({ store: nextStore, agg: nextAgg, reviews: nextReviews }, null, 2));
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setOut(JSON.stringify({ ok: false, error: message }, null, 2));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, [storeId]);

  if (!store && !error) {
    return <div className="page"><h2>店舗詳細</h2><p className="muted">店舗情報を読み込んでいます。</p></div>;
  }

  return (
    <div className="store-detail-page">
      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      {store ? (
        <>
          <section className="store-detail-hero">
            <div
              className="store-detail-photo"
              style={{ backgroundImage: `url(${store.image_url || FALLBACK_IMAGE})` }}
            />
            <div className="store-detail-summary">
              <span className="review-kicker">{store.category || "Restaurant"}</span>
              <h1>{store.name || store.store_ref || `Store #${store.id}`}</h1>
              <p>{store.description || store.address || "店舗プロフィールはまだ編集中です。"}</p>
              <div className="store-detail-score-row">
                <strong>{rating == null ? "-" : rating.toFixed(1)}</strong>
                <Stars value={rating} />
                <span>{reviewCount}件の口コミ</span>
              </div>
              <div className="review-card-actions">
                <NavLink to={visitUrl}>来店QRを読み取る</NavLink>
                <NavLink to={`/stores/${store.id}/qr`}>掲示QRを作成</NavLink>
                <NavLink to="/reviews/create">口コミを書く</NavLink>
                {mapUrl ? <a href={mapUrl} target="_blank" rel="noreferrer">地図で見る</a> : null}
              </div>
            </div>
          </section>

          <section className="store-detail-grid">
            <article className="card store-info-card">
              <h2>店舗基本情報</h2>
              <dl className="store-info-list">
                <dt>店舗 node id / store_ref</dt>
                <dd>{store.store_ref || "未設定"}</dd>
                <dt>住所</dt>
                <dd>
                  {store.address || "未設定"}
                  {mapUrl ? <a className="store-map-link" href={mapUrl} target="_blank" rel="noreferrer">地図を開く</a> : null}
                </dd>
                <dt>電話番号</dt>
                <dd>{store.phone || "未設定"}</dd>
                <dt>Webサイト</dt>
                <dd>{store.website ? <a href={store.website} target="_blank" rel="noreferrer">{store.website}</a> : "未設定"}</dd>
                <dt>価格帯</dt>
                <dd>{store.price_range || "未設定"}</dd>
                <dt>ステータス</dt>
                <dd>{store.active ? "受付中" : "停止中"}</dd>
              </dl>
            </article>

            <article className="card store-hours-card">
              <h2>営業情報</h2>
              <p>{store.opening_hours || "営業時間はまだ登録されていません。"}</p>
              <div className="store-qr-card">
                <span>来店QR用 node id</span>
                <strong>{store.store_ref || `store-${store.id}`}</strong>
                <code>{payload}</code>
                <NavLink to={`/stores/${store.id}/qr`}>店舗掲示用QRページを開く</NavLink>
              </div>
            </article>

            <article className="card store-agg-card">
              <h2>評価集計</h2>
              <div className="store-agg-main">
                <strong>{rating == null ? "-" : rating.toFixed(1)}</strong>
                <span>{reviewCount} reviews</span>
              </div>
              <div className="store-rating-bars">
                {ratingBars.map((row) => (
                  <div className="store-rating-bar" key={row.score}>
                    <span>★{row.score}</span>
                    <div><i style={{ width: `${row.pct}%` }} /></div>
                    <b>{row.count}</b>
                  </div>
                ))}
              </div>
            </article>
          </section>

          <section className="store-review-section">
            <div className="review-section-head">
              <div>
                <span>Recent reviews</span>
                <h2>この店舗の口コミ</h2>
              </div>
              <button className="btn secondary" disabled={busy} onClick={load}>再読み込み</button>
            </div>
            {reviews.length ? (
              <div className="review-feed-list">
                {reviews.slice(0, 10).map((review) => (
                  <article className="review-feed-card compact" key={review.id}>
                    <div className="review-feed-score">
                      <strong>{review.rating}</strong>
                      <Stars value={review.rating} />
                    </div>
                    <div className="review-feed-main">
                      <div className="review-feed-head">
                        <div>
                          <span className="review-feed-store">訪問者 {shortAddress(review.reviewer)}</span>
                          <h2>{review.title || "タイトルなし"}</h2>
                        </div>
                        <span>{formatTime(review.created_at)}</span>
                      </div>
                      {review.body ? <p>{review.body}</p> : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="review-empty">
                <strong>まだ口コミがありません。</strong>
                <span>来店記録後に最初の口コミを投稿できます。</span>
              </div>
            )}
          </section>

          <details className="review-raw">
            <summary>詳細データ</summary>
            <pre className="out">{out}</pre>
          </details>
        </>
      ) : null}
    </div>
  );
}
