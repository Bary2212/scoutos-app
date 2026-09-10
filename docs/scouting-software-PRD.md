# ScoutOS — Kompletní produktová specifikace
### Software pro profesionální scouting fotbalových hráčů

---

## 0. Manifest produktu

**Princip:** Jedna pravda o hráči. Video, čísla a lidský úsudek skauta žijí v jednom místě, ne rozházené ve třech nástrojích. Každá obrazovka odpovídá na otázku "co mám udělat dál", nikdy nezůstává jen výpisem dat.

**Nefunkční mantra celého produktu:** Rychlost > úplnost. Skaut v terénu se špatným signálem musí být rychlejší než skaut s poznámkovým blokem, jinak produkt selhal bez ohledu na to, kolik má funkcí.

---

## 1. Persony (detailně, s frustracemi a metrikami úspěchu)

### 1.1 Terénní skaut — "Petr, 34 let"
- Sleduje 3–5 zápasů týdně živě, k tomu video doma.
- Frustrace: internet na stadionu je nespolehlivý; psaní reportu na notebooku po půlnoci je otrava; nemá zpětnou vazbu, jestli jeho hodnocení sedí s realitou (hráč se buď koupí, nebo ne, ale nikdo mu neřekne proč).
- Úspěch = report hotový do 10 minut po zápase, i offline; vidí, jak si jeho hodnocení vedou v čase (kalibrace).

### 1.2 Hlavní skaut / Head of Scouting — "Jana, 45 let"
- Řídí síť 8–15 terénních skautů, sestavuje shortlisty pro sportovního ředitele.
- Frustrace: nemá přehled, kdo co sledoval, duplicitní práce, rozpory v hodnocení se ztrácí v e-mailech.
- Úspěch = dashboard s přehledem pokrytí (které pozice/ligy jsou podsledované), automatická detekce rozporů mezi skauty.

### 1.3 Sportovní ředitel / Director of Football — "Tomáš, 52 let"
- Rozhoduje o transferech, mluví s majitelem/vedením o rozpočtu.
- Frustrace: dostává reporty plné žargonu, chce vědět "koupit/nekoupit/sledovat dál" a proč, srovnání s alternativami za stejný rozpočet.
- Úspěch = jedna stránka na hráče, srozumitelná i pro lidi mimo fotbal (majitel klubu), s jasným rizikovým profilem.

### 1.4 Video analytik — "Karel, 28 let"
- Stříhá klipy, taguje akce, připravuje podklady pro trenéry i skauty.
- Frustrace: ruční tagování zabírá hodiny, export klipů pro různé účely (skaut vs. trenér) vyžaduje dělat práci dvakrát.
- Úspěch = automatický tagging s možností rychlé ruční korekce, jeden klip → libovolný výstup (highlight reel, taktický klip, statistický přehled).

### 1.5 Agent / externí spolupracovník (omezený přístup) — "Michal, 40 let"
- Nabízí hráče klubu, potřebuje vědět stav zájmu bez přístupu k interním datům.
- Úspěch = řízený přístup jen k tomu, co se ho týká, žádný náhled do interních hodnocení jiných hráčů.

---

## 2. Kompletní uživatelské cesty (User Journeys)

### 2.1 Journey: Terénní skaut na zápase (offline-first scénář)
1. Petr otevře appku v autě před stadionem, appka stáhne sestavy obou týmů a základní statistiky do lokální cache.
2. Ztráta signálu na stadionu → appka přepne do offline módu, nic se nezasekne, žádná chybová hláška blokující práci.
3. Během zápasu taguje klíčové akce jedním tapem přes číslo dresu (predefinované rychlé akce: klíčová přihrávka, ztráta, soubojová výhra/prohra, chyba v rozehrávce).
4. Po zápase appka lokálně uloží hlasovou poznámku (Petr může nadiktovat dojem, přepis proběhne později).
5. Po připojení k wifi appka synchronizuje vše na pozadí, notifikace potvrdí úspěšný sync s počtem nahraných položek.
6. Petr dostane strukturovaný formulář reportu s předvyplněnými statistikami z tagů — doplní jen subjektivní hodnocení (technika, mentalita, potenciál) a odešle.
7. **Edge case:** Petr omylem tagne špatného hráče → jednoduchá historie "undo" posledních 5 akcí, ne nutnost mazat celý report.
8. **Edge case:** Dva zápasy ve stejný čas na dvou hřištích (Petr poslal kolegu) → systém rozezná duplicitní report na stejného hráče ve stejném čase a upozorní na možný konflikt dat.

