import React, { useState, useEffect } from "react";
import { BarChart3, Loader2, Check } from "lucide-react";
import { apiFetch } from "../api.js";
import AdminUsers from "./AdminUsers.jsx";

// Admin přehled majitele appky — počty uživatelů a klubů, registrace v čase a
// ruční správa tarifu klubů (zdarma / placený). Backend ho pustí jen účtu,
// jehož e-mail je v proměnné prostředí ADMIN_EMAIL (jinak 403).

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
  if (!value) return "—";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days <= 0) return "dnes";
  if (days === 1) return "včera";
  return `před ${days} dny`;
}

function Tile({ label, value, sub }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "14px 16px" }}>
      <div style={{ fontFamily: fontMono, fontSize: 24, fontWeight: 600, color: C.ink, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11.5, color: C.inkSoft, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Jednoduchý sloupcový graf registrací za posledních 30 dní (čisté SVG, bez knihovny).
function SignupsChart({ data }) {
  const W = 600;
  const H = 110;
  const padBottom = 18;
  const max = Math.max(1, ...data.map((d) => d.count));
  const barW = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block" }} role="img" aria-label="Registrace za posledních 30 dní">
      {data.map((d, i) => {
        const h = (d.count / max) * (H - padBottom - 6);
        return (
          <g key={d.day}>
            <title>{`${fmtDate(d.day)}: ${d.count}`}</title>
            <rect x={i * barW + 2} y={H - padBottom - h} width={Math.max(2, barW - 4)} height={Math.max(h, d.count > 0 ? 2 : 0)} rx={2} fill={C.turf} />
            <rect x={i * barW + 2} y={H - padBottom - 1} width={Math.max(2, barW - 4)} height={1} fill={C.line} />
          </g>
        );
      })}
      <text x={0} y={H - 3} fontSize={9} fill={C.inkFaint} fontFamily={fontBody}>
        {fmtDate(data[0]?.day)}
      </text>
      <text x={W} y={H - 3} fontSize={9} fill={C.inkFaint} fontFamily={fontBody} textAnchor="end">
        {fmtDate(data[data.length - 1]?.day)}
      </text>
      <text x={W} y={9} fontSize={9} fill={C.inkFaint} fontFamily={fontMono} textAnchor="end">
        max {max}/den
      </text>
    </svg>
  );
}

function ClubRow({ club, onSaved }) {
  const [clubName, setClubName] = useState(club.name);
  const [plan, setPlan] = useState(club.plan);
  const [note, setNote] = useState(club.planNote || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(false);

  const nameChanged = clubName.trim() !== club.name;
  const planChanged = plan !== club.plan || (note.trim() || "") !== (club.planNote || "");
  const dirty = (nameChanged && clubName.trim() !== "") || planChanged;

  async function save() {
    setSaving(true);
    setError(false);
    try {
      let result = { plan: club.plan, planNote: club.planNote, planUpdatedAt: club.planUpdatedAt, name: club.name };
      if (nameChanged && clubName.trim()) {
        const r = await apiFetch(`/api/admin/clubs/${club.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: clubName }),
        });
        if (!r.ok) throw new Error();
        result = { ...result, name: (await r.json()).name };
      }
      if (planChanged) {
        const r = await apiFetch(`/api/admin/clubs/${club.id}/plan`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, note }),
        });
        if (!r.ok) throw new Error();
        result = { ...result, ...(await r.json()) };
      }
      onSaved(club.id, result);
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const cell = { padding: "9px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}`, verticalAlign: "middle" };

  return (
    <tr>
      <td style={cell}>
        <input
          value={clubName}
          onChange={(e) => setClubName(e.target.value.slice(0, 100))}
          style={{ width: "100%", minWidth: 150, boxSizing: "border-box", fontFamily: fontBody, fontSize: 12.5, fontWeight: 600, padding: "5px 8px", border: `1px solid ${C.lineSoft}`, borderRadius: 4, background: "transparent" }}
        />
      </td>
      <td style={{ ...cell, textAlign: "right", fontFamily: fontMono }}>{club.scouts}</td>
      <td style={{ ...cell, textAlign: "right", fontFamily: fontMono }}>{club.evaluations}</td>
      <td style={{ ...cell, color: C.inkSoft }}>{fmtRelative(club.lastActivity)}</td>
      <td style={{ ...cell, color: C.inkSoft }}>{fmtDate(club.createdAt)}</td>
      <td style={cell}>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          style={{
            fontFamily: fontBody,
            fontSize: 12,
            fontWeight: 600,
            padding: "4px 6px",
            borderRadius: 4,
            border: `1px solid ${plan === "paid" ? C.turf : C.line}`,
            background: plan === "paid" ? C.turfSoft : "#fff",
            color: plan === "paid" ? C.turf : C.ink,
          }}
        >
          <option value="free">Zdarma</option>
          <option value="paid">Placený</option>
        </select>
      </td>
      <td style={cell}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 200))}
          placeholder="např. faktura 2026-014"
          style={{ width: "100%", minWidth: 140, boxSizing: "border-box", fontFamily: fontBody, fontSize: 12, padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: 4 }}
        />
      </td>
      <td style={{ ...cell, whiteSpace: "nowrap" }}>
        <button
          onClick={save}
          disabled={!dirty || saving}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 12,
            fontWeight: 600,
            padding: "5px 10px",
            borderRadius: 4,
            border: "none",
            background: dirty ? C.turf : C.lineSoft,
            color: dirty ? "#fff" : C.inkFaint,
            cursor: dirty && !saving ? "pointer" : "default",
          }}
        >
          {saving ? <Loader2 size={12} className="admin-spin" /> : saved ? <Check size={12} /> : null}
          {saved ? "Uloženo" : "Uložit"}
        </button>
        {error && <span style={{ marginLeft: 6, fontSize: 11, color: C.red }}>Nepovedlo se</span>}
      </td>
    </tr>
  );
}

