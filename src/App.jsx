import React from "react";
import { Routes, Route, Link, useLocation, Navigate } from "react-router-dom";
import { Shield, LogOut } from "lucide-react";
import { AuthProvider, useAuth } from "./AuthContext.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import PlayerProfile from "./pages/PlayerProfile.jsx";
import PlayerStatsForm from "./pages/PlayerStatsForm.jsx";
import PlayerProfileBasic from "./pages/PlayerProfileBasic.jsx";
import PlayerSearch from "./pages/PlayerSearch.jsx";
import LiveTagging from "./pages/LiveTagging.jsx";
import AddPlayer from "./pages/AddPlayer.jsx";
import Login from "./pages/Login.jsx";

const NAV = [
  { to: "/", label: "Dashboard" },
  { to: "/hledani", label: "Vyhledávání" },
  { to: "/pridat-hrace", label: "+ Přidat hráče" },
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
            {NAV.map((item) => {
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

function AppRoutes() {
  return (
    <Routes>
      <Route path="/prihlaseni" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/hledani" element={<ProtectedRoute><PlayerSearch /></ProtectedRoute>} />
      <Route path="/pridat-hrace" element={<ProtectedRoute><AddPlayer /></ProtectedRoute>} />
      <Route path="/hrac-basic/:id" element={<ProtectedRoute><PlayerProfileBasic /></ProtectedRoute>} />
      <Route path="/hrac/:id" element={<ProtectedRoute><PlayerProfile /></ProtectedRoute>} />
      <Route path="/hrac/:id/statistiky" element={<ProtectedRoute><PlayerStatsForm /></ProtectedRoute>} />
      <Route path="/tagovani" element={<ProtectedRoute><LiveTagging /></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div>
        <TopNav />
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}
