以下は、**CosmWasm で「食べログ風レビューサイト」を運営するためのスマートコントラクト仕様書の“ひな型”**です。
そのまま `docs/contract_spec.md` などに置けるよう、章立て・型定義・メッセージ仕様・イベント・エラー・テスト観点まで網羅しています。
要件（来店記録／レビューフラグ／フラグを用いたレビュー／投げ銭／レビュー投稿の有効期限）はテンプレに反映済みです。必要に応じて「□ TODO」を埋めてご利用ください。

---

# コントラクト仕様書（ひな型）

**プロジェクト名**:（例）`tabelog-review`
**コントラクト名**:（例）`crates/contracts/review`
**バージョン**: 0.1.0（SemVer）
**作成日**: YYYY-MM-DD
**作成者**: □ TODO
**監査状況**: 未実施 / 実施予定（□ TODO）

---

## 0. 目的・スコープ

* **目的**: ブロックチェーン上で、来店実績に基づく「レビュー投稿」を可能にし、投稿に対する**投げ銭**を受け取れるレビュー基盤を提供する。
* **スコープ（必須）**

  1. **来店情報の記録**（Visit）
  2. **来店記録のレビューフラグ**（Reviewable Ticket）
  3. **レビューフラグを用いたレビュー投稿**（Review）
  4. **レビューへの投げ銭**（Tips / 寄付）
  5. **店舗レビューの書き込み有効期限**（レビュー投稿期限）
* **非スコープ（例）**: 店舗の公式認証、複雑な不正対策、オフチェーン決済ゲートウェイ、ランキングアルゴリズム、KYC/PII 管理 等（□必要に応じて追記）

---

## 1. 用語・役割

* **ユーザー（レビュアー）**: 来店を記録し、レビューを投稿するウォレットアドレス。
* **チッパー**: レビューへ投げ銭するウォレットアドレス。
* **店舗（Store）**: レビュー対象。管理者が登録する想定（任意でユーザー申請を許可可）。
* **管理者（Admin/Owner）**: 設定変更や店舗登録等の特権操作が可能。
* **レビューフラグ（Review Ticket）**: 「来店記録に紐づく、1回限りのレビュー投稿権」。期限・使用済み状態を管理。

---

## 2. 前提・依存

* **チェーン**: □ TODO（例：Osmosis/Juno/Testnet…）
* **実行環境**: CosmWasm x.x.x
* **トークン**:

  * 投げ銭通貨（**Tip Asset**）は初期化時配置（ネイティブ `denom` または CW20 の `address`）。
  * 手数料（プラットフォームフィー）は basis points（bps）指定。
* **時間単位**: `env.block.time.seconds()`（UNIX 秒）。
* **最大文字数**: レビュー本文の上限バイト数（□ TODO、例: 2,048B）

---

## 3. 設計原則

* **1レビュー=1来店記録**（チケット消費で二重投稿を防止）
* **期限遵守**（来店時刻から設定期間内のみレビュー可／店舗側停止期限も考慮）
* **資産安全性**（投げ銭はコントラクト内で記帳し、引き出し方式を基本とする）
* **PII最小化**（個人情報は保持しない。必要に応じて `content_uri` を用いてオフチェーン保存）

---

## 4. データモデル（Rust 風 Type / JSON 目安）

### 4.1 識別子

```rust
type StoreId  = u64;
type VisitId  = u128;
type ReviewId = u128;
```

### 4.2 構造体