### 2.2 Journey: Head of Scouting sestavuje shortlist pro konkrétní pozici
1. Jana dostane zadání od sportovního ředitele: "levý bek, do 23 let, rozpočet do 2M€, styl hry: ofenzivní".
2. V systému otevře Player Search s filtrem podle role, věku, tržní hodnoty a stylového profilu (ne jen pozice, ale konkrétní herní vzorce — např. "vysoký počet centrů z posledních 20 minut").
3. Systém vrátí seřazený seznam podle interního scoring modelu ušitého na styl klubu, s vysvětlením proč je hráč vysoko (transparentní scoring, ne černá skříňka).
4. Jana přidá 8 hráčů do shortlisty, systém automaticky navrhne, kterého skauta poslat (podle blízkosti k zápasům, jazykové znalosti země, historii sledování podobných hráčů).
5. Po 3 týdnech systém upozorní, že u 2 hráčů chybí nezávislé druhé hodnocení (risk kalibrace na jeden názor).
6. **Edge case:** Dva skauti dají stejnému hráči rozdílné hodnocení o více než 2 body na 10bodové škále → systém automaticky vytvoří "rozporový tiket" a navrhne třetí nezávislý report.

### 2.3 Journey: Sportovní ředitel prezentuje hráče vedení
1. Tomáš otevře Player Profile, klikne na "Executive Summary" (jednostránkový export).
2. Dostane PDF/prezentaci: foto, 3 klíčová čísla relevantní pro pozici, risk profil (zranění, věk, adaptace na ligu), 90sekundový highlight klip, cenové srovnání s podobnými hráči na trhu.
3. Prezentuje na poradě, dostane otázku "co když se zraní" → přímo v systému má injury history a pravděpodobnostní model návratu do formy.
4. **Edge case:** Vedení chce srovnání 3 hráčů vedle sebe → Compare View s automaticky zvýrazněnými rozdíly (ne jen tabulka čísel, ale narativní shrnutí "hráč A je rizikovější kvůli věku, ale levnější o 30 %").

### 2.4 Journey: Video analytik připravuje podklady
1. Karel nahraje záznam zápasu (nebo systém stáhne z partnerského feedu).
2. Automatický pipeline: detekce hráčů a míče → mapování na sestavy → automatický tagging událostí s confidence skóre.
3. Karel projde návrhy tagů seřazené podle nejnižší jistoty modelu (nejvíc pravděpodobné chyby nahoře), rychlá korekce klávesovými zkratkami.
4. Vygeneruje highlight reel pro konkrétního hráče jedním kliknutím — systém automaticky váží akce podle jeho hráčské role (u krajního obránce priorita na obranné souboje a centry, ne na střely).
5. **Edge case:** Špatná kvalita videa (amatérský záznam z tribuny) → systém detekuje nízkou kvalitu při uploadu a rovnou nabídne omezený mód (jen manuální tagging, bez CV detekce), aby nikdo nečekal na model, co stejně selže.

---

## 3. Funkční specifikace po modulech

### MODUL A — Video Intelligence

**A1. Ingest videa**
- Podporované vstupy: upload souboru, RTMP stream (živé přenosy), partnerský API feed (např. od ligových poskytovatelů).
- Automatická detekce kvality (rozlišení, stabilita kamery, úhel záběru) s klasifikací "vhodné pro auto-tagging" / "jen manuální".
- Deduplikace — pokud stejný zápas nahrají dva uživatelé, systém to detekuje podle metadat (soupeři, datum, délka) a nabídne sloučení.

