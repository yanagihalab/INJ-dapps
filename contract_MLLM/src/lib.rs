// src/lib.rs
// --- declare submodules ---
mod error;
mod msg;
mod state;
// --------------------------

#[cfg(not(feature = "library"))]
use cosmwasm_std::entry_point;

use cosmwasm_std::{
    to_json_binary as to_binary, // ← 非推奨 to_binary を置換（呼び出し側はそのままでOK）
    Addr, Binary, Deps, DepsMut, Env, MessageInfo, Order, Response, StdResult,
};
use cw2::set_contract_version;

use crate::error::ContractError; // ← ここだけに集約（重複を解消）
use crate::msg::{
    ConfigResponse, ExecuteMsg, InstantiateMsg, QueryMsg, StepSpec, TranscriptResponse,
};
use crate::state::{Config, LogEntry, Role, CONFIG, LOGS, NEXT_IDX};

const CONTRACT_NAME: &str = "crates.io:debate-contract";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

fn expected_step_name(index: u32) -> Option<&'static str> {
    match index {
        0 => Some("MSG_Initialize_Alfa"),
        1 => Some("MSG_Initialize_Bravo"),
        2 => Some("MSG_Initialize_Charlie"),
        3 => Some("MSG_Debater_Alfa_turn1"),
        4 => Some("MSG_Debater_Bravo_turn1"),
        5 => Some("MSG_Debater_Charlie_turn1"),
        6 => Some("MSG_Debater_Alfa_turn2"),
        7 => Some("MSG_Debater_Bravo_turn2"),
        8 => Some("MSG_Debater_Charlie_turn2"),
        9 => Some("MSG_Summarizer_Delta"),
        _ => None,
    }
}

fn step_spec(index: u32) -> Option<StepSpec> {
    let (step_name, role, turn) = match index {
        0 => ("MSG_Initialize_Alfa", Role::Alfa, 0),
        1 => ("MSG_Initialize_Bravo", Role::Bravo, 0),
        2 => ("MSG_Initialize_Charlie", Role::Charlie, 0),
        3 => ("MSG_Debater_Alfa_turn1", Role::Alfa, 1),
        4 => ("MSG_Debater_Bravo_turn1", Role::Bravo, 1),
        5 => ("MSG_Debater_Charlie_turn1", Role::Charlie, 1),
        6 => ("MSG_Debater_Alfa_turn2", Role::Alfa, 2),
        7 => ("MSG_Debater_Bravo_turn2", Role::Bravo, 2),
        8 => ("MSG_Debater_Charlie_turn2", Role::Charlie, 2),
        9 => ("MSG_Summarizer_Delta", Role::Delta, 3),
        _ => return None,
    };
    Some(StepSpec {
        step_index: index,
        step_name: step_name.to_string(),
        role,
        turn,
    })
}