```rust
struct Config {
  owner: Addr,
  tip_asset: TipAsset,         // Native or CW20
  platform_fee_bps: u16,       // 0..=10_000
  default_review_window_secs: u64, // 来店→レビュー投稿の標準期限
  max_review_bytes: u32,
  immediate_settlement: bool,  // true: 投げ銭即時配分 / false: 蓄積→引き出し
}

enum TipAsset {
  Native { denom: String },
  Cw20   { contract: Addr },
}

struct Store {
  id: StoreId,
  name: String,
  // 店舗固有のレビュー受付終了日時（任意）
  review_accept_until: Option<Timestamp>,
  // 店舗固有のレビュー期限オーバーライド（任意）
  review_window_secs_override: Option<u64>,
  created_at: Timestamp,
  created_by: Addr,
  active: bool,
}

struct Visit {
  id: VisitId,
  user: Addr,
  store_id: StoreId,
  // 来店時刻（ユーザー自己申告 or 証跡に基づく）
  visited_at: Timestamp,
  // 任意の証跡（ハッシュやURLなど）
  proof_uri: Option<String>,
  // この来店に紐付くレビュー投稿権（未使用/使用済み）
  review_ticket_used: bool,
  // レビュー投稿期限（最終確定値）
  review_deadline: Timestamp,
  created_at: Timestamp,
}

struct Review {
  id: ReviewId,
  store_id: StoreId,
  visit_id: VisitId,     // 1回限りの紐付け
  author: Addr,
  rating: u8,            // 1..=5
  title: Option<String>,
  content: Option<String>,    // 上限サイズ内に制約
  content_uri: Option<String>,// 長文はオフチェーン
  created_at: Timestamp,
  edited_at: Option<Timestamp>,
  // 投げ銭状況
  tip_amount_native: Option<Coin>,        // Native の累計
  tip_amount_cw20: Option<Uint128>,       // CW20 の累計
}
```

### 4.3 ストレージ

* `CONFIG: Item<Config>`
* `STORE_SEQ: Item<StoreId>` / `VISIT_SEQ: Item<VisitId>` / `REVIEW_SEQ: Item<ReviewId>`
* `STORES: Map<StoreId, Store>`（index: by `active`）
* `VISITS: Map<VisitId, Visit>`（index: by `user`, `store_id`）
* `REVIEWS: Map<ReviewId, Review>`（index: by `store_id`, `author`, `rating`）
* **残高系（引き出し方式の場合）**

  * `PENDING_REVIEWER_BAL: Map<(Addr, TipAssetKey), Uint128>`
  * `PLATFORM_FEE_BAL: Map<TipAssetKey, Uint128>`
  * `TipAssetKey = Native(denom) | Cw20(contract)`

---

## 5. メッセージ仕様

### 5.1 InstantiateMsg

```json
{
  "owner": "cosmos1...",
  "tip_asset": { "native": { "denom": "ujuno" } },
  "platform_fee_bps": 500,
  "default_review_window_secs": 2592000,
  "max_review_bytes": 2048,
  "immediate_settlement": false
}
```

* **検証**: `platform_fee_bps <= 10000`、`max_review_bytes` > 0

### 5.2 ExecuteMsg（一例）

```rust
enum ExecuteMsg {
  // 管理
  UpdateConfig { owner: Option<String>, tip_asset: Option<TipAsset>, platform_fee_bps: Option<u16>,
                 default_review_window_secs: Option<u64>, max_review_bytes: Option<u32>,
                 immediate_settlement: Option<bool> },

  // 店舗
  CreateStore { name: String, review_accept_until: Option<Timestamp>,
                review_window_secs_override: Option<u64>, active: Option<bool> }, // admin-only 既定
  UpdateStore { store_id: StoreId, name: Option<String>, review_accept_until: Option<Timestamp>,
                review_window_secs_override: Option<u64>, active: Option<bool> },

  // 来店
  RecordVisit { store_id: StoreId, visited_at: Timestamp, proof_uri: Option<String> }, // ユーザー起票可
  RevokeVisit { visit_id: VisitId }, // admin-only（異常記録の取り消し）

  // レビュー
  PostReview { visit_id: VisitId, rating: u8, title: Option<String>,
               content: Option<String>, content_uri: Option<String> },
  EditReview { review_id: ReviewId, title: Option<String>, content: Option<String>, content_uri: Option<String> },
  DeleteReview { review_id: ReviewId }, // 任意機能（仕様で許可するかは□ TODO）

  // 投げ銭（Native）
  TipReview { review_id: ReviewId }, // 送信トランザクションに同時添付の funds を使用

  // 引き出し
  WithdrawTips { asset: TipAssetSelector, amount: Option<Uint128> }, // reviewer/プラットフォーム向け（内部判定）

  // CW20 受領（CW20 の場合）
  Receive(Cw20ReceiveMsg), // Hook: Cw20HookMsg::TipReview { review_id }
}
```

