use cosmwasm_schema::cw_serde;
use cosmwasm_std::{Addr, Timestamp, Uint128};
use cosmwasm_std::Storage;
use cw_storage_plus::{Item, Map};

use crate::msg::RecordPolicy;

/* ====== Types ====== */

pub type StoreId = u64;
pub type VisitId = u64;
pub type ReviewId = u64;

/* ====== Constants ====== */
// 手数料 bps の上限（例：10%）
pub const MAX_FEE_BPS: u16 = 1000;

/* ====== Config ====== */

#[cw_serde]
pub struct Config {
    pub admin: Addr,
    pub fee_bps: u16,                      // <= MAX_FEE_BPS
    pub fee_receiver: Addr,
    pub review_window_secs: u64,
    pub min_text_len: u16,
    pub max_text_len: u16,
    pub native_tip_denoms: Vec<String>,
    pub record_policy: RecordPolicy,
    // エスクロー固定：auto_forward は無し
    pub max_tip_per_tx: Option<Uint128>,   // None=無制限
}

/* ====== Store ====== */

#[cw_serde]
pub struct Store {
    pub id: StoreId,
    pub owner: Option<Addr>,
    pub store_ref: String,
    pub review_window_override: Option<u64>,
    pub active: bool,
}

/* ====== Visit ====== */

#[cw_serde]
pub struct Visit {
    pub id: VisitId,
    pub store_id: StoreId,
    pub visitor: Addr,
    pub visited_at: Timestamp,
    pub reviewable_until: Timestamp,
    pub reviewed: bool,
    pub revoked: bool,
    pub memo: Option<String>,
}

/* ====== Review ====== */

#[cw_serde]
pub struct Review {
    pub id: ReviewId,
    pub store_id: StoreId,
    pub visit_id: VisitId,
    pub reviewer: Addr,
    pub rating: u8,
    pub title: Option<String>,
    pub body: String,
    pub created_at: Timestamp,
    pub edited_at: Option<Timestamp>,
    pub hidden: bool,
}

/* ====== Aggregates ====== */

#[cw_serde]
pub struct StoreAgg {
    pub store_id: StoreId,
    pub review_count: u64,
    pub rating_sum: u64,
    pub last_review_at: Option<Timestamp>,
}

/* ====== Storage ====== */

pub const CONTRACT_NAME: &str = "crates.io/tabelog-review";
pub const CONTRACT_VERSION: &str = "0.2.0";

pub const CONFIG: Item<Config> = Item::new("config");

pub const STORE_SEQ: Item<u64> = Item::new("store_seq");
pub const VISIT_SEQ: Item<u64> = Item::new("visit_seq");
pub const REVIEW_SEQ: Item<u64> = Item::new("review_seq");

pub const STORES: Map<StoreId, Store> = Map::new("stores");
pub const VISITS: Map<VisitId, Visit> = Map::new("visits");
pub const REVIEWS: Map<ReviewId, Review> = Map::new("reviews");

pub const STORE_AGG: Map<StoreId, StoreAgg> = Map::new("store_agg");

/* Secondary indices */
pub const VISITS_BY_VISITOR: Map<(Addr, VisitId), ()> = Map::new("visits_by_visitor");
pub const REVIEWS_BY_STORE: Map<(StoreId, ReviewId), ()> = Map::new("reviews_by_store");
pub const REVIEWS_BY_REVIEWER: Map<(Addr, ReviewId), ()> = Map::new("reviews_by_reviewer");

/* Tips totals per review (Native only) */
pub const TOTAL_TIPS_NATIVE: Map<(ReviewId, String), Uint128> = Map::new("total_tips_native");

/* Escrow balances per user+denom */
pub const ESCROW_NATIVE: Map<(Addr, String), Uint128> = Map::new("escrow_native");

/* Platform fee balances */
pub const FEE_NATIVE: Map<String, Uint128> = Map::new("fee_native");

/* ====== Helpers ====== */
pub fn next_seq(item: &Item<u64>, store: &mut dyn Storage) -> Result<u64, cosmwasm_std::StdError> {
    let id = item.may_load(store)?.unwrap_or(0) + 1;
    item.save(store, &id)?;
    Ok(id)
}
