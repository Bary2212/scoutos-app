import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CheckCircle2,
  CalendarDays,
  Users,
  Map,
  ListChecks,
  ArrowRight,
  ServerCrash,
} from "lucide-react";
import { apiFetch } from "../api.js";
import { useAuth } from "../AuthContext.jsx";


// ---- Design tokens (stejné jako Player Profile, pro vizuální konzistenci napříč appkou) ----
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

// ---- Mock data ------------------------------------------------------------

const fallbackLeagues = ["1. liga ČR", "2. liga ČR", "Slovenská liga", "Polská Ekstraklasa"];
const fallbackPositions = ["Brankáři", "Obránci", "Záložníci", "Útočníci"];

const fallbackCoverageData = {
  "1. liga ČR": { Brankáři: 78, Obránci: 85, Záložníci: 90, Útočníci: 82 },
  "2. liga ČR": { Brankáři: 45, Obránci: 60, Záložníci: 55, Útočníci: 40 },
  "Slovenská liga": { Brankáři: 20, Obránci: 35, Záložníci: 25, Útočníci: 15 },
  "Polská Ekstraklasa": { Brankáři: 10, Obránci: 18, Záložníci: 22, Útočníci: 12 },
};

function coverageColor(pct) {
  if (pct >= 65) return { bg: C.turf, text: "#fff" };
  if (pct >= 35) return { bg: C.amber, text: "#fff" };
  return { bg: C.red, text: "#fff" };
}

// Výchozí data pro případ, že backend zrovna neběží — appka díky tomu
// nezůstane prázdná, jen na to upozorní.
const fallbackConflicts = [
  {
    playerId: 1,
    player: "Tomáš Kovář",
    position: "Pravý obránce",
    scouts: [
      { name: "Petr Novák", recommendation: "Doporučit" },
      { name: "Jana Bartošová", recommendation: "Sledovat dál" },
    ],
  },
];

const fallbackMatches = [
  { id: 1, date: "6. zář 2026", fixture: "Slavoj Karviná – FK Ostrov Bytom", suggestedScout: "Petr Novák", reason: "Nejblíž a už sledoval soupeře", assignedScout: "Petr Novák" },
  { id: 2, date: "7. zář 2026", fixture: "Baník Karviná B – FC Silesia", suggestedScout: "Jana Bartošová", reason: "Specializace na středoevropský trh", assignedScout: "Jana Bartošová" },
  { id: 3, date: "9. zář 2026", fixture: "Widzew Łódź – Górnik Zabrze", suggestedScout: "Karel Ryba", reason: "Jazyková znalost, blízkost", assignedScout: "Karel Ryba" },
];

const scouts = ["Petr Novák", "Jana Bartošová", "Karel Ryba"];

const fallbackShortlistStages = [
  { stage: "Sledovaný", count: 14 },
  { stage: "Hodnocený", count: 9 },
  { stage: "Doporučený", count: 5 },
  { stage: "V jednání", count: 2 },
  { stage: "Uzavřeno", count: 3 },
];

// ---- Small building blocks --------------------------------------------

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "16px 18px", flex: "1 1 160px" }}>
      <div style={{ fontFamily: fontMono, fontSize: 26, fontWeight: 600, color: color || C.ink }}>{value}</div>
      <div style={{ fontSize: 12, color: C.inkSoft, marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function SectionLabel({ icon: Icon, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      {Icon && <Icon size={15} color={C.turf} />}
      <span style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: C.ink }}>{children}</span>
    </div>
  );
}

// ---- Main component -----------------------------------------------------