fn append_log(
    deps: DepsMut,
    env: &Env,
    sender: &Addr,
    step: &str,
    role: Role,
    turn: u8,
    content: String,
) -> StdResult<()> {
    let mut next = NEXT_IDX.load(deps.storage)?;
    let entry = LogEntry {
        index: next,
        step: step.to_string(),
        role,
        turn,
        content,
        sender: sender.to_string(),
        time: env.block.time.seconds(),
    };
    LOGS.save(deps.storage, next, &entry)?;
    next += 1;
    NEXT_IDX.save(deps.storage, &next)?;
    Ok(())
}

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
    CONFIG.save(
        deps.storage,
        &Config {
            admin,
            alfa: None,
            bravo: None,
            charlie: None,
            delta: None,
        },
    )?;
    NEXT_IDX.save(deps.storage, &0u32)?;
    Ok(Response::new()
        .add_attribute("action", "instantiate")
        .add_attribute("contract_name", CONTRACT_NAME)
        .add_attribute("contract_version", CONTRACT_VERSION))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    let next = NEXT_IDX.load(deps.storage)?;
    let expected = expected_step_name(next).ok_or(ContractError::SequenceCompleted)?;

    match msg {
        ExecuteMsg::MSG_Initialize_Alfa { alfa_addr, content } => {
            if expected != "MSG_Initialize_Alfa" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Initialize_Alfa".to_string(),
                });
            }
            if info.sender != config.admin {
                return Err(ContractError::Unauthorized);
            }
            let alfa = deps.api.addr_validate(&alfa_addr)?;
            config.alfa = Some(alfa.clone());
            CONFIG.save(deps.storage, &config)?;
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Initialize_Alfa",
                Role::Alfa,
                0,
                content,
            )?;
            Ok(Response::new()
                .add_attribute("action", "MSG_Initialize_Alfa")
                .add_attribute("alfa_addr", alfa.to_string()))
        }
        ExecuteMsg::MSG_Initialize_Bravo { bravo_addr, content } => {
            if expected != "MSG_Initialize_Bravo" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Initialize_Bravo".to_string(),
                });
            }
            if info.sender != config.admin {
                return Err(ContractError::Unauthorized);
            }
            let bravo = deps.api.addr_validate(&bravo_addr)?;
            config.bravo = Some(bravo.clone());
            CONFIG.save(deps.storage, &config)?;
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Initialize_Bravo",
                Role::Bravo,
                0,
                content,
            )?;
            Ok(Response::new()
                .add_attribute("action", "MSG_Initialize_Bravo")
                .add_attribute("bravo_addr", bravo.to_string()))
        }
        ExecuteMsg::MSG_Initialize_Charlie { charlie_addr, content } => {
            if expected != "MSG_Initialize_Charlie" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Initialize_Charlie".to_string(),
                });
            }
            if info.sender != config.admin {
                return Err(ContractError::Unauthorized);
            }
            let charlie = deps.api.addr_validate(&charlie_addr)?;
            config.charlie = Some(charlie.clone());
            CONFIG.save(deps.storage, &config)?;
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Initialize_Charlie",
                Role::Charlie,
                0,
                content,
            )?;
            Ok(Response::new()
                .add_attribute("action", "MSG_Initialize_Charlie")
                .add_attribute("charlie_addr", charlie.to_string()))
        }
        ExecuteMsg::MSG_Debater_Alfa_turn1 { content } => {
            if expected != "MSG_Debater_Alfa_turn1" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Debater_Alfa_turn1".to_string(),
                });
            }
            let alfa = config
                .alfa
                .clone()
                .ok_or_else(|| ContractError::RoleNotConfigured("alfa".into()))?;
            if info.sender != alfa {
                return Err(ContractError::Unauthorized);
            }
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Debater_Alfa_turn1",
                Role::Alfa,
                1,
                content,
            )?;
            Ok(Response::new().add_attribute("action", "MSG_Debater_Alfa_turn1"))
        }
        ExecuteMsg::MSG_Debater_Bravo_turn1 { content } => {
            if expected != "MSG_Debater_Bravo_turn1" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Debater_Bravo_turn1".to_string(),
                });
            }
            let bravo = config
                .bravo
                .clone()
                .ok_or_else(|| ContractError::RoleNotConfigured("bravo".into()))?;
            if info.sender != bravo {
                return Err(ContractError::Unauthorized);
            }
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Debater_Bravo_turn1",
                Role::Bravo,
                1,
                content,
            )?;
            Ok(Response::new().add_attribute("action", "MSG_Debater_Bravo_turn1"))
        }
        ExecuteMsg::MSG_Debater_Charlie_turn1 { content } => {
            if expected != "MSG_Debater_Charlie_turn1" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Debater_Charlie_turn1".to_string(),
                });
            }
            let charlie = config
                .charlie
                .clone()
                .ok_or_else(|| ContractError::RoleNotConfigured("charlie".into()))?;
            if info.sender != charlie {
                return Err(ContractError::Unauthorized);
            }
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Debater_Charlie_turn1",
                Role::Charlie,
                1,
                content,
            )?;
            Ok(Response::new().add_attribute("action", "MSG_Debater_Charlie_turn1"))
        }
        ExecuteMsg::MSG_Debater_Alfa_turn2 { content } => {
            if expected != "MSG_Debater_Alfa_turn2" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Debater_Alfa_turn2".to_string(),
                });
            }
            let alfa = config
                .alfa
                .clone()
                .ok_or_else(|| ContractError::RoleNotConfigured("alfa".into()))?;
            if info.sender != alfa {
                return Err(ContractError::Unauthorized);
            }
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Debater_Alfa_turn2",
                Role::Alfa,
                2,
                content,
            )?;
            Ok(Response::new().add_attribute("action", "MSG_Debater_Alfa_turn2"))
        }
        ExecuteMsg::MSG_Debater_Bravo_turn2 { content } => {
            if expected != "MSG_Debater_Bravo_turn2" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Debater_Bravo_turn2".to_string(),
                });
            }
            let bravo = config
                .bravo
                .clone()
                .ok_or_else(|| ContractError::RoleNotConfigured("bravo".into()))?;
            if info.sender != bravo {
                return Err(ContractError::Unauthorized);
            }
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Debater_Bravo_turn2",
                Role::Bravo,
                2,
                content,
            )?;
            Ok(Response::new().add_attribute("action", "MSG_Debater_Bravo_turn2"))
        }
        ExecuteMsg::MSG_Debater_Charlie_turn2 { content } => {
            if expected != "MSG_Debater_Charlie_turn2" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Debater_Charlie_turn2".to_string(),
                });
            }
            let charlie = config
                .charlie
                .clone()
                .ok_or_else(|| ContractError::RoleNotConfigured("charlie".into()))?;
            if info.sender != charlie {
                return Err(ContractError::Unauthorized);
            }
            append_log(
                deps,
                &env,
                &info.sender,
                "MSG_Debater_Charlie_turn2",
                Role::Charlie,
                2,
                content,
            )?;
            Ok(Response::new().add_attribute("action", "MSG_Debater_Charlie_turn2"))
        }
        ExecuteMsg::MSG_Summarizer_Delta { delta_addr, content } => {
            if expected != "MSG_Summarizer_Delta" {
                return Err(ContractError::InvalidStep {
                    expected: expected.to_string(),
                    got: "MSG_Summarizer_Delta".to_string(),
                });
            }
            match &config.delta {
                None => {
                    if info.sender != config.admin {
                        return Err(ContractError::Unauthorized);
                    }
                    let delta = if let Some(d) = delta_addr {
                        deps.api.addr_validate(&d)?
                    } else {
                        config.admin.clone()
                    };
                    config.delta = Some(delta.clone());
                    CONFIG.save(deps.storage, &config)?;
                    append_log(
                        deps,
                        &env,
                        &info.sender,
                        "MSG_Summarizer_Delta",
                        Role::Delta,
                        3,
                        content,
                    )?;
                    Ok(Response::new()
                        .add_attribute("action", "MSG_Summarizer_Delta")
                        .add_attribute("delta_addr", delta.to_string()))
                }
                Some(delta) => {
                    if &info.sender != delta {
                        return Err(ContractError::Unauthorized);
                    }
                    append_log(
                        deps,
                        &env,
                        &info.sender,
                        "MSG_Summarizer_Delta",
                        Role::Delta,
                        3,
                        content,
                    )?;
                    Ok(Response::new().add_attribute("action", "MSG_Summarizer_Delta"))
                }
            }
        }
        ExecuteMsg::Reset {} => {
            if info.sender != config.admin {
                return Err(ContractError::Unauthorized);
            }
            // ロール解除 & ログ削除
            config.alfa = None;
            config.bravo = None;
            config.charlie = None;
            config.delta = None;
            CONFIG.save(deps.storage, &config)?;
            let next = NEXT_IDX.load(deps.storage)?;
            for i in 0..next {
                LOGS.remove(deps.storage, i);
            }
            NEXT_IDX.save(deps.storage, &0u32)?;
            Ok(Response::new().add_attribute("action", "reset"))
        }
    }
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => {
            let cfg = CONFIG.load(deps.storage)?;
            let next_index = NEXT_IDX.load(deps.storage)?;
            to_binary(&ConfigResponse {
                admin: cfg.admin.to_string(),
                alfa: cfg.alfa.map(|a| a.to_string()),
                bravo: cfg.bravo.map(|a| a.to_string()),
                charlie: cfg.charlie.map(|a| a.to_string()),
                delta: cfg.delta.map(|a| a.to_string()),
                next_index,
            })
        }
        QueryMsg::GetTranscript { start, limit } => {
            let start = start.unwrap_or(0);
            let limit = limit.unwrap_or(50).min(100) as usize;

            let entries: StdResult<Vec<_>> = LOGS
                .range(deps.storage, None, None, Order::Ascending)
                .skip(start as usize)
                .take(limit)
                .map(|r| r.map(|(_, v)| v))
                .collect();

            to_binary(&TranscriptResponse { entries: entries? })
        }
    }
}
