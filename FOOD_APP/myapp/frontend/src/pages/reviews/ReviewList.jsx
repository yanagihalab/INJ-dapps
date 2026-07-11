import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { API } from "../../api.js";
import {
  LIMIT_OPTIONS,
  RATING_OPTIONS,
  reviewLabel,
  storeLabel,
  useChainOptions,
} from "../../lib/useChainOptions.js";
import { executeWithKeplr } from "../../lib/walletExecute.js";

function pretty(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
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

function reviewSortValue(review) {
  const created = Number(review?.created_at);
  if (Number.isFinite(created)) return created;
  const id = Number(review?.id);
  return Number.isFinite(id) ? id : 0;
}

function latestReviews(reviews, limit = 10) {
  return [...reviews]
    .sort((a, b) => {
      const createdDiff = reviewSortValue(b) - reviewSortValue(a);
      if (createdDiff !== 0) return createdDiff;
      return Number(b?.id || 0) - Number(a?.id || 0);
    })
    .slice(0, limit);
}

function shortAddress(addr) {
  const value = String(addr || "");
  if (value.length <= 18) return value || "未設定";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

function areaFromAddress(address) {
  return String(address || "").trim().split(/[,\s　]/).filter(Boolean).slice(0, 2).join(" ");
}

function Stars({ value }) {
  const score = Math.max(0, Math.min(5, Number(value) || 0));
  return <span className="review-stars">{"★".repeat(score)}{"☆".repeat(5 - score)}</span>;
}

export default function ReviewList() {
  const [mode, setMode] = useState("latest");
  const [storeId, setStoreId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [category, setCategory] = useState("");
  const [area, setArea] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [startAfter, setStartAfter] = useState("");
  const [latestCursor, setLatestCursor] = useState("");
  const [limit, setLimit] = useState("10");
  const [rows, setRows] = useState([]);
  const [out, setOut] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [edit, setEdit] = useState({
    reviewId: "",
    rating: "",
    title: "",
    body: "",
  });
  const { stores, reviews, reviewers, cfg, busy: optionsBusy, reload } = useChainOptions();

  const storeMap = useMemo(
    () => new Map(stores.map((store) => [Number(store.id), store])),
    [stores]
  );

  const categories = useMemo(
    () => Array.from(new Set(stores.map((s) => s.category).filter(Boolean))).sort(),
    [stores]
  );

  const areas = useMemo(
    () => Array.from(new Set(stores.map((s) => areaFromAddress(s.address)).filter(Boolean))).sort(),
    [stores]
  );

  const lastReviewId = useMemo(() => {
    const last = rows[rows.length - 1];
    return last?.id == null ? "" : String(last.id);
  }, [rows]);

  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setReviewer(c.myAddr || "");
    })().catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === "latest") loadLatest();
  }, [mode, cfg?.contract]);

  const loadLatest = async (cursor = "") => {
    setBusy(true);
    setError("");
    try {
      const resp = await API.latestReviews(Number(limit) || 10, cfg?.contract || undefined, cursor);
      const latest = resp?.reviews || [];
      setRows(latest);
      setLatestCursor(resp?.next_cursor || "");
      setOut(pretty({ mode: "latest", response: resp }));
    } catch (e) {
      const fallback = latestReviews(reviews, Number(limit) || 10);
      setRows(fallback);
      setLatestCursor("");
      const message = String(e?.message || e);
      setError(`latest_reviews API fallback: ${message}`);
      setOut(pretty({ mode: "latest_fallback", error: message, reviews: fallback }));
    } finally {
      setBusy(false);
    }
  };

  const visibleRows = useMemo(() => {
    const q = keyword.trim().toLowerCase();
    return rows.filter((review) => {
      if (review.hidden) return false;
      const store = storeMap.get(Number(review.store_id));
      const searchText = [
        review.id,
        review.title,
        review.body,
        review.reviewer,
        store?.name,
        store?.store_ref,
        store?.category,
        store?.address,
        store?.price_range,
      ].join(" ").toLowerCase();
      return (
        (!q || searchText.includes(q)) &&
        (!storeId || Number(review.store_id) === Number(storeId)) &&
        (!category || store?.category === category) &&
        (!area || String(store?.address || "").includes(area)) &&
        (!ratingFilter || Number(review.rating) === Number(ratingFilter)) &&
        (mode !== "reviewer" || !reviewer || review.reviewer === reviewer)
      );
    });
  }, [rows, keyword, storeId, category, area, ratingFilter, mode, reviewer, storeMap]);

  const buildQuery = () => {
    const page = {
      start_after: startAfter.trim() ? Number(startAfter) : null,
      limit: Number(limit) || 10,
    };
    if (mode === "store") {
      if (!storeId.trim()) throw new Error("店舗を選択してください。");
      return { reviews_by_store: { store_id: Number(storeId), ...page } };
    }
    if (!reviewer.trim()) throw new Error("訪問者を選択してください。");
    return { reviews_by_reviewer: { reviewer: reviewer.trim(), ...page } };
  };

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "latest") {
        await loadLatest("");
        return;
      }
      const query = buildQuery();
      const r = await API.smart(query);
      const nextReviews = latestReviews(unwrapReviews(r), Number(limit) || 10);
      setRows(nextReviews);
      setOut(pretty({ query, response: r }));
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setOut(pretty({ ok: false, error: message }));
    } finally {
      setBusy(false);
    }
  };

  const loadNext = async () => {
    if (mode === "latest") {
      if (!latestCursor) return;
      await loadLatest(latestCursor);
      return;
    }
    if (!lastReviewId) return;
    setStartAfter(lastReviewId);
    setBusy(true);
    setError("");
    try {
      const page = {
        start_after: Number(lastReviewId),
        limit: Number(limit) || 10,
      };
      const query = mode === "store"
        ? { reviews_by_store: { store_id: Number(storeId), ...page } }
        : { reviews_by_reviewer: { reviewer: reviewer.trim(), ...page } };
      const r = await API.smart(query);
      const nextReviews = latestReviews(unwrapReviews(r), Number(limit) || 10);
      setRows(nextReviews);
      setOut(pretty({ query, response: r }));
    } catch (e) {
      const message = String(e?.message || e);
      setError(message);
      setOut(pretty({ ok: false, error: message }));
    } finally {
      setBusy(false);
    }
  };

  const pickReview = (r) => {
    setEdit({
      reviewId: String(r.id ?? ""),
      rating: String(r.rating ?? ""),
      title: r.title || "",
      body: r.body || "",
    });
  };

  const editReview = async () => {
    setBusy(true);
    setError("");
    try {
      if (!edit.reviewId) throw new Error("review_id を入力してください。");
      const msg = {
        edit_review: {
          review_id: Number(edit.reviewId),
          rating: edit.rating === "" ? null : Number(edit.rating),
          title: edit.title === "" ? null : edit.title,
          body: edit.body === "" ? null : edit.body,
        },
      };
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
  };

  const hideReview = async (reviewId = edit.reviewId) => {
    setBusy(true);
    setError("");
    try {
      if (!reviewId) throw new Error("review_id を入力してください。");
      const msg = { hide_review: { review_id: Number(reviewId) } };
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
  };

  return (
    <div className="review-list-page review-discovery-page">
      <section className="review-list-hero">
        <div>
          <span className="review-kicker">Review Search</span>
          <h1>口コミを探す</h1>
          <p>最新10件を起点に、店舗名・ジャンル・エリア・評価・訪問者で絞り込めます。</p>
        </div>
        <NavLink to="/reviews/create">口コミを書く</NavLink>
      </section>

      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="review-search-panel review-search-panel-wide">
        <input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="店名・本文・エリア・レビュアーで検索"
        />
        <select value={storeId} onChange={(e) => {
          setStoreId(e.target.value);
          if (e.target.value) setMode("store");
        }}>
          <option value="">すべての店舗</option>
          {stores.map((store) => (
            <option key={store.id} value={store.id}>{storeLabel(store)}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">すべてのジャンル</option>
          {categories.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={area} onChange={(e) => setArea(e.target.value)}>
          <option value="">すべてのエリア</option>
          {areas.map((item) => <option key={item} value={item}>{item}</option>)}
        </select>
        <select value={ratingFilter} onChange={(e) => setRatingFilter(e.target.value)}>
          <option value="">すべての評価</option>
          {RATING_OPTIONS.map((value) => (
            <option key={value} value={value}>★{value}</option>
          ))}
        </select>
        <select value={reviewer} onChange={(e) => {
          setReviewer(e.target.value);
          if (e.target.value) setMode("reviewer");
        }}>
          <option value="">すべての訪問者</option>
          {reviewers.map((addr) => (
            <option key={addr} value={addr}>{shortAddress(addr)}</option>
          ))}
        </select>
      </section>

      <section className="review-filter-strip">
        <label>
          検索モード
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="latest">最新10件</option>
            <option value="store">店舗別に取得</option>
            <option value="reviewer">訪問者別に取得</option>
          </select>
        </label>

        {mode === "latest" ? (
          <div className="review-list-note">最新口コミから10件を表示しています。</div>
        ) : (
          <>
            <label>
              start_after
              <select value={startAfter} onChange={(e) => setStartAfter(e.target.value)}>
                <option value="">先頭から</option>
                {reviews.map((review) => (
                  <option key={review.id} value={review.id}>#{review.id} の後</option>
                ))}
              </select>
            </label>

            <label>
              表示件数
              <select value={limit} onChange={(e) => setLimit(e.target.value)}>
                {LIMIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value}件</option>
                ))}
              </select>
            </label>
          </>
        )}
      </section>

      <div className="review-mobile-actions">
        <button className="btn" disabled={busy} onClick={load}>
          {mode === "latest" ? "最新10件を再表示" : "検索"}
        </button>
        <button
          className="btn secondary"
          disabled={busy || (mode === "latest" ? !latestCursor : !lastReviewId)}
          onClick={loadNext}
        >
          次のページ
        </button>
        <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
      </div>

      <section className="review-results-head">
        <div>
          <strong>{visibleRows.length}</strong>
          <span>件の口コミ</span>
        </div>
        <span>{mode === "latest" ? "最新10件をデフォルト表示" : "検索結果"}</span>
      </section>

      {visibleRows.length ? (
        <div className="review-feed-list">
          {visibleRows.map((r) => {
            const store = storeMap.get(Number(r.store_id));
            return (
              <article className="review-feed-card" key={r.id}>
                <div className="review-feed-score">
                  <strong>{r.rating || "-"}</strong>
                  <Stars value={r.rating} />
                </div>
                <div className="review-feed-main">
                  <div className="review-feed-head">
                    <div>
                      <NavLink to={`/stores/${r.store_id}`} className="review-feed-store">
                        {store?.name || store?.store_ref || `Store #${r.store_id}`}
                      </NavLink>
                      <h2>{r.title || "タイトルなし"}</h2>
                    </div>
                    <span>{formatTime(r.created_at)}</span>
                  </div>
                  {r.body ? <p>{r.body}</p> : null}
                  <div className="review-result-meta">
                    <span>{store?.category || "ジャンル未設定"}</span>
                    <span>{store?.address || "エリア未設定"}</span>
                    <span>訪問者 {shortAddress(r.reviewer)}</span>
                    <span>Review #{r.id}</span>
                  </div>
                  <div className="review-card-actions">
                    <NavLink to={`/stores/${r.store_id}`}>店舗詳細</NavLink>
                    <button className="btn secondary" disabled={busy} onClick={() => pickReview(r)}>編集対象にする</button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="review-empty">
          <strong>条件に合う口コミがありません。</strong>
          <span>キーワードや評価条件を変えて検索してください。</span>
        </div>
      )}

      <details className="card review-management-panel">
        <summary>口コミの編集・非表示</summary>
        <h3>口コミの編集・非表示</h3>
        <div className="review-filter-grid">
          <label>
            レビュー
            <select value={edit.reviewId} onChange={(e) => setEdit((s) => ({ ...s, reviewId: e.target.value }))}>
              <option value="">レビューを選択</option>
              {reviews.map((review) => (
                <option key={review.id} value={review.id}>{reviewLabel(review, stores)}</option>
              ))}
            </select>
          </label>
          <label>
            rating（空=変更なし）
            <select value={edit.rating} onChange={(e) => setEdit((s) => ({ ...s, rating: e.target.value }))}>
              <option value="">変更なし</option>
              {RATING_OPTIONS.map((value) => (
                <option key={value} value={value}>★{value}</option>
              ))}
            </select>
          </label>
          <label>
            title（空=変更なし）
            <input value={edit.title} onChange={(e) => setEdit((s) => ({ ...s, title: e.target.value }))} />
          </label>
          <label>
            body（空=変更なし）
            <textarea value={edit.body} onChange={(e) => setEdit((s) => ({ ...s, body: e.target.value }))} />
          </label>
        </div>
        <div className="toolbar">
          <button className="btn" disabled={busy || !edit.reviewId} onClick={editReview}>口コミを更新</button>
          <button className="btn warn" disabled={busy || !edit.reviewId} onClick={() => hideReview()}>非表示にする</button>
        </div>
      </details>

      <details className="review-raw">
        <summary>詳細データ</summary>
        <pre className="out">{out}</pre>
      </details>
    </div>
  );
}
