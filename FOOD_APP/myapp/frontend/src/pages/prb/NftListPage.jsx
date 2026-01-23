import React, { useEffect, useState } from "react";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import Layout from "../components/Layout"; // 中央配置＋ダークモード対応レイアウト

const CONTRACT_ADDRESS =
  localStorage.getItem("customContractAddress") ||
  "neutron108p4h45tclam3j0uh44qc7g67mpncscxqgvdmqqz5lalakmkctssaul0k8";
const CHAIN_ID = "pion-1";
const RPC_ENDPOINT = "https://rpc-palvus.pion-1.ntrn.tech";

export default function NftListPage() {
    const [walletAddress, setWalletAddress] = useState("");
    const [nftList, setNftList] = useState([]);
    const [loading, setLoading] = useState(false);
  
    const connectWallet = async () => {
      if (!window.keplr) return alert("Keplr をインストールしてください");
      await window.keplr.enable(CHAIN_ID);
      const signer = window.getOfflineSigner(CHAIN_ID);
      const accounts = await signer.getAccounts();
      setWalletAddress(accounts[0].address);
    };
  
    const fetchNfts = async () => {
      if (!walletAddress) return;
      setLoading(true);
      try {
        if (!window.keplr) return alert("Keplrをインストールしてください");
        await window.keplr.enable(CHAIN_ID);
        const offlineSigner = window.getOfflineSigner(CHAIN_ID);
        // ✅ Signerを指定したクライアントを使う
        const client = await SigningCosmWasmClient.connectWithSigner(RPC_ENDPOINT, offlineSigner);
        const tokens = await client.queryContractSmart(CONTRACT_ADDRESS, {
          tokens: { owner: walletAddress },
        });
      const results = await Promise.all(
        tokens.tokens.map(async (token_id) => {
          const { token_uri, extension } = await client.queryContractSmart(CONTRACT_ADDRESS, {
            nft_info: { token_id },
          });
          return { token_id, token_uri, extension };
        })
      );
      const sorted = results.sort((a, b) => {
        const aTime = new Date(a.extension?.timestamp || 0).getTime();
        const bTime = new Date(b.extension?.timestamp || 0).getTime();
        return bTime - aTime;
      });
      setNftList(sorted.slice(0, 3));
    } catch (err) {
      console.error("NFT一覧取得エラー:", err);
      alert("NFT一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };
  
    useEffect(() => {
      if (walletAddress) fetchNfts();
    }, [walletAddress]);
  
    return (
      <Layout>
        <h1 className="text-2xl font-bold">🧾 所有NFT一覧（最新3件）</h1>
  
        <button
          onClick={connectWallet}
          className="px-4 py-2 bg-blue-600 text-white rounded mb-4"
        >
          ウォレット接続
        </button>
  
        {walletAddress && (
          <div className="text-left text-sm space-y-4 w-full">
            <p>接続アドレス: <code>{walletAddress}</code></p>
  
            {loading ? (
              <p>読み込み中...</p>
            ) : nftList.length === 0 ? (
              <p>保有しているNFTはありません。</p>
            ) : (
              <ul className="space-y-4">
                {nftList.map((nft) => (
                  <li key={nft.token_id} className="border-b border-gray-300 pb-4">
                    <p><strong>ID:</strong> {nft.token_id}</p>
  
                    {/* URIがあればリンク表示 */}
                    {nft.token_uri && (
                      <p>
                        <strong>URI:</strong>{" "}
                        <a
                          href={nft.token_uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-500 underline break-all"
                        >
                          {nft.token_uri}
                        </a>
                      </p>
                    )}
  
                    {/* URIが画像なら表示 */}
                    {nft.token_uri?.match(/\.(jpg|jpeg|png|webp|gif|svg)$/i) && (
                      <img
                        src={nft.token_uri}
                        alt={`NFT ${nft.token_id}`}
                        className="mt-2 rounded shadow max-h-48 mx-auto object-contain"
                      />
                    )}
  
                    {/* 拡張情報（extension）がある場合表示 */}
                    {nft.extension && (
                      <div className="mt-2 text-xs text-gray-500 whitespace-pre-wrap">
                        {JSON.stringify(nft.extension, null, 2)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Layout>
    );
  }