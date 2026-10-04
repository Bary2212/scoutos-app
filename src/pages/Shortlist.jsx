import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListChecks, X, GripVertical, FileDown, Loader2, Scale } from "lucide-react";
import { apiFetch } from "../api.js";
import { useAuth } from "../AuthContext.jsx";
import { downloadShortlistExport } from "../lib/shortlistExport.js";

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
  line: "#DADDD3",
  lineSoft: "#EAEBE4",
};

const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";
const fontMono = "'IBM Plex Mono', monospace";

const STAGES = ["Sledovaný", "Hodnocený", "Doporučený", "V jednání", "Uzavřeno"];

export default function Shortlist() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [board, setBoard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dragOverStage, setDragOverStage] = useState(null);
  const [draggingId, setDraggingId] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    load();
  }, []);

  function load() {
    setLoading(true);
    setError(null);
    return apiFetch("/api/shortlist")
      .then((res) => {
        if (!res.ok) throw new Error("fail");
        return res.json();
      })
      .then(setBoard)
      .catch(() => setError("Nepodařilo se připojit k serveru."))
      .finally(() => setLoading(false));
  }

  function moveCard(playerId, fromStage, toStage) {
    if (fromStage === toStage) return;
    // Optimistická aktualizace — karta se přesune hned, server se dožádá na pozadí.
    setBoard((b) => {
      const card = b[fromStage].find((p) => p.id === playerId);
      if (!card) return b;
      return {
        ...b,
        [fromStage]: b[fromStage].filter((p) => p.id !== playerId),
        [toStage]: [...b[toStage], card],
      };
    });
    apiFetch(`/api/players/${playerId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: toStage }),
    }).catch(() => load()); // při chybě si radši natáhneme pravdu ze serveru znovu
  }

  function removeCard(playerId, fromStage) {
    setBoard((b) => ({ ...b, [fromStage]: b[fromStage].filter((p) => p.id !== playerId) }));
    setSelected((s) => {
      if (!s.has(playerId)) return s;
      const next = new Set(s);
      next.delete(playerId);
      return next;
    });
    apiFetch(`/api/players/${playerId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: null }),
    }).catch(() => load());
  }

  function toggleSelect(playerId) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(playerId)) next.delete(playerId);
      else next.add(playerId);
      return next;
    });
  }

  function toggleSelectStage(stage) {
    const ids = board[stage].map((p) => p.id);
    const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
    setSelected((s) => {
      const next = new Set(s);
      if (allSelected) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  async function exportSelected() {
    if (!board || selected.size === 0) return;
    setExporting(true);
    try {
      const stageGroups = STAGES.map((stage) => ({
        stage,
        players: board[stage].filter((p) => selected.has(p.id)),
      })).filter((g) => g.players.length > 0);
      await downloadShortlistExport({ stageGroups, scoutName: user?.name });
    } catch {
      setError("Export do PDF se nezdařil.");
    } finally {
      setExporting(false);
    }
  }

  function comparePlayers() {
    navigate(`/porovnani?ids=${Array.from(selected).join(",")}`);
  }

  const totalCount = board ? Object.values(board).reduce((sum, arr) => sum + arr.length, 0) : 0;
  const compareDisabled = selected.size < 2 || selected.size > 3;

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <style>{`
        @keyframes shortlist-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .shortlist-spin { animation: shortlist-spin 0.8s linear infinite; }
      `}</style>
      <div style={{ maxWidth: 1400, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          <ListChecks size={18} color={C.turf} />
          <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>Shortlist</h1>
          {!loading && !error && (
            <span style={{ fontSize: 12, color: C.inkFaint, marginLeft: 4 }}>
              {totalCount} {totalCount === 1 ? "hráč" : totalCount >= 2 && totalCount <= 4 ? "hráči" : "hráčů"} sledovaných
            </span>
          )}
          <div style={{ flex: 1 }} />
          {!loading && !error && selected.size > 0 && (
            <>
              <span style={{ fontSize: 12, color: C.inkSoft }}>Vybráno: {selected.size}</span>
              <button
                onClick={() => setSelected(new Set())}
                style={{ background: "none", border: "none", color: C.inkFaint, fontSize: 12, cursor: "pointer", padding: "4px 6px" }}
              >
                Zrušit výběr
              </button>
              <button
                onClick={comparePlayers}
                disabled={compareDisabled}
                title={compareDisabled ? "Vyber 2–3 hráče k porovnání" : "Porovnat vybrané hráče"}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "#fff",
                  color: compareDisabled ? C.inkFaint : C.ink,
                  border: `1px solid ${C.line}`,
                  borderRadius: 4,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: compareDisabled ? "default" : "pointer",
                  opacity: compareDisabled ? 0.6 : 1,
                }}
              >
                <Scale size={13} />
                Porovnat
              </button>
              <button
                onClick={exportSelected}
                disabled={exporting}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: C.turf,
                  color: "#fff",
                  border: "none",
                  borderRadius: 4,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: exporting ? "default" : "pointer",
                  opacity: exporting ? 0.7 : 1,
                }}
              >
                {exporting ? <Loader2 size={13} className="shortlist-spin" /> : <FileDown size={13} />}
                Exportovat do PDF
              </button>
            </>
          )}
        </div>

        {loading && <div style={{ fontSize: 13, color: C.inkFaint }}>Načítám…</div>}
        {error && (
          <div style={{ background: C.redSoft, color: C.red, padding: "10px 14px", borderRadius: 6, fontSize: 13 }}>{error}</div>
        )}

        {board && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(220px, 1fr))`, gap: 14, overflowX: "auto" }}>
            {STAGES.map((stage) => (
              <div
                key={stage}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverStage(stage);
                }}
                onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOverStage(null);
                  const data = e.dataTransfer.getData("text/plain");
                  if (!data) return;
                  const { playerId, fromStage } = JSON.parse(data);
                  moveCard(playerId, fromStage, stage);
                }}
                style={{
                  background: dragOverStage === stage ? C.turfSoft : C.lineSoft,
                  border: `1px dashed ${dragOverStage === stage ? C.turf : C.line}`,
                  borderRadius: 8,
                  padding: 10,
                  minHeight: 300,
                  transition: "background 100ms",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "4px 6px 10px" }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{stage}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {board[stage].length > 0 && (
                      <button
                        onClick={() => toggleSelectStage(stage)}
                        style={{ background: "none", border: "none", color: C.turf, fontSize: 10.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
                      >
                        {board[stage].every((p) => selected.has(p.id)) ? "Zrušit" : "Vybrat vše"}
                      </button>
                    )}
                    <span style={{ fontFamily: fontMono, fontSize: 12, color: C.inkFaint }}>{board[stage].length}</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {board[stage].map((p) => (
                    <div
                      key={p.id}
                      draggable
                      onDragStart={(e) => {
                        setDraggingId(p.id);
                        e.dataTransfer.setData("text/plain", JSON.stringify({ playerId: p.id, fromStage: stage }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      style={{
                        background: C.panel,
                        border: `1px solid ${C.line}`,
                        borderRadius: 6,
                        padding: "10px 10px 10px 6px",
                        cursor: "grab",
                        opacity: draggingId === p.id ? 0.4 : 1,
                        display: "flex",
                        gap: 4,
                      }}
                    >
                      <GripVertical size={14} color={C.inkFaint} style={{ flexShrink: 0, marginTop: 2 }} />
                      <input
                        type="checkbox"
                        checked={selected.has(p.id)}
                        onChange={() => toggleSelect(p.id)}
                        onMouseDown={(e) => e.stopPropagation()}
                        draggable={false}
                        style={{ marginTop: 2, flexShrink: 0, cursor: "pointer", accentColor: C.turf }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 4 }}>
                          <Link
                            to={`/hrac/${p.id}`}
                            style={{ fontSize: 13, fontWeight: 600, color: C.ink, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                          >
                            {p.name}
                          </Link>
                          <button
                            onClick={() => removeCard(p.id, stage)}
                            title="Odebrat ze shortlisty"
                            style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint, padding: 2, flexShrink: 0 }}
                          >
                            <X size={13} />
                          </button>
                        </div>
                        <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
                          {p.position} — {p.club}
                        </div>
                        <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 1 }}>
                          {p.age} let — {p.marketValue.toFixed(1)}M €
                        </div>
                      </div>
                    </div>
                  ))}
                  {board[stage].length === 0 && (
                    <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", padding: "16px 4px" }}>Přetáhni sem hráče</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {board && totalCount === 0 && (
          <p style={{ fontSize: 13, color: C.inkFaint, marginTop: 20 }}>
            Zatím nemáš žádné hráče na shortlistě. U profilu hráče klikni na „Sledovat“ a objeví se tady.
          </p>
        )}
      </div>
    </div>
  );
}
