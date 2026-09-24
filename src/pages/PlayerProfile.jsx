import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Star,
  FileDown,
  UserPlus,
  Play,
  ChevronDown,
  ChevronLeft,
  ShieldCheck,
  Info,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Film,
  X,
  TrendingUp,
  Gauge,
  ShieldAlert,
  Loader2,
  Send,
  Trash2,
  Pencil,
  Check,
} from "lucide-react";
import { apiFetch } from "../api.js";

// Výchozí (demo) profil hráče — použije se jako placeholder, dokud nedorazí
// skutečná data ze serveru pro zvoleného hráče (podle :id v URL).
const emptyPlayer = {
  name: "",
  club: "",
  position: "",
  age: "",
  height: "",
  foot: "",
  marketValue: 0,
  contractUntil: "",
  agent: "",
  minutesTracked: 0,
  riskLevel: "low",
};

// ---- Design tokens -------------------------------------------------
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

// Injury risk model (Modul B3 z PRD) — baseline + faktory, ne černá skříňka.
const fallbackInjuryRisk = {
  probability: 18,
  horizonMonths: 6,
  baseline: 5,
  factors: [
    {
      id: "age",
      label: "Věk (21 let)",
      effect: -4,
      detail: "Nízký věk statisticky snižuje pravděpodobnost svalových zranění z dlouhodobého přetížení.",
    },
    {
      id: "load",
      label: "Herní zátěž (1420 min za sezónu)",
      effect: 5,
      detail: "Nadprůměrná minutáž v posledních týdnech mírně zvyšuje riziko přetížení ve srovnání s pozicovým průměrem.",
    },
    {
      id: "history",
      label: "Historie zranění (2 epizody, 77 dní mimo hru)",
      effect: 9,
      detail: "Opakované svalové zranění zvyšuje riziko recidivy podle historických dat srovnatelných případů.",
    },
    {
      id: "type",
      label: "Typ posledního zranění (svalové)",
      effect: 3,
      detail: "Svalová zranění mají v referenční skupině vyšší míru recidivy než zlomeniny nebo distorze.",
    },
  ],
};

const STYLES = [
  { id: "pressing", label: "Presink" },
  { id: "possession", label: "Držení míče" },
  { id: "defensive", label: "Defenzivní blok" },
];

// Základní hodnota skóre (pozicní průměr) — ke které se přičítají kontribuce metrik (Krok 4).
const BASE_SCORE = 62;

// Objektivní percentily jsou nezávislé na filozofii klubu — mění se jen váhy (kontribuce).
// Toto je záložní hodnota, používá se, dokud nedorazí data ze serveru (nebo když server neběží).
const fallbackBreakdown = [
  {
    id: "xt",
    label: "Expected Threat (xT) + Non-Shot xG",
    percentile: 85,
    tag: null,
    detail:
      "Kumulativní hodnota, o kolik hráč zvýšil gólovou hrozbu týmu jakoukoliv akcí — přihrávkou, vedením míče i náběhem bez míče — i když akce neskončila střelou. Licencovaná metrika (Vrstva A, Kapitola 12 PRD), ne interně počítaná od nuly.",
  },
  {
    id: "duels",
    label: "Úspěšné defenzivní souboje",
    percentile: 82,
    tag: "Souboj",
    detail:
      "82. percentil v rámci hráčů stejné pozice a věku po zohlednění síly ligy (0.72) a possession-adjustmentu.",
  },
  {
    id: "transition",
    label: "Rychlost přechodu do útoku",
    percentile: 88,
    tag: "Přechod",
    detail:
      "Nejsilnější metrika hráče — výrazně nad průměrem i po Bayesovském zmenšení kvůli 1420 sledovaným minutám.",
  },
  {
    id: "crosses",
    label: "Přesnost centrů",
    percentile: 58,
    tag: "Centr",
    detail: "Mírně nad průměrem, ale s vysokou variancí mezi zápasy.",
  },
  {
    id: "passing",
    label: "Úspěšnost dlouhých přihrávek",
    percentile: 61,
    tag: "Rozehrávka",
    detail: "Stabilní, blízko ligového průměru pro tuto pozici.",
  },
  {
    id: "discipline",
    label: "Disciplína (karty)",
    percentile: 45,
    tag: null,
    detail: "Lehce podprůměrné, sledovat trend v posledních zápasech.",
  },
  {
    id: "setpieces",
    label: "Standardní situace (obranné)",
    percentile: 34,
    tag: null,
    detail: "Nejslabší článek profilu — nízký percentil i po zohlednění malého vzorku standardek.",
  },
];

// Kontribuce každé metriky do skóre se liší podle filozofie klubu (AHP váhový vektor).
const fallbackStyleContributions = {
  pressing: { xt: 4, duels: 8, transition: 5, crosses: 2, passing: 1, discipline: -1, setpieces: -3 },
  possession: { xt: 6, duels: 3, transition: 2, crosses: 7, passing: 8, discipline: -1, setpieces: -2 },
  defensive: { xt: 1, duels: 11, transition: 1, crosses: 0, passing: 1, discipline: 2, setpieces: -1 },
};

// Historie jistoty skóre — relativní poměr vůči aktuální hodnotě pro zvolenou filozofii.
// S přibývajícími sledovanými minutami se rozpětí zužuje (Bayesovské zmenšení, Krok 5).
const fallbackScoreHistoryRatios = [
  { month: "Bře 26", minutes: 320, low: 0.70, value: 0.82, high: 0.94 },
  { month: "Dub 26", minutes: 620, low: 0.78, value: 0.89, high: 0.98 },
  { month: "Kvě 26", minutes: 940, low: 0.86, value: 0.95, high: 1.02 },
  { month: "Čvn 26", minutes: 1420, low: 0.95, value: 1.0, high: 1.03 },
];

// Consistency Rating (13.1 v PRD) — výkon (0-100) v posledních N zápasech + odvozený rating.
const fallbackMatchPerformances = [68, 79, 72, 41, 75, 70, 77, 66, 73, 35, 71, 74];
function computeConsistency(scores) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const tier = stdDev < 8 ? "Stálice" : stdDev < 14 ? "Vyrovnaný s výkyvy" : "Nevyzpytatelný";
  return { mean: Math.round(mean), stdDev: Math.round(stdDev * 10) / 10, tier };
}

const fallbackClips = [
  { id: 1, title: "Defenzivní souboj — 34. min", tag: "Souboj", duration: "0:14" },
  { id: 2, title: "Centr do pokutového území", tag: "Centr", duration: "0:09" },
  { id: 3, title: "Rozehrávka pod tlakem", tag: "Rozehrávka", duration: "0:11" },
  { id: 4, title: "Sprint zpět do obrany", tag: "Přechod", duration: "0:08" },
  { id: 5, title: "Souboj vzduchem — roh soupeře", tag: "Souboj", duration: "0:07" },
];

// Výchozí data použitá jen tehdy, když se nepodaří připojit k backendu —
// appka díky tomu funguje i bez spuštěného serveru, jen s upozorněním.
const fallbackReports = [
  { id: 1, author: "Petr Novák", date: "12. srpna 2026", match: "vs. Slavoj Karviná", recommendation: "Doporučit" },
  { id: 2, author: "Jana Bartošová", date: "3. srpna 2026", match: "vs. FC Silesia", recommendation: "Sledovat dál" },
  { id: 3, author: "Petr Novák", date: "19. července 2026", match: "vs. Baník Karviná B", recommendation: "Doporučit" },
];

function recommendationStyle(recommendation) {
  if (recommendation === "Doporučit") return { color: C.turf, bg: C.turfSoft };
  if (recommendation === "Sledovat dál") return { color: C.amber, bg: C.amberSoft };
  if (recommendation === "Zamítnout") return { color: C.red, bg: C.redSoft };
  return { color: C.inkSoft, bg: C.lineSoft };
}