**Cw20HookMsg（例）**

```rust
enum Cw20HookMsg {
  TipReview { review_id: ReviewId }
}
```

**バリデーション要点**

* `PostReview`:

  * `visit.review_ticket_used == false`
  * `now <= visit.review_deadline`
  * （任意）`store.review_accept_until.map(|t| now <= t).unwrap_or(true)`
  * `rating ∈ [1,5]`
  * `content` サイズ ≤ `max_review_bytes`
  * 投稿成功時に `visit.review_ticket_used = true`
* `TipReview`:

  * funds が `tip_asset` に一致（Native）
  * CW20 の場合は `Receive` 経由の `msg` 必須
  * プラットフォーム手数料控除 → レビュアー残高へ記帳 or 即時送金
* `WithdrawTips`:

  * 呼出人が引き出し対象残高を保有

### 5.3 QueryMsg（一例）

```rust
enum QueryMsg {
  Config {},
  GetStore { store_id: StoreId },
  ListStores { start_after: Option<StoreId>, limit: Option<u32>, active_only: Option<bool> },

  GetVisit { visit_id: VisitId },
  ListVisitsByUser { user: String, start_after: Option<VisitId>, limit: Option<u32> },
  ListVisitsByStore { store_id: StoreId, start_after: Option<VisitId>, limit: Option<u32> },

  GetReview { review_id: ReviewId },
  ListReviewsByStore { store_id: StoreId, start_after: Option<ReviewId>, limit: Option<u32>,
                       sort_by: Option<SortBy>, rating_filter: Option<u8> },
  ListReviewsByUser { user: String, start_after: Option<ReviewId>, limit: Option<u32> },

  GetTipsSummary { review_id: ReviewId },
  GetBalance { user: String, asset: TipAssetSelector }
}
```

**補助型**

```rust
enum SortBy { CreatedAsc, CreatedDesc, RatingAsc, RatingDesc }
enum TipAssetSelector { Native { denom: String }, Cw20 { contract: String } }
```

### 5.4 MigrateMsg

```json
{}
```

* 将来、状態移行用のフィールドを追加

---

## 6. イベント仕様（`wasm-` プレフィックス）

| イベント名                | Attributes                                                        |
| -------------------- | ----------------------------------------------------------------- |
| `wasm.create_store`  | `store_id`, `name`, `created_by`                                  |
| `wasm.record_visit`  | `visit_id`, `store_id`, `user`, `visited_at`, `review_deadline`   |
| `wasm.post_review`   | `review_id`, `store_id`, `visit_id`, `author`, `rating`           |
| `wasm.edit_review`   | `review_id`, `edited_at`                                          |
| `wasm.delete_review` | `review_id`                                                       |
| `wasm.tip_review`    | `review_id`, `from`, `to`(author), `gross`, `fee`, `net`, `asset` |
| `wasm.withdraw_tips` | `by`, `amount`, `asset`                                           |
| `wasm.update_config` | 変更されたキー群                                                          |

---

## 7. エラー定義（例）

* `Unauthorized`
* `StoreNotFound(StoreId)`
* `VisitNotFound(VisitId)`
* `ReviewNotFound(ReviewId)`
* `ReviewAlreadyExistsForVisit(VisitId)`
* `ReviewWindowExpired`
* `StoreReviewClosed`
* `InvalidRating`
* `ContentTooLarge`
* `InvalidFunds`
* `UnsupportedAsset`
* `Overflow` / `Underflow`
* `NothingToWithdraw`
* `DuplicateOperation`

---

## 8. アクセス制御

* 既定: `owner` のみが以下を実行

  * `UpdateConfig` / `CreateStore` / `UpdateStore` / `RevokeVisit`
* 一般ユーザー: `RecordVisit` / `PostReview` / `EditReview` / `TipReview` / `WithdrawTips`
* （任意）モデレータ役割を `cw4-group` 等で外部化／`UpdateConfig` で `moderator` リスト追加（□ TODO）

---

