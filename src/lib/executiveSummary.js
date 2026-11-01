// Generuje "Executive summary" PDF pro daného hráče a rovnou ho stáhne.
//
// Obsah (strana 1): hlavička ScoutOS, jméno a základní údaje, celkové skóre
// s textovým shrnutím, údaje o hráči, radar + tabulka 10 základních hodnocení
// (bez soukromého "Rodinného zázemí") a potenciál, silné a slabé stránky.
// Detailní statistiky (pokud existují) jdou do druhé části dokumentu.
//
// jsPDF se načítá líně (dynamický import). Čeština s diakritikou vyžaduje
// vlastní font — Roboto se registruje přes VFS.
import { ratingFromPercentile } from "../data/scoutMetrics.js";
import robotoRegularUrl from "../assets/fonts/Roboto-Regular.ttf?url";
import robotoMediumUrl from "../assets/fonts/Roboto-Medium.ttf?url";

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function registerCzechFont(doc) {
  const [regularBuf, mediumBuf] = await Promise.all([
    fetch(robotoRegularUrl).then((r) => r.arrayBuffer()),
    fetch(robotoMediumUrl).then((r) => r.arrayBuffer()),
  ]);
  doc.addFileToVFS("Roboto-Regular.ttf", arrayBufferToBase64(regularBuf));
  doc.addFont("Roboto-Regular.ttf", "Roboto", "normal");
  doc.addFileToVFS("Roboto-Medium.ttf", arrayBufferToBase64(mediumBuf));
  doc.addFont("Roboto-Medium.ttf", "Roboto", "bold");
  doc.setFont("Roboto", "normal");
}

const TURF = [47, 107, 79];
const TURF_DARK = [31, 74, 55];
const TURF_SOFT = [228, 238, 231];
const AMBER = [201, 138, 44];
const INK = [20, 32, 26];
const INK_SOFT = [87, 97, 79];
const INK_FAINT = [138, 146, 132];
const LINE = [218, 221, 211];
const LINE_SOFT = [240, 241, 235];
const RED = [178, 58, 46];
const PAGE_W = 210;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TOP_Y = 40;
const BOTTOM_LIMIT = 278;

const PRIVATE_IDS = ["rodinne_zazemi"];

