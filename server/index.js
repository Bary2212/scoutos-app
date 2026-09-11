// ScoutOS backend — jednoduchý, ale SKUTEČNÝ server. Data se čtou a zapisují
// do souboru data/db.json, ne jen drží v paměti frontendu jako dřív.
//
// Tohle je vědomě zjednodušené řešení (JSON soubor místo PostgreSQL, viz PRD
// kapitola 9 pro doporučený produkční tech stack) — pro reálný provoz s více
// souběžnými uživateli je nutné přejít na opravdovou databázi. Pro lokální
// vývoj a demo účely ale funguje spolehlivě a bez závislosti na instalaci
// databázového serveru.

import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import { readFile, writeFile } from "fs/promises";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "data", "db.json");

// V produkci se tenhle klíč nastavuje v proměnné prostředí JWT_SECRET
// (na Renderu v sekci Environment). Lokálně, když není nastavená, appka
// použije záložní hodnotu níže — bezpečné pro vývoj, NE pro ostrý provoz.
const JWT_SECRET = process.env.JWT_SECRET || "scoutos-dev-secret-zmen-v-produkci";

const app = express();
app.use(cors());
app.use(express.json());

async function readDb() {
  const raw = await readFile(DB_PATH, "utf-8");
  return JSON.parse(raw);
}

async function writeDb(db) {
  await writeFile(DB_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function signToken(user) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, isDemoTeam: !!user.isDemoTeam }, JWT_SECRET, { expiresIn: "7d" });
}

// ---------- E-MAIL — posílá se přes Gmail SMTP (nastavuje se v proměnných prostředí) ----------
// Pokud EMAIL_USER / EMAIL_PASS nejsou nastavené (např. při lokálním vývoji), appka
// e-mail jen vypíše do konzole místo skutečného odeslání — nic tím nespadne.
const emailConfigured = !!(process.env.EMAIL_USER && process.env.EMAIL_PASS);
const transporter = emailConfigured
  ? nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      family: 4, // vynutí IPv4 — Render free plán neumí odchozí IPv6, viz ENETUNREACH chyba v logu
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    })
  : null;

async function sendMail({ to, subject, html }) {
  if (!transporter) {
    console.log(`[e-mail NEODESLÁN — chybí EMAIL_USER/EMAIL_PASS] Pro: ${to} | Předmět: ${subject}\n${html}`);
    return;
  }
  await transporter.sendMail({ from: `"ScoutOS" <${process.env.EMAIL_USER}>`, to, subject, html });
}

function generateCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6místný kód
}

// ---------- AUTH ROUTY — musí být definované PŘED ochranným middlewarem níže ----------

// POST /api/auth/register — vytvoří nový (zatím neověřený) účet a pošle ověřovací kód e-mailem
app.post("/api/auth/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, passwordConfirm } = req.body;
    if (!firstName || !lastName || !email || !password || !passwordConfirm) {
      return res.status(400).json({ error: "Vyplň prosím všechna pole." });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: "Heslo musí mít alespoň 8 znaků." });
    }
    if (password !== passwordConfirm) {
      return res.status(400).json({ error: "Hesla se neshodují." });
    }
    const db = await readDb();
    if (!db.users) db.users = [];
    if (db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: "Účet s tímto e-mailem už existuje." });
    }

    const verificationCode = generateCode();
    const newUser = {
      id: db.users.length ? Math.max(...db.users.map((u) => u.id)) + 1 : 1,
      firstName,
      lastName,
      name: `${firstName} ${lastName}`,
      email,
      passwordHash: bcrypt.hashSync(password, 10),
      role: "skaut",
      verified: false,
      verificationCode,
      verificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24 hodin
    };
    db.users.push(newUser);
    await writeDb(db);

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

// POST /api/auth/verify — potvrdí e-mail kódem a rovnou přihlásí
app.post("/api/auth/verify", async (req, res) => {
  try {
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ error: "Chybí e-mail nebo kód." });
    const db = await readDb();
    const user = (db.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user) return res.status(404).json({ error: "Účet nenalezen." });
    if (user.verified) return res.status(400).json({ error: "Účet už je ověřený, můžeš se rovnou přihlásit." });
    if (user.verificationCode !== code) return res.status(400).json({ error: "Nesprávný kód." });
    if (Date.now() > user.verificationExpires) return res.status(400).json({ error: "Platnost kódu vypršela, zkus registraci znovu." });

    user.verified = true;
    delete user.verificationCode;
    delete user.verificationExpires;
    await writeDb(db);

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, isDemoTeam: !!user.isDemoTeam } });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se ověřit účet.", detail: err.message });
  }
});

