import React, { useState } from "react";
import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import Layout from "../components/Layout";

const EXPECTED_CONTRACT_ADDRESS =
  localStorage.getItem("customContractAddress") ||
  "neutron16ge4cnp48k5ful0mmf45hrtktu52j7g9pnh3r96nfkcamrc0w2ms5pq84p";
//   "neutron1n6phzpmd7fkuns6lkfzpyxahnmn4enlt47aqzr6nhy6lv4q4wles2w6dsm";

const CHAIN_ID = "pion-1";
const RPC_ENDPOINT = "https://rpc-lb-pion.ntrn.tech:443";

export default function CheckContractNftPage() {
  const [walletAddress, setWalletAddress] = useState("");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [ownedNfts, setOwnedNfts] = useState([]);
  const [filterDays, setFilterDays] = useState(0); // 🔄 フィルターは残すが未使用

  const connectWallet = async () => {
    if (!window.keplr) return alert("Keplr をインストールしてください");
    await window.keplr.enable(CHAIN_ID);
    const signer = window.getOfflineSigner(CHAIN_ID);
    const accounts = await signer.getAccounts();
    setWalletAddress(accounts[0].address);
  };

  const checkNftOwnership = async () => {
    if (!walletAddress) return;
    setLoading(true);
    setResult(null);
    setOwnedNfts([]);

    try {
      const client = await SigningCosmWasmClient.connect(RPC_ENDPOINT);
      const response = await client.queryContractSmart(EXPECTED_CONTRACT_ADDRESS, {
        tokens: { owner: walletAddress },
      });

      const hasNft = response.tokens && response.tokens.length > 0;

      if (hasNft) {
        const details = await Promise.all(
          response.tokens.map(async (token_id) => {
            const nft = await client.queryContractSmart(EXPECTED_CONTRACT_ADDRESS, {
              nft_info: { token_id },
            });
            return { token_id, ...nft };
          })
        );

        // ✅ フィルター処理をコメントアウト
        // const now = Date.now();
        // const filterMs = filterDays > 0 ? filterDays * 24 * 60 * 60 * 1000 : null;
        // const filtered = details.filter((nft) => {
        //   const ts = nft.extension?.timestamp;
        //   if (!ts) return false;
        //   const mintedTime = new Date(ts).getTime();
        //   if (isNaN(mintedTime)) return false;
        //   return filterMs ? now - mintedTime <= filterMs : true;
        // });

        setOwnedNfts(details);
        setResult(details.length > 0);
      } else {
        setResult(false);
      }
    } catch (err) {
      console.error("NFT確認エラー:", err);
      alert("確認中にエラーが発生しました。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <h1 className="text-2xl font-bold">🧾 指定コントラクトNFT確認</h1>

      <p className="text-sm text-gray-700 dark:text-gray-300">
        このページでは、あなたのウォレットが以下のコントラクトから発行されたNFTを保有しているかどうか確認できます。
      </p>

      <div className="my-2 text-xs text-gray-500 break-all">
        <strong>対象コントラクト:</strong><br />
        <code>{EXPECTED_CONTRACT_ADDRESS}</code>
      </div>

      <button
        onClick={connectWallet}
        className="px-4 py-2 bg-blue-600 text-white rounded mt-4"
      >
        ウォレット接続
      </button>

      {walletAddress && (
        <div className="mt-4 space-y-4 text-left">
          <p>アドレス: <code>{walletAddress}</code></p>

          {/* 🔄 フィルター選択 UI は非表示またはコメントアウト */}
          {/* <div>
            <label className="text-sm mr-2">表示期間:</label>
            <select
              value={filterDays}
              onChange={(e) => setFilterDays(Number(e.target.value))}
              className="text-sm px-2 py-1 border rounded"
            >
              <option value={1}>過去1日</option>
              <option value={3}>過去3日</option>
              <option value={7}>過去7日</option>
              <option value={0}>全期間</option>
            </select>
          </div> */}

          <button
            onClick={checkNftOwnership}
            disabled={loading}
            className="px-4 py-2 bg-green-600 text-white rounded"
          >
            NFT保有確認
          </button>

          {loading && <p className="text-sm text-gray-500">確認中...</p>}

          {result === true && (
            <>
              <p className="text-green-600 font-semibold">
                ✅ このウォレットは対象のNFTを保有しています！
              </p>

              <ul className="mt-4 space-y-3 text-sm text-left">
                {ownedNfts.map((nft) => (
                  <li key={nft.token_id} className="border-b pb-3 border-gray-300">
                    <p><strong>ID:</strong> {nft.token_id}</p>
                    <p><strong>URI:</strong>{" "}
                      <a href={nft.token_uri} target="_blank" rel="noopener noreferrer"
                         className="text-blue-500 underline break-all">
                        {nft.token_uri}
                      </a>
                    </p>

                    {nft.token_uri?.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i) && (
                      <img
                        src={nft.token_uri}
                        alt={`NFT ${nft.token_id}`}
                        className="mt-2 rounded shadow max-h-48 mx-auto object-contain"
                      />
                    )}

                    {nft.extension && (
                      <div className="mt-1 text-xs text-gray-500 whitespace-pre-wrap">
                        {JSON.stringify(nft.extension, null, 2)}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {result === false && (
            <p className="text-red-600 font-semibold">
              ❌ このウォレットは対象のNFTを保有していません。
            </p>
          )}
        </div>
      )}
    </Layout>
  );
}
