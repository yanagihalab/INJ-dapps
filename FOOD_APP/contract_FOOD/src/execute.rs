use cosmwasm_std::{
    attr, Addr, BankMsg, Coin, DepsMut, Env, MessageInfo, Response, StdResult, Timestamp,
};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, RecordPolicy};
use crate::state::*;

/// 管理者チェック
fn only_admin(deps: &cosmwasm_std::DepsMut, sender: &Addr) -> Result<(), ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if cfg.admin != *sender {
        return Err(ContractError::Unauthorized);
    }
    Ok(())
}

/// 管理者 or 店舗オーナー権限チェック
fn is_admin_or_store_owner(
    deps: &cosmwasm_std::DepsMut,
    store_id: StoreId,
    sender: &Addr,
) -> Result<(), ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if cfg.admin == *sender {
        return Ok(());
    }
    let store = STORES
        .load(deps.storage, store_id)
        .map_err(|_| ContractError::NotFound)?;
    if let Some(owner) = store.owner {
        if owner == *sender {
            return Ok(());
        }
    }
    Err(ContractError::Forbidden)
}

pub fn execute_msg(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        /* ================== Store ================== */
        ExecuteMsg::RegisterStore { store_ref, owner } => {
            let cfg = CONFIG.load(deps.storage)?;
            if info.sender != cfg.admin {
                return Err(ContractError::Unauthorized);
            }
            let id = next_seq(&STORE_SEQ, deps.storage)?;
            let owner_addr = owner.map(|o| deps.api.addr_validate(&o)).transpose()?;
            let store = Store {
                id,
                owner: owner_addr,
                store_ref,
                review_window_override: None,
                active: true,
            };
            STORES.save(deps.storage, id, &store)?;
            STORE_AGG.save(
                deps.storage,
                id,
                &StoreAgg {
                    store_id: id,
                    review_count: 0,
                    rating_sum: 0,
                    last_review_at: None,
                },
            )?;
            Ok(Response::new()
                .add_attribute("action", "register_store")
                .add_attribute("store_id", id.to_string()))
        }

        ,ExecuteMsg::SetStoreStatus { store_id, active } => {
            is_admin_or_store_owner(&deps, store_id, &info.sender)?;
            STORES.update(deps.storage, store_id, |s| {
                s.ok_or(ContractError::NotFound).map(|mut st| {
                    st.active = active;
                    st
                })
            })?;
            Ok(Response::new().add_attributes(vec![
                attr("action", "set_store_status"),
                attr("store_id", store_id.to_string()),
                attr("active", active.to_string()),
            ]))
        }

        ,ExecuteMsg::SetStoreReviewWindow { store_id, secs } => {
            is_admin_or_store_owner(&deps, store_id, &info.sender)?;
            STORES.update(deps.storage, store_id, |s| {
                s.ok_or(ContractError::NotFound).map(|mut st| {
                    st.review_window_override = Some(secs);
                    st
                })
            })?;
            Ok(Response::new().add_attributes(vec![
                attr("action", "set_store_review_window"),
                attr("store_id", store_id.to_string()),
                attr("secs", secs.to_string()),
            ]))
        }

        /* ================== Visit ================== */
        ,ExecuteMsg::RecordVisit { store_id, visitor, visited_at, memo } => {
            let cfg = CONFIG.load(deps.storage)?;
            let store = STORES
                .load(deps.storage, store_id)
                .map_err(|_| ContractError::NotFound)?;
            if !store.active {
                return Err(ContractError::StoreInactive);
            }

            // 記録ポリシーに応じた権限チェック
            match cfg.record_policy {
                RecordPolicy::AdminOnly => {
                    if info.sender != cfg.admin {
                        return Err(ContractError::Unauthorized);
                    }
                }
                RecordPolicy::StoreOnly => {
                    is_admin_or_store_owner(&deps, store_id, &info.sender)?;
                }
                RecordPolicy::Anyone => { /* no-op */ }
            }

            // visitor の確定（代理記録は admin / store owner のみ許可）
            let visitor_addr = match visitor {
                Some(v) => {
                    if info.sender != cfg.admin {
                        if let Some(owner) = &store.owner {
                            if &info.sender != owner {
                                return Err(ContractError::Forbidden);
                            }
                        } else {
                            return Err(ContractError::Forbidden);
                        }
                    }
                    deps.api.addr_validate(&v)?
                }
                None => info.sender.clone(),
            };

            let visited_ts =
                Timestamp::from_seconds(visited_at.unwrap_or(env.block.time.seconds()));
            let window = store
                .review_window_override
                .unwrap_or(cfg.review_window_secs);
            let reviewable_until = visited_ts.plus_seconds(window);

            let id = next_seq(&VISIT_SEQ, deps.storage)?;
            let v = Visit {
                id,
                store_id,
                visitor: visitor_addr.clone(),
                visited_at: visited_ts,
                reviewable_until,
                reviewed: false,
                revoked: false,
                memo,
            };
            VISITS.save(deps.storage, id, &v)?;
            VISITS_BY_VISITOR.save(deps.storage, (visitor_addr, id), &())?;

            Ok(Response::new().add_attributes(vec![
                attr("action", "record_visit"),
                attr("visit_id", id.to_string()),
                attr("store_id", store_id.to_string()),
                attr("reviewable_until", reviewable_until.seconds().to_string()),
            ]))
        }

        ,ExecuteMsg::RevokeVisit { visit_id } => {
            let v = VISITS
                .load(deps.storage, visit_id)
                .map_err(|_| ContractError::NotFound)?;
            is_admin_or_store_owner(&deps, v.store_id, &info.sender)?;
            if v.reviewed {
                // 既にレビューがある来店の取消は不可（運用ポリシー次第で変更可）
                return Err(ContractError::Forbidden);
            }
            VISITS.update(deps.storage, visit_id, |old| {
                old.ok_or(ContractError::NotFound).map(|mut vv| {
                    vv.revoked = true;
                    vv
                })
            })?;
            Ok(Response::new()
                .add_attribute("action", "revoke_visit")
                .add_attribute("visit_id", visit_id.to_string()))
        }

        /* ================== Review ================== */
        ,ExecuteMsg::CreateReview { visit_id, rating, title, body } => {
            let mut v = VISITS
                .load(deps.storage, visit_id)
                .map_err(|_| ContractError::NotFound)?;
            if v.revoked {
                return Err(ContractError::Forbidden);
            }
            if v.reviewed {
                return Err(ContractError::AlreadyReviewed);
            }
            if env.block.time > v.reviewable_until {
                return Err(ContractError::ReviewWindowExpired);
            }
            if info.sender != v.visitor {
                return Err(ContractError::Forbidden);
            }

            let cfg = CONFIG.load(deps.storage)?;
            if !(1..=5).contains(&rating) {
                return Err(ContractError::InvalidRating);
            }
            let blen = body.as_bytes().len() as u16;
            if blen < cfg.min_text_len {
                return Err(ContractError::TextTooShort);
            }
            if blen > cfg.max_text_len {
                return Err(ContractError::TextTooLong);
            }

            let store = STORES
                .load(deps.storage, v.store_id)
                .map_err(|_| ContractError::NotFound)?;
            if !store.active {
                return Err(ContractError::StoreInactive);
            }

            let id = next_seq(&REVIEW_SEQ, deps.storage)?;
            let review = Review {
                id,
                store_id: v.store_id,
                visit_id,
                reviewer: info.sender.clone(),
                rating,
                title,
                body,
                created_at: env.block.time,
                edited_at: None,
                hidden: false,
            };
            REVIEWS.save(deps.storage, id, &review)?;
            REVIEWS_BY_STORE.save(deps.storage, (review.store_id, id), &())?;
            REVIEWS_BY_REVIEWER.save(deps.storage, (review.reviewer.clone(), id), &())?;

            // チケット消費
            v.reviewed = true;
            VISITS.save(deps.storage, visit_id, &v)?;

            // 集計更新
            STORE_AGG.update(deps.storage, review.store_id, |agg| -> StdResult<_> {
                let mut a = agg.unwrap_or(StoreAgg {
                    store_id: review.store_id,
                    review_count: 0,
                    rating_sum: 0,
                    last_review_at: None,
                });
                a.review_count += 1;
                a.rating_sum += review.rating as u64;
                a.last_review_at = Some(env.block.time);
                Ok(a)
            })?;

            Ok(Response::new().add_attributes(vec![
                attr("action", "create_review"),
                attr("review_id", id.to_string()),
                attr("store_id", review.store_id.to_string()),
                attr("rating", rating.to_string()),
            ]))
        }

        // ★ E0500 対策済み：クロージャ内で他ストレージに触らない構造に変更
        ,ExecuteMsg::EditReview { review_id, rating, title, body } => {
            // 先にレビューをロードして編集 → 保存 → 必要なら集計を更新
            let mut rr = REVIEWS
                .load(deps.storage, review_id)
                .map_err(|_| ContractError::NotFound)?;
            if rr.reviewer != info.sender {
                return Err(ContractError::Forbidden);
            }

            let cfg = CONFIG.load(deps.storage)?;
            // rating の変更があれば (old, new) を保持して後で集計に反映
            let mut rating_delta: Option<(u8, u8)> = None;
            if let Some(new_rating) = rating {
                if !(1..=5).contains(&new_rating) {
                    return Err(ContractError::InvalidRating);
                }
                if new_rating != rr.rating {
                    rating_delta = Some((rr.rating, new_rating));
                    rr.rating = new_rating;
                }
            }

            if let Some(t) = title {
                rr.title = Some(t);
            }
            if let Some(b) = body {
                let blen = b.as_bytes().len() as u16;
                if blen < cfg.min_text_len {
                    return Err(ContractError::TextTooShort);
                }
                if blen > cfg.max_text_len {
                    return Err(ContractError::TextTooLong);
                }
                rr.body = b;
            }
            rr.edited_at = Some(env.block.time);

            // 先にレビューを保存
            REVIEWS.save(deps.storage, review_id, &rr)?;

            // rating が変わっていれば集計を調整（ここはクロージャ外なので二重借用にならない）
            if let Some((old, new)) = rating_delta {
                STORE_AGG.update(deps.storage, rr.store_id, |agg| -> StdResult<_> {
                    let mut a = agg.unwrap();
                    a.rating_sum = a.rating_sum - old as u64 + new as u64;
                    Ok(a)
                })?;
            }

            Ok(Response::new().add_attributes(vec![
                attr("action", "edit_review"),
                attr("review_id", review_id.to_string()),
            ]))
        }

        ,ExecuteMsg::HideReview { review_id, .. } => {
            let rr = REVIEWS
                .load(deps.storage, review_id)
                .map_err(|_| ContractError::NotFound)?;
            is_admin_or_store_owner(&deps, rr.store_id, &info.sender)?;
            REVIEWS.update(deps.storage, review_id, |r| {
                r.ok_or(ContractError::NotFound).map(|mut x| {
                    x.hidden = true;
                    x
                })
            })?;
            Ok(Response::new().add_attributes(vec![
                attr("action", "hide_review"),
                attr("review_id", review_id.to_string()),
            ]))
        }

        /* ================== Tips (Native, Escrow-fixed) ================== */
        ,ExecuteMsg::TipReviewNative { review_id } => {
            let rr = REVIEWS
                .load(deps.storage, review_id)
                .map_err(|_| ContractError::NotFound)?;
            let cfg = CONFIG.load(deps.storage)?;

            if info.funds.len() != 1 {
                return Err(ContractError::InvalidFunds);
            }
            let Coin { denom, amount } = info.funds[0].clone();
            if amount.is_zero() {
                return Err(ContractError::AmountZero);
            }
            if !cfg.native_tip_denoms.iter().any(|d| d == &denom) {
                return Err(ContractError::DenomNotAllowed);
            }
            if let Some(cap) = cfg.max_tip_per_tx {
                if amount > cap {
                    return Err(ContractError::TipTooLarge { max: cap });
                }
            }

            // 手数料（切り捨て）と純額
            let fee = amount.multiply_ratio(cfg.fee_bps as u128, 10_000u128);
            let net = amount.checked_sub(fee).unwrap();

            // 合計記録
            TOTAL_TIPS_NATIVE.update(
                deps.storage,
                (review_id, denom.clone()),
                |v| -> StdResult<_> { Ok(v.unwrap_or_default() + amount) },
            )?;
            // エスクロー（レビュアー）
            ESCROW_NATIVE.update(
                deps.storage,
                (rr.reviewer.clone(), denom.clone()),
                |v| -> StdResult<_> { Ok(v.unwrap_or_default() + net) },
            )?;
            // プラットフォーム手数料
            FEE_NATIVE.update(
                deps.storage,
                denom.clone(),
                |v| -> StdResult<_> { Ok(v.unwrap_or_default() + fee) },
            )?;

            Ok(Response::new().add_attributes(vec![
                attr("action", "tip_review"),
                attr("review_id", review_id.to_string()),
                attr("asset", format!("native:{denom}")),
                attr("amount", amount.to_string()),
                attr("fee_bps", cfg.fee_bps.to_string()),
                attr("fee", fee.to_string()),
                attr("net", net.to_string()),
            ]))
        }

        /* ================== Withdraws ================== */
        ,ExecuteMsg::WithdrawTips { to, denom, amount } => {
            let recipient = to
                .map(|s| deps.api.addr_validate(&s))
                .transpose()?
                .unwrap_or(info.sender.clone());

            let key = (info.sender.clone(), denom.clone());
            let bal = ESCROW_NATIVE
                .may_load(deps.storage, key.clone())?
                .unwrap_or_default();
            if bal.is_zero() {
                return Err(ContractError::AmountZero);
            }
            let amt = amount.unwrap_or(bal);
            if amt > bal {
                return Err(ContractError::InvalidFunds);
            }
            ESCROW_NATIVE.save(deps.storage, key, &(bal - amt))?;

            Ok(Response::new()
                .add_message(BankMsg::Send {
                    to_address: recipient.to_string(),
                    amount: vec![Coin { denom, amount: amt }],
                })
                .add_attributes(vec![
                    attr("action", "withdraw_tips"),
                    attr("to", recipient.to_string()),
                    attr("amount", amt.to_string()),
                ]))
        }

        ,ExecuteMsg::WithdrawPlatformFees { to, denom, amount } => {
            only_admin(&deps, &info.sender)?;
            let cfg = CONFIG.load(deps.storage)?;
            let recipient = to
                .map(|s| deps.api.addr_validate(&s))
                .transpose()?
                .unwrap_or(cfg.fee_receiver.clone());

            let bal = FEE_NATIVE
                .may_load(deps.storage, denom.clone())?
                .unwrap_or_default();
            if bal.is_zero() {
                return Err(ContractError::AmountZero);
            }
            let amt = amount.unwrap_or(bal);
            if amt > bal {
                return Err(ContractError::InvalidFunds);
            }
            FEE_NATIVE.save(deps.storage, denom.clone(), &(bal - amt))?;

            Ok(Response::new()
                .add_message(BankMsg::Send {
                    to_address: recipient.to_string(),
                    amount: vec![Coin { denom, amount: amt }],
                })
                .add_attributes(vec![
                    attr("action", "withdraw_platform_fees"),
                    attr("to", recipient.to_string()),
                    attr("amount", amt.to_string()),
                ]))
        }

        /* ================== Config Update ================== */
        ,ExecuteMsg::UpdateConfig {
            admin,
            fee_bps,
            fee_receiver,
            review_window_secs,
            min_text_len,
            max_text_len,
            native_tip_denoms,
            record_policy,
            max_tip_per_tx,
        } => {
            only_admin(&deps, &info.sender)?;
            CONFIG.update(deps.storage, |mut c| -> StdResult<_> {
                if let Some(a) = admin {
                    c.admin = deps.api.addr_validate(&a)?;
                }
                if let Some(f) = fee_bps {
                    if f > MAX_FEE_BPS {
                        return Err(cosmwasm_std::StdError::generic_err(
                            "fee_bps exceeds MAX_FEE_BPS",
                        ));
                    }
                    c.fee_bps = f;
                }
                if let Some(fr) = fee_receiver {
                    c.fee_receiver = deps.api.addr_validate(&fr)?;
                }
                if let Some(s) = review_window_secs {
                    c.review_window_secs = s;
                }
                if let Some(min) = min_text_len {
                    c.min_text_len = min;
                }
                if let Some(max) = max_text_len {
                    c.max_text_len = max;
                }
                if let Some(d) = native_tip_denoms {
                    c.native_tip_denoms = d;
                }
                if let Some(p) = record_policy {
                    c.record_policy = p;
                }
                if let Some(opt) = max_tip_per_tx {
                    c.max_tip_per_tx = opt;
                }
                Ok(c)
            })?;
            Ok(Response::new().add_attribute("action", "update_config"))
        }
    }
}
