import React, { useEffect, useState } from "react";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";

const REVIEW_CONTRACT_ADDRESS = "neutron108p4h45tclam3j0uh44qc7g67mpncscxqgvdmqqz5lalakmkctssaul0k8";
const NFT_CONTRACT_ADDRESS = "neutron108p4h45tclam3j0uh44qc7g67mpncscxqgvdmqqz5lalakmkctssaul0k8";
const CHAIN_ID = "pion-1";
const RPC_ENDPOINT = "https://rpc-palvus.pion-1.ntrn.tech";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function ReviewPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [review, setReview] = useState("");
  const [eligible, setEligible] = useState(false);
  const [hasReviewed, setHasReviewed] = useState(false);
  const [txHash, setTxHash] = useState("");

  const connectWallet = async () => {
    if (!window.keplr) return alert("Keplrをインストールしてください。");
    await window.keplr.enable(CHAIN_ID);
    const signer = window.getOfflineSigner(CHAIN_ID);
    const accounts = await signer.getAccounts();
    const address = accounts[0].address;
    setWalletAddress(address);

    const client = await SigningCosmWasmClient.connect(RPC_ENDPOINT);
    try {
      const { tokens } = await client.queryContractSmart(NFT_CONTRACT_ADDRESS, {
        tokens: { owner: address },
      });
      if (!tokens || tokens.length === 0) return;

      const tokenId = tokens[0];
      const { token_uri } = await client.queryContractSmart(NFT_CONTRACT_ADDRESS, {
        nft_info: { token_id: tokenId },
      });

      const metadata = JSON.parse(token_uri);
      const mintTime = new Date(metadata.timestamp).getTime();
      const withinWeek = Date.now() - mintTime <= ONE_WEEK_MS;
      const reviewed = metadata.reviewed === true;

      setEligible(withinWeek && !reviewed);
      setHasReviewed(reviewed);
    } catch (err) {
      console.error("NFT確認エラー:", err);
    }
  };

  const submitReview = async () => {
    if (!review) return alert("レビュー内容を入力してください。");

    const signer = window.getOfflineSigner(CHAIN_ID);
    const client = await SigningCosmWasmClient.connectWithSigner(RPC_ENDPOINT, signer);
    const msg = { submit_review: { text: review } };
    const result = await client.execute(walletAddress, REVIEW_CONTRACT_ADDRESS, msg, "auto");
    setTxHash(result.transactionHash);
    alert("レビューを送信しました！");
    setEligible(false);
    setHasReviewed(true);
    setReview("");
  };

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">📝 来店レビュー投稿</h1>
      <button onClick={connectWallet} className="bg-blue-600 px-4 py-2 text-white rounded">ウォレット接続</button>
      {walletAddress && (
        <div className="mt-4 space-y-4">
          {!eligible ? (
            <p className="text-red-500">
              NFTを所有していないか、1週間を過ぎているか、すでにレビュー済みです。
              {hasReviewed && "（このNFTはすでに使用されています）"}
            </p>
          ) : (
            <>
              <textarea
                value={review}
                onChange={(e) => setReview(e.target.value)}
                placeholder="レビュー内容を入力"
                className="w-full border px-3 py-2 rounded"
                rows={4}
              />
              <button
                onClick={submitReview}
                className="bg-green-600 px-4 py-2 text-white rounded"
              >
                レビュー送信
              </button>
              {txHash && <p className="text-sm text-gray-600">TxHash: {txHash}</p>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
