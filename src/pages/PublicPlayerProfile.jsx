import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Shield, AlertTriangle, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { apiFetch } from "../api.js";
import { computePlayerScore } from "../lib/playerScore.js";

// Veřejná, read-only verze profilu hráče — otevírá se z odkazu, který scout
// vygeneroval na profilu hráče (tlačítko "Sdílet profil"), bez nutnosti
// přihlášení. Ukazuje jen shrnutí (skóre, rozklad metrik, riziko, silné a
// slabé stránky) — žádné úpravy, reporty ani interní diskuzi.

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
  return { low: { c: C.turf, bg: C.turfSoft }, medium: { c: C.amber, bg: C.amberSoft }, high: { c: C.red, bg: C.redSoft } }[risk] || { c: C.inkFaint, bg: C.lineSoft };
}

function ScoreDial({ value }) {
  const radius = 64;
  const stroke = 11;
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
        <span style={{ fontFamily: fontMono, fontSize: 34, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{value}</span>
        <span style={{ fontFamily: fontBody, fontSize: 10, color: C.inkFaint, marginTop: 2 }}>/ 100</span>
      </div>
    </div>
  );
}

function MetricBar({ label, percentile }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0" }}>
      <span style={{ width: 220, flexShrink: 0, fontSize: 13, color: C.ink }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: C.lineSoft, borderRadius: 3 }}>
        <div style={{ width: `${percentile}%`, height: "100%", borderRadius: 3, background: C.turf }} />
      </div>
      <span style={{ width: 28, textAlign: "right", fontFamily: fontMono, fontSize: 12, color: C.inkFaint }}>{percentile}.</span>
    </div>
  );
}

export default function PublicPlayerProfile() {
  const { token } = useParams();
  const [player, setPlayer] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ok | notfound | error

  useEffect(() => {
    apiFetch(`/api/public/profile/${token}`)
      .then((res) => {
        if (res.status === 404) {
          setStatus("notfound");
          return null;
        }
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setPlayer(data);
        setStatus("ok");
      })
      .catch(() => setStatus("error"));
  }, [token]);

  if (status === "loading") {
    return (
      <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontBody, color: C.inkFaint, fontSize: 13 }}>
        Načítám profil…
      </div>
    );
  }

  if (status === "notfound" || status === "error") {
    return (
      <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontBody, padding: 20 }}>
        <div style={{ textAlign: "center", maxWidth: 360 }}>
          <AlertTriangle size={28} color={C.inkFaint} style={{ marginBottom: 10 }} />
          <div style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: C.ink, marginBottom: 6 }}>
            {status === "notfound" ? "Odkaz nenalezen" : "Nepodařilo se načíst profil"}
          </div>
          <div style={{ fontSize: 13, color: C.inkSoft }}>
            {status === "notfound"
              ? "Tenhle odkaz na sdílený profil hráče už neplatí — mohl být zrušen, nebo je neplatný."
              : "Zkus to prosím znovu o chvíli později."}
          </div>
        </div>
      </div>
    );
  }

  const { hasAnalytics, score, contributions } = computePlayerScore(player, "pressing");
  const breakdown = player.breakdown || [];
  const ranked = hasAnalytics ? [...breakdown].sort((a, b) => (contributions[b.id] ?? 0) - (contributions[a.id] ?? 0)) : [];
  const risk = riskStyle(player.riskLevel);

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 820, margin: "0 auto", padding: "32px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 20, color: C.inkFaint, fontSize: 12 }}>
          <Shield size={14} color={C.turf} />
          Veřejný profil hráče — sdíleno ze ScoutOS
        </div>

        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "26px 28px", marginBottom: 20 }}>
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
            {hasAnalytics && <ScoreDial value={score} />}
            <div style={{ flex: 1, minWidth: 220 }}>
              <h1 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, margin: "0 0 4px" }}>{player.name}</h1>
              <div style={{ fontSize: 14, color: C.inkSoft, marginBottom: 12 }}>
                {[player.position, player.club, player.age ? `${player.age} let` : null].filter(Boolean).join("  •  ")}
              </div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 2 }}>Tržní hodnota</div>
                  <div style={{ fontFamily: fontMono, fontSize: 16, fontWeight: 600 }}>
                    {player.marketValue ? `${Number(player.marketValue).toFixed(1)}M €` : "—"}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 2 }}>Riziko zranění</div>
                  <span style={{ display: "inline-block", fontSize: 12, fontWeight: 600, color: risk.c, background: risk.bg, padding: "3px 9px", borderRadius: 4 }}>
                    {riskLabelText(player.riskLevel)}
                  </span>
                </div>
                {player.contractUntil && (
                  <div>
                    <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 2 }}>Kontrakt do</div>
                    <div style={{ fontSize: 14 }}>{player.contractUntil}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {hasAnalytics && ranked.length > 0 && (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "20px 24px", marginBottom: 20 }}>
            <div style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Rozklad skóre po metrikách</div>
            {ranked.slice(0, 7).map((stat) => (
              <MetricBar key={stat.id} label={stat.label} percentile={stat.percentile} />
            ))}
          </div>
        )}

        {(player.strengths?.length > 0 || player.weaknesses?.length > 0) && (
          <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            {player.strengths?.length > 0 && (
              <div style={{ flex: 1, minWidth: 240, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.turf, marginBottom: 8 }}>
                  <ArrowUpRight size={14} /> Silné stránky
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
                  {player.strengths.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {player.weaknesses?.length > 0 && (
              <div style={{ flex: 1, minWidth: 240, background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "18px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.red, marginBottom: 8 }}>
                  <ArrowDownRight size={14} /> Slabé stránky
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.ink, lineHeight: 1.6 }}>
                  {player.weaknesses.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!hasAnalytics && (
          <div style={{ background: C.lineSoft, borderRadius: 8, padding: "16px 20px", fontSize: 13, color: C.inkFaint, marginTop: 20 }}>
            Pro tohoto hráče zatím nejsou k dispozici žádná AI analytická data.
          </div>
        )}
      </div>
    </div>
  );
}
