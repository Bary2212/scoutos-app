import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Plus, Pencil, Trash2, Check, X, AlertTriangle } from "lucide-react";
import { apiFetch } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { LEAGUE_SUGGESTIONS } from "../data/leagues.js";
import { MATCH_STATUS, formatKickoff, isUpcoming, toLocalInput } from "../lib/matches.js";

// Plánovač zápasů klubu. Hlavní skaut zápasy plánuje a přiděluje na ně skauty,
// běžný skaut vidí jen svoje zápasy a potvrzuje / odmítá / označuje je jako odehrané.

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

const inputStyle = { width: "100%", padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody, color: C.ink, background: "#fff" };
const labelStyle = { display: "block", fontSize: 12, color: C.inkFaint, marginBottom: 4, fontWeight: 600 };

function btn(color, outline) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 11px",
    borderRadius: 4,
    border: outline ? `1px solid ${C.line}` : "none",
    background: outline ? "#fff" : color,
    color: outline ? color : "#fff",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fontBody,
    cursor: "pointer",
  };
}

function StatusChip({ status, children }) {
  const st = MATCH_STATUS[status] || MATCH_STATUS.prideleno;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10, background: st.bg, color: st.fg }}>{children ?? st.label}</span>
  );
}

const EMPTY_FORM = { kickoff: "", fixture: "", competition: "", venue: "", note: "", scoutIds: [], playerIds: [] };

