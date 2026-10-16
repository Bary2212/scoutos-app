import React, { useEffect, useState } from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { Shield, LogOut } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import PlayerProfile from "./pages/PlayerProfile.jsx";
import PlayerStatsForm from "./pages/PlayerStatsForm.jsx";
import PlayerProfileBasic from "./pages/PlayerProfileBasic.jsx";
import PlayerSearch from "./pages/PlayerSearch.jsx";
import ValueRadar from "./pages/ValueRadar.jsx";
import LiveTagging from "./pages/LiveTagging.jsx";
import AddPlayer from "./pages/AddPlayer.jsx";
import Login from "./pages/Login.jsx";
import Club from "./pages/Club.jsx";
import Shortlist from "./pages/Shortlist.jsx";
import ComparePlayers from "./pages/ComparePlayers.jsx";
import AdminOverview from "./pages/AdminOverview.jsx";
import PublicPlayerProfile from "./pages/PublicPlayerProfile.jsx";
import Matches from "./pages/Matches.jsx";
import { Terms, Privacy } from "./pages/Legal.jsx";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/hledani", label: "Vyhledávání" },
  { to: "/shortlist", label: "Shortlist" },
  { to: "/radar", label: "Radar hodnoty" },
  { to: "/pridat-hrace", label: "+ Přidat hráče" },
  { to: "/zapasy", label: "Zápasy" },
  { to: "/klub", label: "Klub" },
];

// Ukázkové položky vidí jen demo tým a majitel appky — ostatní uživatelé
// (skuteční klienti) je v menu nemají.
const DEMO_NAV = [
  { to: "/hrac/1", label: "Player Profile (demo)" },
  { to: "/tagovani", label: "Live Tagging" },
];

// Chrání trasu — bez přihlášení pošle na /prihlaseni a pamatuje si, kam se
// uživatel po přihlášení chtěl původně dostat.
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    return <Navigate to="/prihlaseni" state={{ from: location.pathname }} replace />;
  }
  return children;
}

