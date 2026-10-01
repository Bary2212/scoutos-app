// ScoutOS backend — PostgreSQL verze. Data se ukládají do skutečné databáze
// (Render PostgreSQL), takže se při každém novém nasazení už nemažou.
// Tabulky se vytváří a naplní demo daty automaticky při startu, viz db.js.

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dns from "dns";
import { pool, initDb } from "./db.js";

// Render (free plán) má problémy se směrováním odchozích IPv6 spojení —
// způsobovalo to jak ENETUNREACH chybu ke Gmailu, tak timeouty k Brevo API.
// Tohle přinutí VŠECHNA síťová spojení v celé appce, aby vždy nejdřív zkusila IPv4.
dns.setDefaultResultOrder("ipv4first");

const JWT_SECRET = process.env.JWT_SECRET || "scoutos-dev-secret-zmen-v-produkci";

const app = express();
app.use(cors());
app.use(express.json());

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, isDemoTeam: !!user.is_demo_team },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, isDemoTeam: !!user.is_demo_team };
}

// ---------- E-MAIL — posílá se přes Brevo HTTP API (nastavuje se v proměnných prostředí) ----------
const emailConfigured = !!(process.env.BREVO_API_KEY && process.env.EMAIL_USER);

async function sendMail({ to, subject, html }) {
  if (!emailConfigured) {
    console.log(`[e-mail NEODESLÁN — chybí BREVO_API_KEY/EMAIL_USER] Pro: ${to} | Předmět: ${subject}\n${html}`);
    return;
  }
  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": process.env.BREVO_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ sender: { name: "ScoutOS", email: process.env.EMAIL_USER }, to: [{ email: to }], subject, htmlContent: html }),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Brevo API chyba (${response.status}): ${errText}`);
  }
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6místný kód
}

// ---------- AUTH ROUTY — musí být definované PŘED ochranným middlewarem níže ----------

app.post("/api/auth/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, passwordConfirm } = req.body;
    if (!firstName || !lastName || !email || !password || !passwordConfirm) {
      return res.status(400).json({ error: "Vyplň prosím všechna pole." });
    }
    if (password.length < 8) return res.status(400).json({ error: "Heslo musí mít alespoň 8 znaků." });
    if (password !== passwordConfirm) return res.status(400).json({ error: "Hesla se neshodují." });

    const existing = await pool.query("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: "Účet s tímto e-mailem už existuje." });
    }

    const verificationCode = generateCode();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hodin
    const passwordHash = bcrypt.hashSync(password, 10);
    const name = `${firstName} ${lastName}`;

    await pool.query(
      `INSERT INTO users (first_name, last_name, name, email, password_hash, role, verified, verification_code, verification_expires)
       VALUES ($1,$2,$3,$4,$5,'skaut',false,$6,$7)`,
      [firstName, lastName, name, email, passwordHash, verificationCode, verificationExpires]
    );

    try {
      await sendMail({
        to: email,
        subject: "Potvrzení účtu ScoutOS",
        html: `
          <p>Ahoj ${firstName},</p>
          <p>děkujeme za registraci do ScoutOS. Tvůj přihlašovací e-mail je <strong>${email}</strong>.</p>
          <p>Tvůj ověřovací kód je: <strong style="font-size:20px">${verificationCode}</strong></p>
          <p>Kód zadej v appce, abychom si ověřili, že e-mail je opravdu tvůj. Platí 24 hodin.</p>
        `,
      });
    } catch (mailErr) {
      console.error("Nepodařilo se odeslat ověřovací e-mail:", mailErr.message);
    }

    res.status(201).json({ message: "Účet vytvořen. Zkontroluj e-mail a zadej ověřovací kód.", email });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se vytvořit účet.", detail: err.message });
  }
});

