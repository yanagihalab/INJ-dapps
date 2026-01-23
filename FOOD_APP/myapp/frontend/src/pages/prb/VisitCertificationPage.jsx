import React, { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { StargateClient, GasPrice } from "@cosmjs/stargate";

const CHAIN_ID = "pion-1";
const RPC_ENDPOINT = "https://rpc-palvus.pion-1.ntrn.tech";
const CONTRACT_ADDRESS =
  localStorage.getItem("customContractAddress") ||
  "neutron108p4h45tclam3j0uh44qc7g67mpncscxqgvdmqqz5lalakmkctssaul0k8";

function VisitHistory({ walletAddress, refreshTrigger }) {
  const [history, setHistory] = useState([]);

  const fetchHistory = async () => {
    if (!walletAddress) return;
    try {
      const client = await SigningCosmWasmClient.connect(RPC_ENDPOINT);
      const tokens = await client.queryContractSmart(CONTRACT_ADDRESS, {
        tokens: { owner: walletAddress },
      });

      const result = await Promise.all(
        tokens.tokens.map(async (token_id) => {
          const info = await client.queryContractSmart(CONTRACT_ADDRESS, {
            nft_info: { token_id },
          });
          return { token_id, ...info.extension };
        })
      );

      setHistory(result);
    } catch (err) {
      console.error("履歴取得エラー:", err);
      setHistory([]);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, [walletAddress, refreshTrigger]);

  const today = new Date().toISOString().split("T")[0];
  const hasMintedToday = history.some((item) => item.timestamp?.startsWith(today));

  return (
    <div className="text-sm bg-gray-50 p-4 rounded border">
      <h2 className="font-semibold mb-2">📜 発行履歴</h2>
      {history.length === 0 ? (
        <p>履歴なし</p>
      ) : (
        <ul className="list-disc list-inside space-y-1">
          {history.map((nft) => (
            <li key={nft.token_id}>
              {nft.timestamp} - {nft.note}
            </li>
          ))}
        </ul>
      )}
      {hasMintedToday && (
        <p className="mt-2 text-red-500">※ 本日はすでに来店証明が発行されています。</p>
      )}
    </div>
  );
}

export default function VisitCertificationPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [walletInfo, setWalletInfo] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const location = useLocation();

  const connectWallet = async () => {
    try {
      if (!window.keplr) return alert("Keplr をインストールしてください。");
      await window.keplr.enable(CHAIN_ID);
      const signer = window.getOfflineSigner(CHAIN_ID);
      const accounts = await signer.getAccounts();
      const address = accounts[0].address;
      setWalletAddress(address);
      console.log("接続中アドレス:", address);

      const balanceClient = await StargateClient.connect(RPC_ENDPOINT);
      const balances = await balanceClient.getAllBalances(address);
      console.log("残高:", balances);
      setWalletInfo(balances);
    } catch (err) {
      console.error("残高取得エラー:", err);
      alert("残高の取得に失敗しました");
      setWalletInfo([]);
    }
  };

  const queryParams = new URLSearchParams(location.search);
  const lat = queryParams.get("lat");
  const lon = queryParams.get("lon");
  const timestamp = queryParams.get("timestamp");

  const untrnBalance = walletInfo?.find((b) => b.denom === "untrn");

  const handleMint = async () => {
    try {
      const signer = window.getOfflineSigner(CHAIN_ID);
      const gasPrice = GasPrice.fromString("0.025untrn");
      const client = await SigningCosmWasmClient.connectWithSigner(RPC_ENDPOINT, signer, { gasPrice });

      const now = new Date().toISOString();
      const msg = {
        mint: {
          token_id: `visit-nft-${Date.now()}`,
          owner: walletAddress,
          token_uri: "https://raw.githubusercontent.com/yanagihalab/cosmjs-vite-app-to-Prevent-Review-Bombing/main/NFT_Image.png",
          extension: {
            latitude: lat,
            longitude: lon,
            timestamp: now,
            note: "このNFTは来店証明として発行されました。",
            reviewed: false,
          },
        },
      };

      const funds = [{ denom: "untrn", amount: "10000" }];

      const tx = await client.execute(walletAddress, CONTRACT_ADDRESS, msg, "auto", "Mint Visit NFT", funds);
      alert("来店証明NFTを発行しました！\nTxHash: " + tx.transactionHash);
      
      setRefreshTrigger(prev => prev + 1); // 履歴の更新をトリガー
    } catch (err) {
      console.error("NFT発行エラー:", err);
      alert("NFTの発行に失敗しました。");
    }
  };

  return (
    <div className="p-8 space-y-6">
      <VisitHistory walletAddress={walletAddress} refreshTrigger={refreshTrigger} />
      <h1 className="text-2xl font-bold">🏪 来店証明発行ページ</h1>

      <p className="text-sm text-gray-600">
        座標: 緯度 {lat} / 経度 {lon}<br />
        タイムスタンプ: {timestamp}
      </p>

      <button
        onClick={connectWallet}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        ウォレット接続 / Connect Wallet
      </button>

      {walletAddress && (
        <>
          <div className="space-y-2">
            <p className="text-sm">アドレス: {walletAddress}</p>
            <p className="text-sm">残高:</p>
            <ul className="text-sm list-disc list-inside">
              {walletInfo === null ? (
                <li>読み込み中...</li>
              ) : walletInfo.length === 0 ? (
                <li>残高なし</li>
              ) : untrnBalance ? (
                <li>{untrnBalance.amount} {untrnBalance.denom}</li>
              ) : (
                <li>untrn残高なし</li>
              )}
            </ul>
          </div>

          <div className="space-y-4 pt-4">
            <button
              onClick={handleMint}
              className="px-4 py-2 bg-green-600 text-white rounded"
            >
              来店証明NFTを発行する / Mint Visit NFT
            </button>
          </div>
        </>
      )}
    </div>
  );
}