**A2. Detekce a tagging**
- Computer vision pipeline: detekce hráčů, míče, hřištních linek pro homografii (převod na 2D souřadnice hřiště).
- Rozpoznání čísla dresu tam, kde je to vizuálně možné; jinak ruční přiřazení identity v prvních minutách, model dál trackuje pohyb.
- Katalog akcí k tagování: přihrávka (úspěšná/neúspěšná), střela, souboj (vzdušný/na zemi), driblink, ztráta míče, zákrok, standardka, ofsajd.
- Každý tag má confidence score; cokoliv pod prahovou hodnotou jde do fronty k lidské kontrole.

**A3. Střih a export**
- Šablony highlight reelů podle role (útočník: zakončení a pohyb bez míče; stoper: souboje a rozehrávka; brankář: zákroky a hra nohama).
- Ruční editor: timeline s tagy, možnost přidat/odebrat klip, textové anotace do videa.
- Export formáty: MP4 pro interní použití, odkaz se sledováním zhlédnutí pro sdílení s agenty/vedením (s expirací odkazu).

**A4. Synchronizace s daty**
- Každý klip je provázaný s konkrétním performance snapshotem — klik na statistiku ("12 úspěšných centrů") otevře playlist přesně těchto 12 akcí.

### MODUL B — Data & AI hodnocení

**B1. Sběr a normalizace dat**
- Import z externích datových poskytovatelů (statistické feedy) + interní tagging z modulu A.
- League Strength Index — koeficient síly soutěže aktualizovaný podle výsledků v mezinárodních pohárech a transferových trendů, aby "10 gólů ve 3. lize" nebylo srovnáváno 1:1 s "10 goly v top lize".
- Normalizace na 90 minut i na "possession-adjusted" metriky (počet akcí vážený podle držení míče týmu).

**B2. Scoring model**
- Klub definuje herní filozofii přes vážený dotazník (důraz na presink, držení míče, přechodovou fázi, standardky) → systém vygeneruje váhy pro jednotlivé metriky podle pozice.
- Skóre je vždy doprovázené vysvětlením (feature importance) — žádné "77/100" bez kontextu.
- Možnost vytvořit více scoring profilů (A-tým vs. akademie mají jiné priority).

**B3. Prediktivní modely**
- Vývojová křivka hráče: na základě historických křivek podobných hráčů (věk, liga, minutáž, pozice) odhad, kam se hráč posune za 1–3 roky.
- Injury risk model: na základě historie zranění, věku, herní zátěže (minuty + intenzita z trackovacích dat).
- Model adaptace na novou ligu: pravděpodobnost úspěšného přestupu na základě podobných předchozích transferů (stejná liga → jiná liga).

**B4. Similarity Engine**
- Vyhledávání "hráči podobní X" s nastavitelnou váhou mezi stylovou podobností a rozpočtovou dostupností.
- Filtr "co kdyby" — nahraď hráče A jeho statistickým klonem za nižší cenu, ukaž rozdíl v profilu.

### MODUL C — Skautská síť / CRM

**C1. Reporty**
- Strukturovaný formulář: technické dovednosti, taktické porozumění, fyzické parametry, mentalita/charakter, každý na škále s povinným zdůvodněním u extrémních hodnocení (1-2 nebo 9-10 vyžadují komentář).
- Šablony podle pozice (jiná pole pro brankáře než pro křídlo).
- Verzování — každá úprava reportu je uložena jako nová verze, nic se nepřepisuje potichu.

**C2. Shortlisty a watchlisty**
- Kanban-style board (sledovaný → hodnocený → doporučený → v jednání → uzavřeno).
- Historie priority v čase (graf, jak rostl/klesal zájem o hráče).
- Automatická upozornění: končící kontrakt do 6 měsíců, změna agenta, výpadek z formy (pokles klíčových metrik o víc než X %).

**C3. Kalibrace skautů**
- Systém zpětně porovnává hodnocení skauta s realitou (uplatnil se hráč, po podpisu, v soutěži) a počítá "kalibrační skóre" — ne k trestání, ale k vážení názoru při rozporech.
- Head of Scouting vidí, který skaut je konzistentně optimistický/pesimistický, a může to zohlednit.