function fmtDate(d = new Date()) {
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

function fmtIsoDate(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
}

// Prázdné hodnoty, nuly a "0" se v PDF zobrazují jako pomlčka.
function clean(value) {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (s === "" || s === "0" || s === "0.0" || s === "null" || s === "undefined") return "";
  return s;
}

function ratingColor(v) {
  if (v >= 7) return TURF;
  if (v >= 5) return AMBER;
  return RED;
}

export async function downloadExecutiveSummary({
  player,
  hasAnalytics,
  score,
  breakdown = [],
  contributions = {},
  topPositive,
  topNegative,
  physicalData,
  technicalMetrics,
  mentalProfile,
  strengths,
  weaknesses,
  riskLabel,
  coreItems = [],
  coreRatings = {},
  potential = null,
  scoutName = "",
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await registerCzechFont(doc);

  let y = TOP_Y;

  const drawHeader = () => {
    doc.setFillColor(...TURF_DARK);
    doc.rect(0, 0, PAGE_W, 28, "F");
    doc.setFillColor(...TURF);
    doc.roundedRect(MARGIN, 8, 12, 12, 2, 2, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(13);
    doc.text("S", MARGIN + 6, 16.2, { align: "center" });
    doc.setFontSize(15);
    doc.text("ScoutOS", MARGIN + 16, 15);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(8.5);
    doc.text("Executive summary hráče", MARGIN + 16, 20.5);
    doc.setFontSize(8.5);
    doc.text(fmtDate(), PAGE_W - MARGIN, 14, { align: "right" });
    if (scoutName) doc.text(`Skaut: ${scoutName}`, PAGE_W - MARGIN, 19.5, { align: "right" });
  };

  const newPage = () => {
    doc.addPage();
    drawHeader();
    y = TOP_Y - 6;
  };

  const ensure = (h) => {
    if (y + h > BOTTOM_LIMIT) newPage();
  };

  const sectionTitle = (title, minBody = 24) => {
    ensure(12 + minBody);
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 6.5;
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...TURF_DARK);
    doc.text(title.toUpperCase(), MARGIN, y);
    y += 5.5;
  };

  drawHeader();

  // ---- Jméno a podtitul ----
  doc.setTextColor(...INK);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(22);
  doc.text(player.name || "Neznámý hráč", MARGIN, y);
  y += 7;

  const birthYear = Number(player.birthYear) || null;
  const age = player.age ? Number(player.age) : birthYear ? new Date().getFullYear() - birthYear : null;
  const subtitle = [clean(player.position), clean(player.club), clean(player.league)].filter(Boolean).join("  •  ");
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...INK_SOFT);
  if (subtitle) {
    doc.text(subtitle, MARGIN, y);
    y += 6;
  }
  y += 3;

  // ---- Seřazená hodnocená jádra ----
  const visibleCore = coreItems.filter((it) => !PRIVATE_IDS.includes(it.id) && !it.private);
  const rated = visibleCore
    .filter((it) => coreRatings[it.id] != null && coreRatings[it.id] !== "")
    .map((it) => ({ ...it, value: Number(coreRatings[it.id]) }));
  const ratedSorted = [...rated].sort((a, b) => b.value - a.value);

  // ---- Skóre + shrnutí ----
  const hasScore = hasAnalytics && score !== null && score !== undefined;
  if (hasScore) {
    const cx = MARGIN + 13;
    const cy = y + 13;
    doc.setFillColor(...TURF);
    doc.circle(cx, cy, 13, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(18);
    doc.text(String(score), cx, cy + 1.5, { align: "center" });
    doc.setFont("Roboto", "normal");
    doc.setFontSize(7);
    doc.text("/ 100", cx, cy + 6, { align: "center" });

    // Shrnutí vychází ze stejných dat jako profil: nejdřív základní hodnocení, jinak metriky.
    const parts = [];
    if (ratedSorted.length >= 2) {
      const top = ratedSorted[0];
      const bottom = ratedSorted[ratedSorted.length - 1];
      if (top.value > 5) parts.push(`Nahoru ho táhne hlavně ${top.label.toLowerCase()} (${top.value}/10)`);
      if (bottom.value < 5) parts.push(`${top.value > 5 ? "dolů" : "Dolů"} ho stahuje ${bottom.label.toLowerCase()} (${bottom.value}/10)`);
      if (parts.length) parts[parts.length - 1] += ".";
      if (parts.length === 2) parts[0] += ",";
    } else if (topPositive) {
      parts.push(`Nejsilnější stránkou je ${topPositive.label.toLowerCase()} (${ratingFromPercentile(topPositive.percentile)}/10).`);
      if (topNegative) parts.push(`Nejvíc táhne skóre dolů ${topNegative.label.toLowerCase()} (${ratingFromPercentile(topNegative.percentile)}/10).`);
    }
    if (potential != null && potential !== "") parts.push(`Potenciál: ${potential}/10.`);
    const text = parts.length ? parts.join(" ") : "Skóre vychází z hodnocení skauta.";
    doc.setFont("Roboto", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    const lines = doc.splitTextToSize(text, CONTENT_W - 36);
    doc.text(lines, MARGIN + 32, y + 8);
    y += 30;
  } else {
    doc.setFillColor(...LINE_SOFT);
    doc.rect(MARGIN, y, CONTENT_W, 10, "F");
    doc.setTextColor(...INK_FAINT);
    doc.setFontSize(9);
    doc.text("Pro tohoto hráče zatím nejsou vyplněná hodnocení ani statistiky.", MARGIN + 3, y + 6.5);
    y += 16;
  }

  // ---- Údaje o hráči ----
  sectionTitle("Údaje o hráči");

  const heightClean = clean(player.height);
  const heightText = heightClean
    ? `${heightClean.replace(".", ",")} cm${fmtIsoDate(player.heightMeasuredAt) ? ` (měřeno ${fmtIsoDate(player.heightMeasuredAt)})` : ""}`
    : "—";
  const bioClean = player.bioAge != null && player.bioAge !== "" ? Number(player.bioAge) : null;
  let bioText = "—";
  if (bioClean) {
    bioText = `${String(bioClean).replace(".", ",")} let`;
    if (fmtIsoDate(player.bioAgeDate)) bioText += ` (${fmtIsoDate(player.bioAgeDate)})`;
  }
  const parents = [clean(player.fatherHeight) && `otec ${player.fatherHeight} cm`, clean(player.motherHeight) && `matka ${player.motherHeight} cm`]
    .filter(Boolean)
    .join(", ");
  const mv = Number(player.marketValue);

  const facts = [
    ["Ročník", birthYear ? `${birthYear}${age ? ` (${age} let)` : ""}` : age ? `${age} let` : "—"],
    ["Preferovaná noha", clean(player.foot) || "—"],
    ["Výška", heightText],
    ["Bio věk", bioText],
    ["Výška rodičů", parents || "—"],
    ["Riziko zranění", clean(riskLabel) || "—"],
    ["Tržní hodnota", mv > 0 ? `${mv.toString().replace(".", ",")} M €` : "—"],
    ["Kontrakt do", clean(player.contractUntil) || "—"],
    ["Agent", clean(player.agent) || "—"],
  ];
  const colW = CONTENT_W / 2;
  const rowsN = Math.ceil(facts.length / 2);
  doc.setFontSize(9.5);
  facts.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * colW;
    const rowY = y + row * 6.2;
    doc.setFont("Roboto", "normal");
    doc.setTextColor(...INK_FAINT);
    doc.text(label, x, rowY);
    doc.setTextColor(...INK);
    doc.text(doc.splitTextToSize(String(value), colW - 38)[0], x + 32, rowY);
  });
  y += rowsN * 6.2 + 1;
  if (player.bioAgeNote && clean(player.bioAgeNote)) {
    doc.setFontSize(8.5);
    doc.setTextColor(...INK_SOFT);
    const noteLines = doc.splitTextToSize(`Poznámka k bio věku: ${player.bioAgeNote}`, CONTENT_W);
    doc.text(noteLines, MARGIN, y + 1);
    y += noteLines.length * 4 + 1;
  }
  y += 4;

  // ---- Základní hodnocení: radar + tabulka ----
  if (rated.length > 0) {
    sectionTitle("Základní hodnocení (1–10)");
    const blockH = 66;
    ensure(blockH);

    // Radar
    if (rated.length >= 3) {
      const cx = MARGIN + 36;
      const cy = y + 31;
      const R = 22;
      const n = rated.length;
      const angle = (i) => -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const pt = (i, r) => [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r];

      doc.setDrawColor(...LINE);
      doc.setLineWidth(0.2);
      [0.25, 0.5, 0.75, 1].forEach((k) => {
        const pts = rated.map((_, i) => pt(i, R * k));
        const rel = pts.slice(1).map((p, i) => [p[0] - pts[i][0], p[1] - pts[i][1]]);
        doc.lines(rel, pts[0][0], pts[0][1], [1, 1], "S", true);
      });
      rated.forEach((_, i) => {
        const [x2, y2] = pt(i, R);
        doc.line(cx, cy, x2, y2);
      });

      const dataPts = rated.map((it, i) => pt(i, (R * Math.max(0, Math.min(10, it.value))) / 10));
      const rel = dataPts.slice(1).map((p, i) => [p[0] - dataPts[i][0], p[1] - dataPts[i][1]]);
      doc.setFillColor(...TURF);
      doc.setDrawColor(...TURF);
      doc.setLineWidth(0.6);
      if (typeof doc.GState === "function" && typeof doc.setGState === "function") {
        doc.saveGraphicsState();
        doc.setGState(new doc.GState({ opacity: 0.25 }));
        doc.lines(rel, dataPts[0][0], dataPts[0][1], [1, 1], "F", true);
        doc.restoreGraphicsState();
        doc.lines(rel, dataPts[0][0], dataPts[0][1], [1, 1], "S", true);
      } else {
        doc.lines(rel, dataPts[0][0], dataPts[0][1], [1, 1], "S", true);
      }
      dataPts.forEach(([px, py]) => doc.circle(px, py, 0.8, "F"));
      doc.setLineWidth(0.2);

      doc.setFont("Roboto", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(...INK_SOFT);
      rated.forEach((it, i) => {
        const [lx, ly] = pt(i, R + 4.5);
        const c = Math.cos(angle(i));
        const align = Math.abs(c) < 0.25 ? "center" : c > 0 ? "left" : "right";
        doc.text(it.short || it.label, lx, ly + 1, { align });
      });
    }

    // Tabulka s pruhy
    const tx = MARGIN + 78;
    const tw = CONTENT_W - 78;
    let ty = y + 2;
    const drawGroup = (title, items) => {
      if (items.length === 0) return;
      doc.setFont("Roboto", "bold");
      doc.setFontSize(8);
      doc.setTextColor(...INK_FAINT);
      doc.text(title.toUpperCase(), tx, ty);
      ty += 4.2;
      items.forEach((it) => {
        doc.setFont("Roboto", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        const fits = doc.getTextWidth(it.label) <= 40;
        doc.text(fits ? it.label : it.short || it.label, tx, ty + 2.4);
        const bx = tx + 42;
        const bw = tw - 42 - 11;
        doc.setFillColor(...LINE);
        doc.rect(bx, ty, bw, 2.8, "F");
        doc.setFillColor(...ratingColor(it.value));
        doc.rect(bx, ty, (bw * Math.max(0, Math.min(10, it.value))) / 10, 2.8, "F");
        doc.setFont("Roboto", "bold");
        doc.setTextColor(...INK);
        doc.text(`${it.value}/10`, tx + tw, ty + 2.5, { align: "right" });
        ty += 5.6;
      });
      ty += 1.5;
    };
    drawGroup("Fotbalové dovednosti", rated.filter((it) => it.group === "fotbal"));
    drawGroup("Mimo hřiště", rated.filter((it) => it.group !== "fotbal"));

    if (potential != null && potential !== "") {
      doc.setFillColor(...TURF_SOFT);
      doc.rect(tx, ty - 1, tw, 7.5, "F");
      doc.setFont("Roboto", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...TURF_DARK);
      doc.text("Potenciál", tx + 2, ty + 4);
      doc.text(`${potential}/10`, tx + tw - 2, ty + 4, { align: "right" });
      ty += 8;
    }
    y = Math.max(y + 62, ty) + 3;
  }

  // ---- Silné / slabé stránky ----
  const coreStrengths = ratedSorted.filter((it) => it.value >= 7).slice(0, 3).map((it) => `${it.label} (${it.value}/10)`);
  const coreWeaknesses = [...ratedSorted].reverse().filter((it) => it.value <= 4).slice(0, 3).map((it) => `${it.label} (${it.value}/10)`);
  const strengthList = [...coreStrengths, ...(strengths || [])];
  const weaknessList = [...coreWeaknesses, ...(weaknesses || [])];
  if (strengthList.length > 0 || weaknessList.length > 0) {
    sectionTitle("Silné a slabé stránky");
    const colWidth = CONTENT_W / 2 - 4;
    const measure = (list) => list.reduce((sum, s) => sum + doc.splitTextToSize(`• ${s}`, colWidth).length * 4.5, 6);
    doc.setFontSize(9);
    ensure(Math.max(measure(strengthList), measure(weaknessList)) + 2);
    const draw = (title, list, x, color) => {
      let ly = y;
      if (list.length === 0) return ly;
      doc.setFont("Roboto", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...color);
      doc.text(title, x, ly);
      ly += 5;
      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      list.forEach((s) => {
        const lines = doc.splitTextToSize(`• ${s}`, colWidth);
        doc.text(lines, x, ly);
        ly += lines.length * 4.5;
      });
      return ly;
    };
    const leftY = draw("Silné stránky", strengthList, MARGIN, TURF);
    const rightY = draw("Slabé stránky", weaknessList, MARGIN + CONTENT_W / 2 + 4, RED);
    y = Math.max(leftY, rightY) + 3;
  }

  // ---- Detailní statistiky (volitelná druhá část) ----
  const compactRows = (rows) => rows.filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "");
  const technicalRows = technicalMetrics
    ? compactRows([
        ["Přesnost přihrávek", technicalMetrics.passAccuracyPct != null ? `${technicalMetrics.passAccuracyPct} %` : null],
        ["Úspěšnost driblinku", technicalMetrics.dribbleSuccessPct != null ? `${technicalMetrics.dribbleSuccessPct} %` : null],
        ["Vzdušné souboje", technicalMetrics.aerialDuelsWonPct != null ? `${technicalMetrics.aerialDuelsWonPct} %` : null],
        ["Odebrání míče", technicalMetrics.tacklesWonPct != null ? `${technicalMetrics.tacklesWonPct} %` : null],
        ["Klíčové přihrávky", technicalMetrics.keyPassesPerMatch != null ? `${String(technicalMetrics.keyPassesPerMatch).replace(".", ",")} / zápas` : null],
      ])
    : [];
  const physicalRows = physicalData
    ? compactRows([
        ["Proběhaná vzdálenost", physicalData.distanceKm != null ? `${physicalData.distanceKm} km` : null],
        ["Sprinty", physicalData.sprints],
        ["Max. rychlost", physicalData.topSpeedKmh != null ? `${physicalData.topSpeedKmh} km/h` : null],
        ["Vysoká intenzita", physicalData.highIntensityPct != null ? `${physicalData.highIntensityPct} %` : null],
      ])
    : [];
  const hasBreakdown = hasAnalytics && breakdown.length > 0;

  if (hasBreakdown || technicalRows.length || physicalRows.length) {
    sectionTitle("Detailní statistiky (doplňující)");

    if (hasBreakdown) {
      const ranked = [...breakdown].sort((a, b) => (contributions?.[b.id] ?? b.percentile) - (contributions?.[a.id] ?? a.percentile));
      const top = ranked.slice(0, 8);
      doc.setFontSize(9);
      top.forEach((stat) => {
        ensure(7);
        doc.setFont("Roboto", "normal");
        doc.setTextColor(...INK);
        doc.text(stat.label, MARGIN, y + 3.2, { maxWidth: 70 });
        const barX = MARGIN + 75;
        const barW = CONTENT_W - 75 - 14;
        doc.setFillColor(...LINE);
        doc.rect(barX, y, barW, 3, "F");
        doc.setFillColor(...TURF);
        doc.rect(barX, y, (barW * Math.max(0, Math.min(100, stat.percentile))) / 100, 3, "F");
        doc.setTextColor(...INK_FAINT);
        doc.text(`${ratingFromPercentile(stat.percentile)}/10`, barX + barW + 3, y + 3);
        y += 6.5;
      });
      y += 3;
    }

    const block = (title, rows) => {
      if (!rows.length) return;
      ensure(10 + Math.ceil(rows.length / 2) * 5.2);
      doc.setFont("Roboto", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...INK);
      doc.text(title, MARGIN, y);
      y += 5;
      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      rows.forEach(([label, value], i) => {
        const x = MARGIN + (i % 2) * colW;
        const rowY = y + Math.floor(i / 2) * 5.2;
        doc.setTextColor(...INK_FAINT);
        doc.text(label, x, rowY);
        doc.setTextColor(...INK);
        doc.text(String(value), x + 42, rowY);
      });
      y += Math.ceil(rows.length / 2) * 5.2 + 4;
    };
    block("Technické metriky", technicalRows);
    block("Fyzická data", physicalRows);
  }

  // ---- Patička na všech stranách ----
  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setDrawColor(...LINE);
    doc.line(MARGIN, 284, PAGE_W - MARGIN, 284);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...INK_FAINT);
    const left = ["Soukromý report ScoutOS", scoutName || null, fmtDate()].filter(Boolean).join("  •  ");
    doc.text(left, MARGIN, 289);
    doc.text(`${p} / ${pageCount}`, PAGE_W - MARGIN, 289, { align: "right" });
  }

  const safeName = (player.name || "hrac").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
  doc.save(`executive-summary-${safeName}.pdf`);
}
