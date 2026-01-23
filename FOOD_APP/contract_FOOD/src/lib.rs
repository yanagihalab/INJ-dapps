use cosmwasm_std::{entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult};
use cw2::set_contract_version;

pub mod error;
pub mod execute;
pub mod msg;
pub mod query;
pub mod state;

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::{Config, RecordPolicy, CONFIG, MAX_FEE_BPS};

const CONTRACT_NAME: &str = "tabelog-review";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    let admin = match msg.admin {
        Some(a) => deps.api.addr_validate(&a)?,
        None => info.sender.clone(),
    };

    let fee_receiver = match msg.fee_receiver {
        Some(fr) => deps.api.addr_validate(&fr)?,
        None => admin.clone(),
    };

    let fee_bps = msg.fee_bps.unwrap_or(500);
    if fee_bps > MAX_FEE_BPS {
        return Err(ContractError::Std(StdError::generic_err(
            "fee_bps exceeds MAX_FEE_BPS",
        )));
    }

    let review_window_secs = msg.review_window_secs.unwrap_or(7 * 24 * 60 * 60);
    let min_text_len = msg.min_text_len.unwrap_or(10);
    let max_text_len = msg.max_text_len.unwrap_or(2000);
    if min_text_len > max_text_len {
        return Err(ContractError::Std(StdError::generic_err(
            "min_text_len must be <= max_text_len",
        )));
    }

    let native_tip_denoms = msg
        .native_tip_denoms
        .unwrap_or_else(|| vec!["inj".to_string()]);

    let record_policy = msg.record_policy.unwrap_or(RecordPolicy::StoreOwnerOrAdmin);

    let cfg = Config {
        admin: admin.clone(),
        fee_bps,
        fee_receiver,
        review_window_secs,
        min_text_len,
        max_text_len,
        native_tip_denoms,
        record_policy,
        max_tip_per_tx: msg.max_tip_per_tx,
    };

    CONFIG.save(deps.storage, &cfg)?;

    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("contract", CONTRACT_NAME)
        .add_attribute("version", CONTRACT_VERSION)
        .add_attribute("admin", admin.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    execute::execute_msg(deps, env, info, msg)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    query::query(deps, env, msg)
}
