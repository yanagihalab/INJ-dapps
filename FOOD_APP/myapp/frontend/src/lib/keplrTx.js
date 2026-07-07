import Long from "long";
import { apiPath } from "../api.js";
import {
  AuthInfo,
  Fee,
  ModeInfo,
  SignerInfo,
  SignDoc,
  TxBody,
  TxRaw,
} from "cosmjs-types/cosmos/tx/v1beta1/tx";
import { SignMode } from "cosmjs-types/cosmos/tx/signing/v1beta1/signing";
import { MsgExecuteContract } from "cosmjs-types/cosmwasm/wasm/v1/tx";
import { Any } from "cosmjs-types/google/protobuf/any";

const INJECTIVE_TESTNET_REST = "https://testnet.sentry.lcd.injective.network:443";

function utf8ToBytes(s) {
  return new TextEncoder().encode(s);
}

function base64ToBytes(b64) {
  const bin = atob(String(b64 || ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(u8) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

function ensureBytes(x, label = "bytes") {
  if (x instanceof Uint8Array) return x;
  if (typeof x === "string") return base64ToBytes(x);
  if (Array.isArray(x) && x.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return Uint8Array.from(x);
  }
  throw new Error(`Unsupported ${label} type: ${typeof x}`);
}

export function parseCoinAmount(coinStr) {
  const m = String(coinStr || "")
    .trim()
    .match(/^(\d+)([a-zA-Z0-9/:\-_.]+)$/);
  if (!m) throw new Error(`Invalid coin string: ${coinStr}`);
  return { amount: m[1], denom: m[2] };
}

export function coinsFromString(coinStr) {
  if (!String(coinStr || "").trim()) return [];
  const { amount, denom } = parseCoinAmount(coinStr);
  return [{ denom, amount }];
}

export function adminWalletAdvice(error) {
  const msg = String(error?.message || error || "");
  if (/Keplr not found/i.test(msg)) return "Keplr 拡張機能を有効にして、このページを再読み込みしてください。";
  if (/chainId is empty|rpc is empty/i.test(msg)) return "Settings で chainId と RPC endpoint を設定してください。";
  if (/not connected|pubkey|address missing/i.test(msg)) return "先に Keplr 接続を行い、接続許可を完了してください。";
  if (/wallet is not current admin/i.test(msg)) return "接続中ウォレットが contract admin と一致していません。admin アドレスのウォレットに切り替えてください。";
  if (/account_basic|account_number|sequence/i.test(msg)) return "RPC endpoint、ウォレット残高、対象チェーンのアカウント状態を確認してください。";
  if (/insufficient|fee|gas/i.test(msg)) return "ウォレット残高、fee、gas limit を確認してください。gas limit は少し大きめにしてください。";
  if (/unauthorized/i.test(msg)) return "コントラクト側で権限拒否されています。接続中 wallet が現在の admin か確認してください。";
  return "contract address、接続 wallet、RPC、fee/gas、入力値を確認してください。";
}

function encodeInjectiveEthSecp256k1PubKey(pubKeyBytes) {
  const key = pubKeyBytes instanceof Uint8Array ? pubKeyBytes : new Uint8Array(pubKeyBytes);
  const len = key.length;
  const varint = [];
  let n = len;
  while (n >= 0x80) {
    varint.push((n & 0x7f) | 0x80);
    n >>= 7;
  }
  varint.push(n);

  const out = new Uint8Array(1 + varint.length + len);
  out[0] = 0x0a;
  out.set(varint, 1);
  out.set(key, 1 + varint.length);
  return out;
}

async function fetchRpcAccountBasic(bech32Addr) {
  const r = await fetch(apiPath(`/rpc/account_basic?address=${encodeURIComponent(bech32Addr)}`));
  const js = await r.json();
  if (!r.ok || !js?.ok) throw new Error(js?.error || "rpc account_basic failed");
  return {
    accountNumber: Long.fromString(js.accountNumber, true),
    sequence: Long.fromString(js.sequence, true),
  };
}

export async function connectInjectiveKeplr({ chainId, rpc, rest = INJECTIVE_TESTNET_REST } = {}) {
  if (!window.keplr) throw new Error("Keplr not found. Install Keplr and refresh.");
  if (!chainId) throw new Error("chainId is empty");
  if (!rpc) throw new Error("rpc is empty");

  if (window.keplr.experimentalSuggestChain) {
    await window.keplr.experimentalSuggestChain({
      chainId,
      chainName: "Injective Testnet",
      rpc,
      rest,
      bip44: { coinType: 60 },
      bech32Config: {
        bech32PrefixAccAddr: "inj",
        bech32PrefixAccPub: "injpub",
        bech32PrefixValAddr: "injvaloper",
        bech32PrefixValPub: "injvaloperpub",
        bech32PrefixConsAddr: "injvalcons",
        bech32PrefixConsPub: "injvalconspub",
      },
      currencies: [{ coinDenom: "INJ", coinMinimalDenom: "inj", coinDecimals: 18 }],
      feeCurrencies: [{ coinDenom: "INJ", coinMinimalDenom: "inj", coinDecimals: 18 }],
      stakeCurrency: { coinDenom: "INJ", coinMinimalDenom: "inj", coinDecimals: 18 },
      features: ["cosmwasm"],
    });
  }

  await window.keplr.enable(chainId);
  const key = await window.keplr.getKey(chainId);
  if (!(key.pubKey instanceof Uint8Array) || key.pubKey.length !== 33) {
    throw new Error(`Keplr pubKey length invalid: ${key.pubKey?.length}`);
  }
  return {
    address: key.bech32Address,
    pubkey: key.pubKey,
  };
}

export async function executeContractWithKeplr({
  chainId,
  sender,
  pubkey,
  contract,
  msg,
  funds = [],
  fee = "1000000000000000inj",
  gasLimit = "400000",
  memo = "",
} = {}) {
  if (!chainId) throw new Error("chainId is empty");
  if (!sender) throw new Error("address missing");
  if (!pubkey) throw new Error("keplr pubkey missing");
  if (!contract) throw new Error("contract is empty");

  const { accountNumber, sequence } = await fetchRpcAccountBasic(sender);
  const executeMsg = MsgExecuteContract.fromPartial({
    sender,
    contract,
    msg: utf8ToBytes(JSON.stringify(msg)),
    funds,
  });

  const bodyBytes = TxBody.encode(
    TxBody.fromPartial({
      messages: [
        Any.fromPartial({
          typeUrl: "/cosmwasm.wasm.v1.MsgExecuteContract",
          value: MsgExecuteContract.encode(executeMsg).finish(),
        }),
      ],
      memo,
      timeoutHeight: Long.UZERO,
    })
  ).finish();

  const injPubAny = Any.fromPartial({
    typeUrl: "/injective.crypto.v1beta1.ethsecp256k1.PubKey",
    value: encodeInjectiveEthSecp256k1PubKey(pubkey),
  });

  const { amount, denom } = parseCoinAmount(fee);
  const authInfoBytes = AuthInfo.encode(
    AuthInfo.fromPartial({
      signerInfos: [
        SignerInfo.fromPartial({
          publicKey: injPubAny,
          modeInfo: ModeInfo.fromPartial({
            single: { mode: SignMode.SIGN_MODE_DIRECT },
          }),
          sequence,
        }),
      ],
      fee: Fee.fromPartial({
        amount: [{ denom, amount }],
        gasLimit: Long.fromString(String(gasLimit || "400000"), true),
      }),
    })
  ).finish();

  const signDoc = SignDoc.fromPartial({
    bodyBytes,
    authInfoBytes,
    chainId,
    accountNumber,
  });
  const signed = await window.keplr.signDirect(chainId, sender, signDoc);

  const txRaw = TxRaw.fromPartial({
    bodyBytes: ensureBytes(signed.signed.bodyBytes, "signed.bodyBytes"),
    authInfoBytes: ensureBytes(signed.signed.authInfoBytes, "signed.authInfoBytes"),
    signatures: [ensureBytes(signed.signature.signature, "signature.signature")],
  });

  const br = await fetch(apiPath("/tx/broadcast"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ txBytesBase64: bytesToBase64(TxRaw.encode(txRaw).finish()) }),
  });
  const js = await br.json();
  if (!br.ok) throw new Error(js?.error || "broadcast failed");
  if (!js.txhash) throw new Error(`broadcast ok but txhash missing: ${JSON.stringify(js).slice(0, 2000)}`);

  return {
    txhash: js.txhash,
    broadcast: js,
    debug: {
      address: sender,
      accountNumber: accountNumber.toString(),
      sequence: sequence.toString(),
      pubkeyLen: pubkey.length,
    },
  };
}
