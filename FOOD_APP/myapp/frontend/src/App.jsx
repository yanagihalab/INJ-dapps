// sudo docker compose build --no-cache
// frontend/src/App.jsx
import React, { Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./index.css";
import LanguageSwitcher from "./components/prb/LanguageSwitcher.jsx";
import { useGlobalPageTranslation } from "./lib/pageTranslations.js";

// Pages
const HomePage = lazy(() => import("./pages/HomePage.jsx"));
const Settings = lazy(() => import("./pages/Settings.jsx"));
const RegisterStore = lazy(() => import("./pages/stores/RegisterStore.jsx"));
const StoreList = lazy(() => import("./pages/stores/StoreList.jsx"));
const StoreDetail = lazy(() => import("./pages/stores/StoreDetail.jsx"));
const StoreQrPage = lazy(() => import("./pages/stores/StoreQrPage.jsx"));
const RecordVisit = lazy(() => import("./pages/visits/RecordVisit.jsx"));
const VisitList = lazy(() => import("./pages/visits/VisitList.jsx"));
const CreateReview = lazy(() => import("./pages/reviews/CreateReview.jsx"));
const TipReview = lazy(() => import("./pages/reviews/TipReview.jsx"));
const TipsSummary = lazy(() => import("./pages/reviews/TipsSummary.jsx"));
const ReviewList = lazy(() => import("./pages/reviews/ReviewList.jsx"));
const AdminPage = lazy(() => import("./pages/admin/AdminPage.jsx"));
const Withdraw = lazy(() => import("./pages/admin/Withdraw.jsx"));

// アカウント関連
const AccountManager = lazy(() => import("./pages/accounts/AccountManager.jsx"));
const KeyLogin = lazy(() => import("./pages/accounts/KeyLogin.jsx"));

export default function App() {
  useGlobalPageTranslation();
  const { t } = useTranslation();

  return (
    <>
      <header className="appbar">
        <NavLink className="brand" to="/">
          <span className="brand-mark">IR</span>
          <span>
            INJ Reviews
            <small>{t("app.subtitle")}</small>
          </span>
        </NavLink>
        <nav>
          <NavLink to="/">{t("nav.search")}</NavLink>
          <NavLink to="/stores/list">{t("nav.stores")}</NavLink>
          <NavLink to="/visits/record">{t("nav.visitQr")}</NavLink>
          <NavLink to="/reviews/create">{t("nav.writeReview")}</NavLink>
          <NavLink to="/reviews/list">{t("nav.reviews")}</NavLink>
          <NavLink to="/stores/register">{t("nav.registerStore")}</NavLink>
        </nav>
        <NavLink className="appbar-cta" to="/visits/record">
          {t("nav.visitByQr")}
        </NavLink>
        <LanguageSwitcher />
      </header>

      <div className="container">
        <Suspense fallback={<div className="page app-loading">{t("app.loading")}</div>}>
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
        </Suspense>
      </div>
    </>
  );
}
