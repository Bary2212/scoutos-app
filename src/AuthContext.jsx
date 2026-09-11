import React, { createContext, useContext, useState } from "react";
import { API_BASE, getStoredUser, setSession, clearSession } from "./api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser());

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
    return data.user;
  };

  // Registrace teď NEVRACÍ rovnou token — účet musí být nejdřív ověřený kódem z e-mailu.
  const register = async (firstName, lastName, email, password, passwordConfirm) => {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim(),
        password,
        passwordConfirm,
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
    return data.user;
  };

  const logout = () => {
    clearSession();
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, login, register, verify, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
