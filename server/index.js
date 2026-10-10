// ScoutOS backend — PostgreSQL verze. Data se ukládají do skutečné databáze
// (Render PostgreSQL), takže se při každém novém nasazení už nemažou.
// Tabulky se vytváří a naplní demo daty automaticky při startu, viz db.js.

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dns from "dns";
import crypto from "crypto";
import { pool, initDb, createClub, generateUniqueInviteCode } from "./db.js";

// Render (free plán) má problémy se směrováním odchozích IPv6 spojení —
// způsobovalo to jak ENETUNREACH chybu ke Gmailu, tak timeouty k Brevo API.
// Tohle přinutí VŠECHNA síťová spojení v celé appce, aby vždy nejdřív zkusila IPv4.
dns.setDefaultResultOrder("ipv4first");

const JWT_SECRET = process.env.JWT_SECRET || "scoutos-dev-secret-zmen-v-produkci";

const app = express();
app.use(cors());
app.use(express.json());

// Majitel appky (admin přehled) = účet, jehož e-mail je nastavený v proměnné
// prostředí ADMIN_EMAIL (na Renderu). Bez nastavené proměnné není admin nikdo —
// admin endpointy tedy bezpečně odpovídají 403 všem.
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
function isAdminEmail(email) {
  return !!ADMIN_EMAIL && String(email || "").trim().toLowerCase() === ADMIN_EMAIL;
}

function requireAdmin(req, res, next) {
  if (!isAdminEmail(req.user?.email)) return res.status(403).json({ error: "K tomuhle nemáš oprávnění." });
  next();
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, clubId: user.club_id, isDemoTeam: !!user.is_demo_team, isAdmin: isAdminEmail(user.email) },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, clubId: user.club_id, isDemoTeam: !!user.is_demo_team, isAdmin: isAdminEmail(user.email) };
}

// Smaže uživatele tak, aby se nesmazala cizí data. players.owner_id má ON DELETE
// CASCADE — kdyby se hráč, kterého uživatel založil, smazal, zmizela by i hodnocení
// ostatních skautů. Proto hráče, které hodnotí i někdo jiný, nejdřív "odpojíme" od
// vlastníka. Klub, který po smazání zůstane bez uživatelů, se smaže také.
async function deleteUserAndCleanup(userId) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query("SELECT club_id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (!rows[0]) {
      await client.query("ROLLBACK");
      return false;
    }
    const clubId = rows[0].club_id;
    await client.query(
      `UPDATE players SET owner_id = NULL
       WHERE owner_id = $1 AND id IN (SELECT player_id FROM player_evaluations WHERE user_id <> $1)`,
      [userId]
    );
    await client.query("DELETE FROM users WHERE id = $1", [userId]);
    if (clubId) {
      const { rows: left } = await client.query("SELECT 1 FROM users WHERE club_id = $1 LIMIT 1", [clubId]);
      if (left.length === 0) await client.query("DELETE FROM clubs WHERE id = $1", [clubId]);
    }
    await client.query("COMMIT");
    return true;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
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
    const { firstName, lastName, email, password, passwordConfirm, inviteCode } = req.body;
    if (!firstName || !lastName || !email || !password || !passwordConfirm) {
      return res.status(400).json({ error: "Vyplň prosím všechna pole." });
    }
    if (password.length < 8) return res.status(400).json({ error: "Heslo musí mít alespoň 8 znaků." });
    if (password !== passwordConfirm) return res.status(400).json({ error: "Hesla se neshodují." });

    const existing = await pool.query("SELECT id, verified, is_demo_team FROM users WHERE lower(email) = lower($1)", [email]);
    if (existing.rows.length > 0) {
      const old = existing.rows[0];
      // Neověřená registrace (nikdo nezadal kód) se dá založit znovu — starý, prázdný
      // účet se smaže a vznikne nový s novým kódem. Ověřený účet zůstává chráněný.
      if (old.verified || old.is_demo_team) {
        return res.status(409).json({ error: "Účet s tímto e-mailem už existuje." });
      }
      await deleteUserAndCleanup(old.id);
    }

    // Pozvánkový kód (nepovinný) → nový účet se přidá jako běžný skaut do
    // existujícího klubu. Bez kódu si uživatel založí vlastní klub a stává
    // se v něm hlavním skautem (vidí hodnocení všech skautů, které do klubu
    // později přidá pomocí svého vlastního pozvánkového kódu).
    let club = null;
    if (inviteCode && inviteCode.trim()) {
      const { rows: clubRows } = await pool.query("SELECT id, name FROM clubs WHERE invite_code = $1", [inviteCode.trim().toUpperCase()]);
      if (clubRows.length === 0) {
        return res.status(400).json({ error: "Neplatný pozvánkový kód klubu." });
      }
      club = clubRows[0];
    }

    const verificationCode = generateCode();
    const verificationExpires = Date.now() + 24 * 60 * 60 * 1000; // 24 hodin
    const passwordHash = bcrypt.hashSync(password, 10);
    const name = `${firstName} ${lastName}`;

    const { rows: insertedRows } = await pool.query(
      `INSERT INTO users (first_name, last_name, name, email, password_hash, role, club_id, verified, verification_code, verification_expires)
       VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,$9)
       RETURNING id`,
      [firstName, lastName, name, email, passwordHash, club ? "skaut" : "hlavni_skaut", club ? club.id : null, verificationCode, verificationExpires]
    );
    const newUserId = insertedRows[0].id;

    if (!club) {
      // Bez pozvánkového kódu dostane nový účet rovnou svůj vlastní klub.
      const ownClub = await createClub(pool, `Klub – ${name}`, newUserId);
      await pool.query("UPDATE users SET club_id = $1 WHERE id = $2", [ownClub.id, newUserId]);
    }

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
    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);

    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se ověřit účet.", detail: err.message });
  }
});

