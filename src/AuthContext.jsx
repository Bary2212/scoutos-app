import React, { createContext, useContext, useState, useEffect } from "react";
import { API_BASE, getStoredUser, getToken, setSession, clearSession, apiFetch } from "./api.js";

const AuthContext = createContext(null);

const IDLE_LIMIT_MS = 30 * 60 * 1000; // 30 minut
const ACTIVITY_KEY = "scoutos_last_activity";
const IDLE_FLAG = "scoutos_idle_logout";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());

  // Po načtení appky si obnovíme roli a klub ze serveru — mohly se změnit (povýšení,
  // odebrání z klubu), zatímco byl uživatel přihlášený. Neplatný účet odhlásí.
  useEffect(() => {
    const token = getToken();
    if (!token) return;
    apiFetch("/api/auth/me")
      .then(async (res) => {
        if (res.status === 401) {
          clearSession();
          setUser(null);
          return;
        }
        if (!res.ok) return;
        const fresh = await res.json();
        setSession(token, fresh);
        setUser(fresh);
      })
      .catch(() => {});
  }, []);

  // Automatické odhlášení po 30 minutách nečinnosti. Čas poslední aktivity je v localStorage,
  // takže se počítá napříč kartami a funguje i po uspání notebooku nebo zavření prohlížeče.
  useEffect(() => {
    if (!user) return;
    const read = () => {
      try {
        return Number(localStorage.getItem(ACTIVITY_KEY)) || 0;
      } catch {
        return 0;
      }
    };
    const write = () => {
      try {
        localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
      } catch {}
    };
    const idleLogout = () => {
      try {
        sessionStorage.setItem(IDLE_FLAG, "1");
      } catch {}
      clearSession();
      setUser(null);
    };
    const check = () => {
      const last = read();
      if (last && Date.now() - last > IDLE_LIMIT_MS) idleLogout();
    };

    check(); // např. po otevření appky po delší době
    if (getToken()) write();

    let lastWrite = Date.now();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite > 5000) {
        lastWrite = now;
        write();
      }
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const onVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    const timer = setInterval(check, 30 * 1000);

    // Odhlášení v jiné kartě odhlásí i tuhle.
    const onStorage = (e) => {
      if (e.key === "scoutos_token" && !e.newValue) setUser(null);
    };
    window.addEventListener("storage", onStorage);

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
      window.removeEventListener("storage", onStorage);
      clearInterval(timer);
    };
  }, [user]);

  // Dotáhne aktuální údaje (role, klub, stav zkušební doby) ze serveru.
  const refreshUser = () => {
    const token = getToken();
    if (!token) return Promise.resolve();
    return apiFetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) return;
        const fresh = await res.json();
        setSession(token, fresh);
        setUser(fresh);
      })
      .catch(() => {});
  };

  const login = async (email, password) => {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), password }),
    });
    const data = await res.json();
    if (!res.ok) {
      const err = new Error(data.error || "Přihlášení se nezdařilo.");
      err.needsVerification = data.needsVerification;
      err.email = data.email;
      throw err;
    }
    setSession(data.token, data.user);
    setUser(data.user);
    refreshUser();
    return data.user;
  };

  // Registrace teď NEVRACÍ rovnou token — účet musí být nejdřív ověřený kódem z e-mailu.
  // inviteCode je nepovinný — pokud ho uživatel vyplní, přidá se jako skaut do
  // existujícího klubu; bez kódu dostane rovnou svůj vlastní nový klub.
  const register = async (firstName, lastName, email, password, passwordConfirm, inviteCode, acceptTerms) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        passwordConfirm,
        inviteCode: inviteCode ? inviteCode.trim() : undefined,
        acceptTerms: acceptTerms === true,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Registrace se nezdařila.");
    return data; // { message, email }
  };

  // Potvrzení ověřovacího kódu — teprve tohle appku skutečně přihlásí.
  const verify = async (email, code) => {
    const res = await fetch(`${API_BASE}/api/auth/verify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim(), code: code.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Ověření se nezdařilo.");
    setSession(data.token, data.user);
    setUser(data.user);
    refreshUser();
    return data.user;
  };

  const resendCode = async (email) => {
    const res = await fetch(`${API_BASE}/api/auth/resend-code`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Kód se nepodařilo poslat.");
    return data;
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, verify, resendCode, logout, refreshUser }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