// Kalibrace = jak dobře se hodnocení skauta v minulosti shodovalo s realitou (Modul C3).
// BASE_ALPHA odpovídá konstantě z Kroku 7 matematické specifikace (max. váha subjektivního
// hodnocení i u dokonale kalibrovaného skauta je 1 − base_α).
const BASE_ALPHA = 0.65;
const scoutCalibration = {
  "Petr Novák": { score: 88, reportsCount: 47 },
  "Jana Bartošová": { score: 61, reportsCount: 12 },
  "Karel Ryba": { score: null, reportsCount: 2 },
};

const fallbackTimeline = [
  { id: 1, date: "2025", category: "transfer", label: "Přestup z FK Slezan do FK Ostrov Bytom" },
  { id: 2, date: "2024", category: "injury", label: "Natažený sval — 3 týdny mimo hru", days: 21 },
  { id: 3, date: "2023", category: "milestone", label: "Postup do základní sestavy A-týmu" },
  { id: 4, date: "2022", category: "transfer", label: "Povýšení z mládežnické akademie do A-týmu" },
  { id: 5, date: "2021", category: "injury", label: "Zlomenina kotníku — 8 týdnů mimo hru", days: 56 },
];

const HISTORY_FILTERS = [
  { id: "all", label: "Vše" },
  { id: "transfer", label: "Přestupy" },
  { id: "injury", label: "Zranění" },
  { id: "milestone", label: "Milníky" },
];

// Historie je pevná; projekce (t > 0) vychází z věkové křivky (Krok 6 matematické specifikace) —
// rozptyl kolem odhadu roste s délkou horizontu.
const fallbackMarketHistory = [
  { year: "2023", value: 0.6, low: 0.6, high: 0.6, projected: false },
  { year: "2024", value: 1.1, low: 1.1, high: 1.1, projected: false },
  { year: "2025", value: 1.5, low: 1.5, high: 1.5, projected: false },
  { year: "2026", value: 1.8, low: 1.8, high: 1.8, projected: false },
  { year: "2027", value: 2.3, low: 1.9, high: 2.7, projected: true },
  { year: "2028", value: 2.6, low: 1.8, high: 3.4, projected: true },
];

// Clutch Performance Factor (13.1 v PRD) — výkon ve vyrovnaném/nepříznivém stavu vs. rozhodnutý zápas.
const fallbackClutchData = {
  closeStateScore: 76,
  decidedStateScore: 65,
  closeSample: 9,
  decidedSample: 15,
};

const fallbackSimilarPlayers = [
  {
    id: 1,
    name: "Adam Ševčík",
    similarity: 91,
    priceDelta: "−0.4M €",
    age: 22,
    marketValue: "1.4M €",
    score: 71,
    risk: "medium",
    metrics: { xt: 70, duels: 75, transition: 80, crosses: 64, passing: 59, discipline: 50, setpieces: 40 },
  },
  {
    id: 2,
    name: "Marek Hruška",
    similarity: 86,
    priceDelta: "+0.6M €",
    age: 20,
    marketValue: "2.4M €",
    score: 78,
    risk: "low",
    metrics: { xt: 88, duels: 85, transition: 91, crosses: 70, passing: 68, discipline: 60, setpieces: 55 },
  },
  {
    id: 3,
    name: "Filip Dostál",
    similarity: 79,
    priceDelta: "−0.9M €",
    age: 23,
    marketValue: "0.9M €",
    score: 68,
    risk: "high",
    metrics: { xt: 60, duels: 70, transition: 78, crosses: 50, passing: 55, discipline: 35, setpieces: 30 },
  },
];

// Záložky se skládají dynamicky podle toho, jaká data pro daného hráče skutečně
// existují — u hráče bez AI analytiky appka nenabízí prázdné "Video"/"Historie" atd.

// ---- Small building blocks --------------------------------------------

function Divider() {
  return <div style={{ width: 1, height: 14, background: C.line }} />;
}

function ScoreDial({ value }) {
  const [display, setDisplay] = useState(value);
  const radius = 74;
  const stroke = 12;
  const circumference = 2 * Math.PI * radius;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      setDisplay(value);
      return;
    }
    let raf;
    const start = performance.now();
    const startVal = display;
    const dur = 500;
    const tick = (t) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(startVal + (value - startVal) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const offset = circumference * (1 - display / 100);
  const color = display >= 70 ? C.turf : display >= 50 ? C.amber : C.red;

  return (
    <div style={{ position: "relative", width: 176, height: 176, flexShrink: 0 }}>
      <svg width={176} height={176} viewBox="0 0 176 176">
        <circle cx={88} cy={88} r={radius} fill="none" stroke={C.lineSoft} strokeWidth={stroke} />
        <circle
          cx={88}
          cy={88}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 88 88)"
          style={{ transition: "stroke 300ms" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: fontMono, fontSize: 40, fontWeight: 600, color: C.ink, lineHeight: 1 }}>{display}</span>
        <span style={{ fontFamily: fontBody, fontSize: 11, color: C.inkFaint, marginTop: 4 }}>/ 100</span>
      </div>
    </div>
  );
}

function StatRow({ stat, contribution, expanded, onToggle, clipsCount, onShowClips }) {
  const positive = contribution >= 0;
  return (
    <div style={{ borderBottom: `1px solid ${C.lineSoft}` }}>
      <button
        onClick={onToggle}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
      >
        <span style={{ width: 200, flexShrink: 0, fontFamily: fontBody, fontSize: 14, color: C.ink }}>{stat.label}</span>
        <div style={{ flex: 1, height: 6, background: C.lineSoft, borderRadius: 3, position: "relative" }}>
          <div style={{ width: `${stat.percentile}%`, height: "100%", borderRadius: 3, background: C.turf }} />
        </div>
        <span style={{ width: 34, textAlign: "right", fontFamily: fontMono, fontSize: 12, color: C.inkFaint }}>{stat.percentile}.</span>
        <span style={{ width: 48, display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2, fontFamily: fontMono, fontSize: 13, fontWeight: 600, color: positive ? C.turf : C.red }}>
          {positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {Math.abs(contribution)}
        </span>
        <ChevronDown size={15} color={C.inkFaint} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>
      {expanded && (
        <div style={{ padding: "0 4px 14px 4px", maxWidth: 560 }}>
          <p style={{ fontFamily: fontBody, fontSize: 13, color: C.inkSoft, margin: "0 0 10px 0" }}>{stat.detail}</p>
          {clipsCount > 0 && (
            <button
              onClick={onShowClips}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, background: C.turfSoft, color: C.turfDark, border: "none", borderRadius: 4, padding: "6px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
            >
              <Film size={13} />
              Zobrazit související klipy ({clipsCount})
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ children }) {
  return <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 12 }}>{children}</div>;
}

function ActionButton({ children, icon: Icon, primary, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "10px 14px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: primary ? "#fff" : C.ink, background: primary ? C.turf : "#fff", border: `1px solid ${primary ? C.turf : C.line}`, borderRadius: 4, cursor: "pointer" }}
    >
      <Icon size={15} />
      {children}
    </button>
  );
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

function MarketValueChart({ data }) {
  const width = 232;
  const height = 108;
  const padX = 8;
  const padY = 14;
  const n = data.length;

  const allVals = data.flatMap((d) => [d.low, d.high]);
  const minV = Math.min(...allVals) * 0.9;
  const maxV = Math.max(...allVals) * 1.08;

  const x = (i) => padX + (i / (n - 1)) * (width - 2 * padX);
  const y = (v) => height - padY - ((v - minV) / (maxV - minV)) * (height - 2 * padY);

  const rawProjectedIdx = data.findIndex((d) => d.projected);
  // Fall back gracefully if no entry is marked as a projection: treat the
  // last point as "current" and skip the projection band/text entirely.
  const hasProjection = rawProjectedIdx > 0;
  const firstProjectedIdx = hasProjection ? rawProjectedIdx : n - 1;

  const historicalPts = data.slice(0, firstProjectedIdx + 1);
  const projectedPts = hasProjection ? data.slice(firstProjectedIdx) : [];

  const toPath = (pts) => pts.map((d, i) => `${i === 0 ? "M" : "L"} ${x(data.indexOf(d))} ${y(d.value)}`).join(" ");

  const bandTop = projectedPts.map((d) => `${x(data.indexOf(d))},${y(d.high)}`).join(" ");
  const bandBottom = [...projectedPts].reverse().map((d) => `${x(data.indexOf(d))},${y(d.low)}`).join(" ");
  const bandPoints = `${bandTop} ${bandBottom}`;

  const current = hasProjection ? data[firstProjectedIdx - 1] : data[n - 1];
  const nextYear = hasProjection ? data[firstProjectedIdx] : null;
  const deltaPct = nextYear ? Math.round(((nextYear.value - current.value) / current.value) * 100) : 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
        <span style={{ fontFamily: fontMono, fontSize: 22, fontWeight: 600, color: C.ink }}>{current.value.toFixed(1)}M €</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.turf }}>aktuální</span>
      </div>
      {nextYear && (
        <div style={{ fontSize: 12, color: C.inkSoft, marginBottom: 10 }}>
          Za 12 měsíců: {nextYear.value.toFixed(1)}M € ({deltaPct > 0 ? "+" : ""}{deltaPct}%), rozpětí {nextYear.low.toFixed(1)}–{nextYear.high.toFixed(1)}M €
        </div>
      )}
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        {hasProjection && <polygon points={bandPoints} fill={C.turfSoft} opacity={0.8} />}
        <path d={toPath(historicalPts)} stroke={C.turf} strokeWidth={2} fill="none" />
        {hasProjection && <path d={toPath(projectedPts)} stroke={C.turf} strokeWidth={2} strokeDasharray="4 3" fill="none" />}
        {data.map((d, i) => (
          <circle
            key={d.year}
            cx={x(i)}
            cy={y(d.value)}
            r={3.5}
            fill={d.projected ? "#fff" : C.turf}
            stroke={C.turf}
            strokeWidth={1.5}
          />
        ))}
        {data.map((d, i) => (
          <text key={d.year} x={x(i)} y={height + 2} fontSize={9} fontFamily={fontMono} fill={C.inkFaint} textAnchor="middle">
            {d.year}
          </text>
        ))}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12, fontSize: 11, color: C.inkFaint }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.turf, display: "inline-block" }} /> historie
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff", border: `1.5px solid ${C.turf}`, display: "inline-block" }} /> projekce
        </span>
      </div>
    </div>
  );
}

