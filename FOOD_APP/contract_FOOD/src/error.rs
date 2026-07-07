use cosmwasm_std::{StdError, Uint128};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized")]
    Unauthorized,

    #[error("forbidden")]
    Forbidden,

    #[error("not found")]
    NotFound,

    #[error("store registration limit exceeded: max={max}")]
    StoreRegistrationLimitExceeded { max: u32 },

    #[error("store registration code is required")]
    StoreRegistrationCodeRequired,

    #[error("store registration code too long: max={max}")]
    StoreRegistrationCodeTooLong { max: u32 },

    #[error("store registration codes is empty")]
    StoreRegistrationCodesEmpty,

    #[error("invalid store registration commit length: expected={expected} got={got}")]
    InvalidStoreRegistrationCommitLength { expected: usize, got: usize },

    #[error("store registration code already provisioned")]
    StoreRegistrationCodeAlreadyProvisioned,

    #[error("store registration code not provisioned")]
    StoreRegistrationCodeNotProvisioned,

    #[error("store registration code already used")]
    StoreRegistrationCodeAlreadyUsed,

    #[error("record visit is disabled")]
    RecordVisitDisabled,

    #[error("store is inactive")]
    StoreInactive,

    #[error("already reviewed")]
    AlreadyReviewed,

    #[error("review window expired")]
    ReviewWindowExpired,

    #[error("invalid rating")]
    InvalidRating,

    #[error("text too short")]
    TextTooShort,

    #[error("text too long")]
    TextTooLong,

    #[error("invalid funds")]
    InvalidFunds,

    #[error("amount is zero")]
    AmountZero,

    #[error("denom not allowed")]
    DenomNotAllowed,

    #[error("tip too large: max={max}")]
    TipTooLarge { max: Uint128 },

    // ===== QR =====
    #[error("qr commits is empty")]
    QrCommitsEmpty,

    #[error("invalid qr commit length: expected={expected} got={got}")]
    InvalidQrCommitLength { expected: usize, got: usize },

    #[error("qr code too long: max={max}")]
    QrCodeTooLong { max: u32 },

    #[error("qr cursor not initialized")]
    QrNotInitialized,

    #[error("qr already used")]
    QrAlreadyUsed,

    #[error("qr already provisioned")]
    QrAlreadyProvisioned,

    #[error("qr not provisioned")]
    QrNotProvisioned,

    #[error("qr commit mismatch")]
    QrCommitMismatch,
}
