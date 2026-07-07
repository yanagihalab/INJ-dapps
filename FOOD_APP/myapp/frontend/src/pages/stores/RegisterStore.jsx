import React, { useEffect, useState } from "react";
import { API } from "../../api.js";
import { useChainOptions } from "../../lib/useChainOptions.js";
import { executeWithKeplr } from "../../lib/walletExecute.js";

function textOrNull(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

const CUSTOM_VALUE = "__custom__";

const CATEGORY_OPTIONS = [
  "寿司",
  "ラーメン",
  "焼肉",
  "居酒屋",
  "和食",
  "イタリアン",
  "フレンチ",
  "中華",
  "カフェ",
  "スイーツ",
  "バー",
];

const OPENING_HOUR_OPTIONS = [
  "11:00-15:00",
  "11:30-14:00 / 17:00-22:00",
  "17:00-23:00",
  "18:00-24:00",
  "7:00-10:00 / 11:00-15:00 / 17:00-22:00",
  "24時間営業",
  "不定休",
];

const PRICE_RANGE_OPTIONS = [
  "〜1,000円",
  "1,000-2,000円",
  "2,000-4,000円",
  "4,000-8,000円",
  "8,000-12,000円",
  "12,000-20,000円",
  "20,000円〜",
  "¥",
  "¥¥",
  "¥¥¥",
  "¥¥¥¥",
];

function selectValue(value, customValue) {
  return value === CUSTOM_VALUE ? customValue : value;
}

export default function RegisterStore() {
  const [authCode, setAuthCode] = useState("");
  const [registeredStore, setRegisteredStore] = useState(null);
  const [lookupStatus, setLookupStatus] = useState("idle");
  const [lookupMessage, setLookupMessage] = useState("");
  const [category, setCategory] = useState("寿司");
  const [customCategory, setCustomCategory] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [openingHours, setOpeningHours] = useState("");
  const [customOpeningHours, setCustomOpeningHours] = useState("");
  const [priceRange, setPriceRange] = useState("");
  const [customPriceRange, setCustomPriceRange] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [description, setDescription] = useState("");
  const [owner, setOwner] = useState("");
  const [out, setOut] = useState("");
  const { cfg } = useChainOptions();
  const canEditProfile = lookupStatus === "found" && Boolean(registeredStore);

  useEffect(() => {
    const code = authCode.trim();
    setRegisteredStore(null);
    setLookupMessage("");
    if (!code) {
      setLookupStatus("idle");
      return undefined;
    }
    setLookupStatus("loading");
    const timer = window.setTimeout(async () => {
      try {
        const meta = await API.resolveStoreRegistration(code);
        setRegisteredStore({ storeRef: meta.store_ref, name: meta.name });
        setLookupStatus("found");
        setLookupMessage("認証コードに紐づく店舗情報を取得しました。");
      } catch {
        setLookupStatus("missing");
        setLookupMessage("この認証コードに紐づく店舗情報が見つかりません。adminにコード発行内容を確認してください。");
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [authCode]);

  const exec = async () => {
    if (!registeredStore?.storeRef || !registeredStore?.name) {
      setOut(JSON.stringify({
        ok: false,
        error: "認証コードから店舗 node id / store_ref と店名を取得してから登録してください。",
      }, null, 2));
      return;
    }
    const resolvedCategory = selectValue(category, customCategory);
    const resolvedOpeningHours = selectValue(openingHours, customOpeningHours);
    const resolvedPriceRange = selectValue(priceRange, customPriceRange);
    const msg = {
      register_store: {
        auth_code: authCode,
        store_ref: registeredStore.storeRef,
        name: textOrNull(registeredStore.name),
        category: textOrNull(resolvedCategory),
        address: textOrNull(address),
        phone: textOrNull(phone),
        website: textOrNull(website),
        opening_hours: textOrNull(resolvedOpeningHours),
        price_range: textOrNull(resolvedPriceRange),
        image_url: textOrNull(imageUrl),
        description: textOrNull(description),
        owner: textOrNull(owner),
      },
    };
    const r = await executeWithKeplr({ msg });
    setOut(JSON.stringify(r, null, 2));
  };

  return (
    <div className="page">
      <h2>店舗プロフィール登録</h2>
      <label>認証コード</label>
      <input
        value={authCode}
        onChange={(e) => setAuthCode(e.target.value)}
        placeholder="admin から発行されたコード"
      />
      <div className={`store-registration-lookup ${lookupStatus}`}>
        <div>
          <span>店舗 node id / store_ref</span>
          <strong>{registeredStore?.storeRef || "認証コード入力後に表示"}</strong>
        </div>
        <div>
          <span>店名</span>
          <strong>{registeredStore?.name || "認証コード入力後に表示"}</strong>
        </div>
        {lookupMessage ? <p>{lookupMessage}</p> : null}
      </div>
      <fieldset className="store-profile-fields" disabled={!canEditProfile}>
        <label>カテゴリ / ジャンル</label>
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">未選択</option>
          {CATEGORY_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
          <option value={CUSTOM_VALUE}>その他（手入力）</option>
        </select>
        {category === CUSTOM_VALUE && (
          <input
            value={customCategory}
            onChange={(e) => setCustomCategory(e.target.value)}
            placeholder="例: 天ぷら / ビストロ / ベーカリー"
          />
        )}
        <label>住所</label>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="東京都..." />
        <div className="admin-two-col">
          <div>
            <label>電話番号</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div>
            <label>Webサイト</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
        </div>
        <div className="admin-two-col">
          <div>
            <label>営業時間</label>
            <select value={openingHours} onChange={(e) => setOpeningHours(e.target.value)}>
              <option value="">未選択</option>
              {OPENING_HOUR_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value={CUSTOM_VALUE}>その他（手入力）</option>
            </select>
            {openingHours === CUSTOM_VALUE && (
              <input
                value={customOpeningHours}
                onChange={(e) => setCustomOpeningHours(e.target.value)}
                placeholder="例: 月-金 11:30-14:00 / 18:00-23:00"
              />
            )}
          </div>
          <div>
            <label>価格帯</label>
            <select value={priceRange} onChange={(e) => setPriceRange(e.target.value)}>
              <option value="">未選択</option>
              {PRICE_RANGE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
              <option value={CUSTOM_VALUE}>その他（手入力）</option>
            </select>
            {priceRange === CUSTOM_VALUE && (
              <input
                value={customPriceRange}
                onChange={(e) => setCustomPriceRange(e.target.value)}
                placeholder="例: ランチ 1,500円 / 夜 8,000円"
              />
            )}
          </div>
        </div>
        <label>画像URL</label>
        <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://..." />
        <label>説明</label>
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="お店の特徴、人気メニュー、予約時の注意など" />
        <label>店舗オーナー wallet（任意）</label>
        <select value={owner} onChange={(e) => setOwner(e.target.value)}>
          <option value="">空 → null</option>
          {cfg?.myAddr ? <option value={cfg.myAddr}>現在のアドレス: {cfg.myAddr}</option> : null}
        </select>
      </fieldset>
      <div className="toolbar">
        <button className="btn ok" disabled={!canEditProfile} onClick={exec}>店舗を登録する</button>
      </div>
      <h3>結果</h3>
      <pre className="out">{out}</pre>
    </div>
  );
}