function ScoutCalibrationBadge({ author, expanded, onToggle }) {
  const data = scoutCalibration[author];
  if (!data) return null;

  const hasScore = data.score !== null;
  const tier = !hasScore ? "new" : data.score >= 75 ? "high" : data.score >= 50 ? "mid" : "low";
  const palette = {
    high: { color: C.turf, bg: C.turfSoft, label: "Vysoká kalibrace" },
    mid: { color: C.amber, bg: C.amberSoft, label: "Střední kalibrace" },
    low: { color: C.red, bg: C.redSoft, label: "Nízká kalibrace" },
    new: { color: C.inkFaint, bg: C.lineSoft, label: "Nedostatek dat" },
  }[tier];

  const subjectiveWeight = hasScore ? Math.round(BASE_ALPHA === 0.65 ? 0.35 * (data.score / 100) * 100 : 0) : null;

  return (
    <div>
      <button
        onClick={onToggle}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 9px",
          borderRadius: 4,
          border: "none",
          cursor: "pointer",
          background: palette.bg,
          color: palette.color,
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        <Gauge size={12} />
        {hasScore ? `Kalibrace ${data.score}%` : "Nový skaut"}
        <ChevronDown size={11} style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
      </button>
      {expanded && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.inkSoft, lineHeight: 1.6, maxWidth: 420 }}>
          <strong style={{ color: C.ink }}>{palette.label}</strong> — založeno na {data.reportsCount} historických
          reportech.{" "}
          {hasScore ? (
            <>
              Při rozporu s objektivními daty dostává jeho subjektivní hodnocení váhu{" "}
              <strong style={{ color: C.ink }}>{subjectiveWeight} %</strong> ve finálním skóre (Krok 7 scoring
              modelu) — zbytek vždy tvoří objektivní data, i u nejlépe kalibrovaných skautů.
            </>
          ) : (
            "Zatím málo dat na spolehlivý kalibrační odhad — hodnocení se prozatím váží minimálně a systém spoléhá hlavně na objektivní data."
          )}
        </div>
      )}
    </div>
  );
}

