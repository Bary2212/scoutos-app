import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";
import { apiFetch } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { MATCH_STATUS, formatKickoff, isUpcoming } from "../lib/matches.js";

const C = {
  panel: "#FFFFFF",
  ink: "#14201A",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  red: "#B23A2E",
  amber: "#C98A2C",
  line: "#DADDD3",
};
const fontDisplay = "'Space Grotesk', sans-serif";

function Chip({ status, children }) {
  const st = MATCH_STATUS[status] || MATCH_STATUS.prideleno;
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "2px 7px", borderRadius: 10, background: st.bg, color: st.fg }}>{children}</span>
  );
}

// Karta „Nadcházející zápasy“ na Dashboardu: hlavní skaut vidí zápasy celého klubu
// a kdo kam jede, běžný skaut jen svoje.
export default function UpcomingMatchesCard() {
  const { user } = useAuth();
  const [matches, setMatches] = useState(null);
  const head = user?.role === "hlavni_skaut";

  useEffect(() => {
    apiFetch("/api/club-matches")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) => setMatches(list.filter(isUpcoming).slice(0, 5)))
      .catch(() => setMatches([]));
  }, []);

  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 22, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <CalendarDays size={15} color={C.turf} />
          <span style={{ fontFamily: fontDisplay, fontSize: 14, fontWeight: 700, color: C.ink }}>
            {head ? "Nadcházející zápasy — koho poslat" : "Moje nadcházející zápasy"}
          </span>
        </div>
        <Link to="/zapasy" style={{ fontSize: 12, fontWeight: 600, color: C.turf, textDecoration: "none" }}>
          {head ? "Plánovač →" : "Všechny →"}
        </Link>
      </div>

      {matches === null ? (
        <div style={{ fontSize: 13, color: C.inkFaint }}>Načítám…</div>
      ) : matches.length === 0 ? (
        <div style={{ padding: "12px 0", textAlign: "center", color: C.inkFaint, fontSize: 13, lineHeight: 1.5 }}>
          {head ? (
            <>
              Zatím nemáš naplánované žádné zápasy.{" "}
              <Link to="/zapasy" style={{ color: C.turf, fontWeight: 600, textDecoration: "none" }}>Naplánovat první →</Link>
            </>
          ) : (
            "Zatím tě nikdo neposlal na žádný zápas."
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {matches.map((m) => (
            <Link key={m.id} to="/zapasy" style={{ textDecoration: "none", color: C.ink, border: `1px solid ${C.line}`, borderRadius: 6, padding: "10px 12px", display: "block" }}>
              <div style={{ fontSize: 11, color: C.inkFaint }}>{formatKickoff(m.kickoff)}{m.competition ? ` • ${m.competition}` : ""}</div>
              <div style={{ fontSize: 13, fontWeight: 600, margin: "2px 0 6px" }}>{m.fixture}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {head ? (
                  m.scouts.length === 0 ? (
                    <Chip status="odmitnuto">Bez skauta</Chip>
                  ) : (
                    m.scouts.map((s) => (
                      <Chip key={s.userId} status={s.status}>
                        {s.name} • {MATCH_STATUS[s.status]?.label}
                      </Chip>
                    ))
                  )
                ) : (
                  <Chip status={m.myStatus}>{MATCH_STATUS[m.myStatus]?.label}</Chip>
                )}
                {head && m.conflicts.length > 0 && <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>⚠ kolize termínů</span>}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