**C4. Řízený přístup pro externí role**
- Agent vidí jen hráče, které zastupuje, a jen status zájmu (bez interních poznámek a číselného hodnocení).
- Auditní log každého přístupu k citlivým datům.

---

## 4. Datový model (entity a klíčové atributy)

```
Player
├── id, jméno, datum narození, státní příslušnost, preferovaná noha
├── fyzické parametry (výška, váha) — verzované v čase
├── aktuální klub, historie angažmá (transfer historie)
├── smluvní data (konec kontraktu, opce, agent)
└── injury_history[] (typ zranění, délka absence, datum)

PerformanceSnapshot
├── player_id, competition_id, sezóna, časové okno
├── surové statistiky (minuty, góly, asistence, xG, xA, ...)
├── possession-adjusted a per-90 normalizované hodnoty
└── league_strength_coefficient (odkaz na Competition)

ScoutReport
├── player_id, author_id, match_id (nullable pro video-only report)
├── strukturované hodnocení po kategoriích (technika, taktika, fyzično, mentalita)
├── volný text, doporučení (sledovat dál / doporučit / zamítnout)
├── verze[] (historie úprav)
└── confidence_self_reported (skaut sám ohodnotí jistotu svého závěru)

VideoClip
├── match_id, player_id (nullable — může být týmový klip)
├── timestamp_start, timestamp_end, typ akce, confidence_score
├── homografické souřadnice (pozice na hřišti)
└── linked_performance_snapshot_id

Watchlist
├── owner_id (klub/uživatel), název, účel (pozice, rozpočet)
├── položky[] (player_id, priorita, stav, datum přidání)
└── historie_změn[] (kdo, kdy, co změnil)

Competition
├── název, země, úroveň soutěže
└── league_strength_index (časová řada, ne fixní číslo)

User
├── role (terénní skaut / head of scouting / ředitel / analytik / agent)
├── oprávnění (RBAC matice)
└── kalibrační_skóre (jen pro roli skaut)
```

**Klíčový princip:** žádná entita není statická — `Player`, `PerformanceSnapshot` i fyzické parametry jsou vždy vázané na časové okno, protože hráč v 17 letech a hráč v 21 letech je pro rozhodování jiný "záznam", i když stejná osoba.

---

## 5. API design (výběr klíčových endpointů)

```
GET  /players/{id}/timeline          → kompletní historie (reporty, snapshoty, klipy) chronologicky
GET  /players/search                 → filtrování podle pozice, věku, stylu, rozpočtu, scoring profilu
POST /players/{id}/reports           → nový scout report (validace povinných polí podle šablony pozice)
GET  /players/{id}/similar           → similarity engine, parametry: váha_stylu, váha_rozpočtu
POST /videos/{id}/tags               → ruční přidání/korekce tagu
GET  /videos/{id}/autotag-status     → stav CV zpracování (queued/processing/done/failed) s progress %
GET  /watchlists/{id}/conflicts      → detekce rozporů v hodnocení napříč skauty
GET  /scouts/{id}/calibration        → kalibrační report jednotlivého skauta
POST /export/executive-summary       → generování jednostránkového PDF pro vedení
```

Všechny endpointy vracejí `data_confidence` metadata tam, kde je výstup založený na modelu (CV tagging, predikce), aby frontend mohl vizuálně odlišit jistá data od odhadů.

---

## 6. UX principy a klíčové obrazovky

### 6.1 Obecné principy
- **Nikdy prázdná obrazovka bez akce** — i "žádné výsledky" nabízí next step.
- **Barevný jazyk konzistentní napříč appkou:** zelená = doporučeno/nízké riziko, žlutá = sledovat/střední riziko, červená = nedoporučeno/vysoké riziko — používá se stejně v reportech, grafech i shortlistách.
- **Progresivní odhalování složitosti** — základní pohled je jednoduchý (skóre, doporučení, klip), detail (feature importance, syrová data) je jeden klik hluboko, ne defaultně na očích.
- **Offline-first jako architektonický požadavek**, ne dodatečná záplata.

