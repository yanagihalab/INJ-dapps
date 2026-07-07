import { API } from "../api.js";
import {
  coinsFromString,
  connectInjectiveKeplr,
  executeContractWithKeplr,
} from "./keplrTx.js";

export async function executeWithKeplr({
  msg,
  amount = "",
  contract = "",
  fee = "",
  gasLimit = "500000",
  memo = "",
} = {}) {
  const cfg = await API.getConfig();
  const wallet = await connectInjectiveKeplr({
    chainId: cfg.chainId,
    rpc: cfg.injNode,
  });
  return executeContractWithKeplr({
    chainId: cfg.chainId,
    sender: wallet.address,
    pubkey: wallet.pubkey,
    contract: contract || cfg.contract,
    msg,
    funds: amount ? coinsFromString(amount) : [],
    fee: fee || cfg.defaultFees,
    gasLimit,
    memo,
  });
}
