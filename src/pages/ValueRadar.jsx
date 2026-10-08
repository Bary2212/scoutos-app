import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Gem, ArrowRight, ServerCrash, Info } from "lucide-react";
import { apiFetch } from "../api.js";
import { computePlayerScore, STYLES } from "../lib/playerScore.js";

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

export default function ValueRadar() {
  const [style, setStyle] = useState("pressing");
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/players?category=Vše&maxAge=99&maxBudget=999999`)
      .then((res) => {
        if (!res.ok) throw new Error("Server odpověděl chybou.");
        return res.json();
      })
      .then(setPlayers)
      .catch(() => setError("Nepodařilo se připojit k serveru."))
      .finally(() => setLoading(false));
  }, []);

  const { ranked, incomplete } = useMemo(() => {
    // Do radaru patří jen hráči, které má přihlášený skaut ve svém sledování.
    const mine = players.filter((p) => p.hasMyEvaluation);
    const withScore = mine.map((p) => ({ p, ...computePlayerScore(p, style) }));
    const eligible = withScore.filter((x) => x.hasAnalytics && x.p.marketValue > 0);
    eligible.sort((a, b) => b.score / b.p.marketValue - a.score / a.p.marketValue);
    const missing = withScore
      .filter((x) => !(x.hasAnalytics && x.p.marketValue > 0))
      .map((x) => ({ p: x.p, needsStats: !x.hasAnalytics, needsValue: !(x.p.marketValue > 0) }));
    return { ranked: eligible, incomplete: missing };
  }, [players, style]);

  const maxRatio = ranked.length > 0 ? ranked[0].score / ranked[0].p.marketValue : 1;

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6, flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Gem size={18} color={C.turf} />
            <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>Radar hodnoty</h1>
          </div>
          <StyleSwitch active={style} onChange={setStyle} />
        </div>
        <p style={{ fontSize: 13, color: C.inkFaint, margin: "0 0 20px 0", maxWidth: 620 }}>
          Hráči seřazení podle poměru AI skóre k tržní hodnotě — nejvýhodnější podpisy (vysoký výkon za nízkou cenu) nahoře.
        </p>

        {error && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, background: C.redSoft, color: C.red, padding: "14px 16px", borderRadius: 6, marginBottom: 16, fontSize: 13 }}>
            <ServerCrash size={18} style={{ flexShrink: 0, marginTop: 1 }} />
            <strong>{error}</strong>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: C.inkFaint, fontSize: 13 }}>Načítám…</div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {ranked.map((entry, i) => {
                const { p, score } = entry;
                const ratio = score / p.marketValue;
                const barPct = maxRatio > 0 ? Math.max(4, (ratio / maxRatio) * 100) : 0;
                return (
                  <div key={p.id} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "14px 18px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <span
                          style={{
                            fontFamily: fontMono,
                            fontSize: 12,
                            fontWeight: 700,
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: i < 3 ? "#fff" : C.inkFaint,
                            background: i < 3 ? C.turf : C.lineSoft,
                          }}
                        >
                          {i + 1}
                        </span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                            <Link to={`/hrac/${p.id}`} style={{ fontSize: 11, color: C.turf, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                              Profil <ArrowRight size={11} />
                            </Link>
                          </div>
                          <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>
                            {p.position} — {p.club} — {p.marketValue.toFixed(1)}M €
                          </div>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: fontMono, fontSize: 16, fontWeight: 700, color: scoreColor(score) }}>{score}</div>
                        <div style={{ fontSize: 10, color: C.inkFaint }}>skóre</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, height: 6, background: C.lineSoft, borderRadius: 3, position: "relative" }}>
                        <div style={{ width: `${barPct}%`, height: "100%", borderRadius: 3, background: C.turf }} />
                      </div>
                      <span style={{ fontFamily: fontMono, fontSize: 11, color: C.inkSoft, whiteSpace: "nowrap" }}>
                        {ratio.toFixed(1)} skóre/M€
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {ranked.length === 0 && (
              <div style={{ textAlign: "center", padding: "32px 0 8px", color: C.inkFaint, fontSize: 13, lineHeight: 1.6 }}>
                {incomplete.length === 0
                  ? "Zatím nesleduješ žádného hráče. Přidej hráče a zadej mu statistiky a tržní hodnotu."
                  : "Radar potřebuje u hráče statistiky (skóre) i tržní hodnotu. Doplň, co chybí níže."}
              </div>
            )}

            {incomplete.length > 0 && (
              <div style={{ marginTop: 16, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>
                  <Info size={13} />
                  Tito hráči zatím nejsou v radaru:
                </div>
                {incomplete.map(({ p, needsStats, needsValue }) => (
                  <div key={p.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "6px 0", borderTop: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                    <Link to={`/hrac/${p.id}`} style={{ color: C.ink, fontWeight: 600, textDecoration: "none" }}>{p.name}</Link>
                    <span style={{ color: C.inkFaint, fontSize: 12 }}>
                      chybí {[needsStats && "statistiky", needsValue && "tržní hodnota (Rychlé info → Upravit)"].filter(Boolean).join(" a ")}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
