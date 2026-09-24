// ScoutOS — databázová vrstva (PostgreSQL).
//
// Tabulky se vytvářejí automaticky při startu appky (CREATE TABLE IF NOT EXISTS),
// takže není potřeba spouštět žádné SQL ručně. Při úplně prvním spuštění (prázdná
// databáze) appka rovnou naplní dvě demo scoutovské účty a ukázková data, aby appka
// hned po nasazení fungovala stejně jako dřív s db.json.
//
// Bohatá analytická data u hráče (rozklad skóre, video klipy, kariérní historie,
// tržní historie, podobní hráči...) se ukládají do jednoho sloupce `analytics`
// typu JSONB — je to běžný a doporučený postup pro semi-strukturovaná data,
// která se nikdy nefiltrují ani nepropojují s jinými tabulkami.

import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes("render.com") ? { rejectUnauthorized: false } : false,
});

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  first_name TEXT,
  last_name TEXT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'skaut',
  is_demo_team BOOLEAN NOT NULL DEFAULT false,
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_code TEXT,
  verification_expires BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS players (
  id SERIAL PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  is_shared_demo BOOLEAN NOT NULL DEFAULT false,
  name TEXT NOT NULL,
  position TEXT NOT NULL,
  age INTEGER,
  club TEXT DEFAULT '',
  market_value NUMERIC DEFAULT 0,
  contract_until TEXT DEFAULT '',
  agent TEXT DEFAULT '',
  foot TEXT DEFAULT '',
  height TEXT DEFAULT '',
  minutes_tracked INTEGER DEFAULT 0,
  risk_level TEXT DEFAULT 'low',
  scores JSONB NOT NULL DEFAULT '{"pressing":50,"possession":50,"defensive":50}',
  reason JSONB NOT NULL DEFAULT '{}',
  analytics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  author TEXT NOT NULL,
  match TEXT DEFAULT '',
  date TEXT NOT NULL,
  recommendation TEXT NOT NULL,
  edited BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS matches (
  id SERIAL PRIMARY KEY,
  date TEXT NOT NULL,
  fixture TEXT NOT NULL,
  suggested_scout TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  assigned_scout TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS events (
  id SERIAL PRIMARY KEY,
  match_id INTEGER NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  minute INTEGER NOT NULL,
  player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
  action_id TEXT NOT NULL,
  action_label TEXT DEFAULT '',
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coverage (
  league TEXT NOT NULL,
  position TEXT NOT NULL,
  value INTEGER NOT NULL,
  PRIMARY KEY (league, position)
);

CREATE TABLE IF NOT EXISTS shortlist_stages (
  stage TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  sort_order INTEGER NOT NULL
);
`;

// ---------- Demo hráči (sdílená demo data, viditelná pro isDemoTeam účty) ----------
// Definované na úrovni modulu (ne uvnitř seedIfEmpty), aby stejná data mohla použít
// i upgradeDemoAnalytics() níže — ta doplní nové/rozšířené analytické sekce i do
// databáze, která už jednou byla naseedovaná dřívější (chudší) verzí dat.
const kovarAnalytics = {
      styleContributions: {
        pressing: { xt: 4, duels: 8, transition: 5, crosses: 2, passing: 1, discipline: -1, setpieces: -3 },
        possession: { xt: 6, duels: 3, transition: 2, crosses: 7, passing: 8, discipline: -1, setpieces: -2 },
        defensive: { xt: 1, duels: 11, transition: 1, crosses: 0, passing: 1, discipline: 2, setpieces: -1 },
      },
      breakdown: [
        { id: "xt", label: "Expected Threat (xT) + Non-Shot xG", percentile: 85, tag: null, detail: "Kumulativní hodnota, o kolik hráč zvýšil gólovou hrozbu týmu jakoukoliv akcí — přihrávkou, vedením míče i náběhem bez míče — i když akce neskončila střelou. Licencovaná metrika (Vrstva A, Kapitola 12 PRD), ne interně počítaná od nuly." },
        { id: "duels", label: "Úspěšné defenzivní souboje", percentile: 82, tag: "Souboj", detail: "82. percentil v rámci hráčů stejné pozice a věku po zohlednění síly ligy (0.72) a possession-adjustmentu." },
        { id: "transition", label: "Rychlost přechodu do útoku", percentile: 88, tag: "Přechod", detail: "Nejsilnější metrika hráče — výrazně nad průměrem i po Bayesovském zmenšení kvůli 1420 sledovaným minutám." },
        { id: "crosses", label: "Přesnost centrů", percentile: 58, tag: "Centr", detail: "Mírně nad průměrem, ale s vysokou variancí mezi zápasy." },
        { id: "passing", label: "Úspěšnost dlouhých přihrávek", percentile: 61, tag: "Rozehrávka", detail: "Stabilní, blízko ligového průměru pro tuto pozici." },
        { id: "discipline", label: "Disciplína (karty)", percentile: 45, tag: null, detail: "Lehce podprůměrné, sledovat trend v posledních zápasech." },
        { id: "setpieces", label: "Standardní situace (obranné)", percentile: 34, tag: null, detail: "Nejslabší článek profilu — nízký percentil i po zohlednění malého vzorku standardek." },
      ],
      clips: [
        { id: 1, title: "Defenzivní souboj — 34. min", tag: "Souboj", duration: "0:14" },
        { id: 2, title: "Centr do pokutového území", tag: "Centr", duration: "0:09" },
        { id: 3, title: "Rozehrávka pod tlakem", tag: "Rozehrávka", duration: "0:11" },
        { id: 4, title: "Sprint zpět do obrany", tag: "Přechod", duration: "0:08" },
        { id: 5, title: "Souboj vzduchem — roh soupeře", tag: "Souboj", duration: "0:07" },
      ],
      careerHistory: [
        { id: 1, date: "2025", category: "transfer", label: "Přestup z FK Slezan do FK Ostrov Bytom" },
        { id: 2, date: "2024", category: "injury", label: "Natažený sval — 3 týdny mimo hru", days: 21 },
        { id: 3, date: "2023", category: "milestone", label: "Postup do základní sestavy A-týmu" },
        { id: 4, date: "2022", category: "transfer", label: "Povýšení z mládežnické akademie do A-týmu" },
        { id: 5, date: "2021", category: "injury", label: "Zlomenina kotníku — 8 týdnů mimo hru", days: 56 },
      ],
      marketHistory: [
        { year: "2023", value: 0.6, low: 0.6, high: 0.6, projected: false },
        { year: "2024", value: 1.1, low: 1.1, high: 1.1, projected: false },
        { year: "2025", value: 1.5, low: 1.5, high: 1.5, projected: false },
        { year: "2026", value: 1.8, low: 1.8, high: 1.8, projected: false },
        { year: "2027", value: 2.3, low: 1.9, high: 2.7, projected: true },
        { year: "2028", value: 2.6, low: 1.8, high: 3.4, projected: true },
      ],
      scoreHistoryRatios: [
        { month: "Bře 26", minutes: 320, low: 0.7, value: 0.82, high: 0.94 },
        { month: "Dub 26", minutes: 620, low: 0.78, value: 0.89, high: 0.98 },
        { month: "Kvě 26", minutes: 940, low: 0.86, value: 0.95, high: 1.02 },
        { month: "Čvn 26", minutes: 1420, low: 0.95, value: 1, high: 1.03 },
      ],
      matchPerformances: [68, 79, 72, 41, 75, 70, 77, 66, 73, 35, 71, 74],
      clutchData: { closeStateScore: 76, decidedStateScore: 65, closeSample: 9, decidedSample: 15 },
      injuryRisk: {
        probability: 18,
        horizonMonths: 6,
        baseline: 5,
        factors: [
          { id: "age", label: "Věk (21 let)", effect: -4, detail: "Nízký věk statisticky snižuje pravděpodobnost svalových zranění z dlouhodobého přetížení." },
          { id: "load", label: "Herní zátěž (1420 min za sezónu)", effect: 5, detail: "Nadprůměrná minutáž v posledních týdnech mírně zvyšuje riziko přetížení ve srovnání s pozicovým průměrem." },
          { id: "history", label: "Historie zranění (2 epizody, 77 dní mimo hru)", effect: 9, detail: "Opakované svalové zranění zvyšuje riziko recidivy podle historických dat srovnatelných případů." },
          { id: "type", label: "Typ posledního zranění (svalové)", effect: 3, detail: "Svalová zranění mají v referenční skupině vyšší míru recidivy než zlomeniny nebo distorze." },
        ],
      },
      similarPlayersData: [
        { id: 1, name: "Adam Ševčík", similarity: 91, priceDelta: "−0.4M €", age: 22, marketValue: "1.4M €", score: 71, risk: "medium", metrics: { xt: 70, duels: 75, transition: 80, crosses: 64, passing: 59, discipline: 50, setpieces: 40 } },
        { id: 2, name: "Marek Hruška", similarity: 86, priceDelta: "+0.6M €", age: 20, marketValue: "2.4M €", score: 78, risk: "low", metrics: { xt: 88, duels: 85, transition: 91, crosses: 70, passing: 68, discipline: 60, setpieces: 55 } },
        { id: 3, name: "Filip Dostál", similarity: 79, priceDelta: "−0.9M €", age: 23, marketValue: "0.9M €", score: 68, risk: "high", metrics: { xt: 60, duels: 70, transition: 78, crosses: 50, passing: 55, discipline: 35, setpieces: 30 } },
      ],
      physicalData: { distanceKm: 10.8, sprints: 21, topSpeedKmh: 32.4, highIntensityPct: 27 },
      technicalMetrics: { dribbleSuccessPct: 61, keyPassesPerMatch: 1.2, aerialDuelsWonPct: 58, tacklesWonPct: 74, passAccuracyPct: 83 },
      mentalProfile: { leadership: 6, composure: 7, coachability: 9, workRate: 8, note: "Velmi přístupný zpětné vazbě, na hřišti klidný i za nepříznivého skóre." },
      strengths: ["Výbušný přechod z obrany do útoku", "Spolehlivý v osobních soubojích", "Rychle se učí nové pokyny od trenéra"],
      weaknesses: ["Nižší přínos ve standardních situacích", "Kolísavá přesnost centrů mezi zápasy"],
    };

    // ---------- Rozšířená analytika i pro zbylých 6 demo hráčů ----------
    // Stejná struktura jako u Kováře (breakdown, klipy, historie, riziko zranění, podobní
    // hráči) plus nové sekce (fyzická data, technické metriky, mentální profil, silné/slabé
    // stránky), přizpůsobené konkrétní pozici každého hráče.
    const sevcikAnalytics = {
      breakdown: [
        { id: "duels", label: "Úspěšné defenzivní souboje", percentile: 74, tag: "Souboj", detail: "Nadprůměrný v soubojích jeden na jednoho, stabilní napříč sezónou." },
        { id: "transition", label: "Rychlost přechodu do útoku", percentile: 66, tag: "Přechod", detail: "Solidní, ale bez výrazné špičkové hodnoty." },
        { id: "crosses", label: "Přesnost centrů", percentile: 55, tag: "Centr", detail: "Průměrná hodnota v rámci pozice." },
        { id: "passing", label: "Úspěšnost dlouhých přihrávek", percentile: 52, tag: "Rozehrávka", detail: "Lehce pod ligovým průměrem pro krajního obránce." },
        { id: "discipline", label: "Disciplína (karty)", percentile: 68, tag: null, detail: "Nadprůměrná disciplína, málo zbytečných faulů." },
      ],
      clips: [
        { id: 1, title: "Souboj na lajně — 61. min", tag: "Souboj", duration: "0:12" },
        { id: 2, title: "Návrat a odebrání míče", tag: "Přechod", duration: "0:10" },
      ],
      careerHistory: [
        { id: 1, date: "2024", category: "transfer", label: "Přestup do Slavoje Karviná" },
        { id: 2, date: "2022", category: "milestone", label: "Debut v A-týmu" },
      ],
      marketHistory: [
        { year: "2024", value: 0.9, low: 0.9, high: 0.9, projected: false },
        { year: "2025", value: 1.2, low: 1.2, high: 1.2, projected: false },
        { year: "2026", value: 1.4, low: 1.4, high: 1.4, projected: false },
        { year: "2027", value: 1.6, low: 1.2, high: 2.0, projected: true },
      ],
      scoreHistoryRatios: [
        { month: "Dub 26", minutes: 540, low: 0.68, value: 0.78, high: 0.89 },
        { month: "Kvě 26", minutes: 810, low: 0.72, value: 0.81, high: 0.9 },
        { month: "Čvn 26", minutes: 1050, low: 0.75, value: 0.84, high: 0.93 },
      ],
      matchPerformances: [64, 70, 58, 66, 72, 61, 69, 65],
      clutchData: { closeStateScore: 62, decidedStateScore: 68, closeSample: 6, decidedSample: 11 },
      injuryRisk: {
        probability: 11, horizonMonths: 6, baseline: 5,
        factors: [
          { id: "age", label: "Věk (22 let)", effect: -3, detail: "Nízké riziko dané věkem." },
          { id: "history", label: "Historie zranění (žádná evidovaná)", effect: -2, detail: "Bez evidovaných vážnějších zranění v posledních 2 letech." },
        ],
      },
      similarPlayersData: [
        { id: 1, name: "Tomáš Kovář", similarity: 91, priceDelta: "+0.4M €", age: 21, marketValue: "1.8M €", score: 78, risk: "low", metrics: { xt: 78, duels: 82, transition: 88, crosses: 58, passing: 61, discipline: 45, setpieces: 34 } },
      ],
      physicalData: { distanceKm: 10.2, sprints: 18, topSpeedKmh: 31.1, highIntensityPct: 23 },
      technicalMetrics: { dribbleSuccessPct: 55, keyPassesPerMatch: 0.8, aerialDuelsWonPct: 52, tacklesWonPct: 68, passAccuracyPct: 80 },
      mentalProfile: { leadership: 5, composure: 8, coachability: 7, workRate: 7, note: "Konzistentní a nekonfliktní, drží stabilní výkon i v obtížných zápasech." },
      strengths: ["Vyrovnaný výkon zápas od zápasu", "Nízkorizikový profil", "Solidní v osobním obranném souboji"],
      weaknesses: ["Chybí výrazná špičková vlastnost", "Průměrná přesnost centrů"],
    };

    const hruskaAnalytics = {
      breakdown: [
        { id: "xt", label: "Expected Threat (xT) + Non-Shot xG", percentile: 89, tag: null, detail: "Nejvyšší hodnota ze všech sledovaných obránců." },
        { id: "transition", label: "Rychlost přechodu do útoku", percentile: 91, tag: "Přechod", detail: "Excelentní, klíčová zbraň jeho hry." },
        { id: "duels", label: "Úspěšné defenzivní souboje", percentile: 63, tag: "Souboj", detail: "Mírně slabší article profilu — méně specializovaný na souboje." },
        { id: "crosses", label: "Přesnost centrů", percentile: 72, tag: "Centr", detail: "Nadprůměrná přesnost i pod tlakem." },
        { id: "passing", label: "Úspěšnost dlouhých přihrávek", percentile: 70, tag: "Rozehrávka", detail: "Velmi dobrá schopnost otevřít hru dlouhým pasem." },
      ],
      clips: [
        { id: 1, title: "Sólo po lajně a centr", tag: "Přechod", duration: "0:15" },
        { id: 2, title: "Dlouhá přihrávka za obranu", tag: "Rozehrávka", duration: "0:09" },
      ],
      careerHistory: [
        { id: 1, date: "2025", category: "milestone", label: "Nejlepší hráč měsíce v FC Silesia" },
        { id: 2, date: "2023", category: "transfer", label: "Přestup z mládežnické akademie" },
      ],
      marketHistory: [
        { year: "2024", value: 1.3, low: 1.3, high: 1.3, projected: false },
        { year: "2025", value: 1.9, low: 1.9, high: 1.9, projected: false },
        { year: "2026", value: 2.4, low: 2.4, high: 2.4, projected: false },
        { year: "2027", value: 3.1, low: 2.5, high: 3.8, projected: true },
      ],
      scoreHistoryRatios: [
        { month: "Dub 26", minutes: 600, low: 0.85, value: 0.96, high: 1.05 },
        { month: "Kvě 26", minutes: 880, low: 0.9, value: 1.0, high: 1.08 },
        { month: "Čvn 26", minutes: 1150, low: 0.93, value: 1.02, high: 1.1 },
      ],
      matchPerformances: [80, 85, 74, 88, 79, 91, 76, 83],
      clutchData: { closeStateScore: 81, decidedStateScore: 75, closeSample: 8, decidedSample: 13 },
      injuryRisk: {
        probability: 9, horizonMonths: 6, baseline: 5,
        factors: [
          { id: "age", label: "Věk (20 let)", effect: -4, detail: "Nejnižší věk ze skupiny, statisticky nejnižší riziko." },
          { id: "load", label: "Herní zátěž (1150 min za sezónu)", effect: 3, detail: "Rostoucí minutáž, zatím bez varovných signálů." },
        ],
      },
      similarPlayersData: [
        { id: 1, name: "Tomáš Kovář", similarity: 84, priceDelta: "−0.6M €", age: 21, marketValue: "1.8M €", score: 78, risk: "low", metrics: { xt: 78, duels: 82, transition: 88, crosses: 58, passing: 61, discipline: 45, setpieces: 34 } },
      ],
      physicalData: { distanceKm: 11.3, sprints: 24, topSpeedKmh: 33.2, highIntensityPct: 30 },
      technicalMetrics: { dribbleSuccessPct: 66, keyPassesPerMatch: 1.6, aerialDuelsWonPct: 49, tacklesWonPct: 65, passAccuracyPct: 85 },
      mentalProfile: { leadership: 7, composure: 8, coachability: 8, workRate: 9, note: "Vysoké pracovní nasazení, projevuje se i jako přirozený lídr na lajně." },
      strengths: ["Nejlepší xT ze všech sledovaných obránců", "Výborný v přechodové fázi", "Mladý s výrazným růstovým potenciálem"],
      weaknesses: ["Méně specializovaný na tvrdé osobní souboje", "Slabší ve vzdušných soubojích"],
    };

    const dostalAnalytics = {
      breakdown: [
        { id: "duels", label: "Úspěšné defenzivní souboje", percentile: 81, tag: "Souboj", detail: "Velmi solidní ve všech typech soubojů." },
        { id: "aerial", label: "Vzdušné souboje", percentile: 77, tag: "Souboj", detail: "Nadprůměrný ve hře hlavou, výhoda výšky." },
        { id: "clearances", label: "Úspěšné odkopy/vyčištění", percentile: 73, tag: null, detail: "Spolehlivý v krizových situacích v pokutovém území." },
        { id: "passing", label: "Úspěšnost přihrávek pod tlakem", percentile: 44, tag: "Rozehrávka", detail: "Nejslabší článek profilu — problém při napadání presinkem." },
        { id: "positioning", label: "Pozicování v obranném bloku", percentile: 69, tag: null, detail: "Dobré čtení hry, málo zbytečných výjezdů." },
      ],
      clips: [
        { id: 1, title: "Klíčové odkopnutí v šestnáctce", tag: "Souboj", duration: "0:08" },
        { id: 2, title: "Souboj vzduchem po rohu", tag: "Souboj", duration: "0:07" },
      ],
      careerHistory: [
        { id: 1, date: "2023", category: "injury", label: "Zranění kolena — 10 týdnů mimo hru", days: 70 },
        { id: 2, date: "2021", category: "milestone", label: "Postup do základní sestavy B-týmu" },
      ],
      marketHistory: [
        { year: "2024", value: 0.7, low: 0.7, high: 0.7, projected: false },
        { year: "2025", value: 0.8, low: 0.8, high: 0.8, projected: false },
        { year: "2026", value: 0.9, low: 0.9, high: 0.9, projected: false },
        { year: "2027", value: 0.95, low: 0.7, high: 1.2, projected: true },
      ],
      scoreHistoryRatios: [
        { month: "Dub 26", minutes: 470, low: 0.6, value: 0.71, high: 0.83 },
        { month: "Kvě 26", minutes: 690, low: 0.63, value: 0.74, high: 0.85 },
        { month: "Čvn 26", minutes: 910, low: 0.66, value: 0.77, high: 0.87 },
      ],
      matchPerformances: [66, 60, 71, 58, 64, 69, 55, 62],
      clutchData: { closeStateScore: 70, decidedStateScore: 60, closeSample: 7, decidedSample: 10 },
      injuryRisk: {
        probability: 34, horizonMonths: 6, baseline: 5,
        factors: [
          { id: "history", label: "Historie zranění (koleno, 70 dní mimo hru)", effect: 18, detail: "Vážnější zranění v minulosti výrazně zvyšuje riziko recidivy." },
          { id: "age", label: "Věk (23 let)", effect: 2, detail: "Neutrální vliv věku na riziko." },
          { id: "type", label: "Typ posledního zranění (kloub)", effect: 9, detail: "Kloubní zranění mají vyšší míru recidivy než svalová." },
        ],
      },
      similarPlayersData: [
        { id: 1, name: "Tomáš Kovář", similarity: 68, priceDelta: "+0.9M €", age: 21, marketValue: "1.8M €", score: 78, risk: "low", metrics: { xt: 78, duels: 82, transition: 88, crosses: 58, passing: 61, discipline: 45, setpieces: 34 } },
      ],
      physicalData: { distanceKm: 9.8, sprints: 12, topSpeedKmh: 29.6, highIntensityPct: 18 },
      technicalMetrics: { dribbleSuccessPct: 38, keyPassesPerMatch: 0.4, aerialDuelsWonPct: 71, tacklesWonPct: 79, passAccuracyPct: 76 },
      mentalProfile: { leadership: 8, composure: 6, coachability: 7, workRate: 7, note: "Přirozená autorita v obraně, ale zranění v minulosti mírně ovlivnilo sebedůvěru v soubojích na zemi." },
      strengths: ["Velmi solidní v obranných soubojích za nízkou cenu", "Silný ve vzdušných soubojích", "Dobré čtení hry"],
      weaknesses: ["Zvýšené riziko recidivy zranění kolena", "Slabší rozehrávka pod presinkem"],
    };

    const malyAnalytics = {
      breakdown: [
        { id: "xt", label: "Expected Threat (xT) + klíčové přihrávky", percentile: 86, tag: null, detail: "Nejsilnější článek profilu, výrazná kreativita." },
        { id: "dribbles", label: "Úspěšnost driblinku", percentile: 79, tag: null, detail: "Velmi dobrý v úzkých prostorech mezi liniemi." },
        { id: "pressing", label: "Aktivita v presinku", percentile: 61, tag: null, detail: "Nadprůměrná i na ofenzivní pozici." },
        { id: "defensive", label: "Defenzivní přínos", percentile: 28, tag: null, detail: "Nejslabší článek — čistě ofenzivní profil." },
        { id: "discipline", label: "Disciplína (karty)", percentile: 55, tag: null, detail: "Průměrná disciplína." },
      ],
      clips: [
        { id: 1, title: "Klíčová přihrávka mezi linie", tag: null, duration: "0:11" },
        { id: 2, title: "Dribling a zakončení", tag: null, duration: "0:13" },
      ],
      careerHistory: [
        { id: 1, date: "2025", category: "milestone", label: "Nejvíc gólových přihrávek v sezóně u týmu" },
        { id: 2, date: "2022", category: "transfer", label: "Přestup do Widzewa Łódź" },
      ],
      marketHistory: [
        { year: "2024", value: 1.5, low: 1.5, high: 1.5, projected: false },
        { year: "2025", value: 1.8, low: 1.8, high: 1.8, projected: false },
        { year: "2026", value: 2.1, low: 2.1, high: 2.1, projected: false },
        { year: "2027", value: 2.3, low: 1.8, high: 2.9, projected: true },
      ],
      scoreHistoryRatios: [
        { month: "Dub 26", minutes: 690, low: 0.8, value: 0.91, high: 1.0 },
        { month: "Kvě 26", minutes: 940, low: 0.83, value: 0.94, high: 1.02 },
        { month: "Čvn 26", minutes: 1200, low: 0.85, value: 0.96, high: 1.05 },
      ],
      matchPerformances: [78, 72, 84, 69, 81, 75, 88, 70],
      clutchData: { closeStateScore: 79, decidedStateScore: 71, closeSample: 9, decidedSample: 14 },
      injuryRisk: {
        probability: 14, horizonMonths: 6, baseline: 5,
        factors: [
          { id: "age", label: "Věk (24 let)", effect: 1, detail: "Neutrální vliv věku." },
          { id: "load", label: "Herní zátěž (1200 min za sezónu)", effect: 6, detail: "Vyšší minutáž u kreativního hráče mírně zvyšuje riziko přetížení." },
        ],
      },
      similarPlayersData: [
        { id: 1, name: "David Novotný", similarity: 58, priceDelta: "−1.0M €", age: 19, marketValue: "1.1M €", score: 61, risk: "medium", metrics: { xt: 62, duels: 40, transition: 55, crosses: 30, passing: 58, discipline: 55, setpieces: 25 } },
      ],
      physicalData: { distanceKm: 10.5, sprints: 20, topSpeedKmh: 31.8, highIntensityPct: 26 },
      technicalMetrics: { dribbleSuccessPct: 72, keyPassesPerMatch: 2.4, aerialDuelsWonPct: 41, tacklesWonPct: 46, passAccuracyPct: 84 },
      mentalProfile: { leadership: 6, composure: 7, coachability: 8, workRate: 6, note: "Kreativní a sebevědomý s míčem, potřebuje připomínat defenzivní povinnosti." },
      strengths: ["Výborná kreativita a klíčové přihrávky", "Silný v driblinku v úzkých prostorech", "Rostoucí tržní hodnota"],
      weaknesses: ["Slabý defenzivní přínos", "Nekonzistentní návrat do obranného bloku"],
    };

    const novotnyAnalytics = {
      breakdown: [
        { id: "xg", label: "Expected Goals (xG) na 90 minut", percentile: 68, tag: null, detail: "Nadprůměrné i vzhledem k nízkému věku hráče." },
        { id: "pressing", label: "Intenzita presinku", percentile: 83, tag: null, detail: "Vysoká intenzita, jeden z nejlepších v kategorii U20." },
        { id: "holdup", label: "Podržení míče zády k bráně", percentile: 52, tag: null, detail: "Zatím nevyzrálý, prostor pro zlepšení." },
        { id: "defensive", label: "Defenzivní přínos", percentile: 22, tag: null, detail: "Očekávaně nízký u čistého útočníka." },
        { id: "discipline", label: "Disciplína (karty)", percentile: 60, tag: null, detail: "Nadprůměrná i přes vysokou intenzitu presinku." },
      ],
      clips: [
        { id: 1, title: "Gól po standardní situaci", tag: null, duration: "0:10" },
        { id: 2, title: "Presink a odebrání míče", tag: null, duration: "0:09" },
      ],
      careerHistory: [
        { id: 1, date: "2026", category: "milestone", label: "Debut v A-týmu Górniku Zabrze" },
        { id: 2, date: "2025", category: "transfer", label: "Postup z mládežnické akademie" },
      ],
      marketHistory: [
        { year: "2025", value: 0.5, low: 0.5, high: 0.5, projected: false },
        { year: "2026", value: 1.1, low: 1.1, high: 1.1, projected: false },
        { year: "2027", value: 1.6, low: 1.0, high: 2.3, projected: true },
        { year: "2028", value: 2.2, low: 1.1, high: 3.2, projected: true },
      ],
      scoreHistoryRatios: [
        { month: "Kvě 26", minutes: 310, low: 0.55, value: 0.68, high: 0.82 },
        { month: "Čvn 26", minutes: 520, low: 0.6, value: 0.72, high: 0.85 },
      ],
      matchPerformances: [55, 68, 47, 71, 60, 64],
      clutchData: { closeStateScore: 58, decidedStateScore: 52, closeSample: 4, decidedSample: 6 },
      injuryRisk: {
        probability: 8, horizonMonths: 6, baseline: 5,
        factors: [
          { id: "age", label: "Věk (19 let)", effect: -5, detail: "Nejnižší riziko ze všech sledovaných hráčů díky nízkému věku." },
          { id: "load", label: "Herní zátěž (nízká, 520 min)", effect: -2, detail: "Zatím omezená minutáž, nízké kumulativní zatížení." },
        ],
      },
      similarPlayersData: [
        { id: 1, name: "Jakub Malý", similarity: 58, priceDelta: "+1.0M €", age: 24, marketValue: "2.1M €", score: 70, risk: "medium", metrics: { xt: 86, duels: 30, transition: 60, crosses: 35, passing: 65, discipline: 55, setpieces: 30 } },
      ],
      physicalData: { distanceKm: 10.9, sprints: 26, topSpeedKmh: 33.9, highIntensityPct: 31 },
      technicalMetrics: { dribbleSuccessPct: 58, keyPassesPerMatch: 0.6, aerialDuelsWonPct: 44, tacklesWonPct: 38, passAccuracyPct: 74 },
      mentalProfile: { leadership: 4, composure: 5, coachability: 9, workRate: 9, note: "Velmi mladý, ale extrémně pracovitý a otevřený učení — jasně největší růstový potenciál skupiny." },
      strengths: ["Vysoká intenzita presinku i v mladém věku", "Nejnižší riziko zranění ze skupiny", "Výrazný růstový/tržní potenciál"],
      weaknesses: ["Zatím nevyzrálý v kombinační hře zády k bráně", "Málo odehraných minut na vyšší úrovni"],
    };

    const vlcekAnalytics = {
      breakdown: [
        { id: "saves", label: "Úspěšnost zákroků (Save %)", percentile: 64, tag: null, detail: "Nadprůměrná úspěšnost i proti kvalitním střelám." },
        { id: "distribution", label: "Přesnost rozehrávky nohou", percentile: 71, tag: "Rozehrávka", detail: "Nadstandardní pro brankáře — aktivně se zapojuje do stavby útoku." },
        { id: "claiming", label: "Jistota při chytání centrů", percentile: 58, tag: null, detail: "Solidní, ale s prostorem pro zlepšení proti agresivnímu presinku." },
        { id: "sweeping", label: "Zákroky mimo pokutové území", percentile: 49, tag: null, detail: "Průměrná aktivita jako 'sweeper keeper'." },
        { id: "discipline", label: "Disciplína (chyby vedoucí ke gólu)", percentile: 66, tag: null, detail: "Nízký počet vlastních chyb vedoucích ke skórovací šanci." },
      ],
      clips: [
        { id: 1, title: "Zákrok tutovky ve druhém poločase", tag: null, duration: "0:08" },
        { id: 2, title: "Přesná dlouhá rozehrávka", tag: "Rozehrávka", duration: "0:07" },
      ],
      careerHistory: [
        { id: 1, date: "2024", category: "transfer", label: "Přestup do Slavoje Karviná" },
        { id: 2, date: "2020", category: "milestone", label: "Debut v profesionálním fotbale" },
      ],
      marketHistory: [
        { year: "2024", value: 0.45, low: 0.45, high: 0.45, projected: false },
        { year: "2025", value: 0.55, low: 0.55, high: 0.55, projected: false },
        { year: "2026", value: 0.6, low: 0.6, high: 0.6, projected: false },
        { year: "2027", value: 0.6, low: 0.45, high: 0.75, projected: true },
      ],
      scoreHistoryRatios: [
        { month: "Dub 26", minutes: 810, low: 0.66, value: 0.76, high: 0.87 },
        { month: "Kvě 26", minutes: 1080, low: 0.68, value: 0.78, high: 0.88 },
        { month: "Čvn 26", minutes: 1350, low: 0.7, value: 0.8, high: 0.9 },
      ],
      matchPerformances: [62, 58, 71, 65, 60, 68, 55, 63],
      clutchData: { closeStateScore: 69, decidedStateScore: 61, closeSample: 10, decidedSample: 12 },
      injuryRisk: {
        probability: 6, horizonMonths: 6, baseline: 5,
        factors: [
          { id: "age", label: "Věk (25 let)", effect: 0, detail: "Neutrální vliv věku, typický pro brankáře v aktivní kariéře." },
          { id: "history", label: "Historie zranění (žádná evidovaná)", effect: -3, detail: "Bez evidovaných zranění v posledních 3 letech." },
        ],
      },
      similarPlayersData: [],
      physicalData: { distanceKm: 5.4, sprints: 4, topSpeedKmh: 26.1, highIntensityPct: 9 },
      technicalMetrics: { dribbleSuccessPct: 0, keyPassesPerMatch: 0.3, aerialDuelsWonPct: 62, tacklesWonPct: 0, passAccuracyPct: 79 },
      mentalProfile: { leadership: 8, composure: 9, coachability: 6, workRate: 6, note: "Velmi klidný typ, přirozeně organizuje obranu hlasem — nejzkušenější hráč skupiny." },
      strengths: ["Stabilní zákroky bez výrazné slabiny", "Aktivně se zapojuje do rozehrávky nohou", "Nejnižší riziko zranění ze skupiny"],
      weaknesses: ["Průměrná aktivita mimo pokutové území", "Starší profil s omezeným růstovým potenciálem"],
    };

const DEMO_PLAYERS = [
  { name: "Tomáš Kovář", position: "Pravý obránce", age: 21, club: "FK Ostrov Bytom", marketValue: 1.8, contractUntil: "Červen 2027", agent: "Sport Alliance Group", foot: "Pravá", height: "181 cm", minutesTracked: 1420, riskLevel: "low", scores: { pressing: 78, possession: 85, defensive: 77 }, reason: { pressing: "silný v defenzivních soubojích a rychlosti přechodu do útoku", possession: "vyniká v xT a dlouhých přihrávkách", defensive: "nejvyšší hodnocení v soubojích ze všech kandidátů" }, analytics: kovarAnalytics },
  { name: "Adam Ševčík", position: "Pravý obránce", age: 22, club: "Slavoj Karviná", marketValue: 1.4, riskLevel: "medium", scores: { pressing: 71, possession: 68, defensive: 73 }, reason: { pressing: "solidní ve všech kategoriích, žádná výrazná slabina", possession: "průměrný v progresivních akcích", defensive: "dobrá soubojovost, méně rizikový profil" }, analytics: sevcikAnalytics },
  { name: "Marek Hruška", position: "Levý obránce", age: 20, club: "FC Silesia", marketValue: 2.4, riskLevel: "low", scores: { pressing: 82, possession: 88, defensive: 74 }, reason: { pressing: "nejrychlejší přechod do útoku z celé skupiny", possession: "nejvyšší xT ze všech sledovaných obránců", defensive: "mírně slabší v defenzivních soubojích než specialisté" }, analytics: hruskaAnalytics },
  { name: "Filip Dostál", position: "Stoper", age: 23, club: "Baník Karviná B", marketValue: 0.9, riskLevel: "high", scores: { pressing: 64, possession: 60, defensive: 79 }, reason: { pressing: "spíš defenzivní typ, méně se zapojuje do přechodu", possession: "podprůměrný v rozehrávce pod tlakem", defensive: "velmi solidní v obranných soubojích za nízkou cenu" }, analytics: dostalAnalytics },
  { name: "Jakub Malý", position: "Ofenzivní záložník", age: 24, club: "Widzew Łódź", marketValue: 2.1, riskLevel: "medium", scores: { pressing: 75, possession: 80, defensive: 55 }, reason: { pressing: "aktivní v presinku, dobrý návrat do bloku", possession: "výborná kreativita a klíčové přihrávky", defensive: "slabý defenzivní přínos, čistě ofenzivní profil" }, analytics: malyAnalytics },
  { name: "David Novotný", position: "Útočník", age: 19, club: "Górnik Zabrze", marketValue: 1.1, riskLevel: "low", scores: { pressing: 70, possession: 66, defensive: 48 }, reason: { pressing: "vysoká intenzita presinku i v mladém věku", possession: "zatím nevyzrálý v kombinační hře", defensive: "očekávaně nízký defenzivní přínos u útočníka" }, analytics: novotnyAnalytics },
  { name: "Petr Vlček", position: "Brankář", age: 25, club: "Slavoj Karviná", marketValue: 0.6, riskLevel: "low", scores: { pressing: 58, possession: 62, defensive: 60 }, reason: { pressing: "dobrá hra nohama, zapojuje se do rozehrávky", possession: "solidní přesnost rozehrávky pod tlakem", defensive: "stabilní zákroky, žádná výrazná slabina" }, analytics: vlcekAnalytics },
];

async function seedIfEmpty() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users");
  if (rows[0].n > 0) {
    console.log("Databáze už obsahuje data, seedování se přeskakuje.");
    return;
  }
  console.log("Prázdná databáze — nahrávám počáteční demo data...");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // ---------- Demo uživatelé ----------
    // Hesla jsou stejná jako dřív (heslo123), hashovaná bcryptem.
    const petrHash = bcrypt.hashSync("heslo123", 10);
    const janaHash = bcrypt.hashSync("heslo123", 10);
    const { rows: userRows } = await client.query(
      `INSERT INTO users (first_name, last_name, name, email, password_hash, role, is_demo_team, verified)
       VALUES
        ('Petr', 'Novák', 'Petr Novák', 'petr@scoutos.cz', $1, 'skaut', true, true),
        ('Jana', 'Bartošová', 'Jana Bartošová', 'jana@scoutos.cz', $2, 'head_of_scouting', true, true)
       RETURNING id, email`,
      [petrHash, janaHash]
    );
    console.log("Vytvořeni demo uživatelé:", userRows.map((u) => u.email).join(", "));

    // ---------- Demo hráči (sdílená demo data, viditelná pro isDemoTeam účty) ----------
    const playerIds = [];
    for (const p of DEMO_PLAYERS) {
      const { rows } = await client.query(
        `INSERT INTO players (owner_id, is_shared_demo, name, position, age, club, market_value, contract_until, agent, foot, height, minutes_tracked, risk_level, scores, reason, analytics)
         VALUES (NULL, true, $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         RETURNING id`,
        [
          p.name, p.position, p.age, p.club || "", p.marketValue || 0, p.contractUntil || "", p.agent || "", p.foot || "", p.height || "",
          p.minutesTracked || 0, p.riskLevel || "low", JSON.stringify(p.scores), JSON.stringify(p.reason), JSON.stringify(p.analytics || {}),
        ]
      );
      playerIds.push(rows[0].id);
    }
    const kovarId = playerIds[0];

    // ---------- Demo reporty (k Tomáši Kovářovi) ----------
    await client.query(
      `INSERT INTO reports (player_id, author, match, date, recommendation) VALUES
        ($1, 'Petr Novák', 'vs. Slavoj Karviná', '12. srpna 2026', 'Doporučit'),
        ($1, 'Jana Bartošová', 'vs. FC Silesia', '3. srpna 2026', 'Sledovat dál')`,
      [kovarId]
    );

    // ---------- Demo zápasy ----------
    await client.query(
      `INSERT INTO matches (date, fixture, suggested_scout, reason, assigned_scout) VALUES
        ('6. zář 2026', 'Slavoj Karviná – FK Ostrov Bytom', 'Petr Novák', 'Nejblíž a už sledoval soupeře', 'Petr Novák'),
        ('7. zář 2026', 'Baník Karviná B – FC Silesia', 'Jana Bartošová', 'Specializace na středoevropský trh', 'Jana Bartošová'),
        ('9. zář 2026', 'Widzew Łódź – Górnik Zabrze', 'Karel Ryba', 'Jazyková znalost, blízkost', 'Karel Ryba')`
    );

    // ---------- Mapa pokrytí ----------
    const coverageData = {
      "1. liga ČR": { Brankáři: 78, Obránci: 85, Záložníci: 90, Útočníci: 82 },
      "2. liga ČR": { Brankáři: 45, Obránci: 60, Záložníci: 55, Útočníci: 40 },
      "Slovenská liga": { Brankáři: 20, Obránci: 35, Záložníci: 25, Útočníci: 15 },
      "Polská Ekstraklasa": { Brankáři: 10, Obránci: 18, Záložníci: 22, Útočníci: 12 },
    };
    for (const [league, positions] of Object.entries(coverageData)) {
      for (const [position, value] of Object.entries(positions)) {
        await client.query("INSERT INTO coverage (league, position, value) VALUES ($1,$2,$3)", [league, position, value]);
      }
    }

    // ---------- Shortlist stages ----------
    const stages = [
      ["Sledovaný", 14],
      ["Hodnocený", 9],
      ["Doporučený", 5],
      ["V jednání", 2],
      ["Uzavřeno", 3],
    ];
    let order = 0;
    for (const [stage, count] of stages) {
      await client.query("INSERT INTO shortlist_stages (stage, count, sort_order) VALUES ($1,$2,$3)", [stage, count, order++]);
    }

    await client.query("COMMIT");
    console.log("Seedování demo dat dokončeno.");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// Doplní nové/rozšířené analytické sekce (fyzická data, technické metriky, mentální
// profil, breakdown, klipy, historie...) i do databáze, která už dřív byla naseedovaná
// starší, chudší verzí dat. Běží při KAŽDÉM startu appky, ale je to bezpečné spouštět
// opakovaně (idempotentní) — jen "domerguje" JSONB sloupec `analytics` podle jména
// hráče, nic nemaže a neduplikuje.
async function upgradeDemoAnalytics() {
  for (const p of DEMO_PLAYERS) {
    await pool.query(
      `UPDATE players SET analytics = analytics || $1::jsonb WHERE name = $2 AND is_shared_demo = true`,
      [JSON.stringify(p.analytics || {}), p.name]
    );
  }
  console.log("Analytická data demo hráčů zkontrolována/aktualizována.");
}

export async function initDb() {
  await pool.query(SCHEMA_SQL);
  await seedIfEmpty();
  await upgradeDemoAnalytics();
}
