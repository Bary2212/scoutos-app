import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ListChecks, X, GripVertical, FileDown, Loader2, Scale, PenLine } from "lucide-react";
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
  const [noteOpen, setNoteOpen] = useState(false);
  const [exportNote, setExportNote] = useState("");
  const [closing, setClosing] = useState(null); // { playerId, fromStage, name, outcome, reason }
  const [stateFilter, setStateFilter] = useState("all");

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

  function moveCard(playerId, fromStage, toStage, closeInfo = null) {
    if (fromStage === toStage && !closeInfo) return;
    // Optimistická aktualizace — karta se přesune hned, server se dožádá na pozadí.
    setBoard((b) => {
      const card = b[fromStage].find((p) => p.id === playerId);
      if (!card) return b;
      const updated = {
        ...card,
        closedOutcome: closeInfo ? closeInfo.outcome : null,
        closedReason: closeInfo ? closeInfo.reason : null,
      };
      if (fromStage === toStage) {
        return { ...b, [fromStage]: b[fromStage].map((p) => (p.id === playerId ? updated : p)) };
      }
      return {
        ...b,
        [fromStage]: b[fromStage].filter((p) => p.id !== playerId),
        [toStage]: [...b[toStage], updated],
      };
    });
    apiFetch(`/api/players/${playerId}/stage`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage: toStage, ...(closeInfo ? { outcome: closeInfo.outcome, reason: closeInfo.reason } : {}) }),
    })
      .then((res) => {
        if (!res.ok) load(); // server změnu odmítl — natáhneme pravdu znovu
      })
      .catch(() => load()); // při chybě si radši natáhneme pravdu ze serveru znovu
  }

  // Přesun do "Uzavřeno" nejdřív otevře dialog s výsledkem a důvodem.
  function requestMove(playerId, fromStage, toStage) {
    if (toStage === "Uzavřeno" && fromStage !== "Uzavřeno") {
      const card = board[fromStage].find((p) => p.id === playerId);
      setClosing({ playerId, fromStage, name: card?.name || "", outcome: "", reason: "" });
      return;
    }
    moveCard(playerId, fromStage, toStage);
  }

  function editClosing(card) {
    setClosing({ playerId: card.id, fromStage: "Uzavřeno", name: card.name, outcome: card.closedOutcome || "", reason: card.closedReason || "" });
  }

  function confirmClosing() {
    if (!closing || !closing.outcome || !closing.reason.trim()) return;
    moveCard(closing.playerId, closing.fromStage, "Uzavřeno", { outcome: closing.outcome, reason: closing.reason.trim() });
    setClosing(null);
  }

  // Filtr stavu: otevřené (bez "Uzavřeno"), uzavřené pozitivně / negativně.
  function visibleCards(stage) {
    const cards = board[stage];
    if (stateFilter === "open") return stage === "Uzavřeno" ? [] : cards;
    if (stateFilter === "positive") return stage === "Uzavřeno" ? cards.filter((p) => p.closedOutcome === "positive") : [];
    if (stateFilter === "negative") return stage === "Uzavřeno" ? cards.filter((p) => p.closedOutcome === "negative") : [];
    return cards;
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
    const ids = visibleCards(stage).map((p) => p.id);
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
        players: visibleCards(stage).filter((p) => selected.has(p.id)),
      })).filter((g) => g.players.length > 0);
      await downloadShortlistExport({ stageGroups, scoutName: user?.name, note: exportNote });
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
  const COMPARE_MAX = 6;
  const compareDisabled = selected.size < 2 || selected.size > COMPARE_MAX;

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
          {!loading && !error && totalCount > 0 && (
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              aria-label="Filtr stavu"
              style={{ padding: "7px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 12, fontFamily: fontBody, color: C.ink, background: "#fff" }}
            >
              <option value="all">Všechny stavy</option>
              <option value="open">Otevřené</option>
              <option value="positive">Uzavřeno pozitivně</option>
              <option value="negative">Uzavřeno negativně</option>
            </select>
          )}
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
                title={compareDisabled ? `Vyber 2–${COMPARE_MAX} hráčů k porovnání` : "Porovnat vybrané hráče"}
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
                onClick={() => setNoteOpen((o) => !o)}
                title="Přidat poznámku do exportovaného PDF"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: noteOpen || exportNote ? C.turfSoft : "#fff",
                  color: noteOpen || exportNote ? C.turf : C.ink,
                  border: `1px solid ${noteOpen || exportNote ? C.turf : C.line}`,
                  borderRadius: 4,
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                <PenLine size={13} />
                Poznámka{exportNote ? " ✓" : ""}
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

        {!loading && !error && selected.size > 0 && noteOpen && (
          <div style={{ marginBottom: 16, marginTop: -6 }}>
            <textarea
              value={exportNote}
              onChange={(e) => setExportNote(e.target.value.slice(0, 400))}
              placeholder="Krátká poznámka pro vedení klubu, která se zobrazí v hlavičce PDF (volitelné)…"
              maxLength={400}
              rows={2}
              style={{
                width: "100%",
                maxWidth: 600,
                fontFamily: fontBody,
                fontSize: 13,
                color: C.ink,
                border: `1px solid ${C.line}`,
                borderRadius: 6,
                padding: "8px 10px",
                resize: "vertical",
                boxSizing: "border-box",
              }}
            />
            <div style={{ fontSize: 10.5, color: C.inkFaint, marginTop: 3 }}>{exportNote.length}/400</div>
          </div>
        )}

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
                  requestMove(playerId, fromStage, stage);
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
                    {visibleCards(stage).length > 0 && (
                      <button
                        onClick={() => toggleSelectStage(stage)}
                        style={{ background: "none", border: "none", color: C.turf, fontSize: 10.5, fontWeight: 600, cursor: "pointer", padding: 0 }}
                      >
                        {visibleCards(stage).every((p) => selected.has(p.id)) ? "Zrušit" : "Vybrat vše"}
                      </button>
                    )}
                    <span style={{ fontFamily: fontMono, fontSize: 12, color: C.inkFaint }}>{visibleCards(stage).length}</span>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {visibleCards(stage).map((p) => (
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
                        {stage === "Uzavřeno" && (
                          <div style={{ marginTop: 6 }}>
                            {p.closedOutcome ? (
                              <>
                                <span
                                  style={{
                                    display: "inline-block",
                                    fontSize: 10.5,
                                    fontWeight: 700,
                                    padding: "2px 7px",
                                    borderRadius: 3,
                                    background: p.closedOutcome === "positive" ? C.turfSoft : C.redSoft,
                                    color: p.closedOutcome === "positive" ? C.turf : C.red,
                                  }}
                                >
                                  {p.closedOutcome === "positive" ? "Pozitivně" : "Negativně"}
                                </span>
                                {p.closedReason && (
                                  <div
                                    title={p.closedReason}
                                    style={{ fontSize: 11, color: C.inkSoft, marginTop: 4, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}
                                  >
                                    {p.closedReason}
                                  </div>
                                )}
                              </>
                            ) : (
                              <span style={{ fontSize: 11, color: C.inkFaint }}>Bez zadaného výsledku</span>
                            )}
                            <button
                              onClick={() => editClosing(p)}
                              style={{ display: "block", background: "none", border: "none", padding: 0, marginTop: 4, color: C.turf, fontSize: 11, fontWeight: 600, cursor: "pointer" }}
                            >
                              {p.closedOutcome ? "Upravit výsledek" : "Zadat výsledek"}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {visibleCards(stage).length === 0 && (
                    <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", padding: "16px 4px" }}>Přetáhni sem hráče</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {closing && (
          <div
            onClick={() => setClosing(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(20,32,26,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              style={{ background: "#fff", borderRadius: 8, padding: 22, width: "100%", maxWidth: 440, boxShadow: "0 10px 40px rgba(0,0,0,0.2)" }}
            >
              <div style={{ fontFamily: fontDisplay, fontSize: 17, fontWeight: 700, marginBottom: 4 }}>Uzavřít hráče</div>
              <div style={{ fontSize: 13, color: C.inkSoft, marginBottom: 14 }}>{closing.name}</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                {[
                  ["positive", "Uzavřeno pozitivně", C.turf, C.turfSoft],
                  ["negative", "Uzavřeno negativně", C.red, C.redSoft],
                ].map(([value, label, color, soft]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setClosing((c) => ({ ...c, outcome: value }))}
                    style={{
                      flex: 1,
                      padding: "10px 8px",
                      borderRadius: 5,
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      border: `1.5px solid ${closing.outcome === value ? color : C.line}`,
                      background: closing.outcome === value ? soft : "#fff",
                      color: closing.outcome === value ? color : C.inkSoft,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label style={{ display: "block", fontSize: 11, color: C.inkFaint, marginBottom: 5, fontWeight: 600 }}>Důvod *</label>
              <textarea
                value={closing.reason}
                onChange={(e) => setClosing((c) => ({ ...c, reason: e.target.value.slice(0, 500) }))}
                rows={4}
                maxLength={500}
                placeholder="Proč se hráč uzavírá? (např. podepsal u nás, nesplnil fyzické parametry, vybral jiný klub…)"
                style={{ width: "100%", boxSizing: "border-box", fontFamily: fontBody, fontSize: 13, color: C.ink, border: `1px solid ${C.line}`, borderRadius: 6, padding: "8px 10px", resize: "vertical" }}
              />
              <div style={{ fontSize: 10.5, color: C.inkFaint, margin: "3px 0 14px" }}>{closing.reason.length}/500</div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button
                  type="button"
                  onClick={() => setClosing(null)}
                  style={{ padding: "8px 14px", background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  Zrušit
                </button>
                <button
                  type="button"
                  onClick={confirmClosing}
                  disabled={!closing.outcome || !closing.reason.trim()}
                  style={{
                    padding: "8px 14px",
                    background: C.turf,
                    color: "#fff",
                    border: "none",
                    borderRadius: 4,
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: !closing.outcome || !closing.reason.trim() ? "default" : "pointer",
                    opacity: !closing.outcome || !closing.reason.trim() ? 0.5 : 1,
                  }}
                >
                  Uzavřít
                </button>
              </div>
            </div>
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
