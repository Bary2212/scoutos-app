// Míra náchylnosti ke zranění počítaná z Kariérní historie (záznamy typu "injury").
// Počítají se zranění za posledních 12 měsíců; starší záznamy se z výpočtu
// postupně vytrácejí, takže riziko po roce bez zranění samo klesne.
// Tenhle soubor je sdílený: importuje ho frontend i server (server/injuryRisk.js je jeho kopie).

export const INJURY_WINDOW_MONTHS = 12;

// Hranice úrovní — počet zranění NEBO celkový počet dní mimo hru za okno.
export const INJURY_THRESHOLDS = {
  medium: { count: 3, days: 60 },
  high: { count: 5, days: 120 },
};

const MONTHS = {
  leden: 1, ledna: 1, unor: 2, unora: 2, brezen: 3, brezna: 3, duben: 4, dubna: 4,
  kveten: 5, kvetna: 5, cerven: 6, cervna: 6, cervenec: 7, cervence: 7,
  srpen: 8, srpna: 8, zari: 9, rijen: 10, rijna: 10, listopad: 11, listopadu: 11,
  prosinec: 12, prosince: 12,
};

function strip(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

// Vrátí { start, end } (Date) období, které záznam pokrývá, nebo null.
// "26.8.2026" -> jeden den, "Srpen 2026" / "8/2026" -> měsíc, "2026" -> celý rok (nepřesné).
export function parseHistoryDate(text) {
  const t = strip(text);
  if (!t) return null;
  let m = t.match(/^(\d{1,2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{4})$/);
  if (m) {
    const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return { start: date, end: date, precise: true };
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return Number.isNaN(date.getTime()) ? null : { start: date, end: date, precise: true };
  }
  let mo = null;
  let y = null;
  m = t.match(/^(\d{1,2})\s*[./]\s*(\d{4})$/);
  if (m) {
    mo = Number(m[1]);
    y = Number(m[2]);
  } else {
    m = t.match(/^([a-z]+)\s+(\d{4})$/);
    if (m && MONTHS[m[1]]) {
      mo = MONTHS[m[1]];
      y = Number(m[2]);
    }
  }
  if (mo && mo >= 1 && mo <= 12 && y) {
    return { start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 0)), precise: false };
  }
  m = t.match(/^(\d{4})$/);
  if (m) {
    const yr = Number(m[1]);
    return { start: new Date(Date.UTC(yr, 0, 1)), end: new Date(Date.UTC(yr, 11, 31)), precise: false, yearOnly: true };
  }
  return null;
}

// history: pole záznamů { date, category, label, days }.
// Vrací null (žádné zranění zapsané), nebo { level: "low"|"medium"|"high", count, days, quiet }.
// quiet = true: zranění existují, ale žádné není z posledního roku.
export function computeInjuryRisk(history, now = new Date()) {
  const injuries = (Array.isArray(history) ? history : []).filter((t) => t && t.category === "injury");
  if (injuries.length === 0) return null;
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const windowStart = new Date(today);
  windowStart.setUTCMonth(windowStart.getUTCMonth() - INJURY_WINDOW_MONTHS);
  let count = 0;
  let days = 0;
  let sawOld = false;
  let unsure = false;
  for (const inj of injuries) {
    const range = parseHistoryDate(inj.date);
    if (!range) {
      unsure = true;
      continue;
    }
    if (range.end < windowStart) {
      sawOld = true;
      continue;
    }
    if (range.start.getTime() > today) continue;
    // Celý rok (bez měsíce) nejde přesně zařadit — nepočítá se, ale nesmí se tvrdit "klid".
    if (range.yearOnly) {
      unsure = true;
      continue;
    }
    count += 1;
    days += Number(inj.days) || 0;
  }
  const T = INJURY_THRESHOLDS;
  if (count === 0) {
    if (unsure || !sawOld) return null;
    return { level: "low", count: 0, days: 0, quiet: true };
  }
  const level = count >= T.high.count || days >= T.high.days ? "high" : count >= T.medium.count || days >= T.medium.days ? "medium" : "low";
  return { level, count, days, quiet: false };
}

const LEVEL_TEXT = { low: "Nízké riziko zranění", medium: "Střední riziko zranění", high: "Vysoké riziko zranění" };

function czCount(n) {
  return n === 1 ? "1 zranění" : n >= 2 && n <= 4 ? `${n} zranění` : `${n} zranění`;
}

// Text pro štítek: "Střední riziko zranění • 3 zranění za rok, 70 dní".
export function injuryRiskLabel(risk) {
  if (!risk) return "";
  if (risk.quiet) return "Bez zranění za poslední rok";
  const details = [`${czCount(risk.count)} za rok`, risk.days > 0 ? `${risk.days} dní` : null].filter(Boolean).join(", ");
  return `${LEVEL_TEXT[risk.level]} • ${details}`;
}

const LEVEL_SHORT = { low: "Nízké", medium: "Střední", high: "Vysoké" };

// Krátká verze pro PDF: "Střední (2 za rok, 63 dní)".
export function injuryRiskShort(risk) {
  if (!risk) return "";
  if (risk.quiet) return "Bez zranění za rok";
  return `${LEVEL_SHORT[risk.level]} (${risk.count} za rok${risk.days > 0 ? `, ${risk.days} dní` : ""})`;
}
