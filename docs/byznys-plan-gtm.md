# ScoutOS — Byznys plán a Go-to-Market strategie

> Poznámka k číslům: tržní odhady níže jsou ilustrativní rámce pro plánování, ne ověřená tržní data. Než se stanou podkladem pro investory, je potřeba je ověřit vlastním průzkumem nebo placenou analýzou trhu (Deloitte Sports, Two Circles, apod.).

---

## 1. Executive summary

ScoutOS je scoutingová platforma, která spojuje video inteligenci, datové AI hodnocení a skautskou CRM vrstvu do jednoho pracovního toku — a jako jediná na trhu dělá scoring hráčů transparentně nastavitelný podle herní filozofie konkrétního klubu. Cílíme na profesionální fotbalové kluby druhé až první ligové úrovně v Evropě, skautingové agentury a nezávislé skauty, kteří dnes žonglují mezi 3–4 nekomunikujícími nástroji (Wyscout pro data, Hudl pro video, Excel pro shortlisty, WhatsApp pro koordinaci).

**Klíčová sázka:** kluby nekupují "další datový nástroj" — kupují rychlejší a míň riskantní rozhodnutí o multi-milionových transferech. Cena produktu se odvíjí od hodnoty ušetřeného/vydělaného rozhodnutí, ne od počtu uživatelských účtů.

---

## 2. Analýza trhu

### 2.1 Velikost trhu (rámcový odhad)

- **Cílový segment:** profesionální fotbalové kluby v Evropě (cca 700–900 klubů v top 4 ligových úrovních napříč hlavními zeměmi), skautingové agentury (odhadem stovky aktivních subjektů), nezávislí skauti a analytici.
- **Průměrná ochota platit:** kluby 2. a 3. ligy dnes typicky utrácejí nízké tisíce až nízké desítky tisíc EUR ročně za datové/video nástroje; kluby 1. ligy a výše řádově víc.
- **Přístup k odhadu SOM (Serviceable Obtainable Market):** realistický cíl pro první 3 roky je desítky až nízké stovky klubů/agentur, ne stovky tisíc koncových uživatelů — je to B2B trh s dlouhým prodejním cyklem, ne masový spotřebitelský produkt.

### 2.2 Tržní trendy ve prospěch produktu

- Konsolidace "data + video" poptávky — kluby čím dál víc odmítají platit zvlášť za datový feed a zvlášť za video nástroj.
- Rostoucí tlak na efektivitu přestupového rozhodování u klubů se středním rozpočtem, které si nemohou dovolit chybu za miliony eur.
- Rostoucí dostupnost licencovatelných pokročilých metrik (xT, packing) od specializovaných poskytovatelů — snižuje bariéru k nabídce sofistikovaných metrik bez nutnosti stavět vlastní CV pipeline od nuly.

### 2.3 Rizika trhu

- Rozpočty menších klubů jsou volatilní (sestup do nižší soutěže = okamžité škrty v nesportovních výdajích).
- Velcí hráči (Wyscout/Hudl) mají síťové efekty a dlouhodobé kontrakty s ligami — nelze čekat rychlé vytěsnění, jen výklenkovou pozici.

---

## 3. Konkurenční krajina

| Konkurent | Silná stránka | Slabina, kterou ScoutOS cílí |
|---|---|---|
| Wyscout | Obrovská databáze zápasů a hráčů, síťový efekt | Scoring je univerzální, ne přizpůsobený filozofii klubu; slabé propojení video-data |
| Hudl / InStat | Silný video engine, oblíbený u trenérů | Slabší AI vrstva pro scouting rozhodování, CRM funkce chybí nebo jsou povrchní |
| Scout7 | Zavedený v CRM části skautingu | Zastaralé UI, slabá video integrace, žádná transparentní AI vrstva |
| SkillCorner / Second Spectrum | Nejlepší tracking data | Pouze datová vrstva, žádný kompletní workflow, cena mimo dosah menších klubů |
| Excel + WhatsApp (status quo u menších klubů) | Zdarma, flexibilní | Žádná škálovatelnost, ztráta institucionální paměti při odchodu skauta |

**Bílé místo na trhu:** nikdo nekombinuje (a) transparentní, klubem konfigurovatelný scoring model, (b) přímé prokliknutí ze statistiky do videa a (c) kalibraci lidského úsudku skautů do jednoho produktu. To je pozice, kterou ScoutOS zabírá.

---

## 4. Positioning

