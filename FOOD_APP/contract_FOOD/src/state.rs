use cosmwasm_std::{Addr, Binary, StdResult, Storage, Timestamp, Uint128};
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

// =====================
// Type aliases
// =====================
pub type StoreId = u64;
pub type VisitId = u64;
pub type ReviewId = u64;
pub type QrId = u64;

// =====================
// Constants
// =====================
pub const MAX_FEE_BPS: u16 = 10_000;

// =====================
// Enums / Config
// =====================

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum RecordPolicy {
    AdminOnly,
    StoreOwnerOrAdmin,
    Anyone,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    pub admin: Addr,

    pub fee_bps: u16,
    pub fee_receiver: Addr,

    pub review_window_secs: u64,
    pub min_text_len: u16,
    pub max_text_len: u16,

    pub native_tip_denoms: Vec<String>,
    pub record_policy: RecordPolicy,

    pub max_tip_per_tx: Option<Uint128>,
}

// =====================
// Core data models
// =====================

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Store {
    pub id: StoreId,
    pub owner: Option<Addr>,
    pub store_ref: String,
    pub name: Option<String>,
    pub category: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub website: Option<String>,
    pub opening_hours: Option<String>,
    pub price_range: Option<String>,
    pub image_url: Option<String>,
    pub description: Option<String>,
    pub review_window_override: Option<u64>,
    pub created_at: Timestamp,
    pub updated_at: Option<Timestamp>,
    pub active: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct StoreAgg {
    pub store_id: StoreId,
    pub review_count: u64,
    pub rating_sum: u64,
    pub last_review_at: Option<Timestamp>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
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

// =====================
// Sequences
// =====================

pub const STORE_SEQ: Item<u64> = Item::new("store_seq");
pub const VISIT_SEQ: Item<u64> = Item::new("visit_seq");
pub const REVIEW_SEQ: Item<u64> = Item::new("review_seq");

pub fn next_seq(seq: &Item<u64>, storage: &mut dyn Storage) -> StdResult<u64> {
    let cur = seq.may_load(storage)?.unwrap_or(0);
    let next = cur + 1;
    seq.save(storage, &next)?;
    Ok(next)
}

// =====================
// Storage
// =====================

pub const CONFIG: Item<Config> = Item::new("config");

// Stores
pub const STORES: Map<StoreId, Store> = Map::new("stores");
pub const STORE_AGG: Map<StoreId, StoreAgg> = Map::new("store_agg");
pub const STORE_REGISTRATION_CODES: Map<String, bool> = Map::new("store_registration_codes");

// Visits
pub const VISITS: Map<VisitId, Visit> = Map::new("visits");
pub const VISITS_BY_VISITOR: Map<(&Addr, VisitId), ()> = Map::new("visits_by_visitor");
pub const VISITS_BY_STORE: Map<(StoreId, VisitId), ()> = Map::new("visits_by_store");

// Reviews
pub const REVIEWS: Map<ReviewId, Review> = Map::new("reviews");
pub const REVIEWS_BY_STORE: Map<(StoreId, ReviewId), ()> = Map::new("reviews_by_store");
pub const REVIEWS_BY_REVIEWER: Map<(&Addr, ReviewId), ()> = Map::new("reviews_by_reviewer");

// Tips (Native, Escrow)
pub const TOTAL_TIPS_NATIVE: Map<(ReviewId, String), Uint128> = Map::new("total_tips_native");
pub const ESCROW_NATIVE: Map<(&Addr, String), Uint128> = Map::new("escrow_native");
pub const FEE_NATIVE: Map<String, Uint128> = Map::new("fee_native");

// =====================
// QR (Pattern B / Method A)
// commit = sha256(code) raw 32 bytes, stored as Binary
// =====================

// (store_id, qr_id) -> commit (Binary: 32 bytes)
pub const QR_POOL: Map<(StoreId, QrId), Binary> = Map::new("qr_pool");

// (store_id, sha256(code) hex) -> qr_id. This lets QR codes be consumed in any
// order and gives true duplicate-use detection for the presented code.
pub const QR_COMMIT_INDEX: Map<(StoreId, String), QrId> = Map::new("qr_commit_index");

// store_id -> current cursor (next qr_id to consume)
pub const QR_CURSOR: Map<StoreId, QrId> = Map::new("qr_cursor");

// (store_id, qr_id) -> used?
pub const QR_USED: Map<(StoreId, QrId), bool> = Map::new("qr_used");

// store_id -> next qr_id to assign (provisioning)
pub const QR_NEXT_ID: Map<StoreId, QrId> = Map::new("qr_next_id");

pub fn next_qr_id(storage: &mut dyn Storage, store_id: StoreId) -> StdResult<QrId> {
    let cur = QR_NEXT_ID.may_load(storage, store_id)?.unwrap_or(1);
    QR_NEXT_ID.save(storage, store_id, &(cur + 1))?;
    Ok(cur)
}
