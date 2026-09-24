import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Loader2, Plus, X } from "lucide-react";
import { apiFetch } from "../api.js";
import { groupsForPosition, TECHNICAL_FIELDS, PHYSICAL_FIELDS, MENTAL_FIELDS } from "../data/scoutMetrics.js";

const C = {
  bg: "#F5F6F1",
  panel: "#FFFFFF",
  ink: "#14201A",
  inkSoft: "#57614F",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  turfSoft: "#E4EEE7",
  line: "#DADDD3",
  lineSoft: "#EAEBE4",
  red: "#B23A2E",
  redSoft: "#F5E5E2",
};

const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";
const fontMono = "'IBM Plex Mono', monospace";

const sectionStyle = { background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 22, marginBottom: 18 };
const sectionTitleStyle = { fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, margin: "0 0 4px 0" };
const sectionHintStyle = { fontSize: 12, color: C.inkFaint, margin: "0 0 16px 0", lineHeight: 1.5 };
const numberInputStyle = { width: 84, padding: "6px 8px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontMono, color: C.ink, textAlign: "right" };

// Sestaví počáteční stav ratingů z existujícího pole `breakdown` (pokud hráč
// už nějaké ruční nebo demo hodnocení má) tak, aby se dalo v zadávání pokračovat.
function initialRatings(breakdown, groups) {
  const known = new Set(groups.flatMap((g) => g.metrics.map((m) => m.id)));
  const ratings = {};
  for (const stat of breakdown || []) {
    if (known.has(stat.id)) {
      ratings[stat.id] = { checked: true, value: stat.percentile };
    }
  }
  return ratings;
}

function initialCustom(breakdown, groups) {
  const known = new Set(groups.flatMap((g) => g.metrics.map((m) => m.id)));
  return (breakdown || [])
    .filter((stat) => !known.has(stat.id) && stat.id?.startsWith("custom-"))
    .map((stat) => ({ id: stat.id, label: stat.label, value: stat.percentile }));
}

export default function PlayerStatsForm() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [player, setPlayer] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [ratings, setRatings] = useState({});
  const [customMetrics, setCustomMetrics] = useState([]);
  const [newCustomLabel, setNewCustomLabel] = useState("");

  const [technical, setTechnical] = useState({});
  const [physical, setPhysical] = useState({});
  const [mental, setMental] = useState({ note: "" });
  const [strengths, setStrengths] = useState([]);
  const [weaknesses, setWeaknesses] = useState([]);
  const [newStrength, setNewStrength] = useState("");
  const [newWeakness, setNewWeakness] = useState("");

  useEffect(() => {
    setLoading(true);
    setError(null);
    apiFetch(`/api/players/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("Hráč nenalezen.");
        return res.json();
      })
      .then((data) => {
        setPlayer(data);
        const groups = groupsForPosition(data.position);
        setRatings(initialRatings(data.breakdown, groups));
        setCustomMetrics(initialCustom(data.breakdown, groups));
        setTechnical(data.technicalMetrics || {});
        setPhysical(data.physicalData || {});
        setMental(data.mentalProfile || { note: "" });
        setStrengths(data.strengths || []);
        setWeaknesses(data.weaknesses || []);
      })
      .catch(() => setError("Nepodařilo se načíst hráče."))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <Loader2 size={22} className="animate-spin" color={C.inkFaint} />
      </div>
    );
  }

  if (error || !player) {
    return (
      <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, padding: 28 }}>
        <p style={{ color: C.red }}>{error || "Hráč nenalezen."}</p>
        <Link to="/vyhledavani" style={{ color: C.turf }}>Zpět na vyhledávání</Link>
      </div>
    );
  }

  const groups = groupsForPosition(player.position);

  const toggleMetric = (metricId) => {
    setRatings((r) => {
      const current = r[metricId];
      if (current?.checked) {
        return { ...r, [metricId]: { ...current, checked: false } };
      }
      return { ...r, [metricId]: { checked: true, value: current?.value ?? 50 } };
    });
  };

  const setMetricValue = (metricId, value) => {
    setRatings((r) => ({ ...r, [metricId]: { checked: true, value: Number(value) } }));
  };

  const addCustomMetric = () => {
    const label = newCustomLabel.trim();
    if (!label) return;
    const slug = label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");
    setCustomMetrics((list) => [...list, { id: `custom-${slug}-${Date.now()}`, label, value: 50 }]);
    setNewCustomLabel("");
  };

  const removeCustomMetric = (metricId) => {
    setCustomMetrics((list) => list.filter((m) => m.id !== metricId));
  };

  const updateCustomValue = (metricId, value) => {
    setCustomMetrics((list) => list.map((m) => (m.id === metricId ? { ...m, value: Number(value) } : m)));
  };

  const addTag = (list, setList, value, setValue) => {
    const v = value.trim();
    if (!v) return;
    setList([...list, v]);
    setValue("");
  };
  const removeTag = (list, setList, index) => setList(list.filter((_, i) => i !== index));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const breakdown = [
      ...groups.flatMap((g) =>
        g.metrics
          .filter((m) => ratings[m.id]?.checked)
          .map((m) => ({
            id: m.id,
            label: m.label,
            percentile: ratings[m.id].value,
            tag: g.id,
            detail: `Ruční hodnocení skauta (kategorie: ${g.label}).`,
          }))
      ),
      ...customMetrics.map((m) => ({
        id: m.id,
        label: m.label,
        percentile: m.value,
        tag: "custom",
        detail: "Vlastní metrika zadaná skautem.",
      })),
    ];

    const cleanNumeric = (obj) =>
      Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v !== undefined && v !== null).map(([k, v]) => [k, Number(v)]));

    const payload = {
      breakdown,
      technicalMetrics: Object.keys(technical).length > 0 ? cleanNumeric(technical) : undefined,
      physicalData: Object.keys(physical).length > 0 ? cleanNumeric(physical) : undefined,
      mentalProfile:
        Object.keys(mental).some((k) => k !== "note" && mental[k] !== "" && mental[k] !== undefined) || mental.note
          ? { ...cleanNumeric(Object.fromEntries(Object.entries(mental).filter(([k]) => k !== "note"))), note: mental.note || "" }
          : undefined,
      strengths,
      weaknesses,
    };
    // Odešleme jen klíče, které mají smysl (aby se needit. sekce nepřepsaly prázdnem).
    Object.keys(payload).forEach((k) => payload[k] === undefined && delete payload[k]);
    if (payload.technicalMetrics === undefined) delete payload.technicalMetrics;

    try {
      const res = await apiFetch(`/api/players/${id}/analytics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Server odpověděl chybou.");
      navigate(`/hrac/${id}`);
    } catch {
      setError("Nepodařilo se uložit statistiky. Zkus to prosím znovu.");
      setSaving(false);
    }
  };

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 60px" }}>
        <button
          onClick={() => navigate(`/hrac/${id}`)}
          style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", color: C.inkFaint, fontSize: 13, cursor: "pointer", marginBottom: 16, padding: 0 }}
        >
          <ArrowLeft size={14} /> Zpět na profil hráče
        </button>

        <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: "0 0 4px 0" }}>
          Zadat statistiky — {player.name}
        </h1>
        <p style={{ fontSize: 13, color: C.inkFaint, margin: "0 0 24px 0" }}>
          Vyplň jen to, co jsi u hráče při zápase reálně stihl posoudit. Neoznačené metriky se do profilu neuloží.
        </p>

        <form onSubmit={handleSubmit}>
          {groups.map((group) => (
            <section key={group.id} style={sectionStyle}>
              <h2 style={sectionTitleStyle}>{group.label}</h2>
              <p style={sectionHintStyle}>Zaškrtni metriky, které jsi u hráče stihl posoudit, a nastav odhadovaný percentil (0–100) v porovnání s hráči na stejné pozici.</p>
              {group.metrics.map((metric) => {
                const state = ratings[metric.id];
                const checked = !!state?.checked;
                const value = state?.value ?? 50;
                return (
                  <div key={metric.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer", fontSize: 13.5 }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleMetric(metric.id)} />
                      {metric.label}
                    </label>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={value}
                      disabled={!checked}
                      onChange={(e) => setMetricValue(metric.id, e.target.value)}
                      style={{ width: 140, opacity: checked ? 1 : 0.35 }}
                    />
                    <span style={{ width: 34, textAlign: "right", fontFamily: fontMono, fontSize: 13, color: checked ? C.ink : C.inkFaint, fontWeight: 600 }}>
                      {checked ? value : "—"}
                    </span>
                  </div>
                );
              })}
            </section>
          ))}

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Vlastní metriky</h2>
            <p style={sectionHintStyle}>Chybí ti kategorie výše? Přidej si vlastní.</p>
            {customMetrics.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 0", borderBottom: `1px solid ${C.lineSoft}` }}>
                <span style={{ flex: 1, fontSize: 13.5 }}>{m.label}</span>
                <input type="range" min={0} max={100} value={m.value} onChange={(e) => updateCustomValue(m.id, e.target.value)} style={{ width: 140 }} />
                <span style={{ width: 34, textAlign: "right", fontFamily: fontMono, fontSize: 13, fontWeight: 600 }}>{m.value}</span>
                <button type="button" onClick={() => removeCustomMetric(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint, padding: 4 }}>
                  <X size={14} />
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <input
                style={{ flex: 1, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13 }}
                placeholder="např. Hra v úzkém prostoru"
                value={newCustomLabel}
                onChange={(e) => setNewCustomLabel(e.target.value)}
              />
              <button type="button" onClick={addCustomMetric} style={{ display: "flex", alignItems: "center", gap: 4, background: C.turfSoft, color: C.turf, border: "none", borderRadius: 4, padding: "8px 12px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                <Plus size={14} /> Přidat
              </button>
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Technické metriky</h2>
            <p style={sectionHintStyle}>Volitelné — vyplň, jen pokud máš rozumný odhad z pozorování zápasu.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {TECHNICAL_FIELDS.map((f) => (
                <div key={f.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.inkSoft }}>{f.label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min={0}
                      max={f.max}
                      step={f.step || 1}
                      style={numberInputStyle}
                      value={technical[f.key] ?? ""}
                      onChange={(e) => setTechnical((t) => ({ ...t, [f.key]: e.target.value }))}
                    />
                    <span style={{ fontSize: 12, color: C.inkFaint, width: 46 }}>{f.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Fyzická data</h2>
            <p style={sectionHintStyle}>Orientační odhad okem, pokud klub nemá GPS/trackovací data.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              {PHYSICAL_FIELDS.map((f) => (
                <div key={f.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.inkSoft }}>{f.label}</span>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                      type="number"
                      min={0}
                      max={f.max}
                      step={f.step || 1}
                      style={numberInputStyle}
                      value={physical[f.key] ?? ""}
                      onChange={(e) => setPhysical((p) => ({ ...p, [f.key]: e.target.value }))}
                    />
                    <span style={{ fontSize: 12, color: C.inkFaint, width: 60 }}>{f.unit}</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section style={sectionStyle}>
            <h2 style={sectionTitleStyle}>Mentální profil</h2>
            <p style={sectionHintStyle}>Hodnocení 1–10.</p>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
              {MENTAL_FIELDS.map((f) => (
                <div key={f.key} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13, color: C.inkSoft }}>{f.label}</span>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    style={numberInputStyle}
                    value={mental[f.key] ?? ""}
                    onChange={(e) => setMental((m) => ({ ...m, [f.key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <label style={{ display: "block", fontSize: 12, color: C.inkFaint, marginBottom: 6, fontWeight: 600 }}>Poznámka</label>
            <textarea
              style={{ width: "100%", minHeight: 64, padding: "8px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13, fontFamily: fontBody, resize: "vertical" }}
              value={mental.note || ""}
              onChange={(e) => setMental((m) => ({ ...m, note: e.target.value }))}
              placeholder="Volný komentář ke stylu, charakteru hráče apod."
            />
          </section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Silné stránky</h2>
              <TagList items={strengths} onRemove={(i) => removeTag(strengths, setStrengths, i)} />
              <TagInput value={newStrength} onChange={setNewStrength} onAdd={() => addTag(strengths, setStrengths, newStrength, setNewStrength)} placeholder="např. Rychlost v přechodu" />
            </section>
            <section style={sectionStyle}>
              <h2 style={sectionTitleStyle}>Slabé stránky</h2>
              <TagList items={weaknesses} onRemove={(i) => removeTag(weaknesses, setWeaknesses, i)} />
              <TagInput value={newWeakness} onChange={setNewWeakness} onAdd={() => addTag(weaknesses, setWeaknesses, newWeakness, setNewWeakness)} placeholder="např. Slabší levá noha" />
            </section>
          </div>

          {error && <div style={{ background: C.redSoft, color: C.red, padding: "10px 14px", borderRadius: 4, fontSize: 13, marginBottom: 16 }}>{error}</div>}

          <button
            type="submit"
            disabled={saving}
            style={{ width: "100%", padding: "12px", background: C.turf, color: "#fff", border: "none", borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}
          >
            {saving ? "Ukládám…" : "Uložit statistiky"}
          </button>
        </form>
      </div>
    </div>
  );
}

function TagList({ items, onRemove }) {
  if (items.length === 0) return <p style={{ fontSize: 12, color: C.inkFaint, margin: "0 0 10px 0" }}>Zatím žádné položky.</p>;
  return (
    <ul style={{ listStyle: "none", padding: 0, margin: "0 0 12px 0" }}>
      {items.map((item, i) => (
        <li key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${C.lineSoft}`, fontSize: 13 }}>
          <span>{item}</span>
          <button type="button" onClick={() => onRemove(i)} style={{ background: "none", border: "none", cursor: "pointer", color: C.inkFaint, padding: 4 }}>
            <X size={13} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function TagInput({ value, onChange, onAdd, placeholder }) {
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <input
        style={{ flex: 1, padding: "7px 10px", border: `1px solid ${C.line}`, borderRadius: 4, fontSize: 13 }}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onAdd();
          }
        }}
      />
      <button type="button" onClick={onAdd} style={{ display: "flex", alignItems: "center", gap: 4, background: C.turfSoft, color: C.turf, border: "none", borderRadius: 4, padding: "7px 10px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
        <Plus size={13} />
      </button>
    </div>
  );
}
