---
pdf_options:
  format: A4
  margin: 22mm 18mm 24mm 18mm
  printBackground: true
  headerTemplate: |
    <style>section{margin:0 auto;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:8px;color:#888;width:100%;padding:0 18mm;}</style>
    <section><span>MaraAI — Businessplan</span></section>
  footerTemplate: |
    <section style="margin:0 auto;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:8px;color:#888;width:100%;padding:0 18mm;text-align:right;">
      Seite <span class="pageNumber"></span> / <span class="totalPages"></span>
    </section>
  displayHeaderFooter: true
css: |
  * { -webkit-print-color-adjust: exact; }
  body { font-family: "Noto Sans", system-ui, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1a1a1a; }
  h1 { font-size: 24pt; color: #6b21a8; border-bottom: 3px solid #6b21a8; padding-bottom: 8px; }
  h2 { font-size: 16pt; color: #6b21a8; margin-top: 28px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  h3 { font-size: 12.5pt; color: #333; margin-top: 18px; }
  table { border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 12px 0; }
  th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; vertical-align: top; }
  th { background: #f3e8ff; color: #4a1d6b; }
  tr:nth-child(even) td { background: #faf7fc; }
  code { background: #f4f4f5; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  blockquote { border-left: 4px solid #a855f7; margin: 12px 0; padding: 4px 14px; background: #faf5ff; color: #444; }
  .toc a { text-decoration: none; color: #6b21a8; }
  .placeholder { background: #fff7ed; border: 1px dashed #f59e0b; padding: 2px 6px; border-radius: 3px; }
---

# Businessplan — MaraAI

**KI-Companion- & Persönlichkeitsentwicklungs-Plattform · Domain: `hellomara.net`**

> **Hinweis zu den Zahlen.** Sämtliche Finanzwerte in diesem Dokument sind
> **Beispiel- / Platzhalterwerte** und müssen vor einer Verwendung für
> Finanzierung oder Anmeldung an die realen Daten angepasst werden. Mit
> `[…]` markierte Felder (Name des Gründers, Lebenslauf, Eigenkapital usw.)
> sind noch auszufüllen.

| | |
|---|---|
| **Projektname** | MaraAI |
| **Domain** | https://hellomara.net |
| **Rechtsform (empfohlen)** | UG (haftungsbeschränkt) |
| **Gründer/in** | `[Name, Vorname]` |
| **Datum** | `[MM.JJJJ]` |
| **Dokumentversion** | 1.0 (Entwurf) |

---

## Inhaltsverzeichnis

<div class="toc">

1. [Geschäftsidee](#1-geschäftsidee)
2. [Persönliche Voraussetzungen](#2-persönliche-voraussetzungen)
3. [Markteinschätzung (Zielgruppen, Umsatzplanung)](#3-markteinschätzung)
4. [Wettbewerbssituation](#4-wettbewerbssituation)
5. [Produktions- / Dienstleistungsfaktoren](#5-produktions--dienstleistungsfaktoren)
6. [Standortwahl (Infrastruktur / Deployment)](#6-standortwahl)
7. [Zukunftsaussichten (Chancen und Risiken)](#7-zukunftsaussichten)
8. [Weitere wichtige Aspekte (Rechtsform, DSGVO, Versicherungen)](#8-weitere-wichtige-aspekte)
9. [Anlagen (Investitions-, Liquiditäts-, Rentabilitätsplan, ToDo)](#9-anlagen)

</div>

---

## 1. Geschäftsidee

**MaraAI** ist eine „KI-Companion"-Plattform (KI-Begleiter) für persönliche
Transformation, erreichbar unter der Domain `hellomara.net`. Nutzer:innen
interagieren mit **Mara**, einem konversationellen KI-Assistenten, und
durchlaufen gamifizierte Persönlichkeitsentwicklungs-Programme in einem
integrierten sozialen Ökosystem (Video-Reels, Artikel, Creator-Tools).

**Wertversprechen.** Anders als ein einfacher Chatbot verbindet MaraAI:

- **KI-Konversation mit der Persona „Mara"** — empathischer Chat, mit
  individuell anpassbarer Persönlichkeit für VIP-Abonnent:innen.
- **Progressive Transformationsprogramme** (Mechanik „eine Mission pro Tag"):
  New Mindset (1 Tag) → New Habit (21 Tage) → New Skills (90 Tage) →
  New Body (180 Tage) → New Life (365 Tage) → New You (1095 Tage).
- **Content-Ökosystem**: Reels (Kurzvideo), WritersHub (Artikel mit
  gestufter Monetarisierung), Creators (Tools + Umsatzbeteiligung), You/Profil.
- **„Mara Brain"** — ein autonomes Lernsystem, das alle 2 Stunden einen
  Analysezyklus durchläuft und Wachstumsexperimente zur Freigabe vorschlägt.

**Technologischer Differenzierungsfaktor.** Die Grenzkosten pro Nutzer:in
werden durch einen **KI-Provider-Router** niedrig gehalten, der ein
**selbst gehostetes Ollama-Modell** (keine Kosten pro Token) bevorzugt und
**Anthropic Claude** nur als Fallback verwendet. Das ermöglicht eine bessere
Marge als bei Modellen, die zu 100 % von kommerziellen APIs abhängen.

**Mission.** KI-gestützte Persönlichkeitsentwicklung zugänglich, messbar und
motivierend zu machen und die Absichten der Nutzer:innen in langfristige
Gewohnheiten und Ergebnisse zu verwandeln.

---

## 2. Persönliche Voraussetzungen

> Von der Gründerin / dem Gründer auszufüllen.

**Gründer/in:** `[Name, Vorname]`

**Qualifikation & Erfahrung:** `[Lebenslauf — Ausbildung, Erfahrung in
Software/Produkt/KI, Unternehmertum, digitales Marketing]`

**Rolle im Unternehmen:** `[z. B. Founder & CEO — Produkt, Entwicklung, Strategie]`

**Bereits abgedeckte relevante Kompetenzen (auf Basis des bestehenden Produkts):**

- Full-Stack-Entwicklung (Node.js/Express + React/TypeScript).
- Integration und Betrieb von KI-Modellen (Ollama self-hosted, Anthropic Claude).
- Cloud-Architektur und Deployment (Docker, Railway), Datenbanken (SQLite/Drizzle).
- Produkt, UX und Internationalisierung (27+ Sprachen).

**Zu ergänzende / auszulagernde Kompetenzen:** `[z. B. B2C-Vertrieb,
Performance-Marketing, steuerliche und rechtliche Aspekte, Kundensupport im
großen Maßstab]`

**Persönliche Situation / Verfügbarkeit:** `[Voll-/Teilzeit, finanzielle
Rücklagen für die Startphase, familiäre Unterstützung]`

---

## 3. Markteinschätzung

### 3.1 Markt und Trends

MaraAI bewegt sich an der Schnittstelle dreier wachsender Märkte:
**Persönlichkeitsentwicklungs-/Wellbeing-Apps**, **konversationelle
KI-Begleiter** und die **Creator Economy**. Die Nutzung von Consumer-KI-Assistenten
hat sich deutlich beschleunigt, und die Zahlungsbereitschaft für personalisierte
Coaching-/Motivationstools nimmt zu.

### 3.2 Zielgruppen

| Segment | Beschreibung | Hauptbedürfnis |
|---|---|---|
| **„Self-Improvement"-Nutzer** (18–45) | Personen, die bessere Gewohnheiten, Disziplin und Klarheit anstreben | Strukturierte Anleitung, tägliche Motivation |
| **KI-neugierige Nutzer** | Wollen einen KI-Begleiter für Gespräch und Reflexion | Empathische, personalisierte Interaktion |
| **Content-Creator** | Autor:innen/Creator, die veröffentlichen und monetarisieren wollen | Tools + Umsatzbeteiligung (Creator behält 70 %) |
| **Mehrsprachige Community** | Internationales Publikum (27+ Sprachen) | Zugang in der eigenen Sprache, installierbare PWA |

### 3.3 Umsatzplanung (Modell)

Die Einnahmequellen sind:

1. **VIP-Abonnement** (Haupteinnahme) — siehe Kapitel 5 zum Preismodell.
2. **Umsatzbeteiligung aus Content** — die Plattform behält 30 % der Umsätze
   monetarisierter Creator (Creator behält 70 %).
3. **(Potenziell) Zusatzeinnahmen** — weitere Premium-Funktionen, P2P-Netzwerk.

> Detaillierte Umsatzprognosen (Nutzerzahl, Conversion-Rate free→VIP, ARPU)
> befinden sich in der **Anlage – Rentabilitätsplan** und sind als
> Beispielwerte gekennzeichnet.

---

## 4. Wettbewerbssituation

| Kategorie | Beispiele | Positionierung von MaraAI |
|---|---|---|
| Gewohnheits-/Produktivitäts-Apps | Habitica, Fabulous, Finch | MaraAI ergänzt einen echten konversationellen KI-Begleiter + sozialen Content |
| KI-Begleiter | Replika, Character.AI, Pi | MaraAI ergänzt strukturierte Transformationsprogramme + Creator-Monetarisierung |
| Coaching / Meditation | Calm, Headspace | MaraAI ist interaktiv und per KI personalisiert, keine vorab aufgezeichneten Inhalte |
| Generische Chatbots | ChatGPT, Claude (direkt) | MaraAI bietet dedizierte Persona, Gamification, Community und langfristige Progression |

**Wettbewerbsvorteile:**

- **Niedrigere KI-Kosten** durch self-hosted Ollama mit Claude-Fallback → bessere Marge.
- **Retention durch lange Programme** (bis zu 1095 Tage) und Gamification (XP, Streaks).
- **Integriertes Ökosystem** (Chat + Reels + Artikel + Creator) in einer einzigen PWA.
- **Nativ mehrsprachig** (27+ Sprachen) → global adressierbarer Markt.

**Nachteile / Wettbewerbsrisiken:** geringe Markenbekanntheit zum Start,
begrenzte Marketing-Ressourcen, Wettbewerber mit großen Budgets. Siehe Kapitel 7.

---

## 5. Produktions- / Dienstleistungsfaktoren

### 5.1 Entwicklung

Die Anwendung wird intern als **Single-Service**-Full-Stack-Anwendung
entwickelt: ein **Node.js-/Express**-Prozess, der sowohl die JSON-API
(`/api/**`) als auch die **React-SPA** (statische Dateien aus `dist/public`)
ausliefert. Persistenz über **SQLite** mittels `better-sqlite3` +
**Drizzle ORM**. (Siehe `ARCHITECTURE.md`.)

### 5.2 Hosting / Betrieb

- **Deployment**: ein einziger Docker-Container (`Dockerfile.nodejs`) auf
  **Railway** (`railway.json`), mit der SQLite-Datei auf einem **an `/data`
  gemounteten Volume**.
- **KI-Provider**: Provider-Router (`server/lib/provider-router.ts`) —
  **primär Ollama** self-hosted (keine Kosten pro Token), **Fallback Anthropic
  Claude**; **Graceful Degrade** (lokalisierte „Ich hole gerade Luft"-Meldung)
  falls beide ausfallen, ohne 500er-Fehler.
- **„Mara Brain"**: autonomer Lernzyklus, der alle **2 Stunden** läuft
  (`server/mara-brain/platform-context.ts`).
- **Transaktions-E-Mail**: über **Resend** (`noreply@hellomara.net`,
  `server/lib/email.ts`).
- **Observability**: Sentry (optional), Railway-Logs, Admin-Dashboard.

### 5.3 Vertrieb / Distribution

- **Installierbare PWA** (mobil + Desktop).
- **Mehrsprachigkeit**: 27+ Sprachen (`frontend/src/i18n/locales/`).
- **P2P-Netzwerk** (Node Supporter / Gold Node) zur Video-/Compute-Distribution
  und Senkung der CDN-Kosten.
- Akquisekanäle: SEO/Content, Social Media, Empfehlungen/Referral.

### 5.4 Mitarbeiter / Rollen

| Rolle | Startphase | Anmerkung |
|---|---|---|
| Founder (Produkt + Entwicklung) | Intern | `[Gründer:in]` |
| Marketing / Content | Extern/Teilzeit | auszufüllen |
| Kundensupport | Extern/Teilzeit | Skalierung mit wachsender Nutzerbasis |
| Recht / Buchhaltung | Extern (Dienstleistung) | Notar, Steuerberater, DSGVO-Berater |

---

## 6. Standortwahl (Infrastruktur / Deployment)

Da es sich um ein rein digitales Produkt (SaaS/PWA) handelt, ist der relevante
„Standort" die **technische Infrastruktur**, nicht ein physischer Geschäftsraum.

- **Firmensitz**: `[Adresse in Deutschland — erforderlich für UG und Impressum]`.
- **Arbeitsplatz**: Homeoffice / Remote (kein Geschäftsraum zum Start).
- **Produktionsinfrastruktur**:
  - **Railway** (Container-Hosting-Plattform) — Build aus `Dockerfile.nodejs`.
  - **Persistentes Volume** gemountet an `/data` für die SQLite-Datenbank.
  - **Domain**: `hellomara.net` (CNAME auf Railway).
  - **Primärer KI-Provider**: self-hosted Ollama-Server `[Standort/Host anzugeben]`.
  - **KI-Fallback**: Anthropic-Claude-API.
  - **E-Mail**: Resend.

**Vorteile dieser Wahl:** niedrige Fixkosten, elastische Skalierung,
geografische Unabhängigkeit, schnelle Time-to-Market. **Bekannte Einschränkung:**
eine einzelne SQLite-Instanz (Single-Writer) — geeignet für die aktuelle
Größenordnung, nicht für hohe Schreibkonkurrenz (siehe `ARCHITECTURE.md`).

---

## 7. Zukunftsaussichten (Chancen und Risiken)

### 7.1 Chancen

- Steigende Nachfrage nach KI-Begleitern und Wellbeing-Tools.
- Günstige Marge dank self-hosted KI (Ollama) mit kommerziellem Fallback.
- Schnelle internationale Expansion (bereits 27+ Sprachen).
- Netzwerkeffekte durch Creator-Content und das P2P-Netzwerk.
- Upsell: Premium-Funktionen, individuelle KI-Persönlichkeit, Creator-Monetarisierung.

### 7.2 Risiken

| Risiko | Auswirkung | Gegenmaßnahme |
|---|---|---|
| **Preisinkonsistenz (9 €/89 € Frontend vs. 20 €/Monat Backend)** | Kundenverwirrung, falsche Umsatz-/Anzeige | Vereinheitlichung des Preismodells vor dem Zahlungs-Launch (siehe ToDo) |
| Abhängigkeit von KI-Providern (Kosten, Verfügbarkeit) | Variable Kosten, Ausfälle | Router mit Fallback + Graceful Degrade; Monitoring |
| Zahlungen nicht aktiviert (PayPal/Stripe „lazy", 503 ohne Keys) | Keine Einnahmen bis zur Konfiguration | PayPal/Stripe vor Launch aktivieren und testen |
| Geringe Retention / Churn | Umsätze unter Prognose | Gamification, lange Programme, Benachrichtigungen, Content |
| DSGVO-Konformität | Bußgelder, Blockaden | Impressum, AGB, Datenschutzerklärung, AV-Verträge |
| SQLite-Skalierbarkeit (Single-Writer) | Grenze bei starkem Wachstum | Migrations-/Replikationsplan bei Bedarf |
| Geringe Bekanntheit / begrenztes Marketing | Langsame Akquise | SEO, Referral, Partnerschaften, organischer Content |

---

## 8. Weitere wichtige Aspekte

### 8.1 Rechtsform

Empfohlene Rechtsform: **UG (haftungsbeschränkt)** — beschränkte Haftung,
geringes Startkapital, geeignet für einen Solo-/kleinen Start. Alternativ, bei
Kapitalerhöhung, Umwandlung in eine **GmbH**.

### 8.2 Genehmigungen / DSGVO

- **Impressum**, **AGB** (Allgemeine Geschäftsbedingungen) und
  **Datenschutzerklärung** auf `hellomara.net` veröffentlicht.
- **Auftragsverarbeitungsverträge (AV / DPA)** mit den Anbietern, die Daten
  verarbeiten: **Anthropic**, Hosting (**Railway**), E-Mail (**Resend**).
- **Opt-in-Consent-Gate** für Cookies/Verarbeitung (bereits im Produkt vorgesehen).
- Datenminimierung, Betroffenenrechte, Session-Sicherheit
  (bcrypt, CSRF, connect-sqlite3).

### 8.3 Infrastruktur (betrieblicher Überblick)

- Ein Docker-Container auf Railway; SQLite auf Volume `/data`; Domain `hellomara.net`.
- Regelmäßiges Backup der Datenbank (`npm run backup:db`).
- Monitoring: Sentry (optional), Railway-Logs, Health-Checks
  (`/api/health`, `/api/health/db`, `/api/ai/health`).

### 8.4 Versicherungen

- **Berufs-/Cyber-Haftpflichtversicherung** (empfohlen für SaaS).
- **Betriebshaftpflichtversicherung**.
- `[Mit Versicherungsmakler geklärt — Werte auszufüllen]`.

---

## 9. Anlagen

> **Alle nachfolgenden Zahlen sind Beispiel- / Platzhalterwerte.** Sie müssen
> an die realen Angebote der Anbieter und die eigenen Marktannahmen angepasst
> werden. Die Finanzprognosen verwenden gemäß Vorgabe die **Frontend-Preise
> (9 €/Monat, 89 €/Jahr)**, obwohl das Backend `vip_monthly` derzeit mit
> 20 €/Monat definiert — siehe Inkonsistenzrisiko (Kap. 7) und ToDo-Liste
> (Anlage 9.4).

### 9.1 Investitionsplan / Kapitalbedarf (3 Jahre)

*Beispielwerte, in EUR.*

| Position | Jahr 1 | Jahr 2 | Jahr 3 |
|---|--:|--:|--:|
| Gründungskosten (Notar, Handelsregister, Beratung) | 1.500 | 0 | 0 |
| Hosting Railway (Container + Volume) | 600 | 900 | 1.200 |
| Self-hosted Ollama-Server (GPU/Host) | 2.400 | 2.400 | 3.000 |
| Anthropic-API-Kosten (Fallback) | 1.200 | 1.800 | 2.400 |
| Software / Lizenzen (Resend, Sentry, Domains, Tools) | 900 | 1.100 | 1.300 |
| Marketing / Nutzerakquise | 3.000 | 6.000 | 10.000 |
| Unternehmerlohn | 18.000 | 24.000 | 30.000 |
| Reserve / Sonstiges | 1.500 | 2.000 | 2.500 |
| **Gesamtkapitalbedarf** | **29.100** | **38.200** | **50.400** |

### 9.2 Liquiditätsplan — Jahr 1 (monatlich)

*Beispielwerte, in EUR. Eingesetztes Eigenkapital: `[X]` · Darlehen: `[Y]`.*

| Monat | Abo-Einnahmen | Auszahlungen (Betrieb + Marketing + Lohn) | Netto-Cashflow | Liquiditätsstand |
|---|--:|--:|--:|--:|
| Anfangskapital | — | — | — | 15.000 |
| M1 | 100 | 2.300 | −2.200 | 12.800 |
| M2 | 250 | 2.300 | −2.050 | 10.750 |
| M3 | 450 | 2.400 | −1.950 | 8.800 |
| M4 | 700 | 2.400 | −1.700 | 7.100 |
| M5 | 1.000 | 2.500 | −1.500 | 5.600 |
| M6 | 1.400 | 2.500 | −1.100 | 4.500 |
| M7 | 1.850 | 2.600 | −750 | 3.750 |
| M8 | 2.300 | 2.600 | −300 | 3.450 |
| M9 | 2.800 | 2.700 | 100 | 3.550 |
| M10 | 3.300 | 2.700 | 600 | 4.150 |
| M11 | 3.900 | 2.800 | 1.100 | 5.250 |
| M12 | 4.500 | 2.800 | 1.700 | 6.950 |
| **Gesamt Jahr 1** | **22.550** | **30.600** | **−8.050** | **6.950** |

### 9.3 Rentabilitätsplan (3 Jahre)

*Beispielwerte, in EUR. Annahmen: durchschnittlicher ARPU ≈ 8 €/Monat (Mix aus
9 €/Monat und 89 €/Jahr), steigende Conversion free→VIP.*

| Position | Jahr 1 | Jahr 2 | Jahr 3 |
|---|--:|--:|--:|
| Umsatz VIP-Abonnements | 22.550 | 60.000 | 120.000 |
| Umsatz Content-Beteiligung (30 %) | 500 | 2.000 | 5.000 |
| **Gesamtumsatz** | **23.050** | **62.000** | **125.000** |
| KI-Kosten (Ollama-Host + Anthropic) | 3.600 | 4.200 | 5.400 |
| Hosting + Software/Lizenzen | 1.500 | 2.000 | 2.500 |
| Marketing | 3.000 | 6.000 | 10.000 |
| Unternehmerlohn | 18.000 | 24.000 | 30.000 |
| Sonstige Ausgaben | 1.500 | 2.000 | 2.500 |
| **Gesamtausgaben** | **27.600** | **38.200** | **50.400** |
| **Betriebsergebnis** | **−4.550** | **23.800** | **74.600** |

### 9.4 ToDo-Liste — rechtliche / technische Formalitäten

| # | Aufgabe | Typ | Status |
|---|---|---|---|
| 1 | UG-Gesellschaftsvertrag + notarielle Beurkundung | Recht | ☐ |
| 2 | Eintragung ins Handelsregister | Recht | ☐ |
| 3 | Gewerbeanmeldung | Recht | ☐ |
| 4 | Steuerliche Anmeldung (Finanzamt) + USt | Steuer | ☐ |
| 5 | Impressum, AGB, Datenschutzerklärung veröffentlichen | DSGVO | ☐ |
| 6 | AV-/DPA-Verträge mit Anthropic, Railway, Resend | DSGVO | ☐ |
| 7 | **Vereinheitlichung des Preismodells (9 € Frontend vs. 20 € Backend)** | Produkt | ☐ |
| 8 | PayPal + Stripe aktivieren und testen (API-Keys) | Technik | ☐ |
| 9 | Automatisches Datenbank-Backup einrichten | Technik | ☐ |
| 10 | Versicherungen (Berufs-/Cyber-Haftpflicht) | Betrieb | ☐ |
| 11 | Gründerdaten, Lebenslauf, Eigenkapital ergänzen | Administrativ | ☐ |

---

*Dokument erstellt für MaraAI · `hellomara.net`. Alle Finanzwerte sind
Beispiele und müssen vor der Verwendung validiert werden.*