// Znovu odešle ověřovací kód (nový kód, platí 24 h). Odpověď je stejná i pro
// neexistující/ověřený účet, aby se přes ni nedalo zjišťovat, kdo je registrovaný.
// Limit: max. 1 odeslání za 60 s (odvozeno z verification_expires, bez nového sloupce).
app.post("/api/auth/resend-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Chybí e-mail." });

    const { rows } = await pool.query("SELECT * FROM users WHERE lower(email) = lower($1)", [String(email).trim()]);
    const user = rows[0];
    const okResponse = { message: "Pokud účet existuje a není ověřený, poslali jsme nový kód." };
    if (!user || user.verified) return res.json(okResponse);

    const DAY = 24 * 60 * 60 * 1000;
    const lastSentAt = Number(user.verification_expires) - DAY;
    if (Date.now() - lastSentAt < 60 * 1000) {
      return res.status(429).json({ error: "Kód jsme právě poslali. Počkej minutu a zkus to znovu." });
    }

    const verificationCode = generateCode();
    await pool.query("UPDATE users SET verification_code = $1, verification_expires = $2 WHERE id = $3", [
      verificationCode,
      Date.now() + DAY,
      user.id,
    ]);

    try {
      await sendMail({
        to: user.email,
        subject: "Nový ověřovací kód ScoutOS",
        html: `
          <p>Ahoj ${user.first_name || ""},</p>
          <p>tvůj nový ověřovací kód je: <strong style="font-size:20px">${verificationCode}</strong></p>
          <p>Platí 24 hodin.</p>
        `,
      });
    } catch (mailErr) {
      console.error("Nepodařilo se odeslat ověřovací e-mail:", mailErr.message);
      return res.status(502).json({ error: "E-mail se nepodařilo odeslat. Zkus to prosím později." });
    }
    res.json(okResponse);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se poslat kód.", detail: err.message });
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
    await pool.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
    const token = signToken(user);
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se přihlásit.", detail: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---------- VEŘEJNÝ (read-only) PROFIL HRÁČE — musí být PŘED ochranným middlewarem níže ----------
// Scout si na profilu hráče vygeneruje odkaz s náhodným tokenem a pošle ho
// komukoliv mimo appku (trenér, majitel klubu) — bez nutnosti účtu/přihlášení.
// Vrací stejná data jako GET /api/players/:id, ale jen pro JEDNO konkrétní
// (sdílené) hodnocení, dohledané podle tokenu, ne podle interního ID hráče.
app.get("/api/public/profile/:token", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id AS player_id, p.name, p.age, p.birth_year,
              COALESCE(e.position, p.position) AS position, COALESCE(e.club, p.club) AS club,
              COALESCE(e.league, p.league) AS league, COALESCE(e.contract_until, p.contract_until) AS contract_until,
              COALESCE(e.agent, p.agent) AS agent, COALESCE(e.foot, p.foot) AS foot, COALESCE(e.height, p.height) AS height,
              e.market_value, e.minutes_tracked, e.risk_level, e.scores, e.reason, e.analytics
       FROM player_evaluations e JOIN players p ON p.id = e.player_id
       WHERE e.share_token = $1`,
      [req.params.token]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: "Odkaz nenalezen nebo byl zrušen." });
    const player = {
      id: row.player_id,
      name: row.name,
      position: row.position,
      age: playerAge(row),
      club: row.club,
      league: row.league,
      contract_until: row.contract_until,
      agent: row.agent,
      foot: row.foot,
      height: row.height,
    };
    const evaluation = {
      market_value: row.market_value,
      minutes_tracked: row.minutes_tracked,
      risk_level: row.risk_level,
      scores: row.scores,
      reason: row.reason,
      pipeline_stage: null,
      analytics: row.analytics,
    };
    res.json(playerRowToApi(player, evaluation));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst profil.", detail: err.message });
  }
});

// ---------- OCHRANNÝ MIDDLEWARE — všechno pod /api definované NÍŽE už vyžaduje platný token ----------
app.use("/api", (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Chybí přihlašovací token." });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return res.status(401).json({ error: "Neplatný nebo vypršelý token, přihlas se prosím znovu." });
  }
  // Role a klub se berou vždy z databáze, ne z tokenu — jinak by změna role nebo
  // odebrání z klubu platily až po novém přihlášení (odebraný skaut by dál viděl
  // data původního klubu) a smazaný účet by dál fungoval do vypršení tokenu.
  pool
    .query("SELECT id, name, email, role, club_id, is_demo_team FROM users WHERE id = $1", [decoded.id])
    .then(({ rows }) => {
      const u = rows[0];
      if (!u) return res.status(401).json({ error: "Účet už neexistuje, přihlas se prosím znovu." });
      req.user = { ...decoded, name: u.name, email: u.email, role: u.role, clubId: u.club_id, isDemoTeam: !!u.is_demo_team, isAdmin: isAdminEmail(u.email) };
      next();
    })
    .catch(() => res.status(500).json({ error: "Nepodařilo se ověřit přihlášení." }));
});

// Aktuální údaje přihlášeného uživatele (role, klub) — klient si je po načtení appky obnoví.
app.get("/api/auth/me", (req, res) => {
  res.json({ id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, clubId: req.user.clubId, isDemoTeam: !!req.user.isDemoTeam, isAdmin: !!req.user.isAdmin });
});

// ---------- ADMIN PŘEHLED MAJITELE APPKY — jen pro e-mail z ADMIN_EMAIL ----------
// Do statistik se nepočítají demo účty ani neověřené registrace (ty se ukazují zvlášť).
app.get("/api/admin/overview", requireAdmin, async (req, res) => {
  try {
    const { rows: totalsRows } = await pool.query(`
      SELECT
        (SELECT COUNT(*)::int FROM users WHERE NOT is_demo_team AND verified) AS users_verified,
        (SELECT COUNT(*)::int FROM users WHERE NOT is_demo_team AND NOT verified) AS users_unverified,
        (SELECT COUNT(*)::int FROM users WHERE NOT is_demo_team AND verified AND created_at > now() - interval '7 days') AS signups_7d,
        (SELECT COUNT(*)::int FROM users WHERE NOT is_demo_team AND verified AND created_at > now() - interval '30 days') AS signups_30d,
        (SELECT COUNT(DISTINCT e.player_id)::int FROM player_evaluations e JOIN users u ON u.id = e.user_id WHERE NOT u.is_demo_team) AS players_tracked,
        (SELECT COUNT(*)::int FROM player_evaluations e JOIN users u ON u.id = e.user_id WHERE NOT u.is_demo_team) AS evaluations
    `);
    const totals = totalsRows[0];

    const { rows: clubRows } = await pool.query(`
      SELECT c.id, c.name, COALESCE(MIN(u.created_at), c.created_at) AS created_at, c.plan, c.plan_note, c.plan_updated_at,
             COUNT(u.id)::int AS scouts,
             (SELECT COUNT(*)::int FROM player_evaluations e JOIN users uu ON uu.id = e.user_id WHERE uu.club_id = c.id) AS evaluations,
             (SELECT MAX(e.updated_at) FROM player_evaluations e JOIN users uu ON uu.id = e.user_id WHERE uu.club_id = c.id) AS last_activity
      FROM clubs c
      JOIN users u ON u.club_id = c.id AND NOT u.is_demo_team AND u.verified
      GROUP BY c.id
      ORDER BY COALESCE(MIN(u.created_at), c.created_at) DESC
    `);

    const { rows: seriesRows } = await pool.query(`
      SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
             (SELECT COUNT(*)::int FROM users u
              WHERE NOT u.is_demo_team AND u.verified AND u.created_at::date = d::date) AS count
      FROM generate_series(current_date - 29, current_date, interval '1 day') d
      ORDER BY d
    `);

    const { rows: recentRows } = await pool.query(`
      SELECT u.name, u.email, u.role, u.created_at, c.name AS club_name
      FROM users u LEFT JOIN clubs c ON c.id = u.club_id
      WHERE NOT u.is_demo_team AND u.verified
      ORDER BY u.created_at DESC
      LIMIT 10
    `);

    res.json({
      totals: {
        users: totals.users_verified,
        unverifiedUsers: totals.users_unverified,
        clubs: clubRows.length,
        paidClubs: clubRows.filter((c) => c.plan === "paid").length,
        signups7d: totals.signups_7d,
        signups30d: totals.signups_30d,
        playersTracked: totals.players_tracked,
        evaluations: totals.evaluations,
      },
      signupsByDay: seriesRows.map((r) => ({ day: r.day, count: r.count })),
      clubs: clubRows.map((c) => ({
        id: c.id,
        name: c.name,
        createdAt: c.created_at,
        plan: c.plan,
        planNote: c.plan_note,
        planUpdatedAt: c.plan_updated_at,
        scouts: c.scouts,
        evaluations: c.evaluations,
        lastActivity: c.last_activity,
      })),
      recentSignups: recentRows.map((u) => ({ name: u.name, email: u.email, role: u.role, clubName: u.club_name, createdAt: u.created_at })),
    });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst admin přehled.", detail: err.message });
  }
});

// Ruční nastavení tarifu klubu (zdarma / placený) + krátká poznámka, např. číslo faktury.
app.patch("/api/admin/clubs/:id/plan", requireAdmin, async (req, res) => {
  try {
    const { plan, note } = req.body || {};
    if (!["free", "paid"].includes(plan)) return res.status(400).json({ error: "Neplatný tarif." });
    const cleanNote = typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
    const { rows } = await pool.query(
      "UPDATE clubs SET plan = $1, plan_note = $2, plan_updated_at = now() WHERE id = $3 RETURNING id, plan, plan_note, plan_updated_at",
      [plan, cleanNote, Number(req.params.id)]
    );
    if (!rows[0]) return res.status(404).json({ error: "Klub nenalezen." });
    res.json({ id: rows[0].id, plan: rows[0].plan, planNote: rows[0].plan_note, planUpdatedAt: rows[0].plan_updated_at });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit tarif.", detail: err.message });
  }
});

// ---------- ADMIN — správa hráčů ----------
// Všichni hráči v databázi (i ukázkoví a osiřelí) — majitel appky je odtud může smazat úplně.
app.get("/api/admin/players", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.position, p.club, p.age, p.birth_year, p.is_shared_demo, p.created_at,
              creator.name AS creator_name,
              (SELECT COUNT(*)::int FROM player_evaluations e WHERE e.player_id = p.id) AS evaluations,
              (SELECT COALESCE(string_agg(u.name, ', ' ORDER BY u.name), '')
                 FROM player_evaluations e JOIN users u ON u.id = e.user_id WHERE e.player_id = p.id) AS scouts
       FROM players p LEFT JOIN users creator ON creator.id = p.owner_id
       ORDER BY p.created_at DESC, p.id DESC LIMIT 3000`
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        position: r.position,
        club: r.club,
        age: playerAge(r),
        isDemo: !!r.is_shared_demo,
        creator: r.creator_name || null,
        evaluations: r.evaluations,
        scouts: r.scouts,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

// Úplné smazání hráčů (hodnocení, reporty i komentáře všech skautů se smažou s nimi).
app.post("/api/admin/players/delete", requireAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter((n) => Number.isInteger(n) && n > 0) : [];
    if (ids.length === 0) return res.status(400).json({ error: "Nevybral jsi žádné hráče." });
    if (ids.length > 500) return res.status(400).json({ error: "Najednou jde smazat nejvýš 500 hráčů." });
    const { rowCount } = await pool.query("DELETE FROM players WHERE id = ANY($1::int[])", [ids]);
    res.json({ deleted: rowCount });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat hráče.", detail: err.message });
  }
});

