cat > cli-entrypoint.sh <<'EOF'
#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'USAGE'
Injective CLI entrypoint (no local node)

USAGE:
  docker run --rm -it \
    -e NETWORK=testnet \
    -v ~/.injective:/home/inj/.injective \
    injective-ubuntu-cli \
    <subcommand> [args...]

SUBCOMMAND EXAMPLES:
  # ローカル鍵操作（ノード不要）
  keys add mykey --keyring-backend test
  keys show mykey -a --keyring-backend test

  # ネットワーク問い合わせ（--node を自動付与）
  status
  query bank balances <inj1...>

  # 送金（--node と --chain-id を自動付与）
  tx bank send mykey <recv_inj1...> 1000inj \
    --keyring-backend test \
    --gas auto --gas-adjustment 1.2 --fees 5000000000000000inj -y

ENV:
  NETWORK      : "testnet" | "mainnet" | <custom-chain-id>  (default: testnet)
  INJ_NODE     : RPC URL を直接指定したい場合に上書き
  INJ_CHAIN_ID : Chain ID を直接指定したい場合に上書き
  CLI_HOME     : /home/inj/.injective (鍵などの保存先。ホストの ~/.injective をマウント推奨)

NOTE:
  - 変数代入やパイプで出力を使うコマンドは、docker の -t を付けない（-i のみ）実行を推奨。
  - tx は手数料が不足すると失敗します。--fees 又は --gas-prices を適宜調整してください。
USAGE
}

log() { echo "[CLI] $*" >&2; }

CLI_HOME="${CLI_HOME:-/home/inj/.injective}"
NETWORK="${NETWORK:-testnet}"

set_defaults_for_network() {
  case "${NETWORK}" in
    mainnet)
      : "${INJ_NODE:=https://sentry.tm.injective.network:443}"
      : "${INJ_CHAIN_ID:=injective-1}"
      ;;
    testnet|"")
      : "${INJ_NODE:=https://k8s.testnet.tm.injective.network:443}"
      : "${INJ_CHAIN_ID:=injective-888}"
      ;;
    *)
      : "${INJ_CHAIN_ID:=${NETWORK}}"
      if [ -z "${INJ_NODE:-}" ]; then
        log "NETWORK='${NETWORK}' 用の INJ_NODE が未指定です。-e INJ_NODE=... を設定してください。"
        exit 2
      fi
      ;;
  esac
}

command -v injectived >/dev/null 2>&1 || {
  echo "injectived not found in PATH" >&2; exit 127;
}

mkdir -p "${CLI_HOME}"

if [ $# -eq 0 ] || [[ "${1:-}" =~ ^(-h|--help|help)$ ]]; then
  usage; exit 0
fi

set_defaults_for_network

SUB="$1"; shift || true
if [ "${SUB}" = "injectived" ]; then
  exec injectived "$@"
fi

case "${SUB}" in
  keys|config|version|completion|debug|tendermint|unsafe-reset-all|rollback)
    exec injectived --home "${CLI_HOME}" "${SUB}" "$@"
    ;;
esac

case "${SUB}" in
  query|q|status)
    exec injectived --home "${CLI_HOME}" "${SUB}" "$@" --node "${INJ_NODE}"
    ;;
esac

if [ "${SUB}" = "tx" ]; then
  exec injectived --home "${CLI_HOME}" "${SUB}" "$@" --node "${INJ_NODE}" --chain-id "${INJ_CHAIN_ID}"
fi

exec injectived --home "${CLI_HOME}" "${SUB}" "$@"
EOF

chmod +x cli-entrypoint.sh
# （Windowsで作成した場合は）行末LF化:  sed -i 's/\r$//' cli-entrypoint.sh
