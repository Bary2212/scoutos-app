# ScoutOS — Matematická specifikace scoring modelu

## 0. Cíle modelu (co musí splňovat, jinak je zbytečný)

1. **Srovnatelnost napříč ligami** — 8 gólů ve 3. lize ≠ 8 gólů v Bundeslize.
2. **Adaptabilita na styl klubu** — model musí umět vážit metriky jinak pro gegenpressing klub a jinak pro klub stavějící na držení míče.
3. **Odolnost vůči malému vzorku dat** — hráč po 200 minutách nesmí dostat extrémní skóre jen kvůli šťastné sérii.
4. **Transparentnost** — každé skóre musí jít rozložit na příspěvky jednotlivých metrik (žádná černá skříňka).
5. **Práce s nejistotou** — výstupem není jen číslo, ale číslo + interval spolehlivosti.
6. **Kombinace s lidským úsudkem** — objektivní data a subjektivní hodnocení skauta se neváží 50:50 naslepo, ale podle prokázané kalibrace skauta.

Pipeline má 7 kroků. Každý krok je samostatně testovatelný a nahraditelný (žádný krok není "zadrátovaný" do dalšího).

---

## 1. Krok 1 — Normalizace na expozici

Surová statistika `X_raw` (např. počet klíčových přihrávek za sezónu) se nejprve převede na intenzitu:

```
X_per90 = X_raw × (90 / minutes_played)
```

To ale nestačí — hráč v týmu, který drží míč 70 % času, má přirozeně víc příležitostí k přihrávkám než hráč v týmu s 40% držením. Proto **possession-adjustment**:

```
X_adj = X_per90 × (league_avg_possession / team_possession)
```

Výsledek: `X_adj` je metrika očištěná od stylu týmu, ne jen od odehraného času.

---

## 2. Krok 2 — League Strength Adjustment (LSA)

Toto je nejkritičtější a nejčastěji podceňovaný krok. Definujeme **League Strength Index** `L` pro každou soutěž, odvozený ze tří komponent:

```
L = w1 × UEFA_koeficient_normalizovaný
  + w2 × transfer_flow_index      (poměr hráčů odcházejících nahoru vs. přicházejících)
  + w3 × historical_success_rate  (jak si hráči z této ligy vedli po přestupu do vyšších soutěží)
```

kde `w1 + w2 + w3 = 1` (doporučené výchozí váhy: 0.5 / 0.3 / 0.2, kalibrovatelné zpětným testováním).

`L` je normalizované do rozsahu `[0.3, 1.0]`, kde `1.0` = referenční nejsilnější liga.

Adjustovaná metrika:

```
X_league_adj = X_adj × f(L)
```

kde `f(L)` **není lineární** — rozdíl mezi ligou 0.9 a 1.0 je menší než rozdíl mezi 0.4 a 0.5 (efekt klesajících mezních rozdílů síly). Doporučená funkce:

```
f(L) = 1 / L^γ      (γ ≈ 0.6, kalibrováno na historických přestupech)
```

Tzn. čím slabší liga, tím víc se výkon "diskontuje", ale ne lineárně — model musí být validován zpětně na reálných přestupech (hráč přešel z ligy síly L=0.5 do L=0.9, jak se změnily jeho čísla → kalibrace γ).

---

## 3. Krok 3 — Pozicová normalizace (percentilový rank)

Různé metriky mají různá měřítka a rozdělení (góly vs. úspěšnost přihrávek). Řešení: převod na **percentilový rank v rámci referenční skupiny stejné pozice a věkové kategorie**:

```
P_i = percentile_rank(X_league_adj, referenční_skupina = stejná_pozice ∩ podobný_věk)
```

Percentil místo z-skóre je záměrná volba — je odolnější vůči extrémním odlehlým hodnotám (jeden hattrick nezkreslí celé rozdělení tak jako u z-skóre) a je intuitivně čitelný pro netechnické uživatele (sportovní ředitel rozumí "je v top 10 % ligy").

---

## 4. Krok 4 — Váhový vektor podle role a filozofie klubu

