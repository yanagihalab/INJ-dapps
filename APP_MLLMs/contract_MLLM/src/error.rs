use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("unauthorized")]
    Unauthorized,

    #[error("invalid step: expected {expected}, got {got}")]
    InvalidStep { expected: String, got: String },

    #[error("role not configured: {0}")]
    RoleNotConfigured(String),

    #[error("sequence already completed")]
    SequenceCompleted,
}
