import React, { useState, useEffect } from "react";
import { WifiOff, Wifi, Undo2, Minus, Plus, Check } from "lucide-react";
import { apiFetch } from "../api.js";

const MATCH_ID = 1; // Slavoj Karviná – FK Ostrov Bytom, viz server/data/db.json

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

// Zjednodušená sestava 4-3-3 — pozice v % šířky/výšky hřiště
const players = [
  { number: 1, pos: { x: 50, y: 92 } },
  { number: 2, pos: { x: 85, y: 72 } },
  { number: 3, pos: { x: 63, y: 80 } },
  { number: 4, pos: { x: 37, y: 80 } },
  { number: 5, pos: { x: 15, y: 72 } },
  { number: 6, pos: { x: 50, y: 60 } },
  { number: 7, pos: { x: 78, y: 42 } },
  { number: 8, pos: { x: 32, y: 47 } },
  { number: 10, pos: { x: 68, y: 47 } },
  { number: 9, pos: { x: 50, y: 24 } },
  { number: 11, pos: { x: 22, y: 42 } },
];

// Rychlé akce pro live tagging — podmnožina plného katalogu (Modul A2 v PRD),
// vybraná pro rychlost jedním tapem, ne úplnost.
const quickActions = [
  { id: "pass_ok", label: "Přihrávka ✓", color: C.turf },
  { id: "pass_fail", label: "Přihrávka ✗", color: C.red },
  { id: "duel_win", label: "Souboj ✓", color: C.turf },
  { id: "duel_loss", label: "Souboj ✗", color: C.red },
  { id: "loss", label: "Ztráta míče", color: C.amber },
  { id: "shot", label: "Střela", color: C.turfDark },
  { id: "tackle", label: "Zákrok", color: C.turf },
  { id: "setpiece", label: "Standardka", color: C.inkSoft },
];

let idCounter = 1;

