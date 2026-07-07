use cosmwasm_std::{
    attr, Addr, BankMsg, Coin, DepsMut, Env, MessageInfo, Order, Response, StdResult, Timestamp,
};
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::ExecuteMsg;
use crate::state::*;

const MAX_QR_CODE_LEN: u32 = 512;
const MAX_STORE_REGISTRATION_CODE_LEN: u32 = 256;
const QR_COMMIT_LEN: usize = 32;
const STORE_REGISTRATION_COMMIT_LEN: usize = 32;

// Admin 以外が登録できる店舗数上限
const MAX_STORES_PER_OWNER_NON_ADMIN: u32 = 2;

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(HEX[(b >> 4) as usize] as char);
        out.push(HEX[(b & 0x0f) as usize] as char);
    }
    out
}

/// 管理者チェック
fn only_admin(deps: &DepsMut, sender: &Addr) -> Result<(), ContractError> {
    let cfg = CONFIG.load(deps.storage)?;
    if cfg.admin != *sender {
        return Err(ContractError::Unauthorized);
    }
    Ok(())
}

/// 管理者 or 店舗オーナー権限チェック
fn is_admin_or_store_owner(
    deps: &DepsMut,
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
        ExecuteMsg::RegisterStore {
            auth_code,
            store_ref,
            name,
            category,
            address,
            phone,
            website,
            opening_hours,
            price_range,
            image_url,
            description,
            owner,
        } => {
            let auth_code = auth_code.trim().to_string();
            if auth_code.is_empty() {
                return Err(ContractError::StoreRegistrationCodeRequired);
            }
            if auth_code.as_bytes().len() as u32 > MAX_STORE_REGISTRATION_CODE_LEN {
                return Err(ContractError::StoreRegistrationCodeTooLong {
                    max: MAX_STORE_REGISTRATION_CODE_LEN,
                });
            }

            let auth_commit =
                cosmwasm_std::Binary::from(Sha256::digest(auth_code.as_bytes()).to_vec());
            let auth_commit_key = bytes_to_hex(auth_commit.as_slice());
            let used = STORE_REGISTRATION_CODES
                .may_load(deps.storage, auth_commit_key.clone())?
                .ok_or(ContractError::StoreRegistrationCodeNotProvisioned)?;
            if used {
                return Err(ContractError::StoreRegistrationCodeAlreadyUsed);
            }

            let cfg = CONFIG.load(deps.storage)?;

            // admin は無制限（owner 指定も許可）
            // admin 以外は「自分名義のみ」かつ登録数を上限で制限する
            let owner_addr = if info.sender == cfg.admin {
                owner.map(|o| deps.api.addr_validate(&o)).transpose()?
            } else {
                // Admin 以外は owner を指定しても無視し、送信者を owner とする（抜け道防止）
                let mut owned: u32 = 0;
                for item in STORES.range(deps.storage, None, None, Order::Ascending) {
                    let (_sid, s) = item?;
                    if s.owner.as_ref() == Some(&info.sender) {
                        owned += 1;
                        if owned >= MAX_STORES_PER_OWNER_NON_ADMIN {
                            return Err(ContractError::StoreRegistrationLimitExceeded {
                                max: MAX_STORES_PER_OWNER_NON_ADMIN,
                            });
                        }
                    }
                }
                Some(info.sender.clone())
            };

            let id = next_seq(&STORE_SEQ, deps.storage)?;
            let store = Store {
                id,
                owner: owner_addr.clone(),
                store_ref,
                name,
                category,
                address,
                phone,
                website,
                opening_hours,
                price_range,
                image_url,
                description,
                review_window_override: None,
                created_at: env.block.time,
                updated_at: None,
                active: true,
            };
            STORES.save(deps.storage, id, &store)?;
            STORE_REGISTRATION_CODES.save(deps.storage, auth_commit_key, &true)?;
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
                .add_attribute("store_id", id.to_string())
                .add_attribute(
                    "owner",
                    owner_addr
                        .as_ref()
                        .map(|a| a.to_string())
                        .unwrap_or_else(|| "".to_string()),
                ))
        }

        ExecuteMsg::ProvisionStoreRegistrationCodes { commits } => {
            only_admin(&deps, &info.sender)?;
            if commits.is_empty() {
                return Err(ContractError::StoreRegistrationCodesEmpty);
            }

            for c in commits.iter() {
                if c.len() != STORE_REGISTRATION_COMMIT_LEN {
                    return Err(ContractError::InvalidStoreRegistrationCommitLength {
                        expected: STORE_REGISTRATION_COMMIT_LEN,
                        got: c.len(),
                    });
                }
                let commit_key = bytes_to_hex(c.as_slice());
                if STORE_REGISTRATION_CODES
                    .may_load(deps.storage, commit_key.clone())?
                    .is_some()
                {
                    return Err(ContractError::StoreRegistrationCodeAlreadyProvisioned);
                }
                STORE_REGISTRATION_CODES.save(deps.storage, commit_key, &false)?;
            }

            Ok(Response::new().add_attributes(vec![
                attr("action", "provision_store_registration_codes"),
                attr("count", commits.len().to_string()),
            ]))
        }

        ExecuteMsg::UpdateStore {
            store_id,
            store_ref,
            name,
            category,
            address,
            phone,
            website,
            opening_hours,
            price_range,
            image_url,
            description,
            owner,
        } => {
            is_admin_or_store_owner(&deps, store_id, &info.sender)?;
            let owner_addr = owner.map(|o| deps.api.addr_validate(&o)).transpose()?;
            STORES.update(deps.storage, store_id, |s| {
                s.ok_or(ContractError::NotFound).map(|mut st| {
                    if let Some(v) = store_ref {
                        st.store_ref = v;
                    }
                    if name.is_some() {
                        st.name = name;
                    }
                    if category.is_some() {
                        st.category = category;
                    }
                    if address.is_some() {
                        st.address = address;
                    }
                    if phone.is_some() {
                        st.phone = phone;
                    }
                    if website.is_some() {
                        st.website = website;
                    }
                    if opening_hours.is_some() {
                        st.opening_hours = opening_hours;
                    }
                    if price_range.is_some() {
                        st.price_range = price_range;
                    }
                    if image_url.is_some() {
                        st.image_url = image_url;
                    }
                    if description.is_some() {
                        st.description = description;
                    }
                    if owner_addr.is_some() {
                        st.owner = owner_addr;
                    }
                    st.updated_at = Some(env.block.time);
                    st
                })
            })?;
            Ok(Response::new().add_attributes(vec![
                attr("action", "update_store"),
                attr("store_id", store_id.to_string()),
            ]))
        }

        ExecuteMsg::SetStoreStatus { store_id, active } => {
            is_admin_or_store_owner(&deps, store_id, &info.sender)?;
            STORES.update(deps.storage, store_id, |s| {
                s.ok_or(ContractError::NotFound).map(|mut st| {
                    st.active = active;
                    st.updated_at = Some(env.block.time);
                    st
                })
            })?;
            Ok(Response::new().add_attributes(vec![
                attr("action", "set_store_status"),
                attr("store_id", store_id.to_string()),
                attr("active", active.to_string()),
            ]))
        }

        ExecuteMsg::SetStoreReviewWindow { store_id, secs } => {
            is_admin_or_store_owner(&deps, store_id, &info.sender)?;
            STORES.update(deps.storage, store_id, |s| {
                s.ok_or(ContractError::NotFound).map(|mut st| {
                    st.review_window_override = Some(secs);
                    st.updated_at = Some(env.block.time);
                    st
                })
            })?;
            Ok(Response::new().add_attributes(vec![
                attr("action", "set_store_review_window"),
                attr("store_id", store_id.to_string()),
                attr("secs", secs.to_string()),
            ]))
        }

        /* ================== Visit (no-proof disabled) ================== */
        ExecuteMsg::RecordVisit { .. } => Err(ContractError::RecordVisitDisabled),

        ExecuteMsg::RevokeVisit { visit_id } => {
            let v = VISITS
                .load(deps.storage, visit_id)
                .map_err(|_| ContractError::NotFound)?;
            is_admin_or_store_owner(&deps, v.store_id, &info.sender)?;
            if v.reviewed {
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

        /* ================== QR (Pattern B / Method A) ================== */
        // 店舗（owner/admin）が事前に commits (=sha256(code) 生32バイト) を補充する
        ExecuteMsg::ProvisionQrCommits { store_id, commits } => {
            if commits.is_empty() {
                return Err(ContractError::QrCommitsEmpty);
            }

            // store existence + permission
            let store = STORES
                .load(deps.storage, store_id)
                .map_err(|_| ContractError::NotFound)?;
            is_admin_or_store_owner(&deps, store_id, &info.sender)?;

            let mut first: Option<QrId> = None;
            let mut last: QrId = 0;

            for c in commits.into_iter() {
                if c.len() != QR_COMMIT_LEN {
                    return Err(ContractError::InvalidQrCommitLength {
                        expected: QR_COMMIT_LEN,
                        got: c.len(),
                    });
                }
                let commit_key = bytes_to_hex(c.as_slice());
                if QR_COMMIT_INDEX
                    .may_load(deps.storage, (store_id, commit_key.clone()))?
                    .is_some()
                {
                    return Err(ContractError::QrAlreadyProvisioned);
                }
                let qr_id = next_qr_id(deps.storage, store_id)?;
                QR_POOL.save(deps.storage, (store_id, qr_id), &c)?;
                QR_COMMIT_INDEX.save(deps.storage, (store_id, commit_key), &qr_id)?;

                if first.is_none() {
                    first = Some(qr_id);
                }
                last = qr_id;
            }

            // cursor が未初期化なら、今回の先頭に合わせる
            if QR_CURSOR.may_load(deps.storage, store_id)?.is_none() {
                if let Some(f) = first {
                    QR_CURSOR.save(deps.storage, store_id, &f)?;
                }
            }

            Ok(Response::new().add_attributes(vec![
                attr("action", "provision_qr_commits"),
                attr("store_id", store_id.to_string()),
                attr("store_active", store.active.to_string()),
                attr("count", (last - first.unwrap_or(last) + 1).to_string()),
                attr("first_qr_id", first.unwrap_or(0).to_string()),
                attr("last_qr_id", last.to_string()),
            ]))
        }

        // ユーザーが code を提示して来店記録。成功でQR消費・cursorを次へ進める。
        ExecuteMsg::RecordVisitByQr {
            store_id,
            code,
            memo,
        } => {
            if code.as_bytes().len() as u32 > MAX_QR_CODE_LEN {
                return Err(ContractError::QrCodeTooLong {
                    max: MAX_QR_CODE_LEN,
                });
            }

            let cfg = CONFIG.load(deps.storage)?;
            let store = STORES
                .load(deps.storage, store_id)
                .map_err(|_| ContractError::NotFound)?;
            if !store.active {
                return Err(ContractError::StoreInactive);
            }

            let presented = cosmwasm_std::Binary::from(Sha256::digest(code.as_bytes()).to_vec());
            let commit_key = bytes_to_hex(presented.as_slice());
            let qr_id = QR_COMMIT_INDEX
                .may_load(deps.storage, (store_id, commit_key))?
                .ok_or(ContractError::QrNotProvisioned)?;

            if QR_USED
                .may_load(deps.storage, (store_id, qr_id))?
                .unwrap_or(false)
            {
                return Err(ContractError::QrAlreadyUsed);
            }

            let expected = QR_POOL
                .may_load(deps.storage, (store_id, qr_id))?
                .ok_or(ContractError::QrNotProvisioned)?;

            if presented != expected {
                return Err(ContractError::QrCommitMismatch);
            }

            // Visit を作成（visitorは sender 固定、visited_atは block time 固定）
            let visited_ts: Timestamp = env.block.time;
            let window = store
                .review_window_override
                .unwrap_or(cfg.review_window_secs);
            let reviewable_until = visited_ts.plus_seconds(window);

            let visit_id = next_seq(&VISIT_SEQ, deps.storage)?;
            let v = Visit {
                id: visit_id,
                store_id,
                visitor: info.sender.clone(),
                visited_at: visited_ts,
                reviewable_until,
                reviewed: false,
                revoked: false,
                memo,
            };
            VISITS.save(deps.storage, visit_id, &v)?;

            // state.rs が (&Addr, VisitId) を要求しているため参照で渡す
            VISITS_BY_VISITOR.save(deps.storage, (&info.sender, visit_id), &())?;
            VISITS_BY_STORE.save(deps.storage, (store_id, visit_id), &())?;

            // QR を消費し、次へ
            QR_USED.save(deps.storage, (store_id, qr_id), &true)?;

            Ok(Response::new().add_attributes(vec![
                attr("action", "record_visit_by_qr"),
                attr("store_id", store_id.to_string()),
                attr("visit_id", visit_id.to_string()),
                attr("visitor", info.sender.to_string()),
                attr("qr_id_used", qr_id.to_string()),
                attr("reviewable_until", reviewable_until.seconds().to_string()),
            ]))
        }

        /* ================== Review ================== */
        ExecuteMsg::CreateReview {
            visit_id,
            rating,
            title,
            body,
        } => {
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

            // usize のまま比較（u16キャストによる桁あふれ回避）
            let blen = body.as_bytes().len();
            if blen < cfg.min_text_len as usize {
                return Err(ContractError::TextTooShort);
            }
            if blen > cfg.max_text_len as usize {
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

            // state.rs が (&Addr, ReviewId) を要求しているため参照で渡す
            REVIEWS_BY_REVIEWER.save(deps.storage, (&review.reviewer, id), &())?;

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

        ExecuteMsg::EditReview {
            review_id,
            rating,
            title,
            body,
        } => {
            let mut rr = REVIEWS
                .load(deps.storage, review_id)
                .map_err(|_| ContractError::NotFound)?;
            if rr.reviewer != info.sender {
                return Err(ContractError::Forbidden);
            }

            let cfg = CONFIG.load(deps.storage)?;
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
                let blen = b.as_bytes().len();
                if blen < cfg.min_text_len as usize {
                    return Err(ContractError::TextTooShort);
                }
                if blen > cfg.max_text_len as usize {
                    return Err(ContractError::TextTooLong);
                }
                rr.body = b;
            }
            rr.edited_at = Some(env.block.time);

            REVIEWS.save(deps.storage, review_id, &rr)?;

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

        ExecuteMsg::HideReview { review_id } => {
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
        ExecuteMsg::TipReviewNative { review_id } => {
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

            let fee = amount.multiply_ratio(cfg.fee_bps as u128, 10_000u128);
            let net = amount.checked_sub(fee).unwrap();

            TOTAL_TIPS_NATIVE.update(
                deps.storage,
                (review_id, denom.clone()),
                |v| -> StdResult<_> { Ok(v.unwrap_or_default() + amount) },
            )?;

            // state.rs が (&Addr, String) を要求しているため参照で渡す
            ESCROW_NATIVE.update(
                deps.storage,
                (&rr.reviewer, denom.clone()),
                |v| -> StdResult<_> { Ok(v.unwrap_or_default() + net) },
            )?;

            FEE_NATIVE.update(deps.storage, denom.clone(), |v| -> StdResult<_> {
                Ok(v.unwrap_or_default() + fee)
            })?;

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
        ExecuteMsg::WithdrawTips { to, denom, amount } => {
            let recipient = to
                .map(|s| deps.api.addr_validate(&s))
                .transpose()?
                .unwrap_or(info.sender.clone());

            // state.rs が (&Addr, String) を要求しているため、そのまま参照で渡す
            let bal = ESCROW_NATIVE
                .may_load(deps.storage, (&info.sender, denom.clone()))?
                .unwrap_or_default();

            if bal.is_zero() {
                return Err(ContractError::AmountZero);
            }
            let amt = amount.unwrap_or(bal);
            if amt > bal {
                return Err(ContractError::InvalidFunds);
            }

            ESCROW_NATIVE.save(deps.storage, (&info.sender, denom.clone()), &(bal - amt))?;

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

        ExecuteMsg::WithdrawPlatformFees { to, denom, amount } => {
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
        ExecuteMsg::UpdateConfig {
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
