# ScoutOS — startovní kód aplikace

Tohle je skutečný, spustitelný základ scoutingové aplikace ScoutOS — **frontend i backend, ne jen vizuální maketa.** Dá se v ní reálně přidávat vlastní hráče, psát k nim skautské reporty, a všechno se skutečně ukládá na disk.

## Co v tom reálně je

- **Backend** (`server/`) — jednoduchý Express server, který čte a zapisuje data do souboru `server/data/db.json`. Skutečná perzistence, ne jen simulace v paměti prohlížeče.
- **+ Přidat hráče** (`/pridat-hrace`) — formulář na vytvoření nového hráče (jméno, pozice, věk, klub, tržní hodnota, kontrakt, agent...). Uloží se skutečně na server.
- **Jednoduchý profil hráče** (`/hrac-basic/:id`) — pro každého nově přidaného hráče. Zobrazuje základní údaje **s možností je kdykoliv upravit nebo hráče smazat** (smazání se ptá na potvrzení a smaže i všechny jeho reporty), a umožňuje psát, upravovat i mazat skautské reporty. **Nemá AI analytiku** (skóre, video, riziko zranění) — ta vyžaduje napojení na reálná data (viz Modul B v PRD) a je zatím jen u ukázkového hráče.
- **Vyhledávání hráčů** (`/hledani`) — napojené na backend, zobrazuje všechny hráče včetně nově přidaných, s filtry a řazením podle skóre (nový hráč bez reportů má neutrální skóre 50/50/50, dokud se k němu něco nepřidá).
- **Player Profile — demo** (`/hrac`) — plně funkční ukázková obrazovka s celou AI analytickou vrstvou (Tomáš Kovář). Zůstává jako referenční příklad toho, jak by profil vypadal s napojenými reálnými daty.
- **Head of Scouting Dashboard** (`/`) — kompletně napojený na backend. Rozporové tikety se dopočítávají za běhu ze skutečných reportů, přiřazení skauta na zápas se ukládá přes `PATCH`, a i mapa pokrytí lig a přehled shortlist se teď stahují ze serveru.
- **Live Tagging** (`/tagovani`) — plně napojeno na backend, včetně offline-first synchronizace. Online se každá tagovaná akce hned odešle a uloží na server. Přepni na offline (klepnutím na indikátor nahoře) — akce se dál zaznamenávají lokálně a čekají s odznakem "ČEKÁ". Přepni zpátky na online a appka je doopravdy odešle dávkou na server. Undo maže akci i na serveru, pokud tam už byla uložená. Otevři appku znovu (nebo obnov stránku) — dřív zaznamenané akce se načtou zpátky, protože jsou uložené v `db.json`, ne jen v paměti prohlížeče.
- **Přihlášení a registrace** (`/prihlaseni`) — **skutečně funkční.** Heslo se bezpečně hashuje (bcrypt), přihlášení vrací token (JWT), a bez přihlášení se appka vůbec neotevře — všechny ostatní obrazovky jsou chráněné a přesměrují na přihlášení. Zkušební účet: `petr@scoutos.cz` / `heslo123`, nebo si rovnou vytvoř nový.

## Jak si to spustit u sebe na počítači (i bez programátorských zkušeností)

Teď máš **dvě části**, které musí běžet současně — server (backend) a appku (frontend). Potřebuješ na to **dva otevřené terminály najednou.**