app.post("/api/auth/verify", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Chybí e-mail nebo kód." });

    const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: "Účet nenalezen." });
    if (user.verified) return res.status(400).json({ error: "Účet už je ověřený, můžeš se rovnou přihlásit." });
    if (user.verification_code !== code) return res.status(400).json({ error: "Nesprávný kód." });
    if (Date.now() > Number(user.verification_expires)) {
      return res.status(400).json({ error: "Platnost kódu vypršela, zkus registraci znovu." });
    }

    await pool.query(
      "UPDATE users SET verified = true, verification_code = NULL, verification_expires = NULL WHERE id = $1",
      [user.id]
    );
    user.verified = true;

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se ověřit účet.", detail: err.message });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: "Chybí e-mail nebo heslo." });

    const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [email]);
    const user = rows[0];
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: "Nesprávný e-mail nebo heslo." });
    }
    if (!user.verified) {
      return res.status(403).json({ error: "Účet ještě není ověřený. Zkontroluj e-mail a zadej ověřovací kód.", needsVerification: true, email: user.email });
    }
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se přihlásit.", detail: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---------- OCHRANNÝ MIDDLEWARE — všechno pod /api definované NÍŽE už vyžaduje platný token ----------
app.use("/api", (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Chybí přihlašovací token." });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: "Neplatný nebo vypršelý token, přihlas se prosím znovu." });
  }
});

function categoryOf(position) {
  if (position === "Brankář") return "Brankáři";
  if (["Pravý obránce", "Levý obránce", "Stoper"].includes(position)) return "Obránci";
  if (["Defenzivní záložník", "Ofenzivní záložník"].includes(position)) return "Záložníci";
  return "Útočníci";
}

// Hráči jsou od verze "sdílená databáze" viditelní pro KAŽDÉHO přihlášeného scouta —
// základní identita (jméno, pozice, klub...) je společná napříč celou appkou, aby
// se stejný hráč nezakládal vícekrát. Co zůstává soukromé, je HODNOCENÍ (skóre,
// tržní odhad, riziko, rozklad, poznámky...), uložené v samostatné tabulce
// `player_evaluations`, vždy svázané s konkrétním player_id + user_id.

const EMPTY_SCORES = { pressing: 50, possession: 50, defensive: 50 };
const EMPTY_REASON = {
  pressing: "Zatím jsi tohoto hráče neohodnotil/a.",
  possession: "Zatím jsi tohoto hráče neohodnotil/a.",
  defensive: "Zatím jsi tohoto hráče neohodnotil/a.",
};

// Sloučí sdílenou identitu hráče (players) s hodnocením KONKRÉTNÍHO scouta
// (player_evaluations, nebo null, pokud ho ještě neohodnotil). `hasMyEvaluation`
// říká frontendu, jestli jde o reálná data, nebo jen neutrální výchozí hodnoty.
function playerRowToApi(p, evaluation) {
  const hasMyEvaluation = !!evaluation;
  return {
    id: p.id,
    name: p.name,
    position: p.position,
    age: p.age,
    club: p.club,
    contractUntil: p.contract_until,
    agent: p.agent,
    foot: p.foot,
    height: p.height,
    hasMyEvaluation,
    marketValue: hasMyEvaluation ? Number(evaluation.market_value) : 0,
    minutesTracked: hasMyEvaluation ? evaluation.minutes_tracked : 0,
    riskLevel: hasMyEvaluation ? evaluation.risk_level : "low",
    scores: hasMyEvaluation ? evaluation.scores : EMPTY_SCORES,
    reason: hasMyEvaluation ? evaluation.reason : EMPTY_REASON,
    ...(hasMyEvaluation ? evaluation.analytics || {} : {}),
  };
}

async function getMyEvaluation(playerId, userId) {
  const { rows } = await pool.query("SELECT * FROM player_evaluations WHERE player_id = $1 AND user_id = $2", [playerId, userId]);
  return rows[0] || null;
}