export default function Dashboard() {
  const { user } = useAuth();
  const [conflicts, setConflicts] = useState(fallbackConflicts);
  const [matches, setMatches] = useState(fallbackMatches);
  const [backendConnected, setBackendConnected] = useState(null);
  const [resolvedIds, setResolvedIds] = useState(new Set());
  const [selectedCell, setSelectedCell] = useState({ league: "Slovenská liga", position: "Útočníci" });
  const [savingId, setSavingId] = useState(null);
  const [leagues, setLeagues] = useState(fallbackLeagues);
  const [positions, setPositions] = useState(fallbackPositions);
  const [coverage, setCoverage] = useState(fallbackCoverageData);
  const [shortlistStages, setShortlistStages] = useState(fallbackShortlistStages);
  const [playerCount, setPlayerCount] = useState(null);

  useEffect(() => {
    Promise.all([
      apiFetch(`/api/conflicts`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      apiFetch(`/api/matches`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      apiFetch(`/api/coverage`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      apiFetch(`/api/shortlist-stages`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
      apiFetch(`/api/players`).then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      }),
    ])
      .then(([conflictsData, matchesData, coverageData, stagesData, playersData]) => {
        setConflicts(conflictsData);
        setMatches(matchesData);
        setLeagues(coverageData.leagues);
        setPositions(coverageData.positions);
        setCoverage(coverageData.data);
        setShortlistStages(stagesData);
        setPlayerCount(playersData.length);
        setBackendConnected(true);
      })
      .catch(() => setBackendConnected(false));
  }, []);

  const resolveConflict = (playerId) => {
    setResolvedIds((prev) => new Set(prev).add(playerId));
  };

  const assignScout = (matchId, scoutName) => {
    setMatches((prev) => prev.map((m) => (m.id === matchId ? { ...m, assignedScout: scoutName } : m)));
    if (backendConnected === false) return; // bez backendu jen lokální náhled
    setSavingId(matchId);
    apiFetch(`/api/matches/${matchId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedScout: scoutName }),
    })
      .catch(() => setBackendConnected(false))
      .finally(() => setSavingId(null));
  };

  const activeConflicts = conflicts.filter((c) => !resolvedIds.has(c.playerId));
  const blindSpots = leagues.flatMap((l) => positions.filter((p) => coverage[l][p] < 25).map((p) => `${l} – ${p}`));

  const selectedPct = coverage[selectedCell.league]?.[selectedCell.position];

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "28px 20px 60px" }}>
        {/* ---------- Header ---------- */}
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, margin: 0 }}>Dobrý den, {user?.name?.split(" ")[0] || ""}</h1>
          <p style={{ fontSize: 13, color: C.inkFaint, marginTop: 4 }}>Úterý, 2. září 2026 — přehled skautské sítě</p>
        </div>

        {/* ---------- Stat cards ---------- */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 28 }}>
          <StatCard label="Hráčů v tvé databázi" value={playerCount ?? "…"} />
          <StatCard label="Otevřené rozpory" value={activeConflicts.length} color={activeConflicts.length > 0 ? C.amber : C.turf} sub="vyžadují rozhodnutí" />
          {user?.isDemoTeam ? (
            <StatCard label="Skauti v terénu tento týden" value="5 / 8" />
          ) : (
            <StatCard label="Skauti v týmu" value="1" sub="pozvi kolegy (připravujeme)" />
          )}
          <StatCard label="Slepá místa v pokrytí" value={blindSpots.length} color={blindSpots.length > 0 ? C.red : C.turf} sub="liga × pozice pod 25 %" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 20 }} className="md:grid-cols-12">
          {/* ---------- Left column ---------- */}
          <div style={{ gridColumn: "span 12" }} className="md:col-span-7">
            {/* Coverage map */}
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 22, marginBottom: 20 }}>
              <SectionLabel icon={Map}>Mapa pokrytí (liga × pozice)</SectionLabel>
              {leagues.length === 0 ? (
                <div style={{ padding: "24px 0", textAlign: "center", color: C.inkFaint, fontSize: 13 }}>
                  Zatím nemáš žádná data o pokrytí lig — objeví se, jakmile s týmem začnete sledovat zápasy napříč soutěžemi.
                </div>
              ) : (
                <>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left", padding: "6px 8px", color: C.inkFaint, fontWeight: 500 }}></th>
                          {positions.map((p) => (
                            <th key={p} style={{ textAlign: "center", padding: "6px 8px", color: C.inkFaint, fontWeight: 500 }}>
                              {p}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {leagues.map((l) => (
                          <tr key={l}>
                            <td style={{ padding: "6px 8px", color: C.inkSoft, whiteSpace: "nowrap" }}>{l}</td>
                            {positions.map((p) => {
                              const pct = coverage[l][p];
                              const style = coverageColor(pct);
                              const isSelected = selectedCell.league === l && selectedCell.position === p;
                              return (
                                <td key={p} style={{ padding: 4, textAlign: "center" }}>
                                  <button
                                    onClick={() => setSelectedCell({ league: l, position: p })}
                                    style={{
                                      width: 52,
                                      height: 32,
                                      border: isSelected ? `2px solid ${C.ink}` : "2px solid transparent",
                                      borderRadius: 4,
                                      background: style.bg,
                                      color: style.text,
                                      fontFamily: fontMono,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      cursor: "pointer",
                                    }}
                                  >
                                    {pct}%
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {selectedPct !== undefined && (
                    <div style={{ marginTop: 14, padding: "10px 14px", background: C.lineSoft, borderRadius: 6, fontSize: 12, color: C.inkSoft }}>
                      <strong style={{ color: C.ink }}>{selectedCell.league} — {selectedCell.position}:</strong> {selectedPct}% pokrytí.{" "}
                      {selectedPct < 25
                        ? "Slepé místo — zvaž přiřazení skauta na nejbližší zápasy v této kategorii."
                        : selectedPct < 65
                        ? "Střední pokrytí — sledovat, ale není to kritické."
                        : "Dobře pokryto."}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Conflicts */}
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 22 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <SectionLabel icon={AlertTriangle}>Rozporové tikety ({activeConflicts.length})</SectionLabel>
                {backendConnected === false && (
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: C.amber, fontWeight: 600 }}>
                    <ServerCrash size={12} /> offline — výchozí data
                  </span>
                )}
                {backendConnected === true && (
                  <span style={{ fontSize: 11, color: C.turf, fontWeight: 600 }}>dopočítáno ze skutečných reportů</span>
                )}
              </div>
              {conflicts.map((c) => {
                const resolved = resolvedIds.has(c.playerId);
                return (
                  <div
                    key={c.playerId}
                    style={{
                      border: `1px solid ${C.line}`,
                      borderRadius: 6,
                      padding: "14px 16px",
                      marginBottom: 10,
                      opacity: resolved ? 0.5 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14, fontWeight: 600 }}>{c.player}</span>
                          <span style={{ fontSize: 12, color: C.inkFaint }}>{c.position}</span>
                          {c.playerId === 1 && (
                            <Link to="/hrac" style={{ fontSize: 11, color: C.turf, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 3 }}>
                              Profil <ArrowRight size={11} />
                            </Link>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
                          {c.scouts.map((s, idx) => (
                            <div key={`${s.name}-${idx}`} style={{ fontSize: 12, color: C.inkSoft }}>
                              <strong style={{ color: C.ink }}>{s.name}:</strong> {s.recommendation}
                            </div>
                          ))}
                        </div>
                      </div>
                      {resolved ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: C.turf, fontWeight: 600, whiteSpace: "nowrap" }}>
                          <CheckCircle2 size={14} /> Vyřešeno
                        </span>
                      ) : (
                        <button
                          onClick={() => resolveConflict(c.playerId)}
                          style={{ fontSize: 12, fontWeight: 600, color: C.turf, background: C.turfSoft, border: "none", borderRadius: 4, padding: "6px 12px", cursor: "pointer", whiteSpace: "nowrap" }}
                        >
                          Vyžádat 3. report
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {activeConflicts.length === 0 && (
                <div style={{ fontSize: 13, color: C.inkFaint }}>Žádné otevřené rozpory. Dobrá práce.</div>
              )}
            </div>
          </div>

          {/* ---------- Right column ---------- */}
          <div style={{ gridColumn: "span 12" }} className="md:col-span-5">
            {/* Upcoming matches */}
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 22, marginBottom: 20 }}>
              <SectionLabel icon={CalendarDays}>Nadcházející zápasy — koho poslat</SectionLabel>
              {matches.length === 0 ? (
                <div style={{ padding: "16px 0", textAlign: "center", color: C.inkFaint, fontSize: 13 }}>
                  Zatím nemáš naplánované žádné zápasy ke sledování.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {matches.map((m) => {
                    const overridden = m.assignedScout !== m.suggestedScout;
                    return (
                      <div key={m.id} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "12px 14px" }}>
                        <div style={{ fontSize: 13, fontWeight: 600 }}>{m.fixture}</div>
                        <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>{m.date}</div>
                        <div style={{ fontSize: 11, color: C.inkSoft, marginTop: 6, fontStyle: "italic" }}>
                          Návrh: {m.suggestedScout} — {m.reason}
                        </div>
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8 }}>
                          <Users size={13} color={C.inkFaint} />
                          <select
                            value={m.assignedScout}
                            onChange={(e) => assignScout(m.id, e.target.value)}
                            style={{ fontSize: 12, padding: "5px 8px", border: `1px solid ${C.line}`, borderRadius: 4, color: C.ink, background: overridden ? C.amberSoft : "#fff" }}
                          >
                            {scouts.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                          {overridden && <span style={{ fontSize: 10, color: C.amber, fontWeight: 600 }}>upraveno</span>}
                          {savingId === m.id && <span style={{ fontSize: 10, color: C.inkFaint }}>ukládám…</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Shortlist funnel */}
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 22 }}>
              <SectionLabel icon={ListChecks}>Shortlisty podle stavu</SectionLabel>
              {shortlistStages.length === 0 ? (
                <div style={{ padding: "16px 0", textAlign: "center", color: C.inkFaint, fontSize: 13 }}>
                  Zatím nemáš žádné shortlisty — přidej hráče a začni je sledovat.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {shortlistStages.map((s) => {
                    const max = Math.max(...shortlistStages.map((x) => x.count));
                    return (
                      <div key={s.stage}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.inkSoft, marginBottom: 3 }}>
                          <span>{s.stage}</span>
                          <span style={{ fontFamily: fontMono, fontWeight: 600, color: C.ink }}>{s.count}</span>
                        </div>
                        <div style={{ height: 6, background: C.lineSoft, borderRadius: 3 }}>
                          <div style={{ width: `${(s.count / max) * 100}%`, height: "100%", borderRadius: 3, background: C.turf }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
