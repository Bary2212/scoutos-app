import React, { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Scale, ArrowLeft, AlertTriangle, ArrowUpRight, ArrowDownRight, Loader2 } from "lucide-react";
import { apiFetch } from "../api.js";
import { ratingFromPercentile, ratingLabel } from "../data/scoutMetrics.js";
import { computePlayerScore } from "../lib/playerScore.js";

// Porovnání 2–3 hráčů vedle sebe — otevírá se ze Shortlisty (vyber hráče
// checkboxy, pak "Porovnat"). Používá stejný GET /api/players/:id endpoint
// jako PlayerProfile, takže respektuje vlastní (skautovo) hodnocení.

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

function riskLabelText(risk) {
  return { low: "Nízké", medium: "Střední", high: "Vysoké" }[risk] || "—";
}
function riskStyle(risk) {
  return (
    { low: { c: C.turf, bg: C.turfSoft }, medium: { c: C.amber, bg: C.amberSoft }, high: { c: C.red, bg: C.redSoft } }[risk] || {
      c: C.inkFaint,
      bg: C.lineSoft,
    }
  );
}

function ScoreDial({ value, highlight }) {
  const radius = 46;
  const stroke = 9;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const color = value >= 70 ? C.turf : value >= 50 ? C.amber : C.red;
  const size = (radius + stroke) * 2;
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={C.lineSoft} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{value}</span>
      </div>
      {highlight && (
        <div
          style={{
            position: "absolute",
            top: -6,
            right: -6,
            background: C.turf,
            color: "#fff",
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 5px",
            borderRadius: 3,
          }}
        >
          TOP
        </div>
      )}
    </div>
  );
}

