import React, { useState, useEffect, useMemo } from "react";
import { Search, Trash2, MailCheck, Send, KeyRound, Download, Eraser, ChevronDown, ChevronRight } from "lucide-react";
import { apiFetch } from "../api.js";

// Správa uživatelů pro majitele appky: seznam všech účtů (i neověřených a demo),
// úprava jména/e-mailu/role, ruční ověření, nový kód, reset hesla, mazání,
// hromadný úklid neověřených registrací a export do CSV.

const C = {
  bg: "#F5F6F1",
  panel: "#FFFFFF",
  ink: "#14201A",
  inkSoft: "#57614F",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  turfSoft: "#E4EEE7",
  red: "#B23A2E",
  redSoft: "#F5E5E2",
  amber: "#C98A2C",
  amberSoft: "#F4EBDB",
  line: "#DADDD3",
  lineSoft: "#EAEBE4",
};
const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";
const fontMono = "'IBM Plex Mono', monospace";

function fmtDate(value) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" });
}

function fmtRelative(value) {
  if (!value) return "nikdy";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  return `před ${days} dny`;
}

async function readError(res, fallback) {
  try {
    const d = await res.json();
    return d.error || fallback;
  } catch {
    return fallback;
  }
}

function Badge({ children, tone }) {
  const tones = {
    green: { bg: C.turfSoft, fg: C.turf },
    amber: { bg: C.amberSoft, fg: C.amber },
    gray: { bg: C.lineSoft, fg: C.inkSoft },
  };
  const t = tones[tone] || tones.gray;
  return (
    <span style={{ display: "inline-block", fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: t.bg, color: t.fg, marginRight: 4 }}>
      {children}
    </span>
  );
}

const smallBtn = (variant) => ({
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  fontFamily: fontBody,
  fontSize: 12,
  fontWeight: 600,
  padding: "6px 10px",
  borderRadius: 4,
  cursor: "pointer",
  border: `1px solid ${variant === "danger" ? C.red : variant === "primary" ? C.turf : C.line}`,
  background: variant === "primary" ? C.turf : variant === "danger" ? "#fff" : "#fff",
  color: variant === "primary" ? "#fff" : variant === "danger" ? C.red : C.ink,
});

const input = { fontFamily: fontBody, fontSize: 12.5, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 4, boxSizing: "border-box", width: "100%" };

