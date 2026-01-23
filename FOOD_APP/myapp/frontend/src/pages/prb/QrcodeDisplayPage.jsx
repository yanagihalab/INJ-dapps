import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";

export default function QRCodeDisplayPage() {
  const [qrValue, setQrValue] = useState("");
  const [expiresIn, setExpiresIn] = useState(60);

  useEffect(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1)
      .toString()
      .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now
      .getHours()
      .toString()
      .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const lat = "36.008278";
    const lon = "138.181889";

    const query = new URLSearchParams({
      lat,
      lon,
      timestamp,
    }).toString();

    const visitCertUrl = `${window.location.origin}/visit-cert?${query}`;
    setQrValue(visitCertUrl);
    setExpiresIn(60);

    const qrInterval = setInterval(() => {
      const now = new Date();
      now.setSeconds(0, 0);
      const timestamp = `${now.getFullYear()}-${(now.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${now.getDate().toString().padStart(2, "0")} ${now
        .getHours()
        .toString()
        .padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
      const query = new URLSearchParams({ lat, lon, timestamp }).toString();
      const updatedUrl = `${window.location.origin}/visit-cert?${query}`;
      setQrValue(updatedUrl);
      setExpiresIn(60);
    }, 60000);

    const countdown = setInterval(() => {
      setExpiresIn((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(qrInterval);
      clearInterval(countdown);
    };
  }, []);

  return (
    <div className="p-8 space-y-6">
      <h1 className="text-2xl font-bold">🔳 QRコードで来店証明リンクを提供</h1>

      <p className="text-sm text-gray-600">
        このQRコードをスキャンすると来店証明発行ページ（/visit-cert）に遷移します。
        座標・タイムスタンプ付きで1分ごとに更新されます。
      </p>

      {qrValue && (
        <div className="mt-4 bg-white p-4 inline-block rounded shadow">
          <QRCode value={qrValue} size={180} />
          <p className="mt-2 text-center text-xs break-all">{qrValue}</p>
          <p className="text-center text-xs text-red-500">有効期限: {expiresIn} 秒</p>
        </div>
      )}
    </div>
  );
}
