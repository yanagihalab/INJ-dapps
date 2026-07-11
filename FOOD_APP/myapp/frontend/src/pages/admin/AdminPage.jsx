import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { API, getAdminApiToken, setAdminApiToken } from "../../api.js";
import {
  adminWalletAdvice,
  connectInjectiveKeplr,
  executeContractWithKeplr,
} from "../../lib/keplrTx.js";
import {
  FEE_BPS_OPTIONS,
  REVIEW_WINDOW_OPTIONS,
  storeLabel,
  TEXT_LIMIT_OPTIONS,
  TIP_AMOUNT_OPTIONS,
} from "../../lib/useChainOptions.js";

function pretty(value) {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

function unwrapSmart(resp) {
  return resp?.json?.data ?? resp?.data ?? resp?.json ?? resp;
}

function auditTargetFromMsg(msg) {
  const key = Object.keys(msg || {})[0] || "";
  const body = msg?.[key] || {};
  return {
    type: key,
    store_id: body.store_id ?? null,
    review_id: body.review_id ?? null,
    visit_id: body.visit_id ?? null,
  };
}

function numberOrNull(value) {
  const text = String(value ?? "").trim();
  return text === "" ? null : Number(text);
}

function textOrNull(value) {
  const text = String(value ?? "").trim();
  return text === "" ? null : text;
}

function sameAddress(a, b) {
  return String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
}

function normalizeConfigValue(value) {
  if (Array.isArray(value)) return value.join(",");
  if (value == null) return "";
  return String(value);
}

function displayConfigValue(value) {
  const normalized = normalizeConfigValue(value);
  return normalized === "" ? "未設定" : normalized;
}

function bytesToBase64(u8) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) {
    bin += String.fromCharCode(...u8.subarray(i, i + chunk));
  }
  return btoa(bin);
}

async function sha256Base64(text) {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToBase64(new Uint8Array(hash));
}

function randomRegistrationCode() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const token = Array.from(bytes, (byte) => byte.toString(36).padStart(2, "0"))
    .join("")
    .slice(0, 12)
    .toUpperCase();
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `STORE-${y}${m}${d}-${token}`;
}

function authLabel({ contract, current, walletAddress }) {
  if (!contract) return "contract 未設定";
  if (!current?.admin) return "admin 未取得";
  if (!walletAddress) return "wallet 未接続";
  return sameAddress(walletAddress, current.admin) ? "admin 認証済み" : "admin 不一致";
}

function formatTime(value) {
  if (value == null || value === "") return "";
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  const ms = n > 10_000_000_000 ? n / 1_000_000 : n * 1000;
  return new Date(ms).toLocaleString("ja-JP");
}

function shortAddress(addr) {
  const value = String(addr || "");
  if (value.length <= 18) return value || "未設定";
  return `${value.slice(0, 10)}...${value.slice(-6)}`;
}