function UserDetail({ user, onChanged, onDeleted, flash }) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [role, setRole] = useState(user.role);
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [shownPassword, setShownPassword] = useState(null);

  const dirty = name.trim() !== user.name || email.trim() !== user.email || role !== user.role;

  async function call(path, options, okMsg) {
    setBusy(true);
    try {
      const res = await apiFetch(path, options);
      if (!res.ok) {
        flash(await readError(res, "Akce se nepovedla."), true);
        return null;
      }
      const data = await res.json();
      if (okMsg) flash(okMsg);
      return data;
    } catch {
      flash("Nepodařilo se spojit se serverem.", true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const json = (method, body) => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });

  async function save() {
    const data = await call(`/api/admin/users/${user.id}`, json("PATCH", { name, email, role }), "Změny uloženy.");
    if (data) onChanged(data);
  }

  async function verify() {
    const data = await call(`/api/admin/users/${user.id}/verify`, json("POST"), "Účet je ověřený.");
    if (data) onChanged(data);
  }

  async function resend() {
    await call(`/api/admin/users/${user.id}/resend-code`, json("POST"), "Kód odeslán.");
  }

  async function resetPassword() {
    const data = await call(`/api/admin/users/${user.id}/reset-password`, json("POST", newPassword ? { password: newPassword } : {}), "Heslo změněno.");
    if (data) {
      setShownPassword(data.password || null);
      setNewPassword("");
    }
  }

  async function remove() {
    const extra = user.evaluations > 0 ? ` Smaže se i ${user.evaluations} jeho hodnocení hráčů.` : "";
    if (!window.confirm(`Opravdu smazat uživatele ${user.name} (${user.email})?${extra} Nejde to vrátit.`)) return;
    const data = await call(`/api/admin/users/${user.id}`, { method: "DELETE" }, "Uživatel smazán.");
    if (data) onDeleted(user.id);
  }

  const label = { display: "block", fontSize: 11, color: C.inkFaint, marginBottom: 4 };

  return (
    <div style={{ background: C.bg, border: `1px solid ${C.lineSoft}`, borderRadius: 6, padding: 14, margin: "4px 0 10px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={label}>Jméno a příjmení</label>
          <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label style={label}>E-mail</label>
          <input style={input} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div>
          <label style={label}>Role</label>
          <select style={input} value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="skaut">Skaut</option>
            <option value="hlavni_skaut">Hlavní skaut</option>
          </select>
        </div>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        <button style={{ ...smallBtn("primary"), opacity: dirty && !busy ? 1 : 0.45 }} disabled={!dirty || busy} onClick={save}>
          Uložit změny
        </button>
        {!user.verified && (
          <>
            <button style={smallBtn()} disabled={busy} onClick={verify}>
              <MailCheck size={13} /> Ověřit ručně
            </button>
            <button style={smallBtn()} disabled={busy} onClick={resend}>
              <Send size={13} /> Poslat kód znovu
            </button>
          </>
        )}
        {!user.isDemo && !user.isSelf && (
          <button style={smallBtn("danger")} disabled={busy} onClick={remove}>
            <Trash2 size={13} /> Smazat uživatele
          </button>
        )}
      </div>

      {!user.isDemo && (
        <div style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 12 }}>
          <label style={label}>Nové heslo (nech prázdné, vygeneruje se náhodné)</label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input style={{ ...input, maxWidth: 240 }} type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="min. 8 znaků" />
            <button style={smallBtn()} disabled={busy} onClick={resetPassword}>
              <KeyRound size={13} /> Změnit heslo
            </button>
          </div>
          {shownPassword && (
            <div style={{ marginTop: 10, fontSize: 12.5, background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 4, padding: "8px 10px" }}>
              Nové heslo (zobrazí se jen teď, pošli ho uživateli): <strong style={{ fontFamily: fontMono }}>{shownPassword}</strong>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AdminUsers() {
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | verified | unverified | demo
  const [openId, setOpenId] = useState(null);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiFetch("/api/admin/users")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setUsers)
      .catch(() => setError(true));
  }, []);

  function flash(message, isError) {
    setToast({ message, isError: !!isError });
    setTimeout(() => setToast(null), 3500);
  }

  function handleChanged(updated) {
    setUsers((list) => list.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)));
  }

  function handleDeleted(id) {
    setUsers((list) => list.filter((u) => u.id !== id));
    setOpenId(null);
  }

  const counts = useMemo(() => {
    const list = users || [];
    return {
      all: list.length,
      verified: list.filter((u) => u.verified && !u.isDemo).length,
      unverified: list.filter((u) => !u.verified && !u.isDemo).length,
      demo: list.filter((u) => u.isDemo).length,
    };
  }, [users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (users || []).filter((u) => {
      if (filter === "verified" && !(u.verified && !u.isDemo)) return false;
      if (filter === "unverified" && !(!u.verified && !u.isDemo)) return false;
      if (filter === "demo" && !u.isDemo) return false;
      if (!q) return true;
      return [u.name, u.email, u.clubName].some((v) => String(v || "").toLowerCase().includes(q));
    });
  }, [users, query, filter]);

  async function cleanup() {
    const old = (users || []).filter((u) => !u.verified && !u.isDemo && !u.isSelf && Date.now() - new Date(u.createdAt).getTime() > 7 * 86400000).length;
    if (old === 0) {
      flash("Žádné neověřené registrace starší než 7 dní.");
      return;
    }
    if (!window.confirm(`Smazat ${old} neověřených registrací starších než 7 dní? Nejde to vrátit.`)) return;
    try {
      const res = await apiFetch("/api/admin/cleanup-unverified", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ days: 7 }) });
      if (!res.ok) throw new Error();
      const data = await res.json();
      flash(`Smazáno: ${data.deleted}`);
      const fresh = await apiFetch("/api/admin/users").then((r) => r.json());
      setUsers(fresh);
    } catch {
      flash("Úklid se nepovedl.", true);
    }
  }

  function exportCsv() {
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Jméno", "E-mail", "Klub", "Tarif klubu", "Role", "Ověřen", "Demo", "Registrován", "Poslední přihlášení", "Hodnocení"];
    const rows = visible.map((u) => [
      u.name,
      u.email,
      u.clubName || "",
      u.clubPlan === "paid" ? "Placený" : u.clubPlan ? "Zdarma" : "",
      u.role === "hlavni_skaut" ? "Hlavní skaut" : "Skaut",
      u.verified ? "ano" : "ne",
      u.isDemo ? "ano" : "ne",
      u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "",
      u.lastLoginAt ? new Date(u.lastLoginAt).toISOString().slice(0, 10) : "",
      u.evaluations,
    ]);
    const csv = "﻿" + [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `scoutos-uzivatele-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (error) return <div style={{ fontSize: 13, color: C.red, padding: 20 }}>Nepodařilo se načíst uživatele.</div>;
  if (!users) return <div style={{ fontSize: 13, color: C.inkFaint, padding: 20 }}>Načítám uživatele…</div>;

  const th = { padding: "8px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkFaint, textAlign: "left", borderBottom: `1px solid ${C.line}` };
  const td = { padding: "9px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: "middle" };

  const chip = (id, label) => (
    <button
      key={id}
      onClick={() => setFilter(id)}
      style={{
        fontFamily: fontBody,
        fontSize: 12,
        fontWeight: 600,
        padding: "5px 11px",
        borderRadius: 14,
        cursor: "pointer",
        border: `1px solid ${filter === id ? C.turf : C.line}`,
        background: filter === id ? C.turfSoft : "#fff",
        color: filter === id ? C.turf : C.inkSoft,
      }}
    >
      {label} <span style={{ fontFamily: fontMono, opacity: 0.8 }}>{counts[id]}</span>
    </button>
  );

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 22px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 240px", maxWidth: 360 }}>
          <Search size={14} color={C.inkFaint} style={{ position: "absolute", left: 10, top: 9 }} />
          <input style={{ ...input, paddingLeft: 30 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Hledat jméno, e-mail nebo klub…" />
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {chip("all", "Všichni")}
          {chip("verified", "Ověření")}
          {chip("unverified", "Neověření")}
          {chip("demo", "Demo")}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button style={smallBtn()} onClick={cleanup}>
            <Eraser size={13} /> Smazat neověřené (&gt; 7 dní)
          </button>
          <button style={smallBtn()} onClick={exportCsv}>
            <Download size={13} /> Export CSV
          </button>
        </div>
      </div>

      {toast && (
        <div style={{ fontSize: 12.5, padding: "8px 12px", borderRadius: 4, marginBottom: 12, background: toast.isError ? C.redSoft : C.turfSoft, color: toast.isError ? C.red : C.turf }}>
          {toast.message}
        </div>
      )}

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 20 }} />
              <th style={th}>Jméno</th>
              <th style={th}>E-mail</th>
              <th style={th}>Klub</th>
              <th style={th}>Stav</th>
              <th style={th}>Registrován</th>
              <th style={th}>Přihlášen</th>
              <th style={{ ...th, textAlign: "right" }}>Hodnocení</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...td, color: C.inkFaint, textAlign: "center", padding: 24 }}>
                  Nic nenalezeno.
                </td>
              </tr>
            )}
            {visible.map((u) => {
              const open = openId === u.id;
              return (
                <React.Fragment key={u.id}>
                  <tr onClick={() => setOpenId(open ? null : u.id)} style={{ cursor: "pointer", background: open ? C.bg : "transparent" }}>
                    <td style={td}>{open ? <ChevronDown size={14} color={C.inkFaint} /> : <ChevronRight size={14} color={C.inkFaint} />}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{u.name}</td>
                    <td style={{ ...td, color: C.inkSoft }}>{u.email}</td>
                    <td style={td}>
                      {u.clubName || "—"}
                      {u.clubPlan === "paid" && <span style={{ marginLeft: 6 }}><Badge tone="green">Placený</Badge></span>}
                    </td>
                    <td style={td}>
                      {u.verified ? <Badge tone="green">Ověřen</Badge> : <Badge tone="amber">Neověřen</Badge>}
                      {u.isDemo && <Badge tone="gray">Demo</Badge>}
                      {u.isSelf && <Badge tone="gray">Ty</Badge>}
                      {u.role === "hlavni_skaut" && <Badge tone="gray">Hlavní skaut</Badge>}
                    </td>
                    <td style={{ ...td, color: C.inkSoft }}>{fmtDate(u.createdAt)}</td>
                    <td style={{ ...td, color: C.inkSoft }}>{fmtRelative(u.lastLoginAt)}</td>
                    <td style={{ ...td, textAlign: "right", fontFamily: fontMono }}>{u.evaluations}</td>
                  </tr>
                  {open && (
                    <tr>
                      <td colSpan={8} style={{ padding: "0 4px" }}>
                        <UserDetail user={u} onChanged={handleChanged} onDeleted={handleDeleted} flash={flash} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
