import React, { useEffect, useMemo, useState } from "react";
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

export default function ReviewList() {
  const [mode, setMode] = useState("latest");
  const [storeId, setStoreId] = useState("");
  const [reviewer, setReviewer] = useState("");
  const [startAfter, setStartAfter] = useState("");
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
  const { stores, reviews, reviewers, busy: optionsBusy, reload } = useChainOptions();

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
    if (mode === "latest") {
      setRows(latestReviews(reviews));
    }
  }, [mode, reviews]);

  const buildQuery = () => {
    const page = {
      start_after: startAfter.trim() ? Number(startAfter) : null,
      limit: Number(limit) || 10,
    };
    if (mode === "store") {
      if (!storeId.trim()) throw new Error("store_id を入力してください。");
      return {
        reviews_by_store: {
          store_id: Number(storeId),
          ...page,
        },
      };
    }
    if (!reviewer.trim()) throw new Error("reviewer address を入力してください。");
    return {
      reviews_by_reviewer: {
        reviewer: reviewer.trim(),
        ...page,
      },
    };
  };

  const load = async () => {
    setBusy(true);
    setError("");
    try {
      if (mode === "latest") {
        const latest = latestReviews(reviews);
        setRows(latest);
        setOut(pretty({ mode: "latest", limit: 10, reviews: latest }));
        return;
      }
      const query = buildQuery();
      const r = await API.smart(query);
      const reviews = latestReviews(unwrapReviews(r));
      setRows(reviews);
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
      const reviews = latestReviews(unwrapReviews(r));
      setRows(reviews);
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
    <div className="page">
      <h2>口コミ一覧</h2>

      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <div className="review-list-default-note">
        <strong>最新の口コミから10件を表示</strong>
        <span>条件を選ぶと、店舗別またはレビュアー別に検索できます。</span>
      </div>

      <div className="review-filter-grid">
        <label>
          検索条件
          <select value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="latest">検索しない（最新10件）</option>
            <option value="store">店舗で検索</option>
            <option value="reviewer">レビュアーで検索</option>
          </select>
        </label>

        {mode === "latest" ? null : mode === "store" ? (
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
            レビュアー
            <select value={reviewer} onChange={(e) => setReviewer(e.target.value)}>
              <option value="">レビュアーを選択</option>
              {reviewers.map((addr) => (
                <option key={addr} value={addr}>{addr}</option>
              ))}
            </select>
          </label>
        )}

        {mode === "latest" ? (
          <div className="review-list-note">
            現在は最新10件を表示しています。
          </div>
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
              limit
              <select value={limit} onChange={(e) => setLimit(e.target.value)}>
                {LIMIT_OPTIONS.map((value) => (
                  <option key={value} value={value}>{value}件</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>

      <div className="toolbar">
        <button className="btn" disabled={busy} onClick={load}>
          {mode === "latest" ? "最新10件を再表示" : "検索"}
        </button>
        <button className="btn secondary" disabled={busy || mode === "latest" || !lastReviewId} onClick={loadNext}>次のページ</button>
        <button className="btn secondary" disabled={optionsBusy} onClick={reload}>候補を再読込</button>
      </div>

      <div className="card" style={{ margin: "12px 0" }}>
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
      </div>

      <table className="data">
        <thead>
          <tr>
            <th>ID</th>
            <th>店舗</th>
            <th>レビュアー</th>
            <th>評価</th>
            <th>title</th>
            <th>公開状態</th>
            <th>投稿日</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan="8" className="muted">データなし</td></tr>
          ) : rows.map((r) => (
            <tr key={r.id}>
              <td>{r.id}</td>
              <td>{r.store_id}</td>
              <td className="break-all">{r.reviewer}</td>
              <td>{r.rating}</td>
              <td>{r.title || ""}</td>
              <td>{String(Boolean(r.hidden))}</td>
              <td>{formatTime(r.created_at)}</td>
              <td className="row" style={{ gap: 8 }}>
                <button className="btn secondary" disabled={busy} onClick={() => pickReview(r)}>選択</button>
                <button className="btn warn" disabled={busy || r.hidden} onClick={() => hideReview(r.id)}>非表示</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3>詳細データ</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
