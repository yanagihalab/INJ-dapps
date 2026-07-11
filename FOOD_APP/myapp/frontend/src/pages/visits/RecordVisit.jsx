import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../../api.js";
import { executeWithKeplr } from "../../lib/walletExecute.js";

const j = (v) => JSON.stringify(v, null, 2);
const getLS = (k, d = null) => {
  try {
    const x = localStorage.getItem(k);
    return x ? JSON.parse(x) : d;
  } catch {
    return d;
  }
};
const setLS = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};
const MEMO_OPTIONS = ["lunch", "dinner", "cafe", "takeout", "web-test visit"];
const STORE_ID_KEYS = ["store_id", "storeId", "sid", "store"];
const STORE_REF_KEYS = [
  "node_id",
  "nodeId",
  "qr_node_id",
  "qrNodeId",
  "store_node_id",
  "storeNodeId",
  "store_ref",
  "storeRef",
  "ref",
];
const QR_CODE_KEYS = ["code", "qr_code", "qrCode", "qr", "token"];

// TX logs から属性抽出（visit_id など）
function findAttrInTx(txJson, key) {
  const logs = txJson?.logs || txJson?.tx_response?.logs || [];
  for (const log of logs)
    for (const ev of log.events || [])
      for (const at of ev.attributes || [])
        if (at.key === key) return at.value;
  return null;
}

// bank/balances のレスポンスから balances 配列を抜き出す
function extractBalances(balResult) {
  if (!balResult) return [];

  const root = balResult.json ?? balResult.data ?? balResult;

  if (Array.isArray(root?.balances)) return root.balances;
  if (Array.isArray(root?.data?.balances)) return root.data.balances;
  if (Array.isArray(balResult?.balances)) return balResult.balances;

  return [];
}

function firstParam(params, keys) {
  for (const key of keys) {
    const value = params.get(key);
    if (value) return value.trim();
  }
  return "";
}

function findStoreByRef(stores, ref) {
  const needle = String(ref || "").trim().toLowerCase();
  if (!needle) return null;
  return (
    stores.find(
      (store) =>
        String(store.node_id || "").trim().toLowerCase() === needle ||
        String(store.nodeId || "").trim().toLowerCase() === needle ||
        String(store.store_ref || "").trim().toLowerCase() === needle ||
        String(store.name || "").trim().toLowerCase() === needle
    ) || null
  );
}

function findStoreById(stores, id) {
  const numeric = Number(id);
  if (!numeric || Number.isNaN(numeric)) return null;
  return stores.find((store) => Number(store.id) === numeric) || null;
}

function parseQrPayload(rawValue, stores) {
  const raw = String(rawValue || "").trim();
  if (!raw) return { code: "", storeId: "", store: null, source: "" };

  const resolveStore = ({ storeId = "", storeRef = "", source = "" }) => {
    const byId = findStoreById(stores, storeId);
    if (byId) return { storeId: String(byId.id), store: byId, source };
    const byRef = findStoreByRef(stores, storeRef);
    if (byRef) return { storeId: String(byRef.id), store: byRef, source };
    return { storeId: storeId ? String(storeId) : "", store: null, source };
  };

  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) {
      const storeId = STORE_ID_KEYS.map((key) => obj[key]).find(Boolean);
      const storeRef = STORE_REF_KEYS.map((key) => obj[key]).find(Boolean);
      const code = QR_CODE_KEYS.map((key) => obj[key]).find(Boolean);
      const resolved = resolveStore({ storeId, storeRef, source: "QR内のJSON" });
      return {
        code: String(code || raw).trim(),
        ...resolved,
      };
    }
  } catch {}

  try {
    const url = new URL(raw);
    const storeId = firstParam(url.searchParams, STORE_ID_KEYS);
    const storeRef = firstParam(url.searchParams, STORE_REF_KEYS);
    const code = firstParam(url.searchParams, QR_CODE_KEYS);
    const resolved = resolveStore({ storeId, storeRef, source: "QR内のURL" });
    return {
      code: String(code || raw).trim(),
      ...resolved,
    };
  } catch {}

  const storeIdMatch = raw.match(/(?:store_id|storeId|sid|store)[:=]([0-9]+)/i);
  const storeRefMatch = raw.match(
    /(?:node_id|nodeId|qr_node_id|qrNodeId|store_node_id|storeNodeId|store_ref|storeRef|ref)[:=]([a-zA-Z0-9_.:-]+)/i
  );
  const codeMatch = raw.match(/(?:qr_code|qrCode|code|qr|token)[:=]([^|,\s]+)/i);
  const resolved = resolveStore({
    storeId: storeIdMatch?.[1] || "",
    storeRef: storeRefMatch?.[1] || raw,
    source: "QR内の文字列",
  });
  return {
    code: String(codeMatch?.[1] || raw).trim(),
    ...resolved,
  };
}

