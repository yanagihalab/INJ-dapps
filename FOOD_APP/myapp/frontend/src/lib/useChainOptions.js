import { useEffect, useMemo, useState } from "react";
import { API } from "../api.js";

function uniqById(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const id = String(row?.id ?? "");
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function unwrap(resp, key) {
  return resp?.json?.data?.[key] ?? resp?.data?.[key] ?? resp?.[key] ?? [];
}

export function storeLabel(store) {
  if (!store) return "";
  const name = store.name || store.store_ref || `Store #${store.id}`;
  const bits = [store.category, store.address].filter(Boolean).join(" / ");
  return bits ? `#${store.id} ${name} (${bits})` : `#${store.id} ${name}`;
}

export function visitLabel(visit, stores = []) {
  if (!visit) return "";
  const store = stores.find((s) => Number(s.id) === Number(visit.store_id));
  const storeName = store?.name || store?.store_ref || `store ${visit.store_id}`;
  const status = visit.reviewed ? "reviewed" : visit.revoked ? "revoked" : "open";
  return `#${visit.id} ${storeName} / ${status}`;
}

export function reviewLabel(review, stores = []) {
  if (!review) return "";
  const store = stores.find((s) => Number(s.id) === Number(review.store_id));
  const storeName = store?.name || store?.store_ref || `store ${review.store_id}`;
  return `#${review.id} ★${review.rating} ${storeName}${review.title ? ` - ${review.title}` : ""}`;
}

export function useChainOptions() {
  const [cfg, setCfg] = useState(null);
  const [stores, setStores] = useState([]);
  const [visits, setVisits] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    try {
      const c = await API.getConfig();
      setCfg(c);

      const storesResp = await API.smart({ stores: { start_after: null, limit: 100 } });
      const storeRows = unwrap(storesResp, "stores");
      setStores(storeRows);

      const visitBatches = [];
      if (c?.myAddr) {
        visitBatches.push(API.smart({
          visits_by_visitor: { visitor: c.myAddr, start_after: null, limit: 100 },
        }).catch(() => null));
      }
      for (const store of storeRows.slice(0, 20)) {
        visitBatches.push(API.smart({
          visits_by_store: { store_id: Number(store.id), start_after: null, limit: 100 },
        }).catch(() => null));
      }
      const visitRows = (await Promise.all(visitBatches)).flatMap((resp) => unwrap(resp, "visits"));
      setVisits(uniqById(visitRows));

      const reviewBatches = [];
      if (c?.myAddr) {
        reviewBatches.push(API.smart({
          reviews_by_reviewer: { reviewer: c.myAddr, start_after: null, limit: 100 },
        }).catch(() => null));
      }
      for (const store of storeRows.slice(0, 20)) {
        reviewBatches.push(API.smart({
          reviews_by_store: { store_id: Number(store.id), start_after: null, limit: 100 },
        }).catch(() => null));
      }
      const reviewRows = (await Promise.all(reviewBatches)).flatMap((resp) => unwrap(resp, "reviews"));
      setReviews(uniqById(reviewRows));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  const denoms = useMemo(() => {
    const configured = Array.isArray(cfg?.native_tip_denoms) ? cfg.native_tip_denoms : [];
    return configured.length ? configured : ["inj"];
  }, [cfg?.native_tip_denoms]);

  const reviewers = useMemo(() => {
    const list = reviews.map((r) => r.reviewer).filter(Boolean);
    if (cfg?.myAddr) list.unshift(cfg.myAddr);
    return Array.from(new Set(list));
  }, [reviews, cfg?.myAddr]);

  return {
    cfg,
    stores,
    visits,
    reviews,
    denoms,
    reviewers,
    busy,
    reload: load,
  };
}

export const RATING_OPTIONS = ["5", "4", "3", "2", "1"];
export const LIMIT_OPTIONS = ["10", "20", "50", "100"];
export const TIP_AMOUNT_OPTIONS = [
  { label: "0.001 INJ", value: "1000000000000000inj" },
  { label: "0.01 INJ", value: "10000000000000000inj" },
  { label: "0.05 INJ", value: "50000000000000000inj" },
  { label: "0.15 INJ", value: "150000000000000000inj" },
  { label: "1 INJ", value: "1000000000000000000inj" },
];
export const REVIEW_WINDOW_OPTIONS = [
  { label: "1日", value: "86400" },
  { label: "3日", value: "259200" },
  { label: "7日", value: "604800" },
  { label: "14日", value: "1209600" },
  { label: "30日", value: "2592000" },
];
export const TEXT_LIMIT_OPTIONS = ["0", "5", "10", "50", "140", "500", "2000", "5000"];
export const FEE_BPS_OPTIONS = [
  { label: "0%", value: "0" },
  { label: "1%", value: "100" },
  { label: "2.5%", value: "250" },
  { label: "5%", value: "500" },
  { label: "10%", value: "1000" },
];
