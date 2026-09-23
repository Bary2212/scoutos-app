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
    };

    const demoPlayers = [
      { name: "Tomáš Kovář", position: "Pravý obránce", age: 21, club: "FK Ostrov Bytom", marketValue: 1.8, contractUntil: "Červen 2027", agent: "Sport Alliance Group", foot: "Pravá", height: "181 cm", minutesTracked: 1420, riskLevel: "low", scores: { pressing: 78, possession: 85, defensive: 77 }, reason: { pressing: "silný v defenzivních soubojích a rychlosti přechodu do útoku", possession: "vyniká v xT a dlouhých přihrávkách", defensive: "nejvyšší hodnocení v soubojích ze všech kandidátů" }, analytics: kovarAnalytics },
      { name: "Adam Ševčík", position: "Pravý obránce", age: 22, club: "Slavoj Karviná", marketValue: 1.4, scores: { pressing: 71, possession: 68, defensive: 73 }, reason: { pressing: "solidní ve všech kategoriích, žádná výrazná slabina", possession: "průměrný v progresivních akcích", defensive: "dobrá soubojovost, méně rizikový profil" } },
      { name: "Marek Hruška", position: "Levý obránce", age: 20, club: "FC Silesia", marketValue: 2.4, scores: { pressing: 82, possession: 88, defensive: 74 }, reason: { pressing: "nejrychlejší přechod do útoku z celé skupiny", possession: "nejvyšší xT ze všech sledovaných obránců", defensive: "mírně slabší v defenzivních soubojích než specialisté" } },
      { name: "Filip Dostál", position: "Stoper", age: 23, club: "Baník Karviná B", marketValue: 0.9, scores: { pressing: 64, possession: 60, defensive: 79 }, reason: { pressing: "spíš defenzivní typ, méně se zapojuje do přechodu", possession: "podprůměrný v rozehrávce pod tlakem", defensive: "velmi solidní v obranných soubojích za nízkou cenu" } },
      { name: "Jakub Malý", position: "Ofenzivní záložník", age: 24, club: "Widzew Łódź", marketValue: 2.1, scores: { pressing: 75, possession: 80, defensive: 55 }, reason: { pressing: "aktivní v presinku, dobrý návrat do bloku", possession: "výborná kreativita a klíčové přihrávky", defensive: "slabý defenzivní přínos, čistě ofenzivní profil" } },
      { name: "David Novotný", position: "Útočník", age: 19, club: "Górnik Zabrze", marketValue: 1.1, scores: { pressing: 70, possession: 66, defensive: 48 }, reason: { pressing: "vysoká intenzita presinku i v mladém věku", possession: "zatím nevyzrálý v kombinační hře", defensive: "očekávaně nízký defenzivní přínos u útočníka" } },
      { name: "Petr Vlček", position: "Brankář", age: 25, club: "Slavoj Karviná", marketValue: 0.6, scores: { pressing: 58, possession: 62, defensive: 60 }, reason: { pressing: "dobrá hra nohama, zapojuje se do rozehrávky", possession: "solidní přesnost rozehrávky pod tlakem", defensive: "stabilní zákroky, žádná výrazná slabina" } },
    ];

    const playerIds = [];
    for (const p of demoPlayers) {
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

export async function initDb() {
  await pool.query(SCHEMA_SQL);
  await seedIfEmpty();
}
