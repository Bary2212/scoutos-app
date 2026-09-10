import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Send, Loader2, ShieldAlert, Pencil, Check, X, Trash2 } from "lucide-react";
import { apiFetch } from "../api.js";

const C = {
  bg: "#F5F6F1",
  panel: "#FFFFFF",
  ink: "#14201A",
  inkSoft: "#57614F",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  turfSoft: "#E4EEE7",
  amber: "#C98A2C",
  amberSoft: "#F4EBDB",
  red: "#B23A2E",
  redSoft: "#F5E5E2",
  line: "#DADDD3",
  lineSoft: "#EAEBE4",
};

const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";
const fontMono = "'IBM Plex Mono', monospace";


function recommendationStyle(recommendation) {
  if (recommendation === "Doporučit") return { color: C.turf, bg: C.turfSoft };
  if (recommendation === "Sledovat dál") return { color: C.amber, bg: C.amberSoft };
  if (recommendation === "Zamítnout") return { color: C.red, bg: C.redSoft };
  return { color: C.inkSoft, bg: C.lineSoft };
}

export default function PlayerProfileBasic() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [player, setPlayer] = useState(null);
  const [reports, setReports] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [editingReportId, setEditingReportId] = useState(null);
  const [reportEditForm, setReportEditForm] = useState(null);
  const [deletingPlayer, setDeletingPlayer] = useState(false);
  const [confirmDeletePlayer, setConfirmDeletePlayer] = useState(false);
  const [newReport, setNewReport] = useState({ author: "Petr Novák", match: "", recommendation: "Doporučit" });
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);

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
        setPlayer(updated);
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

  const startEditingReport = (report) => {
    setEditingReportId(report.id);
    setReportEditForm({ author: report.author, match: report.match || "", recommendation: report.recommendation });
  };

  const saveReportEdit = (reportId) => {
    apiFetch(`/api/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reportEditForm),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((updated) => {
        setReports((prev) => prev.map((r) => (r.id === reportId ? updated : r)));
        setEditingReportId(null);
      })
      .catch(() => {});
  };

  const deleteReport = (reportId) => {
    apiFetch(`/api/reports/${reportId}`, { method: "DELETE" })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(() => setReports((prev) => prev.filter((r) => r.id !== reportId)))
      .catch(() => {});
  };

  useEffect(() => {
    apiFetch(`/api/players/${id}`)
      .then((res) => {
        if (res.status === 404) {
          setNotFound(true);
          return null;
        }
        if (!res.ok) throw new Error();
        return res.json();
      })
      .then((data) => data && setPlayer(data))
      .catch(() => setNotFound(true));

    apiFetch(`/api/reports?playerId=${id}`)
      .then((res) => (res.ok ? res.json() : []))
      .then(setReports)
      .catch(() => setReports([]));
  }, [id]);

  const submitReport = (e) => {
    e.preventDefault();
    setSubmitting(true);
    apiFetch(`/api/reports`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerId: Number(id), ...newReport }),
    })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((created) => {
        setReports((prev) => [created, ...prev]);
        setNewReport({ author: "Petr Novák", match: "", recommendation: "Doporučit" });
      })
      .catch(() => {})
      .finally(() => setSubmitting(false));
  };

  if (notFound) {
    return (
      <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fontBody }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ color: C.inkSoft, marginBottom: 12 }}>Hráč nenalezen.</p>
          <Link to="/hledani" style={{ color: C.turf, fontWeight: 600, textDecoration: "none" }}>← Zpět na vyhledávání</Link>
        </div>
      </div>
    );
  }

  if (!player) {
    return <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)" }} />;
  }

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "28px 20px 60px" }}>
        <Link to="/hledani" style={{ display: "flex", alignItems: "center", gap: 6, color: C.inkFaint, fontSize: 13, textDecoration: "none", marginBottom: 16, width: "fit-content" }}>
          <ArrowLeft size={14} /> Zpět na vyhledávání
        </Link>

        {/* ---------- Header ---------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: "22px 24px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div>
              <h1 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, margin: 0 }}>{player.name}</h1>
              <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 6 }}>
                {player.position} {player.club && `— ${player.club}`} {player.age && `— ${player.age} let`}
              </div>
            </div>
            {!confirmDeletePlayer ? (
              <button
                onClick={() => setConfirmDeletePlayer(true)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", background: "#fff", color: C.red, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}
              >
                <Trash2 size={13} /> Smazat hráče
              </button>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end", flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: C.red, fontWeight: 600 }}>Opravdu smazat? Nevratné.</span>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    onClick={deletePlayer}
                    disabled={deletingPlayer}
                    style={{ padding: "6px 12px", background: C.red, color: "#fff", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    {deletingPlayer ? "Mažu…" : "Ano, smazat"}
                  </button>
                  <button
                    onClick={() => setConfirmDeletePlayer(false)}
                    style={{ padding: "6px 12px", background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 14, background: C.lineSoft, borderRadius: 6, padding: "10px 14px" }}>
            <ShieldAlert size={14} color={C.inkFaint} />
            <span style={{ fontSize: 12, color: C.inkSoft }}>
              Tohle je jednoduchý profil bez AI analytiky (skóre, video, riziko zranění) — ta je zatím jen u ukázkového hráče. Sem se ukládají skautské reporty a základní údaje.
            </span>
          </div>
        </div>

        {/* ---------- Quick info ---------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700 }}>Základní údaje</div>
            {!editing && (
              <button
                onClick={startEditing}
                style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, fontWeight: 600, color: C.turf, background: "none", border: "none", cursor: "pointer", padding: 0 }}
              >
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
                <button
                  type="submit"
                  disabled={savingEdit}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: C.turf, color: "#fff", border: "none", borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  <Check size={13} /> {savingEdit ? "Ukládám…" : "Uložit"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                >
                  <X size={13} /> Zrušit
                </button>
              </div>
            </form>
          ) : (
            [
              ["Pozice", player.position || "—"],
              ["Klub", player.club || "—"],
              ["Věk", player.age || "—"],
              ["Tržní hodnota", player.marketValue ? `${player.marketValue}M €` : "—"],
              ["Kontrakt do", player.contractUntil || "—"],
              ["Agent", player.agent || "—"],
              ["Preferovaná noha", player.foot || "—"],
              ["Výška", player.height || "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
                <span style={{ color: C.inkFaint }}>{label}</span>
                <span style={{ color: C.ink, fontWeight: 500 }}>{value}</span>
              </div>
            ))
          )}
        </div>

        {/* ---------- Reports ---------- */}
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 24 }}>
          <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, marginBottom: 14 }}>Reporty ({reports.length})</div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
            {reports.map((r) => {
              const rs = recommendationStyle(r.recommendation);
              const isEditing = editingReportId === r.id;
              return (
                <div key={r.id} style={{ border: `1px solid ${C.line}`, borderRadius: 6, padding: "14px 16px" }}>
                  {isEditing ? (
                    <div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                        <select
                          value={reportEditForm.author}
                          onChange={(e) => setReportEditForm((f) => ({ ...f, author: e.target.value }))}
                          style={{ padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
                        >
                          <option>Petr Novák</option>
                          <option>Jana Bartošová</option>
                          <option>Karel Ryba</option>
                        </select>
                        <input
                          value={reportEditForm.match}
                          onChange={(e) => setReportEditForm((f) => ({ ...f, match: e.target.value }))}
                          placeholder="Zápas"
                          style={{ flex: 1, minWidth: 140, padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
                        />
                        <select
                          value={reportEditForm.recommendation}
                          onChange={(e) => setReportEditForm((f) => ({ ...f, recommendation: e.target.value }))}
                          style={{ padding: "7px 9px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody }}
                        >
                          <option>Doporučit</option>
                          <option>Sledovat dál</option>
                          <option>Zamítnout</option>
                        </select>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button
                          onClick={() => saveReportEdit(r.id)}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: C.turf, color: "#fff", border: "none", borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          <Check size={12} /> Uložit
                        </button>
                        <button
                          onClick={() => setEditingReportId(null)}
                          style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", background: "#fff", color: C.inkSoft, border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer" }}
                        >
                          <X size={12} /> Zrušit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>
                          {r.author} {r.edited && <span style={{ fontSize: 11, color: C.inkFaint, fontWeight: 400 }}>(upraveno)</span>}
                        </div>
                        <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 2 }}>{r.match || "bez zápasu"} — {r.date}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, padding: "4px 10px", borderRadius: 4, color: rs.color, background: rs.bg }}>{r.recommendation}</span>
                        <button onClick={() => startEditingReport(r)} title="Upravit" style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", padding: 2 }}>
                          <Pencil size={14} />
                        </button>
                        <button onClick={() => deleteReport(r.id)} title="Smazat" style={{ background: "none", border: "none", color: C.inkFaint, cursor: "pointer", padding: 2 }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {reports.length === 0 && <div style={{ fontSize: 13, color: C.inkFaint }}>Zatím žádné reporty.</div>}
          </div>

          <form onSubmit={submitReport} style={{ borderTop: `1px solid ${C.lineSoft}`, paddingTop: 18 }}>
            <div style={{ fontFamily: fontDisplay, fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Přidat nový report</div>
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
              {submitting ? <Loader2 size={14} /> : <Send size={14} />}
              {submitting ? "Ukládám…" : "Uložit report na server"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