### 6.2 Klíčová obrazovka: Player Profile
- Header: foto, jméno, klub, věk, pozice, aktuální tržní hodnota, kontraktová situace (barevně odlišený countdown).
- Hlavní scoring karta s vysvětlením (ne jen číslo — "vysoko kvůli defenzivní práci a soubojovosti, níže kvůli slabší standardní situaci").
- Tab systém: Statistiky | Video | Reporty skautů | Historie kariéry | Podobní hráči.
- Sticky akční panel: "Přidat do shortlisty", "Vytvořit executive summary", "Přiřadit skauta".

### 6.3 Klíčová obrazovka: Live Tagging (mobil, na stadionu)
- Fotbalové hřiště jako vizuální mapa s pozicemi hráčů (tap na hráče → nabídka rychlých akcí).
- Velké dotykové plochy (skaut se nedívá pořád na displej), potvrzovací vibrace místo vizuálního potvrzení.
- Offline indikátor vždy viditelný, ale nikdy blokující.

### 6.4 Klíčová obrazovka: Head of Scouting Dashboard
- Mapa pokrytí — které ligy/pozice jsou aktivně sledované vs. slepá místa.
- Seznam otevřených rozporů mezi skauty vyžadujících rozhodnutí.
- Kalendář nadcházejících zápasů s návrhem, koho poslat (na základě blízkosti a specializace).

---

## 7. Nefunkční požadavky

| Oblast | Požadavek |
|---|---|
| Výkon | Načtení Player Profile < 1s na 4G; live tagging musí reagovat < 100ms na dotyk |
| Offline | Plná funkčnost tagování a čtení dat bez připojení, sync na pozadí bez blokace UI |
| Škálovatelnost | Video pipeline musí zvládnout paralelní zpracování desítek zápasů současně (queue-based, ne synchronní) |
| Bezpečnost | RBAC na úrovni entit (agent nevidí interní hodnocení), audit log všech přístupů k citlivým datům |
| GDPR / ochrana dat nezletilých | Hráči do 18 let mají zpřísněný přístupový režim (menší okruh uživatelů s oprávněním), datové retence a souhlasy podle jurisdikce klubu |
| Dostupnost | 99.5% uptime pro core API, video pipeline může mít vyšší toleranci (asynchronní zpracování) |
| Lokalizace | Multi-jazyčné reporty (skaut píše ve svém jazyce, sportovní ředitel čte v jeho) — strojový překlad s možností ruční korekce |
| Auditovatelnost | Žádné tiché přepisy dat — každá změna reportu, scoringu, watchlisty má historii kdo/kdy/proč |

---

## 8. Bezpečnost a compliance (rozšířeno)

- Šifrování dat v klidu i při přenosu (at rest + in transit).
- Oddělené prostředí (tenant isolation) pro každého klienta v multi-klubovním nasazení (agentury) — data klubu A nikdy nejsou dostupná klubu B ani při chybě konfigurace.
- Zvláštní režim pro data nezletilých hráčů: omezený okruh rolí s přístupem, automatické maskování citlivých polí (kontaktní údaje, zdravotní historie) mimo tento okruh.
- Pravidelný penetrační test a review přístupových práv (kvartální audit RBAC matice).

---

## 9. Tech stack s odůvodněním

