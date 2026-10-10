import React from "react";
import { Link } from "react-router-dom";

// ─────────────────────────────────────────────────────────────
// ÚDAJE PROVOZOVATELE — doplň před veřejným spuštěním.
// Hodnoty v hranatých závorkách jsou zástupné.
// ─────────────────────────────────────────────────────────────
const OPERATOR = {
  name: "Martin Baran (BARAN STUDIO)",
  ico: "11657626",
  address: "sídlo: Valašská Polanka 228, 756 11",
  email: "info@baranstudio.cz",
};
const UPDATED = "10. 10. 2026";

const C = {
  bg: "#F5F6F1",
  panel: "#FFFFFF",
  ink: "#14201A",
  inkSoft: "#57614F",
  inkFaint: "#8A9284",
  turf: "#2F6B4F",
  line: "#DADDD3",
};
const fontDisplay = "'Space Grotesk', sans-serif";
const fontBody = "'Inter', sans-serif";

function Page({ title, children }) {
  return (
    <div style={{ background: C.bg, minHeight: "calc(100vh - 56px)", fontFamily: fontBody, padding: "32px 20px 64px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <Link to="/prihlaseni" style={{ fontSize: 12, color: C.turf, fontWeight: 600, textDecoration: "none" }}>← Zpět</Link>
        <div style={{ background: C.panel, border: `1px solid ${C.line}`, borderRadius: 8, padding: "28px 32px", marginTop: 14 }}>
          <h1 style={{ fontFamily: fontDisplay, fontSize: 24, fontWeight: 700, color: C.ink, margin: 0 }}>{title}</h1>
          <div style={{ fontSize: 12, color: C.inkFaint, marginTop: 4, marginBottom: 20 }}>Poslední aktualizace: {UPDATED}</div>
          <div style={{ fontSize: 14, color: C.inkSoft, lineHeight: 1.65 }}>{children}</div>
        </div>
        <div style={{ marginTop: 16, textAlign: "center", fontSize: 12, color: C.inkFaint }}>
          <Link to="/podminky" style={{ color: C.inkFaint }}>Podmínky použití</Link>
          {" · "}
          <Link to="/soukromi" style={{ color: C.inkFaint }}>Ochrana osobních údajů</Link>
        </div>
      </div>
    </div>
  );
}

const H = ({ children }) => (
  <h2 style={{ fontFamily: fontDisplay, fontSize: 16, fontWeight: 700, color: C.ink, margin: "26px 0 8px" }}>{children}</h2>
);
const P = ({ children }) => <p style={{ margin: "0 0 10px" }}>{children}</p>;
const UL = ({ children }) => <ul style={{ margin: "0 0 10px", paddingLeft: 20 }}>{children}</ul>;

function OperatorBlock() {
  return (
    <P>
      <strong style={{ color: C.ink }}>{OPERATOR.name}</strong>, IČO: {OPERATOR.ico}, {OPERATOR.address}, e-mail:{" "}
      <a href={`mailto:${OPERATOR.email}`} style={{ color: C.turf }}>{OPERATOR.email}</a> (dále „provozovatel“).
    </P>
  );
}

export function Terms() {
  return (
    <Page title="Podmínky použití ScoutOS">
      <H>1. Provozovatel a služba</H>
      <OperatorBlock />
      <P>
        ScoutOS je webová aplikace pro fotbalové skauty a kluby. Umožňuje evidovat sledované hráče, psát hodnocení
        a reporty, sdílet je v rámci klubu, plánovat zápasy a sledovat pokrytí soutěží. Používáním aplikace nebo
        vytvořením účtu souhlasíš s těmito podmínkami.
      </P>

      <H>2. Účet</H>
      <UL>
        <li>Účet si zakládáš na vlastní jméno a e-mail a jsi povinen uvádět pravdivé údaje.</li>
        <li>Za bezpečnost hesla odpovídáš ty. Přihlašovací údaje nikomu nepředávej.</li>
        <li>Uživatel, který založí klub, je jeho hlavním skautem. Hlavní skaut může přidávat další skauty pozvánkovým kódem, měnit jejich role a vidí hodnocení všech skautů svého klubu.</li>
        <li>Účet můžeš kdykoli zrušit na vlastní žádost (viz kontakt výše).</li>
      </UL>

      <H>3. Obsah a viditelnost dat</H>
      <UL>
        <li>Hodnocení, reporty a poznámky, které do aplikace vložíš, zůstávají tvoje. Jsou soukromé a vidíš je ty a hlavní skaut tvého klubu.</li>
        <li>Základní identifikační údaje hráče (jméno, rok narození) jsou v aplikaci sdílené, aby se hráči nezakládali vícekrát. Změnit je může jen ten, kdo hráče založil, nebo provozovatel.</li>
        <li>Údaje měnící se v čase (klub, soutěž, pozice, smlouva a podobně) si vedeš u svého hodnocení sám a ostatním uživatelům se nepřepisují.</li>
        <li>Pro provoz a podporu může provozovatel k datům přistupovat v nezbytném rozsahu.</li>
      </UL>

      <H>4. Pravidla používání</H>
      <P>Zavazuješ se, že:</P>
      <UL>
        <li>budeš aplikaci používat k legitimní skautingové a sportovní práci,</li>
        <li>nebudeš vkládat nepravdivé, urážlivé nebo diskriminační údaje o hráčích či jiných osobách,</li>
        <li>nebudeš do aplikace vkládat citlivé údaje, které k skautingu nepatří (zdravotní stav, rodinné poměry, kontakty na zákonné zástupce, rodná čísla apod.),</li>
        <li>u hráčů mladších 18 let budeš evidovat jen nezbytné údaje (jméno, rok narození, klub, soutěž, sportovní hodnocení) a zachováš zvýšenou opatrnost,</li>
        <li>nebudeš se pokoušet narušit provoz aplikace ani získat přístup k cizím datům,</li>
        <li>nebudeš data hromadně stahovat ani kopírovat automatizovaně bez souhlasu provozovatele.</li>
      </UL>
      <P>Při porušení pravidel může provozovatel účet omezit nebo zrušit.</P>

      <H>5. Dostupnost a změny</H>
      <P>
        Aplikace je poskytována „tak, jak je“. Provozovatel usiluje o její nepřetržitý provoz, ale nezaručuje
        bezchybnost ani stálou dostupnost. Funkce se mohou měnit, přidávat nebo rušit. O podstatných změnách
        podmínek budeš informován v aplikaci nebo e-mailem.
      </P>

      <H>6. Odpovědnost</H>
      <P>
        Hodnocení a doporučení v aplikaci jsou pomůckou pro rozhodování, nikoli závazným podkladem. Za rozhodnutí
        učiněná na jejich základě odpovídá uživatel. Provozovatel neodpovídá za škody vzniklé nesprávným použitím
        aplikace, za obsah vložený uživateli ani za výpadky mimo jeho kontrolu, a to v rozsahu, v jakém to
        dovoluje zákon. Doporučujeme si svá důležitá data průběžně zálohovat.
      </P>

      <H>7. Ceny</H>
      <P>
        Pokud je aplikace nebo její část zpoplatněna, cena a platební podmínky budou uvedeny před objednáním.
        Tyto podmínky se pak doplní.
      </P>

      <H>8. Ukončení</H>
      <P>
        Smlouvu můžeš ukončit zrušením účtu. Po zrušení účtu se tvoje osobní údaje a soukromá hodnocení smažou podle
        Zásad ochrany osobních údajů, s výjimkou údajů, které je provozovatel povinen uchovat ze zákona.
      </P>

      <H>9. Závěrečná ustanovení</H>
      <P>
        Tyto podmínky se řídí právním řádem České republiky. Případné spory se řeší u věcně a místně příslušných
        českých soudů. Pokud jsi spotřebitel, máš navíc právo obrátit se na Českou obchodní inspekci (www.coi.cz).
        Dotazy a připomínky posílej na{" "}
        <a href={`mailto:${OPERATOR.email}`} style={{ color: C.turf }}>{OPERATOR.email}</a>.
      </P>
    </Page>
  );
}

export function Privacy() {
  return (
    <Page title="Zásady ochrany osobních údajů">
      <H>1. Kdo údaje zpracovává</H>
      <OperatorBlock />
      <P>
        Tyto zásady popisují, jaké osobní údaje ScoutOS zpracovává, proč, jak dlouho a jaká máš práva podle
        nařízení GDPR.
      </P>

      <H>2. Jaké údaje zpracováváme</H>
      <UL>
        <li><strong style={{ color: C.ink }}>Údaje o uživatelích (skautech):</strong> jméno, příjmení, e-mail, zašifrované heslo (heslo samotné nikdy neukládáme), role v klubu, čas registrace a posledního přihlášení, čas souhlasu s podmínkami.</li>
        <li><strong style={{ color: C.ink }}>Skautingová data o hráčích:</strong> jméno, rok narození (ne celé datum), klub, soutěž, pozice, výška, silnější noha, smlouva, agent, odhad tržní hodnoty, hodnocení, statistiky a poznámky skautů.</li>
        <li><strong style={{ color: C.ink }}>Provozní údaje:</strong> plánované zápasy, přidělení skautů a jejich odpovědi, technické záznamy serveru potřebné pro bezpečnost a provoz.</li>
      </UL>
      <P>
        <strong style={{ color: C.ink }}>Údaje o dětech.</strong> Mezi sledovanými hráči mohou být osoby mladší 18 let (mládežnické
        soutěže). Evidujeme u nich jen rok narození a sportovní údaje, nikoli přesné datum narození, adresu, kontakty
        ani zdravotní údaje. Uživatelé jsou povinni dodržovat pravidla v Podmínkách použití, zejména nevkládat
        citlivé údaje.
      </P>

      <H>3. Proč a na jakém základě</H>
      <UL>
        <li><strong style={{ color: C.ink }}>Provoz účtu a poskytování služby</strong> (registrace, přihlášení, ověření e-mailu, fungování klubu) — plnění smlouvy.</li>
        <li><strong style={{ color: C.ink }}>Skautingová evidence hráčů</strong> — oprávněný zájem klubů a skautů na evidenci sportovního výkonu a vyhledávání talentů; zpracování je omezeno na nezbytný rozsah.</li>
        <li><strong style={{ color: C.ink }}>Bezpečnost, prevence zneužití a zlepšování služby</strong> — oprávněný zájem provozovatele.</li>
        <li><strong style={{ color: C.ink }}>Plnění zákonných povinností</strong> (např. účetní a daňové, pokud bude služba zpoplatněna).</li>
      </UL>

      <H>4. Kdo je správce a kdo zpracovatel</H>
      <P>
        Provozovatel je správcem údajů o uživatelích a údajů, které jsou v aplikaci sdílené (jméno a rok narození
        hráče). Soukromá hodnocení, reporty a poznámky skautů zpracovává provozovatel jako zpracovatel pro uživatele
        a jeho klub, kteří určují, co do aplikace vloží.
      </P>

      <H>5. Komu údaje předáváme</H>
      <P>Údaje nikomu neprodáváme. Pro provoz využíváme tyto poskytovatele:</P>
      <UL>
        <li>Render (hosting aplikace a databáze),</li>
        <li>Vercel (hosting webového rozhraní),</li>
        <li>Brevo (odesílání e-mailů, např. ověřovacích kódů).</li>
      </UL>
      <P>
        Tito poskytovatelé zpracovávají údaje pouze podle našich pokynů. Pokud sídlí nebo zpracovávají údaje mimo
        EU/EHP, děje se tak na základě standardních smluvních doložek nebo jiné záruky podle GDPR. Skautingová data
        hráčů vidí ostatní uživatelé pouze v rozsahu popsaném v Podmínkách použití (soukromě skaut a hlavní skaut
        jeho klubu, sdílené identifikační údaje všichni uživatelé).
      </P>

      <H>6. Jak dlouho údaje uchováváme</H>
      <UL>
        <li>Údaje účtu po dobu jeho existence; po zrušení účtu je smažeme, pokud nám zákon neukládá je uchovat.</li>
        <li>Neověřené registrace (kód nebyl zadán) se při opakované registraci přepíšou.</li>
        <li>Skautingová data hráčů po dobu existence účtu, který je vložil; po jeho zrušení se soukromá hodnocení smažou.</li>
        <li>Údaje o hráči smažeme na jeho žádost nebo žádost zákonného zástupce (viz níže).</li>
      </UL>

      <H>7. Cookies a ukládání v prohlížeči</H>
      <P>
        ScoutOS nepoužívá reklamní ani sledovací cookies a žádnou analytiku třetích stran. V úložišti prohlížeče
        (localStorage) je uložen pouze přihlašovací token a základní údaje o přihlášeném uživateli, které jsou
        nezbytné pro fungování přihlášení. Po odhlášení se smažou.
      </P>

      <H>8. Tvoje práva</H>
      <P>Máš právo:</P>
      <UL>
        <li>na přístup k údajům, které o tobě vedeme,</li>
        <li>na opravu nepřesných údajů,</li>
        <li>na výmaz („právo být zapomenut“) a omezení zpracování,</li>
        <li>na přenositelnost údajů,</li>
        <li>vznést námitku proti zpracování založenému na oprávněném zájmu,</li>
        <li>podat stížnost u Úřadu pro ochranu osobních údajů (www.uoou.cz).</li>
      </UL>
      <P>
        Pokud jsi hráč (nebo zákonný zástupce hráče) a chceš vědět, zda jsou tvé údaje v aplikaci, nebo požádat o
        jejich opravu či výmaz, napiš na{" "}
        <a href={`mailto:${OPERATOR.email}`} style={{ color: C.turf }}>{OPERATOR.email}</a>. Požadavek vyřídíme bez zbytečného odkladu, nejpozději do 30 dnů.
      </P>

      <H>9. Zabezpečení</H>
      <P>
        Komunikace s aplikací je šifrovaná (HTTPS), hesla ukládáme pouze v zašifrované podobě a přístup k datům
        je oddělen podle klubů a rolí. Žádný systém není dokonale bezpečný. Pokud dojde k incidentu, budeme
        postupovat podle GDPR, včetně informování dotčených osob a úřadu, pokud to zákon vyžaduje.
      </P>

      <H>10. Změny a kontakt</H>
      <P>
        Tyto zásady můžeme aktualizovat. Aktuální znění je vždy na této stránce. Dotazy k ochraně osobních údajů
        posílej na <a href={`mailto:${OPERATOR.email}`} style={{ color: C.turf }}>{OPERATOR.email}</a>.
      </P>
    </Page>
  );
}