**Positioning statement:**
> Pro sportovní ředitele a hlavní skauty klubů, kteří potřebují rychlá a obhajitelná rozhodnutí o transferech, je ScoutOS scoutingová platforma, která propojuje video, data a lidský úsudek do jednoho transparentního pracovního toku — na rozdíl od Wyscoutu nebo Hudlu nenutí tým skákat mezi nástroji a nedává univerzální černou skříňku místo skóre přizpůsobeného stylu klubu.

**Tři pilíře zprávy navenek:**
1. "Skóre, který rozumíš" — transparentnost a přizpůsobitelnost filozofii klubu.
2. "Od čísla ke klipu jedním kliknutím" — video-data integrace.
3. "Víme, komu z vašich skautů věřit víc" — kalibrace lidského úsudku, ne jen dat.

---

## 5. Byznys model a cenotvorba

### 5.1 Segmentace a tiery

| Tier | Cílový zákazník | Obsah | Orientační cena (roční) |
|---|---|---|---|
| **Scout Solo** | Nezávislý skaut, freelancer | Reporty, watchlisty, omezený počet hráčských profilů/měsíc | Nízké stovky EUR/rok |
| **Club Standard** | Klub 2.–3. ligy | Plný modul C (CRM) + Modul B (data/AI) bez pokročilého trackingu, do X uživatelů | Nízké tisíce až nízké desítky tisíc EUR/rok |
| **Club Pro** | Klub 1. ligy / ambiciózní 2. liga | Vše ze Standard + Modul A (video inteligence) + přizpůsobitelný scoring model + interní performance monitoring (Vrstva B metrik) | Desítky tisíc EUR/rok |
| **Agency** | Skautingová/agenturní firma s více klienty | Multi-tenant správa, řízený přístup pro klienty, bez interního video trackingu | Cena podle počtu spravovaných klientů/hráčů |

### 5.2 Doplňkové zdroje příjmu

- **Prémiové AI moduly** (similarity engine, predikce zranění, ROI/resale value index) jako add-on nad Club Standard.
- **Datové partnerství** — marže na zprostředkování licencovaných pokročilých metrik (xT, packing) od třetích poskytovatelů.
- **Onboarding a konzultační balíček** — nastavení AHP váhového dotazníku a scoring modelu na míru klubu jako placená implementační služba (jednorázový příjem navíc k SaaS předplatnému).

### 5.3 Unit economics — na co se dívat

- **CAC (Customer Acquisition Cost):** u B2B s dlouhým cyklem (kluby) bude vyšší než u samoobslužného SaaS — počítat s prodejním cyklem 3–9 měsíců u klubů.
- **LTV:** klíčové je udržet klub přes výměnu sportovního ředitele/hlavního skauta — pokud je nástroj navázaný jen na jednu osobu, odchod te osoby = riziko ztráty zákazníka. Produkt by měl aktivně budovat "institucionální paměť" (historie reportů, kalibrace) jako přepínač zvyšující náklady na odchod (switching cost).
- **Payback period:** cílem je návratnost CAC do 12–18 měsíců u Club tierů.

---

## 6. Go-to-market strategie

### 6.1 Fáze 1 — Návrhové kluby (Design Partners)

Než se cokoliv prodává plošně, najít 2–4 kluby (ideálně 2.–3. liga, protože mají bolest, ale ne rozpočet Wyscoutu) ochotné testovat produkt výměnou za slevu/zdarma přístup a zpětnou vazbu. Cíl: doladit produkt na reálném provozu, získat referenční case study.

**Kanál:** přímý networking (bývalí hráči/skauti v týmu, osobní kontakty ve fotbalovém prostředí), ne plošná reklama.

### 6.2 Fáze 2 — Reference-driven prodej

- **Case studies** z návrhových klubů ("jak klub X našel hráče Y za polovinu ceny díky similarity engine").
- **Konferenční přítomnost** — fotbalové analytické konference (např. StatsBomb Conference, Opta Forum a podobné akce) jsou místo, kde se sportovní ředitelé a hlavní skauti fyzicky potkávají.
- **Doporučení mezi kluby** — fotbalové prostředí je malé a provázané, sportovní ředitelé a skauti se běžně pohybují mezi kluby; jeden spokojený zákazník je silný distribuční kanál.

### 6.3 Fáze 3 — Škálování na agentury a nezávislé skauty

Až bude produkt ověřený na úrovni klubů, samoobslužný nižší tier (Scout Solo) pro nezávislé skauty a menší agentury — nižší CAC, motor růstu uživatelské báze a zdroj dalších leadů na kluby (skaut používající nástroj osobně ho doporučí svému klubu).