## 9. レビュー投稿の**有効期限**（コア要件）

* **来店→レビュー期限**:

  * 有効値 = `store.review_window_secs_override.unwrap_or(config.default_review_window_secs)`
  * `visit.review_deadline = visited_at + 上記有効値`
* **店舗側のレビュー受付終了日時**（任意機能）:

  * `store.review_accept_until` を設定すると、`now > review_accept_until` のとき新規レビュー不可

---

## 10. 経済設計（投げ銭）

* **資産**: `tip_asset`（Native or CW20）
* **プラットフォーム手数料**: `platform_fee_bps`（例: 500 = 5%）
* **清算方式**:

  * `immediate_settlement = false`（推奨）:

    * 投げ銭時に `fee` を `PLATFORM_FEE_BAL` へ、`net` をレビュアーの `PENDING_REVIEWER_BAL` に計上。レビュアーは `WithdrawTips` で任意引き出し。
  * `immediate_settlement = true`:

    * 投げ銭トランザクション内で `fee` はプラットフォーム、`net` はレビュアーへ `BankMsg::Send` / `Cw20ExecuteMsg::Transfer`。失敗時はロールバック。

---

## 11. インデックス／ページング・並び替え

* **レビュー一覧**: `ListReviewsByStore`

  * デフォルト: `CreatedDesc`
  * フィルタ: `rating_filter`（1..5）
  * ページング: `start_after` + `limit`（最大 □ TODO、例: 100）
* **来店一覧**: `ListVisitsByUser`, `ListVisitsByStore`
* **ストア一覧**: `active_only` フィルタ

---

## 12. セキュリティ・プライバシ

* **再入可能性**: 即時清算時のみ外部送金が発生、極力 `immediate_settlement=false` を推奨。
* **資産保全**: 受領資産は残高マップで厳格管理、`WithdrawTips` は呼出人の分のみ。
* **スパム対策（任意）**:

  * `RecordVisit` に少額デポジット要求（返金しない or 投稿時返金）
  * 1日あたりの来店記録回数リミット（ユーザー×店舗×日）
  * モデレータによる `RevokeVisit` / `DeleteReview`（仕様で許容する場合）
* **PII 回避**: 個人情報は不可。必要なら `content_uri` に外部保存してハッシュを `proof_uri` に記録。
* **署名詐称**: すべての操作は `msg.sender` に基づき本人確認。

---

## 13. ガス・ストレージ目安（概算の書き方）

* 1 レビューあたり保存フィールド: ~数百バイト + 文字列
* 文字列を短く（`content` は上限）し、長文は `content_uri` 推奨
* 多インデックス利用は最小限に

---

## 14. マイグレーション方針

* `CONTRACT_NAME` / `CONTRACT_VERSION` を `const` で管理
* 破壊的変更時は `MigrateMsg` で段階移行（例: 新しい `TipAsset` バリアント追加）
* 移行手順: バージョンチェック → ストレージ再構成 → 移行結果イベント

---

## 15. 例: ユースケース・フロー

**A. 来店 → レビュー**

1. `RecordVisit{store_id, visited_at, proof_uri}`
2. 契約は `review_deadline` を計算・保存（未使用フラグ = true）
3. `PostReview{visit_id, rating, ...}`（期限内）
4. 契約は `review_ticket_used = true` に更新、レビュー保存、イベント発火

**B. 投げ銭（Native）**

1. `TipReview{review_id}` を `--amount 100000ujuno` で実行
2. 契約は手数料/純額を計算し、残高マップに反映
3. `WithdrawTips{asset: Native{denom:"ujuno"}}` でレビュアーが引き出し

**C. 投げ銭（CW20）**

1. CW20 コントラクトへ `Send{recipient: this_contract, amount, msg: TipReview{review_id}}`
2. `Receive` 経由で同様に記帳

---

## 16. 参考 JSON 例

**RecordVisit**

```json
{
  "record_visit": {
    "store_id": 1,
    "visited_at": 1731000000,
    "proof_uri": "ipfs://bafy.../receipt.json"
  }
}
```

**PostReview**

