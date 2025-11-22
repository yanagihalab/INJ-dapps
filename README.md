了解です。
いただいた実行ログ（`chmod`/`sed`/`docker run --entrypoint ... status`）を反映した **“Tx を送るための CLI 環境” 用 README** を作り直しました。
そのまま `README.md` として保存してご利用ください。

---

# Injective Tx-Only CLI (Docker)

自分でフルノードは立てず、**公開 RPC に接続して Tx を送るための CLI 専用環境**です。
`injectived` は Docker イメージ内に含まれており、**ホスト上では実行しません**。

* スクリプト: `cli-entrypoint.sh`（CLI 用エントリポイント）
* 鍵の保存先（ホスト）: `~/.injective`（コンテナに `/home/inj/.injective` としてマウント）

> **注意**: Testnet は開発用です。本番送金は Mainnet で行ってください。

---

## 0. 前提

* `injectived` を同梱したベースイメージ `injective-ubuntu` を既にビルド済み
  （例：Ubuntu 22.04 ベースで `INJ_RELEASE=v1.17.0-1762751536` を取得する Dockerfile でビルド）
* Docker が利用可能
* ホストの鍵永続化ディレクトリ:

  ```bash
  mkdir -p ~/.injective
  ```

---

## 1. 初回セットアップ（**実行ログを反映**）

`cli-entrypoint.sh` をプロジェクト直下に配置し、**実行権の付与**と**改行コードの統一（CRLF→LF）**を行います。

```bash
chmod +x cli-entrypoint.sh
# Windows/WSL などで作った場合は CRLF → LF へ
sed -i 's/\r$//' cli-entrypoint.sh
```

---

## 2. 接続確認（Testnet 例・**実行ログを反映**）

`cli-entrypoint.sh` をコンテナにマウントし、**エントリポイントを差し替えて実行**します。
`INJ_NODE` と `INJ_CHAIN_ID` を明示して **公開 RPC（Testnet）** に接続します。

```bash
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  status
```

**期待される出力（抜粋）**: `network: "injective-888"` / `"catching_up": false` が表示されれば疎通 OK

```json
{
  "node_info": { "network": "injective-888", ... },
  "sync_info": { "catching_up": false, "latest_block_height": "...", ... },
  ...
}
```

> ポイント
>
> * スクリプトは**ホストで直接 `bash cli-entrypoint.sh` しません**（コンテナ内の `injectived` を使うため）。
> * 変数代入やパイプで結果を扱うコマンドは **TTY なし（`-i`）** を使うと安全です（`\r` 混入を避けるため）。
> * 対話が必要な `keys add` は **`-it`** を使います。

---

## 3. 鍵の作成・アドレス取得

```bash
# 3-1) 鍵作成（対話あり → -it）
docker run --rm -it \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  keys add mykey --keyring-backend test

# 3-2) アドレス取得（変数代入 → -i、末尾の \r 除去）
MY_ADDR=$(
  docker run --rm -i \
    --entrypoint /usr/local/bin/entrypoint.cli.sh \
    -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
    -v ~/.injective:/home/inj/.injective \
    -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
    -e INJ_CHAIN_ID=injective-888 \
    injective-ubuntu \
    keys show mykey -a --keyring-backend test | tr -d '\r'
)
echo "MY_ADDR=${MY_ADDR}"
```

> **セキュリティ**: ニーモニックやパスワードは絶対に共有しないでください。漏えいの可能性がある場合は鍵を破棄して再作成してください。

---

## 4. 残高確認・送金（Tx）

**残高確認（クエリ）**

```bash
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  query bank balances "inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w"
```

**送金（Tx）**

> **1 INJ = 10^18 inj**。最初は小額でテストするのがおすすめです。

```bash
AMOUNT="1000inj"                  # ごく小額
FEE="5000000000000000inj"         # 0.005 INJ（調整可）

docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  tx bank send mykey "${MY_ADDR}" "${AMOUNT}" \
    --keyring-backend test \
    --gas auto --gas-adjustment 1.2 \
    --fees "${FEE}" \
    -y
```

**Tx 確認（`txhash` を使う）**

```bash
TXHASH=<上の実行結果に表示された txhash>
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  query tx "${TXHASH}"
```

---

## 5. Mainnet へ切り替える場合

`INJ_NODE` / `INJ_CHAIN_ID` を Mainnet に変更してください。

```bash
# 代表的な公開 RPC 例
export INJ_NODE=https://sentry.tm.injective.network:443
export INJ_CHAIN_ID=injective-1

docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE="$INJ_NODE" \
  -e INJ_CHAIN_ID="$INJ_CHAIN_ID" \
  injective-ubuntu \
  status
```

