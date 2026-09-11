import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Lock, UserPlus2, MailCheck } from "lucide-react";
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

const inputStyle = { width: "100%", padding: "9px 10px", marginBottom: 16, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 14 };
const labelStyle = { display: "block", fontSize: 12, color: C.inkFaint, marginBottom: 6 };

export default function Login() {
  const { login, register, verify } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // "login" | "register" | "verify"
  const [mode, setMode] = useState("login");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [code, setCode] = useState("");

  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from || "/";

  const resetMessages = () => {
    setError(null);
    setInfo(null);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (err.needsVerification) {
        setEmail(err.email || email);
        setMode("verify");
        setInfo("Účet ještě není ověřený. Zadej kód, který jsme ti poslali e-mailem.");
      } else {
        setError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    resetMessages();

    if (!firstName.trim() || !lastName.trim()) {
      setError("Vyplň prosím jméno i příjmení.");
      return;
    }
    if (password.length < 8) {
      setError("Heslo musí mít alespoň 8 znaků.");
      return;
    }
    if (password !== passwordConfirm) {
      setError("Hesla se neshodují.");
      return;
    }

    setSubmitting(true);
    try {
      await register(firstName, lastName, email, password, passwordConfirm);
      setMode("verify");
      setInfo("Poslali jsme ti na e-mail ověřovací kód. Zadej ho níže.");
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    resetMessages();
    setSubmitting(true);
    try {
      await verify(email, code);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontBody }}>
      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: 32, width: 380 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          {mode === "login" && <Lock size={18} color={C.turf} />}
          {mode === "register" && <UserPlus2 size={18} color={C.turf} />}
          {mode === "verify" && <MailCheck size={18} color={C.turf} />}
          <h1 style={{ fontFamily: fontDisplay, fontSize: 18, fontWeight: 700, color: C.ink }}>
            {mode === "login" && "Přihlášení do ScoutOS"}
            {mode === "register" && "Vytvořit účet"}
            {mode === "verify" && "Ověření e-mailu"}
          </h1>
        </div>

        {info && (
          <div style={{ background: "#E4EEE7", color: C.turf, padding: "9px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{info}</div>
        )}
        {error && (
          <div style={{ background: C.redSoft, color: C.red, padding: "9px 12px", borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        {mode === "login" && (
          <form onSubmit={handleLogin}>
            <label style={labelStyle}>E-mail</label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jmeno@klub.cz" required style={inputStyle} />
            <label style={labelStyle}>Heslo</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required style={inputStyle} />
            <button type="submit" disabled={submitting} style={buttonStyle(submitting)}>
              {submitting ? "Chvilku…" : "Přihlásit se"}
            </button>
            <button type="button" onClick={() => { setMode("register"); resetMessages(); }} style={linkButtonStyle}>
              Nemáš účet? Vytvoř si ho
            </button>
            <p style={{ fontSize: 11, color: C.inkFaint, marginTop: 16, lineHeight: 1.5, textAlign: "center" }}>
              Ukázkový účet: petr@scoutos.cz / heslo123
            </p>
          </form>
        )}

        {mode === "register" && (
          <form onSubmit={handleRegister}>
            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Jméno</label>
                <input type="text" value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Jan" required style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Příjmení</label>
                <input type="text" value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Novák" required style={inputStyle} />
              </div>
            </div>
            <label style={labelStyle}>E-mail</label>
            <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jmeno@klub.cz" required style={inputStyle} />
            <label style={labelStyle}>Heslo (min. 8 znaků)</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required minLength={8} style={inputStyle} />
            <label style={labelStyle}>Potvrzení hesla</label>
            <input type="password" value={passwordConfirm} onChange={(e) => setPasswordConfirm(e.target.value)} placeholder="••••••••" required minLength={8} style={inputStyle} />
            <button type="submit" disabled={submitting} style={buttonStyle(submitting)}>
              {submitting ? "Chvilku…" : "Vytvořit účet"}
            </button>
            <button type="button" onClick={() => { setMode("login"); resetMessages(); }} style={linkButtonStyle}>
              Už máš účet? Přihlas se
            </button>
          </form>
        )}

        {mode === "verify" && (
          <form onSubmit={handleVerify}>
            <p style={{ fontSize: 13, color: C.inkSoft, marginBottom: 16, lineHeight: 1.5 }}>
              Poslali jsme ověřovací kód na <strong>{email || "tvůj e-mail"}</strong>. Zkontroluj i složku Spam.
            </p>
            {!email && (
              <>
                <label style={labelStyle}>E-mail</label>
                <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jmeno@klub.cz" required style={inputStyle} />
              </>
            )}
            <label style={labelStyle}>Ověřovací kód</label>
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="123456"
              required
              maxLength={6}
              style={{ ...inputStyle, letterSpacing: 4, fontSize: 18, textAlign: "center", fontFamily: "'IBM Plex Mono', monospace" }}
            />
            <button type="submit" disabled={submitting} style={buttonStyle(submitting)}>
              {submitting ? "Ověřuji…" : "Ověřit a přihlásit se"}
            </button>
            <button type="button" onClick={() => { setMode("login"); resetMessages(); }} style={linkButtonStyle}>
              Zpět na přihlášení
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function buttonStyle(submitting) {
  return {
    width: "100%",
    padding: "10px",
    background: C.turf,
    color: "#fff",
    border: "none",
    borderRadius: 4,
    fontSize: 14,
    fontWeight: 600,
    cursor: submitting ? "default" : "pointer",
    opacity: submitting ? 0.7 : 1,
  };
}

const linkButtonStyle = {
  width: "100%",
  marginTop: 12,
  background: "none",
  border: "none",
  color: C.turf,
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};