```json
{
  "post_review": {
    "visit_id": "12",
    "rating": 5,
    "title": "最高のランチ",
    "content": "コスパと味のバランスが秀逸",
    "content_uri": null
  }
}
```

**TipReview（Native）**

```json
{ "tip_review": { "review_id": "34" } }
```

（Tx に `--amount 500000ujuno` を添付）

---

## 17. テスト計画（チェックリスト）

* **正常系**

  * 来店→期限内レビュー→二重レビュー不可
  * 店舗の `review_accept_until` 越えで投稿不可
  * Rating 境界（1/5）・本文上限・URI 併用
  * 投げ銭（Native/CW20）累計・イベント
  * 引き出し（部分・全額）・残高ゼロで失敗
* **異常系**

  * 存在しない `store_id` / `visit_id` / `review_id`
  * 期限切れレビュー、重複投稿、資産不一致
  * 手数料 100%/0% 境界、オーバーフロー
  * 権限エラー（一般ユーザーが管理操作）
* **プロパティ**

  * `PostReview` の原子性：チケット消費と保存が同一トランザクション
  * イベント属性の完全性
* **ガス**

  * 大量リストクエリのページング確認

---

## 18. 運用・監視

* **メトリクス（オフチェーン収集）**: 総レビュー数、月間来店数、総チップ額、手数料累計
* **運用コマンド**: 手数料引き出し、ストア凍結/再開
* **バックアップ**: 状態はチェーン由来、外部に `content_uri` の耐久性確保（IPFS/Arweave等）

---

## 19. 将来拡張メモ（任意）

* マルチアセット投げ銭（複数 denom / 複数 CW20）
* いいね/通報/モデレーションキュー
* 店舗オーナー検証（PoA / 署名）
* レビュー編集の時間制限・編集履歴保持
* IBC 経由チップ

---

## 20. 初期設定サマリ（埋めるだけ版）

* チェーン: □
* `tip_asset`: □ Native(denom: ___) / □ CW20(address: ___)
* `platform_fee_bps`: □（例 500 = 5%）
* `default_review_window_secs`: □（例 2,592,000 = 30日）
* `max_review_bytes`: □
* `immediate_settlement`: □ true / □ false
* 管理者アドレス（owner）: □
* 店舗登録方針: □ Adminのみ / □ 任意ユーザー可（デポジット要）

---

### 付録 A: 擬似コード（要点）

**RecordVisit**

```
fn record_visit(user, store_id, visited_at, proof_uri):
  assert store exists & active
  window = store.override.unwrap_or(config.default)
  deadline = visited_at + window
  id = VISIT_SEQ.next()
  VISITS[id] = {user, store_id, visited_at, proof_uri, used:false, deadline, now}
  emit wasm.record_visit
```

**PostReview**

```
fn post_review(visit_id, rating, title, content, content_uri):
  v = VISITS[visit_id]; assert v.user == sender
  assert now <= v.deadline
  assert v.used == false
  assert rating in 1..=5
  assert content.size <= max_review_bytes
  id = REVIEW_SEQ.next()
  REVIEWS[id] = {store_id:v.store_id, visit_id, author:sender, rating, ...}
  v.used = true; VISITS[visit_id] = v
  emit wasm.post_review
```

**TipReview (Native)**

```
fn tip_review(review_id, funds):
  assert funds asset == config.tip_asset
  gross = funds.amount
  fee = gross * bps / 10000
  net = gross - fee
  if config.immediate_settlement:
     send(net, review.author); send(fee, owner)
  else:
     PENDING_REVIEWER_BAL[(author, asset)] += net
     PLATFORM_FEE_BAL[asset] += fee
  REVIEWS[review_id].tip累計 += gross
  emit wasm.tip_review
```

---

このテンプレは「そのまま使える」ことを意識しつつ、運用方針に合わせて**緩める/強める**ポイント（権限、期限、清算方式、デポジット）を分離しています。
必要なら、この仕様から**Rust の型・`ExecuteMsg`/`QueryMsg` のコード雛形**も展開できます。ご希望があれば、次は **実装のスキャフォールド（`cargo-generate` 用）** や **ユニットテスト雛形**までまとめてお出しします。
