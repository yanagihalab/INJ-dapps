# INJ dApps

Injective testnet 上で動かす Tabelog Review dApp の実験リポジトリです。

主な構成は次の3つです。

- `FOOD_APP/contract_FOOD`: CosmWasm review/tip contract
- `FOOD_APP/myapp/backend`: local development API. Docker 経由で `injectived` を実行します
- `FOOD_APP/myapp/frontend`: React + Vite UI

## Prerequisites

- Node.js 20.19 以上、または 22.12 以上
- npm
- Rust toolchain
- Docker / Docker Compose
- `injectived` を含む Docker image
  - 既定値は `injective-ubuntu:latest`
  - 別名でビルドした場合は `FOOD_APP/myapp/.env` の `INJ_IMAGE` を変更してください

## Initial Setup

```bash
git clone https://github.com/yanagihalab/INJ-dapps.git
cd INJ-dapps

npm install --prefix FOOD_APP/myapp/backend
npm install --prefix FOOD_APP/myapp/frontend

cp FOOD_APP/myapp/.env.example FOOD_APP/myapp/.env
```

`FOOD_APP/myapp/.env` にはローカルの鍵保存先、利用する RPC、コントラクトアドレスなどを設定します。
秘密鍵やニーモニックは `.env` に書かず、`~/.injective` などの keyring 側で管理してください。

## Local Development

バックエンドとフロントエンドを別々に起動する場合:

```bash
cd FOOD_APP/myapp/backend
PORT=8787 DATA_DIR=./data npm start
```

```bash
cd FOOD_APP/myapp/frontend
VITE_BACKEND_ORIGIN=http://localhost:8787 npm run dev
```

起動後の URL:

- Frontend: http://localhost:5173
- Backend health: http://localhost:8787/api/health

`8787` が使用中の場合は、バックエンドの `PORT` とフロントエンドの `VITE_BACKEND_ORIGIN` を同じ番号に変更してください。

## Docker Compose

Compose は `FOOD_APP/myapp/.env` を使います。

```bash
cd FOOD_APP/myapp
cp .env.example .env
docker compose up --build
```

主な設定値:

- `KEYLESS_MODE`: 公開VPSでは `true` 推奨。backend のサーバー署名/keyring API を無効化
- `INJ_HOME_HOST_PATH`: ローカル/管理環境でのみ使う Injective keyring ディレクトリ。公開VPSでは空推奨
- `INJ_IMAGE`: `injectived` を含む Docker image
- `INJ_NODE`: Injective RPC endpoint
- `INJ_CHAIN_ID`: chain id
- `CONTRACT`: 利用する CosmWasm contract address
- `MY_ADDR`: UI/API で既定表示するアドレス
- `HTTP_PORT`: frontend/nginx の公開ポート
- `BACKEND_BIND`, `BACKEND_PORT`: backend の host bind。公開時は `127.0.0.1` 推奨

現在の Compose は frontend を nginx で配信し、`/api` を compose 内部の backend に proxy します。
backend の host bind は既定で `127.0.0.1:8787` です。直接インターネットへ公開しないでください。

## Sakura VPS Deployment

さくらのVPSでは、まず Docker / Docker Compose plugin / git を入れ、HTTP/HTTPS だけを公開する構成にします。

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

一度ログアウト/ログインしてから、アプリを配置します。

```bash
git clone https://github.com/yanagihalab/INJ-dapps.git
cd INJ-dapps/FOOD_APP/myapp
cp .env.example .env
```

`FOOD_APP/myapp/.env` の最低限の確認項目です。公開VPSでは `KEYLESS_MODE=true` のままにし、`INJ_HOME_HOST_PATH` / `KEYNAME` は空にしてください。

```env
HTTP_PORT=80
BACKEND_BIND=127.0.0.1
BACKEND_PORT=8787
KEYLESS_MODE=true
INJ_IMAGE=injective-ubuntu:latest
INJ_HOME_HOST_PATH=
KEYNAME=
KEYRING_BACKEND=test
MY_ADDR=
INJ_NODE=https://testnet.sentry.tm.injective.network:443
INJ_CHAIN_ID=injective-888
CODE_ID=...
CONTRACT=inj...
WASM_HOST_PATH=
```

起動:

```bash
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1/api/health
```

既存VPSへ変更を反映する場合:

```bash
cd INJ-dapps
git pull
cd FOOD_APP/myapp
grep -q '^KEYLESS_MODE=true' .env || echo 'KEYLESS_MODE=true' >> .env
docker compose up -d --build
docker compose ps
curl -f http://127.0.0.1/api/health
```

`/api/health` のレスポンスで `"keylessMode":true` と `"hasKeyPath":false` が返れば、公開サーバーに重要keyを置かない構成で動いています。

ファイアウォール例:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

独自ドメインと HTTPS を使う場合は、VPS の前段に nginx / Caddy / Certbot などを置き、`http://127.0.0.1:80` へ proxy してください。Compose の frontend nginx は `/api` を backend へ転送するため、外部公開は frontend のポートだけで足ります。

### Co-hosting with Tozan Todoke on the same VPS

