// frontend/src/App.jsx
import React from "react";
import { Routes, Route, NavLink } from "react-router-dom";
import "./index.css";

// Pages
import Settings from "./pages/Settings.jsx";

import RegisterStore from "./pages/stores/RegisterStore.jsx";
import StoreList from "./pages/stores/StoreList.jsx";

import RecordVisit from "./pages/visits/RecordVisit.jsx";
import VisitList from "./pages/visits/VisitList.jsx";

import CreateReview from "./pages/reviews/CreateReview.jsx";
import TipReview from "./pages/reviews/TipReview.jsx";
import TipsSummary from "./pages/reviews/TipsSummary.jsx";
import ReviewList from "./pages/reviews/ReviewList.jsx";

import Withdraw from "./pages/admin/Withdraw.jsx";

// アカウント関連
import AccountManager from "./pages/accounts/AccountManager.jsx";
import KeyLogin from "./pages/accounts/KeyLogin.jsx";

import DebugPage from "./pages/DebugPage.jsx";

export default function App() {
  return (
    <>
      <header className="appbar">
        <div className="brand">Tabelog Review dApp</div>
        <nav>
          <NavLink to="/">Home</NavLink>
          <NavLink to="/debug">Debug</NavLink>
        </nav>
      </header>

      <div className="container">
        <Routes>
          <Route
            path="/"
            element={
              <div className="page">
                <h2>Top</h2>
                <p className="muted">左上メニューから各ページへ移動してください。</p>

                <h3 style={{ marginTop: 20 }}>設定</h3>
                <ul>
                  <li><NavLink to="/settings">設定</NavLink></li>
                </ul>

                <h3 style={{ marginTop: 20 }}>STORES</h3>
                <ul>
                  <li><NavLink to="/stores/register">店舗登録</NavLink></li>
                  <li><NavLink to="/stores/list">店舗一覧</NavLink></li>
                </ul>

                <h3 style={{ marginTop: 20 }}>VISITS</h3>
                <ul>
                  <li><NavLink to="/visits/record">来店記録</NavLink></li>
                  <li><NavLink to="/visits/list">来店一覧</NavLink></li>
                </ul>

                <h3 style={{ marginTop: 20 }}>REVIEWS & TIPS</h3>
                <ul>
                  <li><NavLink to="/reviews/create">レビュー作成</NavLink></li>
                  <li><NavLink to="/tips/tip">投げ銭</NavLink></li>
                  <li><NavLink to="/tips/summary">投げ銭合計</NavLink></li>
                  <li><NavLink to="/reviews/list">投稿されたレビューの一覧</NavLink></li>
                </ul>

                <h3 style={{ marginTop: 20 }}>ADMIN</h3>
                <ul>
                  <li><NavLink to="/accounts">アカウント管理（作成・PW設定）</NavLink></li>
                  <li><NavLink to="/accounts/login">ログイン検証（キー + PW）</NavLink></li>
                  <li><NavLink to="/admin/withdraw">引き出し</NavLink></li>
                </ul>
              </div>
            }
          />

          {/* 設定 */}
          <Route path="/settings" element={<Settings />} />

          {/* STORES */}
          <Route path="/stores/register" element={<RegisterStore />} />
          <Route path="/stores/list" element={<StoreList />} />

          {/* VISITS */}
          <Route path="/visits/record" element={<RecordVisit />} />
          <Route path="/visits/list" element={<VisitList />} />

          {/* REVIEWS & TIPS */}
          <Route path="/reviews/create" element={<CreateReview />} />
          <Route path="/tips/tip" element={<TipReview />} />
          <Route path="/tips/summary" element={<TipsSummary />} />
          <Route path="/reviews/list" element={<ReviewList />} />

          {/* ADMIN */}
          <Route path="/accounts" element={<AccountManager />} />
          <Route path="/accounts/login" element={<KeyLogin />} />
          <Route path="/admin/withdraw" element={<Withdraw />} />

          {/* Debug */}
          <Route path="/debug" element={<DebugPage />} />
        </Routes>
      </div>
    </>
  );
}