export default function AdminOverview() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | forbidden | error
  const [tab, setTab] = useState("overview"); // overview | users

  useEffect(() => {
    apiFetch("/api/admin/overview")
      .then((res) => {
        if (res.status === 403) {
          setStatus("forbidden");
          return null;
        }
        if (!res.ok) throw new Error("fail");
        return res.json();
      })
      .then((d) => {
        if (!d) return;
        setData(d);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, []);

  function handleSaved(clubId, saved) {
    setData((d) => {
      const clubs = d.clubs.map((c) => (c.id === clubId ? { ...c, name: saved.name ?? c.name, plan: saved.plan, planNote: saved.planNote, planUpdatedAt: saved.planUpdatedAt } : c));
      return { ...d, clubs, totals: { ...d.totals, paidClubs: clubs.filter((c) => c.plan === "paid").length } };
    });
  }

  const page = { background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink };

  if (status === "loading") {
    return <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: C.inkFaint }}>Načítám přehled…</div>;
  }
  if (status === "forbidden" || status === "error") {
    return (
      <div style={{ ...page, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
            {status === "forbidden" ? "K tomuhle nemáš oprávnění" : "Nepodařilo se načíst přehled"}
          </div>
          <div style={{ fontSize: 13, color: C.inkSoft }}>
            {status === "forbidden"
              ? "Tahle stránka je dostupná jen majiteli appky."
              : "Zkus to prosím znovu o chvíli později."}
          </div>
        </div>
      </div>
    );
  }

  const { totals, signupsByDay, clubs, recentSignups } = data;
  const th = { padding: "8px 10px", fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkFaint, textAlign: "left", borderBottom: `1px solid ${C.line}` };

  return (
    <div style={page}>
      <style>{`
        @keyframes admin-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .admin-spin { animation: admin-spin 0.8s linear infinite; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <BarChart3 size={18} color={C.turf} />
          <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>Admin přehled</h1>
        </div>
        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 14 }}>Přehled bez demo účtů a bez neověřených registrací. Všechny účty najdeš v záložce Uživatelé.</div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: `1px solid ${C.line}` }}>
          {[["overview", "Přehled"], ["users", "Uživatelé"]].map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                fontFamily: fontBody,
                fontSize: 13,
                fontWeight: tab === id ? 700 : 500,
                padding: "8px 14px",
                border: "none",
                borderBottom: `2px solid ${tab === id ? C.turf : "transparent"}`,
                background: "none",
                color: tab === id ? C.ink : C.inkFaint,
                cursor: "pointer",
                marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "users" && <AdminUsers />}
        {tab === "overview" && (
          <>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12, marginBottom: 20 }}>
          <Tile label="Ověření uživatelé" value={totals.users} sub={totals.unverifiedUsers > 0 ? `+ ${totals.unverifiedUsers} neověřených` : undefined} />
          <Tile label="Kluby" value={totals.clubs} />
          <Tile label="Placené kluby" value={`${totals.paidClubs} / ${totals.clubs}`} />
          <Tile label="Registrace za 7 dní" value={totals.signups7d} />
          <Tile label="Registrace za 30 dní" value={totals.signups30d} />
          <Tile label="Sledovaní hráči" value={totals.playersTracked} />
          <Tile label="Hodnocení" value={totals.evaluations} />
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 22px", marginBottom: 20 }}>
          <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Registrace za posledních 30 dní</div>
          <SignupsChart data={signupsByDay} />
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 22px", marginBottom: 20 }}>
          <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Kluby a tarify</div>
          <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 10 }}>
            Tarif se zatím nastavuje ručně — po přijetí platby přepni klub na „Placený“ a do poznámky napiš třeba číslo faktury.
          </div>
          {clubs.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkFaint, padding: "10px 0" }}>Zatím žádný reálný klub.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={th}>Klub</th>
                    <th style={{ ...th, textAlign: "right" }}>Skautů</th>
                    <th style={{ ...th, textAlign: "right" }}>Hodnocení</th>
                    <th style={th}>Poslední aktivita</th>
                    <th style={th}>Registrován</th>
                    <th style={th}>Tarif</th>
                    <th style={th}>Poznámka</th>
                    <th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {clubs.map((club) => (
                    <ClubRow key={club.id} club={club} onSaved={handleSaved} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 22px" }}>
          <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Poslední registrace</div>
          {recentSignups.length === 0 ? (
            <div style={{ fontSize: 13, color: C.inkFaint }}>Zatím nikdo.</div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
                <thead>
                  <tr>
                    <th style={th}>Jméno</th>
                    <th style={th}>E-mail</th>
                    <th style={th}>Klub</th>
                    <th style={th}>Role</th>
                    <th style={th}>Kdy</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSignups.map((u, i) => (
                    <tr key={i}>
                      <td style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}`, fontWeight: 600 }}>{u.name}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}`, color: C.inkSoft }}>{u.email}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}` }}>{u.clubName || "—"}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}`, color: C.inkSoft }}>{u.role === "hlavni_skaut" ? "Hlavní skaut" : "Skaut"}</td>
                      <td style={{ padding: "8px 10px", fontSize: 12.5, borderBottom: `1px solid ${C.lineSoft}`, color: C.inkSoft }}>{fmtRelative(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
          </>
        )}
      </div>
    </div>
  );
}
