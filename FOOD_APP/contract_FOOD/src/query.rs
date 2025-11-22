use cosmwasm_std::{Deps, Env, Order, StdResult, Binary, to_json_binary};
use cw_storage_plus::Bound;

use crate::msg::*;
use crate::state::*;

const DEFAULT_LIMIT: u32 = 20;
const MAX_LIMIT: u32 = 100;

pub fn query_msg(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Config{} => {
            let c = CONFIG.load(deps.storage)?;
            to_json_binary(&ConfigResponse{
                admin: c.admin.to_string(),
                fee_bps: c.fee_bps,
                fee_receiver: c.fee_receiver.to_string(),
                review_window_secs: c.review_window_secs,
                min_text_len: c.min_text_len,
                max_text_len: c.max_text_len,
                native_tip_denoms: c.native_tip_denoms,
                record_policy: c.record_policy,
                max_tip_per_tx: c.max_tip_per_tx,
            })
        }

        QueryMsg::Store{ store_id } => {
            let store = STORES.may_load(deps.storage, store_id)?;
            to_json_binary(&StoreResponse{ store })
        }

        QueryMsg::Stores{ start_after, limit } => {
            let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
            let start = start_after.map(Bound::exclusive);
            let stores: Vec<_> = STORES
                .range(deps.storage, start, None, Order::Ascending)
                .take(limit)
                .map(|r| r.map(|(_k, v)| v))
                .collect::<StdResult<Vec<_>>>()?;
            to_json_binary(&StoresResponse{ stores })
        }

        QueryMsg::Visit{ visit_id } => {
            let visit = VISITS.may_load(deps.storage, visit_id)?;
            to_json_binary(&VisitResponse{ visit })
        }

        QueryMsg::VisitsByVisitor{ visitor, start_after, limit } => {
            let addr = deps.api.addr_validate(&visitor)?;
            let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
            let start = start_after.map(Bound::exclusive); // サブキーは VisitId
            let ids: Vec<_> = VISITS_BY_VISITOR
                .prefix(addr.clone())
                .range(deps.storage, start, None, Order::Descending)
                .take(limit)
                .map(|r| r.map(|(id, _)| id))
                .collect::<StdResult<Vec<_>>>()?;
            let mut visits = Vec::with_capacity(ids.len());
            for id in ids {
                if let Some(v) = VISITS.may_load(deps.storage, id)? { visits.push(v); }
            }
            to_json_binary(&VisitsByVisitorResponse{ visits })
        }

        QueryMsg::Review{ review_id } => {
            let review = REVIEWS.may_load(deps.storage, review_id)?;
            to_json_binary(&ReviewResponse{ review })
        }

        QueryMsg::ReviewsByStore { store_id, include_hidden, start_after, limit } => {
            let include_hidden = include_hidden.unwrap_or(false);
            let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
            let start = start_after.map(Bound::exclusive); // サブキーは ReviewId
            let ids: Vec<_> = REVIEWS_BY_STORE
                .prefix(store_id)
                .range(deps.storage, start, None, Order::Descending)
                .take(limit)
                .map(|r| r.map(|(id, _)| id))
                .collect::<StdResult<Vec<_>>>()?;
            let mut reviews = Vec::with_capacity(ids.len());
            for id in ids {
                if let Some(r) = REVIEWS.may_load(deps.storage, id)? {
                    if !include_hidden && r.hidden { continue; }
                    reviews.push(r);
                }
            }
            to_json_binary(&ReviewsByStoreResponse{ reviews })
        }

        QueryMsg::ReviewsByReviewer { reviewer, start_after, limit } => {
            let reviewer = deps.api.addr_validate(&reviewer)?;
            let limit = limit.unwrap_or(DEFAULT_LIMIT).min(MAX_LIMIT) as usize;
            let start = start_after.map(Bound::exclusive); // サブキーは ReviewId
            let ids: Vec<_> = REVIEWS_BY_REVIEWER
                .prefix(reviewer)
                .range(deps.storage, start, None, Order::Descending)
                .take(limit)
                .map(|r| r.map(|(id, _)| id))
                .collect::<StdResult<Vec<_>>>()?;
            let mut reviews = Vec::with_capacity(ids.len());
            for id in ids {
                if let Some(r) = REVIEWS.may_load(deps.storage, id)? { reviews.push(r); }
            }
            to_json_binary(&ReviewsByReviewerResponse{ reviews })
        }

        QueryMsg::StoreStats { store_id } => {
            let agg = STORE_AGG.may_load(deps.storage, store_id)?;
            if let Some(a) = agg {
                let avg = if a.review_count == 0 { None } else {
                    Some(cosmwasm_std::Decimal::from_ratio(a.rating_sum as u128, a.review_count as u128).to_string())
                };
                to_json_binary(&StoreStatsResponse{
                    review_count: a.review_count,
                    rating_avg: avg,
                    last_review_at: a.last_review_at.map(|t| t.seconds()),
                })
            } else {
                to_json_binary(&StoreStatsResponse{ review_count: 0, rating_avg: None, last_review_at: None })
            }
        }

        QueryMsg::Eligibility { visit_id } => {
            if let Some(v) = VISITS.may_load(deps.storage, visit_id)? {
                to_json_binary(&EligibilityResponse{
                    reviewable: !v.reviewed && !v.revoked && _env.block.time <= v.reviewable_until,
                    now: _env.block.time.seconds(),
                    reviewable_until: v.reviewable_until.seconds(),
                })
            } else {
                to_json_binary(&EligibilityResponse{
                    reviewable: false,
                    now: _env.block.time.seconds(),
                    reviewable_until: 0,
                })
            }
        }

        QueryMsg::TipsForReview { review_id } => {
            let mut native = vec![];
            for r in TOTAL_TIPS_NATIVE
                .prefix(review_id)
                .range(deps.storage, None, None, Order::Ascending)
            {
                let (denom, amt) = r?;
                native.push((denom, amt));
            }
            to_json_binary(&TipsSummaryResponse{ native })
        }
    }
}
