// Sdílený pomocník pro volání backendu. Centralizuje API_BASE a automaticky
// přidává Authorization hlavičku, pokud je uživatel přihlášený — díky tomu
// to nemusí řešit každá stránka zvlášť.

// V lokálním vývoji míří appka na localhost:4000. Po nasazení na hosting
// (Vercel) se místo toho použije adresa nastavená v proměnné prostředí
// VITE_API_BASE (nastavuje se v dashboardu Vercelu, ne v kódu).
export const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";

const TOKEN_KEY = "scoutos_token";
const USER_KEY = "scoutos_user";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  return raw ? JSON.parse(raw) : null;
}

export function setSession(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function apiFetch(path, options = {}) {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  return fetch(`${API_BASE}${path}`, { ...options, headers });
}