既存の `Tozan Todoke` が同じさくらVPS上で動いている場合、既存サービスは以下を使用しています。

- host nginx: `80` / `443`
- Tozan frontend: `127.0.0.1:8080` へ proxy
- Tozan backend: `127.0.0.1:8788`

この店舗レビューサービスは `80` / `443` / `8080` / `8788` を避け、Compose の frontend を `127.0.0.1:8081` に出して、backend は既定の `127.0.0.1:8787` のままにします。

`FOOD_APP/myapp/.env` の共存例:

```env
HTTP_PORT=127.0.0.1:8081
BACKEND_BIND=127.0.0.1
BACKEND_PORT=8787
CORS_ORIGIN=
KEYLESS_MODE=true
INJ_HOME_HOST_PATH=
KEYNAME=
WASM_HOST_PATH=
CODE_ID=...
CONTRACT=inj...
```

この形では外部公開するのは host nginx の `80` / `443` だけです。Docker Compose の frontend/backend ポートは loopback に閉じます。

nginx は別サブドメインで振り分けるのが推奨です。例:

```nginx
server {
    listen 80;
    server_name reviews.example.com;

    location / {
        proxy_pass http://127.0.0.1:8081;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

HTTPS は既存の Certbot/nginx 運用に合わせて、`reviews.example.com` 用の証明書を追加してください。既存の `ik1-206-76937.vs.sakura.ne.jp` を Tozan Todoke が使っている場合、このサービス用には別サブドメインか別ドメインを用意するのが安全です。

共存時の起動例:

```bash
cd INJ-dapps/FOOD_APP/myapp
docker compose --project-name inj-reviews up -d --build
docker compose --project-name inj-reviews ps
curl -f http://127.0.0.1:8081/api/health
```

VPS用の具体的なテンプレートは以下にも置いています。

- `FOOD_APP/myapp/.env.vps.example`
- `FOOD_APP/myapp/deploy/VPS_DEPLOY.md`
- `FOOD_APP/myapp/deploy/nginx-inj-reviews.conf.example`

公開VPSの既定構成では `KEYLESS_MODE=true` により、backend のサーバー署名 API、デプロイ API、keyring API は無効になります。transaction はブラウザの Keplr で署名し、backend は署名済み tx の broadcast と query だけを担当します。

公開サーバーへ置かないもの:

- funded keyring
- admin keyring
- mnemonic / private key
- `~/.injective` の実鍵ディレクトリ

コントラクトの store / instantiate / migrate など、サーバー鍵が必要な作業はローカルPCや一時的な管理端末で実行し、VPS には `CONTRACT` / `CODE_ID` など公開してよい設定値だけを反映してください。

## Checks

```bash
npm audit --prefix FOOD_APP/myapp/backend
npm audit --prefix FOOD_APP/myapp/frontend
npm run build --prefix FOOD_APP/myapp/frontend
cargo test --manifest-path FOOD_APP/contract_FOOD/Cargo.toml
```

## Contract Development

コントラクトのテスト:

```bash
cargo test --manifest-path FOOD_APP/contract_FOOD/Cargo.toml
```

最適化 wasm の作成例:

```bash
cd FOOD_APP/contract_FOOD
docker run --rm -v "$(pwd)":/code \
  --mount type=volume,source="$(basename "$(pwd)")_cache",target=/target \
  --mount type=volume,source=registry_cache,target=/usr/local/cargo/registry \
  cosmwasm/optimizer:0.17.0
```

成果物は `FOOD_APP/contract_FOOD/artifacts/` に出力されます。

## Injective CLI

`cli-entrypoint.sh` は、ホストに `injectived` を直接入れず Docker image 内の CLI を使うための entrypoint です。

初回だけ実行権と改行コードを整えます。

```bash
chmod +x cli-entrypoint.sh
sed -i 's/\r$//' cli-entrypoint.sh
mkdir -p ~/.injective
```

Testnet 接続確認:

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

鍵作成:

```bash
docker run --rm -it \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  keys add mykey --keyring-backend test
```

アドレス取得:

```bash
docker run --rm -i \
  --entrypoint /usr/local/bin/entrypoint.cli.sh \
  -v "$PWD/cli-entrypoint.sh:/usr/local/bin/entrypoint.cli.sh:ro" \
  -v ~/.injective:/home/inj/.injective \
  -e INJ_NODE=https://k8s.testnet.tm.injective.network:443 \
  -e INJ_CHAIN_ID=injective-888 \
  injective-ubuntu \
  keys show mykey -a --keyring-backend test | tr -d '\r'
```

## Troubleshooting

- `injectived not found in PATH`: `cli-entrypoint.sh` をホストで直接実行している可能性があります。Docker 経由で実行してください。
- `/usr/bin/env: bash\r`: CRLF 改行です。`sed -i 's/\r$//' cli-entrypoint.sh` を実行してください。
- `invalid bech32 ... '\r'`: 変数代入や pipe では `docker run -i` を使い、必要なら `tr -d '\r'` を挟んでください。
- `post failed: connect refused`: `INJ_NODE`、`INJ_CHAIN_ID`、`INJ_IMAGE`、Docker socket の mount を確認してください。
