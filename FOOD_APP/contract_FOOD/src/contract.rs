use cosmwasm_std::{entry_point, Deps, DepsMut, Env, MessageInfo, Response, StdResult, Empty, Binary};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::execute::execute_msg;
use crate::msg::{InstantiateMsg, ExecuteMsg, QueryMsg};
use crate::query::query_msg;
use crate::state::{CONFIG, Config, CONTRACT_NAME, CONTRACT_VERSION, MAX_FEE_BPS};

#[entry_point]
pub fn instantiate(deps: DepsMut, _env: Env, info: MessageInfo, msg: InstantiateMsg) -> Result<Response, ContractError> {
    let admin = deps.api.addr_validate(&msg.admin)?;
    let fee_receiver = match msg.fee_receiver { Some(a) => deps.api.addr_validate(&a)?, None => admin.clone() };
    if msg.fee_bps > MAX_FEE_BPS { return Err(ContractError::FeeTooHigh { max: MAX_FEE_BPS }); }
    if msg.min_text_len > msg.max_text_len {
        return Err(ContractError::Std(cosmwasm_std::StdError::generic_err("min_text_len > max_text_len")));
    }

    let cfg = Config {
        admin,
        fee_bps: msg.fee_bps,
        fee_receiver,
        review_window_secs: msg.review_window_secs,
        min_text_len: msg.min_text_len,
        max_text_len: msg.max_text_len,
        native_tip_denoms: msg.native_tip_denoms,
        record_policy: msg.record_policy,
        max_tip_per_tx: msg.max_tip_per_tx,
    };
    CONFIG.save(deps.storage, &cfg)?;
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;

    Ok(Response::new().add_attribute("action","instantiate").add_attribute("admin", info.sender))
}

#[entry_point]
pub fn execute(deps: DepsMut, env: Env, info: MessageInfo, msg: ExecuteMsg) -> Result<Response, ContractError> {
    execute_msg(deps, env, info, msg)
}

#[entry_point]
pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    query_msg(deps, env, msg)
}

#[entry_point]
pub fn migrate(_deps: DepsMut, _env: Env, _msg: Empty) -> Result<Response, ContractError> {
    Ok(Response::new().add_attribute("action", "migrate"))
}
