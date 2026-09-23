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

// Hráč je viditelný pro uživatele, pokud ho přímo vlastní, nebo pokud jde
// o sdílená demo data A přihlášený uživatel patří do demo týmu.
function isVisibleToUser(player, user) {
  if (player.owner_id === user.id) return true;
  if (player.is_shared_demo && user.isDemoTeam) return true;
  return false;
}

function playerRowToApi(p) {
  return {
    id: p.id,
    ownerId: p.owner_id,
    isSharedDemo: p.is_shared_demo,
    name: p.name,
    position: p.position,
    age: p.age,
    club: p.club,
    marketValue: Number(p.market_value),
    contractUntil: p.contract_until,
    agent: p.agent,
    foot: p.foot,
    height: p.height,
    minutesTracked: p.minutes_tracked,
    riskLevel: p.risk_level,
    scores: p.scores,
    reason: p.reason,
    ...(p.analytics || {}),
  };
}

// GET /api/players?category=&maxAge=&maxBudget=&style=
app.get("/api/players", async (req, res) => {
  try {
    const { category = "Vše", maxAge = 99, maxBudget = 999, style = "pressing" } = req.query;
    const { rows } = await pool.query(
      "SELECT * FROM players WHERE owner_id = $1 OR (is_shared_demo = true AND $2 = true)",
      [req.user.id, req.user.isDemoTeam]
    );
    const results = rows
      .filter((p) => (category === "Vše" ? true : categoryOf(p.position) === category))
      .filter((p) => (p.age ?? 0) <= Number(maxAge))
      .filter((p) => Number(p.market_value) <= Number(maxBudget))
      .sort((a, b) => (b.scores?.[style] ?? 0) - (a.scores?.[style] ?? 0))
      .map(playerRowToApi);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

app.post("/api/players", async (req, res) => {
  try {
    const { name, position, age, club, marketValue, contractUntil, agent, foot, height } = req.body;
    if (!name || !position) return res.status(400).json({ error: "Chybí jméno nebo pozice." });

    const scores = { pressing: 50, possession: 50, defensive: 50 };
    const reason = {
      pressing: "Zatím nejsou k dispozici žádné reporty ani statistiky.",
      possession: "Zatím nejsou k dispozici žádné reporty ani statistiky.",
      defensive: "Zatím nejsou k dispozici žádné reporty ani statistiky.",
    };

    const { rows } = await pool.query(
      `INSERT INTO players (owner_id, is_shared_demo, name, position, age, club, market_value, contract_until, agent, foot, height, minutes_tracked, risk_level, scores, reason, analytics)
       VALUES ($1,false,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,'low',$11,$12,'{}')
       RETURNING *`,
      [req.user.id, name, position, Number(age) || null, club || "", Number(marketValue) || 0, contractUntil || "", agent || "", foot || "", height || "", JSON.stringify(scores), JSON.stringify(reason)]
    );
    res.status(201).json(playerRowToApi(rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se vytvořit hráče.", detail: err.message });
  }
});

app.patch("/api/players/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [Number(req.params.id)]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    if (!isVisibleToUser(player, req.user) || (!player.owner_id && !req.user.isDemoTeam)) {
      return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
    }

    const map = { name: "name", position: "position", age: "age", club: "club", marketValue: "market_value", contractUntil: "contract_until", agent: "agent", foot: "foot", height: "height" };
    const sets = [];
    const values = [];
    let i = 1;
    for (const [bodyField, column] of Object.entries(map)) {
      if (req.body[bodyField] !== undefined) {
        let value = req.body[bodyField];
        if (bodyField === "age") value = Number(value) || null;
        if (bodyField === "marketValue") value = Number(value) || 0;
        sets.push(`${column} = $${i++}`);
        values.push(value);
      }
    }
    if (sets.length === 0) return res.json(playerRowToApi(player));
    values.push(player.id);
    const { rows: updated } = await pool.query(`UPDATE players SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, values);
    res.json(playerRowToApi(updated[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se upravit hráče.", detail: err.message });
  }
});

app.delete("/api/players/:id", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    if (!isVisibleToUser(player, req.user) || (!player.owner_id && !req.user.isDemoTeam)) {
      return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
    }
    await pool.query("DELETE FROM players WHERE id = $1", [playerId]); // reporty smažou kaskádou (ON DELETE CASCADE)
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
    if (!isVisibleToUser(player, req.user)) return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
    res.json(playerRowToApi(player));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

async function getVisiblePlayerIds(user) {
  const { rows } = await pool.query(
    "SELECT id FROM players WHERE owner_id = $1 OR (is_shared_demo = true AND $2 = true)",
    [user.id, user.isDemoTeam]
  );
  return new Set(rows.map((r) => r.id));
}

app.get("/api/reports", async (req, res) => {
  try {
    const { playerId } = req.query;
    if (playerId) {
      const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [Number(playerId)]);
      const player = rows[0];
      if (player && !isVisibleToUser(player, req.user)) {
        return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
      }
      const { rows: reports } = await pool.query("SELECT * FROM reports WHERE player_id = $1 ORDER BY id", [Number(playerId)]);
      return res.json(reports.map(reportRowToApi));
    }
    const visibleIds = [...(await getVisiblePlayerIds(req.user))];
    if (visibleIds.length === 0) return res.json([]);
    const { rows: reports } = await pool.query("SELECT * FROM reports WHERE player_id = ANY($1::int[]) ORDER BY id", [visibleIds]);
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
    if (!isVisibleToUser(player, req.user)) return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });

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

// GET /api/conflicts — dopočítané za běhu z reportů, jen z hráčů viditelných uživateli
app.get("/api/conflicts", async (req, res) => {
  try {
    const visibleIds = [...(await getVisiblePlayerIds(req.user))];
    if (visibleIds.length === 0) return res.json([]);
    const { rows: reports } = await pool.query("SELECT * FROM reports WHERE player_id = ANY($1::int[])", [visibleIds]);
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
