// src/msg.rs
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use crate::state::{LogEntry, Role};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {
    pub admin: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetConfig {},
    GetTranscript { start: Option<u32>, limit: Option<u32> },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ConfigResponse {
    pub admin: String,
    pub alfa: Option<String>,
    pub bravo: Option<String>,
    pub charlie: Option<String>,
    pub delta: Option<String>,
    pub next_index: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct TranscriptResponse {
    pub entries: Vec<LogEntry>,
}

// ここを追加：命名警告を抑止（外部 JSON 名は rename で固定）
#[allow(non_camel_case_types)]
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub enum ExecuteMsg {
    #[serde(rename = "MSG_Initialize_Alfa")]
    MSG_Initialize_Alfa { alfa_addr: String, content: String },
    #[serde(rename = "MSG_Initialize_Bravo")]
    MSG_Initialize_Bravo { bravo_addr: String, content: String },
    #[serde(rename = "MSG_Initialize_Charlie")]
    MSG_Initialize_Charlie { charlie_addr: String, content: String },
    #[serde(rename = "MSG_Debater_Alfa_turn1")]
    MSG_Debater_Alfa_turn1 { content: String },
    #[serde(rename = "MSG_Debater_Bravo_turn1")]
    MSG_Debater_Bravo_turn1 { content: String },
    #[serde(rename = "MSG_Debater_Charlie_turn1")]
    MSG_Debater_Charlie_turn1 { content: String },
    #[serde(rename = "MSG_Debater_Alfa_turn2")]
    MSG_Debater_Alfa_turn2 { content: String },
    #[serde(rename = "MSG_Debater_Bravo_turn2")]
    MSG_Debater_Bravo_turn2 { content: String },
    #[serde(rename = "MSG_Debater_Charlie_turn2")]
    MSG_Debater_Charlie_turn2 { content: String },
    #[serde(rename = "MSG_Summarizer_Delta")]
    MSG_Summarizer_Delta { delta_addr: Option<String>, content: String },
    Reset {},
}

// UI 補助
#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct StepSpec {
    pub step_index: u32,
    pub step_name: String,
    pub role: Role,
    pub turn: u8,
}