function TopNav() {
  const location = useLocation();
  const { user, logout } = useAuth();
  // Odkaz "Admin" vidí jen majitel appky (backend nastaví user.isAdmin podle ADMIN_EMAIL).
  const showDemo = user?.isDemoTeam || user?.isAdmin;
  const navItems = [
    ...NAV.slice(0, -1),
    ...(showDemo ? DEMO_NAV : []),
    ...NAV.slice(-1),
    ...(user?.isAdmin ? [{ to: "/admin", label: "Admin" }] : []),
  ];

  return (
    <div
      style={{
        height: 56,
        borderBottom: "1px solid #DADDD3",
        background: "#FFFFFF",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 20px",
        fontFamily: "'Inter', sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Shield size={18} color="#2F6B4F" />
          <span style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, fontSize: 15, color: "#14201A" }}>
            ScoutOS
          </span>
        </div>
        {user && (
          <div style={{ display: "flex", gap: 20 }}>
            {navItems.map((item) => {
              const active = location.pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  style={{
                    fontSize: 13,
                    fontWeight: active ? 700 : 500,
                    color: active ? "#14201A" : "#8A9284",
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {user ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#57614F" }}>{user.name}</span>
          <button
            onClick={logout}
            style={{ display: "flex", alignItems: "center", gap: 5, background: "none", border: "none", color: "#8A9284", fontSize: 12, cursor: "pointer", padding: 0 }}
          >
            <LogOut size={13} /> Odhlásit
          </button>
        </div>
      ) : (
        <Link to="/prihlaseni" style={{ fontSize: 13, fontWeight: 600, color: "#2F6B4F", textDecoration: "none" }}>
          Přihlásit se
        </Link>
      )}
    </div>
  );
}

// Pruh pod horní lištou: zbývající dny zkušební doby, nebo upozornění, že účet je jen pro čtení.
function TrialBanner() {
  const { user } = useAuth();
  const [expiredEvent, setExpiredEvent] = useState(false);
  useEffect(() => {
    const onExpired = () => setExpiredEvent(true);
    window.addEventListener("scoutos:trial-expired", onExpired);
    return () => window.removeEventListener("scoutos:trial-expired", onExpired);
  }, []);
  if (!user || (!user.trialEndsAt && !expiredEvent)) return null;

  const msLeft = user.trialEndsAt ? new Date(user.trialEndsAt).getTime() - Date.now() : 0;
  const expired = expiredEvent || user.trialExpired || msLeft <= 0;
  const days = Math.max(0, Math.ceil(msLeft / 86400000));
  const mail = "mailto:info@baranstudio.cz?subject=" + encodeURIComponent("ScoutOS – prodloužení zkušební doby");

  let bg = "#E4EEE7";
  let color = "#2F6B4F";
  let text = `Zkušební verze: zbývá ${days} ${days === 1 ? "den" : days >= 2 && days <= 4 ? "dny" : "dní"}.`;
  if (!expired && days <= 3) {
    bg = "#F6EBD3";
    color = "#8A5A12";
    text = days === 0 ? "Zkušební verze dnes končí." : `Zkušební verze brzy končí: zbývá ${days} ${days === 1 ? "den" : "dny"}.`;
  }
  if (expired) {
    bg = "#F5E5E2";
    color = "#B23A2E";
    text = "Zkušební doba skončila — účet je teď jen pro čtení. Data zůstávají, nic se nemaže.";
  }
  return (
    <div style={{ background: bg, color, fontSize: 12.5, fontFamily: "'Inter', sans-serif", padding: "7px 20px", textAlign: "center" }}>
      {text}{" "}
      <a href={mail} style={{ color, fontWeight: 700 }}>
        {expired || days <= 3 ? "Napiš nám a prodloužíme ji" : "Dotazy nebo zpětná vazba?"}
      </a>
    </div>
  );
}

function SiteFooter() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <div style={{ textAlign: "center", fontSize: 11.5, color: "#8A9284", padding: "18px 20px 26px", fontFamily: "'Inter', sans-serif" }}>
      Něco nefunguje nebo ti něco chybí? Napiš na{" "}
      <a href="mailto:info@baranstudio.cz" style={{ color: "#2F6B4F", fontWeight: 600 }}>info@baranstudio.cz</a>
      {" · "}
      <Link to="/podminky" style={{ color: "#8A9284" }}>Podmínky použití</Link>
      {" · "}
      <Link to="/soukromi" style={{ color: "#8A9284" }}>Ochrana osobních údajů</Link>
    </div>
  );
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/prihlaseni" element={<Login />} />
      <Route path="/podminky" element={<Terms />} />
      <Route path="/soukromi" element={<Privacy />} />
      <Route path="/verejny/profil/:token" element={<PublicPlayerProfile />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/hledani" element={<ProtectedRoute><PlayerSearch /></ProtectedRoute>} />
      <Route path="/radar" element={<ProtectedRoute><ValueRadar /></ProtectedRoute>} />
      <Route path="/pridat-hrace" element={<ProtectedRoute><AddPlayer /></ProtectedRoute>} />
      <Route path="/hrac-basic/:id" element={<ProtectedRoute><PlayerProfileBasic /></ProtectedRoute>} />
      <Route path="/hrac/:id" element={<ProtectedRoute><PlayerProfile /></ProtectedRoute>} />
      <Route path="/hrac/:id/statistiky" element={<ProtectedRoute><PlayerStatsForm /></ProtectedRoute>} />
      <Route path="/tagovani" element={<ProtectedRoute><LiveTagging /></ProtectedRoute>} />
      <Route path="/zapasy" element={<ProtectedRoute><Matches /></ProtectedRoute>} />
      <Route path="/klub" element={<ProtectedRoute><Club /></ProtectedRoute>} />
      <Route path="/shortlist" element={<ProtectedRoute><Shortlist /></ProtectedRoute>} />
      <Route path="/porovnani" element={<ProtectedRoute><ComparePlayers /></ProtectedRoute>} />
      <Route path="/admin" element={<ProtectedRoute><AdminOverview /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div>
        <TopNav />
        <TrialBanner />
        <AppRoutes />
        <SiteFooter />
      </div>
    </AuthProvider>
  );
}