| Vrstva | Volba | Proč |
|---|---|---|
| Backend API | Python/FastAPI nebo Go | Rychlý vývoj (FastAPI) vs. výkon při vysoké zátěži (Go) — volba podle týmu |
| Video pipeline | Vlastní CV model (detekce objektů) + frontové zpracování (queue) | Tagging musí běžet asynchronně, nesmí blokovat UI ani API |
| Databáze | PostgreSQL + časová řada (TimescaleDB extension) | Performance snapshoty jsou svou podstatou časové řady |
| Frontend web | React/Next.js, PWA | Offline-first přes Service Worker, jedna codebase pro desktop i mobilní web |
| Mobilní appka (terénní tagging) | Nativní (Swift/Kotlin) nebo React Native | Kamera, offline úložiště, haptika — nativní výkon dává smysl u appky používané na stadionu |
| Fronty / zpracování na pozadí | Kafka nebo RabbitMQ + Celery workers | Zpracování videa a synchronizace musí být odolné vůči výpadkům |
| Vyhledávání a similarity | Vektorová databáze (např. pgvector) pro similarity engine | Umožňuje rychlé "najdi podobné" dotazy nad multidimenzionálním profilem hráče |

---

## 10. Testovací a QA strategie

- **Unit testy** na scoring logiku — kritické, protože chyba ve váhování metrik se promítne do všech doporučení.
- **Shadow mode** pro nové verze scoring modelu — nová verze běží paralelně se starou, srovnávají se výstupy dřív, než se nasadí ostrým uživatelům.
- **Human-in-the-loop validace** CV tagging modelu — pravidelný vzorek automaticky vytvořených tagů kontrolovaný lidmi, měření přesnosti v čase.
- **Offline sync testy** — simulace výpadku signálu uprostřed tagování, ověření že se nic neztratí a nevznikne duplicita.
- **Zátěžové testy** video pipeline při simulaci více zápasů nahraných současně (např. celé kolo ligy v sobotu).

---

## 11. Fázový rozjezd (roadmap)

**Fáze 1 — Jádro (MVP, ale bez kompromisů v kvalitě toho, co je uvnitř)**
Player Profile, ruční scout reporty, základní shortlisty, offline tagging bez CV (jen manuální), import statistik z jednoho datového feedu.

**Fáze 2 — Video inteligence**
Auto-tagging s human-in-the-loop korekcí, highlight reely podle šablon, synchronizace video-data.

**Fáze 3 — AI vrstva**
Vlastní scoring model dle filozofie klubu, similarity engine, predikce vývoje a zranění.

**Fáze 4 — Škálování na síť**
Multi-klub podpora (agenturní model), kalibrace skautů, pokročilý RBAC a audit, executive summary export.

---

## 12. Rozšíření datové vrstvy — pokročilé metriky

Trh nabízí čím dál sofistikovanější metriky (xT, packing rate, tracking-based fyziologická data). Než se libovolná metrika přidá do produktu, musí projít jednoduchým testem: **je reálně dostupná i pro hráče, které skautujeme, ne jen pro náš vlastní tým?** Bez tohoto rozlišení produkt slibuje víc, než může plošně dodržet.

### 12.1 Vrstva A — Event-based metriky pro scoutované cíle (rozšířit Modul B1)

Dostupné přes licencované datové poskytovatele (StatsBomb, Opta, Impect) i pro zahraniční hráče, protože vycházejí ze standardního video záznamu zápasu, ne z vybavení konkrétního klubu:

- **xT (Expected Threat) a Non-Shot xG** — hodnota jakékoliv akce (přihrávka, vedení míče, náběh) k vytvoření gólové příležitosti, nejen finální střely.
- **Line-Breaking Passes & Runs** — počet překonaných obranných linií soupeře přihrávkou nebo náběhem bez míče.
- **Packing Rate** — počet soupeřových hráčů vyřazených ze hry jednou akcí (metodika licencovaná od Impectu, ne stavět od nuly).
- **Opponent Adjusted Metrics** — vážení výkonu podle kvality soupeře (gól týmu z čela tabulky ≠ gól poslednímu v tabulce). Toto je přímé rozšíření League Strength Adjustment z Kroku 2 matematické specifikace o druhou úroveň — sílu konkrétního soupeře v konkrétním zápase, ne jen soutěže jako celku.
- **Consistency Rating** — směrodatná odchylka výkonu napříč zápasy; odlišuje stabilního hráče od hráče se třemi neviditelnými zápasy na jeden výjimečný.
- **Clutch Performance Factor** — srovnání výkonu za vyrovnaného/nepříznivého stavu vs. za rozhodnutého zápasu.

