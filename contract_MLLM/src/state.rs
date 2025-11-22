//state.rs
use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub enum Role {
    Alfa,
    Bravo,
    Charlie,
    Delta,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct LogEntry {
    pub index: u32,
    pub step: String,     // 例: "MSG_Debater_Bravo_turn1"
    pub role: Role,       // 例: Role::Bravo
    pub turn: u8,         // 0: init, 1/2: debate, 3: summary
    pub content: String,  // 本文
    pub sender: String,   // 送信アドレス
    pub time: u64,        // env.block.time.seconds()
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    pub admin: Addr,
    pub alfa: Option<Addr>,
    pub bravo: Option<Addr>,
    pub charlie: Option<Addr>,
    pub delta: Option<Addr>,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const NEXT_IDX: Item<u32> = Item::new("next_idx"); // 次に受け付けるステップ index
pub const LOGS: Map<u32, LogEntry> = Map::new("logs"); // index -> LogEntry
