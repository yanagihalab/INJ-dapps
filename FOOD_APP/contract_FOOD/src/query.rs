use cosmwasm_std::{to_json_binary, Binary, Deps, Env, StdResult};
use cw_storage_plus::Bound;

use crate::msg::{
    NativeBalanceResponse, NativeTipTotal, QueryMsg, ReviewsResponse, StoresResponse,
    TipsForReviewResponse, VisitsResponse,
};
use crate::state::{
    CONFIG, ESCROW_NATIVE, FEE_NATIVE, REVIEWS, REVIEWS_BY_REVIEWER, REVIEWS_BY_STORE, STORES,
    STORE_AGG, TOTAL_TIPS_NATIVE, VISITS, VISITS_BY_STORE, VISITS_BY_VISITOR,
};

const DEFAULT_LIMIT: u32 = 50;
const MAX_LIMIT: u32 = 100;

fn limit_or_default(limit: Option<u32>) -> usize {
    limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize
}

pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config {} => to_json_binary(&CONFIG.load(deps.storage)?),

        QueryMsg::Store { store_id } => to_json_binary(&STORES.load(deps.storage, store_id)?),
        QueryMsg::Stores { start_after, limit } => {
            let start = start_after.map(Bound::exclusive);
            let stores = STORES
                .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
                .take(limit_or_default(limit))
                .map(|item| item.map(|(_, store)| store))
                .collect::<StdResult<Vec<_>>>()?;
            to_json_binary(&StoresResponse { stores })
        }
        QueryMsg::StoreAgg { store_id } => to_json_binary(&STORE_AGG.load(deps.storage, store_id)?),

        QueryMsg::Visit { visit_id } => to_json_binary(&VISITS.load(deps.storage, visit_id)?),
        QueryMsg::VisitsByVisitor {
            visitor,
            start_after,
            limit,
        } => {
            let visitor = deps.api.addr_validate(&visitor)?;
            let start = start_after.map(Bound::exclusive);
            let visits = VISITS_BY_VISITOR
                .prefix(&visitor)
                .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
                .take(limit_or_default(limit))
                .map(|item| {
                    let (visit_id, _) = item?;
                    VISITS.load(deps.storage, visit_id)
                })
                .collect::<StdResult<Vec<_>>>()?;
            to_json_binary(&VisitsResponse { visits })
        }
        QueryMsg::VisitsByStore {
            store_id,
            start_after,
            limit,
        } => {
            let start = start_after.map(Bound::exclusive);
            let visits = VISITS_BY_STORE
                .prefix(store_id)
                .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
                .take(limit_or_default(limit))
                .map(|item| {
                    let (visit_id, _) = item?;
                    VISITS.load(deps.storage, visit_id)
                })
                .collect::<StdResult<Vec<_>>>()?;
            to_json_binary(&VisitsResponse { visits })
        }
        QueryMsg::Review { review_id } => to_json_binary(&REVIEWS.load(deps.storage, review_id)?),
        QueryMsg::ReviewsByStore {
            store_id,
            start_after,
            limit,
        } => {
            let start = start_after.map(Bound::exclusive);
            let reviews = REVIEWS_BY_STORE
                .prefix(store_id)
                .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
                .take(limit_or_default(limit))
                .map(|item| {
                    let (review_id, _) = item?;
                    REVIEWS.load(deps.storage, review_id)
                })
                .collect::<StdResult<Vec<_>>>()?;
            to_json_binary(&ReviewsResponse { reviews })
        }
        QueryMsg::ReviewsByReviewer {
            reviewer,
            start_after,
            limit,
        } => {
            let reviewer = deps.api.addr_validate(&reviewer)?;
            let start = start_after.map(Bound::exclusive);
            let reviews = REVIEWS_BY_REVIEWER
                .prefix(&reviewer)
                .range(deps.storage, start, None, cosmwasm_std::Order::Ascending)
                .take(limit_or_default(limit))
                .map(|item| {
                    let (review_id, _) = item?;
                    REVIEWS.load(deps.storage, review_id)
                })
                .collect::<StdResult<Vec<_>>>()?;
            to_json_binary(&ReviewsResponse { reviews })
        }
        QueryMsg::TipsForReview { review_id } => {
            let totals = TOTAL_TIPS_NATIVE
                .prefix(review_id)
                .range(deps.storage, None, None, cosmwasm_std::Order::Ascending)
                .map(|item| {
                    let (denom, amount) = item?;
                    Ok(NativeTipTotal { denom, amount })
                })
                .collect::<StdResult<Vec<_>>>()?;
            to_json_binary(&TipsForReviewResponse { review_id, totals })
        }
        QueryMsg::ReviewerBalance { reviewer, denom } => {
            let reviewer = deps.api.addr_validate(&reviewer)?;
            let amount = ESCROW_NATIVE
                .may_load(deps.storage, (&reviewer, denom.clone()))?
                .unwrap_or_default();
            to_json_binary(&NativeBalanceResponse { denom, amount })
        }
        QueryMsg::PlatformFees { denom } => {
            let amount = FEE_NATIVE
                .may_load(deps.storage, denom.clone())?
                .unwrap_or_default();
            to_json_binary(&NativeBalanceResponse { denom, amount })
        }
    }
}