// GET /api/players?category=&maxAge=&maxBudget=&style=
app.get("/api/players", async (req, res) => {
  try {
    const { category = "Vše", maxAge = 99, maxBudget = 999, style = "pressing" } = req.query;
    const { rows: players } = await pool.query("SELECT * FROM players ORDER BY id");
    const { rows: evals } = await pool.query("SELECT * FROM player_evaluations WHERE user_id = $1", [req.user.id]);
    const evalByPlayerId = Object.fromEntries(evals.map((e) => [e.player_id, e]));

    const results = players
      .map((p) => playerRowToApi(p, evalByPlayerId[p.id]))
      .filter((p) => (category === "Vše" ? true : categoryOf(p.position) === category))
      .filter((p) => (p.age ?? 0) <= Number(maxAge))
      .filter((p) => p.marketValue <= Number(maxBudget))
      .sort((a, b) => (b.scores?.[style] ?? 0) - (a.scores?.[style] ?? 0));
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

// GET /api/players/search?name=... — napovídá existující hráče podle jména, aby
// scout před založením nového hráče zjistil, že už v databázi je (a jen si ho
// "přivlastnil" vlastním hodnocením místo duplicity).
app.get("/api/players/search", async (req, res) => {
  try {
    const name = (req.query.name || "").trim();
    if (!name) return res.json([]);
    const { rows } = await pool.query(
      "SELECT id, name, position, age, club FROM players WHERE name ILIKE $1 ORDER BY name LIMIT 6",
      [`%${name}%`]
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.name, position: r.position, age: r.age, club: r.club })));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se vyhledat hráče.", detail: err.message });
  }
});

