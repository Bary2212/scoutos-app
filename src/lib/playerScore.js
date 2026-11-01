// Sdílený výpočet AI skóre hráče z jeho `breakdown` metrik — stejná logika,
// kterou používá profil hráče (PlayerProfile.jsx), vytažená sem, aby ji
// mohly používat i další stránky (např. Radar hodnoty) beze změny chování.

export const STYLES = [
  { id: "pressing", label: "Presink" },
  { id: "possession", label: "Držení míče" },
  { id: "defensive", label: "Defenzivní blok" },
];

// Základní hodnota skóre (pozicní průměr) — ke které se přičítají kontribuce metrik.
export const BASE_SCORE = 62;

// Vrátí { hasAnalytics, score, contributions } pro daného hráče (objekt z API,
// který obsahuje `breakdown` a volitelně `styleContributions`) a zvolenou
// filozofii klubu (jeden z STYLES id).
export function computePlayerScore(player, style = "pressing") {
  const breakdown = player?.breakdown || [];
  const coreScore = coreScoreFromRatings(player?.coreRatings);
  const hasAnalytics = breakdown.length > 0 || coreScore !== null;
  if (!hasAnalytics) return { hasAnalytics: false, score: null, contributions: null };

  // Ukázkový hráč s ručně laděnými příspěvky podle filozofie klubu: základ + součet.
  if (player.styleContributions && breakdown.length > 0) {
    const contributions = player.styleContributions[style];
    const score = Math.max(0, Math.min(100, BASE_SCORE + Object.values(contributions).reduce((sum, v) => sum + v, 0)));
    return { hasAnalytics: true, score, contributions };
  }

  // Příspěvek metriky = jak moc je nad / pod průměrem (50), jen pro seřazení a zobrazení.
  const contributions = Object.fromEntries(breakdown.map((s) => [s.id, Math.round((s.percentile - 50) / 6)]));

  // Základních 10 hodnocení má přednost před podrobnými statistikami.
  if (coreScore !== null) return { hasAnalytics: true, score: coreScore, contributions };

  // Hráč s ručně zadanými metrikami: skóre je PRŮMĚR percentilů, mírně přitažený k
  // základní hodnotě, aby jedna jediná metrika neurčila celé skóre. Na rozdíl od
  // součtu nezávisí na tom, kolik metrik skaut zadal (dřív 30 metrik = vždy 100).
  const PRIOR_WEIGHT = 3;
  const sumPercentiles = breakdown.reduce((sum, s) => sum + Number(s.percentile || 0), 0);
  const score = Math.max(0, Math.min(100, Math.round((BASE_SCORE * PRIOR_WEIGHT + sumPercentiles) / (PRIOR_WEIGHT + breakdown.length))));
  return { hasAnalytics: true, score, contributions };
}

// Skóre z deseti základních hodnocení (1–10): stejný zeslabený průměr jako u podrobných
// metrik (rating -> percentil rating*10-5). null = žádné hodnocení zadané.
export function coreScoreFromRatings(core) {
  const vals = Object.values(core || {})
    .map(Number)
    .filter((r) => Number.isFinite(r) && r >= 1 && r <= 10);
  if (vals.length === 0) return null;
  const sum = vals.reduce((acc, r) => acc + (r * 10 - 5), 0);
  return Math.max(0, Math.min(100, Math.round((BASE_SCORE * 3 + sum) / (3 + vals.length))));
}