function InjuryRiskPanel({ data }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "20px 24px", marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div style={{ minWidth: 160 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
            <ShieldAlert size={14} color={C.inkFaint} />
            <span style={{ fontSize: 11, color: C.inkFaint, fontWeight: 600 }}>Model rizika zranění</span>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontFamily: fontMono, fontSize: 32, fontWeight: 600, color: C.ink }}>{data.probability}%</span>
          </div>
          <div style={{ fontSize: 12, color: C.inkSoft, lineHeight: 1.5, marginTop: 4, maxWidth: 200 }}>
            pravděpodobnost zranění vyřazujícího na 2+ týdny v příštích {data.horizonMonths} měsících
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 8 }}>
            Základní riziko pro pozici a věkovou kategorii: {data.baseline}%. Úprava podle konkrétních faktorů:
          </div>
          {data.factors.map((f) => {
            const positive = f.effect < 0;
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ flex: 1, fontSize: 13, color: C.ink }}>{f.label}</span>
                <span style={{ display: "flex", alignItems: "center", gap: 2, fontFamily: fontMono, fontSize: 12, fontWeight: 600, color: positive ? C.turf : C.red, width: 44, justifyContent: "flex-end" }}>
                  {positive ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
                  {Math.abs(f.effect)}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function ScoreCertaintyChart({ ratios, currentScore }) {
  const width = 460;
  const height = 96;
  const padX = 10;
  const padY = 14;
  const n = ratios.length;

  const values = ratios.map((r) => ({ ...r, low: r.low * currentScore, value: r.value * currentScore, high: r.high * currentScore }));
  const allVals = values.flatMap((d) => [d.low, d.high]);
  const minV = Math.min(...allVals) * 0.95;
  const maxV = Math.max(...allVals) * 1.05;

  const x = (i) => padX + (i / (n - 1)) * (width - 2 * padX);
  const y = (v) => height - padY - ((v - minV) / (maxV - minV)) * (height - 2 * padY);

  const linePath = values.map((d, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(d.value)}`).join(" ");
  const bandTop = values.map((d, i) => `${x(i)},${y(d.high)}`).join(" ");
  const bandBottom = [...values].reverse().map((d) => `${x(values.indexOf(d))},${y(d.low)}`).join(" ");

  return (
    <div>
      <svg width={width} height={height + 14} style={{ maxWidth: "100%", overflow: "visible" }} viewBox={`0 0 ${width} ${height + 14}`}>
        <polygon points={`${bandTop} ${bandBottom}`} fill={C.turfSoft} opacity={0.8} />
        <path d={linePath} stroke={C.turf} strokeWidth={2} fill="none" />
        {values.map((d, i) => (
          <circle key={d.month} cx={x(i)} cy={y(d.value)} r={i === n - 1 ? 4.5 : 3} fill={C.turf} stroke="#fff" strokeWidth={1} />
        ))}
        {values.map((d, i) => (
          <text key={d.month} x={x(i)} y={height + 10} fontSize={9} fontFamily={fontMono} fill={C.inkFaint} textAnchor="middle">
            {d.month}
          </text>
        ))}
      </svg>
    </div>
  );
}

function ConsistencyCard({ scores }) {
  const { mean, stdDev, tier } = computeConsistency(scores);
  const tierColor = { Stálice: C.turf, "Vyrovnaný s výkyvy": C.amber, Nevyzpytatelný: C.red }[tier];
  const tierBg = { Stálice: C.turfSoft, "Vyrovnaný s výkyvy": C.amberSoft, Nevyzpytatelný: C.redSoft }[tier];
  const max = Math.max(...scores);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 8px", borderRadius: 3, color: tierColor, background: tierBg }}>
          {tier}
        </span>
        <span style={{ fontSize: 11, color: C.inkFaint }}>
          průměr {mean} · σ = {stdDev}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 44 }}>
        {scores.map((s, i) => (
          <div
            key={i}
            title={`Zápas ${i + 1}: ${s}`}
            style={{
              flex: 1,
              height: `${(s / max) * 100}%`,
              background: s < mean - stdDev ? C.red : s > mean + stdDev ? C.turf : C.lineSoft,
              borderRadius: 2,
              minHeight: 3,
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 8, lineHeight: 1.5 }}>
        Posledních {scores.length} zápasů. Zvýrazněné sloupce leží mimo jednu směrodatnou odchylku od průměru.
      </div>
    </div>
  );
}

function ClutchCard({ data }) {
  const delta = data.closeStateScore - data.decidedStateScore;
  const positive = delta > 0;
  const max = Math.max(data.closeStateScore, data.decidedStateScore);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 10 }}>
        <span style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 600, color: positive ? C.turf : C.red }}>
          {positive ? "+" : ""}{delta}
        </span>
        <span style={{ fontSize: 13, color: C.inkSoft }}>
          {positive
            ? "lepší výkon ve vyrovnaných a nepříznivých stavech než v rozhodnutých zápasech"
            : "slabší výkon ve vyrovnaných a nepříznivých stavech než v rozhodnutých zápasech"}
        </span>
      </div>

      {[
        { label: `Vyrovnaný / nepříznivý stav (${data.closeSample} zápasů)`, value: data.closeStateScore, color: C.turf },
        { label: `Rozhodnutý zápas (${data.decidedSample} zápasů)`, value: data.decidedStateScore, color: C.inkFaint },
      ].map((row) => (
        <div key={row.label} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.inkSoft, marginBottom: 3 }}>
            <span>{row.label}</span>
            <span style={{ fontFamily: fontMono, fontWeight: 600, color: C.ink }}>{row.value}</span>
          </div>
          <div style={{ height: 6, background: C.lineSoft, borderRadius: 3 }}>
            <div style={{ width: `${(row.value / max) * 100}%`, height: "100%", borderRadius: 3, background: row.color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function riskBadgeStyle(risk) {
  return { low: { c: C.turf, bg: C.turfSoft }, medium: { c: C.amber, bg: C.amberSoft }, high: { c: C.red, bg: C.redSoft } }[risk];
}

function MetricBar({ value, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ width: 46, height: 5, background: C.lineSoft, borderRadius: 3, flexShrink: 0 }}>
        <div style={{ width: `${value}%`, height: "100%", borderRadius: 3, background: color }} />
      </div>
      <span style={{ fontFamily: fontMono, fontSize: 11, color }}>{value}.</span>
    </div>
  );
}

function CompareTable({ base, baseScore, others, breakdown }) {
  const summaryRows = [
    { label: "Skóre", get: (p) => (p ? p.score : baseScore), better: "high" },
    { label: "Tržní hodnota", get: (p) => (p ? p.marketValue : base.marketValue), raw: true },
    { label: "Věk", get: (p) => (p ? p.age : base.age), better: "low" },
    { label: "Riziko zranění", get: (p) => (p ? p.risk : base.riskLevel), risk: true },
  ];

  return (
    <div style={{ marginTop: 18, border: `1px solid ${C.line}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${others.length + 1}, 1fr)`, background: C.lineSoft }}>
        <div />
        <div style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: C.ink }}>{base.name}</div>
        {others.map((p) => (
          <div key={p.id} style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: C.ink }}>{p.name}</div>
        ))}
      </div>

      {summaryRows.map((row) => (
        <div key={row.label} style={{ display: "grid", gridTemplateColumns: `160px repeat(${others.length + 1}, 1fr)`, borderTop: `1px solid ${C.lineSoft}` }}>
          <div style={{ padding: "10px 12px", fontSize: 12, color: C.inkFaint }}>{row.label}</div>
          <div style={{ padding: "10px 12px", fontSize: 13, fontFamily: row.raw ? fontBody : fontMono, color: C.ink }}>
            {row.risk ? riskLabelText(row.get(null)) : row.get(null)}
          </div>
          {others.map((p) => {
            const baseVal = row.get(null);
            const otherVal = row.get(p);
            let color = C.ink;
            if (row.better && !row.risk) {
              const better = row.better === "high" ? otherVal > baseVal : otherVal < baseVal;
              const worse = row.better === "high" ? otherVal < baseVal : otherVal > baseVal;
              color = better ? C.turf : worse ? C.red : C.ink;
            }
            return (
              <div key={p.id} style={{ padding: "10px 12px", fontSize: 13, fontFamily: row.raw ? fontBody : fontMono, color: row.risk ? riskBadgeStyle(otherVal).c : color }}>
                {row.risk ? riskLabelText(otherVal) : otherVal}
              </div>
            );
          })}
        </div>
      ))}

      <div style={{ padding: "9px 12px", fontSize: 11, fontWeight: 700, color: C.inkFaint, background: C.lineSoft, borderTop: `1px solid ${C.line}` }}>
        HERNÍ METRIKY — PERCENTIL V RÁMCI POZICE A VĚKU
      </div>

      {breakdown.map((stat) => {
        const baseVal = stat.percentile;
        return (
          <div key={stat.id} style={{ display: "grid", gridTemplateColumns: `160px repeat(${others.length + 1}, 1fr)`, borderTop: `1px solid ${C.lineSoft}` }}>
            <div style={{ padding: "10px 12px", fontSize: 12, color: C.inkFaint }}>{stat.label}</div>
            <div style={{ padding: "10px 12px" }}>
              <MetricBar value={baseVal} color={C.turf} />
            </div>
            {others.map((p) => {
              const otherVal = p.metrics[stat.id];
              const color = otherVal > baseVal ? C.turf : otherVal < baseVal ? C.red : C.inkSoft;
              return (
                <div key={p.id} style={{ padding: "10px 12px" }}>
                  <MetricBar value={otherVal} color={color} />
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function riskLabelText(risk) {
  return { low: "Nízké", medium: "Střední", high: "Vysoké" }[risk] || risk;
}

// ---- Main component -----------------------------------------------------

export default function PlayerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("Statistiky");
  const [shortlisted, setShortlisted] = useState(false);
  const [expandedStat, setExpandedStat] = useState(null);
  const [selectedClips, setSelectedClips] = useState(new Set());
  const [scout, setScout] = useState("");
  const [style, setStyle] = useState("pressing");
  const [highlightTag, setHighlightTag] = useState(null);
  const [historyFilter, setHistoryFilter] = useState("all");
  const [expandedBadge, setExpandedBadge] = useState(null);
  const [riskExpanded, setRiskExpanded] = useState(false);
  const [compareSelected, setCompareSelected] = useState(new Set());
  const [reports, setReports] = useState([]);
  const [backendConnected, setBackendConnected] = useState(null); // null = ještě nezjištěno
  const [newReport, setNewReport] = useState({ author: "Petr Novák", match: "", recommendation: "Doporučit" });
  const [submitting, setSubmitting] = useState(false);

  // Hráč a jeho základní údaje — natažené z API podle :id v URL. emptyPlayer je
  // jen placeholder, dokud odpověď nedorazí.
  const [player, setPlayer] = useState(emptyPlayer);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingPlayer, setDeletingPlayer] = useState(false);
  const [confirmDeletePlayer, setConfirmDeletePlayer] = useState(false);

  // Veškerá "těžká" AI analytická data profilu — u nově přidaného hráče (nebo
  // hráče bez analytiky) zůstávají prázdná a příslušné sekce se pak skrývají,
  // místo aby appka ukazovala cizí (demo) data.
  const [breakdown, setBreakdown] = useState([]);
  const [styleContributions, setStyleContributions] = useState(null);
  const [clips, setClips] = useState([]);
  const [timeline, setTimeline] = useState([]);
  const [marketHistory, setMarketHistory] = useState([]);
  const [scoreHistoryRatios, setScoreHistoryRatios] = useState([]);
  const [matchPerformances, setMatchPerformances] = useState([]);
  const [clutchData, setClutchData] = useState(null);
  const [injuryRisk, setInjuryRisk] = useState(null);
  const [similarPlayers, setSimilarPlayers] = useState([]);
  const [physicalData, setPhysicalData] = useState(null);
  const [technicalMetrics, setTechnicalMetrics] = useState(null);
  const [mentalProfile, setMentalProfile] = useState(null);
  const [strengths, setStrengths] = useState([]);
  const [weaknesses, setWeaknesses] = useState([]);

  useEffect(() => {
    setNotFound(false);
    apiFetch(`/api/players/${id}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        setPlayer({
          name: data.name || "",
          club: data.club || "",
          position: data.position || "",
          age: data.age || "",
          height: data.height || "",
          foot: data.foot || "",
          marketValue: data.marketValue || 0,
          contractUntil: data.contractUntil || "",
          agent: data.agent || "",
          minutesTracked: data.minutesTracked || 0,
          riskLevel: data.riskLevel || "low",
        });
        setBreakdown(data.breakdown || []);
        setStyleContributions(data.styleContributions || null);
        setClips(data.clips || []);
        setTimeline(data.careerHistory || []);
        setMarketHistory(data.marketHistory || []);
        setScoreHistoryRatios(data.scoreHistoryRatios || []);
        setMatchPerformances(data.matchPerformances || []);
        setClutchData(data.clutchData || null);
        setInjuryRisk(data.injuryRisk || null);
        setSimilarPlayers(data.similarPlayersData || []);
        setPhysicalData(data.physicalData || null);
        setTechnicalMetrics(data.technicalMetrics || null);
        setMentalProfile(data.mentalProfile || null);
        setStrengths(data.strengths || []);
        setWeaknesses(data.weaknesses || []);
        setBackendConnected(true);
      })
      .catch(() => setBackendConnected(false));
  }, [id]);

  useEffect(() => {
    apiFetch(`/api/reports?playerId=${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then((data) => {
        setReports(data);
        setBackendConnected(true);
      })
      .catch(() => setBackendConnected(false));
  }, [id]);

  const submitReport = (e) => {
    e.preventDefault();
    setSubmitting(true);
    apiFetch(`/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: Number(id), ...newReport }),
    })
      .then((res) => {
        if (!res.ok) throw new Error("bad response");
        return res.json();
      })
      .then((created) => {
        setReports((prev) => [created, ...prev]);
        setNewReport({ author: "Petr Novák", match: "", recommendation: "Doporučit" });
        setBackendConnected(true);
      })
      .catch(() => setBackendConnected(false))
      .finally(() => setSubmitting(false));
  };

  const startEditing = () => {
    setEditForm({
      name: player.name || "",
      position: player.position || "",
      age: player.age || "",
      club: player.club || "",
      marketValue: player.marketValue || "",
      contractUntil: player.contractUntil || "",
      agent: player.agent || "",
      foot: player.foot || "",
      height: player.height || "",
    });
    setEditing(true);
  };

  const saveEdit = (e) => {
    e.preventDefault();
    setSavingEdit(true);
    apiFetch(`/api/players/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((updated) => {
        setPlayer((p) => ({ ...p, ...updated, marketValue: updated.marketValue ?? p.marketValue }));
        setEditing(false);
      })
      .catch(() => {})
      .finally(() => setSavingEdit(false));
  };

  const deletePlayer = () => {
    setDeletingPlayer(true);
    apiFetch(`/api/players/${id}`, { method: "DELETE" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(() => navigate("/hledani"))
      .catch(() => setDeletingPlayer(false));
  };

  // Jen Tomáš Kovář má v datech kompletní "styleContributions" (kontribuce metrik
  // podle filozofie klubu). U ostatních hráčů se stejný "Rozklad skóre" dá zobrazit
  // i bez toho — kontribuce se pak dopočítá přímo z percentilu dané metriky.
  const hasAnalytics = breakdown.length > 0;
  const contributions = hasAnalytics
    ? styleContributions
      ? styleContributions[style]
      : Object.fromEntries(breakdown.map((s) => [s.id, Math.round((s.percentile - 50) / 6)]))
    : null;
  const score = hasAnalytics ? Math.max(0, Math.min(100, BASE_SCORE + Object.values(contributions).reduce((sum, v) => sum + v, 0))) : null;

  const ranked = hasAnalytics ? [...breakdown].sort((a, b) => contributions[b.id] - contributions[a.id]) : [];
  const topPositive = ranked[0] || null;
  const topNegative = ranked[ranked.length - 1] || null;

  const riskLabel = { low: "Nízké riziko zranění", medium: "Střední riziko", high: "Vysoké riziko" }[player.riskLevel];
  const riskColor = { low: C.turf, medium: C.amber, high: C.red }[player.riskLevel];
  const riskBg = { low: C.turfSoft, medium: C.amberSoft, high: C.redSoft }[player.riskLevel];

  // Záložky se skládají dynamicky — prázdné sekce appka nenabízí.
  const tabs = [
    "Statistiky",
    ...(clips.length > 0 ? ["Video"] : []),
    "Reporty skautů",
    ...(timeline.length > 0 ? ["Historie"] : []),
    ...(similarPlayers.length > 0 ? ["Podobní hráči"] : []),
  ];

  useEffect(() => {
    setActiveTab("Statistiky");
  }, [id]);

  const toggleClip = (clipId) => {
    setSelectedClips((prev) => {
      const next = new Set(prev);
      next.has(clipId) ? next.delete(clipId) : next.add(clipId);
      return next;
    });
  };

  const clipsForTag = (tag) => clips.filter((c) => c.tag === tag);

  const reportConflict = new Set(reports.map((r) => r.recommendation)).size > 1;

  const filteredHistory = historyFilter === "all" ? timeline : timeline.filter((t) => t.category === historyFilter);
  const injuryDays = timeline.filter((t) => t.category === "injury").reduce((sum, t) => sum + (t.days || 0), 0);
  const transferCount = timeline.filter((t) => t.category === "transfer").length;

  const initials = (player.name || "")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  if (notFound) {
    return (
      <div style={{ background: C.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontBody }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: C.inkSoft, marginBottom: 12 }}>Hráč nenalezen.</p>
          <Link to="/hledani" style={{ color: C.turf, fontWeight: 600, textDecoration: "none" }}>← Zpět na vyhledávání</Link>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: C.bg, minHeight: "100vh", fontFamily: fontBody, color: C.ink }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap');
        * { box-sizing: border-box; }
        button:focus-visible { outline: 2px solid ${C.turf}; outline-offset: 2px; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spin { animation: spin 0.8s linear infinite; }
      `}</style>

      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>
        <Link to="/hledani" style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkFaint, fontSize: 13, textDecoration: "none", marginBottom: 16, width: "fit-content" }}>
          <ChevronLeft size={14} /> Zpět na vyhledávání
        </Link>

        {/* ---------- Header ---------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "22px 24px", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 20, marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 64, height: 64, borderRadius: 6, background: C.turfDark, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontFamily: fontDisplay, color: "#fff", fontSize: 20, fontWeight: 700 }}>{initials}</span>
            </div>
            <div>
              <h1 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, margin: 0 }}>{player.name}</h1>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <span style={{ fontSize: 13, color: C.inkSoft }}>{player.club}</span>
                <Divider />
                <span style={{ fontSize: 13, color: C.inkSoft }}>{player.position}</span>
                <Divider />
                <span style={{ fontSize: 13, color: C.inkSoft }}>{player.age} let</span>
                <button
                  onClick={() => injuryRisk && setRiskExpanded((v) => !v)}
                  style={{
                    marginLeft: 6,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "3px 8px",
                    borderRadius: 3,
                    color: riskColor,
                    background: riskBg,
                    border: "none",
                    cursor: injuryRisk ? "pointer" : "default",
                  }}
                >
                  {riskLabel}
                  {injuryRisk && (
                    <ChevronDown size={11} style={{ transform: riskExpanded ? "rotate(180deg)" : "none", transition: "transform 150ms" }} />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => setShortlisted((s) => !s)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: shortlisted ? "#fff" : C.ink, background: shortlisted ? C.turf : "#fff", border: `1px solid ${shortlisted ? C.turf : C.line}`, borderRadius: 4, cursor: "pointer" }}
            >
              <Star size={15} fill={shortlisted ? "#fff" : "none"} />
              {shortlisted ? "Na shortlistě" : "Sledovat"}
            </button>
            <button style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, cursor: "pointer" }}>
              <FileDown size={15} />
              Executive summary
            </button>
            <button
              onClick={() => navigate(`/hrac/${id}/statistiky`)}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: C.ink, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, cursor: "pointer" }}
            >
              <Pencil size={15} />
              {hasAnalytics ? "Upravit statistiky" : "Zadat statistiky"}
            </button>
            {!confirmDeletePlayer ? (
              <button
                onClick={() => setConfirmDeletePlayer(true)}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", fontFamily: fontBody, fontSize: 13, fontWeight: 600, color: C.red, background: "#fff", border: `1px solid ${C.line}`, borderRadius: 4, cursor: "pointer" }}
              >
                <Trash2 size={15} /> Smazat hráče
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
                <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>Opravdu smazat? Nevratné.</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={deletePlayer} disabled={deletingPlayer} style={{ padding: "6px 12px", background: C.red, color: "#fff", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    {deletingPlayer ? "Mažu…" : "Ano, smazat"}
                  </button>
                  <button onClick={() => setConfirmDeletePlayer(false)} style={{ padding: "6px 12px", background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                    Zrušit
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {riskExpanded && injuryRisk && <InjuryRiskPanel data={injuryRisk} />}

        {/* ---------- Základní údaje (editovatelné) ---------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "18px 24px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: editing ? 14 : 0 }}>
            <SectionLabel>Základní údaje</SectionLabel>
            {!editing && (
              <button onClick={startEditing} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.turf, background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                <Pencil size={13} /> Upravit
              </button>
            )}
          </div>
          {editing ? (
            <form onSubmit={saveEdit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                {[
                  ["name", "Jméno"],
                  ["position", "Pozice"],
                  ["age", "Věk"],
                  ["club", "Klub"],
                  ["marketValue", "Tržní hodnota (M €)"],
                  ["contractUntil", "Kontrakt do"],
                  ["agent", "Agent"],
                  ["foot", "Preferovaná noha"],
                  ["height", "Výška"],
                ].map(([field, label]) => (
                  <div key={field}>
                    <label style={{ display: "block", fontSize: 11, color: C.inkFaint, marginBottom: 4, fontWeight: 600 }}>{label}</label>
                    <input
                      value={editForm[field]}
                      onChange={(e) => setEditForm((f) => ({ ...f, [field]: e.target.value }))}
                      style={{ width: "100%", padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
                    />
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={savingEdit} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: C.turf, color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <Check size={13} /> {savingEdit ? "Ukládám…" : "Uložit"}
                </button>
                <button type="button" onClick={() => setEditing(false)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                  <X size={13} /> Zrušit
                </button>
              </div>
            </form>
          ) : null}
        </div>

        {/* ---------- Contract bar ---------- */}
        {player.contractUntil && (
          <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "14px 24px", marginBottom: 20, display: "flex", alignItems: "center", gap: 16 }}>
            <span style={{ fontSize: 12, color: C.inkSoft, flexShrink: 0 }}>Kontrakt do {player.contractUntil}</span>
          </div>
        )}

        {/* ---------- Tabs ---------- */}
        <div style={{ display: "flex", gap: 26, borderBottom: `1px solid ${C.line}`, marginBottom: 24, flexWrap: "wrap" }}>
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 0 12px 0", fontFamily: fontBody, fontSize: 14, fontWeight: activeTab === tab ? 700 : 500, color: activeTab === tab ? C.ink : C.inkFaint, borderBottom: activeTab === tab ? `2px solid ${C.turf}` : "2px solid transparent", marginBottom: -1 }}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* ---------- Content grid ---------- */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }} className="md:grid-cols-12">
          <div style={{ gridColumn: "span 12" }} className="md:col-span-8">
            {activeTab === "Statistiky" && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 24 }}>
                {!hasAnalytics && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, background: C.lineSoft, borderRadius: 6, padding: "10px 14px", marginBottom: physicalData || technicalMetrics || mentalProfile || strengths.length > 0 ? 20 : 0 }}>
                    <ShieldAlert size={14} color={C.inkFaint} />
                    <span style={{ fontSize: 12, color: C.inkSoft }}>
                      Pro tohoto hráče zatím nejsou k dispozici žádná AI analytická data (skóre, video, riziko zranění). Sem se doplní automaticky, jakmile budou nasbírána.
                    </span>
                  </div>
                )}

                {hasAnalytics && (
                  <>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
                      <SectionLabel>Celkové skóre</SectionLabel>
                      {styleContributions && (
                        <div>
                          <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 6 }}>Filozofie klubu</div>
                          <StyleSwitch active={style} onChange={setStyle} />
                        </div>
                      )}
                    </div>

                    <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 24 }}>
                      <ScoreDial value={score} />
                      <div style={{ flex: 1, minWidth: 240 }}>
                        <p style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.6, margin: 0 }}>
                          {styleContributions ? (
                            <>
                              Při zvolené filozofii (<strong style={{ color: C.ink }}>{STYLES.find((s) => s.id === style).label}</strong>) táhne skóre nahoru hlavně{" "}
                              <strong style={{ color: C.ink }}>{topPositive.label.toLowerCase()}</strong> (<span style={{ color: C.turf }}>+{contributions[topPositive.id]}</span>),
                              dolů ho stahuje <strong style={{ color: C.ink }}>{topNegative.label.toLowerCase()}</strong> (
                              <span style={{ color: contributions[topNegative.id] < 0 ? C.red : C.turf }}>{contributions[topNegative.id]}</span>). Percentily metrik jsou
                              objektivní a neměnné — mění se jen váha, kterou jim klub podle své filozofie přisuzuje.
                            </>
                          ) : (
                            <>
                              Skóre táhne nahoru hlavně <strong style={{ color: C.ink }}>{topPositive.label.toLowerCase()}</strong> ({topPositive.percentile}. percentil),
                              dolů ho stahuje <strong style={{ color: C.ink }}>{topNegative.label.toLowerCase()}</strong> ({topNegative.percentile}. percentil).
                            </>
                          )}
                        </p>
                      </div>
                    </div>

                    {scoreHistoryRatios.length > 0 && (
                      <div style={{ marginBottom: 24 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                          <SectionLabel>Jistota skóre v čase</SectionLabel>
                          <span style={{ fontSize: 11, color: C.inkFaint }}>rozpětí se zužuje s přibývajícími minutami (Krok 5)</span>
                        </div>
                        <ScoreCertaintyChart ratios={scoreHistoryRatios} currentScore={score} />
                      </div>
                    )}

                    {clutchData && (
                      <div style={{ marginBottom: 24, paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
                        <SectionLabel>Clutch performance</SectionLabel>
                        <ClutchCard data={clutchData} />
                      </div>
                    )}

                    <SectionLabel>Rozklad skóre po metrikách</SectionLabel>
                    <div>
                      {breakdown.map((stat) => (
                        <StatRow
                          key={stat.id}
                          stat={stat}
                          contribution={contributions[stat.id]}
                          expanded={expandedStat === stat.id}
                          onToggle={() => setExpandedStat(expandedStat === stat.id ? null : stat.id)}
                          clipsCount={stat.tag ? clipsForTag(stat.tag).length : 0}
                          onShowClips={() => {
                            setHighlightTag(stat.tag);
                            setActiveTab("Video");
                          }}
                        />
                      ))}
                    </div>
                  </>
                )}

                {(physicalData || technicalMetrics) && (
                  <div style={{ marginTop: hasAnalytics ? 24 : 0, paddingTop: hasAnalytics ? 20 : 0, borderTop: hasAnalytics ? `1px solid ${C.lineSoft}` : "none", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    {physicalData && (
                      <div>
                        <SectionLabel>Fyzická data</SectionLabel>
                        {[
                          ["Proběhaná vzdálenost", physicalData.distanceKm, "km/zápas"],
                          ["Sprinty", physicalData.sprints, "/zápas"],
                          ["Max. rychlost", physicalData.topSpeedKmh, "km/h"],
                          ["Vysoká intenzita", physicalData.highIntensityPct, "%"],
                        ]
                          .filter(([, raw]) => raw !== undefined && raw !== null && raw !== "")
                          .map(([label, raw, unit]) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                              <span style={{ color: C.inkFaint }}>{label}</span>
                              <span style={{ fontFamily: fontMono, color: C.ink, fontWeight: 600 }}>{raw} {unit}</span>
                            </div>
                          ))}
                      </div>
                    )}
                    {technicalMetrics && (
                      <div>
                        <SectionLabel>Technické metriky</SectionLabel>
                        {[
                          ["Úspěšnost driblinku", technicalMetrics.dribbleSuccessPct, "%"],
                          ["Klíčové přihrávky", technicalMetrics.keyPassesPerMatch, "/zápas"],
                          ["Vzdušné souboje", technicalMetrics.aerialDuelsWonPct, "%"],
                          ["Úspěšné odebrání míče", technicalMetrics.tacklesWonPct, "%"],
                          ["Přesnost přihrávek", technicalMetrics.passAccuracyPct, "%"],
                        ]
                          .filter(([, raw]) => raw !== undefined && raw !== null && raw !== "")
                          .map(([label, raw, unit]) => (
                            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                              <span style={{ color: C.inkFaint }}>{label}</span>
                              <span style={{ fontFamily: fontMono, color: C.ink, fontWeight: 600 }}>{raw} {unit}</span>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}

                {mentalProfile && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.lineSoft}` }}>
                    <SectionLabel>Mentální profil</SectionLabel>
                    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 10 }}>
                      {[
                        ["Lídrovství", mentalProfile.leadership],
                        ["Klid pod tlakem", mentalProfile.composure],
                        ["Koučovatelnost", mentalProfile.coachability],
                        ["Pracovitost", mentalProfile.workRate],
                      ]
                        .filter(([, value]) => value !== undefined && value !== null && value !== "")
                        .map(([label, value]) => (
                          <div key={label} style={{ minWidth: 100 }}>
                            <div style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 600, color: C.turf }}>{value}/10</div>
                            <div style={{ fontSize: 12, color: C.inkFaint }}>{label}</div>
                          </div>
                        ))}
                    </div>
                    {mentalProfile.note && <p style={{ fontSize: 13, color: C.inkSoft, lineHeight: 1.6, margin: 0 }}>{mentalProfile.note}</p>}
                  </div>
                )}

                {(strengths.length > 0 || weaknesses.length > 0) && (
                  <div style={{ marginTop: 24, paddingTop: 20, borderTop: `1px solid ${C.lineSoft}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                    {strengths.length > 0 && (
                      <div>
                        <SectionLabel>Silné stránky</SectionLabel>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.inkSoft, lineHeight: 1.8 }}>
                          {strengths.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                    {weaknesses.length > 0 && (
                      <div>
                        <SectionLabel>Slabé stránky</SectionLabel>
                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: C.inkSoft, lineHeight: 1.8 }}>
                          {weaknesses.map((s, i) => <li key={i}>{s}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {activeTab === "Video" && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <SectionLabel>Klipy ({selectedClips.size} vybráno pro reel)</SectionLabel>
                  {highlightTag && (
                    <button
                      onClick={() => setHighlightTag(null)}
                      style={{ display: "flex", alignItems: "center", gap: 6, background: C.turfSoft, color: C.turfDark, border: "none", borderRadius: 4, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                    >
                      Filtrováno: {highlightTag} <X size={13} />
                    </button>
                  )}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                  {clips.map((clip) => {
                    const selected = selectedClips.has(clip.id);
                    const matched = highlightTag ? clip.tag === highlightTag : true;
                    return (
                      <button
                        key={clip.id}
                        onClick={() => toggleClip(clip.id)}
                        style={{
                          textAlign: "left",
                          border: `1px solid ${selected ? C.turf : C.line}`,
                          borderRadius: 6,
                          padding: 0,
                          overflow: "hidden",
                          background: "#fff",
                          cursor: "pointer",
                          opacity: matched ? 1 : 0.35,
                        }}
                      >
                        <div style={{ height: 90, background: selected ? C.turfSoft : C.lineSoft, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <Play size={22} color={selected ? C.turf : C.inkFaint} />
                        </div>
                        <div style={{ padding: "10px 12px" }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{clip.title}</div>
                          <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 3 }}>{clip.tag} · {clip.duration}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {activeTab === "Reporty skautů" && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <SectionLabel>Reporty ({reports.length})</SectionLabel>
                  {backendConnected === false && (
                    <span style={{ fontSize: 11, color: C.amber, fontWeight: 600 }}>offline — zobrazena výchozí data</span>
                  )}
                  {backendConnected === true && (
                    <span style={{ fontSize: 11, color: C.turf, fontWeight: 600 }}>napojeno na server</span>
                  )}
                </div>
                {reportConflict && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, background: C.amberSoft, color: "#7A5A19", borderRadius: 6, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                    <AlertTriangle size={15} />
                    Rozdílná hodnocení skautů — doporučujeme nezávislý třetí report.
                  </div>
                )}
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                  {reports.map((r) => {
                    const rs = recommendationStyle(r.recommendation);
                    return (
                      <div key={r.id} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                          <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 14, fontWeight: 600 }}>{r.author}</span>
                              <ScoutCalibrationBadge
                                author={r.author}
                                expanded={expandedBadge === `${r.id}`}
                                onToggle={() => setExpandedBadge(expandedBadge === `${r.id}` ? null : `${r.id}`)}
                              />
                            </div>
                            <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 4 }}>{r.match || "bez zápasu"} — {r.date}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 4, color: rs.color, background: rs.bg }}>{r.recommendation}</span>
                            <button
                              onClick={() => {
                                apiFetch(`/api/reports/${r.id}`, { method: "DELETE" })
                                  .then((res) => (res.ok ? setReports((prev) => prev.filter((x) => x.id !== r.id)) : null))
                                  .catch(() => {});
                              }}
                              title="Smazat"
                              style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", padding: 2 }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* ---------- Formulář pro nový report — SKUTEČNĚ zapisuje přes backend ---------- */}
                <form onSubmit={submitReport} style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 18 }}>
                  <SectionLabel>Přidat nový report</SectionLabel>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                    <select
                      value={newReport.author}
                      onChange={(e) => setNewReport((r) => ({ ...r, author: e.target.value }))}
                      style={{ padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
                    >
                      <option>Petr Novák</option>
                      <option>Jana Bartošová</option>
                      <option>Karel Ryba</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Zápas (nepovinné)"
                      value={newReport.match}
                      onChange={(e) => setNewReport((r) => ({ ...r, match: e.target.value }))}
                      style={{ flex: 1, minWidth: 160, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
                    />
                    <select
                      value={newReport.recommendation}
                      onChange={(e) => setNewReport((r) => ({ ...r, recommendation: e.target.value }))}
                      style={{ padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
                    >
                      <option>Doporučit</option>
                      <option>Sledovat dál</option>
                      <option>Zamítnout</option>
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 16px", background: C.turf, color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
                  >
                    {submitting ? <Loader2 size={14} className="spin" /> : <Send size={14} />}
                    {submitting ? "Ukládám…" : "Uložit report na server"}
                  </button>
                  {backendConnected === false && (
                    <p style={{ fontSize: 11, color: C.red, marginTop: 8 }}>
                      Server na localhost:4000 neběží, report se neuloží trvale. Spusť ho příkazem <code style={{ fontFamily: fontMono }}>npm run dev</code> ve složce <code style={{ fontFamily: fontMono }}>server</code>.
                    </p>
                  )}
                </form>
              </div>
            )}

            {activeTab === "Historie" && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 24 }}>
                <SectionLabel>Kariérní historie</SectionLabel>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
                  <div style={{ flex: "1 1 140px", border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 14px" }}>
                    <div style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 600 }}>{transferCount}</div>
                    <div style={{ fontSize: 12, color: C.inkFaint }}>přestupy v kariéře</div>
                  </div>
                  <div style={{ flex: "1 1 140px", border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 14px" }}>
                    <div style={{ fontFamily: fontMono, fontSize: 20, fontWeight: 600, color: C.red }}>{injuryDays} dní</div>
                    <div style={{ fontSize: 12, color: C.inkFaint }}>mimo hru kvůli zranění</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, marginBottom: 18, flexWrap: "wrap" }}>
                  {HISTORY_FILTERS.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setHistoryFilter(f.id)}
                      style={{
                        padding: "6px 12px",
                        borderRadius: 5,
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                        border: `1px solid ${historyFilter === f.id ? C.turf : C.line}`,
                        color: historyFilter === f.id ? "#fff" : C.inkSoft,
                        background: historyFilter === f.id ? C.turf : "#fff",
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div style={{ position: "relative", paddingLeft: 20 }}>
                  <div style={{ position: "absolute", left: 4, top: 4, bottom: 4, width: 1, background: C.line }} />
                  {filteredHistory.map((t) => {
                    const dotColor = t.category === "injury" ? C.red : t.category === "milestone" ? C.amber : C.turf;
                    return (
                      <div key={t.id} style={{ position: "relative", paddingBottom: 22 }}>
                        <div style={{ position: "absolute", left: -20, top: 3, width: 9, height: 9, borderRadius: "50%", background: dotColor }} />
                        <div style={{ fontSize: 12, color: C.inkFaint }}>{t.date}</div>
                        <div style={{ fontSize: 14, color: C.ink, marginTop: 2 }}>{t.label}</div>
                      </div>
                    );
                  })}
                  {filteredHistory.length === 0 && (
                    <div style={{ fontSize: 13, color: C.inkFaint, paddingBottom: 10 }}>Žádné záznamy v této kategorii.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "Podobní hráči" && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                  <SectionLabel>Statisticky podobní hráči</SectionLabel>
                  <span style={{ fontSize: 11, color: C.inkFaint }}>vyber až 2 pro porovnání</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {similarPlayers.map((p) => {
                    const checked = compareSelected.has(p.id);
                    const rb = riskBadgeStyle(p.risk);
                    return (
                      <label
                        key={p.id}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 14px", border: `1px solid ${checked ? C.turf : C.line}`, borderRadius: 6, cursor: "pointer" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              setCompareSelected((prev) => {
                                const next = new Set(prev);
                                if (next.has(p.id)) {
                                  next.delete(p.id);
                                } else if (next.size < 2) {
                                  next.add(p.id);
                                }
                                return next;
                              });
                            }}
                            style={{ accentColor: C.turf }}
                          />
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</span>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 3, color: rb.c, background: rb.bg }}>{riskLabelText(p.risk)} riziko</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <span style={{ fontSize: 12, color: C.inkFaint }}>{p.similarity}% shoda</span>
                          <span style={{ fontFamily: fontMono, fontSize: 13, fontWeight: 600, color: p.priceDelta.startsWith("−") ? C.turf : C.amber }}>{p.priceDelta}</span>
                        </div>
                      </label>
                    );
                  })}
                </div>

                {compareSelected.size > 0 && (
                  <CompareTable
                    base={{ ...player, marketValue: player.marketValue ? `${Number(player.marketValue).toFixed(1)}M €` : "—" }}
                    baseScore={score}
                    others={similarPlayers.filter((p) => compareSelected.has(p.id))}
                    breakdown={breakdown}
                  />
                )}
              </div>
            )}
          </div>

          {/* ---------- Sidebar ---------- */}
          <div style={{ gridColumn: "span 12" }} className="md:col-span-4">
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
              <SectionLabel>Rychlé info</SectionLabel>
              {[
                ["Tržní hodnota", player.marketValue ? `${Number(player.marketValue).toFixed(1)}M €` : "—"],
                ["Agent", player.agent || "—"],
                ["Preferovaná noha", player.foot || "—"],
                ["Výška", player.height || "—"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "9px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                  <span style={{ color: C.inkFaint }}>{label}</span>
                  <span style={{ color: C.ink, fontWeight: 500 }}>{value}</span>
                </div>
              ))}
              {player.minutesTracked > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                  <ShieldCheck size={14} color={C.turf} />
                  <span style={{ fontSize: 12, color: C.inkSoft }}>Vysoká jistota dat ({player.minutesTracked} min sledováno)</span>
                </div>
              )}
            </div>

            {marketHistory.length > 1 && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <TrendingUp size={14} color={C.turf} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.ink }}>Vývoj tržní hodnoty</span>
                </div>
                <MarketValueChart data={marketHistory} />
              </div>
            )}

            {matchPerformances.length > 0 && (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                  <Gauge size={14} color={C.turf} />
                  <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.ink }}>Konzistence výkonu</span>
                </div>
                <ConsistencyCard scores={matchPerformances} />
              </div>
            )}

            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20 }}>
              <SectionLabel>Akce</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ActionButton icon={Star} primary={!shortlisted} onClick={() => setShortlisted((s) => !s)}>
                  {shortlisted ? "Odebrat ze shortlisty" : "Přidat do shortlisty"}
                </ActionButton>
                <ActionButton icon={FileDown}>Vytvořit executive summary</ActionButton>
                <div style={{ marginTop: 4 }}>
                  <label style={{ fontSize: 12, color: C.inkFaint, display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <UserPlus size={13} /> Přiřadit skauta
                  </label>
                  <select
                    value={scout}
                    onChange={(e) => setScout(e.target.value)}
                    style={{ width: "100%", padding: "9px 10px", fontFamily: fontBody, fontSize: 13, border: `1px solid ${C.line}`, borderRadius: 4, color: C.ink, background: "#fff" }}
                  >
                    <option value="">Vyber skauta…</option>
                    <option value="petr">Petr Novák</option>
                    <option value="jana">Jana Bartošová</option>
                    <option value="karel">Karel Ryba</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 24 }}>
          <Info size={13} color={C.inkFaint} />
          <span style={{ fontSize: 12, color: C.inkFaint }}>
            Klikací wireframe — zkus přepnout filozofii klubu u skóre nebo otevřít detail statistiky a skočit na klipy.
          </span>
        </div>
      </div>
    </div>
  );
}