> Testnet と同様に、残高確認・送金コマンドの環境変数だけ Mainnet 用に差し替えれば使えます。

---

## 6. よくあるハマり

* **`injectived not found in PATH`**
  → ホストで `bash cli-entrypoint.sh` を直接実行していませんか？
  必ず `docker run --entrypoint /usr/local/bin/entrypoint.cli.sh ...` で**コンテナ経由**で実行します。
* **`/usr/bin/env: bash\r: No such file or directory`**
  → Windows 改行（CRLF）です。`sed -i 's/\r$//' cli-entrypoint.sh` で **LF** に統一。
* **`invalid bech32 ... '\r'`**
  → 変数代入（`$(...)`）やパイプは **TTY なし（`-i`）** の実行を使い、`tr -d '\r'` で除去。
* **`unknown flag: --chain-id`**
  → `status`/`query` では `--chain-id` は不要（本エントリポイントは `tx` のときだけ自動付与）。
* **`post failed: connect refused`**
  → `INJ_NODE` が未設定/誤り。`-e INJ_NODE=... -e INJ_CHAIN_ID=...` を確認。
* **手数料/ガス関連の失敗**
  → `--fees` を上げる、または `--gas-adjustment` を 1.3〜1.5 に。ネットワークの混雑で必要量は変動します。

---

## 7. もっと使いやすくする（任意）

毎回 `--entrypoint` を書くのが面倒なら、**小さな派生イメージ**を作成してください。

**Dockerfile.cli**

```dockerfile
FROM injective-ubuntu
COPY cli-entrypoint.sh /usr/local/bin/entrypoint.cli.sh
RUN chmod +x /usr/local/bin/entrypoint.cli.sh
ENTRYPOINT ["/usr/local/bin/entrypoint.cli.sh"]
```

```bash
docker build -f Dockerfile.cli -t injective-cli .

# 以後は -i/-it と環境変数だけでOK
docker run --rm -i -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-cli status
```

---

これで、**実行ログのとおりの手順を README に取り込み**ました。
他に追記したい運用上の注意や、`staking/gov/wasm` などの Tx テンプレがあればお知らせください。


了解です。
既存の README に **CosmWasm コントラクトのデプロイ手順**（store → instantiate → execute → query）を追記しました。
この節だけを README の末尾に追加しても、そのまま単体で使っても大丈夫です。

---

## 8. CosmWasm コントラクトのデプロイ（store → instantiate → execute → query）

> ここでは **フルノードなし**・**公開 RPC に接続**したまま、`injectived` CLI で CosmWasm コントラクトを扱います。
> 例は **Testnet** を想定しています。Mainnet では `INJ_NODE/INJ_CHAIN_ID` を差し替えてください。
> 以降のコマンドはすべて、前章と同じく **`--entrypoint` 差し替え + `cli-entrypoint.sh` マウント**で実行します。

### 前提

* 最適化済みの `.wasm` バイナリ（例：`artifacts/contract.wasm`）を用意しておく

  * 例：`cosmwasm/rust-optimizer` でビルドした成果物を利用
* 送金に十分な INJ 残高を持つ鍵 `mykey` が作成済み（`--keyring-backend test` など）

> 変数に格納するコマンドは **TTY なし（`-i`）** を使い、末尾の `\r` 混入を避けるために必要なら `| tr -d '\r'` を使ってください。

---

```bash
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.17.0
```

### 8.1 ファイルと環境変数の準備

```bash
# コントラクトのパス（ホスト側）
WASM_PATH="$PWD/artifacts/contract.wasm"

# アドレス取得（TTYなし）
MY_ADDR=$(
  docker run --rm -i \
    --entrypoint /usr/local/bin/entrypoint.cli.sh \
    -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
    -v ~/.injective:/home/inj/.injective \
    -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
    -e INJ_CHAIN_ID=injective-888 \
    injective-ubuntu \
    keys show mykey -a --keyring-backend test | tr -d '\r'
)
echo "MY_ADDR=${MY_ADDR}"
```

---

### 8.2 コードのアップロード（`store`）

```bash
# store（最小例）
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -v "$PWD:/work" \                    # ← wasm をコンテナに渡す
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  tx wasm store /work/artifacts/contract.wasm \
    --from mykey \
    --keyring-backend test \
    --gas auto --gas-adjustment 1.3 \
    --fees 5000000000000000inj \
    -y
```

**`code_id` の取得**（Tx ログから抽出 or 一覧から確認）

