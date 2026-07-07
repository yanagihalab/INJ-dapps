use cosmwasm_std::{
    entry_point, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdError, StdResult,
};
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

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{
        mock_dependencies, mock_env, mock_info, MockApi, MockQuerier, MockStorage,
    };
    use cosmwasm_std::{
        coin, from_json, Addr, BankMsg, Binary, CosmosMsg, Empty, OwnedDeps, Uint128,
    };
    use sha2::{Digest, Sha256};

    use crate::msg::{ReviewsResponse, StoresResponse, TipsForReviewResponse, VisitsResponse};
    use crate::state::{Config, Review, Store, StoreAgg, Visit, ESCROW_NATIVE, FEE_NATIVE};

    type TestDeps = OwnedDeps<MockStorage, MockApi, MockQuerier, Empty>;

    fn instantiate_msg() -> InstantiateMsg {
        InstantiateMsg {
            admin: None,
            fee_bps: None,
            fee_receiver: None,
            review_window_secs: None,
            min_text_len: None,
            max_text_len: None,
            native_tip_denoms: None,
            record_policy: None,
            max_tip_per_tx: None,
        }
    }

    fn qr_commit(code: &str) -> Binary {
        Binary::from(Sha256::digest(code.as_bytes()).to_vec())
    }

    fn store_registration_commit(code: &str) -> Binary {
        Binary::from(Sha256::digest(code.as_bytes()).to_vec())
    }

    fn provision_store_registration_code(deps: &mut TestDeps, env: &Env, code: &str) {
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("admin", &[]),
            ExecuteMsg::ProvisionStoreRegistrationCodes {
                commits: vec![store_registration_commit(code)],
            },
        )
        .unwrap();
    }

    fn register_store_msg(store_ref: String, owner: Option<String>) -> ExecuteMsg {
        ExecuteMsg::RegisterStore {
            auth_code: store_ref.clone(),
            store_ref,
            name: None,
            category: None,
            address: None,
            phone: None,
            website: None,
            opening_hours: None,
            price_range: None,
            image_url: None,
            description: None,
            owner,
        }
    }

    fn setup_contract(
        deps: &mut TestDeps,
        env: &Env,
        min_text_len: u16,
        review_window_secs: Option<u64>,
    ) {
        let mut msg = instantiate_msg();
        msg.fee_bps = Some(500);
        msg.min_text_len = Some(min_text_len);
        msg.review_window_secs = review_window_secs;

        instantiate(deps.as_mut(), env.clone(), mock_info("admin", &[]), msg).unwrap();
    }

    fn register_store(deps: &mut TestDeps, env: &Env) {
        provision_store_registration_code(deps, env, "store-register-001");
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("admin", &[]),
            ExecuteMsg::RegisterStore {
                auth_code: "store-register-001".to_string(),
                store_ref: "store-001".to_string(),
                name: Some("Sushi Suwa".to_string()),
                category: Some("Sushi".to_string()),
                address: Some("Tokyo".to_string()),
                phone: Some("03-0000-0000".to_string()),
                website: Some("https://example.com".to_string()),
                opening_hours: Some("11:30-14:00 / 17:00-22:00".to_string()),
                price_range: Some("8000-12000 JPY".to_string()),
                image_url: Some("https://example.com/store.jpg".to_string()),
                description: Some("Counter sushi restaurant".to_string()),
                owner: Some("owner".to_string()),
            },
        )
        .unwrap();
    }

    fn provision_qr(deps: &mut TestDeps, env: &Env, code: &str) {
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("owner", &[]),
            ExecuteMsg::ProvisionQrCommits {
                store_id: 1,
                commits: vec![qr_commit(code)],
            },
        )
        .unwrap();
    }

    fn record_visit(deps: &mut TestDeps, env: &Env, visitor: &str, code: &str) {
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(visitor, &[]),
            ExecuteMsg::RecordVisitByQr {
                store_id: 1,
                code: code.to_string(),
                memo: Some("lunch".to_string()),
            },
        )
        .unwrap();
    }

    fn create_review(deps: &mut TestDeps, env: &Env, visitor: &str, visit_id: u64) {
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info(visitor, &[]),
            ExecuteMsg::CreateReview {
                visit_id,
                rating: 4,
                title: Some("Good".to_string()),
                body: "great lunch".to_string(),
            },
        )
        .unwrap();
    }

    #[test]
    fn instantiate_sets_defaults() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        instantiate(
            deps.as_mut(),
            env.clone(),
            mock_info("admin", &[]),
            instantiate_msg(),
        )
        .unwrap();

        let cfg: Config =
            from_json(query(deps.as_ref(), env, QueryMsg::Config {}).unwrap()).unwrap();

        assert_eq!(cfg.admin.as_str(), "admin");
        assert_eq!(cfg.fee_receiver.as_str(), "admin");
        assert_eq!(cfg.fee_bps, 500);
        assert_eq!(cfg.review_window_secs, 7 * 24 * 60 * 60);
        assert_eq!(cfg.min_text_len, 10);
        assert_eq!(cfg.max_text_len, 2000);
        assert_eq!(cfg.native_tip_denoms, vec!["inj".to_string()]);
        assert_eq!(cfg.max_tip_per_tx, None);
    }

    #[test]
    fn instantiate_rejects_invalid_text_limits() {
        let mut deps = mock_dependencies();
        let mut msg = instantiate_msg();
        msg.min_text_len = Some(20);
        msg.max_text_len = Some(10);

        let err = instantiate(deps.as_mut(), mock_env(), mock_info("admin", &[]), msg).unwrap_err();

        assert!(matches!(err, ContractError::Std(_)));
    }

    #[test]
    fn store_registration_requires_admin_issued_code() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        setup_contract(&mut deps, &env, 5, None);

        let missing = execute(
            deps.as_mut(),
            env.clone(),
            mock_info("owner", &[]),
            register_store_msg("missing-code".to_string(), None),
        )
        .unwrap_err();
        assert!(matches!(
            missing,
            ContractError::StoreRegistrationCodeNotProvisioned
        ));

        let unauthorized = execute(
            deps.as_mut(),
            env.clone(),
            mock_info("owner", &[]),
            ExecuteMsg::ProvisionStoreRegistrationCodes {
                commits: vec![store_registration_commit("owner-code")],
            },
        )
        .unwrap_err();
        assert!(matches!(unauthorized, ContractError::Unauthorized));

        provision_store_registration_code(&mut deps, &env, "issued-code");
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("owner", &[]),
            ExecuteMsg::RegisterStore {
                auth_code: "issued-code".to_string(),
                store_ref: "store-001".to_string(),
                name: None,
                category: None,
                address: None,
                phone: None,
                website: None,
                opening_hours: None,
                price_range: None,
                image_url: None,
                description: None,
                owner: None,
            },
        )
        .unwrap();

        let reused = execute(
            deps.as_mut(),
            env,
            mock_info("owner2", &[]),
            ExecuteMsg::RegisterStore {
                auth_code: "issued-code".to_string(),
                store_ref: "store-002".to_string(),
                name: None,
                category: None,
                address: None,
                phone: None,
                website: None,
                opening_hours: None,
                price_range: None,
                image_url: None,
                description: None,
                owner: None,
            },
        )
        .unwrap_err();
        assert!(matches!(
            reused,
            ContractError::StoreRegistrationCodeAlreadyUsed
        ));
    }

    #[test]
    fn admin_can_update_store_profile_after_registration() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("admin", &[]),
            ExecuteMsg::UpdateStore {
                store_id: 1,
                store_ref: Some("store-001-renewed".to_string()),
                name: Some("Sushi Suwa Ginza".to_string()),
                category: Some("Fine Sushi".to_string()),
                address: Some("Ginza, Tokyo".to_string()),
                phone: Some("03-1111-2222".to_string()),
                website: Some("https://example.com/ginza".to_string()),
                opening_hours: Some("17:00-23:00".to_string()),
                price_range: Some("12000-20000 JPY".to_string()),
                image_url: Some("https://example.com/ginza.jpg".to_string()),
                description: Some("Updated counter sushi profile".to_string()),
                owner: Some("new_owner".to_string()),
            },
        )
        .unwrap();

        let store: Store =
            from_json(query(deps.as_ref(), env, QueryMsg::Store { store_id: 1 }).unwrap()).unwrap();
        assert_eq!(store.store_ref, "store-001-renewed");
        assert_eq!(store.name.as_deref(), Some("Sushi Suwa Ginza"));
        assert_eq!(store.category.as_deref(), Some("Fine Sushi"));
        assert_eq!(store.address.as_deref(), Some("Ginza, Tokyo"));
        assert_eq!(store.phone.as_deref(), Some("03-1111-2222"));
        assert_eq!(store.website.as_deref(), Some("https://example.com/ginza"));
        assert_eq!(store.opening_hours.as_deref(), Some("17:00-23:00"));
        assert_eq!(store.price_range.as_deref(), Some("12000-20000 JPY"));
        assert_eq!(
            store.image_url.as_deref(),
            Some("https://example.com/ginza.jpg")
        );
        assert_eq!(
            store.description.as_deref(),
            Some("Updated counter sushi profile")
        );
        assert_eq!(store.owner.unwrap().as_str(), "new_owner");
        assert!(store.updated_at.is_some());
    }

    #[test]
    fn outsider_cannot_update_store_profile() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);

        let err = execute(
            deps.as_mut(),
            env,
            mock_info("outsider", &[]),
            ExecuteMsg::UpdateStore {
                store_id: 1,
                store_ref: Some("bad-ref".to_string()),
                name: Some("Bad Store".to_string()),
                category: None,
                address: None,
                phone: None,
                website: None,
                opening_hours: None,
                price_range: None,
                image_url: None,
                description: None,
                owner: None,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Forbidden));
    }

    #[test]
    fn qr_visit_review_and_native_tip_flow() {
        let mut deps = mock_dependencies();
        let env = mock_env();
        let mut msg = instantiate_msg();
        msg.fee_bps = Some(500);
        msg.min_text_len = Some(5);

        instantiate(deps.as_mut(), env.clone(), mock_info("admin", &[]), msg).unwrap();

        provision_store_registration_code(&mut deps, &env, "store-register-001");
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("admin", &[]),
            ExecuteMsg::RegisterStore {
                auth_code: "store-register-001".to_string(),
                store_ref: "store-001".to_string(),
                name: Some("Sushi Suwa".to_string()),
                category: Some("Sushi".to_string()),
                address: Some("Tokyo".to_string()),
                phone: Some("03-0000-0000".to_string()),
                website: Some("https://example.com".to_string()),
                opening_hours: Some("11:30-14:00 / 17:00-22:00".to_string()),
                price_range: Some("8000-12000 JPY".to_string()),
                image_url: Some("https://example.com/store.jpg".to_string()),
                description: Some("Counter sushi restaurant".to_string()),
                owner: Some("owner".to_string()),
            },
        )
        .unwrap();

        let store: Store =
            from_json(query(deps.as_ref(), env.clone(), QueryMsg::Store { store_id: 1 }).unwrap())
                .unwrap();
        assert_eq!(store.owner.unwrap().as_str(), "owner");
        assert_eq!(store.name.as_deref(), Some("Sushi Suwa"));
        assert_eq!(store.category.as_deref(), Some("Sushi"));
        assert_eq!(store.address.as_deref(), Some("Tokyo"));
        assert_eq!(
            store.opening_hours.as_deref(),
            Some("11:30-14:00 / 17:00-22:00")
        );
        assert!(store.active);

        let stores: StoresResponse = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::Stores {
                    start_after: None,
                    limit: Some(10),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(stores.stores.len(), 1);

        let qr_code = "qr-code-001";
        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("owner", &[]),
            ExecuteMsg::ProvisionQrCommits {
                store_id: 1,
                commits: vec![qr_commit(qr_code)],
            },
        )
        .unwrap();

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("visitor", &[]),
            ExecuteMsg::RecordVisitByQr {
                store_id: 1,
                code: qr_code.to_string(),
                memo: Some("lunch".to_string()),
            },
        )
        .unwrap();

        let visit: Visit =
            from_json(query(deps.as_ref(), env.clone(), QueryMsg::Visit { visit_id: 1 }).unwrap())
                .unwrap();
        assert_eq!(visit.visitor.as_str(), "visitor");
        assert!(!visit.reviewed);
        assert!(!visit.revoked);

        let visits: VisitsResponse = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::VisitsByVisitor {
                    visitor: "visitor".to_string(),
                    start_after: None,
                    limit: Some(10),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(visits.visits.len(), 1);

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("visitor", &[]),
            ExecuteMsg::CreateReview {
                visit_id: 1,
                rating: 4,
                title: Some("Good".to_string()),
                body: "great lunch".to_string(),
            },
        )
        .unwrap();

        let review: Review = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::Review { review_id: 1 },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(review.reviewer.as_str(), "visitor");
        assert_eq!(review.rating, 4);
        assert!(!review.hidden);

        let reviewed_visit: Visit =
            from_json(query(deps.as_ref(), env.clone(), QueryMsg::Visit { visit_id: 1 }).unwrap())
                .unwrap();
        assert!(reviewed_visit.reviewed);

        let agg: StoreAgg =
            from_json(query(deps.as_ref(), env, QueryMsg::StoreAgg { store_id: 1 }).unwrap())
                .unwrap();
        assert_eq!(agg.review_count, 1);
        assert_eq!(agg.rating_sum, 4);

        execute(
            deps.as_mut(),
            mock_env(),
            mock_info("tipper", &[coin(1_000, "inj")]),
            ExecuteMsg::TipReviewNative { review_id: 1 },
        )
        .unwrap();

        let reviewer = Addr::unchecked("visitor");
        let escrow = ESCROW_NATIVE
            .load(deps.as_ref().storage, (&reviewer, "inj".to_string()))
            .unwrap();
        let fees = FEE_NATIVE
            .load(deps.as_ref().storage, "inj".to_string())
            .unwrap();
        let tips: TipsForReviewResponse = from_json(
            query(
                deps.as_ref(),
                mock_env(),
                QueryMsg::TipsForReview { review_id: 1 },
            )
            .unwrap(),
        )
        .unwrap();

        assert_eq!(escrow, Uint128::new(950));
        assert_eq!(fees, Uint128::new(50));
        assert_eq!(tips.totals.len(), 1);
        assert_eq!(tips.totals[0].denom, "inj");
        assert_eq!(tips.totals[0].amount, Uint128::new(1_000));
    }

    #[test]
    fn rejects_unauthorized_admin_and_store_owner_actions() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);

        let err = execute(
            deps.as_mut(),
            env.clone(),
            mock_info("outsider", &[]),
            ExecuteMsg::SetStoreStatus {
                store_id: 1,
                active: false,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Forbidden));

        let err = execute(
            deps.as_mut(),
            env,
            mock_info("outsider", &[]),
            ExecuteMsg::UpdateConfig {
                admin: None,
                fee_bps: Some(100),
                fee_receiver: None,
                review_window_secs: None,
                min_text_len: None,
                max_text_len: None,
                native_tip_denoms: None,
                record_policy: None,
                max_tip_per_tx: None,
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::Unauthorized));
    }

    #[test]
    fn used_qr_code_cannot_be_reused() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);
        provision_qr(&mut deps, &env, "qr-code-001");
        record_visit(&mut deps, &env, "visitor", "qr-code-001");

        let err = execute(
            deps.as_mut(),
            env.clone(),
            mock_info("another_visitor", &[]),
            ExecuteMsg::RecordVisitByQr {
                store_id: 1,
                code: "qr-code-001".to_string(),
                memo: None,
            },
        )
        .unwrap_err();
        assert!(matches!(
            err,
            ContractError::QrAlreadyUsed | ContractError::QrNotProvisioned
        ));

        let visits: VisitsResponse = from_json(
            query(
                deps.as_ref(),
                env,
                QueryMsg::VisitsByVisitor {
                    visitor: "another_visitor".to_string(),
                    start_after: None,
                    limit: Some(10),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert!(visits.visits.is_empty());
    }

    #[test]
    fn rejects_review_after_review_window_expired() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, Some(1));
        register_store(&mut deps, &env);
        provision_qr(&mut deps, &env, "qr-code-001");
        record_visit(&mut deps, &env, "visitor", "qr-code-001");

        let mut expired_env = env.clone();
        expired_env.block.time = env.block.time.plus_seconds(2);

        let err = execute(
            deps.as_mut(),
            expired_env,
            mock_info("visitor", &[]),
            ExecuteMsg::CreateReview {
                visit_id: 1,
                rating: 4,
                title: Some("Late".to_string()),
                body: "great lunch".to_string(),
            },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::ReviewWindowExpired));
    }

    #[test]
    fn rejects_tip_with_disallowed_denom() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);
        provision_qr(&mut deps, &env, "qr-code-001");
        record_visit(&mut deps, &env, "visitor", "qr-code-001");
        create_review(&mut deps, &env, "visitor", 1);

        let err = execute(
            deps.as_mut(),
            env,
            mock_info("tipper", &[coin(1_000, "uatom")]),
            ExecuteMsg::TipReviewNative { review_id: 1 },
        )
        .unwrap_err();
        assert!(matches!(err, ContractError::DenomNotAllowed));
    }

    #[test]
    fn withdraws_reviewer_tips_and_platform_fees() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);
        provision_qr(&mut deps, &env, "qr-code-001");
        record_visit(&mut deps, &env, "visitor", "qr-code-001");
        create_review(&mut deps, &env, "visitor", 1);

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("tipper", &[coin(1_000, "inj")]),
            ExecuteMsg::TipReviewNative { review_id: 1 },
        )
        .unwrap();

        let res = execute(
            deps.as_mut(),
            env.clone(),
            mock_info("visitor", &[]),
            ExecuteMsg::WithdrawTips {
                to: Some("payout".to_string()),
                denom: "inj".to_string(),
                amount: Some(Uint128::new(400)),
            },
        )
        .unwrap();

        assert_eq!(res.messages.len(), 1);
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, "payout");
                assert_eq!(amount, &vec![coin(400, "inj")]);
            }
            msg => panic!("unexpected withdraw tips message: {msg:?}"),
        }

        let reviewer = Addr::unchecked("visitor");
        let escrow = ESCROW_NATIVE
            .load(deps.as_ref().storage, (&reviewer, "inj".to_string()))
            .unwrap();
        assert_eq!(escrow, Uint128::new(550));

        let res = execute(
            deps.as_mut(),
            env,
            mock_info("admin", &[]),
            ExecuteMsg::WithdrawPlatformFees {
                to: Some("fees".to_string()),
                denom: "inj".to_string(),
                amount: None,
            },
        )
        .unwrap();

        assert_eq!(res.messages.len(), 1);
        match &res.messages[0].msg {
            CosmosMsg::Bank(BankMsg::Send { to_address, amount }) => {
                assert_eq!(to_address, "fees");
                assert_eq!(amount, &vec![coin(50, "inj")]);
            }
            msg => panic!("unexpected withdraw fees message: {msg:?}"),
        }

        let fees = FEE_NATIVE
            .load(deps.as_ref().storage, "inj".to_string())
            .unwrap();
        assert_eq!(fees, Uint128::zero());
    }

    #[test]
    fn paginates_store_and_review_queries() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        for id in 1..=3 {
            let store_ref = format!("store-{id:03}");
            provision_store_registration_code(&mut deps, &env, &store_ref);
            execute(
                deps.as_mut(),
                env.clone(),
                mock_info("admin", &[]),
                register_store_msg(store_ref, Some("owner".to_string())),
            )
            .unwrap();
        }

        let page_one: StoresResponse = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::Stores {
                    start_after: None,
                    limit: Some(2),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            page_one.stores.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![1, 2]
        );

        let page_two: StoresResponse = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::Stores {
                    start_after: Some(2),
                    limit: Some(10),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            page_two.stores.iter().map(|s| s.id).collect::<Vec<_>>(),
            vec![3]
        );

        provision_qr(&mut deps, &env, "qr-code-001");
        provision_qr(&mut deps, &env, "qr-code-002");
        record_visit(&mut deps, &env, "visitor_one", "qr-code-001");
        record_visit(&mut deps, &env, "visitor_two", "qr-code-002");
        create_review(&mut deps, &env, "visitor_one", 1);
        create_review(&mut deps, &env, "visitor_two", 2);

        let review_page_one: ReviewsResponse = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::ReviewsByStore {
                    store_id: 1,
                    start_after: None,
                    limit: Some(1),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            review_page_one
                .reviews
                .iter()
                .map(|r| r.id)
                .collect::<Vec<_>>(),
            vec![1]
        );

        let review_page_two: ReviewsResponse = from_json(
            query(
                deps.as_ref(),
                env,
                QueryMsg::ReviewsByStore {
                    store_id: 1,
                    start_after: Some(1),
                    limit: Some(10),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(
            review_page_two
                .reviews
                .iter()
                .map(|r| r.id)
                .collect::<Vec<_>>(),
            vec![2]
        );
    }

    #[test]
    fn qr_codes_can_be_consumed_out_of_provision_order() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("owner", &[]),
            ExecuteMsg::ProvisionQrCommits {
                store_id: 1,
                commits: vec![qr_commit("qr-code-001"), qr_commit("qr-code-002")],
            },
        )
        .unwrap();

        record_visit(&mut deps, &env, "visitor_two", "qr-code-002");
        record_visit(&mut deps, &env, "visitor_one", "qr-code-001");

        let visits: VisitsResponse = from_json(
            query(
                deps.as_ref(),
                env,
                QueryMsg::VisitsByStore {
                    store_id: 1,
                    start_after: None,
                    limit: Some(10),
                },
            )
            .unwrap(),
        )
        .unwrap();

        assert_eq!(visits.visits.len(), 2);
        assert_eq!(visits.visits[0].visitor.as_str(), "visitor_two");
        assert_eq!(visits.visits[1].visitor.as_str(), "visitor_one");
    }

    #[test]
    fn queries_reviewer_reviews_and_native_balances() {
        let mut deps = mock_dependencies();
        let env = mock_env();

        setup_contract(&mut deps, &env, 5, None);
        register_store(&mut deps, &env);
        provision_qr(&mut deps, &env, "qr-code-001");
        record_visit(&mut deps, &env, "visitor", "qr-code-001");
        create_review(&mut deps, &env, "visitor", 1);

        execute(
            deps.as_mut(),
            env.clone(),
            mock_info("tipper", &[coin(1_000, "inj")]),
            ExecuteMsg::TipReviewNative { review_id: 1 },
        )
        .unwrap();

        let reviews: ReviewsResponse = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::ReviewsByReviewer {
                    reviewer: "visitor".to_string(),
                    start_after: None,
                    limit: Some(10),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(reviews.reviews.len(), 1);
        assert_eq!(reviews.reviews[0].id, 1);

        let reviewer_balance: crate::msg::NativeBalanceResponse = from_json(
            query(
                deps.as_ref(),
                env.clone(),
                QueryMsg::ReviewerBalance {
                    reviewer: "visitor".to_string(),
                    denom: "inj".to_string(),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(reviewer_balance.amount, Uint128::new(950));

        let platform_fees: crate::msg::NativeBalanceResponse = from_json(
            query(
                deps.as_ref(),
                env,
                QueryMsg::PlatformFees {
                    denom: "inj".to_string(),
                },
            )
            .unwrap(),
        )
        .unwrap();
        assert_eq!(platform_fees.amount, Uint128::new(50));
    }
}
