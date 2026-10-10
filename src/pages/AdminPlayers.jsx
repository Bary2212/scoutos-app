import React, { useState, useEffect, useMemo } from "react";
import { Search, Trash2 } from "lucide-react";
import { apiFetch } from "../api.js";

// Správa hráčů pro majitele appky: všichni hráči v databázi (i ukázkoví a osiřelí),
// filtr a úplné smazání — jednotlivě nebo hromadně přes zaškrtnutí.

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
const fontBody = "'Inter', sans-serif";

export default function AdminPlayers() {
  const [players, setPlayers] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all"); // all | demo | real | orphan
  const [selected, setSelected] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    apiFetch("/api/admin/players")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(setPlayers)
      .catch(() => setError("Nepodařilo se načíst hráče."));
  }, []);

  const norm = (v) => String(v || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  const visible = useMemo(() => {
    if (!players) return [];
    const q = norm(query.trim());
    return players.filter((p) => {
      if (filter === "demo" && !p.isDemo) return false;
      if (filter === "real" && p.isDemo) return false;
      if (filter === "orphan" && p.evaluations > 0) return false;
      if (!q) return true;
      return norm(`${p.name} ${p.club} ${p.position} ${p.scouts} ${p.creator || ""}`).includes(q);
    });
  }, [players, query, filter]);

  const toggle = (id) =>
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((p) => selected.has(p.id));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((p) => next.delete(p.id));
      else visible.forEach((p) => next.add(p.id));
      return next;
    });

  const flash = (message, isError) => {
    setToast({ message, isError: !!isError });
    setTimeout(() => setToast(null), 3500);
  };

  const deleteIds = async (ids, label) => {
    if (ids.length === 0) return;
    if (!window.confirm(`Opravdu smazat ${label} úplně? Smažou se i hodnocení, reporty a komentáře všech skautů. Nejde to vrátit.`)) return;
    setBusy(true);
    try {
      const res = await apiFetch("/api/admin/players/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Mazání se nepovedlo.");
      const gone = new Set(ids);
      setPlayers((list) => list.filter((p) => !gone.has(p.id)));
      setSelected((prev) => new Set([...prev].filter((id) => !gone.has(id))));
      flash(`Smazáno: ${ids.length}`);
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div style={{ color: C.red, fontSize: 13 }}>{error}</div>;
  if (!players) return <div style={{ fontSize: 13, color: C.inkFaint }}>Načítám…</div>;

  const chip = (id, label, count) => (
    <button
      key={id}
      onClick={() => setFilter(id)}
      style={{
        padding: "5px 11px",
        borderRadius: 14,
        border: `1px solid ${filter === id ? C.turf : C.line}`,
        background: filter === id ? C.turfSoft : "#fff",
        color: filter === id ? C.turf : C.inkSoft,
        fontSize: 12,
        fontWeight: 600,
        fontFamily: fontBody,
        cursor: "pointer",
      }}
    >
      {label} ({count})
    </button>
  );

  return (
    <div style={{ fontFamily: fontBody, color: C.ink }}>
      {toast && (
        <div style={{ position: "fixed", top: 70, right: 20, background: toast.isError ? C.redSoft : C.turfSoft, color: toast.isError ? C.red : C.turf, padding: "10px 14px", borderRadius: 6, fontSize: 13, fontWeight: 600, zIndex: 50 }}>
          {toast.message}
        </div>
      )}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <div style={{ position: "relative", flex: "1 1 240px" }}>
          <Search size={14} color={C.inkFaint} style={{ position: "absolute", left: 10, top: 10 }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hledat jméno, klub, skauta…"
            style={{ width: "100%", padding: "8px 10px 8px 30px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
          />
        </div>
        {chip("all", "Všichni", players.length)}
        {chip("demo", "Ukázkoví", players.filter((p) => p.isDemo).length)}
        {chip("real", "Skuteční", players.filter((p) => !p.isDemo).length)}
        {chip("orphan", "Bez hodnocení", players.filter((p) => p.evaluations === 0).length)}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10, fontSize: 12, color: C.inkSoft }}>
        <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
          <input type="checkbox" checked={allVisibleSelected} onChange={toggleAllVisible} /> Vybrat vše zobrazené ({visible.length})
        </label>
        <button
          onClick={() => deleteIds([...selected], `${selected.size} vybraných hráčů`)}
          disabled={busy || selected.size === 0}
          style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: selected.size ? C.red : C.lineSoft, color: selected.size ? "#fff" : C.inkFaint, border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: selected.size ? "pointer" : "default", fontFamily: fontBody }}
        >
          <Trash2 size={13} /> Smazat vybrané ({selected.size})
        </button>
      </div>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6 }}>
        {visible.length === 0 && <div style={{ padding: 18, fontSize: 13, color: C.inkFaint }}>Žádní hráči.</div>}
        {visible.map((p) => (
          <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderBottom: `1px solid ${C.lineSoft}` }}>
            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>
                {p.name}{" "}
                <span style={{ fontSize: 11, fontWeight: 400, color: C.inkFaint }}>
                  {[p.position, p.club, p.age ? `${p.age} let` : null].filter(Boolean).join(" • ")}
                </span>
                {p.isDemo && (
                  <span style={{ marginLeft: 6, fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: C.amberSoft, color: C.amber }}>ukázkový</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
                {p.evaluations === 0 ? "bez hodnocení" : `hodnotí: ${p.scouts}`}
                {p.creator ? ` • založil: ${p.creator}` : ""}
              </div>
            </div>
            <button
              onClick={() => deleteIds([p.id], p.name)}
              disabled={busy}
              title="Smazat úplně"
              style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: "#fff", color: C.red, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: fontBody }}
            >
              <Trash2 size={12} /> Smazat
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