### 6.4 Prodejní motion

- **Kluby:** enterprise-style prodej s demem na míru (ukázat nástroj na skutečném hráči, kterého klub aktuálně sleduje), rozhodovací proces zahrnuje sportovního ředitele i IT/finance.
- **Agentury a solo skauti:** product-led growth — bezplatná zkušební verze, samoobslužné onboardění.

---

## 7. Rizika a mitigace

| Riziko | Dopad | Mitigace |
|---|---|---|
| Dlouhý prodejní cyklus u klubů vyčerpá cash flow | Vysoký | Paralelně budovat Scout Solo tier jako rychlejší zdroj příjmu a testovací základnu |
| Závislost na datových partnerech pro pokročilé metriky | Střední až vysoký | Diverzifikovat poskytovatele, mít smluvně ošetřenou náhradu při výpadku partnera |
| Odchod klíčové kontaktní osoby v klubu (sportovní ředitel/skaut) | Střední | Produkt navázaný na institucionální data klubu, ne jen na jednu osobu (viz LTV sekce) |
| Sezónnost rozpočtu klubů (přestupová okna) | Střední | Zarovnat prodejní cyklus a fakturaci s přestupovými okny, ne s kalendářním rokem |
| Regulatorní riziko u dat nezletilých hráčů | Střední | Řešeno už v produktovém návrhu (zvláštní přístupový režim, viz PRD kapitola 8) — nutné mít i právní review specifické pro každou jurisdikci |

---

## 8. Tým a najímání (rámcově pro první fázi)

- **Produktový/technický zakladatel** — vlastník vize a architektury (pravděpodobně už jsi ty).
- **Full-stack vývojář se zkušeností s video pipeline** — kritická role pro Modul A.
- **Data scientist / ML inženýr** — scoring model, similarity engine, predikce.
- **Someone s fotbalovým doménovým backgroundem** (bývalý skaut/analytik) — kalibrace produktu na realitu, věrohodnost při prodeji klubům.
- **Sales/BD s kontakty ve fotbalovém prostředí** — bez sítě kontaktů je B2B prodej klubům extrémně pomalý.

---

## 9. KPI a metriky úspěchu

- **Počet aktivních klubů/agentur** (ne počet jednotlivých uživatelských účtů — to zavádí u B2B).
- **Retention rate klubů rok přes rok** (klíčový signál institucionální hodnoty, ne jen líbivosti produktu).
- **Podíl reportů vytvořených offline a úspěšně synchronizovaných** — proxy metrika pro spolehlivost klíčové technické výhody (offline-first).
- **Kalibrační skóre napříč skauty v systému** — pokud produkt reálně pomáhá skautům zlepšovat úsudek v čase, mělo by být vidět zlepšování průměrné kalibrace.
- **Time-to-value** — jak rychle po nasazení klub vytvoří první kompletní shortlistu s reporty (cíl: týdny, ne měsíce).

---

## 10. Roadmapa k příjmům (navazuje na fázový rozjezd v PRD)

| Fáze produktu (viz PRD kap. 11) | Obchodní milník |
|---|---|
| Fáze 1 — Jádro (MVP) | 2–4 návrhoví klubi zdarma/se slevou, sběr zpětné vazby |
| Fáze 2 — Video inteligence | První placené kontrakty Club Standard, první case study |
| Fáze 3 — AI vrstva | Upsell na Club Pro, spuštění Scout Solo samoobslužného tieru |
| Fáze 4 — Škálování na síť | Agency tier, expanze do dalších ligových trhů, konferenční přítomnost |

---

## 11. Shrnutí — proč by tohle mohlo fungovat

Produkt řeší reálnou, dobře zdokumentovanou bolest (fragmentace nástrojů, netransparentní scoring, chybějící propojení dat a videa) pro zákazníky, kteří mají peníze a motivaci platit za snížení rizika multi-milionových rozhodnutí. Diferenciace není kosmetická — transparentní, klubem konfigurovatelný scoring a kalibrace lidského úsudku jsou strukturální výhody, které konkurenti nemají zabudované v architektuře, takže je nemohou snadno zkopírovat jako "další feature". Hlavní riziko není produktové, ale prodejní — B2B cyklus ve fotbale je pomalý a vztahově řízený, takže úspěch fáze 1 (design partners) rozhodne o tempu všeho, co přijde potom.