// ---------- ADMIN — správa uživatelů ----------
function adminUserRow(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    verified: u.verified,
    isDemo: !!u.is_demo_team,
    isSelf: false,
    clubId: u.club_id,
    clubName: u.club_name,
    clubPlan: u.club_plan,
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    evaluations: u.evaluations,
  };
}

async function loadAdminUser(id) {
  const { rows } = await pool.query(
    `SELECT u.*, c.name AS club_name, c.plan AS club_plan,
            (SELECT COUNT(*)::int FROM player_evaluations e WHERE e.user_id = u.id) AS evaluations
     FROM users u LEFT JOIN clubs c ON c.id = u.club_id WHERE u.id = $1`,
    [id]
  );
  return rows[0] || null;
}

app.get("/api/admin/users", requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.*, c.name AS club_name, c.plan AS club_plan,
              (SELECT COUNT(*)::int FROM player_evaluations e WHERE e.user_id = u.id) AS evaluations
       FROM users u LEFT JOIN clubs c ON c.id = u.club_id
       ORDER BY u.created_at DESC LIMIT 2000`
    );
    res.json(rows.map((u) => ({ ...adminUserRow(u), isSelf: u.id === req.user.id })));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst uživatele.", detail: err.message });
  }
});

// Úprava jména, e-mailu a role.
app.patch("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await loadAdminUser(id);
    if (!user) return res.status(404).json({ error: "Uživatel nenalezen." });

    const updates = [];
    const values = [];
    const push = (col, val) => {
      values.push(val);
      updates.push(`${col} = $${values.length}`);
    };

    if (req.body.name !== undefined) {
      const name = String(req.body.name).trim().slice(0, 120);
      if (!name) return res.status(400).json({ error: "Jméno nesmí být prázdné." });
      const [first, ...rest] = name.split(/\s+/);
      push("name", name);
      push("first_name", first);
      push("last_name", rest.join(" "));
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: "Neplatný e-mail." });
      if (email.toLowerCase() !== String(user.email).toLowerCase()) {
        if (isAdminEmail(user.email)) {
          return res.status(400).json({ error: "E-mail admin účtu se tu měnit nedá (je vázaný na ADMIN_EMAIL na Renderu)." });
        }
        const dup = await pool.query("SELECT 1 FROM users WHERE lower(email) = lower($1) AND id <> $2", [email, id]);
        if (dup.rows.length > 0) return res.status(409).json({ error: "Tenhle e-mail už používá jiný účet." });
      }
      push("email", email);
    }
    if (req.body.role !== undefined) {
      if (!["skaut", "hlavni_skaut"].includes(req.body.role)) return res.status(400).json({ error: "Neplatná role." });
      push("role", req.body.role);
    }
    if (updates.length === 0) return res.status(400).json({ error: "Není co měnit." });

    values.push(id);
    await pool.query(`UPDATE users SET ${updates.join(", ")} WHERE id = $${values.length}`, values);
    res.json({ ...adminUserRow(await loadAdminUser(id)), isSelf: id === req.user.id });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit změny.", detail: err.message });
  }
});

// Ruční ověření e-mailu (když kód nedorazil).
app.post("/api/admin/users/:id/verify", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await loadAdminUser(id);
    if (!user) return res.status(404).json({ error: "Uživatel nenalezen." });
    await pool.query("UPDATE users SET verified = true, verification_code = NULL, verification_expires = NULL WHERE id = $1", [id]);
    res.json({ ...adminUserRow(await loadAdminUser(id)), isSelf: id === req.user.id });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se ověřit účet.", detail: err.message });
  }
});

// Znovu pošle ověřovací kód (bez limitu — admin).
app.post("/api/admin/users/:id/resend-code", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await loadAdminUser(id);
    if (!user) return res.status(404).json({ error: "Uživatel nenalezen." });
    if (user.verified) return res.status(400).json({ error: "Účet už je ověřený." });
    const code = generateCode();
    await pool.query("UPDATE users SET verification_code = $1, verification_expires = $2 WHERE id = $3", [code, Date.now() + 24 * 60 * 60 * 1000, id]);
    try {
      await sendMail({
        to: user.email,
        subject: "Nový ověřovací kód ScoutOS",
        html: `<p>Ahoj ${user.first_name || ""},</p><p>tvůj nový ověřovací kód je: <strong style="font-size:20px">${code}</strong></p><p>Platí 24 hodin.</p>`,
      });
    } catch (mailErr) {
      console.error("Nepodařilo se odeslat ověřovací e-mail:", mailErr.message);
      return res.status(502).json({ error: `E-mail se nepodařilo odeslat: ${mailErr.message}` });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se poslat kód.", detail: err.message });
  }
});

// Nastaví nové heslo. Bez zadaného hesla se vygeneruje náhodné a vrátí se jednou v odpovědi.
app.post("/api/admin/users/:id/reset-password", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await loadAdminUser(id);
    if (!user) return res.status(404).json({ error: "Uživatel nenalezen." });
    if (user.is_demo_team) return res.status(400).json({ error: "Heslo demo účtu se měnit nedá." });
    let password = typeof req.body.password === "string" ? req.body.password : "";
    if (password && password.length < 8) return res.status(400).json({ error: "Heslo musí mít alespoň 8 znaků." });
    const generated = !password;
    if (generated) password = crypto.randomBytes(9).toString("base64url");
    await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [bcrypt.hashSync(password, 10), id]);
    res.json({ ok: true, password: generated ? password : undefined });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se změnit heslo.", detail: err.message });
  }
});

// Smazání uživatele (i s jeho hodnoceními). Vlastní účet admina a demo účty chráníme.
app.delete("/api/admin/users/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const user = await loadAdminUser(id);
    if (!user) return res.status(404).json({ error: "Uživatel nenalezen." });
    if (id === req.user.id || isAdminEmail(user.email)) return res.status(400).json({ error: "Vlastní admin účet smazat nejde." });
    if (user.is_demo_team) return res.status(400).json({ error: "Demo účty se mazat nedají." });
    await deleteUserAndCleanup(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat uživatele.", detail: err.message });
  }
});

// Hromadný úklid: smaže neověřené registrace starší než N dní (výchozí 7).
app.post("/api/admin/cleanup-unverified", requireAdmin, async (req, res) => {
  try {
    const days = Math.max(0, Math.min(365, Number(req.body?.days ?? 7)));
    const { rows } = await pool.query(
      `SELECT id, email FROM users
       WHERE NOT verified AND NOT is_demo_team AND created_at < now() - ($1 || ' days')::interval`,
      [String(days)]
    );
    let deleted = 0;
    for (const u of rows) {
      if (isAdminEmail(u.email)) continue;
      if (await deleteUserAndCleanup(u.id)) deleted += 1;
    }
    res.json({ deleted });
  } catch (err) {
    res.status(500).json({ error: "Úklid se nepovedl.", detail: err.message });
  }
});

// Přejmenování klubu.
app.patch("/api/admin/clubs/:id", requireAdmin, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: "Název klubu nesmí být prázdný." });
    const { rowCount } = await pool.query("UPDATE clubs SET name = $1 WHERE id = $2", [name, Number(req.params.id)]);
    if (rowCount === 0) return res.status(404).json({ error: "Klub nenalezen." });
    res.json({ ok: true, name });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se přejmenovat klub.", detail: err.message });
  }
});

// ---------- KLUB — role a oprávnění ----------
// Hlavní skaut vidí a řídí celý svůj klub (pozvánkový kód, seznam skautů,
// jejich odebrání). Běžný skaut vidí jen název klubu, do kterého patří.
app.get("/api/club", async (req, res) => {
  try {
    const { rows: clubRows } = await pool.query("SELECT id, name, invite_code FROM clubs WHERE id = $1", [req.user.clubId]);
    const club = clubRows[0];
    if (!club) return res.status(404).json({ error: "Klub nenalezen." });

    const isHead = req.user.role === "hlavni_skaut";
    const result = { id: club.id, name: club.name, myRole: req.user.role };

    if (isHead) {
      result.inviteCode = club.invite_code;
      const { rows: scouts } = await pool.query(
        `SELECT u.id, u.name, u.email, u.role,
                (SELECT COUNT(*)::int FROM player_evaluations e WHERE e.user_id = u.id) AS evaluated_count
         FROM users u WHERE u.club_id = $1 ORDER BY (u.role = 'hlavni_skaut') DESC, u.name`,
        [club.id]
      );
      result.scouts = scouts.map((s) => ({ id: s.id, name: s.name, email: s.email, role: s.role, evaluatedCount: s.evaluated_count }));

      // Přehled hráčů, které kdokoli z klubu ohodnotil / sleduje (jen hlavní skaut, jen jeho klub).
      const { rows: evals } = await pool.query(
        `SELECT p.id AS player_id, p.name AS player_name, COALESCE(e.position, p.position) AS position, COALESCE(e.club, p.club) AS player_club,
                u.id AS user_id, u.name AS scout_name,
                e.pipeline_stage, e.scores, e.analytics, e.updated_at
         FROM player_evaluations e
         JOIN users u ON u.id = e.user_id
         JOIN players p ON p.id = e.player_id
         WHERE u.club_id = $1
         ORDER BY p.name, u.name`,
        [club.id]
      );
      const byPlayer = new Map();
      for (const r of evals) {
        if (!byPlayer.has(r.player_id)) {
          byPlayer.set(r.player_id, { id: r.player_id, name: r.player_name, position: r.position, club: r.player_club, evaluations: [] });
        }
        const sc = scoresFromAnalytics(r.analytics, r.scores) || {};
        const vals = [sc.pressing, sc.possession, sc.defensive].map(Number).filter(Number.isFinite);
        byPlayer.get(r.player_id).evaluations.push({
          userId: r.user_id,
          scoutName: r.scout_name,
          stage: r.pipeline_stage || null,
          score: vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null,
          updatedAt: r.updated_at,
        });
      }
      result.players = [...byPlayer.values()];
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst klub.", detail: err.message });
  }
});

app.post("/api/club/regenerate-invite", async (req, res) => {
  try {
    if (req.user.role !== "hlavni_skaut") return res.status(403).json({ error: "Jen hlavní skaut může obnovit pozvánkový kód." });
    const inviteCode = await generateUniqueInviteCode(pool);
    await pool.query("UPDATE clubs SET invite_code = $1 WHERE id = $2", [inviteCode, req.user.clubId]);
    res.json({ inviteCode });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se obnovit pozvánkový kód.", detail: err.message });
  }
});

// Přejmenování klubu hlavním skautem.
app.patch("/api/club", async (req, res) => {
  try {
    if (req.user.role !== "hlavni_skaut") return res.status(403).json({ error: "Jen hlavní skaut může přejmenovat klub." });
    const name = String(req.body?.name || "").trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: "Název klubu nesmí být prázdný." });
    await pool.query("UPDATE clubs SET name = $1 WHERE id = $2", [name, req.user.clubId]);
    res.json({ name });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se přejmenovat klub.", detail: err.message });
  }
});

// Změna role člena klubu (povýšení na hlavního skauta / návrat na běžného skauta).
// V klubu musí vždy zůstat aspoň jeden hlavní skaut.
app.patch("/api/club/scouts/:userId", async (req, res) => {
  try {
    if (req.user.role !== "hlavni_skaut") return res.status(403).json({ error: "Jen hlavní skaut může měnit role." });
    const role = req.body?.role;
    if (role !== "hlavni_skaut" && role !== "skaut") return res.status(400).json({ error: "Neplatná role." });
    const targetId = Number(req.params.userId);

    const { rows } = await pool.query("SELECT id, role, club_id FROM users WHERE id = $1", [targetId]);
    const target = rows[0];
    if (!target || target.club_id !== req.user.clubId) return res.status(404).json({ error: "Skaut v tomto klubu nenalezen." });

    if (role === "skaut" && target.role === "hlavni_skaut") {
      const { rows: heads } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE club_id = $1 AND role = 'hlavni_skaut'", [req.user.clubId]);
      if (heads[0].n <= 1) return res.status(400).json({ error: "V klubu musí zůstat aspoň jeden hlavní skaut." });
    }
    await pool.query("UPDATE users SET role = $1 WHERE id = $2", [role, targetId]);
    res.json({ id: targetId, role });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se změnit roli.", detail: err.message });
  }
});

app.delete("/api/club/scouts/:userId", async (req, res) => {
  try {
    if (req.user.role !== "hlavni_skaut") return res.status(403).json({ error: "Jen hlavní skaut může odebírat skauty z klubu." });
    const targetId = Number(req.params.userId);
    if (targetId === req.user.id) return res.status(400).json({ error: "Sám sebe z klubu odebrat nemůžeš." });

    const { rows } = await pool.query("SELECT id, name, club_id FROM users WHERE id = $1", [targetId]);
    const target = rows[0];
    if (!target || target.club_id !== req.user.clubId) return res.status(404).json({ error: "Skaut v tomto klubu nenalezen." });

    // Odebraný skaut nezůstává bez klubu — dostane vlastní nový klub (stejně
    // jako při registraci bez pozvánkového kódu), aby o svá hodnocení nepřišel.
    const ownClub = await createClub(pool, `Klub – ${target.name}`, target.id);
    await pool.query("UPDATE users SET club_id = $1, role = 'hlavni_skaut' WHERE id = $2", [ownClub.id, target.id]);
    res.json({ message: "Skaut byl odebrán z klubu." });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se odebrat skauta.", detail: err.message });
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
// Základní údaje sdíleného hráče smí měnit jen ten, kdo hráče založil (a admin).
// Demo hráči (bez vlastníka) smí upravovat demo tým. Ostatní jen svoje hodnocení.
function canEditPlayerIdentity(player, user) {
  if (!user) return false;
  if (player.owner_id === user.id) return true;
  if (user.isAdmin) return true;
  return player.owner_id == null && !!user.isDemoTeam;
}

// Až tři nejlépe hodnocené metriky hráče (hodnocení 6/10 a víc) pro PDF export shortlistu.
function topMetricsFromBreakdown(breakdown) {
  if (!Array.isArray(breakdown)) return [];
  return breakdown
    .filter((m) => typeof m?.label === "string" && Number.isFinite(Number(m.percentile)))
    .map((m) => ({ label: m.label, rating: Math.max(1, Math.min(10, Math.round(Number(m.percentile) / 10))), percentile: Number(m.percentile) }))
    .filter((m) => m.rating >= 6)
    .sort((a, b) => b.percentile - a.percentile)
    .slice(0, 3)
    .map(({ label, rating }) => ({ label, rating }));
}

// Věk hráče: pokud známe rok narození, dopočítá se (a sám stárne); jinak záložní uložený věk.
function playerAge(row) {
  if (row?.birth_year) return new Date().getFullYear() - Number(row.birth_year);
  return row?.age ?? null;
}

// Rok narození z formuláře (4 číslice, rozumný rozsah) nebo null.
function parseBirthYear(value) {
  const y = Number(value);
  const now = new Date().getFullYear();
  return Number.isInteger(y) && y >= now - 60 && y <= now - 5 ? y : null;
}

// Částka z formuláře: akceptuje "1,5", "1.5" i "1 500" (česká čárka a mezery).
function parseMoney(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? "").replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

// Skóre hráče s ručně zadanými metrikami — stejný vzorec jako v src/lib/playerScore.js
// (zeslabený průměr percentilů). Dřív zůstávalo uložené skóre na výchozích 50, takže
// Vyhledávání, Shortlist a Radar ukazovaly jiné číslo než profil hráče.
function manualScoreFromBreakdown(breakdown) {
  if (!Array.isArray(breakdown) || breakdown.length === 0) return null;
  const sum = breakdown.reduce((acc, s) => acc + Number(s.percentile || 0), 0);
  return Math.max(0, Math.min(100, Math.round((62 * 3 + sum) / (3 + breakdown.length))));
}

function scoresFromAnalytics(analytics, storedScores) {
  if (!analytics || analytics.styleContributions) return storedScores;
  const s = manualScoreFromBreakdown(analytics.breakdown);
  return s === null ? storedScores : { pressing: s, possession: s, defensive: s };
}

function playerRowToApi(p, evaluation, viewer) {
  const hasMyEvaluation = !!evaluation;
  return {
    ...(viewer ? { canEditIdentity: canEditPlayerIdentity(p, viewer) } : {}),
    id: p.id,
    name: p.name,
    // Měnící se údaje: moje vlastní hodnota (z mého hodnocení), jinak výchozí ze sdíleného hráče.
    position: evaluation?.position ?? p.position,
    age: playerAge(p),
    birthYear: p.birth_year ?? null,
    club: evaluation?.club ?? p.club,
    league: evaluation?.league ?? p.league ?? "",
    contractUntil: evaluation?.contract_until ?? p.contract_until,
    agent: evaluation?.agent ?? p.agent,
    foot: evaluation?.foot ?? p.foot,
    height: evaluation?.height ?? p.height,
    hasMyEvaluation,
    marketValue: hasMyEvaluation ? Number(evaluation.market_value) : 0,
    minutesTracked: hasMyEvaluation ? evaluation.minutes_tracked : 0,
    riskLevel: hasMyEvaluation ? evaluation.risk_level : "low",
    scores: hasMyEvaluation ? scoresFromAnalytics(evaluation.analytics, evaluation.scores) : EMPTY_SCORES,
    reason: hasMyEvaluation ? evaluation.reason : EMPTY_REASON,
    pipelineStage: hasMyEvaluation ? evaluation.pipeline_stage : null,
    ...(hasMyEvaluation ? evaluation.analytics || {} : {}),
  };
}

// Pořadí fází shortlist kanbanu — používá se při řazení sloupců i jako
// whitelist platných hodnot pro PATCH /api/players/:id/stage.
const PIPELINE_STAGES = ["Sledovaný", "Hodnocený", "Doporučený", "V jednání", "Uzavřeno"];

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

    // Ukázkoví hráči (seed pro demo) patří jen demo týmu. Skuteční uživatelé je nevidí,
    // pokud si je sami neohodnotili (pak jdou odebrat tlačítkem „Odebrat hráče“).
    const results = players
      .filter((p) => !p.is_shared_demo || req.user.isDemoTeam || evalByPlayerId[p.id])
      .map((p) => playerRowToApi(p, evalByPlayerId[p.id], req.user))
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
      "SELECT id, name, position, age, birth_year, club FROM players WHERE name ILIKE $1 AND (is_shared_demo = false OR $2::boolean) ORDER BY name LIMIT 6",
      [`%${name}%`, !!req.user.isDemoTeam]
    );
    res.json(rows.map((r) => ({ id: r.id, name: r.name, position: r.position, age: playerAge(r), club: r.club })));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se vyhledat hráče.", detail: err.message });
  }
});

app.post("/api/players", async (req, res) => {
  try {
    const { name, position, age, birthYear, club, league, marketValue, contractUntil, agent, foot, height } = req.body;
    if (!name || !position) return res.status(400).json({ error: "Chybí jméno nebo pozice." });
    const by = parseBirthYear(birthYear);
    const ageValue = by ? new Date().getFullYear() - by : Number(age) || null;

    const { rows } = await pool.query(
      `INSERT INTO players (owner_id, is_shared_demo, name, position, age, birth_year, club, contract_until, agent, foot, height, league)
       VALUES ($1,false,$2,$3,$4,$10,$5,$6,$7,$8,$9,$11)
       RETURNING *`,
      [req.user.id, name, position, ageValue, club || "", contractUntil || "", agent || "", foot || "", height || "", by, String(league || "").trim().slice(0, 80)]
    );
    const player = rows[0];

    const { rows: evalRows } = await pool.query(
      `INSERT INTO player_evaluations (player_id, user_id, market_value, scores, reason)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [player.id, req.user.id, parseMoney(marketValue), JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
    );
    res.status(201).json(playerRowToApi(player, evalRows[0], req.user));
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
    if (existing) return res.json(playerRowToApi(player, existing, req.user));
    if (player.is_shared_demo && !req.user.isDemoTeam) return res.status(404).json({ error: "Hráč nenalezen." });

    const { rows: evalRows } = await pool.query(
      `INSERT INTO player_evaluations (player_id, user_id, scores, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
      [playerId, req.user.id, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
    );
    res.status(201).json(playerRowToApi(player, evalRows[0], req.user));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se přidat hodnocení.", detail: err.message });
  }
});

// GET /api/players/:id/similar — skutečně dopočítané ze SDÍLENÉ databáze: porovná
// rozklad skóre (breakdown) tohoto hráče s rozklady ostatních hráčů stejné pozicové
// kategorie, které jsem SÁM už ohodnotil (soukromá data jiných scoutů do toho
// logicky nevstupují). Podobnost = 100 mínus průměrný rozdíl percentilů u společných
// metrik. Nahrazuje dřívější natvrdo zadaná demo data.
app.get("/api/players/:id/similar", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { rows: baseRows } = await pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
    const basePlayer = baseRows[0];
    if (!basePlayer) return res.status(404).json({ error: "Hráč nenalezen." });

    const baseEval = await getMyEvaluation(playerId, req.user.id);
    const baseBreakdown = baseEval?.analytics?.breakdown || [];
    if (baseBreakdown.length === 0) return res.json([]);

    const baseCategory = categoryOf(baseEval?.position ?? basePlayer.position);
    const { rows: candidates } = await pool.query(
      `SELECT p.*, COALESCE(e.position, p.position) AS position, e.market_value, e.risk_level, e.scores, e.analytics
       FROM players p
       JOIN player_evaluations e ON e.player_id = p.id AND e.user_id = $1
       WHERE p.id != $2`,
      [req.user.id, playerId]
    );

    const scored = candidates
      .filter((c) => categoryOf(c.position) === baseCategory)
      .map((c) => {
        const candidateBreakdown = c.analytics?.breakdown || [];
        const candidateById = Object.fromEntries(candidateBreakdown.map((s) => [s.id, s]));
        const commonIds = baseBreakdown.map((s) => s.id).filter((id) => candidateById[id] !== undefined);
        if (commonIds.length === 0) return null;

        const avgDiff =
          commonIds.reduce((sum, id) => {
            const baseStat = baseBreakdown.find((s) => s.id === id);
            return sum + Math.abs(baseStat.percentile - candidateById[id].percentile);
          }, 0) / commonIds.length;
        const similarity = Math.max(0, Math.round(100 - avgDiff));

        const score = c.scores?.pressing ?? EMPTY_SCORES.pressing;

        const metrics = Object.fromEntries(candidateBreakdown.map((s) => [s.id, s.percentile]));
        const marketValue = Number(c.market_value) || 0;
        const baseMarketValue = baseEval ? Number(baseEval.market_value) || 0 : 0;
        const delta = marketValue - baseMarketValue;
        const priceDelta = `${delta >= 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)}M €`;

        return {
          id: c.id,
          name: c.name,
          similarity,
          priceDelta,
          age: playerAge(c),
          marketValue: `${marketValue.toFixed(1)}M €`,
          score,
          risk: c.risk_level || "low",
          metrics,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    res.json(scored);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se dopočítat podobné hráče.", detail: err.message });
  }
});

app.patch("/api/players/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [Number(req.params.id)]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });

    // Sdílená je jen neměnná identita (jméno, rok narození) — tu smí upravit jen ten, kdo
    // hráče založil, ať jeden klub nepřepisuje záznam, který používají ostatní.
    const sets = [];
    const values = [];
    let i = 1;
    if (canEditPlayerIdentity(player, req.user)) {
      if (req.body.name !== undefined && String(req.body.name).trim()) {
        sets.push(`name = $${i++}`);
        values.push(String(req.body.name).trim());
      }
      // Prázdný rok narození nesmí smazat už známý věk (starší hráči ho mají jen jako věk).
      if (req.body.birthYear !== undefined && parseBirthYear(req.body.birthYear) === null && player.age && req.body.age === undefined) {
        delete req.body.birthYear;
      }
      // Rok narození má přednost před ručně zadaným věkem; věk se z něj dopočítá.
      if (req.body.birthYear !== undefined) {
        const by = parseBirthYear(req.body.birthYear);
        sets.push(`age = $${i++}`);
        values.push(by ? new Date().getFullYear() - by : null);
        sets.push(`birth_year = $${i++}`);
        values.push(by);
      } else if (req.body.age !== undefined) {
        const a = Number(req.body.age) || null;
        sets.push(`age = $${i++}`);
        values.push(a);
        sets.push(`birth_year = $${i++}`);
        values.push(a ? new Date().getFullYear() - a : null);
      }
    }
    let updatedPlayer = player;
    if (sets.length > 0) {
      values.push(player.id);
      const { rows: updated } = await pool.query(`UPDATE players SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`, values);
      updatedPlayer = updated[0];
    }

    // Měnící se údaje (klub, liga, pozice, kontrakt, agent, noha, výška) a tržní hodnota
    // jsou SOUKROMÉ — ukládají se do mého hodnocení, ostatním klubům nic nepřepíšou.
    const BIO_FIELDS = { position: "position", club: "club", league: "league", contractUntil: "contract_until", agent: "agent", foot: "foot", height: "height" };
    const evSets = [];
    const evValues = [];
    let j = 1;
    for (const [bodyField, column] of Object.entries(BIO_FIELDS)) {
      if (req.body[bodyField] !== undefined) {
        const max = bodyField === "league" ? 80 : 200;
        evSets.push(`${column} = $${j++}`);
        evValues.push(String(req.body[bodyField] ?? "").trim().slice(0, max));
      }
    }
    if (req.body.marketValue !== undefined) {
      evSets.push(`market_value = $${j++}`);
      evValues.push(parseMoney(req.body.marketValue));
    }

    let evaluation = await getMyEvaluation(player.id, req.user.id);
    if (evSets.length > 0) {
      if (!evaluation) {
        await pool.query(
          `INSERT INTO player_evaluations (player_id, user_id, scores, reason) VALUES ($1,$2,$3,$4) ON CONFLICT (player_id, user_id) DO NOTHING`,
          [player.id, req.user.id, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
        );
      }
      evValues.push(player.id, req.user.id);
      const { rows: evalRows } = await pool.query(
        `UPDATE player_evaluations SET ${evSets.join(", ")}, updated_at = now() WHERE player_id = $${j} AND user_id = $${j + 1} RETURNING *`,
        evValues
      );
      evaluation = evalRows[0];
    }

    res.json(playerRowToApi(updatedPlayer, evaluation, req.user));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se upravit hráče.", detail: err.message });
  }
});

// PATCH /api/players/:id/analytics — uloží MOJE (přihlášeného scouta) ručně zadané
// statistiky (breakdown, fyzická/technická data, mentální profil, silné/slabé
// stránky, skóre, riziko...) do MÉHO řádku v player_evaluations. Pokud ještě
// neexistuje, založí se. Klíče, které nejsou v těle požadavku, zůstanou
// zachované (jsonb merge u analytiky), takže se dá zadávat/upravovat postupně.
const ANALYTICS_FIELDS = ["breakdown", "physicalData", "technicalMetrics", "mentalProfile", "strengths", "weaknesses", "careerHistory", "clips"];
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
        if (bodyField === "marketValue") value = parseMoney(value);
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

    // Po změně metrik přepočítáme uložené skóre, aby ho viděly i ostatní stránky.
    if (analyticsPatch.breakdown !== undefined && req.body.scores === undefined) {
      const newScore = manualScoreFromBreakdown(analyticsPatch.breakdown);
      const s = newScore === null ? EMPTY_SCORES : { pressing: newScore, possession: newScore, defensive: newScore };
      sets.push(`scores = $${i++}::jsonb`);
      values.push(JSON.stringify(s));
    }

    values.push(playerId, req.user.id);
    const { rows: updated } = await pool.query(
      `UPDATE player_evaluations SET ${sets.join(", ")} WHERE player_id = $${i++} AND user_id = $${i} RETURNING *`,
      values
    );
    res.json(playerRowToApi(player, updated[0], req.user));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit statistiky.", detail: err.message });
  }
});

// "Smazat hráče" odebere hráče jen z MÉHO pohledu: smaže moje hodnocení, moje reporty
// a moje komentáře. Sdílený záznam hráče se smaže úplně, až když k němu už nikdo
// jiný nic nemá — jinak by zmizela data ostatních skautů a klubů.
app.delete("/api/players/:id", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [playerId]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });

    const mine = await getMyEvaluation(playerId, req.user.id);
    if (!mine && player.owner_id !== req.user.id) {
      return res.status(404).json({ error: "Tohoto hráče nemáš ve svém seznamu." });
    }

    await pool.query("DELETE FROM player_evaluations WHERE player_id = $1 AND user_id = $2", [playerId, req.user.id]);
    await pool.query("DELETE FROM reports WHERE player_id = $1 AND user_id = $2", [playerId, req.user.id]);
    await pool.query("DELETE FROM player_comments WHERE player_id = $1 AND user_id = $2", [playerId, req.user.id]);

    const { rows: left } = await pool.query(
      `SELECT (SELECT COUNT(*) FROM player_evaluations WHERE player_id = $1)
            + (SELECT COUNT(*) FROM reports WHERE player_id = $1)
            + (SELECT COUNT(*) FROM player_comments WHERE player_id = $1) AS n`,
      [playerId]
    );
    const recordDeleted = Number(left[0].n) === 0;
    if (recordDeleted) await pool.query("DELETE FROM players WHERE id = $1", [playerId]);
    res.json({ deleted: true, recordDeleted });
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
    if (player.is_shared_demo && !req.user.isDemoTeam && !evaluation) return res.status(404).json({ error: "Hráč nenalezen." });
    res.json(playerRowToApi(player, evaluation, req.user));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

// Hodnocení hráče ostatními skauty klubu — vidí jen hlavní skaut (dohled nad
// prací celého klubu). Běžný skaut dostane zpět jen svoje vlastní hodnocení.
app.get("/api/players/:id/evaluations", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    if (req.user.role !== "hlavni_skaut") {
      const own = await getMyEvaluation(playerId, req.user.id);
      return res.json(own ? [{ userId: req.user.id, scoutName: req.user.name, isMe: true, ...evaluationToApi(own) }] : []);
    }
    const { rows } = await pool.query(
      `SELECT u.id AS user_id, u.name AS scout_name, e.market_value, e.risk_level, e.scores, e.reason, e.updated_at, e.analytics
       FROM player_evaluations e
       JOIN users u ON u.id = e.user_id
       WHERE e.player_id = $1 AND u.club_id = $2
       ORDER BY (u.id = $3) DESC, u.name`,
      [playerId, req.user.clubId, req.user.id]
    );
    res.json(
      rows.map((r) => ({
        userId: r.user_id,
        scoutName: r.scout_name,
        isMe: r.user_id === req.user.id,
        marketValue: Number(r.market_value),
        riskLevel: r.risk_level,
        scores: scoresFromAnalytics(r.analytics, r.scores),
        reason: r.reason,
        updatedAt: r.updated_at,
        breakdown: Array.isArray(r.analytics?.breakdown)
          ? r.analytics.breakdown.map((m) => ({ id: m.id, label: m.label, percentile: Number(m.percentile) }))
          : [],
      }))
    );
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hodnocení skautů.", detail: err.message });
  }
});

function evaluationToApi(e) {
  return { marketValue: Number(e.market_value), riskLevel: e.risk_level, scores: e.scores, reason: e.reason, updatedAt: e.updated_at };
}

// Viditelnost reportů: vlastní + reporty skautů ze stejného klubu. Starší reporty
// bez vazby na uživatele (user_id NULL) vidí jen demo tým.
function visibleReports(req) {
  const demo = req.user.isDemoTeam ? " OR r.user_id IS NULL" : "";
  return {
    sql: `(r.user_id = $1 OR r.user_id IN (SELECT id FROM users WHERE club_id = $2)${demo})`,
    params: [req.user.id, req.user.clubId ?? null],
  };
}

app.get("/api/reports", async (req, res) => {
  try {
    const { playerId } = req.query;
    const { sql, params } = visibleReports(req);
    let query = `SELECT r.* FROM reports r WHERE ${sql}`;
    if (playerId) {
      params.push(Number(playerId));
      query += ` AND r.player_id = $${params.length}`;
    }
    const { rows: reports } = await pool.query(`${query} ORDER BY r.id`, params);
    res.json(reports.map(reportRowToApi));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst reporty.", detail: err.message });
  }
});

function reportRowToApi(r) {
  return { id: r.id, playerId: r.player_id, author: r.author, match: r.match, date: r.date, recommendation: r.recommendation, edited: r.edited };
}

// Report smí měnit/mazat jeho autor, hlavní skaut klubu (u reportů svých skautů)
// a demo tým u starých demo reportů. Cizí kluby se k reportu nedostanou vůbec.
async function loadModifiableReport(req, id) {
  const { sql, params } = visibleReports(req);
  params.push(id);
  const { rows } = await pool.query(`SELECT r.* FROM reports r WHERE ${sql} AND r.id = $3`, params);
  const report = rows[0];
  if (!report) return { error: 404 };
  const own = report.user_id === req.user.id;
  const head = req.user.role === "hlavni_skaut";
  const legacyDemo = report.user_id === null && req.user.isDemoTeam;
  if (!own && !head && !legacyDemo) return { error: 403 };
  return { report };
}

app.post("/api/reports", async (req, res) => {
  try {
    const { playerId, match, recommendation } = req.body;
    if (!playerId || !recommendation) {
      return res.status(400).json({ error: "Chybí povinná pole (playerId, recommendation)." });
    }
    if (!["Doporučit", "Sledovat dál", "Zamítnout"].includes(recommendation)) {
      return res.status(400).json({ error: "Neplatné doporučení." });
    }
    const { rows } = await pool.query("SELECT * FROM players WHERE id = $1", [Number(playerId)]);
    const player = rows[0];
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });

    // Autor je vždy přihlášený uživatel — nebere se z těla požadavku.
    const date = new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" });
    const { rows: inserted } = await pool.query(
      "INSERT INTO reports (player_id, author, user_id, match, date, recommendation) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [Number(playerId), req.user.name, req.user.id, String(match || "").slice(0, 200), date, recommendation]
    );
    res.status(201).json(reportRowToApi(inserted[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit report.", detail: err.message });
  }
});

app.patch("/api/reports/:id", async (req, res) => {
  try {
    const found = await loadModifiableReport(req, Number(req.params.id));
    if (found.error === 404) return res.status(404).json({ error: "Report nenalezen." });
    if (found.error === 403) return res.status(403).json({ error: "Tenhle report nemůžeš upravit." });
    const report = found.report;

    const map = { match: "match", recommendation: "recommendation" };
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
    const found = await loadModifiableReport(req, Number(req.params.id));
    if (found.error === 404) return res.status(404).json({ error: "Report nenalezen." });
    if (found.error === 403) return res.status(403).json({ error: "Tenhle report nemůžeš smazat." });
    await pool.query("DELETE FROM reports WHERE id = $1", [found.report.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat report.", detail: err.message });
  }
});

// ---------- Diskuze u hráče ----------
// Komentáře vidí skauti jednoho klubu — vyměňují si postřehy k témuž hráči, ale
// jiný klub je nevidí.
function commentRowToApi(c) {
  return { id: c.id, playerId: c.player_id, userId: c.user_id, author: c.author, body: c.body, createdAt: c.created_at };
}

app.get("/api/players/:id/comments", async (req, res) => {
  try {
    // Komentáře vidí jen skauti stejného klubu (ne celá appka).
    const { rows } = await pool.query(
      `SELECT c.* FROM player_comments c
       WHERE c.player_id = $1 AND (c.user_id = $2 OR c.user_id IN (SELECT id FROM users WHERE club_id = $3))
       ORDER BY c.id`,
      [Number(req.params.id), req.user.id, req.user.clubId ?? null]
    );
    res.json(rows.map(commentRowToApi));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst komentáře.", detail: err.message });
  }
});

app.post("/api/players/:id/comments", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const body = (req.body.body || "").trim();
    if (!body) return res.status(400).json({ error: "Komentář nemůže být prázdný." });

    const { rows: playerRows } = await pool.query("SELECT id FROM players WHERE id = $1", [playerId]);
    if (!playerRows[0]) return res.status(404).json({ error: "Hráč nenalezen." });

    const { rows } = await pool.query(
      "INSERT INTO player_comments (player_id, user_id, author, body) VALUES ($1,$2,$3,$4) RETURNING *",
      [playerId, req.user.id, req.user.name, body]
    );
    res.status(201).json(commentRowToApi(rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit komentář.", detail: err.message });
  }
});

app.delete("/api/comments/:id", async (req, res) => {
  try {
    const { rows } = await pool.query("SELECT * FROM player_comments WHERE id = $1", [Number(req.params.id)]);
    const comment = rows[0];
    if (!comment) return res.status(404).json({ error: "Komentář nenalezen." });
    if (comment.user_id !== req.user.id) return res.status(403).json({ error: "Můžeš smazat jen svůj vlastní komentář." });
    await pool.query("DELETE FROM player_comments WHERE id = $1", [comment.id]);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat komentář.", detail: err.message });
  }
});

// GET /api/conflicts — dopočítané za běhu z reportů skautů TVÉHO klubu (reporty
// jiných klubů se nikdy nezobrazují).
app.get("/api/conflicts", async (req, res) => {
  try {
    const { sql, params } = visibleReports(req);
    const { rows: reports } = await pool.query(`SELECT r.* FROM reports r WHERE ${sql}`, params);
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

// Akce z live tagování patří uživateli; vidí je skauti jeho klubu. Staré akce bez
// uživatele (demo data) vidí jen demo tým.
function visibleEventsSql(req) {
  const demo = req.user.isDemoTeam ? " OR user_id IS NULL" : "";
  return {
    sql: `(user_id = $1 OR user_id IN (SELECT id FROM users WHERE club_id = $2)${demo})`,
    params: [req.user.id, req.user.clubId ?? null],
  };
}

app.get("/api/events", async (req, res) => {
  try {
    const { matchId } = req.query;
    const { sql, params } = visibleEventsSql(req);
    let query = `SELECT * FROM events WHERE ${sql}`;
    if (matchId) {
      params.push(Number(matchId));
      query += ` AND match_id = $${params.length}`;
    }
    const { rows } = await pool.query(`${query} ORDER BY id`, params);
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
      "INSERT INTO events (match_id, minute, player_id, action_id, action_label, user_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
      [Number(matchId), Number(minute), Number(player), actionId, actionLabel || "", req.user.id]
    );
    res.status(201).json(eventRowToApi(rows[0]));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit akci.", detail: err.message });
  }
});

app.delete("/api/events/:id", async (req, res) => {
  try {
    const { sql, params } = visibleEventsSql(req);
    params.push(Number(req.params.id));
    const { rowCount } = await pool.query(`DELETE FROM events WHERE ${sql} AND id = $3`, params);
    if (rowCount === 0) return res.status(404).json({ error: "Akce nenalezena." });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat akci.", detail: err.message });
  }
});

const COVERAGE_POSITIONS = ["Brankář", "Pravý obránce", "Levý obránce", "Stoper", "Defenzivní záložník", "Ofenzivní záložník", "Křídlo", "Útočník"];

app.get("/api/coverage", async (req, res) => {
  try {
    if (req.user.isDemoTeam) {
      const { rows } = await pool.query("SELECT * FROM coverage");
      const leagues = [...new Set(rows.map((r) => r.league))];
      const positions = [...new Set(rows.map((r) => r.position))];
      const data = {};
      for (const r of rows) {
        if (!data[r.league]) data[r.league] = {};
        data[r.league][r.position] = r.value;
      }
      return res.json({ mode: "percent", leagues, positions, data });
    }

    // Skutečné účty: počet hráčů klubu (ohodnocených kýmkoli z klubu) podle ligy a pozice.
    // Slepé místo = pozice, na které klub v dané lize nemá nikoho.
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (p.id) p.id, COALESCE(e.position, p.position) AS position, COALESCE(e.league, p.league) AS league
       FROM player_evaluations e
       JOIN users u ON u.id = e.user_id
       JOIN players p ON p.id = e.player_id
       WHERE u.club_id = $1
       ORDER BY p.id, e.updated_at DESC`,
      [req.user.clubId ?? -1]
    );
    const leagueNames = new Map(); // klíč (malá písmena) -> první zadaný zápis
    let withoutLeague = 0;
    const counts = {};
    const extraPositions = new Set();
    for (const r of rows) {
      const name = String(r.league || "").trim();
      if (!name) {
        withoutLeague++;
        continue;
      }
      const key = name.toLowerCase();
      if (!leagueNames.has(key)) leagueNames.set(key, name);
      const league = leagueNames.get(key);
      if (!COVERAGE_POSITIONS.includes(r.position)) extraPositions.add(r.position);
      counts[league] = counts[league] || {};
      counts[league][r.position] = (counts[league][r.position] || 0) + 1;
    }
    const leagues = [...leagueNames.values()].sort((a, b) => a.localeCompare(b, "cs"));
    const positions = [...COVERAGE_POSITIONS, ...extraPositions];
    const data = {};
    for (const l of leagues) {
      data[l] = {};
      for (const pos of positions) data[l][pos] = counts[l]?.[pos] || 0;
    }
    res.json({ mode: "count", leagues, positions, data, withoutLeague });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst mapu pokrytí.", detail: err.message });
  }
});

