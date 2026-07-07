import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { API } from "../api.js";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80";

const categoryLinks = [
  "寿司",
  "ラーメン",
  "焼肉",
  "和食",
  "イタリアン",
  "カフェ",
];

function unwrapStores(resp) {
  return resp?.json?.data?.stores ?? resp?.data?.stores ?? resp?.stores ?? [];
}

function ratingFromAgg(agg) {
  const count = Number(agg?.review_count || 0);
  const sum = Number(agg?.rating_sum || 0);
  if (!count) return null;
  return sum / count;
}

function Stars({ value }) {
  const score = value == null ? 0 : Math.round(value);
  return (
    <span className="review-stars" aria-label={value == null ? "no rating" : `${value.toFixed(1)} rating`}>
      {"★".repeat(score)}{"☆".repeat(5 - score)}
    </span>
  );
}

function StoreCard({ store, agg }) {
  const rating = ratingFromAgg(agg);
  const reviewCount = Number(agg?.review_count || 0);
  return (
    <article className="review-store-card">
      <div
        className="review-store-photo"
        style={{ backgroundImage: `url(${store.image_url || FALLBACK_IMAGE})` }}
      >
        <span>{store.active ? "受付中" : "停止中"}</span>
      </div>
      <div className="review-store-body">
        <div className="review-store-title">
          <div>
            <strong>{store.name || store.store_ref || `Store #${store.id}`}</strong>
            <p>{store.category || "ジャンル未設定"} · {store.price_range || "価格帯未設定"}</p>
          </div>
          <span className="review-score">{rating == null ? "-" : rating.toFixed(1)}</span>
        </div>
        <div className="review-rating-line">
          <Stars value={rating} />
          <span>{reviewCount ? `${reviewCount} reviews` : "レビュー待ち"}</span>
        </div>
        <p className="review-store-meta">{store.address || "住所未設定"}</p>
        <p className="review-store-meta">{store.opening_hours || "営業時間未設定"}</p>
        <div className="review-card-actions">
          <NavLink to="/visits/record">来店記録</NavLink>
          <NavLink to="/reviews/list">レビューを見る</NavLink>
        </div>
      </div>
    </article>
  );
}

export default function HomePage() {
  const [stores, setStores] = useState([]);
  const [aggs, setAggs] = useState({});
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let ignore = false;
    (async () => {
      setBusy(true);
      setError("");
      try {
        const resp = await API.smart({ stores: { start_after: null, limit: 24 } });
        const list = unwrapStores(resp);
        if (ignore) return;
        setStores(list);
        const pairs = await Promise.all(
          list.slice(0, 12).map(async (store) => {
            try {
              const aggResp = await API.smart({ store_agg: { store_id: Number(store.id) } });
              return [store.id, aggResp?.json?.data ?? aggResp?.data ?? aggResp];
            } catch {
              return [store.id, null];
            }
          })
        );
        if (!ignore) setAggs(Object.fromEntries(pairs));
      } catch (e) {
        if (!ignore) setError(String(e?.message || e));
      } finally {
        if (!ignore) setBusy(false);
      }
    })();
    return () => {
      ignore = true;
    };
  }, []);

  const filteredStores = useMemo(() => {
    const q = query.trim().toLowerCase();
    return stores.filter((store) => {
      const categoryMatch = !category || store.category === category;
      const text = [
        store.name,
        store.category,
        store.address,
        store.price_range,
        store.opening_hours,
        store.store_ref,
      ].join(" ").toLowerCase();
      return categoryMatch && (!q || text.includes(q));
    });
  }, [stores, query, category]);

  const featuredStores = filteredStores.slice(0, 6);
  const totalReviews = Object.values(aggs).reduce((sum, agg) => sum + Number(agg?.review_count || 0), 0);

  return (
    <div className="review-home">
      <section className="review-hero">
        <div className="review-hero-bg" />
        <div className="review-hero-content">
          <span className="review-kicker">On-chain restaurant reviews</span>
          <h1>信頼できる来店レビューで、次のお店を見つける。</h1>
          <p>
            認証コードで登録された店舗、QR来店記録、口コミ、レビュー応援をひとつの流れで扱います。
          </p>
          <div className="review-search">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="店名・ジャンル・エリアで検索"
            />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">すべてのジャンル</option>
              {categoryLinks.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <NavLink to="/stores/list">一覧へ</NavLink>
          </div>
          <div className="review-hero-stats">
            <div><strong>{stores.length}</strong><span>stores</span></div>
            <div><strong>{totalReviews}</strong><span>reviews</span></div>
            <div><strong>QR</strong><span>verified visits</span></div>
          </div>
        </div>
      </section>

      <section className="review-category-strip" aria-label="popular categories">
        {categoryLinks.map((item) => (
          <button
            key={item}
            type="button"
            className={category === item ? "active" : ""}
            onClick={() => setCategory((current) => current === item ? "" : item)}
          >
            {item}
          </button>
        ))}
      </section>

      {error ? (
        <div className="error-box">
          <strong>読み込みエラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="review-section">
        <div className="review-section-head">
          <div>
            <span>Featured</span>
            <h2>注目の店舗</h2>
          </div>
          <NavLink to="/stores/register">店舗を登録</NavLink>
        </div>

        {busy ? (
          <div className="review-empty">店舗情報を読み込んでいます。</div>
        ) : featuredStores.length ? (
          <div className="review-store-grid">
            {featuredStores.map((store) => (
              <StoreCard key={store.id} store={store} agg={aggs[store.id]} />
            ))}
          </div>
        ) : (
          <div className="review-empty">
            <strong>まだ店舗がありません。</strong>
            <span>発行済みの認証コードで店舗登録から最初の店舗を追加してください。</span>
          </div>
        )}
      </section>

      <section className="review-workflow-band">
        <NavLink to="/stores/register">
          <span>Store</span>
          <strong>店舗プロフィール登録</strong>
        </NavLink>
        <NavLink to="/visits/record">
          <span>Visit</span>
          <strong>QRで来店記録</strong>
        </NavLink>
        <NavLink to="/reviews/list">
          <span>Review</span>
          <strong>レビュー閲覧・管理</strong>
        </NavLink>
      </section>
    </div>
  );
}