export default function AdminPage() {
  const [contract, setContract] = useState("");
  const [chainId, setChainId] = useState("");
  const [rpc, setRpc] = useState("");
  const [defaultFees, setDefaultFees] = useState("1000000000000000inj");
  const [gasLimit, setGasLimit] = useState("400000");
  const [current, setCurrent] = useState(null);
  const [stores, setStores] = useState([]);
  const [form, setForm] = useState({
    admin: "",
    feeReceiver: "",
    feeBps: "",
    reviewWindowSecs: "",
    minTextLen: "",
    maxTextLen: "",
    nativeTipDenoms: "inj",
    recordPolicy: "store_owner_or_admin",
    maxTipPerTx: "",
  });
  const [storeOps, setStoreOps] = useState({
    storeId: "",
    active: "true",
    reviewWindowSecs: "",
  });
  const [storeEdit, setStoreEdit] = useState({
    storeId: "",
    storeRef: "",
    name: "",
    category: "",
    address: "",
    phone: "",
    website: "",
    openingHours: "",
    priceRange: "",
    imageUrl: "",
    description: "",
    owner: "",
  });
  const [registrationCodeOps, setRegistrationCodeOps] = useState(() => ({
    code: randomRegistrationCode(),
    storeRef: "",
    name: "",
  }));
  const [qrOps, setQrOps] = useState({
    storeId: "",
    codes: "",
  });
  const [reviewOps, setReviewOps] = useState({
    rows: [],
    reviewId: "",
    rating: "",
    title: "",
    body: "",
  });
  const [visitOps, setVisitOps] = useState({
    storeId: "",
    visitor: "",
    rows: [],
    visitId: "",
  });
  const [wallet, setWallet] = useState({
    connected: false,
    address: "",
    pubkey: null,
  });
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState("");
  const [error, setError] = useState("");
  const [advice, setAdvice] = useState("");
  const [activeTab, setActiveTab] = useState("settings");
  const [adminApiToken, setAdminApiTokenState] = useState(() => getAdminApiToken());

  const walletIsAdmin = useMemo(
    () => Boolean(current?.admin && wallet.address && sameAddress(wallet.address, current.admin)),
    [current?.admin, wallet.address]
  );

  const canAdminExecute = Boolean(contract && wallet.connected && walletIsAdmin);
  const hasAdminApiToken = Boolean(adminApiToken.trim());
  const adminTabs = [
    { id: "settings", label: "設定変更" },
    { id: "stores", label: "店舗編集" },
    { id: "codes", label: "登録コード" },
    { id: "qr", label: "来店QR" },
    { id: "reviews", label: "口コミ管理" },
    { id: "visits", label: "来店管理" },
    { id: "result", label: "実行結果" },
  ];
  const statusText = authLabel({ contract, current, walletAddress: wallet.address });
  const statusClass = walletIsAdmin ? "ok" : wallet.address ? "warn" : "idle";
  const adminGateTitle = walletIsAdmin
    ? "管理者としてログイン済み"
    : wallet.address
      ? "このウォレットは管理者ではありません"
      : "Keplrで管理者確認";
  const adminGateText = walletIsAdmin
    ? "このKeplrウォレットで運営管理操作を実行できます。"
    : wallet.address
      ? "Keplrの接続先ウォレットを contract admin に切り替えてください。"
      : "Keplrを接続すると、現在のウォレットと contract admin を照合します。";
  const selectedStoreForEdit = useMemo(
    () => stores.find((store) => Number(store.id) === Number(storeEdit.storeId)) || null,
    [stores, storeEdit.storeId]
  );
  const filteredVisits = useMemo(() => {
    const visitor = visitOps.visitor.trim().toLowerCase();
    if (!visitor) return visitOps.rows;
    return visitOps.rows.filter((visit) => String(visit.visitor || "").toLowerCase().includes(visitor));
  }, [visitOps.rows, visitOps.visitor]);
  const configRows = useMemo(() => {
    const rows = [
      { key: "admin", label: "admin", before: current?.admin, after: form.admin },
      { key: "fee_receiver", label: "fee_receiver", before: current?.fee_receiver, after: form.feeReceiver },
      { key: "fee_bps", label: "fee_bps", before: current?.fee_bps, after: form.feeBps },
      {
        key: "review_window_secs",
        label: "review_window_secs",
        before: current?.review_window_secs,
        after: form.reviewWindowSecs,
      },
      { key: "min_text_len", label: "min_text_len", before: current?.min_text_len, after: form.minTextLen },
      { key: "max_text_len", label: "max_text_len", before: current?.max_text_len, after: form.maxTextLen },
      {
        key: "native_tip_denoms",
        label: "native_tip_denoms",
        before: current?.native_tip_denoms,
        after: form.nativeTipDenoms,
      },
      { key: "record_policy", label: "record_policy", before: current?.record_policy, after: form.recordPolicy },
      { key: "max_tip_per_tx", label: "max_tip_per_tx", before: current?.max_tip_per_tx, after: form.maxTipPerTx },
    ];
    return rows.map((row) => {
      const before = normalizeConfigValue(row.before);
      const after = normalizeConfigValue(row.after);
      return { ...row, before, after, changed: Boolean(current) && before !== after };
    });
  }, [current, form]);
  const changedConfigCount = useMemo(
    () => configRows.filter((row) => row.changed).length,
    [configRows]
  );

  const updateMsg = useMemo(() => ({
    update_config: {
      admin: textOrNull(form.admin),
      fee_bps: numberOrNull(form.feeBps),
      fee_receiver: textOrNull(form.feeReceiver),
      review_window_secs: numberOrNull(form.reviewWindowSecs),
      min_text_len: numberOrNull(form.minTextLen),
      max_text_len: numberOrNull(form.maxTextLen),
      native_tip_denoms: form.nativeTipDenoms
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
      record_policy: form.recordPolicy || null,
      max_tip_per_tx: textOrNull(form.maxTipPerTx),
    },
  }), [form]);

  function setFailure(e) {
    const message = String(e?.message || e);
    setError(message);
    setAdvice(adminWalletAdvice(e));
    setOut(pretty({ ok: false, error: message, advice: adminWalletAdvice(e) }));
  }

  function assertCanAdminExecute() {
    if (!contract) throw new Error("contract is empty");
    if (!wallet.connected) throw new Error("Keplr not connected");
    if (!walletIsAdmin) throw new Error("wallet is not current admin");
  }

  function persistAdminApiToken(nextToken = adminApiToken) {
    setAdminApiToken(nextToken);
    setAdminApiTokenState(nextToken);
  }

  const load = async ({ preserveOut = false } = {}) => {
    setError("");
    setAdvice("");
    setBusy(true);
    try {
      const cfg = await API.getConfig();
      setContract(cfg.contract || "");
      setChainId(cfg.chainId || "");
      setRpc(cfg.injNode || "");
      setDefaultFees(cfg.defaultFees || "1000000000000000inj");
      if (!cfg.contract) {
        setCurrent(null);
        if (!preserveOut) setOut(pretty(cfg));
        setError("contract が未設定です。Settings で contract address を設定するか、先にデプロイしてください。");
        setAdvice("Admin wallet 認証は contract config の admin を照合するため、先に contract address が必要です。");
        return;
      }
      const resp = await API.smart({ config: {} }, cfg.contract || undefined);
      const data = unwrapSmart(resp);
      setCurrent(data);
      const storesResp = await API.smart({ stores: { start_after: null, limit: 100 } }, cfg.contract || undefined).catch(() => null);
      setStores(storesResp?.json?.data?.stores ?? storesResp?.data?.stores ?? []);
      setForm({
        admin: data?.admin || "",
        feeReceiver: data?.fee_receiver || "",
        feeBps: String(data?.fee_bps ?? ""),
        reviewWindowSecs: String(data?.review_window_secs ?? ""),
        minTextLen: String(data?.min_text_len ?? ""),
        maxTextLen: String(data?.max_text_len ?? ""),
        nativeTipDenoms: Array.isArray(data?.native_tip_denoms) ? data.native_tip_denoms.join(",") : "inj",
        recordPolicy: data?.record_policy || "store_owner_or_admin",
        maxTipPerTx: data?.max_tip_per_tx == null ? "" : String(data.max_tip_per_tx),
      });
      if (!preserveOut) setOut(pretty(resp));
    } catch (e) {
      setFailure(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const connectWallet = async () => {
    setError("");
    setAdvice("");
    setBusy(true);
    try {
      const connected = await connectInjectiveKeplr({ chainId, rpc });
      setWallet({ connected: true, address: connected.address, pubkey: connected.pubkey });
      setOut(pretty({
        ok: true,
        wallet: connected.address,
        admin: current?.admin || null,
        adminMatched: current?.admin ? sameAddress(connected.address, current.admin) : null,
      }));
    } catch (e) {
      setFailure(e);
    } finally {
      setBusy(false);
    }
  };

  const executeAdminMsg = async (label, msg) => {
    setError("");
    setAdvice("");
    setBusy(true);
    try {
      assertCanAdminExecute();
      const resp = await executeContractWithKeplr({
        chainId,
        sender: wallet.address,
        pubkey: wallet.pubkey,
        contract,
        msg,
        fee: defaultFees,
        gasLimit,
      });
      await API.adminAudit({
        actor: wallet.address,
        action: label,
        txhash: resp?.txhash || resp?.hash || "",
        target: auditTargetFromMsg(msg),
      }, adminApiToken).catch(() => null);
      setOut(pretty({ step: label, ok: true, ...resp }));
      await load({ preserveOut: true });
      return resp;
    } catch (e) {
      setFailure(e);
      throw e;
    } finally {
      setBusy(false);
    }
  };

  const saveConfig = async () => {
    await executeAdminMsg("update_config", updateMsg).catch(() => {});
  };

  const setStoreStatus = async () => {
    await executeAdminMsg("set_store_status", {
      set_store_status: {
        store_id: Number(storeOps.storeId),
        active: storeOps.active === "true",
      },
    }).catch(() => {});
  };

  const setStoreWindow = async () => {
    await executeAdminMsg("set_store_review_window", {
      set_store_review_window: {
        store_id: Number(storeOps.storeId),
        secs: Number(storeOps.reviewWindowSecs),
      },
    }).catch(() => {});
  };

  const fillStoreEdit = (store) => {
    if (!store) return;
    setStoreEdit({
      storeId: String(store.id || ""),
      storeRef: store.store_ref || "",
      name: store.name || "",
      category: store.category || "",
      address: store.address || "",
      phone: store.phone || "",
      website: store.website || "",
      openingHours: store.opening_hours || "",
      priceRange: store.price_range || "",
      imageUrl: store.image_url || "",
      description: store.description || "",
      owner: store.owner || "",
    });
  };

  const updateStoreProfile = async () => {
    await executeAdminMsg("update_store", {
      update_store: {
        store_id: Number(storeEdit.storeId),
        store_ref: textOrNull(storeEdit.storeRef),
        name: textOrNull(storeEdit.name),
        category: textOrNull(storeEdit.category),
        address: textOrNull(storeEdit.address),
        phone: textOrNull(storeEdit.phone),
        website: textOrNull(storeEdit.website),
        opening_hours: textOrNull(storeEdit.openingHours),
        price_range: textOrNull(storeEdit.priceRange),
        image_url: textOrNull(storeEdit.imageUrl),
        description: textOrNull(storeEdit.description),
        owner: textOrNull(storeEdit.owner),
      },
    }).catch(() => {});
  };

  const provisionStoreRegistrationCodes = async () => {
    const entry = {
      code: registrationCodeOps.code.trim(),
      store_ref: registrationCodeOps.storeRef.trim(),
      name: registrationCodeOps.name.trim(),
    };
    if (!entry.code || !entry.store_ref || !entry.name) {
      setFailure(new Error("認証コード、店舗 node id / store_ref、店名を入力してください"));
      return;
    }
    const commits = [await sha256Base64(entry.code)];
    const tx = await executeAdminMsg("provision_store_registration_codes", {
      provision_store_registration_codes: {
        commits,
      },
    }).catch(() => null);
    if (!tx) return;
    const meta = await API.saveStoreRegistrationMetadata([entry], adminApiToken);
    setOut(pretty({ step: "provision_store_registration_codes", tx, metadata: meta }));
    setRegistrationCodeOps({
      code: randomRegistrationCode(),
      storeRef: "",
      name: "",
    });
  };

  const provisionQrCommits = async () => {
    const codes = qrOps.codes
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (!codes.length) {
      setFailure(new Error("QR code を1行以上入力してください"));
      return;
    }
    const commits = await Promise.all(codes.map((code) => sha256Base64(code)));
    await executeAdminMsg("provision_qr_commits", {
      provision_qr_commits: {
        store_id: Number(qrOps.storeId),
        commits,
      },
    }).catch(() => {});
  };

  const loadAdminReviews = async () => {
    setError("");
    setAdvice("");
    setBusy(true);
    try {
      const resp = await API.latestReviews(20, contract || undefined);
      setReviewOps((s) => ({ ...s, rows: resp?.reviews || [] }));
      setOut(pretty({ step: "latest_reviews", response: resp }));
    } catch (e) {
      setFailure(e);
    } finally {
      setBusy(false);
    }
  };

  const pickAdminReview = (review) => {
    setReviewOps((s) => ({
      ...s,
      reviewId: String(review.id || ""),
      rating: String(review.rating || ""),
      title: review.title || "",
      body: review.body || "",
    }));
  };

  const editAdminReview = async () => {
    await executeAdminMsg("edit_review", {
      edit_review: {
        review_id: Number(reviewOps.reviewId),
        rating: reviewOps.rating === "" ? null : Number(reviewOps.rating),
        title: reviewOps.title === "" ? null : reviewOps.title,
        body: reviewOps.body === "" ? null : reviewOps.body,
      },
    }).then(loadAdminReviews).catch(() => {});
  };

  const hideAdminReview = async (reviewId = reviewOps.reviewId) => {
    await executeAdminMsg("hide_review", {
      hide_review: { review_id: Number(reviewId) },
    }).then(loadAdminReviews).catch(() => {});
  };

  const loadAdminVisits = async () => {
    setError("");
    setAdvice("");
    setBusy(true);
    try {
      if (!visitOps.storeId) throw new Error("店舗を選択してください。");
      const resp = await API.smart({
        visits_by_store: {
          store_id: Number(visitOps.storeId),
          start_after: null,
          limit: 100,
        },
      }, contract || undefined);
      const data = unwrapSmart(resp);
      const rows = data?.visits || [];
      setVisitOps((s) => ({ ...s, rows }));
      setOut(pretty({ step: "visits_by_store", response: resp }));
    } catch (e) {
      setFailure(e);
    } finally {
      setBusy(false);
    }
  };

  const revokeAdminVisit = async (visitId = visitOps.visitId) => {
    await executeAdminMsg("revoke_visit", {
      revoke_visit: { visit_id: Number(visitId) },
    }).then(loadAdminVisits).catch(() => {});
  };

  return (
    <div className="admin-page">
      <section className="admin-hero">
        <div>
          <span className="home-kicker">Service Admin</span>
          <h1>店舗レビュー運営管理</h1>
          <p>店舗登録コード、来店QR、口コミルールを管理します。重要な操作は Keplr で署名します。</p>
        </div>
        <div className="admin-contract-box">
          <span>contract</span>
          <strong>{contract || "未設定"}</strong>
          <button className="btn secondary" disabled={busy} onClick={load}>再読込</button>
        </div>
      </section>

      <section className="admin-auth-card">
        <div className="admin-auth-main">
          <div>
            <span className="home-kicker">Wallet Auth</span>
            <h2>Keplr Admin 認証</h2>
          </div>
          <span className={`admin-status ${statusClass}`}>{statusText}</span>
        </div>

        <div className="admin-wallet-grid">
          <div className="admin-address-line">
            <span>connected wallet</span>
            <strong>{wallet.address || "未接続"}</strong>
          </div>
          <div className="admin-address-line">
            <span>contract admin</span>
            <strong>{walletIsAdmin ? current?.admin || "未取得" : "ログイン後に表示"}</strong>
          </div>
          <button className="btn" disabled={busy || !chainId || !rpc} onClick={connectWallet}>
            Keplrでログイン
          </button>
        </div>

        <div className={`admin-keplr-gate ${statusClass}`}>
          <div>
            <span>Admin gate</span>
            <strong>{adminGateTitle}</strong>
            <p>{adminGateText}</p>
          </div>
          <div className="admin-keplr-checks">
            <span>{wallet.connected ? "対応済み" : "未対応中"}: Keplr接続</span>
            <span>{walletIsAdmin ? "対応済み" : "未対応中"}: admin照合</span>
          </div>
        </div>

        <div className="admin-inline-fields">
          <label>
            admin API token（セッション保存）
            <input
              type="password"
              value={adminApiToken}
              onChange={(e) => setAdminApiTokenState(e.target.value)}
              onBlur={() => persistAdminApiToken()}
              placeholder="サーバーの ADMIN_API_TOKEN"
            />
          </label>
          <label>
            fee
            <select value={defaultFees} onChange={(e) => setDefaultFees(e.target.value)}>
              <option value="1000000000000000inj">0.001 INJ</option>
              <option value="2000000000000000inj">0.002 INJ</option>
              <option value="5000000000000000inj">0.005 INJ</option>
              <option value="10000000000000000inj">0.01 INJ</option>
            </select>
          </label>
          <label>
            gas limit
            <select value={gasLimit} onChange={(e) => setGasLimit(e.target.value)}>
              <option value="300000">300,000</option>
              <option value="400000">400,000</option>
              <option value="600000">600,000</option>
              <option value="900000">900,000</option>
              <option value="1200000">1,200,000</option>
            </select>
          </label>
          <label>
            chainId
            <input value={chainId} onChange={(e) => setChainId(e.target.value)} />
          </label>
          <button
            className="btn secondary"
            type="button"
            onClick={() => persistAdminApiToken()}
          >
            token保存
          </button>
          <button
            className="btn secondary"
            type="button"
            onClick={() => persistAdminApiToken("")}
          >
            token削除
          </button>
        </div>
      </section>

      {error ? (
        <div className="error-box">
          <strong>エラー</strong>
          <p>{error}</p>
          {advice ? <p>{advice}</p> : null}
        </div>
      ) : null}

      {!walletIsAdmin ? (
        <section className="admin-login-card">
          <div>
            <span className="home-kicker">Admin Login</span>
            <h2>管理者ログイン</h2>
            <p>
              Keplrで管理者ウォレットにログインすると、現在の設定値、店舗管理、QR発行、実行結果を確認できます。
            </p>
            {wallet.connected && !walletIsAdmin ? (
              <p className="admin-login-warning">接続中のウォレットは現在の管理者ではありません。Keplrで管理者アカウントに切り替えてください。</p>
            ) : null}
          </div>
          <div className="admin-login-actions">
            <button className="btn" disabled={busy || !chainId || !rpc} onClick={connectWallet}>
              Keplrでログイン
            </button>
            <button className="btn secondary" disabled={busy} onClick={load}>
              再読込
            </button>
          </div>
        </section>
      ) : (
        <>
      <nav className="admin-tabs" aria-label="管理機能">
        {adminTabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={activeTab === tab.id ? "active" : ""}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <section className="admin-tab-content">
        {activeTab === "settings" ? (
        <div className="admin-panel">
          <div className="home-section-head">
            <span>Review Policy</span>
            <h2>口コミルール</h2>
          </div>

          <div className="admin-config-diff">
            <div className="admin-config-diff-head">
              <div>
                <span>Current vs Draft</span>
                <strong>変更前の値を確認</strong>
              </div>
              <span className={changedConfigCount ? "admin-change-count changed" : "admin-change-count"}>
                {changedConfigCount ? `${changedConfigCount}件 変更予定` : "変更なし"}
              </span>
            </div>
            {configRows.map((row) => (
              <div className={row.changed ? "admin-config-row changed" : "admin-config-row"} key={row.key}>
                <span className="admin-config-label">{row.label}</span>
                <div>
                  <small>変更前</small>
                  <strong>{displayConfigValue(row.before)}</strong>
                </div>
                <div>
                  <small>変更後</small>
                  <strong>{displayConfigValue(row.after)}</strong>
                </div>
                <span className={row.changed ? "admin-config-badge changed" : "admin-config-badge"}>
                  {row.changed ? "変更あり" : "同じ"}
                </span>
              </div>
            ))}
          </div>

          <label>admin</label>
          <input value={form.admin} onChange={(e) => setForm((s) => ({ ...s, admin: e.target.value }))} />
          <label>fee_receiver</label>
          <input value={form.feeReceiver} onChange={(e) => setForm((s) => ({ ...s, feeReceiver: e.target.value }))} />

          <div className="admin-two-col">
            <div>
              <label>fee_bps</label>
              <select value={form.feeBps} onChange={(e) => setForm((s) => ({ ...s, feeBps: e.target.value }))}>
                {FEE_BPS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label>review_window_secs</label>
              <select value={form.reviewWindowSecs} onChange={(e) => setForm((s) => ({ ...s, reviewWindowSecs: e.target.value }))}>
                {REVIEW_WINDOW_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-two-col">
            <div>
              <label>min_text_len</label>
              <select value={form.minTextLen} onChange={(e) => setForm((s) => ({ ...s, minTextLen: e.target.value }))}>
                {TEXT_LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
            <div>
              <label>max_text_len</label>
              <select value={form.maxTextLen} onChange={(e) => setForm((s) => ({ ...s, maxTextLen: e.target.value }))}>
                {TEXT_LIMIT_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </div>
          </div>

          <label>応援に使える通貨</label>
          <select value={form.nativeTipDenoms} onChange={(e) => setForm((s) => ({ ...s, nativeTipDenoms: e.target.value }))}>
            <option value="inj">inj</option>
          </select>

          <div className="admin-two-col">
            <div>
              <label>record_policy</label>
              <select value={form.recordPolicy} onChange={(e) => setForm((s) => ({ ...s, recordPolicy: e.target.value }))}>
                <option value="admin_only">admin_only</option>
                <option value="store_owner_or_admin">store_owner_or_admin</option>
                <option value="anyone">anyone</option>
              </select>
            </div>
            <div>
              <label>max_tip_per_tx（空=変更なし）</label>
              <select value={form.maxTipPerTx} onChange={(e) => setForm((s) => ({ ...s, maxTipPerTx: e.target.value }))}>
                <option value="">変更なし</option>
                {TIP_AMOUNT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value.replace("inj", "")}>{option.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="admin-actions">
            <button className="btn" disabled={busy || !canAdminExecute} onClick={saveConfig}>口コミルールを保存</button>
            {!canAdminExecute ? <span className="admin-meta">admin wallet 接続後に実行できます。</span> : null}
          </div>
        </div>
        ) : null}

        {activeTab === "stores" ? (
        <div className="admin-panel">
          <div className="home-section-head">
            <span>Store Operations</span>
            <h2>店舗編集</h2>
          </div>

          <label>店舗</label>
          <select value={storeOps.storeId} onChange={(e) => setStoreOps((s) => ({ ...s, storeId: e.target.value }))}>
            <option value="">店舗を選択</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{storeLabel(store)}</option>
            ))}
          </select>

          <label>掲載状態</label>
          <select value={storeOps.active} onChange={(e) => setStoreOps((s) => ({ ...s, active: e.target.value }))}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>

          <div className="admin-actions">
            <button className="btn secondary" disabled={busy || !canAdminExecute || !storeOps.storeId} onClick={setStoreStatus}>掲載状態を更新</button>
          </div>

          <label>レビュー投稿できる期間</label>
          <select value={storeOps.reviewWindowSecs} onChange={(e) => setStoreOps((s) => ({ ...s, reviewWindowSecs: e.target.value }))}>
            <option value="">未選択</option>
            {REVIEW_WINDOW_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <div className="admin-actions">
            <button className="btn secondary" disabled={busy || !canAdminExecute || !storeOps.storeId || !storeOps.reviewWindowSecs} onClick={setStoreWindow}>投稿期間を更新</button>
          </div>

          <h3>店舗プロフィール編集</h3>
          <label>編集する店舗</label>
          <select
            value={storeEdit.storeId}
            onChange={(e) => {
              const picked = stores.find((store) => String(store.id) === e.target.value);
              if (picked) fillStoreEdit(picked);
              else setStoreEdit((s) => ({ ...s, storeId: e.target.value }));
            }}
          >
            <option value="">店舗を選択</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{storeLabel(store)}</option>
            ))}
          </select>

          {selectedStoreForEdit ? (
            <div className="admin-store-preview">
              <strong>{selectedStoreForEdit.name || selectedStoreForEdit.store_ref}</strong>
              <span>{selectedStoreForEdit.category || "カテゴリ未設定"} / {selectedStoreForEdit.address || "住所未設定"}</span>
            </div>
          ) : null}

          <div className="admin-two-col">
            <div>
              <label>店舗 node id / store_ref</label>
              <input value={storeEdit.storeRef} onChange={(e) => setStoreEdit((s) => ({ ...s, storeRef: e.target.value }))} />
            </div>
            <div>
              <label>店名</label>
              <input value={storeEdit.name} onChange={(e) => setStoreEdit((s) => ({ ...s, name: e.target.value }))} />
            </div>
          </div>

          <div className="admin-two-col">
            <div>
              <label>カテゴリ</label>
              <input value={storeEdit.category} onChange={(e) => setStoreEdit((s) => ({ ...s, category: e.target.value }))} />
            </div>
            <div>
              <label>価格帯</label>
              <input value={storeEdit.priceRange} onChange={(e) => setStoreEdit((s) => ({ ...s, priceRange: e.target.value }))} />
            </div>
          </div>

          <label>住所</label>
          <input value={storeEdit.address} onChange={(e) => setStoreEdit((s) => ({ ...s, address: e.target.value }))} />

          <div className="admin-two-col">
            <div>
              <label>電話番号</label>
              <input value={storeEdit.phone} onChange={(e) => setStoreEdit((s) => ({ ...s, phone: e.target.value }))} />
            </div>
            <div>
              <label>Webサイト</label>
              <input value={storeEdit.website} onChange={(e) => setStoreEdit((s) => ({ ...s, website: e.target.value }))} />
            </div>
          </div>

          <label>営業時間</label>
          <input value={storeEdit.openingHours} onChange={(e) => setStoreEdit((s) => ({ ...s, openingHours: e.target.value }))} />

          <label>画像URL</label>
          <input value={storeEdit.imageUrl} onChange={(e) => setStoreEdit((s) => ({ ...s, imageUrl: e.target.value }))} />

          <label>説明</label>
          <textarea value={storeEdit.description} onChange={(e) => setStoreEdit((s) => ({ ...s, description: e.target.value }))} />

          <label>店舗オーナー wallet</label>
          <input value={storeEdit.owner} onChange={(e) => setStoreEdit((s) => ({ ...s, owner: e.target.value }))} />

          <div className="admin-actions">
            <button className="btn" disabled={busy || !canAdminExecute || !storeEdit.storeId} onClick={updateStoreProfile}>店舗プロフィールを保存</button>
          </div>
        </div>
        ) : null}

        {activeTab === "codes" ? (
        <div className="admin-panel">
          <div className="home-section-head">
            <span>Registration Code</span>
            <h2>店舗登録コード</h2>
          </div>
          {!hasAdminApiToken ? (
            <div className="error-box">
              <strong>admin API token が必要です</strong>
              <p>登録コードのオンチェーン発行後、サーバー側メタ情報を保存するために token を入力してください。</p>
            </div>
          ) : null}
          <h3>店舗登録コード発行</h3>
          <div className="admin-registration-code-grid">
            <label>
              認証コード
              <div className="admin-code-input-row">
                <input
                  value={registrationCodeOps.code}
                  readOnly
                  placeholder="自動生成"
                />
                <button
                  className="btn secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setRegistrationCodeOps((s) => ({ ...s, code: randomRegistrationCode() }))}
                >
                  再生成
                </button>
              </div>
            </label>
            <label>
              店舗 node id / store_ref
              <input
                value={registrationCodeOps.storeRef}
                onChange={(e) => setRegistrationCodeOps((s) => ({ ...s, storeRef: e.target.value }))}
                placeholder="例: sushi-suwa"
              />
            </label>
            <label>
              店名
              <input
                value={registrationCodeOps.name}
                onChange={(e) => setRegistrationCodeOps((s) => ({ ...s, name: e.target.value }))}
                placeholder="例: 鮨 諏訪"
              />
            </label>
          </div>
          <div className="admin-actions">
            <button
              className="btn secondary"
              disabled={
                busy ||
                !canAdminExecute ||
                !hasAdminApiToken ||
                !registrationCodeOps.code.trim() ||
                !registrationCodeOps.storeRef.trim() ||
                !registrationCodeOps.name.trim()
              }
              onClick={provisionStoreRegistrationCodes}
            >
              登録コードを発行
            </button>
          </div>
        </div>
        ) : null}

        {activeTab === "qr" ? (
        <div className="admin-panel">
          <div className="home-section-head">
            <span>Visit QR</span>
            <h2>来店QR登録</h2>
          </div>
          <h3>来店QRコード登録</h3>
          <label>店舗</label>
          <select value={qrOps.storeId} onChange={(e) => setQrOps((s) => ({ ...s, storeId: e.target.value }))}>
            <option value="">店舗を選択</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{storeLabel(store)}</option>
            ))}
          </select>
          <label>QR codes（1行に1 code / node id を含むコード）</label>
          <textarea value={qrOps.codes} onChange={(e) => setQrOps((s) => ({ ...s, codes: e.target.value }))} />
          <div className="admin-actions">
            <button className="btn secondary" disabled={busy || !canAdminExecute || !qrOps.storeId || !qrOps.codes.trim()} onClick={provisionQrCommits}>来店QRを登録</button>
            {qrOps.storeId ? (
              <NavLink className="btn ghost" to={`/stores/${qrOps.storeId}/qr`}>
                掲示用QRページを開く
              </NavLink>
            ) : null}
          </div>
        </div>
        ) : null}

        {activeTab === "reviews" ? (
        <div className="admin-panel">
          <div className="home-section-head">
            <span>Review Operations</span>
            <h2>口コミ管理</h2>
          </div>
          <p className="admin-meta">
            最新口コミを読み込み、対象レビューを選択して編集または非表示にできます。
          </p>
          <div className="admin-actions">
            <button className="btn secondary" disabled={busy} onClick={loadAdminReviews}>最新口コミを読み込む</button>
          </div>

          <div className="admin-review-list">
            {reviewOps.rows.map((review) => (
              <button
                type="button"
                className={String(reviewOps.reviewId) === String(review.id) ? "admin-review-row selected" : "admin-review-row"}
                key={review.id}
                onClick={() => pickAdminReview(review)}
              >
                <span>#{review.id} / ★{review.rating}</span>
                <strong>{review.title || "タイトルなし"}</strong>
                <small>{review.store?.name || `Store #${review.store_id}`} / {shortAddress(review.reviewer)} / {formatTime(review.created_at)}</small>
              </button>
            ))}
            {reviewOps.rows.length === 0 ? <p className="admin-meta">まだ読み込まれていません。</p> : null}
          </div>

          <div className="admin-two-col">
            <div>
              <label>review_id</label>
              <input value={reviewOps.reviewId} onChange={(e) => setReviewOps((s) => ({ ...s, reviewId: e.target.value }))} />
            </div>
            <div>
              <label>rating</label>
              <select value={reviewOps.rating} onChange={(e) => setReviewOps((s) => ({ ...s, rating: e.target.value }))}>
                <option value="">変更なし</option>
                <option value="5">★5</option>
                <option value="4">★4</option>
                <option value="3">★3</option>
                <option value="2">★2</option>
                <option value="1">★1</option>
              </select>
            </div>
          </div>
          <label>title</label>
          <input value={reviewOps.title} onChange={(e) => setReviewOps((s) => ({ ...s, title: e.target.value }))} />
          <label>body</label>
          <textarea value={reviewOps.body} onChange={(e) => setReviewOps((s) => ({ ...s, body: e.target.value }))} />
          <div className="admin-actions">
            <button className="btn" disabled={busy || !canAdminExecute || !reviewOps.reviewId} onClick={editAdminReview}>口コミを更新</button>
            <button className="btn warn" disabled={busy || !canAdminExecute || !reviewOps.reviewId} onClick={() => hideAdminReview()}>非表示にする</button>
          </div>

          <div className="admin-shortcut-grid">
            <NavLink to="/reviews/list">口コミ一覧を開く</NavLink>
            <NavLink to="/reviews/create">口コミ投稿画面を開く</NavLink>
          </div>
        </div>
        ) : null}

        {activeTab === "visits" ? (
        <div className="admin-panel">
          <div className="home-section-head">
            <span>Visit Operations</span>
            <h2>来店管理</h2>
          </div>
          <p className="admin-meta">
            店舗別の来店履歴を読み込み、visitorで絞り込み、必要に応じて来店を取り消せます。
          </p>
          <label>店舗</label>
          <select value={visitOps.storeId} onChange={(e) => setVisitOps((s) => ({ ...s, storeId: e.target.value }))}>
            <option value="">店舗を選択</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>{storeLabel(store)}</option>
            ))}
          </select>
          <div className="admin-two-col">
            <div>
              <label>visitor filter</label>
              <input value={visitOps.visitor} onChange={(e) => setVisitOps((s) => ({ ...s, visitor: e.target.value }))} placeholder="inj..." />
            </div>
            <div>
              <label>visit_id</label>
              <input value={visitOps.visitId} onChange={(e) => setVisitOps((s) => ({ ...s, visitId: e.target.value }))} />
            </div>
          </div>
          <div className="admin-actions">
            <button className="btn secondary" disabled={busy || !visitOps.storeId} onClick={loadAdminVisits}>来店を読み込む</button>
            <button className="btn warn" disabled={busy || !canAdminExecute || !visitOps.visitId} onClick={() => revokeAdminVisit()}>来店を取り消す</button>
          </div>

          <div className="admin-review-list">
            {filteredVisits.map((visit) => (
              <button
                type="button"
                className={String(visitOps.visitId) === String(visit.id) ? "admin-review-row selected" : "admin-review-row"}
                key={visit.id}
                onClick={() => setVisitOps((s) => ({ ...s, visitId: String(visit.id || "") }))}
              >
                <span>Visit #{visit.id} / Store #{visit.store_id}</span>
                <strong>{visit.revoked ? "取り消し済み" : visit.reviewed ? "レビュー済み" : "レビュー待ち"}</strong>
                <small>{shortAddress(visit.visitor)} / {visit.memo || "memoなし"} / {formatTime(visit.created_at)}</small>
              </button>
            ))}
            {filteredVisits.length === 0 ? <p className="admin-meta">来店データがありません。</p> : null}
          </div>

          <div className="admin-shortcut-grid">
            <NavLink to="/visits/list">来店履歴を開く</NavLink>
            <NavLink to="/visits/record">来店QR記録を開く</NavLink>
          </div>
        </div>
        ) : null}

        {activeTab === "result" ? (
        <div className="admin-panel">
          <div className="home-section-head">
            <span>Current Config</span>
            <h2>現在のサービス設定</h2>
          </div>
          <h3>現在のサービス設定</h3>
          <pre className="out">{pretty(current || {})}</pre>
        </div>
        ) : null}
      </section>

      <section className="admin-panel admin-result-panel">
        <div className="home-section-head">
          <span>Result</span>
          <h2>実行結果</h2>
        </div>
        <pre className="out">{out}</pre>
      </section>
        </>
      )}
    </div>
  );
}