function MatchForm({ initial, options, onSave, onCancel, saving, error }) {
  const [form, setForm] = useState(initial);
  const [playerQuery, setPlayerQuery] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const toggle = (key, id) =>
    setForm((f) => ({ ...f, [key]: f[key].includes(id) ? f[key].filter((x) => x !== id) : [...f[key], id] }));
  const players = options.players.filter((p) => p.name.toLowerCase().includes(playerQuery.trim().toLowerCase()));

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(form);
      }}
      style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 20 }}
    >
      <div style={{ fontSize: 14, fontWeight: 700, fontFamily: fontDisplay, marginBottom: 14 }}>{initial.id ? "Upravit zápas" : "Naplánovat zápas"}</div>
      {error && <div style={{ background: C.redSoft, color: C.red, padding: "9px 12px", borderRadius: 4, fontSize: 12, marginBottom: 12 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Datum a čas *</label>
          <input type="datetime-local" required style={inputStyle} value={form.kickoff} onChange={set("kickoff")} />
        </div>
        <div>
          <label style={labelStyle}>Utkání *</label>
          <input required style={inputStyle} value={form.fixture} onChange={set("fixture")} placeholder="např. Zbrojovka Brno U14 – Sparta Praha U14" maxLength={200} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>Soutěž</label>
          <input style={inputStyle} list="zapas-souteze" value={form.competition} onChange={set("competition")} placeholder="např. Česká liga žáků U14" maxLength={120} />
          <datalist id="zapas-souteze">
            {LEAGUE_SUGGESTIONS.map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </div>
        <div>
          <label style={labelStyle}>Místo</label>
          <input style={inputStyle} value={form.venue} onChange={set("venue")} placeholder="stadion, město" maxLength={160} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Poznámka pro skauta</label>
        <textarea style={{ ...inputStyle, minHeight: 60, resize: "vertical" }} value={form.note} onChange={set("note")} placeholder="Na co se zaměřit, koho sledovat…" maxLength={1000} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label style={labelStyle}>Koho pošleš (skauti klubu)</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {options.scouts.map((s) => (
            <label key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, padding: "6px 10px", border: `1px solid ${form.scoutIds.includes(s.id) ? C.turf : C.line}`, background: form.scoutIds.includes(s.id) ? C.turfSoft : "#fff", borderRadius: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={form.scoutIds.includes(s.id)} onChange={() => toggle("scoutIds", s.id)} />
              {s.name}
              {s.role === "hlavni_skaut" && <span style={{ fontSize: 10, color: C.turf }}>(hlavní)</span>}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label style={labelStyle}>Koho sledovat (hráči klubu, nepovinné) — vybráno: {form.playerIds.length}</label>
        {options.players.length === 0 ? (
          <div style={{ fontSize: 12, color: C.inkFaint }}>Klub zatím nemá žádné hráče ke sledování.</div>
        ) : (
          <>
            {options.players.length > 8 && (
              <input style={{ ...inputStyle, marginBottom: 8 }} placeholder="Hledat hráče…" value={playerQuery} onChange={(e) => setPlayerQuery(e.target.value)} />
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, maxHeight: 150, overflowY: "auto" }}>
              {players.map((p) => (
                <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, padding: "5px 9px", border: `1px solid ${form.playerIds.includes(p.id) ? C.turf : C.line}`, background: form.playerIds.includes(p.id) ? C.turfSoft : "#fff", borderRadius: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={form.playerIds.includes(p.id)} onChange={() => toggle("playerIds", p.id)} />
                  {p.name} <span style={{ color: C.inkFaint }}>{p.position}</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" disabled={saving} style={{ ...btn(C.turf), opacity: saving ? 0.6 : 1 }}>
          <Check size={13} /> {saving ? "Ukládám…" : "Uložit zápas"}
        </button>
        <button type="button" onClick={onCancel} style={btn(C.inkSoft, true)}>
          <X size={13} /> Zrušit
        </button>
      </div>
    </form>
  );
}

function MatchCard({ match, head, busy, onEdit, onDelete, onStatus }) {
  const mine = match.myStatus;
  const conflictNames = match.scouts.filter((s) => match.conflicts.includes(s.userId)).map((s) => s.name);
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 12, color: C.inkFaint }}>
            {formatKickoff(match.kickoff)}
            {match.competition ? ` • ${match.competition}` : ""}
            {match.venue ? ` • ${match.venue}` : ""}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: fontDisplay, margin: "3px 0" }}>{match.fixture}</div>
        </div>
        {head && (
          <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
            <button onClick={() => onEdit(match)} style={btn(C.inkSoft, true)}>
              <Pencil size={12} /> Upravit
            </button>
            <button onClick={() => onDelete(match)} disabled={busy} style={btn(C.red, true)}>
              <Trash2 size={12} /> Smazat
            </button>
          </div>
        )}
      </div>

      {match.note && <div style={{ fontSize: 13, color: C.inkSoft, background: C.lineSoft, borderRadius: 4, padding: "8px 10px", margin: "8px 0", lineHeight: 1.5 }}>{match.note}</div>}

      {match.players.length > 0 && (
        <div style={{ fontSize: 12, color: C.inkSoft, margin: "8px 0" }}>
          <span style={{ color: C.inkFaint }}>Sledovat: </span>
          {match.players.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ", "}
              <Link to={`/hrac/${p.id}`} style={{ color: C.turf, fontWeight: 600, textDecoration: "none" }}>{p.name}</Link>
            </span>
          ))}
        </div>
      )}

      {head && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, margin: "8px 0", alignItems: "center" }}>
          {match.scouts.length === 0 ? (
            <StatusChip status="odmitnuto">Bez přiděleného skauta</StatusChip>
          ) : (
            match.scouts.map((s) => (
              <span key={s.userId} title={s.declineReason || undefined}>
                <StatusChip status={s.status}>
                  {s.name} • {MATCH_STATUS[s.status]?.label}
                  {s.status === "odmitnuto" && s.declineReason ? ` („${s.declineReason}“)` : ""}
                </StatusChip>
              </span>
            ))
          )}
        </div>
      )}

      {head && conflictNames.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.red, fontWeight: 600, margin: "6px 0" }}>
          <AlertTriangle size={13} /> Kolize termínů: {conflictNames.join(", ")} má v tu dobu další zápas.
        </div>
      )}

      {mine && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}` }}>
          <span style={{ fontSize: 12, color: C.inkFaint }}>{head ? "Ty na zápase:" : "Tvůj stav:"}</span>
          <StatusChip status={mine} />
          {(mine === "prideleno" || mine === "odmitnuto") && (
            <button onClick={() => onStatus(match, "potvrzeno")} disabled={busy} style={btn(C.turf)}>
              <Check size={12} /> {mine === "odmitnuto" ? "Přece pojedu" : "Potvrdit"}
            </button>
          )}
          {(mine === "prideleno" || mine === "potvrzeno") && (
            <button onClick={() => onStatus(match, "odmitnuto")} disabled={busy} style={btn(C.red, true)}>
              <X size={12} /> Odmítnout
            </button>
          )}
          {mine === "potvrzeno" && (
            <button onClick={() => onStatus(match, "odehrano")} disabled={busy} style={btn(C.turf, true)}>
              <Check size={12} /> Označit jako odehraný
            </button>
          )}
          {mine === "odehrano" && match.players.length > 0 && (
            <span style={{ fontSize: 12, color: C.inkSoft }}>
              Napiš report: {match.players.map((p, i) => (
                <span key={p.id}>
                  {i > 0 && ", "}
                  <Link to={`/hrac/${p.id}`} style={{ color: C.turf, fontWeight: 600, textDecoration: "none" }}>{p.name}</Link>
                </span>
              ))}
              {" "}(do pole „Zápas“ napiš: {match.fixture})
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export default function Matches() {
  const { user } = useAuth();
  const head = user?.role === "hlavni_skaut";
  const [matches, setMatches] = useState(null);
  const [options, setOptions] = useState({ scouts: [], players: [] });
  const [error, setError] = useState(null);
  const [formState, setFormState] = useState(null); // null | { initial }
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Odkaz z mapy pokrytí: /zapasy?liga=Slovenská liga otevře formulář s předvyplněnou soutěží.
  useEffect(() => {
    const liga = searchParams.get("liga");
    if (liga && head) {
      setFormState({ initial: { ...EMPTY_FORM, competition: liga } });
      setSearchParams({}, { replace: true });
    }
  }, [head, searchParams]);

  const load = () =>
    apiFetch("/api/club-matches")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setMatches)
      .catch(() => setError("Nepodařilo se načíst zápasy."));

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!head) return;
    apiFetch("/api/club-matches/options")
      .then((r) => (r.ok ? r.json() : null))
      .then((o) => o && setOptions(o))
      .catch(() => {});
  }, [head]);

  const upcoming = useMemo(() => (matches || []).filter(isUpcoming), [matches]);
  const past = useMemo(() => (matches || []).filter((m) => !isUpcoming(m)).reverse(), [matches]);

  const openNew = () => {
    setFormError(null);
    setFormState({ initial: { ...EMPTY_FORM } });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const openEdit = (m) => {
    setFormError(null);
    setFormState({
      initial: {
        id: m.id,
        kickoff: toLocalInput(m.kickoff),
        fixture: m.fixture,
        competition: m.competition,
        venue: m.venue,
        note: m.note,
        scoutIds: m.scouts.map((s) => s.userId),
        playerIds: m.players.map((p) => p.id),
      },
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async (form) => {
    setSaving(true);
    setFormError(null);
    try {
      const res = await apiFetch(form.id ? `/api/club-matches/${form.id}` : "/api/club-matches", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, kickoff: form.kickoff ? new Date(form.kickoff).toISOString() : "" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Uložení se nepovedlo.");
      setFormState(null);
      await load();
    } catch (e) {
      setFormError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (m) => {
    if (!window.confirm(`Smazat zápas „${m.fixture}“?`)) return;
    setBusy(true);
    try {
      const res = await apiFetch(`/api/club-matches/${m.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      await load();
    } catch {
      setError("Zápas se nepodařilo smazat.");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (m, status) => {
    let reason = "";
    if (status === "odmitnuto") {
      reason = window.prompt("Proč zápas odmítáš? (stručně, uvidí to hlavní skaut)") ?? null;
      if (reason === null) return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/club-matches/${m.id}/my-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, reason }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Nepodařilo se změnit stav.");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <CalendarDays size={18} color={C.turf} />
            <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>{head ? "Zápasy" : "Moje zápasy"}</h1>
          </div>
          {head && !formState && (
            <button onClick={openNew} style={btn(C.turf)}>
              <Plus size={13} /> Naplánovat zápas
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: C.inkFaint, margin: "0 0 20px", lineHeight: 1.5 }}>
          {head
            ? "Naplánuj zápas, přiděl na něj skauty a sleduj, kdo ho potvrdil a kdo už ho odehrál."
            : "Zápasy, na které tě poslal hlavní skaut. Potvrď je, nebo odmítni, a po zápase je označ jako odehrané."}
        </p>

        {error && <div style={{ background: C.redSoft, color: C.red, padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>}

        {head && formState && (
          <MatchForm initial={formState.initial} options={options} saving={saving} error={formError} onSave={save} onCancel={() => setFormState(null)} />
        )}

        {matches === null && !error && <div style={{ fontSize: 13, color: C.inkFaint }}>Načítám…</div>}

        {matches && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px" }}>Nadcházející ({upcoming.length})</div>
            {upcoming.length === 0 ? (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, fontSize: 13, color: C.inkFaint, marginBottom: 24 }}>
                {head ? "Zatím tu nejsou žádné nadcházející zápasy. Naplánuj první tlačítkem nahoře." : "Zatím tě nikdo neposlal na žádný zápas."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
                {upcoming.map((m) => (
                  <MatchCard key={m.id} match={m} head={head} busy={busy} onEdit={openEdit} onDelete={remove} onStatus={changeStatus} />
                ))}
              </div>
            )}

            {past.length > 0 && (
              <>
                <div style={{ fontSize: 13, fontWeight: 700, margin: "0 0 10px", color: C.inkSoft }}>Odehrané (posledních 30 dní)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {past.map((m) => (
                    <MatchCard key={m.id} match={m} head={head} busy={busy} onEdit={openEdit} onDelete={remove} onStatus={changeStatus} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
