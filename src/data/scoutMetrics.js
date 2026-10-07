// Katalog metrik, které skaut umí posoudit vlastním okem během zápasu
// (bez potřeby GPS trackerů nebo video-analytického software).
// Používá se ve formuláři pro ruční zadání statistik hráče (PlayerStatsForm)
// i pro vykreslení stejných dat na profilu hráče (PlayerProfile).

// ---- Rozklad skóre po metrikách (breakdown) -------------------------
// Každá metrika: hodnocení 1–10, jak skaut hráče v dané dovednosti vidí
// ve srovnání s hráči na stejné pozici a úrovni soutěže.

export const METRIC_GROUPS = [
  {
    id: "s_micem",
    label: "Hra s míčem",
    outfieldOnly: true,
    metrics: [
      { id: "prvni_dotek", label: "První dotek / zpracování míče" },
      { id: "driblink", label: "Driblink v souboji 1v1" },
      { id: "kratke_prihravky", label: "Přesnost krátkých přihrávek" },
      { id: "dlouhe_prihravky", label: "Přesnost dlouhých přihrávek" },
      { id: "rozehravka", label: "Kvalita rozehrávky do útoku" },
      { id: "kreativita", label: "Kreativita v posledních 30 m" },
      { id: "strelba_silnejsi", label: "Střelba silnější nohou" },
      { id: "strelba_slabsi", label: "Střelba slabší nohou" },
      { id: "centry", label: "Centry a standardní situace" },
      { id: "hlavickovy_souboj", label: "Hra hlavou (technika)" },
    ],
  },
  {
    id: "bez_mice",
    label: "Hra bez míče (útok)",
    outfieldOnly: true,
    metrics: [
      { id: "pohyb_bez_mice", label: "Pohyb bez míče / uvolňování se" },
      { id: "cteni_hry", label: "Čtení hry a předvídání" },
    ],
  },
  {
    id: "obrana",
    label: "Bránění",
    outfieldOnly: true,
    metrics: [
      { id: "souboje_1v1_obr", label: "Obranné souboje 1v1" },
      { id: "timing_skluzu", label: "Timing skluzu / odebrání míče" },
      { id: "kryti_prostoru", label: "Krytí prostoru / zónová obrana" },
      { id: "hra_na_balon", label: "Hra na balón vs. hra na hráče" },
      { id: "pressing", label: "Intenzita a načasování pressingu" },
      { id: "postaveni", label: "Postavení / positioning" },
    ],
  },
  {
    id: "prechody",
    label: "Přechodové fáze",
    outfieldOnly: true,
    metrics: [{ id: "tranzice", label: "Přechody obrana/útok (tranzice)" }],
  },
  {
    id: "brankar",
    label: "Brankářské dovednosti",
    goalkeeperOnly: true,
    metrics: [
      { id: "reflexy", label: "Reflexy a zákroky" },
      { id: "postaveni_v_brance", label: "Postavení v brance" },
      { id: "vybirani_centru", label: "Jistota při vybírání centrů" },
      { id: "sweeping", label: "Hra mimo bránu (sweeping)" },
      { id: "rozehravka_noha", label: "Rozehrávka nohou" },
      { id: "rozehravka_ruka", label: "Rozehrávka rukou / výhozy" },
    ],
  },
  {
    id: "fyzicno",
    label: "Fyzické předpoklady (odhad okem)",
    metrics: [
      { id: "akcelerace", label: "Akcelerace / výbušnost" },
      { id: "max_rychlost", label: "Maximální rychlost" },
      { id: "vytrvalost", label: "Vytrvalost do konce zápasu" },
      { id: "sila_v_souboji", label: "Síla v osobních soubojích" },
      { id: "agilita", label: "Agilita / obratnost" },
      { id: "skok", label: "Skokanská výbušnost" },
    ],
  },
  {
    id: "mentalita",
    label: "Mentalita v zápase",
    metrics: [
      { id: "klid_pod_tlakem", label: "Klid pod tlakem" },
      { id: "komunikace", label: "Komunikace a organizace spoluhráčů" },
      { id: "reakce_po_chybe", label: "Reakce po vlastní chybě" },
      { id: "souteziviost", label: "Soutěživost / touha vyhrávat souboje" },
    ],
  },
];

// ---- Škála 1–10 s popisky --------------------------------------------
// Uvnitř se dál ukládá pole `percentile` (0–100), aby fungovalo skóre,
// porovnání i PDF; skaut ale vidí a zadává jen 1–10.
export const RATING_LABELS = {
  1: "Velmi slabé",
  2: "Slabé",
  3: "Pod průměrem",
  4: "Lehce pod průměrem",
  5: "Průměr",
  6: "Lehce nad průměrem",
  7: "Dobré",
  8: "Velmi dobré",
  9: "Výborné",
  10: "Elitní",
};

export function ratingFromPercentile(p) {
  const n = Math.round(Number(p) / 10);
  return Math.max(1, Math.min(10, Number.isFinite(n) ? n : 5));
}

export function percentileFromRating(r) {
  return Math.max(0, Math.min(100, Number(r) * 10 - 5));
}

export function ratingLabel(percentile) {
  return RATING_LABELS[ratingFromPercentile(percentile)];
}

// Skupiny relevantní pro danou pozici (brankář vs. hráč do pole).
export function groupsForPosition(position) {
  const isGoalkeeper = position === "Brankář";
  return METRIC_GROUPS.filter((g) => {
    if (g.goalkeeperOnly) return isGoalkeeper;
    if (g.outfieldOnly) return !isGoalkeeper;
    return true;
  });
}

// ---- Fixní bloky, které profil hráče zobrazuje samostatně -----------

export const TECHNICAL_FIELDS = [
  { key: "passAccuracyPct", label: "Přesnost přihrávek", unit: "%", max: 100 },
  { key: "dribbleSuccessPct", label: "Úspěšnost driblinku", unit: "%", max: 100 },
  { key: "aerialDuelsWonPct", label: "Úspěšnost ve vzdušných soubojích", unit: "%", max: 100 },
  { key: "tacklesWonPct", label: "Úspěšnost odebrání míče", unit: "%", max: 100 },
  { key: "keyPassesPerMatch", label: "Klíčové přihrávky", unit: "/zápas", max: 10, step: 0.1 },
];

export const PHYSICAL_FIELDS = [
  { key: "distanceKm", label: "Proběhaná vzdálenost", unit: "km/zápas", max: 15, step: 0.1 },
  { key: "sprints", label: "Sprinty", unit: "/zápas", max: 40 },
  { key: "topSpeedKmh", label: "Maximální rychlost", unit: "km/h", max: 40, step: 0.1 },
  { key: "highIntensityPct", label: "Podíl vysoké intenzity", unit: "%", max: 100 },
];

export const MENTAL_FIELDS = [
  { key: "leadership", label: "Lídrovství" },
  { key: "composure", label: "Klid pod tlakem" },
  { key: "coachability", label: "Koučovatelnost" },
  { key: "workRate", label: "Pracovitost" },
];
