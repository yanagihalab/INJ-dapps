use cosmwasm_std::{to_json_binary, Binary, Deps, Env, StdResult};

use crate::msg::QueryMsg;
use crate::state::{CONFIG, REVIEWS, STORE_AGG, STORES, VISITS};

pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&CONFIG.load(deps.storage)?),

        QueryMsg::Store { store_id } => to_json_binary(&STORES.load(deps.storage, store_id)?),
        QueryMsg::StoreAgg { store_id } => to_json_binary(&STORE_AGG.load(deps.storage, store_id)?),

        QueryMsg::Visit { visit_id } => to_json_binary(&VISITS.load(deps.storage, visit_id)?),
        QueryMsg::Review { review_id } => to_json_binary(&REVIEWS.load(deps.storage, review_id)?),
    }
}
