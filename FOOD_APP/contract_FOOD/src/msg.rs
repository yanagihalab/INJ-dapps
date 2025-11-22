use cosmwasm_schema::{cw_serde, QueryResponses};
use cosmwasm_std::Uint128;

#[cw_serde]
pub enum RecordPolicy {
    StoreOnly,
    Anyone,
    AdminOnly,
}

#[cw_serde]
pub struct InstantiateMsg {
    pub admin: String,
    pub fee_bps: u16,                       // 0..=MAX_FEE_BPS
    pub fee_receiver: Option<String>,
    pub review_window_secs: u64,
    pub min_text_len: u16,
    pub max_text_len: u16,
    pub native_tip_denoms: Vec<String>,
    pub record_policy: RecordPolicy,
    pub max_tip_per_tx: Option<Uint128>,    // None=無制限
}

#[cw_serde]
pub enum ExecuteMsg {
    // 店舗
    RegisterStore { store_ref: String, owner: Option<String> },
    SetStoreStatus { store_id: u64, active: bool },
    SetStoreReviewWindow { store_id: u64, secs: u64 },

    // 来店
    RecordVisit { store_id: u64, visitor: Option<String>, visited_at: Option<u64>, memo: Option<String> },
    RevokeVisit { visit_id: u64 },

    // レビュー
    CreateReview { visit_id: u64, rating: u8, title: Option<String>, body: String },
    EditReview { review_id: u64, rating: Option<u8>, title: Option<String>, body: Option<String> },
    HideReview { review_id: u64, reason: Option<String> },

    // 投げ銭（Native）
    TipReviewNative { review_id: u64 }, // Tx funds を使用

    // 引き出し（レビュアー）
    WithdrawTips { to: Option<String>, denom: String, amount: Option<Uint128> },

    // 引き出し（プラットフォーム手数料）
    WithdrawPlatformFees { to: Option<String>, denom: String, amount: Option<Uint128> },

    // 設定更新
    UpdateConfig {
        admin: Option<String>,
        fee_bps: Option<u16>,                  // <= MAX_FEE_BPS
        fee_receiver: Option<String>,
        review_window_secs: Option<u64>,
        min_text_len: Option<u16>,
        max_text_len: Option<u16>,
        native_tip_denoms: Option<Vec<String>>,
        record_policy: Option<RecordPolicy>,
        max_tip_per_tx: Option<Option<Uint128>>, // Some(Some(x))=設定、Some(None)=無制限へ
    }
}

#[cw_serde]
#[derive(QueryResponses)]
pub enum QueryMsg {
    #[returns(ConfigResponse)]
    Config {},

    #[returns(StoreResponse)]
    Store { store_id: u64 },

    #[returns(StoresResponse)]
    Stores { start_after: Option<u64>, limit: Option<u32> },

    #[returns(VisitResponse)]
    Visit { visit_id: u64 },

    #[returns(VisitsByVisitorResponse)]
    VisitsByVisitor { visitor: String, start_after: Option<u64>, limit: Option<u32> },

    #[returns(ReviewResponse)]
    Review { review_id: u64 },

    #[returns(ReviewsByStoreResponse)]
    ReviewsByStore {
        store_id: u64,
        include_hidden: Option<bool>,
        start_after: Option<u64>,
        limit: Option<u32>,
    },

    #[returns(ReviewsByReviewerResponse)]
    ReviewsByReviewer {
        reviewer: String,
        start_after: Option<u64>,
        limit: Option<u32>,
    },

    #[returns(StoreStatsResponse)]
    StoreStats { store_id: u64 },

    #[returns(EligibilityResponse)]
    Eligibility { visit_id: u64 },

    #[returns(TipsSummaryResponse)]
    TipsForReview { review_id: u64 },
}

/* ====== Response Types ====== */

#[cw_serde]
pub struct ConfigResponse {
    pub admin: String,
    pub fee_bps: u16,
    pub fee_receiver: String,
    pub review_window_secs: u64,
    pub min_text_len: u16,
    pub max_text_len: u16,
    pub native_tip_denoms: Vec<String>,
    pub record_policy: RecordPolicy,
    pub max_tip_per_tx: Option<Uint128>,
}

#[cw_serde] pub struct StoreResponse { pub store: Option<crate::state::Store> }
#[cw_serde] pub struct StoresResponse { pub stores: Vec<crate::state::Store> }
#[cw_serde] pub struct VisitResponse { pub visit: Option<crate::state::Visit> }
#[cw_serde] pub struct VisitsByVisitorResponse { pub visits: Vec<crate::state::Visit> }
#[cw_serde] pub struct ReviewResponse { pub review: Option<crate::state::Review> }
#[cw_serde] pub struct ReviewsByStoreResponse { pub reviews: Vec<crate::state::Review> }
#[cw_serde] pub struct ReviewsByReviewerResponse { pub reviews: Vec<crate::state::Review> }

#[cw_serde]
pub struct StoreStatsResponse {
    pub review_count: u64,
    pub rating_avg: Option<String>,
    pub last_review_at: Option<u64>,
}

#[cw_serde]
pub struct EligibilityResponse {
    pub reviewable: bool,
    pub now: u64,
    pub reviewable_until: u64,
}

#[cw_serde]
pub struct TipsSummaryResponse {
    pub native: Vec<(String, Uint128)>, // (denom, amount)
}