export default function LiveTagging() {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [minute, setMinute] = useState(34);
  const [events, setEvents] = useState([]);
  const [isOffline, setIsOffline] = useState(true);
  const [queuedCount, setQueuedCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [flashId, setFlashId] = useState(null);

  const vibrate = () => {
    if (navigator.vibrate) navigator.vibrate(15);
  };

  useEffect(() => {
    apiFetch(`/api/events?matchId=${MATCH_ID}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data) => {
        if (data.length === 0) return;
        const loaded = data
          .map((e) => ({
            id: idCounter++,
            minute: e.minute,
            player: e.player,
            actionId: e.actionId,
            actionLabel: e.actionLabel,
            synced: true,
            backendId: e.id,
          }))
          .reverse(); // nejnovější nahoru, stejně jako lokálně přidávané
        setEvents(loaded);
      })
      .catch(() => {
        // Backend neběží při otevření — appka prostě začne s prázdným logem, žádná chyba na obrazovce.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logAction = (actionId, actionLabel) => {
    if (!selectedPlayer) return;
    vibrate();
    const entry = {
      id: idCounter++,
      minute,
      player: selectedPlayer,
      actionId,
      actionLabel,
      synced: false,
      backendId: null,
    };
    setEvents((prev) => [entry, ...prev]);
    setFlashId(actionId);
    setTimeout(() => setFlashId(null), 200);

    if (isOffline) {
      // Offline — akce zůstává jen lokálně, přidá se do fronty k synchronizaci.
      setQueuedCount((c) => c + 1);
      return;
    }

    // Online — odešli rovnou na backend.
    apiFetch(`/api/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ matchId: MATCH_ID, minute, player: selectedPlayer, actionId, actionLabel }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((created) => {
        setEvents((prev) => prev.map((e) => (e.id === entry.id ? { ...e, synced: true, backendId: created.id } : e)));
      })
      .catch(() => {
        // Backend neběží — akce zůstává lokálně nesynchronizovaná, appka to dá najevo přes queuedCount.
        setQueuedCount((c) => c + 1);
      });
  };

  const undoLast = () => {
    const last = events[0];
    if (!last) return;
    setEvents((prev) => prev.slice(1));
    if (!last.synced) {
      setQueuedCount((c) => Math.max(0, c - 1));
      return;
    }
    // Akce už byla na serveru — smaž ji i tam, ne jen lokálně.
    apiFetch(`/api/events/${last.backendId}`, { method: "DELETE" }).catch(() => {});
  };

  const toggleOffline = () => {
    if (isOffline) {
      // Přechod zpět online → skutečná dávková synchronizace nesynchronizovaných akcí.
      setSyncing(true);
      const unsynced = events.filter((e) => !e.synced);
      Promise.all(
        unsynced.map((e) =>
          apiFetch(`/api/events`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ matchId: MATCH_ID, minute: e.minute, player: e.player, actionId: e.actionId, actionLabel: e.actionLabel }),
          })
            .then((res) => (res.ok ? res.json() : Promise.reject()))
            .then((created) => ({ localId: e.id, backendId: created.id }))
            .catch(() => ({ localId: e.id, backendId: null }))
        )
      ).then((results) => {
        setEvents((prev) =>
          prev.map((e) => {
            const match = results.find((r) => r.localId === e.id);
            return match && match.backendId ? { ...e, synced: true, backendId: match.backendId } : e;
          })
        );
        const stillQueued = results.filter((r) => !r.backendId).length;
        setQueuedCount(stillQueued);
        setSyncing(false);
        setIsOffline(false);
      });
    } else {
      setIsOffline(true);
    }
  };

  const undoableCount = Math.min(events.length, 5);

  return (
    <div style={{ background: "#0D1712", minHeight: "calc(100vh - 56px)", display: "flex", justifyContent: "center", fontFamily: fontBody }}>
      <div style={{ width: "100%", maxWidth: 420, background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", flexDirection: "column" }}>
        {/* ---------- Top status bar ---------- */}
        <div style={{ background: C.panel, borderBottom: `1px solid ${C.line}`, padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.ink }}>FK Ostrov Bytom – Slavoj Karviná</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 2 }}>
              <button onClick={() => setMinute((m) => Math.max(0, m - 1))} style={iconBtnStyle}>
                <Minus size={12} />
              </button>
              <span style={{ fontFamily: fontMono, fontSize: 13, color: C.inkSoft, minWidth: 34, textAlign: "center" }}>{minute}.</span>
              <button onClick={() => setMinute((m) => m + 1)} style={iconBtnStyle}>
                <Plus size={12} />
              </button>
            </div>
          </div>
          <button
            onClick={toggleOffline}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 10px",
              borderRadius: 5,
              border: "none",
              cursor: "pointer",
              background: syncing ? C.amberSoft : isOffline ? C.redSoft : C.turfSoft,
              color: syncing ? C.amber : isOffline ? C.red : C.turf,
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            {syncing ? (
              "Synchronizace…"
            ) : isOffline ? (
              <>
                <WifiOff size={13} /> Offline{queuedCount > 0 ? ` (${queuedCount})` : ""}
              </>
            ) : (
              <>
                <Wifi size={13} /> Online
              </>
            )}
          </button>
        </div>

        {/* ---------- Pitch ---------- */}
        <div style={{ position: "relative", width: "100%", aspectRatio: "0.72", background: "linear-gradient(180deg, #2F6B4F 0%, #285D44 100%)", flexShrink: 0 }}>
          {/* pitch markings */}
          <div style={{ position: "absolute", inset: 12, border: "2px solid rgba(255,255,255,0.35)", borderRadius: 4 }} />
          <div style={{ position: "absolute", left: 12, right: 12, top: "50%", height: 2, background: "rgba(255,255,255,0.35)" }} />
          <div style={{ position: "absolute", left: "50%", top: "50%", width: 70, height: 70, marginLeft: -35, marginTop: -35, border: "2px solid rgba(255,255,255,0.35)", borderRadius: "50%" }} />

          {players.map((p) => {
            const active = selectedPlayer === p.number;
            return (
              <button
                key={p.number}
                onClick={() => setSelectedPlayer(p.number)}
                style={{
                  position: "absolute",
                  left: `${p.pos.x}%`,
                  top: `${p.pos.y}%`,
                  transform: "translate(-50%, -50%)",
                  width: active ? 44 : 38,
                  height: active ? 44 : 38,
                  borderRadius: "50%",
                  border: active ? `3px solid ${C.amber}` : "2px solid rgba(255,255,255,0.7)",
                  background: active ? "#fff" : "rgba(20,32,26,0.55)",
                  color: active ? C.turfDark : "#fff",
                  fontFamily: fontMono,
                  fontWeight: 700,
                  fontSize: 14,
                  cursor: "pointer",
                  transition: "all 120ms",
                }}
              >
                {p.number}
              </button>
            );
          })}
        </div>

        {/* ---------- Quick action panel ---------- */}
        <div style={{ background: C.panel, padding: 14, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 8, textAlign: "center" }}>
            {selectedPlayer ? (
              <span>
                Hráč <strong style={{ color: C.ink, fontFamily: fontMono }}>#{selectedPlayer}</strong> — vyber akci
              </span>
            ) : (
              "Klepni na hráče na hřišti"
            )}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {quickActions.map((a) => (
              <button
                key={a.id}
                disabled={!selectedPlayer}
                onClick={() => logAction(a.id, a.label)}
                style={{
                  minHeight: 56,
                  borderRadius: 6,
                  border: "none",
                  background: !selectedPlayer ? C.lineSoft : flashId === a.id ? a.color : C.turfSoft,
                  color: !selectedPlayer ? C.inkFaint : flashId === a.id ? "#fff" : C.turfDark,
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: selectedPlayer ? "pointer" : "default",
                  transition: "background 150ms, color 150ms",
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* ---------- Recent events log ---------- */}
        <div style={{ flex: 1, padding: 14, overflowY: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, color: C.ink }}>
              Zaznamenané akce ({events.length})
            </span>
            <button
              onClick={undoLast}
              disabled={events.length === 0}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                fontSize: 12,
                fontWeight: 600,
                color: events.length === 0 ? C.inkFaint : C.red,
                background: "none",
                border: "none",
                cursor: events.length === 0 ? "default" : "pointer",
              }}
            >
              <Undo2 size={13} /> Zpět
            </button>
          </div>
          {events.length === 0 && (
            <div style={{ fontSize: 13, color: C.inkFaint, textAlign: "center", padding: "20px 0" }}>
              Zatím žádné akce. Klepni na hráče a vyber akci výše.
            </div>
          )}
          {events.slice(0, 30).map((e, i) => (
            <div
              key={e.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 10px",
                background: C.panel,
                border: `1px solid ${C.lineSoft}`,
                borderRadius: 5,
                marginBottom: 6,
                opacity: i < undoableCount ? 1 : 0.6,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontFamily: fontMono, fontSize: 11, color: C.inkFaint }}>{e.minute}.</span>
                <span style={{ fontFamily: fontMono, fontSize: 12, fontWeight: 700, color: C.ink }}>#{e.player}</span>
                <span style={{ fontSize: 12, color: C.inkSoft }}>{e.actionLabel}</span>
              </div>
              {e.synced ? (
                <span title="Uloženo na serveru" style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <Check size={13} color={C.turf} />
                </span>
              ) : (
                <span title="Čeká na synchronizaci" style={{ fontSize: 9, fontWeight: 700, color: C.amber, background: C.amberSoft, padding: "2px 6px", borderRadius: 3 }}>
                  ČEKÁ
                </span>
              )}
            </div>
          ))}
          <div style={{ fontSize: 10, color: C.inkFaint, textAlign: "center", marginTop: 10 }}>
            Tlačítko Zpět umožňuje vrátit posledních 5 akcí.
          </div>
        </div>
      </div>
    </div>
  );
}

const iconBtnStyle = {
  width: 20,
  height: 20,
  borderRadius: 4,
  border: `1px solid ${C.line}`,
  background: "#fff",
  color: C.inkSoft,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  padding: 0,
};
