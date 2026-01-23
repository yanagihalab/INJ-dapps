use cosmwasm_std::{Binary, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

use crate::state::{RecordPolicy, ReviewId, StoreId, VisitId};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
    pub admin: Option<String>,

    // 初期設定（必要なら指定、無ければデフォルト）
    pub fee_bps: Option<u16>,
    pub fee_receiver: Option<String>,
    pub review_window_secs: Option<u64>,
    pub min_text_len: Option<u16>,
    pub max_text_len: Option<u16>,
    pub native_tip_denoms: Option<Vec<String>>,
    pub record_policy: Option<RecordPolicy>,
    pub max_tip_per_tx: Option<Uint128>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    /* ================== Store ================== */
    RegisterStore {
        store_ref: String,
        owner: Option<String>,
    },
    SetStoreStatus {
        store_id: StoreId,
        active: bool,
    },
    SetStoreReviewWindow {
        store_id: StoreId,
        secs: u64,
    },

    /* ================== Visit (no-proof disabled) ================== */
    RecordVisit {
        store_id: StoreId,
        code: String,
        memo: Option<String>,
    },
    RevokeVisit {
        visit_id: VisitId,
    },

    /* ================== QR (Pattern B / Method A) ================== */
    /// commits は sha256(code) の **生32バイト**を Binary として投入する
    ProvisionQrCommits {
        store_id: StoreId,
        commits: Vec<Binary>,
    },
    RecordVisitByQr {
        store_id: StoreId,
        code: String,
        memo: Option<String>,
    },

    /* ================== Review ================== */
    CreateReview {
        visit_id: VisitId,
        rating: u8,
        title: Option<String>,
        body: String,
    },
    EditReview {
        review_id: ReviewId,
        rating: Option<u8>,
        title: Option<String>,
        body: Option<String>,
    },
    HideReview {
        review_id: ReviewId,
    },

    /* ================== Tips (Native, Escrow-fixed) ================== */
    TipReviewNative {
        review_id: ReviewId,
    },

    /* ================== Withdraws ================== */
    WithdrawTips {
        to: Option<String>,
        denom: String,
        amount: Option<Uint128>,
    },
    WithdrawPlatformFees {
        to: Option<String>,
        denom: String,
        amount: Option<Uint128>,
    },

    /* ================== Config Update ================== */
    UpdateConfig {
        admin: Option<String>,
        fee_bps: Option<u16>,
        fee_receiver: Option<String>,
        review_window_secs: Option<u64>,
        min_text_len: Option<u16>,
        max_text_len: Option<u16>,
        native_tip_denoms: Option<Vec<String>>,
        record_policy: Option<RecordPolicy>,
        /// None: 変更なし / Some(None): 上限解除 / Some(Some(x)): 上限設定
        max_tip_per_tx: Option<Option<Uint128>>,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    Config {},

    Store { store_id: StoreId },
    StoreAgg { store_id: StoreId },

    Visit { visit_id: VisitId },
    Review { review_id: ReviewId },
}
