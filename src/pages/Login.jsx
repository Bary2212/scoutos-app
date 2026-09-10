import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, UserPlus2 } from "lucide-react";
import { useAuth } from "../AuthContext.jsx";

const C = {
  bg: "#F5F6F1",
  panel: "#FFFFFF",
  ink: "#14201A",
  inkSoft: "#57614F",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  line: "#DADDD3",
  redSoft: "#F5E5E2",
  red: "#B23A2E",
};

const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";

export default function Login() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(name, email, password);
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message || "Něco se pokazilo. Běží backend na localhost:4000?");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontBody }}>
      <form
        onSubmit={handleSubmit}
        style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 32, width: 360 }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          {mode === "login" ? <Lock size={18} color={C.turf} /> : <UserPlus2 size={18} color={C.turf} />}
          <h1 style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, color: C.ink }}>
            {mode === "login" ? "Přihlášení do ScoutOS" : "Vytvořit účet"}
          </h1>
        </div>

        {mode === "register" && (
          <>
            <label style={{ display: "block", fontSize: 12, color: C.inkFaint, marginBottom: 6 }}>Jméno</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Jan Novák"
              required
              style={{ width: "100%", padding: "9px 10px", marginBottom: 16, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 14 }}
            />
          </>
        )}

        <label style={{ display: "block", fontSize: 12, color: C.inkFaint, marginBottom: 6 }}>E-mail</label>
        <input
          type="text"
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jmeno@klub.cz"
          required
          style={{ width: "100%", padding: "9px 10px", marginBottom: 16, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 14 }}
        />

        <label style={{ display: "block", fontSize: 12, color: C.inkFaint, marginBottom: 6 }}>Heslo</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          minLength={mode === "register" ? 6 : undefined}
          style={{ width: "100%", padding: "9px 10px", marginBottom: 20, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 14 }}
        />

        {error && (
          <div style={{ background: C.redSoft, color: C.red, padding: "9px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting}
          style={{ width: "100%", padding: "10px", background: C.turf, color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
        >
          {submitting ? "Chvilku…" : mode === "login" ? "Přihlásit se" : "Vytvořit účet"}
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
          style={{ width: "100%", marginTop: 12, background: "none", border: "none", color: C.turf, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
        >
          {mode === "login" ? "Nemáš účet? Vytvoř si ho" : "Už máš účet? Přihlas se"}
        </button>

        {mode === "login" && (
          <p style={{ fontSize: 11, color: C.inkFaint, marginTop: 16, lineHeight: 1.5, textAlign: "center" }}>
            Ukázkový účet: petr@scoutos.cz / heslo123
          </p>
        )}
      </form>
    </div>
  );
}
