import React, { useState, useEffect } from "react";
import { Users, Copy, RefreshCw, UserMinus, Check } from "lucide-react";
import { apiFetch } from "../api.js";

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

export default function Club() {
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [removingId, setRemovingId] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    return apiFetch("/api/club")
      .then((res) => {
        if (!res.ok) throw new Error("Nepodařilo se načíst klub.");
        return res.json();
      })
      .then(setClub)
      .catch(() => setError("Nepodařilo se připojit k serveru."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const copyInvite = () => {
    if (!club?.inviteCode) return;
    navigator.clipboard?.writeText(club.inviteCode).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const regenerate = () => {
    setRegenerating(true);
    apiFetch("/api/club/regenerate-invite", { method: "POST" })
      .then((res) => {
        if (!res.ok) throw new Error("fail");
        return res.json();
      })
      .then(({ inviteCode }) => setClub((c) => ({ ...c, inviteCode })))
      .catch(() => setError("Nepodařilo se obnovit kód."))
      .finally(() => setRegenerating(false));
  };

  const removeScout = (scoutId, name) => {
    if (!window.confirm(`Odebrat ${name} z klubu? Dostane vlastní nový klub a svoje hodnocení si zachová.`)) return;
    setRemovingId(scoutId);
    apiFetch(`/api/club/scouts/${scoutId}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) throw new Error("fail");
        return load();
      })
      .catch(() => setError("Nepodařilo se odebrat skauta."))
      .finally(() => setRemovingId(null));
  };

  const isHead = club?.myRole === "hlavni_skaut";

  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, color: C.ink }}>
      <div style={{ maxWidth: 760, margin: "0 auto", padding: "28px 20px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          <Users size={18} color={C.turf} />
          <h1 style={{ fontFamily: fontDisplay, fontSize: 22, fontWeight: 700, margin: 0 }}>Klub</h1>
        </div>

        {loading && <div style={{ fontSize: 13, color: C.inkFaint }}>Načítám…</div>}
        {error && (
          <div style={{ background: C.redSoft, color: C.red, padding: "10px 14px", borderRadius: 6, fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        {club && (
          <>
            <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 4 }}>Název klubu</div>
              <div style={{ fontSize: 18, fontWeight: 700, fontFamily: fontDisplay, marginBottom: 12 }}>{club.name}</div>
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 600,
                  background: isHead ? C.turfSoft : C.lineSoft,
                  color: isHead ? C.turf : C.inkSoft,
                }}
              >
                {isHead ? "Hlavní skaut" : "Skaut"}
              </div>
            </div>

            {isHead ? (
              <>
                <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20, marginBottom: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>Pozvánkový kód</div>
                  <p style={{ fontSize: 12, color: C.inkSoft, marginBottom: 14, lineHeight: 1.5 }}>
                    Pošli tento kód novému skautovi — při registraci ho zadá do pole „Pozvánkový kód klubu“ a hned se přidá do tvého klubu.
                  </p>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <div
                      style={{
                        fontFamily: fontMono,
                        fontSize: 20,
                        fontWeight: 700,
                        letterSpacing: 3,
                        padding: "10px 16px",
                        background: C.lineSoft,
                        borderRadius: 4,
                      }}
                    >
                      {club.inviteCode}
                    </div>
                    <button onClick={copyInvite} style={smallButtonStyle(C.turf)}>
                      {copied ? <Check size={13} /> : <Copy size={13} />}
                      {copied ? "Zkopírováno" : "Kopírovat"}
                    </button>
                    <button onClick={regenerate} disabled={regenerating} style={smallButtonStyle(C.inkSoft, true)}>
                      <RefreshCw size={13} style={{ animation: regenerating ? "spin 1s linear infinite" : "none" }} />
                      {regenerating ? "Obnovuji…" : "Obnovit kód"}
                    </button>
                  </div>
                  {club.inviteCode && (
                    <p style={{ fontSize: 11, color: C.inkFaint, marginTop: 10 }}>
                      Obnovením kódu se starý kód zneplatní — kdo ho ještě nepoužil, se jím už nepřidá.
                    </p>
                  )}
                </div>

                <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 6, padding: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 14 }}>
                    Skauti v klubu ({club.scouts?.length || 0})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {club.scouts?.map((s) => (
                      <div
                        key={s.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          padding: "10px 12px",
                          border: `1px solid ${C.lineSoft}`,
                          borderRadius: 4,
                        }}
                      >
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>
                            {s.name} {s.role === "hlavni_skaut" && <span style={{ color: C.turf, fontSize: 11 }}>(hlavní skaut)</span>}
                          </div>
                          <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>
                            {s.email} — {s.evaluatedCount} {s.evaluatedCount === 1 ? "ohodnocený hráč" : "ohodnocených hráčů"}
                          </div>
                        </div>
                        {s.role !== "hlavni_skaut" && (
                          <button
                            onClick={() => removeScout(s.id, s.name)}
                            disabled={removingId === s.id}
                            style={{ ...smallButtonStyle(C.red, true), opacity: removingId === s.id ? 0.6 : 1 }}
                          >
                            <UserMinus size={13} />
                            {removingId === s.id ? "Odebírám…" : "Odebrat"}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ background: C.amberSoft, color: C.amber, padding: "14px 16px", borderRadius: 6, fontSize: 13, lineHeight: 1.5 }}>
                Jsi běžný skaut v klubu <strong>{club.name}</strong>. Svoje hodnocení hráčů vidíš jen ty a hlavní skaut klubu — ostatním skautům v appce zůstávají soukromá.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function smallButtonStyle(color, outline) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 4,
    border: outline ? `1px solid ${C.line}` : "none",
    cursor: "pointer",
    background: outline ? "#fff" : color,
    color: outline ? color : "#fff",
    fontSize: 12,
    fontWeight: 600,
    fontFamily: fontBody,
  };
}
