use cosmwasm_std::{StdError, Uint128};
use thiserror::Error;

#[derive(Error, Debug, PartialEq)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized")]
    Unauthorized,
    #[error("forbidden")]
    Forbidden,
    #[error("not found")]
    NotFound,

    #[error("store inactive")]
    StoreInactive,
    #[error("review window expired")]
    ReviewWindowExpired,
    #[error("already reviewed")]
    AlreadyReviewed,

    #[error("invalid rating")]
    InvalidRating,
    #[error("text too short")]
    TextTooShort,
    #[error("text too long")]
    TextTooLong,

    #[error("invalid funds")]
    InvalidFunds,
    #[error("denom not allowed")]
    DenomNotAllowed,
    #[error("amount must be > 0")]
    AmountZero,

    #[error("fee_bps exceeds max ({max})")]
    FeeTooHigh { max: u16 },

    #[error("tip exceeds max per tx ({max})")]
    TipTooLarge { max: Uint128 },
}
