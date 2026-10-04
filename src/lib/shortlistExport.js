// Generuje jeden PDF se srovnávací tabulkou vybraných hráčů ze shortlisty
// (seskupené podle fáze kanbanu) a rovnou ho stáhne do prohlížeče.
//
// jsPDF se načítá líně (dynamický import) — stejný přístup jako u
// executiveSummary.js, viz komentář tam. Font Roboto se registruje kvůli
// české diakritice, taky stejně jako u executive summary.

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
const AMBER_SOFT = [244, 235, 219];
const RED = [178, 58, 46];
const RED_SOFT = [245, 229, 226];
const INK = [20, 32, 26];
const INK_SOFT = [87, 97, 79];
const INK_FAINT = [138, 146, 132];
const LINE = [218, 221, 211];
const LINE_SOFT = [234, 235, 228];

const RISK_LABEL = { low: "Nízké", medium: "Střední", high: "Vysoké" };
function riskColor(risk) {
  return { low: TURF, medium: AMBER, high: RED }[risk] || INK_FAINT;
}
const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM_LIMIT = 280;

function fmtDate() {
  return new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

// Sloupce tabulky: [popisek, šířka v mm, zarovnání]
const COLS = [
  { label: "Hráč", width: 40, align: "left" },
  { label: "Pozice", width: 22, align: "left" },
  { label: "Klub", width: 36, align: "left" },
  { label: "Věk", width: 14, align: "right" },
  { label: "Tržní hodnota", width: 28, align: "right" },
  { label: "Riziko", width: 18, align: "left" },
  { label: "Skóre", width: 20, align: "right" },
];

function colX(i) {
  let x = MARGIN;
  for (let j = 0; j < i; j++) x += COLS[j].width;
  return x;
}

function drawPageHeader(doc, { scoutName, generatedFor }) {
  doc.setFillColor(...TURF_DARK);
  doc.rect(0, 0, PAGE_W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(18);
  doc.text("ScoutOS — Shortlist", MARGIN, 14);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  const sub = [`Vygenerováno ${fmtDate()}`, scoutName ? `Skaut: ${scoutName}` : null].filter(Boolean).join("  •  ");
  doc.text(sub, MARGIN, 21);
  if (generatedFor) {
    doc.setFontSize(9);
    doc.text(generatedFor, PAGE_W - MARGIN, 21, { align: "right" });
  }
}

function drawTableHeader(doc, y) {
  doc.setFillColor(...LINE_SOFT);
  doc.rect(MARGIN, y, CONTENT_W, 7, "F");
  doc.setFont("Roboto", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(...INK_SOFT);
  COLS.forEach((col, i) => {
    const x = col.align === "right" ? colX(i) + col.width - 2 : colX(i) + 2;
    doc.text(col.label.toUpperCase(), x, y + 4.8, { align: col.align === "right" ? "right" : "left" });
  });
  return y + 7;
}

function drawStageHeading(doc, y, stage, count) {
  doc.setFont("Roboto", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TURF);
  doc.text(stage, MARGIN, y);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK_FAINT);
  doc.text(`${count} ${count === 1 ? "hráč" : count >= 2 && count <= 4 ? "hráči" : "hráčů"}`, MARGIN + 60, y);
  return y + 6;
}

// Zkrátí text tak, aby se i s "…" vešel do dané šířky (v mm) — místo
// defaultního zalamování na víc řádků, které by přeteklo přes výšku řádku.
function truncateToWidth(doc, text, maxWidth) {
  if (doc.getTextWidth(text) <= maxWidth) return text;
  let truncated = text;
  while (truncated.length > 1 && doc.getTextWidth(`${truncated}…`) > maxWidth) {
    truncated = truncated.slice(0, -1);
  }
  return `${truncated}…`;
}

function drawRow(doc, y, player, zebra) {
  if (zebra) {
    doc.setFillColor(...TURF_SOFT);
    doc.rect(MARGIN, y, CONTENT_W, 7, "F");
  }
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...INK);

  const score = player.scores?.pressing ?? null;
  const riskIdx = 5; // index sloupce "Riziko" v COLS — vykreslí se barevně zvlášť, ne jako prostý text
  const cells = [
    player.name || "—",
    player.position || "—",
    player.club || "—",
    player.age ? String(player.age) : "—",
    player.marketValue ? `${Number(player.marketValue).toFixed(1)}M €` : "—",
    null,
    score !== null ? String(score) : "—",
  ];
  cells.forEach((text, i) => {
    if (i === riskIdx) return;
    const col = COLS[i];
    const x = col.align === "right" ? colX(i) + col.width - 2 : colX(i) + 2;
    const fitted = truncateToWidth(doc, String(text), col.width - 3);
    doc.text(fitted, x, y + 4.8, { align: col.align === "right" ? "right" : "left" });
  });

  // Riziko se vykresluje barevně (stejná logika jako badge v appce) místo
  // obyčejného textu — na stránce s hodně řádky je tak hned vidět, kde je
  // potřeba zpozornět.
  const risk = player.riskLevel;
  if (risk && RISK_LABEL[risk]) {
    doc.setFont("Roboto", "bold");
    doc.setTextColor(...riskColor(risk));
    doc.text(RISK_LABEL[risk], colX(riskIdx) + 2, y + 4.8);
    doc.setFont("Roboto", "normal");
  }

  doc.setDrawColor(...LINE);
  doc.line(MARGIN, y + 7, MARGIN + CONTENT_W, y + 7);
  return y + 7;
}

// Souhrnné statistiky nad tabulkou — tři "dlaždice" vedle sebe (počet hráčů,
// celková tržní hodnota, počet s vysokým rizikem), aby PDF působilo jako
// hotový přehled, ne jen syrový výpis řádků.
function drawSummaryTiles(doc, y, players) {
  const total = players.length;
  const totalValue = players.reduce((sum, p) => sum + (Number(p.marketValue) || 0), 0);
  const highRiskCount = players.filter((p) => p.riskLevel === "high").length;

  const tiles = [
    { label: total === 1 ? "VYBRANÝ HRÁČ" : "VYBRANÝCH HRÁČŮ", value: String(total) },
    { label: "CELKOVÁ TRŽNÍ HODNOTA", value: `${totalValue.toFixed(1)}M €` },
    { label: "VYSOKÉ RIZIKO ZRANĚNÍ", value: String(highRiskCount), color: highRiskCount > 0 ? RED : TURF },
  ];
  const tileW = CONTENT_W / tiles.length;

  doc.setFillColor(...LINE_SOFT);
  doc.rect(MARGIN, y, CONTENT_W, 22, "F");
  tiles.forEach((tile, i) => {
    const x = MARGIN + tileW * i;
    if (i > 0) {
      doc.setDrawColor(...LINE);
      doc.line(x, y + 4, x, y + 18);
    }
    doc.setFont("Roboto", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...(tile.color || INK));
    doc.text(tile.value, x + tileW / 2, y + 12, { align: "center" });
    doc.setFont("Roboto", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...INK_FAINT);
    doc.text(tile.label, x + tileW / 2, y + 18, { align: "center" });
  });
  return y + 22;
}

// Volitelná poznámka skauta — zvýrazněný blok se zelenou linkou vlevo,
// jako citace/poznámka v dokumentu pro vedení klubu.
function drawNote(doc, y, note) {
  if (!note || !note.trim()) return y;
  const maxWidth = CONTENT_W - 14;
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9.5);
  const lines = doc.splitTextToSize(note.trim(), maxWidth);
  const boxH = lines.length * 5 + 10;

  doc.setFillColor(...TURF_SOFT);
  doc.rect(MARGIN, y, CONTENT_W, boxH, "F");
  doc.setFillColor(...TURF);
  doc.rect(MARGIN, y, 1.5, boxH, "F");

  doc.setFont("Roboto", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...TURF_DARK);
  doc.text("POZNÁMKA SKAUTA", MARGIN + 8, y + 7);

  doc.setFont("Roboto", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...INK);
  doc.text(lines, MARGIN + 8, y + 13);

  return y + boxH + 6;
}