export default function RecordVisit() {
  const nav = useNavigate();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanTimerRef = useRef(null);

  // ---- 設定 / 署名者（= 現在の KEYNAME） ----
  const [cfg, setCfg] = useState(null);
  const [signerName, setSignerName] = useState("");
  const [signerAddr, setSignerAddr] = useState("");
  const [signerBal, setSignerBal] = useState(null);
  const [signerInfoOut, setSignerInfoOut] = useState("");

  // ---- 店舗 ----
  const [stores, setStores] = useState([]);
  const [storeId, setStoreId] = useState("");

  // ---- 入力 ----
  const [qrCode, setQrCode] = useState("");
  const [memo, setMemo] = useState(getLS("ctx.lastVisitMemo", "dinner"));
  const [autoJump, setAutoJump] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanStatus, setScanStatus] = useState("");
  const [qrStoreStatus, setQrStoreStatus] = useState("");

  // ---- 出力 / 最近の visit ----
  const [outExec, setOutExec] = useState("");
  const [outTx, setOutTx] = useState("");
  const [recent, setRecent] = useState([]);

  // 初期化
  useEffect(() => {
    (async () => {
      const c = await API.getConfig();
      setCfg(c);
      setSignerName(c?.keyname || "");
      setSignerAddr(c?.myAddr || "");
      // 残高
      if (c?.myAddr) {
        try {
          const b = await API.balance(c.myAddr);
          setSignerBal(b);
        } catch (e) {
          setSignerBal({ error: String(e) });
        }
      }

      // 店舗一覧
      try {
        const r = await API.stores();
        setStores(r?.json?.data?.stores ?? []);
      } catch {}

      // 最近の来店（自分）
      if (c?.myAddr) reloadRecent(c.myAddr);
    })();

    return () => stopQrScanner(false);
  }, []);

  useEffect(() => {
    if (!stores.length || !qrCode.trim()) return;
    const parsed = parseQrPayload(qrCode, stores);
    if (parsed.storeId && parsed.storeId !== String(storeId || "")) {
      setStoreId(parsed.storeId);
      setLS("ctx.storeId", parsed.storeId);
      setQrStoreStatus(
        parsed.store
          ? `${parsed.source}から ${parsed.store.name || `Store #${parsed.store.id}`} を取得しました。`
          : `${parsed.source}から store_id=${parsed.storeId} を取得しました。`
      );
    }
  }, [stores]);

  function stopQrScanner(updateState = true) {
    if (scanTimerRef.current) {
      clearTimeout(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (updateState) setScanning(false);
  }

  async function startQrScanner() {
    setScanStatus("");
    if (!("BarcodeDetector" in window)) {
      setScanStatus("このブラウザはQR読み取りに未対応です。店舗に表示されたQRコードの文字列を手入力してください。");
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setScanStatus("カメラを利用できません。QRコードの文字列を手入力してください。");
      return;
    }

    try {
      stopQrScanner();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current = stream;
      setScanning(true);
      setScanStatus("店舗に表示されている一意のQRコードをカメラに映してください。");

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
      const scan = async () => {
        try {
          const video = videoRef.current;
          if (!video || !streamRef.current) return;
          const codes = await detector.detect(video);
          const value = codes?.[0]?.rawValue || "";
          if (value) {
            handleQrValue(value, "camera");
            stopQrScanner();
            return;
          }
          scanTimerRef.current = setTimeout(scan, 700);
        } catch (e) {
          setScanStatus(`QR読み取りに失敗しました: ${String(e?.message || e)}`);
          stopQrScanner();
        }
      };
      scanTimerRef.current = setTimeout(scan, 500);
    } catch (e) {
      setScanStatus(`カメラを開始できませんでした: ${String(e?.message || e)}`);
      stopQrScanner();
    }
  }

  function handleQrValue(value, source = "manual") {
    const parsed = parseQrPayload(value, stores);
    setQrCode(parsed.code);

    if (parsed.storeId) {
      setStoreId(parsed.storeId);
      setLS("ctx.storeId", parsed.storeId);
      setQrStoreStatus(
        parsed.store
          ? `${parsed.source}から ${parsed.store.name || `Store #${parsed.store.id}`} を取得しました。`
          : `${parsed.source}から store_id=${parsed.storeId} を取得しました。`
      );
      setScanStatus(
        source === "camera"
          ? "QRコードを読み取り、店舗情報も取得しました。このまま来店を記録できます。"
          : "QRコードから店舗情報を取得しました。"
      );
    } else {
      setQrStoreStatus("このQRコードから店舗情報は取得できませんでした。店舗を選択してください。");
      setScanStatus(
        source === "camera"
          ? "QRコードを読み取りました。店舗情報が含まれていないため、店舗を選択してください。"
          : ""
      );
    }
  }

  async function reloadRecent(addr) {
    try {
      const r = await API.smart({
        visits_by_visitor: { visitor: addr, start_after: null, limit: 20 },
      });
      setRecent(r?.json?.data?.visits || []);
    } catch {
      setRecent([]);
    }
  }

  const selectedStore = useMemo(
    () => stores.find((s) => Number(s.id) === Number(storeId)) || null,
    [stores, storeId]
  );

  // 署名者の情報を読み直し
  async function refreshSignerInfo() {
    const c = await API.getConfig();
    setSignerName(c?.keyname || "");
    setSignerAddr(c?.myAddr || "");
    try {
      const b = await API.balance(c?.myAddr || "");
      setSignerBal(b);
    } catch (e) {
      setSignerBal({ error: String(e) });
    }
    setSignerInfoOut(j(c));
  }

  // 実行
  async function exec() {
    setOutExec("");
    setOutTx("");

    // store の存在 / active チェック（分かりやすい前検証）
    const sid = Number(storeId);
    if (!sid || Number.isNaN(sid)) {
      setOutExec("store_id が無効です");
      return;
    }
    const st = stores.find((s) => Number(s.id) === sid);
    if (!st) {
      setOutExec(j({ error: "指定した store_id が存在しません" }));
      return;
    }
    if (st && st.active === false) {
      setOutExec(j({ error: "指定した店舗は非アクティブです" }));
      return;
    }

    const code = qrCode.trim();
    if (!code) {
      setOutExec(j({ error: "QR code を入力してください" }));
      return;
    }

    const msg = {
      record_visit_by_qr: {
        store_id: sid,
        code,
        memo: memo || null,
      },
    };

    try {
      const r = await executeWithKeplr({ msg });
      setOutExec(j(r));

      const txh = r?.txhash || r?.json?.txhash || r?.tx_response?.txhash;
      if (txh) {
        const t = await API.tx(txh);
        setOutTx(j(t));
        const vid = findAttrInTx(t?.json || t, "visit_id");
        if (vid) {
          setLS("ctx.visitId", Number(vid));
          setLS("ctx.lastVisitMemo", memo || "");
          alert(`VISIT_ID=${vid} を保存しました。`);
          if (autoJump) nav("/reviews/create");
        }
      }
      if (signerAddr) reloadRecent(signerAddr);
    } catch (e) {
      const msg = String(e);
      let hint = null;

      if (
        /account.*not\s*found/i.test(msg) ||
        /NotFound desc.*account/i.test(msg)
      ) {
        hint =
          "Keplrで接続中のウォレットが未作成/未資金です。そのアドレスへ少額 INJ を送金してください。";
      } else if (/qr not provisioned/i.test(msg)) {
        hint =
          "この QR code の commit が未登録です。店舗オーナーまたは admin が sha256(code) を provision_qr_commits で事前登録してください。";
      } else if (/qr already used/i.test(msg)) {
        hint = "この QR code はすでに使用済みです。別の QR code を利用してください。";
      } else if (/forbidden/i.test(msg) || /unauthorized/i.test(msg)) {
        hint =
          "署名者や店舗の状態を確認してください。QR 来店記録では visitor は送信者になります。";
      }

      setOutExec(j({ error: msg, hint }));
    }
  }

  return (
    <div className="page visit-record-page">
      <section className="visit-flow-hero">
        <p className="eyebrow">Visit check-in</p>
        <h2>店舗のQRコードで来店記録</h2>
        <p className="muted">
          QRコードに含まれる node id を読み取り、来店店舗を自動で取得します。
        </p>
      </section>

      <div className="visit-stepper">
        <div className={`visit-step ${qrCode ? "done" : "pending"}`}>
          <span>1</span>
          <strong>QRを読み取る</strong>
        </div>
        <div className={`visit-step ${qrCode && storeId ? "done" : "pending"}`}>
          <span>2</span>
          <strong>来店を記録</strong>
        </div>
      </div>

      <div className={`visit-next-action ${storeId && qrCode.trim() ? "ready" : "pending"}`}>
        <strong>{storeId && qrCode.trim() ? "次の操作: 来店Txを送信" : "次の操作: 店舗QRを読み取る"}</strong>
        <span>
          {storeId && qrCode.trim()
            ? "店舗情報を確認できました。Keplrで署名して来店を記録してください。"
            : "店舗に掲示されたQRをカメラで読み取ると、店舗確認と送信ボタンが有効になります。"}
        </span>
      </div>

      <div className="visit-record-layout">
        <section className="card visit-main-card">
          <div className="visit-card-header">
            <div>
              <p className="eyebrow">Step 1</p>
              <h3>QRコード</h3>
            </div>
            {qrCode ? (
              <span className="visit-status-pill">対応済み</span>
            ) : (
              <span className="visit-status-pill muted-pill">未対応中</span>
            )}
          </div>

          <div className="qr-scan-panel">
            <video
              ref={videoRef}
              muted
              playsInline
              className="qr-scan-video"
              style={{ display: scanning ? "block" : "none" }}
            />
            <button
              className="btn"
              type="button"
              disabled={scanning}
              onClick={startQrScanner}
            >
              カメラでQRを読み取る
            </button>
            {scanning ? (
              <button
                className="btn secondary"
                type="button"
                onClick={stopQrScanner}
              >
                読み取り停止
              </button>
            ) : null}
            {scanStatus ? <p className="muted">{scanStatus}</p> : null}
          </div>

          <details className="visit-details">
            <summary>カメラが使えない場合は手入力</summary>
            <label>QRコード</label>
            <input
              value={qrCode}
              onChange={(e) => handleQrValue(e.target.value, "manual")}
              placeholder='例: {"node_id":"store-ref-001","code":"QR-..."}'
              style={{ fontFamily: "monospace" }}
            />
          </details>

          <div className="visit-store-confirm">
            <div className="visit-card-header">
              <div>
                <p className="eyebrow">Detected store</p>
                <h3>読み取った店舗</h3>
              </div>
              {selectedStore ? (
                <span className="visit-status-pill">対応済み</span>
              ) : (
                <span className="visit-status-pill muted-pill">未対応中</span>
              )}
            </div>

            {selectedStore ? (
              <div className="visit-selected-store">
                <strong>{selectedStore.name || `Store #${selectedStore.id}`}</strong>
                <span>{selectedStore.category || "カテゴリ未設定"}</span>
                <span>{selectedStore.address || "住所未設定"}</span>
              </div>
            ) : (
              <p className="input-guide">
                QRコードに含まれる node id から店舗を取得します。
              </p>
            )}
            {qrStoreStatus ? <p className="input-guide">{qrStoreStatus}</p> : null}
          </div>
        </section>

        <section className="card visit-main-card">
          <div className="visit-card-header">
            <div>
              <p className="eyebrow">Step 2</p>
              <h3>記録する</h3>
            </div>
          </div>

          <label>来店シーン</label>
          <select value={memo} onChange={(e) => setMemo(e.target.value)}>
            {MEMO_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          <label>記録後</label>
          <select
            value={autoJump ? "true" : "false"}
            onChange={(e) => setAutoJump(e.target.value === "true")}
          >
            <option value="true">レビュー作成ページへ移動</option>
            <option value="false">このページに残る</option>
          </select>

          <button
            className="btn ok visit-submit"
            onClick={exec}
            disabled={!storeId || !qrCode.trim()}
          >
            来店を記録する
          </button>

          {!storeId || !qrCode.trim() ? (
            <p className="input-guide">QR読み取りと店舗取得が完了すると送信できます。</p>
          ) : null}

          {outExec ? (
            <div className="visit-result">
              <strong>{outExec.includes("\"error\"") ? "記録できませんでした" : "送信しました"}</strong>
              <pre className="out">{outExec}</pre>
            </div>
          ) : null}

          {outTx ? (
            <details className="visit-details">
              <summary>Tx詳細を表示</summary>
              <pre className="out">{outTx}</pre>
            </details>
          ) : null}
        </section>
      </div>

      <details className="card visit-advanced">
        <summary>詳細設定と履歴</summary>

        <div className="visit-advanced-grid">
          <div>
            <h3>接続設定</h3>
            <label>KEYNAME（keyless公開では未使用）</label>
            <input value={signerName} readOnly />
            <label>既定ADDRESS（keyless公開ではKeplrを使用）</label>
            <input value={signerAddr} readOnly style={{ fontFamily: "monospace" }} />
            <label>残高</label>
            <input
              readOnly
              value={
                signerBal?.error
                  ? `ERROR: ${signerBal.error}`
                  : (() => {
                      const coins = extractBalances(signerBal);
                      const inj = coins.find(
                        (c) => (c.denom || "").toLowerCase() === "inj"
                      );
                      return inj ? `${inj.amount} inj` : "(inj 残高なし)";
                    })()
              }
            />
            <div className="toolbar">
              <button className="btn" onClick={refreshSignerInfo}>
                再読込
              </button>
              <button className="btn secondary" onClick={() => nav("/settings")}>
                設定
              </button>
            </div>
          </div>

          <div>
            <h3>最近の来店</h3>
            <button className="btn secondary" onClick={() => reloadRecent(signerAddr)}>
              履歴を再読込
            </button>
            <div className="visit-history-list">
              {recent.map((v) => (
                <div className="visit-history-item" key={v.id}>
                  <div>
                    <strong>Visit #{v.id}</strong>
                    <span>Store #{v.store_id} / {v.memo || "memoなし"}</span>
                  </div>
                  <button
                    className="btn"
                    onClick={() => {
                      setLS("ctx.visitId", v.id);
                      nav("/reviews/create");
                    }}
                  >
                    レビュー作成
                  </button>
                </div>
              ))}
              {recent.length === 0 ? <p className="muted">来店履歴がありません。</p> : null}
            </div>
          </div>
        </div>

        <details className="visit-details">
          <summary>デバッグ情報</summary>
          <pre className="out">{signerInfoOut || j(cfg || {})}</pre>
          <pre className="out">{j(signerBal || {})}</pre>
        </details>
      </details>
    </div>
  );
}