Pro každou pozici existuje sada relevantních metrik `{P_1, P_2, ..., P_n}` (např. pro krajního obránce: defenzivní souboje, počet centrů, rychlost návratu do obrany, přesnost dlouhých přihrávek...).

Klub definuje svou filozofii přes **dotazník s párovým porovnáváním** (Analytic Hierarchy Process) — místo aby si klub sám vymýšlel čísla vah (což lidé dělají nekonzistentně), porovnává dvojice priorit ("je pro nás důležitější rychlost přechodu do útoku, nebo defenzivní stabilita?") a systém z toho odvodí konzistentní váhový vektor `w = (w_1, ..., w_n)`, kde `Σw_i = 1`.

Objektivní dílčí skóre hráče pro danou pozici:

```
S_objective = Σ (w_i × P_i)
```

**Kontrola konzistence:** AHP dotazník počítá tzv. consistency ratio — pokud klub odpovídá nelogicky (A > B, B > C, ale C > A), systém na to upozorní a nechá dotazník zopakovat.

---

## 5. Krok 5 — Bayesovské zmenšení (shrinkage) pro malé vzorky

Hráč s 300 odehranými minutami má statisticky nespolehlivá čísla. Naivní model by ho mohl vystřelit na vrchol žebříčku kvůli náhodné sérii. Řešení: **empirical Bayes shrinkage** směrem k pozicovému průměru, váhované podle objemu dat:

```
P_i_shrunk = (n / (n + k)) × P_i + (k / (n + k)) × P_i_pozicni_prumer
```

kde:
- `n` = počet odehraných minut (nebo relevantních akcí, podle metriky),
- `k` = shrinkage konstanta specifická pro danou metriku (metriky s vysokou přirozenou variancí, jako góly, mají vyšší `k` než stabilní metriky jako úspěšnost přihrávek).

Efekt: při malém `n` skóre táhne směrem k průměru (opatrnost), při velkém `n` se blíží syrovému percentilu (důvěra v data). `k` se kalibruje zpětným testováním — jak moc kolísala metrika hráčů s podobným `n` v dalších zápasech.

---

## 6. Krok 6 — Věková křivka a projekce potenciálu

Aktuální výkon (`S_objective`) je popis současnosti, ne budoucnosti. Pro projekci potenciálu:

```
S_projected(t) = S_objective + Δ(age, position) × t
```

kde `Δ(age, position)` je očekávaná roční změna výkonu odvozená z **historických křivek srovnatelné referenční skupiny** (hráči stejné pozice, kteří byli ve stejném věku na podobné percentilové úrovni — tzv. "nearest neighbor" kariérní křivky, ne univerzální křivka pro všechny).

Model vrací **rozdělení pravděpodobnosti**, ne jeden bod:

```
S_projected(t) ~ Normal(μ = S_objective + Δ×t, σ = σ(age, sample_size_referenční_skupiny))
```

Rozptyl `σ` roste s délkou projekce (predikce na 3 roky dopředu je méně jistá než na 1 rok) a klesá s velikostí referenční skupiny podobných hráčů.

---

## 7. Krok 7 — Kombinace s hodnocením skauta (human-in-the-loop blending)

Finální skóre nesmí ignorovat lidský úsudek (vidí věci, co čísla nezachytí — mentalitu, řeč těla, chování v šatně), ale ani mu nesmí naslepo věřit stejně u všech skautů. Váha subjektivního hodnocení se odvíjí od **kalibračního skóre skauta** `C_scout ∈ [0, 1]`, počítaného zpětně z historie (jak dobře predikce skauta v minulosti odpovídaly realitě — uplatnění hráče, vývoj po podpisu):

```
Final_Score = α × S_objective_final + (1 − α) × S_subjective_scout
```

kde:

```
α = base_α + (1 − base_α) × (1 − C_scout)
```

Tzn. čím vyšší kalibrace skauta (`C_scout` blízko 1), tím větší váhu dostává jeho subjektivní hodnocení (α se snižuje směrem k base_α); čím nižší kalibrace nebo čím míň reportů skaut má v historii, tím víc se model spoléhá na objektivní data. `base_α` (typicky 0.6–0.7) zajišťuje, že model nikdy zcela neodstraní objektivní vrstvu ani u nejlépe kalibrovaného skauta — je to pojistka proti přeceňování jednoho člověka.

