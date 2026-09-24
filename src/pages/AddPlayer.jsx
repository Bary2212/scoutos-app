import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus, ArrowLeft } from "lucide-react";
import { apiFetch } from "../api.js";

const C = {
  bg: "#F5F6F1",
  panel: "#FFFFFF",
  ink: "#14201A",
  inkSoft: "#57614F",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  line: "#DADDD3",
  redSoft: "#F5E5E2",
  red: "#B23A2E",
};

const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";


const POSITIONS = [
  "Brankář",
  "Pravý obránce",
  "Levý obránce",
  "Stoper",
  "Defenzivní záložník",
  "Ofenzivní záložník",
  "Křídlo",
  "Útočník",
];

const inputStyle = { width: "100%", padding: "9px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 14, fontFamily: fontBody, color: C.ink };
const labelStyle = { display: "block", fontSize: 12, color: C.inkFaint, marginBottom: 5, fontWeight: 600 };

export default function AddPlayer() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: "",
    position: POSITIONS[1],
    age: "",
    club: "",
    marketValue: "",
    contractUntil: "",
    agent: "",
    foot: "Pravá",
    height: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Jméno hráče je povinné.");
      return;
    }
    setSubmitting(true);
    setError(null);
    apiFetch(`/api/players`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    })
      .then((res) => {
        if (!res.ok) throw new Error("Server odpověděl chybou.");
        return res.json();
      })
      .then((created) => {
        navigate(`/hrac/${created.id}`);
      })
      .catch(() => {
        setError("Nepodařilo se uložit hráče. Běží backend na localhost:4000?");
        setSubmitting(false);
      });
  };

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "28px 20px 60px" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.inkFaint, fontSize: 13, cursor: "pointer", marginBottom: 16, padding: 0 }}
        >
          <ArrowLeft size={14} /> Zpět
        </button>

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <UserPlus size={20} color={C.turf} />
          <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>Přidat hráče</h1>
        </div>

        <form onSubmit={handleSubmit} style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Jméno a příjmení *</label>
            <input style={inputStyle} value={form.name} onChange={update("name")} placeholder="např. Jan Novák" required />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Pozice *</label>
              <select style={inputStyle} value={form.position} onChange={update("position")}>
                {POSITIONS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={labelStyle}>Věk</label>
              <input type="number" style={inputStyle} value={form.age} onChange={update("age")} placeholder="21" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Klub</label>
              <input style={inputStyle} value={form.club} onChange={update("club")} placeholder="název klubu" />
            </div>
            <div>
              <label style={labelStyle}>Tržní hodnota (M €)</label>
              <input type="number" step="0.1" style={inputStyle} value={form.marketValue} onChange={update("marketValue")} placeholder="1.2" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Kontrakt do</label>
              <input style={inputStyle} value={form.contractUntil} onChange={update("contractUntil")} placeholder="Červen 2027" />
            </div>
            <div>
              <label style={labelStyle}>Agent</label>
              <input style={inputStyle} value={form.agent} onChange={update("agent")} placeholder="jméno agentury" />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
            <div>
              <label style={labelStyle}>Preferovaná noha</label>
              <select style={inputStyle} value={form.foot} onChange={update("foot")}>
                <option>Pravá</option>
                <option>Levá</option>
                <option>Obě</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Výška</label>
              <input style={inputStyle} value={form.height} onChange={update("height")} placeholder="181 cm" />
            </div>
          </div>

          {error && (
            <div style={{ background: C.redSoft, color: C.red, padding: "10px 14px", borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{error}</div>
          )}

          <button
            type="submit"
            disabled={submitting}
            style={{ width: "100%", padding: "11px", background: C.turf, color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: submitting ? "default" : "pointer", opacity: submitting ? 0.7 : 1 }}
          >
            {submitting ? "Ukládám…" : "Uložit hráče"}
          </button>
        </form>
      </div>
    </div>
  );
}
