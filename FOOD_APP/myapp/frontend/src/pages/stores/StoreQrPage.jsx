import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { NavLink, useParams } from "react-router-dom";
import { API } from "../../api.js";

function unwrap(resp, key) {
  return resp?.json?.data?.[key] ?? resp?.data?.[key] ?? resp?.[key] ?? null;
}

function unwrapStores(resp) {
  return resp?.json?.data?.stores ?? resp?.data?.stores ?? resp?.stores ?? [];
}

export default function StoreQrPage() {
  const { storeId } = useParams();
  const [store, setStore] = useState(null);
  const [qrCode, setQrCode] = useState("");
  const [qrImage, setQrImage] = useState("");
  const [error, setError] = useState("");

  const payload = useMemo(() => {
    if (!store) return "";
    return JSON.stringify({
      node_id: store.store_ref || `store-${store.id}`,
      store_id: Number(store.id),
      code: qrCode.trim(),
    });
  }, [store, qrCode]);

  useEffect(() => {
    (async () => {
      try {
        const id = Number(storeId);
        const storeResp = await API.smart({ store: { store_id: id } }).catch(async () => {
          const list = await API.smart({ stores: { start_after: null, limit: 100 } });
          return unwrapStores(list).find((item) => Number(item.id) === id) || null;
        });
        const nextStore = unwrap(storeResp, "store") || storeResp?.json?.data || storeResp?.data || storeResp;
        if (!nextStore) throw new Error("店舗情報を取得できませんでした。");
        setStore(nextStore);
      } catch (e) {
        setError(String(e?.message || e));
      }
    })();
  }, [storeId]);

  useEffect(() => {
    if (!payload) {
      setQrImage("");
      return;
    }
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 2,
      scale: 8,
      color: {
        dark: "#182230",
        light: "#ffffff",
      },
    }).then(setQrImage).catch((e) => setError(String(e?.message || e)));
  }, [payload]);

  return (
    <div className="store-qr-page">
      <section className="store-qr-hero">
        <div>
          <span className="review-kicker">Store QR</span>
          <h1>{store?.name || store?.store_ref || `Store #${storeId}`}</h1>
          <p>店舗に掲示する来店記録用QRを作成します。QR code はadminで事前登録した値を入力してください。</p>
        </div>
        <NavLink to={`/stores/${storeId}`}>店舗詳細へ戻る</NavLink>
      </section>

      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
        </div>
      ) : null}

      <section className="store-qr-layout">
        <div className="card store-qr-form">
          <h2>QR payload</h2>
          <label>店舗 node id / store_ref</label>
          <input readOnly value={store?.store_ref || ""} />
          <label>store_id</label>
          <input readOnly value={store?.id || ""} />
          <label>QR code</label>
          <input
            value={qrCode}
            onChange={(e) => setQrCode(e.target.value)}
            placeholder="adminで登録済みのQR code"
          />
          {!qrCode.trim() ? (
            <p className="input-guide">code が空のQRは来店Txに使えません。掲示前にQR codeを入力してください。</p>
          ) : null}
          <pre className="out">{payload}</pre>
        </div>

        <div className="card store-qr-preview">
          <h2>掲示用QR</h2>
          {qrImage ? <img src={qrImage} alt="店舗掲示用QR" /> : <p className="muted">QRを生成しています。</p>}
          <div className="review-card-actions">
            {qrImage ? <a href={qrImage} download={`store-${storeId}-visit-qr.png`}>PNGを保存</a> : null}
            <NavLink to={`/visits/record?node_id=${encodeURIComponent(store?.store_ref || "")}&store_id=${store?.id || ""}`}>
              読み取り画面を開く
            </NavLink>
          </div>
        </div>
      </section>
    </div>
  );
}