app.post("/api/players", async (req, res) => {
  try {
    const { name, position, age, club, marketValue, contractUntil, agent, foot, height } = req.body;
    if (!name || !position) return res.status(400).json({ error: "Chybí jméno nebo pozice." });

    const { rows } = await pool.query(
      `INSERT INTO players (owner_id, is_shared_demo, name, position, age, club, contract_until, agent, foot, height)
       VALUES ($1,false,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING *`,
      [req.user.id, name, position, Number(age) || null, club || "", contractUntil || "", agent || "", foot || "", height || ""]
    );
    const player = rows[0];

    const { rows: evalRows } = await pool.query(
      `INSERT INTO player_evaluations (player_id, user_id, market_value, scores, reason)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [player.id, req.user.id, Number(marketValue) || 0, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
    );
    res.status(201).json(playerRowToApi(player, evalRows[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se vytvořit hráče.", detail: err.message });
  }
});

// POST /api/players/:id/evaluate — "přivlastní" si už existujícího sdíleného hráče
// založením vlastního (prázdného) hodnocení, pokud ho scout ještě nemá.
app.post("/api/players/:id/evaluate", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });

    const existing = await getMyEvaluation(playerId, req.user.id);
    if (existing) return res.json(playerRowToApi(player, existing));

    const { rows: evalRows } = await pool.query(
      `INSERT INTO player_evaluations (player_id, user_id, scores, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
      [playerId, req.user.id, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
    );
    res.status(201).json(playerRowToApi(player, evalRows[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se přidat hodnocení.", detail: err.message });
  }
});

app.patch("/api/players/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [Number(req.params.id)]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });

    // Základní identita je sdílená — upravit ji může kterýkoliv přihlášený scout
    // (stejně jako běžný sdílený registr), ale tržní hodnota je od teď u hodnocení.
    const map = { name: "name", position: "position", age: "age", club: "club", contractUntil: "contract_until", agent: "agent", foot: "foot", height: "height" };
    const sets = [];
    const values = [];
    let i = 1;
    for (const [bodyField, column] of Object.entries(map)) {
      if (req.body[bodyField] !== undefined) {
        let value = req.body[bodyField];
        if (bodyField === "age") value = Number(value) || null;
        sets.push(`${column} = $${i++}`);
        values.push(value);
      }
    }
    let updatedPlayer = player;
    if (sets.length > 0) {
      values.push(player.id);
      const { rows: updated } = await pool.query(`UPDATE players SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, values);
      updatedPlayer = updated[0];
    }

    // marketValue zůstává podporovaný v těle požadavku kvůli zpětné kompatibilitě
    // s formuláři, co ho posílají spolu s bio údaji — uloží se do MÉHO hodnocení.
    let evaluation = await getMyEvaluation(player.id, req.user.id);
    if (req.body.marketValue !== undefined) {
      if (!evaluation) {
        const { rows: evalRows } = await pool.query(
          `INSERT INTO player_evaluations (player_id, user_id, market_value, scores, reason) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
          [player.id, req.user.id, Number(req.body.marketValue) || 0, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
        );
        evaluation = evalRows[0];
      } else {
        const { rows: evalRows } = await pool.query(
          `UPDATE player_evaluations SET market_value = $1, updated_at = now() WHERE player_id = $2 AND user_id = $3 RETURNING *`,
          [Number(req.body.marketValue) || 0, player.id, req.user.id]
        );
        evaluation = evalRows[0];
      }
    }

    res.json(playerRowToApi(updatedPlayer, evaluation));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se upravit hráče.", detail: err.message });
  }
});

// PATCH /api/players/:id/analytics — uloží MOJE (přihlášeného scouta) ručně zadané
// statistiky (breakdown, fyzická/technická data, mentální profil, silné/slabé
// stránky, skóre, riziko...) do MÉHO řádku v player_evaluations. Pokud ještě
// neexistuje, založí se. Klíče, které nejsou v těle požadavku, zůstanou
// zachované (jsonb merge u analytiky), takže se dá zadávat/upravovat postupně.
const ANALYTICS_FIELDS = ["breakdown", "physicalData", "technicalMetrics", "mentalProfile", "strengths", "weaknesses"];
const EVAL_SCALAR_FIELDS = { marketValue: "market_value", riskLevel: "risk_level", minutesTracked: "minutes_tracked" };
const EVAL_JSON_FIELDS = { scores: "scores", reason: "reason" };

app.patch("/api/players/:id/analytics", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });

    await pool.query(
      `INSERT INTO player_evaluations (player_id, user_id, scores, reason) VALUES ($1,$2,$3,$4)
       ON CONFLICT (player_id, user_id) DO NOTHING`,
      [playerId, req.user.id, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
    );

    const analyticsPatch = {};
    for (const field of ANALYTICS_FIELDS) {
      if (req.body[field] !== undefined) analyticsPatch[field] = req.body[field];
    }

    const sets = ["updated_at = now()"];
    const values = [];
    let i = 1;
    for (const [bodyField, column] of Object.entries(EVAL_SCALAR_FIELDS)) {
      if (req.body[bodyField] !== undefined) {
        let value = req.body[bodyField];
        if (bodyField === "marketValue") value = Number(value) || 0;
        if (bodyField === "minutesTracked") value = Number(value) || 0;
        sets.push(`${column} = $${i++}`);
        values.push(value);
      }
    }
    for (const [bodyField, column] of Object.entries(EVAL_JSON_FIELDS)) {
      if (req.body[bodyField] !== undefined) {
        sets.push(`${column} = $${i++}::jsonb`);
        values.push(JSON.stringify(req.body[bodyField]));
      }
    }
    if (Object.keys(analyticsPatch).length > 0) {
      sets.push(`analytics = analytics || $${i++}::jsonb`);
      values.push(JSON.stringify(analyticsPatch));
    }

    values.push(playerId, req.user.id);
    const { rows: updated } = await pool.query(
      `UPDATE player_evaluations SET ${sets.join(", ")} WHERE player_id = $${i++} AND user_id = $${i} RETURNING *`,
      values
    );
    res.json(playerRowToApi(player, updated[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit statistiky.", detail: err.message });
  }
});

app.delete("/api/players/:id", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    // Smazat sdíleného hráče (ne jen svoje hodnocení) může jen ten, kdo ho založil —
    // jinak by jeden scout mohl smazat záznam, se kterým pracuje i jiný klub.
    if (player.owner_id !== req.user.id) {
      return res.status(403).json({ error: "Tohoto hráče může smazat jen scout, který ho založil." });
    }
    await pool.query("DELETE FROM players WHERE id = $1", [playerId]); // hodnocení i reporty smažou kaskádou (ON DELETE CASCADE)
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat hráče.", detail: err.message });
  }
});

app.get("/api/players/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [Number(req.params.id)]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    const evaluation = await getMyEvaluation(player.id, req.user.id);
    res.json(playerRowToApi(player, evaluation));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

app.get("/api/reports", async (req, res) => {
  try {
    const { playerId } = req.query;
    if (playerId) {
      const { rows: reports } = await pool.query("SELECT * FROM reports WHERE player_id = $1 ORDER BY id", [Number(playerId)]);
      return res.json(reports.map(reportRowToApi));
    }
    const { rows: reports } = await pool.query("SELECT * FROM reports ORDER BY id");
    res.json(reports.map(reportRowToApi));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst reporty.", detail: err.message });
  }
});

function reportRowToApi(r) {
  return { id: r.id, playerId: r.player_id, author: r.author, match: r.match, date: r.date, recommendation: r.recommendation, edited: r.edited };
}

app.post("/api/reports", async (req, res) => {
  try {
    const { playerId, author, match, recommendation } = req.body;
    if (!playerId || !author || !recommendation) {
      return res.status(400).json({ error: "Chybí povinná pole (playerId, author, recommendation)." });
    }
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [Number(playerId)]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });

    const date = new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
    const { rows: inserted } = await pool.query(
      "INSERT INTO reports (player_id, author, match, date, recommendation) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [Number(playerId), author, match || "", date, recommendation]
    );
    res.status(201).json(reportRowToApi(inserted[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit report.", detail: err.message });
  }
});

app.patch("/api/reports/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM reports WHERE id = $1", [Number(req.params.id)]);
    const report = rows[0];
    if (!report) return res.status(404).json({ error: "Report nenalezen." });

    const map = { author: "author", match: "match", recommendation: "recommendation" };
    const sets = [];
    const values = [];
    let i = 1;
    for (const [bodyField, column] of Object.entries(map)) {
      if (req.body[bodyField] !== undefined) {
        sets.push(`${column} = $${i++}`);
        values.push(req.body[bodyField]);
      }
    }
    sets.push(`edited = true`);
    values.push(report.id);
    const { rows: updated } = await pool.query(`UPDATE reports SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, values);
    res.json(reportRowToApi(updated[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se upravit report.", detail: err.message });
  }
});

app.delete("/api/reports/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM reports WHERE id = $1", [Number(req.params.id)]);
    if (rowCount === 0) return res.status(404).json({ error: "Report nenalezen." });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat report.", detail: err.message });
  }
});

// GET /api/conflicts — dopočítané za běhu ze všech reportů (hráči jsou teď sdílení)
app.get("/api/conflicts", async (req, res) => {
  try {
    const { rows: reports } = await pool.query("SELECT * FROM reports");
    const byPlayer = {};
    for (const r of reports) {
      if (!byPlayer[r.player_id]) byPlayer[r.player_id] = [];
      byPlayer[r.player_id].push(r);
    }
    const conflictPlayerIds = Object.entries(byPlayer).filter(([, rs]) => new Set(rs.map((r) => r.recommendation)).size > 1);
    if (conflictPlayerIds.length === 0) return res.json([]);
    const { rows: players } = await pool.query("SELECT * FROM players WHERE id = ANY($1::int[])", [conflictPlayerIds.map(([id]) => Number(id))]);
    const playerById = Object.fromEntries(players.map((p) => [p.id, p]));
    const conflicts = conflictPlayerIds.map(([playerId, rs]) => {
      const player = playerById[Number(playerId)];
      return {
        playerId: Number(playerId),
        player: player ? player.name : `Hráč #${playerId}`,
        position: player ? player.position : "",
        scouts: rs.map((r) => ({ name: r.author, recommendation: r.recommendation })),
      };
    });
    res.json(conflicts);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se dopočítat konflikty.", detail: err.message });
  }
});

