import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

const ADMIN_ADDRESS = "neutron1ahx6kfl8x9ay8p09k7jgltkywatm8qvxfrguvd";

export default function ContractAddressUpdater() {
  const [newAddress, setNewAddress] = useState("");
  const [savedAddress, setSavedAddress] = useState(null);
  const [walletAddress, setWalletAddress] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const checkAdmin = async () => {
      if (!window.keplr) return alert("Keplr をインストールしてください / Please install Keplr");
      await window.keplr.enable("pion-1");
      const signer = window.getOfflineSigner("pion-1");
      const accounts = await signer.getAccounts();
      const addr = accounts[0].address;
      setWalletAddress(addr);
      if (addr !== ADMIN_ADDRESS) {
        alert("このページには管理者のみアクセスできます / Admin only");
        navigate("/");
      }
    };
    checkAdmin();
  }, []);

  const handleSave = () => {
    if (!newAddress.startsWith("neutron1") || newAddress.length < 40) {
      alert("有効なNeutronアドレスを入力してください / Please enter a valid Neutron address.");
      return;
    }
    localStorage.setItem("customContractAddress", newAddress);
    setSavedAddress(newAddress);
    alert("保存しました！ / Address saved!");
  };

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">⚙️ スマートコントラクトアドレス更新 / Update Contract Address</h1>

      <input
        type="text"
        value={newAddress}
        onChange={(e) => setNewAddress(e.target.value)}
        placeholder="neutron1..."
        className="w-full border px-3 py-2 rounded"
      />

      <button
        onClick={handleSave}
        className="px-4 py-2 bg-green-600 text-white rounded"
      >
        保存 / Save
      </button>

      {savedAddress && (
        <div className="text-sm text-gray-600">
          現在の保存済みアドレス：<br />
          <code>{savedAddress}</code>
        </div>
      )}
    </div>
  );
}