**Rozpor jako signál, ne šum:** pokud `|S_objective_final − S_subjective_scout| > threshold`, systém to needocuje potichu do průměru, ale vytvoří rozporový tiket (viz Modul C3 v PRD) — velký rozdíl mezi daty a okem skauta je cenná informace sama o sobě (buď skaut vidí něco, co čísla nezachytí, nebo se mýlí — obojí stojí za prošetření).

---

## 8. Vysvětlitelnost (explainability) — dekompozice skóre

Pro každé finální skóre systém generuje rozklad příspěvků jednotlivých metrik na finální hodnotu, analogicky ke Shapley values:

```
Contribution_i = w_i × (P_i_shrunk − P_i_pozicni_prumer)
```

Součet příspěvků + základní (pozicní průměrné) skóre = finální `S_objective`. To umožňuje větu typu:

> "Hráč skóruje nad průměrem hlavně díky defenzivním soubojům (+8 bodů) a rychlosti přechodu (+5 bodů), táhne ho dolů slabší standardky (−3 body)."

Tohle je věta z Kroku 4 v PRD (žádné holé číslo bez vysvětlení) — a je to přímý matematický důsledek lineární váhové kombinace, ne dodatečně vymyšlený text.

---

## 9. Kompletní pipeline v jedné rovnici

```
Final_Score(hráč, klub, t) =

  α(C_scout) × [ Σ_i w_i(klub, pozice) × shrink( percentile( LSA( possession_adj( per90(X_raw_i) ) ) ), n_i ) ]
                                                        │
                                                        └─→ + Δ(age, pozice) × t   [projekce, pokud t > 0]

  + (1 − α(C_scout)) × S_subjective_scout
```

---

## 10. Ilustrativní příklad s čísly

Krajní obránce, 21 let, 800 odehraných minut v lize se silou `L = 0.65`.

| Krok | Metrika: "úspěšné defenzivní souboje" | Hodnota |
|---|---|---|
| Raw | 42 soubojů za sezónu | — |
| Per 90 | 42 × (90/800×odehrané zápasy) | 2.1 / zápas |
| Possession-adj | týmové držení 45 % vs. ligový průměr 50 % | 2.1 × (50/45) = 2.33 |
| League adj (γ=0.6) | f(0.65) = 1/0.65^0.6 ≈ 1.26 | 2.33 × 1.26 = 2.94 |
| Percentil v pozici/věku | 2.94 odpovídá 78. percentilu | P = 0.78 |
| Shrinkage (n=800, k=1000 pro tuto metriku) | (800/1800)×0.78 + (1000/1800)×0.55(prům.) | ≈ 0.65 |
| Váha metriky u klubu s defenzivní filozofií | w = 0.22 | příspěvek = 0.22 × 0.65 = 0.143 |

Tenhle příspěvek (0.143) se sečte s příspěvky ostatních metrik (centry, rozehrávka, rychlost...) → `S_objective`. Vidíš na tomto jednom řádku přesně to, co v Kroku 8 znamená "vysvětlitelnost" — každé číslo má dohledatelnou cestu od syrových dat až po finální skóre.

---

## 11. Validace modelu (jak poznáš, že vzorec funguje, ne že jen vypadá chytře)

- **Backtesting:** vezmi hráče přestoupivší před 3 lety, spočítej jim tehdejší `Final_Score`, porovnej s jejich reálným vývojem — model musí mít lepší prediktivní sílu než jednoduchý baseline (např. tržní hodnota v době přestupu).
- **Kalibrační graf:** hráči, kterým model dal skóre v 80. percentilu, by se měli v realitě umístit v 80. percentilu úspěšnosti — pokud model soustavně nadhodnocuje nebo podhodnocuje, `γ` a `k` konstanty potřebují přeladit.
- **Citlivostní analýza:** malá změna vstupní metriky by neměla způsobit skok skóre o desítky bodů (test na stabilitu shrinkage konstant).
- **A/B shadow mode:** nová verze vzorce běží paralelně se starou na reálných datech měsíc před nasazením (viz Modul QA v PRD).