// POST /api/auth/login — ověří heslo proti hashi, vrátí token (jen pro ověřené účty)
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: "Chybí e-mail nebo heslo." });
    }
    const db = await readDb();
    const user = (db.users || []).find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
      return res.status(401).json({ error: "Nesprávný e-mail nebo heslo." });
    }
    if (!user.verified) {
      return res.status(403).json({ error: "Účet ještě není ověřený. Zkontroluj e-mail a zadej ověřovací kód.", needsVerification: true, email: user.email });
    }
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, isDemoTeam: !!user.isDemoTeam } });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se přihlásit.", detail: err.message });
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// ---------- OCHRANNÝ MIDDLEWARE — všechno pod /api definované NÍŽE už vyžaduje platný token ----------
app.use("/api", (req, res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Chybí přihlašovací token." });
  }
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

// Pomocník: hráč je viditelný pro uživatele, pokud ho přímo vlastní, nebo pokud
// jde o sdílená demo data A přihlášený uživatel patří do demo týmu.
// Nový, skutečně registrovaný zákazník sdílená demo data VŮBEC nevidí — má čistý start.
function isVisibleToUser(player, user) {
  if (player.ownerId === user.id) return true;
  if (player.isSharedDemo && user.isDemoTeam) return true;
  return false;
}

// GET /api/players?category=&maxAge=&maxBudget=&style=
app.get("/api/players", async (req, res) => {
  try {
    const db = await readDb();
    const { category = "Vše", maxAge = 99, maxBudget = 999, style = "pressing" } = req.query;

    const results = db.players
      .filter((p) => isVisibleToUser(p, req.user))
      .filter((p) => (category === "Vše" ? true : categoryOf(p.position) === category))
      .filter((p) => p.age <= Number(maxAge))
      .filter((p) => p.marketValue <= Number(maxBudget))
      .sort((a, b) => (b.scores[style] ?? 0) - (a.scores[style] ?? 0));

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

// POST /api/players — vytvoří nového hráče, přiřazeného přihlášenému uživateli.
// Pokročilé analytické sekce (skóre, klipy, historie) zůstávají prázdné, dokud
// se k hráči nepřidají reálná data — appka to zohledňuje v jednoduchém profilu.
app.post("/api/players", async (req, res) => {
  try {
    const { name, position, age, club, marketValue, contractUntil, agent, foot, height } = req.body;
    if (!name || !position) {
      return res.status(400).json({ error: "Chybí jméno nebo pozice." });
    }
    const db = await readDb();
    const newPlayer = {
      id: db.players.length ? Math.max(...db.players.map((p) => p.id)) + 1 : 1,
      ownerId: req.user.id,
      name,
      position,
      age: Number(age) || null,
      club: club || "",
      marketValue: Number(marketValue) || 0,
      contractUntil: contractUntil || "",
      agent: agent || "",
      foot: foot || "",
      height: height || "",
      minutesTracked: 0,
      riskLevel: "low",
      scores: { pressing: 50, possession: 50, defensive: 50 },
      reason: {
        pressing: "Zatím nejsou k dispozici žádné reporty ani statistiky.",
        possession: "Zatím nejsou k dispozici žádné reporty ani statistiky.",
        defensive: "Zatím nejsou k dispozici žádné reporty ani statistiky.",
      },
    };
    db.players.push(newPlayer);
    await writeDb(db);
    res.status(201).json(newPlayer);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se vytvořit hráče.", detail: err.message });
  }
});

// PATCH /api/players/:id — SKUTEČNĚ upraví základní údaje hráče, jen pokud ho uživatel vlastní
app.patch("/api/players/:id", async (req, res) => {
  try {
    const db = await readDb();
    const player = db.players.find((p) => p.id === Number(req.params.id));
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    if (!isVisibleToUser(player, req.user) || (!player.ownerId && !req.user.isDemoTeam)) {
      return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
    }

    const editableFields = ["name", "position", "age", "club", "marketValue", "contractUntil", "agent", "foot", "height"];
    for (const field of editableFields) {
      if (req.body[field] !== undefined) {
        if (field === "age") player.age = Number(req.body.age) || null;
        else if (field === "marketValue") player.marketValue = Number(req.body.marketValue) || 0;
        else player[field] = req.body[field];
      }
    }

    await writeDb(db);
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se upravit hráče.", detail: err.message });
  }
});

// DELETE /api/players/:id — SKUTEČNĚ smaže hráče i jeho reporty, jen pokud ho uživatel vlastní
app.delete("/api/players/:id", async (req, res) => {
  try {
    const db = await readDb();
    const playerId = Number(req.params.id);
    const player = db.players.find((p) => p.id === playerId);
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    if (!isVisibleToUser(player, req.user) || (!player.ownerId && !req.user.isDemoTeam)) {
      return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
    }
    db.players = db.players.filter((p) => p.id !== playerId);
    db.reports = db.reports.filter((r) => r.playerId !== playerId);
    await writeDb(db);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat hráče.", detail: err.message });
  }
});

// GET /api/players/:id — jen pokud je hráč viditelný pro tohoto uživatele
app.get("/api/players/:id", async (req, res) => {
  try {
    const db = await readDb();
    const player = db.players.find((p) => p.id === Number(req.params.id));
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    if (!isVisibleToUser(player, req.user)) {
      return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
    }
    res.json(player);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst hráče.", detail: err.message });
  }
});

// GET /api/reports?playerId= — jen pro hráče viditelné danému uživateli
app.get("/api/reports", async (req, res) => {
  try {
    const db = await readDb();
    const { playerId } = req.query;
    if (playerId) {
      const player = db.players.find((p) => p.id === Number(playerId));
      if (player && !isVisibleToUser(player, req.user)) {
        return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
      }
    }
    const reports = playerId ? db.reports.filter((r) => r.playerId === Number(playerId)) : db.reports;
    res.json(reports);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst reporty.", detail: err.message });
  }
});

// POST /api/reports — skutečně ZAPISUJE nový report, jen pokud uživatel vidí daného hráče
app.post("/api/reports", async (req, res) => {
  try {
    const { playerId, author, match, recommendation } = req.body;
    if (!playerId || !author || !recommendation) {
      return res.status(400).json({ error: "Chybí povinná pole (playerId, author, recommendation)." });
    }
    const db = await readDb();
    const player = db.players.find((p) => p.id === Number(playerId));
    if (!player) return res.status(404).json({ error: "Hráč nenalezen." });
    if (!isVisibleToUser(player, req.user)) {
      return res.status(403).json({ error: "Tento hráč patří jinému uživateli." });
    }
    const newReport = {
      id: db.reports.length ? Math.max(...db.reports.map((r) => r.id)) + 1 : 1,
      playerId: Number(playerId),
      author,
      match: match || "",
      date: new Date().toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" }),
      recommendation,
    };
    db.reports.push(newReport);
    await writeDb(db);
    res.status(201).json(newReport);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit report.", detail: err.message });
  }
});

// GET /api/conflicts — DOPOČÍTANÉ za běhu z reportů, ne uložené natvrdo.
// Konflikt = hráč, u kterého existují alespoň 2 reporty s různým doporučením.
// Počítá se jen z hráčů viditelných danému uživateli (jeho vlastní + sdílené demo).
app.get("/api/conflicts", async (req, res) => {
  try {
    const db = await readDb();
    const visiblePlayerIds = new Set(
      db.players.filter((p) => isVisibleToUser(p, req.user)).map((p) => p.id)
    );
    const byPlayer = {};
    for (const r of db.reports) {
      if (!visiblePlayerIds.has(r.playerId)) continue;
      if (!byPlayer[r.playerId]) byPlayer[r.playerId] = [];
      byPlayer[r.playerId].push(r);
    }
    const conflicts = Object.entries(byPlayer)
      .filter(([, reports]) => new Set(reports.map((r) => r.recommendation)).size > 1)
      .map(([playerId, reports]) => {
        const player = db.players.find((p) => p.id === Number(playerId));
        return {
          playerId: Number(playerId),
          player: player ? player.name : `Hráč #${playerId}`,
          position: player ? player.position : "",
          scouts: reports.map((r) => ({ name: r.author, recommendation: r.recommendation })),
        };
      });
    res.json(conflicts);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se dopočítat konflikty.", detail: err.message });
  }
});

// GET /api/matches — plánované zápasy jsou zatím jen u demo týmu (ukázka)
app.get("/api/matches", async (req, res) => {
  try {
    const db = await readDb();
    res.json(req.user.isDemoTeam ? db.matches : []);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst zápasy.", detail: err.message });
  }
});

// PATCH /api/matches/:id — SKUTEČNĚ uloží změnu přiřazeného skauta
app.patch("/api/matches/:id", async (req, res) => {
  try {
    const db = await readDb();
    const match = db.matches.find((m) => m.id === Number(req.params.id));
    if (!match) return res.status(404).json({ error: "Zápas nenalezen." });
    if (req.body.assignedScout) match.assignedScout = req.body.assignedScout;
    await writeDb(db);
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit přiřazení.", detail: err.message });
  }
});

// GET /api/events?matchId=
app.get("/api/events", async (req, res) => {
  try {
    const db = await readDb();
    const { matchId } = req.query;
    const events = matchId ? db.events.filter((e) => e.matchId === Number(matchId)) : db.events;
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst akce.", detail: err.message });
  }
});

// POST /api/events — SKUTEČNĚ zapíše tagovanou akci ze stadionu
app.post("/api/events", async (req, res) => {
  try {
    const { matchId, minute, player, actionId, actionLabel } = req.body;
    if (!matchId || minute === undefined || !player || !actionId) {
      return res.status(400).json({ error: "Chybí povinná pole (matchId, minute, player, actionId)." });
    }
    const db = await readDb();
    const newEvent = {
      id: db.events.length ? Math.max(...db.events.map((e) => e.id)) + 1 : 1,
      matchId: Number(matchId),
      minute: Number(minute),
      player: Number(player),
      actionId,
      actionLabel,
      recordedAt: new Date().toISOString(),
    };
    db.events.push(newEvent);
    await writeDb(db);
    res.status(201).json(newEvent);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se uložit akci.", detail: err.message });
  }
});

// DELETE /api/events/:id — undo, skutečně smaže záznam
app.delete("/api/events/:id", async (req, res) => {
  try {
    const db = await readDb();
    const before = db.events.length;
    db.events = db.events.filter((e) => e.id !== Number(req.params.id));
    if (db.events.length === before) return res.status(404).json({ error: "Akce nenalezena." });
    await writeDb(db);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat akci.", detail: err.message });
  }
});

// GET /api/coverage — mapa pokrytí lig a pozic
app.get("/api/coverage", async (req, res) => {
  try {
    const db = await readDb();
    if (req.user.isDemoTeam) return res.json(db.coverage);
    res.json({ leagues: [], positions: [], data: {} });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst mapu pokrytí.", detail: err.message });
  }
});

// GET /api/shortlist-stages — přehled shortlist podle stavu (zatím jen demo tým)
app.get("/api/shortlist-stages", async (req, res) => {
  try {
    const db = await readDb();
    res.json(req.user.isDemoTeam ? db.shortlistStages : []);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se načíst shortlisty.", detail: err.message });
  }
});

// PATCH /api/reports/:id — SKUTEČNĚ upraví existující report
app.patch("/api/reports/:id", async (req, res) => {
  try {
    const db = await readDb();
    const report = db.reports.find((r) => r.id === Number(req.params.id));
    if (!report) return res.status(404).json({ error: "Report nenalezen." });

    const editableFields = ["author", "match", "recommendation"];
    for (const field of editableFields) {
      if (req.body[field] !== undefined) report[field] = req.body[field];
    }
    report.edited = true;

    await writeDb(db);
    res.json(report);
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se upravit report.", detail: err.message });
  }
});

// DELETE /api/reports/:id — SKUTEČNĚ smaže report
app.delete("/api/reports/:id", async (req, res) => {
  try {
    const db = await readDb();
    const before = db.reports.length;
    db.reports = db.reports.filter((r) => r.id !== Number(req.params.id));
    if (db.reports.length === before) return res.status(404).json({ error: "Report nenalezen." });
    await writeDb(db);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: "Nepodařilo se smazat report.", detail: err.message });
  }
});

// Render (a podobné hostingy) přidělují port dynamicky přes proměnnou PORT.
// Lokálně, když PORT není nastavený, appka poběží na 4000 jako doteď.
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`ScoutOS backend běží na portu ${PORT}`);
});