function matchRowToApi(m) {
  return { id: m.id, date: m.date, fixture: m.fixture, suggestedScout: m.suggested_scout, reason: m.reason, assignedScout: m.assigned_scout };
}

app.get("/api/matches", async (req, res) => {
  try {
    if (!req.user.isDemoTeam) return res.json([]);
    const { rows } = await pool.query("SELECT * FROM matches ORDER BY id");
    res.json(rows.map(matchRowToApi));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst zápasy.", detail: err.message });
  }
});

app.patch("/api/matches/:id", async (req, res) => {
  try {
    if (!req.body.assignedScout) {
      const { rows } = await pool.query("SELECT * FROM matches WHERE id = $1", [Number(req.params.id)]);
      if (!rows[0]) return res.status(404).json({ error: "Zápas nenalezen." });
      return res.json(matchRowToApi(rows[0]));
    }
    const { rows } = await pool.query("UPDATE matches SET assigned_scout = $1 WHERE id = $2 RETURNING *", [req.body.assignedScout, Number(req.params.id)]);
    if (!rows[0]) return res.status(404).json({ error: "Zápas nenalezen." });
    res.json(matchRowToApi(rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit přiřazení.", detail: err.message });
  }
});

function eventRowToApi(e) {
  return { id: e.id, matchId: e.match_id, minute: e.minute, player: e.player_id, actionId: e.action_id, actionLabel: e.action_label, recordedAt: e.recorded_at };
}

app.get("/api/events", async (req, res) => {
  try {
    const { matchId } = req.query;
    const { rows } = matchId
      ? await pool.query("SELECT * FROM events WHERE match_id = $1 ORDER BY id", [Number(matchId)])
      : await pool.query("SELECT * FROM events ORDER BY id");
    res.json(rows.map(eventRowToApi));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst akce.", detail: err.message });
  }
});

app.post("/api/events", async (req, res) => {
  try {
    const { matchId, minute, player, actionId, actionLabel } = req.body;
    if (!matchId || minute === undefined || !player || !actionId) {
      return res.status(400).json({ error: "Chybí povinná pole (matchId, minute, player, actionId)." });
    }
    const { rows } = await pool.query(
      "INSERT INTO events (match_id, minute, player_id, action_id, action_label) VALUES ($1,$2,$3,$4,$5) RETURNING *",
      [Number(matchId), Number(minute), Number(player), actionId, actionLabel || ""]
    );
    res.status(201).json(eventRowToApi(rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit akci.", detail: err.message });
  }
});

app.delete("/api/events/:id", async (req, res) => {
  try {
    const { rowCount } = await pool.query("DELETE FROM events WHERE id = $1", [Number(req.params.id)]);
    if (rowCount === 0) return res.status(404).json({ error: "Akce nenalezena." });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat akci.", detail: err.message });
  }
});

app.get("/api/coverage", async (req, res) => {
  try {
    if (!req.user.isDemoTeam) return res.json({ leagues: [], positions: [], data: {} });
    const { rows } = await pool.query("SELECT * FROM coverage");
    const leagues = [...new Set(rows.map((r) => r.league))];
    const positions = [...new Set(rows.map((r) => r.position))];
    const data = {};
    for (const r of rows) {
      if (!data[r.league]) data[r.league] = {};
      data[r.league][r.position] = r.value;
    }
    res.json({ leagues, positions, data });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst mapu pokrytí.", detail: err.message });
  }
});

app.get("/api/shortlist-stages", async (req, res) => {
  try {
    if (!req.user.isDemoTeam) return res.json([]);
    const { rows } = await pool.query("SELECT stage, count FROM shortlist_stages ORDER BY sort_order");
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst shortlisty.", detail: err.message });
  }
});

// Render (a podobné hostingy) přidělují port dynamicky přes proměnnou PORT.
const PORT = process.env.PORT || 4000;

initDb()
  .then(() => {
    app.listen(PORT, () => console.log(`ScoutOS backend běží na portu ${PORT}`));
  })
  .catch((err) => {
    console.error("Nepodařilo se inicializovat databázi:", err);
    process.exit(1);
  });
