// sudo docker compose build --no-cache
// frontend/src/App.jsx
import React from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import "./index.css";
import LanguageSwitcher from "./components/prb/LanguageSwitcher.jsx";
import { useGlobalPageTranslation } from "./lib/pageTranslations.js";

// Pages
import HomePage from "./pages/HomePage.jsx";
import Settings from "./pages/Settings.jsx";

import RegisterStore from "./pages/stores/RegisterStore.jsx";
import StoreList from "./pages/stores/StoreList.jsx";
import StoreDetail from "./pages/stores/StoreDetail.jsx";
import StoreQrPage from "./pages/stores/StoreQrPage.jsx";

import RecordVisit from "./pages/visits/RecordVisit.jsx";
import VisitList from "./pages/visits/VisitList.jsx";

import CreateReview from "./pages/reviews/CreateReview.jsx";
import TipReview from "./pages/reviews/TipReview.jsx";
import TipsSummary from "./pages/reviews/TipsSummary.jsx";
import ReviewList from "./pages/reviews/ReviewList.jsx";

import AdminPage from "./pages/admin/AdminPage.jsx";
import Withdraw from "./pages/admin/Withdraw.jsx";

// アカウント関連
import AccountManager from "./pages/accounts/AccountManager.jsx";
import KeyLogin from "./pages/accounts/KeyLogin.jsx";

export default function App() {
  useGlobalPageTranslation();

  return (
    <>
      <header className="appbar">
        <NavLink className="brand" to="/">
          <span className="brand-mark">IR</span>
          <span>
            INJ Reviews
            <small>Verified restaurant guide</small>
          </span>
        </NavLink>
        <nav>
          <NavLink to="/">探す</NavLink>
          <NavLink to="/stores/list">店舗一覧</NavLink>
          <NavLink to="/visits/record">来店QR</NavLink>
          <NavLink to="/reviews/create">レビュー投稿</NavLink>
          <NavLink to="/reviews/list">口コミ</NavLink>
          <NavLink to="/stores/register">店舗登録</NavLink>
        </nav>
        <NavLink className="appbar-cta" to="/visits/record">
          QRで来店
        </NavLink>
        <LanguageSwitcher />
      </header>

      <div className="container">
        <Routes>
          <Route path="/" element={<HomePage />} />

          {/* 設定 */}
          <Route path="/settings" element={<Settings />} />

          {/* STORES */}
          <Route path="/stores/register" element={<RegisterStore />} />
          <Route path="/stores/list" element={<StoreList />} />
          <Route path="/stores/:storeId/qr" element={<StoreQrPage />} />
          <Route path="/stores/:storeId" element={<StoreDetail />} />

          {/* VISITS */}
          <Route path="/visits/record" element={<RecordVisit />} />
          <Route path="/visits/list" element={<VisitList />} />

          {/* REVIEWS & TIPS */}
          <Route path="/reviews/create" element={<CreateReview />} />
          <Route path="/tips/tip" element={<TipReview />} />
          <Route path="/tips/summary" element={<TipsSummary />} />
          <Route path="/reviews/list" element={<ReviewList />} />

          {/* ADMIN */}
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/accounts" element={<AccountManager />} />
          <Route path="/accounts/login" element={<KeyLogin />} />
          <Route path="/admin/withdraw" element={<Withdraw />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