// Reálné počty hráčů na shortlistě PŘIHLÁŠENÉHO skauta po fázích (dřív vracelo
// natvrdo zadaná demo čísla jen demo účtům) — používá se pro graf na Dashboardu.
app.get("/api/shortlist-stages", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT pipeline_stage AS stage, COUNT(*)::int AS count FROM player_evaluations WHERE user_id = $1 AND pipeline_stage IS NOT NULL GROUP BY pipeline_stage",
      [req.user.id]
    );
    const counts = Object.fromEntries(rows.map((r) => [r.stage, r.count]));
    res.json(PIPELINE_STAGES.map((stage) => ({ stage, count: counts[stage] || 0 })));
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst shortlisty.", detail: err.message });
  }
});

// Celý shortlist kanban přihlášeného skauta — hráči seskupení podle fáze.
app.get("/api/shortlist", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, COALESCE(e.position, p.position) AS position, p.age, p.birth_year, COALESCE(e.club, p.club) AS club, e.pipeline_stage AS stage, e.market_value, e.scores, e.risk_level, e.analytics
       FROM player_evaluations e JOIN players p ON p.id = e.player_id
       WHERE e.user_id = $1 AND e.pipeline_stage IS NOT NULL
       ORDER BY p.name`,
      [req.user.id]
    );
    const board = Object.fromEntries(PIPELINE_STAGES.map((s) => [s, []]));
    for (const r of rows) {
      board[r.stage]?.push({
        id: r.id, name: r.name, position: r.position, age: playerAge(r), club: r.club,
        marketValue: Number(r.market_value), scores: r.scores, riskLevel: r.risk_level,
        topMetrics: topMetricsFromBreakdown(r.analytics?.breakdown),
      });
    }
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst shortlist.", detail: err.message });
  }
});

// Nastaví/zruší fázi hráče na shortlistě přihlášeného skauta. stage: null
// odebere hráče ze shortlisty úplně (kanban kartu smaže, hodnocení zůstává).
app.patch("/api/players/:id/stage", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { stage } = req.body;
    if (stage !== null && !PIPELINE_STAGES.includes(stage)) {
      return res.status(400).json({ error: `Neplatná fáze. Platné hodnoty: ${PIPELINE_STAGES.join(", ")}, nebo null.` });
    }
    const { rows } = await pool.query("SELECT id FROM players WHERE id = $1", [playerId]);
    if (!rows[0]) return res.status(404).json({ error: "Hráč nenalezen." });

    await pool.query(
      `INSERT INTO player_evaluations (player_id, user_id, scores, reason, pipeline_stage)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (player_id, user_id) DO UPDATE SET pipeline_stage = $5, updated_at = now()`,
      [playerId, req.user.id, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON), stage]
    );
    res.json({ pipelineStage: stage });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se upravit shortlist.", detail: err.message });
  }
});

// Vrátí (a při prvním zavolání vytvoří) token pro veřejný read-only odkaz na
// MOJE hodnocení tohoto hráče. Idempotentní — opakované volání vrací pořád
// stejný token, dokud ho scout výslovně nezruší (DELETE níže).
app.post("/api/players/:id/share", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    const { rows } = await pool.query("SELECT id FROM players WHERE id = $1", [playerId]);
    if (!rows[0]) return res.status(404).json({ error: "Hráč nenalezen." });

    let evaluation = await getMyEvaluation(playerId, req.user.id);
    if (!evaluation) {
      const { rows: created } = await pool.query(
        `INSERT INTO player_evaluations (player_id, user_id, scores, reason) VALUES ($1,$2,$3,$4) RETURNING *`,
        [playerId, req.user.id, JSON.stringify(EMPTY_SCORES), JSON.stringify(EMPTY_REASON)]
      );
      evaluation = created[0];
    }

    let token = evaluation.share_token;
    if (!token) {
      token = crypto.randomBytes(12).toString("hex");
      await pool.query("UPDATE player_evaluations SET share_token = $1 WHERE id = $2", [token, evaluation.id]);
    }
    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se vytvořit sdílený odkaz.", detail: err.message });
  }
});

// Zruší veřejný odkaz — token přestane fungovat, appka si při dalším
// kliknutí na "Sdílet" vygeneruje nový.
app.delete("/api/players/:id/share", async (req, res) => {
  try {
    const playerId = Number(req.params.id);
    await pool.query("UPDATE player_evaluations SET share_token = NULL WHERE player_id = $1 AND user_id = $2", [playerId, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se zrušit sdílený odkaz.", detail: err.message });
  }
});

// Render (a podobné hostingy) přidělují port dynamicky přes proměnnou PORT.
const PORT = process.env.PORT || 4000;

// Jednorázové dopočtení uložených skóre u hráčů s ručními metrikami (idempotentní).
async function backfillManualScores() {
  const { rows } = await pool.query(
    "SELECT id, analytics, scores FROM player_evaluations WHERE jsonb_array_length(COALESCE(analytics->'breakdown', '[]'::jsonb)) > 0 AND analytics->'styleContributions' IS NULL"
  );
  for (const r of rows) {
    const sc = manualScoreFromBreakdown(r.analytics.breakdown);
    if (sc === null) continue;
    if (r.scores?.pressing === sc && r.scores?.possession === sc && r.scores?.defensive === sc) continue;
    await pool.query("UPDATE player_evaluations SET scores = $1::jsonb WHERE id = $2", [JSON.stringify({ pressing: sc, possession: sc, defensive: sc }), r.id]);
  }
}

initDb()
  .then(() => backfillManualScores().catch((e) => console.error("Dopočet skóre selhal:", e.message)))
  .then(() => {
    app.listen(PORT, () => console.log(`ScoutOS backend běží na portu ${PORT}`));
  })
  .catch((err) => {
    console.error("Nepodařilo se inicializovat databázi:", err);
    process.exit(1);
  });