**Doporučení:** licencovat od datového poskytovatele a napojit jako další vstupní metriky do existujícího AHP váhového systému (Krok 4) — žádná nová architektura, jen rozšíření vstupního vektoru.

### 12.2 Vrstva B — Trackingové a fyziologické metriky pro VLASTNÍ kádr

Vyžadují optický tracking nebo GPS vesty (SkillCorner, STATSports, Second Spectrum). **Kritické omezení: tahle data existují prakticky jen pro hráče vlastního klubu z tréninku a domácích zápasů.** Cizí klub GPS data svého hráče neposkytne — nejde je tedy nabízet jako plošnou scoutingovou funkci pro cizí hráče, jen jako modul pro monitoring vlastního kádru (a případně nově příchozích hráčů po podpisu).

- **High-Intensity Accel/Decel Profile** — počet a intenzita prudkých zrychlení/zpomalení.
- **Speed Decay** — pokles maximální rychlosti v průběhu 90 minut (odpadá hráč po 60. minutě?).
- **Recovery Time between Sprints** — jak rychle se obnovuje výbušnost po sprintu.
- **Biomechanical Load & Asymmetry** — detekce mikropohybů indikujících svalovou nerovnováhu nebo skryté zranění, jako doplňkový vstup do Injury Risk modelu (B3).
- **Pressing Resistance** — úspěšnost přihrávek/držení míče v závislosti na vzdálenosti a rychlosti blížícího se obránce.
- **Decisions under Time Pressure** — úspěšnost řešení podle reakčního času od převzetí míče. Vyžaduje frame-přesná tracking data synchronizovaná s událostmi — dostupné jen u malého počtu poskytovatelů a nákladné.

**Doporučení:** samostatný modul "Interní výkonnostní monitoring" navázaný na GPS/tracking vybavení klubu, jasně oddělený od scoutingu cizích hráčů, aby nevznikalo očekávání, že tahle data budou k dispozici plošně.

### 12.3 Vrstva C — Explicitně NEAUTOMATIZOVAT

- **Scan Rate** (frekvence otáčení hlavy) — koncepčně hodnotná metrika, ale dnes se prakticky měří ručně video-analytikem, ne spolehlivou počítačovou vizí. Zůstává jako poznámka ve scout reportu, ne jako automatizované číslo, dokud se metodika neprokáže na velkém vzorku.
- **Body Language / Micro-reactions** — automatické vyhodnocování frustrace, postoje nebo "charakteru" hráče z videa pomocí AI se explicitně **nezahrnuje jako algoritmické skóre**. Rozpoznávání emocí z pohybu/mimiky má vysokou chybovost a je náchylné ke zkreslení, a v kontextu náboru lidí (byť sportovců) hrozí, že by automatizovaný "attitude score" nechtěně zavedl neobjektivní nebo diskriminační rozhodování do procesu, který má být transparentní (viz checklist v Kapitole 13 — vysvětlení u každého skóre). Mentalita a charakter hráče zůstávají doménou lidského pozorování skauta v strukturovaném reportu (Modul C1), ne černé skříňky.

## 13. Co odlišuje "vymazlené" od "hotového" — checklist detailů, které se běžně přeskakují

- [ ] Undo historie u tagování (ne jen jednorázové potvrzení)
- [ ] Vysvětlení u každého AI skóre (feature importance), nikdy holé číslo
- [ ] Detekce konfliktu při duplicitním reportu na stejný zápas
- [ ] Vizuální odlišení jistých dat od odhadovaných (confidence indikátory)
- [ ] Kalibrace skautů jako průběžná zpětná vazba, ne jednorázové hodnocení
- [ ] Zvláštní ochranný režim pro nezletilé hráče v datovém modelu od začátku, ne jako dodatek
- [ ] Offline mód jako architektonický základ, ne fallback
- [ ] Auditní log každé změny citlivých dat
- [ ] Konzistentní barevný/vizuální jazyk napříč všemi moduly
- [ ] Žádná obrazovka bez nabízeného dalšího kroku