1. **Nainstaluj Node.js** — jdi na [nodejs.org](https://nodejs.org), stáhni a nainstaluj verzi "LTS". To je jediná věc, kterou potřebuješ mít na počítači nainstalovanou.
2. **Rozbal tenhle projekt** do libovolné složky.

### Terminál č. 1 — spuštění backendu (serveru)

```
cd cesta/k/slozce/scoutos-app/server
npm install
npm run dev
```

Uvidíš zprávu `ScoutOS backend běží na http://localhost:4000`. Tenhle terminál nech otevřený a běžet.

### Terminál č. 2 — spuštění frontendu (appky)

Otevři **nové okno terminálu** (backend v tom prvním nech běžet dál) a spusť:

```
cd cesta/k/slozce/scoutos-app
npm install
npm run dev
```

Terminál ti ukáže adresu, typicky `http://localhost:5173` — otevři ji v prohlížeči.

**Pokud appka hlásí "Nepodařilo se připojit k serveru"** — znamená to, že jsi zapomněl/a spustit backend v prvním terminálu. Appka to sama detekuje a řekne ti přesně, co udělat.

Když chceš cokoliv zastavit, klikni do příslušného terminálu a stiskni `Ctrl + C`.

## Struktura projektu (pro tebe i pro budoucího vývojáře)

```
scoutos-app/
├── server/                     — BACKEND
│   ├── index.js                — Express server, API endpointy
│   └── data/db.json            — "databáze" (JSON soubor, který se čte i zapisuje)
├── src/                        — FRONTEND
│   ├── main.jsx                — vstupní bod aplikace
│   ├── App.jsx                 — routování mezi obrazovkami + horní navigace
│   └── pages/
│       ├── PlayerSearch.jsx    — napojeno na backend
│       ├── PlayerProfile.jsx   — zatím mock data
│       ├── Dashboard.jsx       — zatím mock data
│       ├── LiveTagging.jsx     — zatím mock data
│       └── Login.jsx           — zástupná obrazovka
├── index.html
├── package.json
└── vite.config.js
```

Frontend je **React** aplikace postavená nástrojem **Vite**. Backend je **Node.js/Express** server. Komunikují spolu přes běžné HTTP požadavky (`fetch`) na adrese `http://localhost:4000`.

## Co je v backendu skutečně funkční

- `POST /api/auth/register` — vytvoří nový účet, heslo se hashuje přes bcrypt, vrátí přihlašovací token.
- `POST /api/auth/login` — ověří e-mail a heslo, vrátí token (JWT, platnost 7 dní).
- **Všechny ostatní `/api/...` endpointy vyžadují platný token** v hlavičce `Authorization: Bearer <token>` — bez něj vrátí chybu 401. Frontend to řeší automaticky (viz `src/api.js`), token se ukládá do prohlížeče po přihlášení.
- `GET /api/players` — vrátí seznam hráčů, podporuje filtrování přes parametry v URL (pozice, věk, rozpočet, filozofie klubu).
- `POST /api/players` — **skutečně vytvoří** nového hráče se základními údaji.
- `GET /api/players/:id` — detail jednoho hráče.
- `PATCH /api/players/:id` — **skutečně upraví** základní údaje existujícího hráče.
- `DELETE /api/players/:id` — **skutečně smaže** hráče i všechny jeho reporty.
- `GET /api/reports?playerId=` — reporty k danému hráči.
- `GET /api/conflicts` — **dopočítané za běhu**: hráči, u kterých existují reporty s rozdílným doporučením.
- `GET /api/matches` — seznam nadcházejících zápasů a navržených/přiřazených skautů.
- `PATCH /api/matches/:id` — **skutečně uloží** změnu přiřazeného skauta na zápas.
- `GET /api/events?matchId=` — tagované akce ze zápasu (Live Tagging).
- `POST /api/events` — **skutečně zapíše** tagovanou akci.
- `DELETE /api/events/:id` — smaže akci (undo).
- `GET /api/coverage` — mapa pokrytí lig a pozic.
- `GET /api/shortlist-stages` — přehled shortlist podle stavu.
- `POST /api/reports` — **skutečně zapíše** nový report do `data/db.json`. Vyzkoušej si to buď přes formulář dole na záložce "Reporty skautů" v Player Profile appky, nebo přímo v terminálu:
- `PATCH /api/reports/:id` — **skutečně upraví** existující report (a označí ho jako "upraveno").
- `DELETE /api/reports/:id` — **skutečně smaže** report.
  ```
  curl -X POST http://localhost:4000/api/reports -H "Content-Type: application/json" -d "{\"playerId\":1,\"author\":\"Tvoje jméno\",\"recommendation\":\"Doporučit\"}"
  ```
  Otevři pak `server/data/db.json` — uvidíš tam svůj nový report.

**Důležité upřesnění:** `db.json` je zjednodušené řešení vhodné pro jednoho uživatele a lokální vývoj/demo. Není to náhrada za skutečnou databázi (PostgreSQL) pro provoz s více současnými uživateli — to je popsané níže v sekci "Co tohle NENÍ".

## Co tohle NENÍ (a co bude potřeba doplnit, než se to dá prodávat)

1. **Skutečná databáze pro víc uživatelů najednou.** Všech pět obrazovek je teď opravdu napojených na backend se skutečným čtením i zápisem — žádná obrazovka už nepoužívá natvrdo zapsaná data v kódu. `db.json` je ale pořád jen jeden soubor na disku, ne opravdová databáze — funguje skvěle pro jednoho uživatele a demo účely, ale při víc lidech zapisujících současně (víc skautů, víc klubů) by docházelo ke ztrátě dat. Potřeba je přejít na PostgreSQL — viz Modul B a Kapitola 4 (Datový model) v produktové specifikaci.
2. **AI analytická vrstva pro reálně přidané hráče.** Formulář "Přidat hráče" vytvoří skutečný záznam v databázi, ale nový hráč nemá skóre, video ani model rizika zranění — ty existují zatím jen u ukázkového hráče (Tomáš Kovář). Pro reálné skóre je potřeba napojit datového poskytovatele nebo vlastní tagging pipeline (Modul A a B1 z PRD) — to je další velký krok, ne úprava na pár řádků.
3. **Přihlašování a správa uživatelů.** Základ je hotový (viz výše), ale pro produkci chybí: přesunout `JWT_SECRET` z kódu do proměnné prostředí (`.env`), řízení přístupových práv podle role — teď je každý přihlášený uživatel rovnocenný, appka nerozlišuje skauta od hlavního skauta ani neomezuje, kdo co smí (viz PRD kapitola 3, Modul C4) — a případně obnovování tokenu / odhlášení na pozadí při vypršení platnosti.
4. **Nahrávání a zpracování videa.** Modul A (Video Intelligence) z PRD — automatické tagování akcí, střih — je zatím jen navržený koncept, žádný kód pro něj neexistuje.
5. **Platby a předplatné**, pokud chceš prodávat jako SaaS (např. přes Stripe).
6. **Hosting.** Tohle běží teď jen na tvém počítači. Pro reálné použití klubem potřebuješ nasadit frontend (např. Vercel) i backend s opravdovou databází (např. Railway, Render, nebo vlastní cloud).
7. **Bezpečnost a GDPR**, zejména kolem dat nezletilých hráčů — viz PRD kapitola 8.

## Jak dál, když neumíš programovat

Realisticky máš teď dvě cesty:

- **Najmi si vývojáře nebo malé vývojářské studio.** Tenhle projekt jim ušetří týdny práce — mají hotový vizuální základ čtyř klíčových obrazovek, funkční příklad backendu s reálnou perzistencí dat, a přesnou specifikaci (viz `docs/scouting-software-PRD.md` a `docs/scoring-model-matematika.md`), takže nezačínají od nuly ani od prázdné tabule.
- **Nauč se základy sám**, pokud chceš rozumět tomu, co se děje — na to existují kurzy zaměřené přímo na React (např. na freeCodeCamp nebo Scrimba), ale i tak budeš pro produkční databázi, bezpečnost a hosting pravděpodobně potřebovat pomoc zkušenějšího vývojáře.

V každém případě doporučuju další krok: najít si vývojáře (i na částečný úvazek nebo freelance) a předat mu tenhle repozitář spolu s PRD a matematickou specifikací scoring modelu — má tak jasné zadání i vizuální referenci i funkční příklad backendu, ne jen nápad v hlavě.
