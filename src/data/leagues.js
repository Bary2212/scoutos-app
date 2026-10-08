// Nápověda pro pole „Liga / soutěž“ (uživatel může napsat cokoli vlastního).
// Dospělí
const ADULT = [
  "1. liga ČR",
  "2. liga ČR",
  "3. liga ČR",
  "ČFL",
  "MSFL",
  "Divize",
  "Krajský přebor",
  "Slovenská liga",
  "Polská Ekstraklasa",
  "Bundesliga",
  "Premier League",
  "La Liga",
  "Serie A",
  "Ligue 1",
];

// Mládež: dorost, žáci, přípravky
const YOUTH = [
  "Juniorská liga (U19)",
  "Česká liga dorostu U19",
  "Česká liga dorostu U18",
  "Česká liga dorostu U17",
  "Česká liga dorostu U16",
  "Česká liga žáků U15",
  "Česká liga žáků U14",
  "Česká liga žáků U13",
  "Krajský přebor dorostu",
  "Krajský přebor starších žáků",
  "Krajský přebor mladších žáků",
  "Starší žáci",
  "Mladší žáci",
  "Starší přípravka (U11)",
  "Mladší přípravka (U9)",
  "Mládežnická reprezentace",
  "UEFA Youth League",
];

export const LEAGUE_SUGGESTIONS = [...ADULT, ...YOUTH];