```bash
# A) 直前 Tx のハッシュを控えている場合（例）
TXHASH=<上の結果で表示された txhash>

CODE_ID=$(
  docker run --rm -i \
    --entrypoint /usr/local/bin/entrypoint.cli.sh \
    -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
    -v ~/.injective:/home/inj/.injective \
    -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
    -e INJ_CHAIN_ID=injective-888 \
    injective-ubuntu \
    query tx "$TXHASH" \
  | jq -r '.. | objects? | select(.key?=="code_id") | .value' \
  | tail -1
)
echo "CODE_ID=${CODE_ID}"

# B) 一覧から自分の最新 code を拾う例（うまく出ない場合は A を使ってください）
# CODE_ID=$( docker run --rm -i ... query wasm list-code | jq -r '.code_infos[-1].code_id' )
```

> どの抽出方法でも `CODE_ID` が空でないことを確認してください。

---

### 8.3 インスタンス生成（`instantiate`）

* **admin を設定する**場合（将来の migrate/upgrade を自分が行える） … `--admin "${MY_ADDR}"`
* **admin を外す**場合（変更不可で固定） … `--no-admin`

```bash
# 初期化メッセージ（コントラクトごとに異なる）
INIT_JSON='{"owner":"'"${MY_ADDR}"'"}'  # 例。あなたのコントラクト仕様に合わせてください。

# ラベルは任意の識別子（重複可だが分かりやすく）
LABEL="my-contract-$(date +%Y%m%d-%H%M%S)"

# admin を設定する例
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  tx wasm instantiate "${CODE_ID}" "${INIT_JSON}" \
    --label "${LABEL}" \
    --admin "${MY_ADDR}" \
    --from mykey \
    --keyring-backend test \
    --gas auto --gas-adjustment 1.3 \
    --fees 5000000000000000inj \
    -y

# admin を付けたくない例（--no-admin）
# ... tx wasm instantiate "${CODE_ID}" "${INIT_JSON}" --label "${LABEL}" --no-admin ...
```

**コントラクトアドレスの取得**

```bash
# code_id に紐づく最新インスタンスから拾う例
CONTRACT=$(
  docker run --rm -i \
    --entrypoint /usr/local/bin/entrypoint.cli.sh \
    -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
    -v ~/.injective:/home/inj/.injective \
    -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
    -e INJ_CHAIN_ID=injective-888 \
    injective-ubuntu \
    query wasm list-contract-by-code "${CODE_ID}" \
  | jq -r '.contracts[-1]'
)
echo "CONTRACT=${CONTRACT}"
```

> うまく拾えない場合は、`instantiate` の Tx を `query tx <txhash>` して、イベントの `_contract_address` を抽出してください。

---

### 8.4 実行（`execute`）とクエリ（`smart query`）

```bash
# 実行（execute）: 例）{"increment":{}} のようなメッセージ
EXEC_MSG='{"increment":{}}'       # あなたのコントラクト仕様に合わせて変更
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  tx wasm execute "${CONTRACT}" "${EXEC_MSG}" \
    --from mykey \
    --keyring-backend test \
    --gas auto --gas-adjustment 1.3 \
    --fees 5000000000000000inj \
    -y

# スマートクエリ（smart）
QUERY_MSG='{"get_count":{}}'      # あなたのコントラクト仕様に合わせて変更
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  query wasm contract-state smart "${CONTRACT}" "${QUERY_MSG}"
```

> 実行時にコントラクトへトークンを同時送付する場合は、`--amount "<VALUE>inj"` を付けます（例：`--amount "1000000000000000inj"` で 0.001 INJ）。

---

### 8.5 よくあるエラーと対処

* **`insufficient fees / out of gas`**
  → `--fees` を増やす、`--gas-adjustment` を 1.3〜1.5 に。
* **`account sequence mismatch`**
  → 直前の Tx がブロックに入るまで待って再送。`query auth account "${MY_ADDR}"` で `sequence` を確認。
* **`unauthorized: failed to execute message`**
  → admin が必要な操作を admin 以外で実行している、または初期化メッセージが契約仕様と不一致。
* **`no such file or directory: /work/.../contract.wasm`**
  → `-v "$PWD:/work"` のマウントと `store` のパス（`/work/...`）が一致しているか確認。
* **JSON のクオート/エスケープ**
  → `'{...}'` を **シングルクォート**で包み、内部で変数展開が必要なら `'"${VAR}"'` のように連結。

---

### 8.6 Mainnet での注意点

* Testnet よりも **手数料・ガス** が必要になる場合があります。まずは小額で試し、安全を確認してから本番実行してください。
* コード公開（`store`）は不可逆です。**ソースやビルド手順、チェックサム**を社内で必ず管理してください。
* セキュリティ上、admin を付けるかどうか（`--admin` / `--no-admin`）は要件に合わせて慎重に判断してください。

