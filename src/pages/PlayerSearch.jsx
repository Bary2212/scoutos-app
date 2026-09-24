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

const STYLES = [
  { id: "pressing", label: "Presink" },
  { id: "possession", label: "Držení míče" },
  { id: "defensive", label: "Defenzivní blok" },
];

const POSITION_CATEGORIES = ["Vše", "Brankáři", "Obránci", "Záložníci", "Útočníci"];

function categoryOf(position) {
  if (position === "Brankář") return "Brankáři";
  if (["Pravý obránce", "Levý obránce", "Stoper"].includes(position)) return "Obránci";
  if (["Defenzivní záložník", "Ofenzivní záložník"].includes(position)) return "Záložníci";
  return "Útočníci";
}

// Data hráčů teď přicházejí ze skutečného backendu (server/index.js + server/data/db.json),
// ne z pole natvrdo v kódu jako dřív.

function scoreColor(score) {
  if (score >= 75) return C.turf;
  if (score >= 60) return C.amber;
  return C.red;
}

function StyleSwitch({ active, onChange }) {
  return (
    <div style={{ display: "inline-flex", border: `1px solid ${C.line}`, borderRadius: 5, overflow: "hidden" }}>
      {STYLES.map((s) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          style={{
            padding: "6px 12px",
            fontFamily: fontBody,
            fontSize: 12,
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
            color: active === s.id ? "#fff" : C.inkSoft,
            background: active === s.id ? C.turf : "#fff",
          }}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

export default function PlayerSearch() {
  const [style, setStyle] = useState("pressing");
  const [category, setCategory] = useState("Vše");
  const [maxAge, setMaxAge] = useState(30);
  const [maxBudget, setMaxBudget] = useState(3);
  const [expanded, setExpanded] = useState(null);
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ category, maxAge, maxBudget, style });
    apiFetch(`/api/players?${params}`)
      .then((res) => {
        if (!res.ok) throw new Error("Server odpověděl chybou.");
        return res.json();
      })
      .then((data) => setResults(data))
      .catch(() => setError("Nepodařilo se připojit k serveru na localhost:4000."))
      .finally(() => setLoading(false));
  }, [style, category, maxAge, maxBudget]);

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
              <label style={labelStyle}>Max. věk</label>
              <input type="number" value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} style={{ ...inputStyle, width: 70 }} />
            </div>
            <div>
              <label style={labelStyle}>Max. rozpočet (M €)</label>
              <input
                type="number"
                step="0.1"
                value={maxBudget}
                onChange={(e) => setMaxBudget(Number(e.target.value))}
                style={{ ...inputStyle, width: 90 }}
              />
            </div>
            <div>
              <label style={labelStyle}>Filozofie klubu</label>
              <StyleSwitch active={style} onChange={setStyle} />
            </div>
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 10 }}>
          {loading
            ? "Načítám…"
            : `${results.length} ${results.length === 1 ? "hráč odpovídá" : "hráčů odpovídá"} filtru, seřazeno podle skóre pro zvolenou filozofii`}
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
          {results.map((p, i) => {
            const score = p.scores[style];
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
                        {p.position} — {p.club} — {p.age} let — {p.marketValue.toFixed(1)}M €
                      </div>
                    </div>
                  </div>
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
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.lineSoft}`, fontSize: 13, color: C.inkSoft }}>
                    Proč: {p.reason[style]}.
                  </div>
                )}
              </div>
            );
          })}
          {results.length === 0 && (
            <div style={{ textAlign: "center", padding: "40px 0", color: C.inkFaint, fontSize: 13 }}>
              Žádný hráč neodpovídá zadaným filtrům. Zkus zvýšit rozpočet nebo věkový limit.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 11, color: C.inkFaint, marginBottom: 5, fontWeight: 600 };
const inputStyle = { padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody, color: C.ink };
