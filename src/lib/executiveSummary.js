// Generuje jednostránkové "Executive summary" PDF pro daného hráče a rovnou
// ho stáhne do prohlížeče. Funguje i pro hráče bez AI analytiky — v tom
// případě se prostě vynechají sekce, pro které nejsou žádná data.
//
// jsPDF (a jeho závislosti) se načítají líně (dynamický import), aby si ho
// nemusel stáhnout každý, kdo appku jen otevře — jen ten, kdo skutečně
// klikne na "Executive summary".
//
// jsPDF umí ve výchozím stavu (fonty "helvetica" apod.) jen znaky Latin-1,
// takže by mu čeština s háčky a čárkami (č, ř, ě, š, ž, ů…) vypadla. Proto
// se sem vloží font Roboto (podporuje i českou diakritiku) jako vlastní
// font přes VFS.
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
const INK = [20, 32, 26];
const INK_SOFT = [87, 97, 79];
const INK_FAINT = [138, 146, 132];
const LINE = [218, 221, 211];
const RED = [178, 58, 46];
const PAGE_W = 210;
const MARGIN = 16;
const CONTENT_W = PAGE_W - MARGIN * 2;

function fmtDate() {
  return new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
}

export async function downloadExecutiveSummary({
  player,
  hasAnalytics,
  score,
  topPositive,
  topNegative,
  contributions,
  breakdown,
  physicalData,
  technicalMetrics,
  mentalProfile,
  strengths,
  weaknesses,
  riskLabel,
}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  await registerCzechFont(doc);
  let y = 0;

  // ---- Hlavička ----
  doc.setFillColor(...TURF_DARK);
  doc.rect(0, 0, PAGE_W, 30, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(18);
  doc.text("ScoutOS — Executive Summary", MARGIN, 14);
  doc.setFont("Roboto", "normal");
  doc.setFontSize(10);
  doc.text(`Vygenerováno ${fmtDate()}`, MARGIN, 21);

  y = 40;

  // ---- Jméno a základní info ----
  doc.setTextColor(...INK);
  doc.setFont("Roboto", "bold");
  doc.setFontSize(20);
  doc.text(player.name || "Neznámý hráč", MARGIN, y);
  y += 7;

  doc.setFont("Roboto", "normal");
  doc.setFontSize(11);
  doc.setTextColor(...INK_SOFT);
  const subtitle = [player.position, player.club, player.age ? `${player.age} let` : null].filter(Boolean).join("  •  ");
  doc.text(subtitle, MARGIN, y);
  y += 10;

  // ---- Skóre (pokud je AI analytika) ----
  if (hasAnalytics && score !== null) {
    doc.setFillColor(...TURF);
    doc.circle(MARGIN + 12, y + 10, 12, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("Roboto", "bold");
    doc.setFontSize(16);
    doc.text(String(score), MARGIN + 12, y + 9, { align: "center" });
    doc.setFontSize(7);
    doc.setFont("Roboto", "normal");
    doc.text("/ 100", MARGIN + 12, y + 14, { align: "center" });

    doc.setTextColor(...INK_SOFT);
    doc.setFontSize(10);
    const explanation = [];
    if (topPositive) explanation.push(`Nejsilnější stránkou je ${topPositive.label.toLowerCase()} (${topPositive.percentile}. percentil).`);
    if (topNegative) explanation.push(`Naopak nejvíc táhne skóre dolů ${topNegative.label.toLowerCase()} (${topNegative.percentile}. percentil).`);
    const lines = doc.splitTextToSize(explanation.join(" "), CONTENT_W - 32);
    doc.text(lines, MARGIN + 30, y + 6);
    y += 28;
  } else {
    doc.setFillColor(...LINE);
    doc.rect(MARGIN, y, CONTENT_W, 10, "F");
    doc.setTextColor(...INK_FAINT);
    doc.setFontSize(9);
    doc.text("Pro tohoto hráče zatím nejsou k dispozici žádná AI analytická data.", MARGIN + 3, y + 6.5);
    y += 18;
  }

  // ---- Rychlé info ----
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 7;
  doc.setFont("Roboto", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...INK);
  doc.text("Rychlé info", MARGIN, y);
  y += 6;

  const facts = [
    ["Tržní hodnota", player.marketValue ? `${player.marketValue}M €` : "—"],
    ["Kontrakt do", player.contractUntil || "—"],
    ["Agent", player.agent || "—"],
    ["Preferovaná noha", player.foot || "—"],
    ["Výška", player.height || "—"],
    ["Riziko zranění", riskLabel || "—"],
  ];
  doc.setFont("Roboto", "normal");
  doc.setFontSize(9.5);
  facts.forEach(([label, value], i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const x = MARGIN + col * (CONTENT_W / 2);
    const rowY = y + row * 6;
    doc.setTextColor(...INK_FAINT);
    doc.text(label, x, rowY);
    doc.setTextColor(...INK);
    doc.text(String(value), x + 55, rowY);
  });
  y += Math.ceil(facts.length / 2) * 6 + 8;

  // ---- Rozklad skóre po metrikách (top položky) ----
  if (hasAnalytics && breakdown.length > 0) {
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 7;
    doc.setFont("Roboto", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text("Rozklad skóre po metrikách", MARGIN, y);
    y += 6;

    const ranked = [...breakdown].sort((a, b) => (contributions[b.id] ?? 0) - (contributions[a.id] ?? 0));
    const top = ranked.slice(0, 8);
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    top.forEach((stat) => {
      doc.setTextColor(...INK);
      doc.text(stat.label, MARGIN, y + 3.2, { maxWidth: 70 });
      const barX = MARGIN + 75;
      const barW = CONTENT_W - 75 - 14;
      doc.setFillColor(...LINE);
      doc.rect(barX, y, barW, 3, "F");
      doc.setFillColor(...TURF);
      doc.rect(barX, y, (barW * Math.max(0, Math.min(100, stat.percentile))) / 100, 3, "F");
      doc.setTextColor(...INK_FAINT);
      doc.text(`${stat.percentile}.`, barX + barW + 3, y + 3);
      y += 7;
    });
    y += 3;
  }

  // ---- Technické / fyzické / mentální (kompaktně) ----
  const compactBlock = (title, rows) => {
    if (!rows || rows.length === 0) return;
    doc.setFont("Roboto", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...INK);
    doc.text(title, MARGIN, y);
    y += 5;
    doc.setFont("Roboto", "normal");
    doc.setFontSize(9);
    rows.forEach(([label, value], i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = MARGIN + col * (CONTENT_W / 2);
      const rowY = y + row * 5.2;
      doc.setTextColor(...INK_FAINT);
      doc.text(label, x, rowY);
      doc.setTextColor(...INK);
      doc.text(String(value), x + 55, rowY);
    });
    y += Math.ceil(rows.length / 2) * 5.2 + 5;
  };

  if (technicalMetrics || physicalData) {
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 7;
  }
  if (technicalMetrics) {
    const rows = [
      ["Přesnost přihrávek", technicalMetrics.passAccuracyPct],
      ["Úspěšnost driblinku", technicalMetrics.dribbleSuccessPct],
      ["Vzdušné souboje", technicalMetrics.aerialDuelsWonPct],
      ["Úspěšné odebrání míče", technicalMetrics.tacklesWonPct],
      ["Klíčové přihrávky", technicalMetrics.keyPassesPerMatch],
    ].filter(([, v]) => v !== undefined && v !== null);
    compactBlock("Technické metriky", rows);
  }
  if (physicalData) {
    const rows = [
      ["Proběhaná vzdálenost", physicalData.distanceKm],
      ["Sprinty", physicalData.sprints],
      ["Max. rychlost", physicalData.topSpeedKmh],
      ["Vysoká intenzita", physicalData.highIntensityPct],
    ].filter(([, v]) => v !== undefined && v !== null);
    compactBlock("Fyzická data", rows);
  }
  if (mentalProfile) {
    const rows = [
      ["Lídrovství", mentalProfile.leadership],
      ["Klid pod tlakem", mentalProfile.composure],
      ["Koučovatelnost", mentalProfile.coachability],
      ["Pracovitost", mentalProfile.workRate],
    ].filter(([, v]) => v !== undefined && v !== null);
    compactBlock("Mentální profil", rows);
  }

  // ---- Silné / slabé stránky ----
  if (strengths?.length > 0 || weaknesses?.length > 0) {
    doc.line(MARGIN, y, PAGE_W - MARGIN, y);
    y += 7;
    const colW = CONTENT_W / 2 - 4;
    let leftY = y;
    let rightY = y;
    if (strengths?.length > 0) {
      doc.setFont("Roboto", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...TURF);
      doc.text("Silné stránky", MARGIN, leftY);
      leftY += 5;
      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      strengths.forEach((s) => {
        const lines = doc.splitTextToSize(`• ${s}`, colW);
        doc.text(lines, MARGIN, leftY);
        leftY += lines.length * 4.5;
      });
    }
    if (weaknesses?.length > 0) {
      const rightX = MARGIN + CONTENT_W / 2 + 4;
      doc.setFont("Roboto", "bold");
      doc.setFontSize(10);
      doc.setTextColor(...RED);
      doc.text("Slabé stránky", rightX, rightY);
      rightY += 5;
      doc.setFont("Roboto", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...INK);
      weaknesses.forEach((s) => {
        const lines = doc.splitTextToSize(`• ${s}`, colW);
        doc.text(lines, rightX, rightY);
        rightY += lines.length * 4.5;
      });
    }
    y = Math.max(leftY, rightY) + 4;
  }

  // ---- Patička ----
  doc.setFontSize(8);
  doc.setTextColor(...INK_FAINT);
  doc.text("Vygenerováno appkou ScoutOS.", MARGIN, 290);

  const safeName = (player.name || "hrac").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-");
  doc.save(`executive-summary-${safeName}.pdf`);
}