---

※ EVM（inEVM）向けのデプロイは **`injectived` CLI の対象外**です。Hardhat/Foundry 等で JSON-RPC に対して実行してください（RPC/Chain ID は inEVM 向けの設定を使用）。必要であれば、Hardhat/Foundry 用の最小テンプレも用意します。

---

この追記で、**Tx 送信に加えて CosmWasm のデプロイ一式**が README から実行できるようになりました。
使うコントラクト（初期化メッセージ・実行メッセージ）が決まっていれば、その JSON を読んだ **具体的な `instantiate`/`execute` コマンド例**も書き下ろします。



admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ # 今の値を確認（空なら <empty> と表示）
echo "CODE_ID=${CODE_ID:-<empty>}"
echo "MY_ADDR=${MY_ADDR:-<empty>}"
echo "KEYNAME=${KEYNAME:-<empty>}"
echo "INJ_NODE=${INJ_NODE:-<empty>}"
echo "INJ_CHAIN_ID=${INJ_CHAIN_ID:-<empty>}"
CODE_ID=<empty>
MY_ADDR=<empty>
KEYNAME=<empty>
INJ_NODE=<empty>
INJ_CHAIN_ID=<empty>
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ export CODE_ID=$(echo '39,040' | tr -dc '0-9')
echo "CODE_ID=$CODE_ID"   # => 39040
CODE_ID=39040
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ export MY_ADDR="inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w"
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ export KEYNAME="mykey"
export INJ_NODE="https://k8s.testnet.tm.injective.network:443"
export INJ_CHAIN_ID="injective-888"
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ export INIT_MSG_C=$(
  jq -nc --arg admin "$MY_ADDR" --arg fee_receiver "$MY_ADDR" '
  {
    admin: $admin,
    fee_bps: 1000,
    fee_receiver: $fee_receiver,
    review_window_secs: 2592000,
    min_text_len: 20,
    max_text_len: 2000,
    native_tip_denoms: ["inj"],
    record_policy: "StoreOnly",
    max_tip_per_tx: "999999999999999999"
  }')
echo "$INIT_MSG_C"
{"admin":"inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w","fee_bps":1000,"fee_receiver":"inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w","review_window_secs":2592000,"min_text_len":20,"max_text_len":2000,"native_tip_denoms":["inj"],"record_policy":"StoreOnly","max_tip_per_tx":"999999999999999999"}
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ TX=$(docker run --rm \
  -v ~/.injective:/home/inj/.injective \
  --entrypoint injectived \
  injective-ubuntu \
  tx wasm instantiate "$CODE_ID" "$INIT_MSG_C" \
    --label "tabelog-review-$(date +%s)" \
    --from "$KEYNAME" --admin "$MY_ADDR" \
    --home /home/inj/.injective --keyring-backend test \
    --node "$INJ_NODE" --chain-id "$INJ_CHAIN_ID" \
    --gas auto --gas-adjustment 1.5 --fees 1500000000000000inj \
    -b sync -y -o json)

# 送信結果をチェック（失敗時はここに理由が出ます）
echo "$TX" | jq .

# txhash を取り出し
HASH=$(echo "$TX" | jq -r .txhash)
echo "txhash=$HASH"
rpc error: code = Unknown desc = [reason:"instantiate wasm contract failed" metadata:{key:"ABCICode" value:"4"} metadata:{key:"Codespace" value:"wasm"}]: rpc error: code = Unknown desc = failed to execute message; message index: 0: Error parsing into type tabelog_review::msg::InstantiateMsg: unknown variant `StoreOnly`, expected one of `store_only`, `anyone`, `admin_only`: instantiate wasm contract failed [!injective!labs/wasmd@v0.53.3-inj.2/x/wasm/keeper/keeper.go:359] With gas wanted: '150000000' and gas used: '169728' : unknown request
txhash=
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ export INIT_MSG_C=$(
  jq -nc --arg admin "$MY_ADDR" --arg fee_receiver "$MY_ADDR" '
  {
    admin: $admin,
    fee_bps: 1000,
    fee_receiver: $fee_receiver,
    review_window_secs: 2592000,
    min_text_len: 20,
    max_text_len: 2000,
    native_tip_denoms: ["inj"],
    record_policy: "store_only",
    max_tip_per_tx: "999999999999999999"
  }')
echo "$INIT_MSG_C"
# admin / fee_receiver が inj1... かつ record_policy が "store_only" になっていることを確認
{"admin":"inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w","fee_bps":1000,"fee_receiver":"inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w","review_window_secs":2592000,"min_text_len":20,"max_text_len":2000,"native_tip_denoms":["inj"],"record_policy":"store_only","max_tip_per_tx":"999999999999999999"}
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ TX=$(docker run --rm \
  -v ~/.injective:/home/inj/.injective \
  --entrypoint injectived \
  injective-ubuntu \
  tx wasm instantiate "$CODE_ID" "$INIT_MSG_C" \
    --label "tabelog-review-$(date +%s)" \
    --from "$KEYNAME" --admin "$MY_ADDR" \
    --home /home/inj/.injective --keyring-backend test \
    --node "$INJ_NODE" --chain-id "$INJ_CHAIN_ID" \
    --gas auto --gas-adjustment 1.5 --fees 1500000000000000inj \
    -b sync -y -o json)

echo "$TX" | jq .
HASH=$(echo "$TX" | jq -r .txhash)
echo "txhash=$HASH"
gas estimate: 317572
{
  "height": "0",
  "txhash": "B8F9205263D87E0BF551AD1792E4C2CC1A98ECFC82E219907F82476345C4E565",
  "codespace": "",
  "code": 0,
  "data": "",
  "raw_log": "",
  "logs": [],
  "info": "",
  "gas_wanted": "0",
  "gas_used": "0",
  "tx": null,
  "timestamp": "",
  "events": []
}
txhash=B8F9205263D87E0BF551AD1792E4C2CC1A98ECFC82E219907F82476345C4E565
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ RES=$(docker run --rm injective-ubuntu \
        injectived query tx "$HASH" --node "$INJ_NODE" -o json)

# 成否のサマリ
echo "$RES" | jq -r '{code:(.code//.tx_response.code), raw_log:(.raw_log//.tx_response.raw_log)}'

# コントラクトアドレス（旧/新フォーマット両対応で抽出）
CONTRACT=$(
  echo "$RES" | jq -r '
    ((.tx_response.logs // .logs) // [])
    | .[]?.events[]?
    | select(.type=="instantiate" or .type=="wasm")
    | .attributes[]?
    | select(.key=="_contract_address" or .key=="contract_address")
    | .value' | head -n1
)
echo "CONTRACT=$CONTRACT"
{
  "code": 0,
  "raw_log": ""
}
CONTRACT=


admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ docker run --rm --entrypoint injectived injective-ubuntu \
  query wasm contract "$CONTRACT" \
  --node "$INJ_NODE" -o json | jq .
{
  "address": "inj1s337ldwtv94ttd6nst76n00vwpl4crjelv5754",
  "contract_info": {
    "code_id": "39040",
    "creator": "inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w",
    "admin": "inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w",
    "label": "tabelog-review-1763372382",
    "created": {
      "block_height": "101048321",
      "tx_index": "740701"
    },
    "ibc_port_id": "",
    "extension": null
  }
}
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ TX=$(docker run --rm -v ~/.injective:/home/inj/.injective \
  --entrypoint injectived injective-ubuntu \
  tx wasm execute "$CONTRACT" '{
    "register_store":{"store_ref":"sushi-taro","owner":null}
  }' \
  --from "$KEYNAME" \
  --home /home/inj/.injective --keyring-backend test \
  --node "$INJ_NODE" --chain-id "$INJ_CHAIN_ID" \
  --gas auto --gas-adjustment 1.5 --fees 900000000000000inj \
  -b sync -y -o json)

# 「gas estimate: ...」行を落としてから jq
JSON=$(printf '%s\n' "$TX" | sed '/^gas estimate:/d')
echo "$JSON" | jq .

HASH=$(echo "$JSON" | jq -r .txhash)
echo "txhash=$HASH"

# (任意) 成否の確認
docker run --rm --entrypoint injectived injective-ubuntu \
  query tx "$HASH" --node "$INJ_NODE" -o json \
| jq -r '{code:(.code//.tx_response.code), raw_log:(.raw_log//.tx_response.raw_log)}'
gas estimate: 247311
{
  "height": "0",
  "txhash": "7E83892290E3799ADF8B4A90678D712D7860829D7E4A472B00D0FCBB2E8B3DAF",
  "codespace": "",
  "code": 0,
  "data": "",
  "raw_log": "",
  "logs": [],
  "info": "",
  "gas_wanted": "0",
  "gas_used": "0",
  "tx": null,
  "timestamp": "",
  "events": []
}
txhash=7E83892290E3799ADF8B4A90678D712D7860829D7E4A472B00D0FCBB2E8B3DAF
{
  "code": 0,
  "raw_log": ""
}
admin-y@LAPTOP-GQE54E1E:~/tmp/hello-python/LLMBYBC/INJ_APP$ RESP=$(docker run --rm --entrypoint injectived injective-ubuntu \
  query wasm contract-state smart "$CONTRACT" \
  '{"stores":{"start_after":null,"limit":50}}' \
  --node "$INJ_NODE" -o json)

# 返り値が {data: ...} 形式でも素の JSON でも動くように吸収
STORE_ID=$(echo "$RESP" \
  | jq -r '(try (.data | fromjson) catch .)
           | .stores
           | map(select(.store_ref=="sushi-taro"))
           | .[-1].id')
echo "STORE_ID=$STORE_ID"
jq: error (at <stdin>:1): Cannot index string with string "stores"
STORE_ID=

了解です。いただいたログから、**エラーになった行を除外**し、**実行に成功したコマンドとその出力（要点）**を時系列で抜き出しました。
（`gas estimate: ...` 行は CLI の標準出力に混ざるノイズなので、出力要約では省略しています）

---

## ✅ 成功したコマンド & 出力

### 1) code_id に紐づくコントラクト一覧の取得（2コマンドとも成功）

```bash
docker run --rm injective-ubuntu \
  injectived query wasm list-contract-by-code "$CODE_ID" \
  --node "$INJ_NODE" -o json | jq -r '.contracts[]?' | nl

docker run --rm injective-ubuntu \
  injectived query wasm list-contracts-by-code "$CODE_ID" \
  --node "$INJ_NODE" -o json | jq -r '.contracts[]?' | nl
```

**出力（両方とも同じ）**

```
     1  inj1s337ldwtv94ttd6nst76n00vwpl4crjelv5754
```

---

### 2) コントラクトの config 取得（成功）

```bash
docker run --rm --entrypoint injectived injective-ubuntu \
  query wasm contract-state smart "$CONTRACT" '{"config":{}}' \
  --node "$INJ_NODE" -o json | jq .
```

**出力（要旨）**

```json
{
  "data": {
    "admin": "inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w",
    "fee_bps": 1000,
    "fee_receiver": "inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w",
    "review_window_secs": 2592000,
    "min_text_len": 20,
    "max_text_len": 2000,
    "native_tip_denoms": ["inj"],
    "record_policy": "store_only",
    "max_tip_per_tx": "999999999999999999"
  }
}
```

---

### 3) コントラクト基本情報（contract-info ではなく contract）（成功）

```bash
docker run --rm --entrypoint injectived injective-ubuntu \
  query wasm contract "$CONTRACT" \
  --node "$INJ_NODE" -o json | jq .
```

**出力（要旨）**

```json
{
  "address": "inj1s337ldwtv94ttd6nst76n00vwpl4crjelv5754",
  "contract_info": {
    "code_id": "39040",
    "creator": "inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w",
    "admin": "inj1ac05aljaxdg889cdlsmx60rfmjsykfthn6n53w",
    "label": "tabelog-review-1763372382",
    "created": { "block_height": "101048321", "tx_index": "740701" }
  }
}
```

---

### 4) 店舗登録（register_store）1回目（成功）

```bash
TX=$(docker run --rm -v ~/.injective:/home/inj/.injective \
  --entrypoint injectived injective-ubuntu \
  tx wasm execute "$CONTRACT" '{
    "register_store":{"store_ref":"sushi-taro","owner":null}
  }' \
  --from "$KEYNAME" --home /home/inj/.injective --keyring-backend test \
  --node "$INJ_NODE" --chain-id "$INJ_CHAIN_ID" \
  --gas auto --gas-adjustment 1.5 --fees 900000000000000inj \
  -b sync -y -o json)
JSON=$(printf '%s\n' "$TX" | sed '/^gas estimate:/d'); echo "$JSON" | jq .
```

**出力（要旨）**

```json
{
  "height":"0",
  "txhash":"7E83892290E3799ADF8B4A90678D712D7860829D7E4A472B00D0FCBB2E8B3DAF",
  "code":0
}
```

※ 直後の `query tx` でも `{"code":0,"raw_log":""}` を確認。

---

### 5) 店舗一覧クエリ → STORE_ID 抽出（成功）

```bash
RESP=$(docker run --rm --entrypoint injectived injective-ubuntu \
  query wasm contract-state smart "$CONTRACT" \
  '{"stores":{"start_after":null,"limit":50}}' \
  --node "$INJ_NODE" -o json)
PAYLOAD=$(echo "$RESP" | jq -rc '.data | (if type=="string" then fromjson else . end)')
echo "$PAYLOAD" | jq .
STORE_ID=$(echo "$PAYLOAD" \
  | jq -r '[.stores[] | select(.store_ref=="sushi-taro")] | .[-1].id // empty')
```

**出力（PAYLOAD 要旨 & STORE_ID）**

```json
{
  "stores": [
    {"id":1,"owner":null,"store_ref":"sushi-taro","review_window_override":null,"active":true},
    {"id":2,"owner":null,"store_ref":"sushi-taro","review_window_override":null,"active":true}
  ]
}
```

```
STORE_ID=2
```

---

### 6) 店舗登録（register_store）2回目（成功）→ その後の STORE_ID 抽出（成功）

```bash
# 実行
... (同コマンド) ...
# 出力
{
  "height":"0",
  "txhash":"3C81ED5C3D67F5EDD07E588318596424832EAE7E9D285ECDE34965BE3D424433",
  "code":0
}
# 直後の query tx: {"code":0,"raw_log":""}

# 再度 stores をクエリして抽出
STORE_ID=3
```

---

### 7) 来店記録（record_visit）（成功）→ VISIT_ID 抽出（成功）

```bash
# 実行（tx は -b sync で成功）
... (record_visit 実行) ...

# フォールバック（訪問者別一覧）で抽出
VISIT_ID=1
```

---

### 8) レビュー投稿（create_review）（成功）→ REVIEW_ID 抽出（成功）

```bash
# 実行（-b sync）
... (create_review 実行) ...

# tx から抽出
REVIEW_ID=1
```

---

### 9) 投げ銭 0.15 INJ（成功）

```bash
docker run --rm -v ~/.injective:/home/inj/.injective \
  --entrypoint injectived injective-ubuntu \
  tx wasm execute "$CONTRACT" '{
    "tip_review_native":{"review_id":'"$REVIEW_ID"'}
  }' \
  --amount 150000000000000000inj \
  --from "$KEYNAME" ... -b sync -y -o json \
  | sed '1{/^gas estimate:/d}' | jq .
```

**出力（要旨）**

```json
{
  "height":"0",
  "txhash":"F00621B3F997F124C772CCE79CCF08AE349AFA38DC8C28D2948BA982C2D3B9AE",
  "code":0
}
```

**合計の確認（成功）**

```bash
docker run --rm --entrypoint injectived injective-ubuntu \
  query wasm contract-state smart "$CONTRACT" \
  '{"tips_for_review":{"review_id":'"$REVIEW_ID"'}}' \
  --node "$INJ_NODE" -o json \
| jq -r '.data | (if type=="string" then fromjson else . end)'
```

**出力**

```json
{
  "native": [
    ["inj","150000000000000000"]
  ]
}
```

---

### 10) レビュアー出金（withdraw_tips）（成功）

```bash
docker run --rm -v ~/.injective:/home/inj/.injective \
  --entrypoint injectived injective-ubuntu \
  tx wasm execute "$CONTRACT" '{
    "withdraw_tips":{"to":null,"denom":"inj","amount":null}
  }' \
  --from "$KEYNAME" ... -b sync -y -o json | sed '1{/^gas estimate:/d}' | jq .
```

**出力（要旨）**

```json
{
  "height":"0",
  "txhash":"2676DA8A087225EBF13F1DED6AEC2532BA5A681BDADE6B601B20F890BE81CD19",
  "code":0
}
```

---

### 11) プラットフォーム手数料回収（withdraw_platform_fees）（成功）

```bash
docker run --rm -v ~/.injective:/home/inj/.injective \
  --entrypoint injectived injective-ubuntu \
  tx wasm execute "$CONTRACT" '{
    "withdraw_platform_fees":{"to":null,"denom":"inj","amount":null}
  }' \
  --from "$KEYNAME" ... -b sync -y -o json | sed '1{/^gas estimate:/d}' | jq .
```

**出力（要旨）**

```json
{
  "height":"0",
  "txhash":"9509550C595205A077E90C844AF97BB6D1C42F1F262EB9511FD2B7B8A67DB9D2",
  "code":0
}
```

---

## 🧾 補足（成功に含めていない “エラーだった行” の代表例）

* `contract-info` サブコマンド → `unknown command "contract-info" for "wasm"`
  （Injective は `query wasm contract <addr>` を使用）
* `-it ... | jq .` での `parse error: Invalid numeric literal`
  （`gas estimate:` 行が混ざるため。`sed '1{/^gas estimate:/d}'` で除去済み）
* 0.3 INJ の投げ銭 → `insufficient funds`
  （残高 0.1866 INJ < 0.3 INJ + 手数料）

---

必要であれば、この一覧を **Markdown（表形式）**や **CSV** に整形して渡すこともできます。出力の取り回し方のご希望があれば教えてください。


以下は、いただいたログから **成功したコマンドのみ** と **主要出力（抜粋）** を表にまとめたものです。

| #  | 成功コマンド（抜粋）                                                                                                                                 | 主要出力（抜粋）                                                                                                         |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| 1  | `injectived query wasm list-contract-by-code "$CODE_ID" \| jq -r '.contracts[]?' \| nl`                                                    | `1  inj1s337ldwtv94ttd6nst76n00vwpl4crjelv5754`                                                                  |
| 2  | `injectived query wasm list-contracts-by-code "$CODE_ID" \| jq -r '.contracts[]?' \| nl`                                                   | `1  inj1s337ldwtv94ttd6nst76n00vwpl4crjelv5754`                                                                  |
| 3  | `injectived query wasm contract-state smart "$CONTRACT" '{"config":{}}' \| jq .`                                                           | `admin: inj1ac05...n53w`／`fee_bps: 1000`／`record_policy: "store_only"`／`max_tip_per_tx: "999999999999999999"` ほか |
| 4  | `injectived query wasm contract "$CONTRACT" \| jq .`                                                                                       | `address: inj1s337...v5754`／`code_id: "39040"`／`admin: inj1ac05...n53w`／`label: tabelog-review-1763372382`       |
| 5  | `tx wasm execute "$CONTRACT" '{"register_store":{"store_ref":"sushi-taro","owner":null}}' ... -b sync -o json`（1回目）                        | `txhash: 7E83892290E3799ADF8B4A90678D712D7860829D7E4A472B00D0FCBB2E8B3DAF`／`code: 0`                             |
| 6  | `injectived query tx <上記txhash> \| jq '{code,raw_log}'`                                                                                    | `{"code":0,"raw_log":""}`                                                                                        |
| 7  | `injectived query wasm contract-state smart "$CONTRACT" '{"stores":{"start_after":null,"limit":50}}'` → `.data`整形後 `jq`                    | `stores: [ {id:1,"sushi-taro"}, {id:2,"sushi-taro"} ]` → `STORE_ID=2`                                            |
| 8  | `tx wasm execute "$CONTRACT" '{"register_store":{"store_ref":"sushi-taro","owner":null}}' ... -b sync -o json`（2回目）                        | `txhash: 3C81ED5C3D67F5EDD07E588318596424832EAE7E9D285ECDE34965BE3D424433`／`code: 0`                             |
| 9  | `injectived query wasm contract-state smart "$CONTRACT" '{"stores":{"start_after":null,"limit":50}}'` → `.data`整形後 `jq`                    | `STORE_ID=3`                                                                                                     |
| 10 | `tx wasm execute "$CONTRACT" '{"record_visit":{"store_id":'"$STORE_ID"',"visitor":"'"$MY_ADDR"'","visited_at":null,"memo":"dinner"}}' ...` | `VISIT_ID=1`（抽出結果）                                                                                               |
| 11 | `tx wasm execute "$CONTRACT" '{"create_review":{"visit_id":'"$VISIT_ID"',"rating":5,"title":"最高","body":"とても美味しかった"}}' ...`                | `REVIEW_ID=1`（抽出結果）                                                                                              |
| 12 | `tx wasm execute "$CONTRACT" '{"tip_review_native":{"review_id":'"$REVIEW_ID"'}}' --amount 150000000000000000inj ...`                      | `txhash: F00621B3F997F124C772CCE79CCF08AE349AFA38DC8C28D2948BA982C2D3B9AE`／`code: 0`                             |
| 13 | `injectived query wasm contract-state smart "$CONTRACT" '{"tips_for_review":{"review_id":'"$REVIEW_ID"'}}'` → `.data`整形後 `jq`              | `{"native":[["inj","150000000000000000"]]}`（= **0.15 INJ**）                                                      |
| 14 | `tx wasm execute "$CONTRACT" '{"withdraw_tips":{"to":null,"denom":"inj","amount":null}}' ...`                                              | `txhash: 2676DA8A087225EBF13F1DED6AEC2532BA5A681BDADE6B601B20F890BE81CD19`／`code: 0`                             |
| 15 | `tx wasm execute "$CONTRACT" '{"withdraw_platform_fees":{"to":null,"denom":"inj","amount":null}}' ...`                                     | `txhash: 9509550C595205A077E90C844AF97BB6D1C42F1F262EB9511FD2B7B8A67DB9D2`／`code: 0`                             |

> 注: 表では可読性のため、アドレスや txhash は省略せず記載／省略記号（…）で短縮しています。実際のログにはフル値が含まれています。
> また、`gas estimate:` 行は JSON ではないため表示から除外しています。