function drawFooter(doc, pageNum, pageCount) {
  doc.setFont("Roboto", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...INK_FAINT);
  doc.text("Vygenerováno appkou ScoutOS.", MARGIN, 290);
  doc.text(`${pageNum} / ${pageCount}`, PAGE_W - MARGIN, 290, { align: "right" });
}

// stageGroups: [{ stage: "Doporučený", players: [...] }, ...] — jen fáze,
// které mají alespoň jednoho vybraného hráče. `note` je volitelná poznámka
// skauta, kterou zadal před exportem (viz Shortlist.jsx).
export async function downloadShortlistExport({ stageGroups, scoutName, generatedFor, note }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await registerCzechFont(doc);

  let y = 40;
  drawPageHeader(doc, { scoutName, generatedFor });

  const allPlayers = stageGroups.flatMap((g) => g.players);
  y = drawSummaryTiles(doc, y, allPlayers);
  y += 8;
  y = drawNote(doc, y, note);

  stageGroups.forEach((group, groupIdx) => {
    if (group.players.length === 0) return;

    if (y > BOTTOM_LIMIT - 24) {
      doc.addPage();
      y = 40;
      drawPageHeader(doc, { scoutName, generatedFor });
    } else if (groupIdx > 0) {
      y += 4;
    }

    y = drawStageHeading(doc, y, group.stage, group.players.length);
    y = drawTableHeader(doc, y);

    group.players.forEach((player, i) => {
      if (y > BOTTOM_LIMIT) {
        doc.addPage();
        y = 40;
        drawPageHeader(doc, { scoutName, generatedFor });
        y = drawTableHeader(doc, y);
      }
      y = drawRow(doc, y, player, i % 2 === 1);
    });
    y += 6;
  });

  const pageCount = doc.internal.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    drawFooter(doc, p, pageCount);
  }

  const dateSlug = new Date().toISOString().slice(0, 10);
  doc.save(`scoutos-shortlist-${dateSlug}.pdf`);
}
