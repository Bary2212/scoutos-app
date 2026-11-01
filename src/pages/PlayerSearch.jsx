import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Search, ChevronDown, ArrowRight, ServerCrash } from "lucide-react";
import { apiFetch } from "../api.js";


const C = {
  bg: "#F5F6F1",
  panel: "#FFFFFF",
  ink: "#14201A",
  inkSoft: "#57614F",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  turfDark: "#1F4A37",
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

const SCORE_KEYS = ["pressing", "possession", "defensive"];

// Celkové skóre = průměr tří uložených skóre (u ručně zadaných hráčů jsou stejná).
function overallScore(p) {
  const vals = SCORE_KEYS.map((k) => Number(p.scores?.[k])).filter(Number.isFinite);
  return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
}

// Důvod hodnocení: bere se z nejsilnější oblasti hráče.
function topReason(p) {
  const best = [...SCORE_KEYS].sort((a, b) => (p.scores?.[b] ?? 0) - (p.scores?.[a] ?? 0))[0];
  return p.reason?.[best] || "";
}

const POSITION_CATEGORIES = ["Vše", "Brankáři", "Obránci", "Záložníci", "Útočníci"];

function categoryOf(position) {
  if (position === "Brankář") return "Brankáři";
  if (["Pravý obránce", "Levý obránce", "Stoper"].includes(position)) return "Obránci";
  if (["Defenzivní záložník", "Ofenzivní záložník"].includes(position)) return "Záložníci";
  return "Útočníci";
}

// Data hráčů teď přicházejí ze skutečného backendu (server/index.js + server/data/db.json),
// ne z pole natvrdo v kódu jako dřív.

// Porovnání bez diakritiky a velikosti písmen ("Kovar" najde "Kovář").
function norm(str) {
  return String(str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

const STATUS_OPTIONS = ["Všichni", "Moje hodnocení", "Nehodnocení"];
const FOOT_OPTIONS = ["Obě", "Pravá", "Levá"];
const SORT_OPTIONS = [
  { id: "score", label: "Skóre" },
  { id: "age", label: "Věk (nejmladší)" },
  { id: "name", label: "Příjmení A–Z" },
];

// Klíč pro řazení podle příjmení: "Karel Suhr" -> "suhr karel" (bez diakritiky, bez mezer navíc).
function surnameKey(name) {
  const parts = norm(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  return `${parts[parts.length - 1]} ${parts.slice(0, -1).join(" ")}`;
}

function scoreColor(score) {
  if (score >= 75) return C.turf;
  if (score >= 60) return C.amber;
  return C.red;
}

export default function PlayerSearch() {
  const [category, setCategory] = useState("Vše");
  // Prázdné pole = bez omezení (dřív bylo napevno 14–30 a mladší hráči se nezobrazili).
  const [maxAge, setMaxAge] = useState("");
  const [minAge, setMinAge] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [bioFrom, setBioFrom] = useState("");
  const [bioTo, setBioTo] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("Všichni");
  const [foot, setFoot] = useState("Obě");
  const [sortBy, setSortBy] = useState("score");
  const [maxBudget, setMaxBudget] = useState("");
  const [expanded, setExpanded] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ category, maxAge: maxAge === "" ? 99 : maxAge, maxBudget: maxBudget === "" ? 999 : maxBudget });
    apiFetch(`/api/players?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Server odpověděl chybou.");
        return res.json();
      })
      .then((data) => setResults(data))
      .catch(() => setError("Nepodařilo se připojit k serveru na localhost:4000."))
      .finally(() => setLoading(false));
  }, [category, maxAge, maxBudget]);

  // Textové hledání a doplňkové filtry běží v prohlížeči nad výsledky ze serveru.
  const q = norm(query.trim());
  const visible = results
    .filter((p) => !q || norm(p.name).includes(q) || norm(p.club).includes(q))
    .filter((p) => minAge === "" || (p.age ?? 0) >= Number(minAge))
    .filter((p) => yearFrom === "" || (p.birthYear != null && p.birthYear >= Number(yearFrom)))
    .filter((p) => yearTo === "" || (p.birthYear != null && p.birthYear <= Number(yearTo)))
    .filter((p) => bioFrom === "" || (p.bioAge != null && p.bioAge >= Number(String(bioFrom).replace(",", "."))))
    .filter((p) => bioTo === "" || (p.bioAge != null && p.bioAge <= Number(String(bioTo).replace(",", "."))))
    .filter((p) => (status === "Moje hodnocení" ? p.hasMyEvaluation : status === "Nehodnocení" ? !p.hasMyEvaluation : true))
    .filter((p) => (foot === "Obě" ? true : norm(p.foot).startsWith(norm(foot).slice(0, 3))))
    .sort((a, b) => {
      if (sortBy === "age") return (a.age ?? 99) - (b.age ?? 99);
      if (sortBy === "name") return surnameKey(a.name).localeCompare(surnameKey(b.name));
      return (b.hasMyEvaluation ? overallScore(b) : -1) - (a.hasMyEvaluation ? overallScore(a) : -1);
    });

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Search size={18} color={C.turf} />
            <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>Vyhledávání hráčů</h1>
          </div>
          <Link
            to="/pridat-hrace"
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: C.turf, color: "#fff", borderRadius: 4, fontSize: 13, fontWeight: 600, textDecoration: "none" }}
          >
            + Přidat hráče
          </Link>
        </div>

        {/* ---------- Filters ---------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 20 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Hledat podle jména nebo klubu…"
            style={{ ...inputStyle, width: "100%", boxSizing: "border-box", marginBottom: 16, fontSize: 14 }}
          />
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <label style={labelStyle}>Pozice</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
                {POSITION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Věk od</label>
              <input type="number" min={0} placeholder="—" value={minAge} onChange={(e) => setMinAge(e.target.value)} style={{ ...inputStyle, width: 70 }} />
            </div>
            <div>
              <label style={labelStyle}>Věk do</label>
              <input type="number" min={0} placeholder="—" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} style={{ ...inputStyle, width: 70 }} />
            </div>
            <div>
              <label style={labelStyle}>Ročník od</label>
              <input type="number" placeholder="2012" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} style={{ ...inputStyle, width: 80 }} />
            </div>
            <div>
              <label style={labelStyle}>Ročník do</label>
              <input type="number" placeholder="2014" value={yearTo} onChange={(e) => setYearTo(e.target.value)} style={{ ...inputStyle, width: 80 }} />
            </div>
            <div>
              <label style={labelStyle}>Bio věk od</label>
              <input type="number" step="0.1" placeholder="—" value={bioFrom} onChange={(e) => setBioFrom(e.target.value)} style={{ ...inputStyle, width: 74 }} />
            </div>
            <div>
              <label style={labelStyle}>Bio věk do</label>
              <input type="number" step="0.1" placeholder="—" value={bioTo} onChange={(e) => setBioTo(e.target.value)} style={{ ...inputStyle, width: 74 }} />
            </div>
            <div>
              <label style={labelStyle}>Noha</label>
              <select value={foot} onChange={(e) => setFoot(e.target.value)} style={inputStyle}>
                {FOOT_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Stav</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} style={inputStyle}>
                {STATUS_OPTIONS.map((c) => (<option key={c} value={c}>{c}</option>))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Max. rozpočet (M €)</label>
              <input
                type="number"
                step="0.1"
                min="0"
                value={maxBudget}
                placeholder="bez limitu"
                onChange={(e) => setMaxBudget(e.target.value === "" ? "" : Number(e.target.value))}
                style={{ ...inputStyle, width: 110 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Řadit podle</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)} style={inputStyle}>
                {SORT_OPTIONS.map((o) => (<option key={o.id} value={o.id}>{o.label}</option>))}
              </select>
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 10 }}>
          {loading
            ? "Načítám…"
            : `${visible.length} ${visible.length === 1 ? "hráč odpovídá" : "hráčů odpovídá"} filtru${sortBy === "score" ? ", seřazeno podle skóre (nehodnocení na konci)" : ""}${bioFrom !== "" || bioTo !== "" ? ". Hráči bez zadaného bio věku se při tomto filtru nezobrazí." : ""}`}
        </div>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.redSoft, color: C.red, padding: "14px 16px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            <ServerCrash size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <div>
              <strong>{error}</strong>
              <div style={{ marginTop: 4, color: C.ink }}>
                Spusť backend příkazem <code style={{ fontFamily: fontMono, background: "#fff", padding: "1px 5px", borderRadius: 3 }}>npm run dev</code> ve složce <code style={{ fontFamily: fontMono, background: "#fff", padding: "1px 5px", borderRadius: 3 }}>server</code>.
              </div>
            </div>
          </div>
        )}

        {/* ---------- Results ---------- */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((p, i) => {
            const score = overallScore(p);
            const isExpanded = expanded === p.id;
            return (
              <div key={p.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span style={{ fontFamily: fontMono, fontSize: 12, color: C.inkFaint, width: 18 }}>{i + 1}.</span>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                        <Link to={`/hrac/${p.id}`} style={{ fontSize: 11, color: C.turf, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                          Profil <ArrowRight size={11} />
                        </Link>
                      </div>
                      <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>
                        {p.position} — {p.club} — {p.age} let{p.birthYear ? ` (${p.birthYear})` : ""}{p.bioAge != null ? ` — bio ${String(p.bioAge).replace(".", ",")}` : ""}{p.hasMyEvaluation && p.marketValue > 0 ? ` — ${p.marketValue.toFixed(1)}M €` : ""}
                      </div>
                    </div>
                  </div>
                  {p.hasMyEvaluation ? (
                    <button
                      onClick={() => setExpanded(isExpanded ? null : p.id)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 12px",
                        borderRadius: 4,
                        border: "none",
                        cursor: "pointer",
                        background: `${scoreColor(score)}1A`,
                        color: scoreColor(score),
                        fontFamily: fontMono,
                        fontWeight: 700,
                        fontSize: 15,
                      }}
                    >
                      {score}
                      <ChevronDown size={13} style={{ transform: isExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
                    </button>
                  ) : (
                    <Link
                      to={`/hrac/${p.id}/statistiky`}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 4,
                        background: C.lineSoft,
                        color: C.inkSoft,
                        fontSize: 12,
                        fontWeight: 600,
                        textDecoration: "none",
                        whiteSpace: "nowrap",
                      }}
                    >
                      Nehodnoceno — zadat
                    </Link>
                  )}
                </div>
                {isExpanded && p.hasMyEvaluation && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.inkSoft }}>
                    Proč: {topReason(p)}.
                  </div>
                )}
              </div>
            );
          })}
          {visible.length === 0 && !loading && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.inkFaint, fontSize: 13 }}>
              Žádný hráč neodpovídá zadaným filtrům. Zkus upravit hledání, věk nebo rozpočet — nebo hráče přidej tlačítkem „+ Přidat hráče“.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 11, color: C.inkFaint, marginBottom: 5, fontWeight: 600 };
const inputStyle = { padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody, color: C.ink };