// Jeden řádek srovnání metriky — vlevo popisek, vpravo pruh s percentilem
// za každého hráče. Nejvyšší hodnota v řádku je zvýrazněná tučně a barevně.
function MetricRow({ label, values }) {
  const max = Math.max(...values.filter((v) => v !== null && v !== undefined));
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `180px repeat(${values.length}, minmax(90px, 1fr))`,
        alignItems: "center",
        gap: 10,
        padding: "7px 0",
      }}
    >
      <span style={{ fontSize: 12.5, color: C.inkSoft }}>{label}</span>
      {values.map((v, i) => {
        const has = v !== null && v !== undefined;
        const isBest = has && v === max && values.filter((x) => x === max).length < values.length;
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 6, background: C.lineSoft, borderRadius: 3 }}>
              <div
                style={{
                  width: `${has ? v : 0}%`,
                  height: "100%",
                  borderRadius: 3,
                  background: isBest ? C.turf : C.inkFaint,
                }}
              />
            </div>
            <span
              style={{
                width: 36,
                textAlign: "right",
                fontFamily: fontMono,
                fontSize: 11.5,
                fontWeight: isBest ? 700 : 400,
                color: isBest ? C.turf : C.inkFaint,
              }}
            >
              {has ? ratingFromPercentile(v) : "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function ComparePlayers() {
  const [searchParams] = useSearchParams();
  const ids = (searchParams.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [players, setPlayers] = useState(null); // pole { ok: true, data } | { ok: false, id }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) {
      setPlayers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    Promise.all(
      ids.map((id) =>
        apiFetch(`/api/players/${id}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((data) => (data ? { ok: true, data } : { ok: false, id }))
          .catch(() => ({ ok: false, id }))
      )
    ).then((results) => {
      setPlayers(results);
      setLoading(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get("ids")]);

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontBody, color: C.inkFaint, fontSize: 13 }}>
        <Loader2 size={16} className="compare-spin" style={{ marginRight: 8 }} />
        Načítám srovnání…
      </div>
    );
  }

  const ok = (players || []).filter((p) => p.ok).map((p) => p.data);
  const failed = (players || []).filter((p) => !p.ok);

  if (ids.length === 0 || ok.length < 2) {
    return (
      <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "60px 20px", textAlign: "center" }}>
          <AlertTriangle size={26} color={C.inkFaint} style={{ marginBottom: 10 }} />
          <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Není co porovnávat</div>
          <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 20 }}>
            Vyber na Shortlistě 2 až 6 hráčů a klikni na „Porovnat“.
          </div>
          <Link to="/shortlist" style={{ fontSize: 13, fontWeight: 600, color: C.turf, textDecoration: "none" }}>
            ← Zpět na Shortlist
          </Link>
        </div>
      </div>
    );
  }

  const scored = ok.map((p) => ({ player: p, ...computePlayerScore(p, "pressing") }));
  const scores = scored.map((s) => (s.hasAnalytics ? s.score : null));
  const maxScore = Math.max(...scores.filter((s) => s !== null));

  // Sjednocená sada metrik napříč hráči (pořadí podle prvního hráče, co je má),
  // omezená jen na metriky, které má aspoň 2 z porovnávaných hráčů (metrika,
  // kterou má jen jeden hráč, nic neporovnává — typicky u hráčů na různých
  // pozicích, kde se sady metrik jinak vůbec nepřekrývají).
  const allMetrics = [];
  scored.forEach((s) => {
    (s.player.breakdown || []).forEach((m) => {
      if (!allMetrics.find((x) => x.id === m.id)) allMetrics.push({ id: m.id, label: m.label });
    });
  });
  const metricOrder = allMetrics.filter(
    (m) => scored.filter((s) => (s.player.breakdown || []).some((x) => x.id === m.id)).length >= 2
  );

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <style>{`
        @keyframes compare-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .compare-spin { animation: compare-spin 0.8s linear infinite; display: inline-block; }
      `}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>
        <Link to="/shortlist" style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: C.inkFaint, textDecoration: "none", marginBottom: 14 }}>
          <ArrowLeft size={13} /> Zpět na Shortlist
        </Link>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Scale size={18} color={C.turf} />
          <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>Porovnání hráčů</h1>
        </div>

        {failed.length > 0 && (
          <div style={{ background: C.amberSoft, color: C.amber, padding: "8px 14px", borderRadius: 6, fontSize: 12.5, marginBottom: 16 }}>
            {failed.length === 1 ? "Jednoho hráče" : "Některé hráče"} se nepodařilo načíst, zobrazuji zbytek.
          </div>
        )}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 20 }}>
          {scored.map(({ player, hasAnalytics, score }, i) => {
            const risk = riskStyle(player.riskLevel);
            return (
              <div key={player.id} style={{ flex: "1 1 260px", minWidth: 240, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "20px 22px" }}>
                <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
                  {hasAnalytics && <ScoreDial value={score} highlight={score === maxScore} />}
                  <div style={{ minWidth: 0 }}>
                    <Link
                      to={`/hrac/${player.id}`}
                      style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: C.ink, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                      {player.name}
                    </Link>
                    <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 2 }}>
                      {[player.position, player.club, player.age ? `${player.age} let` : null].filter(Boolean).join(" • ")}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
                  <div>
                    <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 2 }}>Tržní hodnota</div>
                    <div style={{ fontFamily: fontMono, fontSize: 14, fontWeight: 600 }}>
                      {player.marketValue ? `${Number(player.marketValue).toFixed(1)}M €` : "—"}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 10.5, color: C.inkFaint, marginBottom: 2 }}>Riziko zranění</div>
                    <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 600, color: risk.c, background: risk.bg, padding: "3px 8px", borderRadius: 4 }}>
                      {riskLabelText(player.riskLevel)}
                    </span>
                  </div>
                </div>

                {player.strengths?.length > 0 && (
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: C.turf, marginBottom: 4 }}>
                      <ArrowUpRight size={12} /> Silné stránky
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.ink, lineHeight: 1.5 }}>
                      {player.strengths.slice(0, 4).map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {player.weaknesses?.length > 0 && (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, fontWeight: 700, color: C.red, marginBottom: 4 }}>
                      <ArrowDownRight size={12} /> Slabé stránky
                    </div>
                    <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: C.ink, lineHeight: 1.5 }}>
                      {player.weaknesses.slice(0, 4).map((s, j) => (
                        <li key={j}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {!hasAnalytics && (
                  <div style={{ fontSize: 12, color: C.inkFaint }}>Pro tohoto hráče zatím nejsou k dispozici AI analytická data.</div>
                )}
              </div>
            );
          })}
        </div>

        {metricOrder.length === 0 && (
          <div style={{ background: C.lineSoft, borderRadius: 8, padding: "16px 20px", fontSize: 13, color: C.inkFaint }}>
            Vybraní hráči nemají žádné společné metriky k porovnání (typicky hráči na úplně jiných pozicích).
          </div>
        )}

        {metricOrder.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "20px 24px" }}>
            <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Srovnání metrik</div>
            {/* Při víc hráčích (5–6) se sloupce nezmenší pod čitelnou šířku —
                místo toho se tabulka horizontálně scrolluje, podobně jako
                kanban na Shortlistě. */}
            <div style={{ overflowX: "auto" }}>
              <div style={{ minWidth: 180 + scored.length * 90 }}>
                <div style={{ display: "grid", gridTemplateColumns: `180px repeat(${scored.length}, minmax(90px, 1fr))`, gap: 10, marginBottom: 4 }}>
                  <span />
                  {scored.map(({ player }) => (
                    <span key={player.id} style={{ fontSize: 11, fontWeight: 600, color: C.inkFaint, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {player.name}
                    </span>
                  ))}
                </div>
                {metricOrder.map((m) => (
                  <MetricRow
                    key={m.id}
                    label={m.label}
                    values={scored.map((s) => {
                      const stat = (s.player.breakdown || []).find((x) => x.id === m.id);
                      return stat ? stat.percentile : null;
                    })}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
