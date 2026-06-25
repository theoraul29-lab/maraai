# MaraAI – Businessplan (Bankvorlage)

> **Sprache / Language:** Dieses Dokument ist auf Deutsch verfasst und dient als bankgerechte Unternehmensunterlage für die Sparkasse- / KfW-Evaluation.  
> Die technische Entwicklerdokumentation befindet sich in den Dateien `LOCAL_SETUP.md`, `DEPLOY.md` und `ARCHITECTURE.md`.

---

# Businessplan MaraAI

**Vertraulich – Erstellt für die Finanzierungsanfrage (Sparkasse / KfW)**  
Stand: Juni 2026

---

## Inhaltsverzeichnis

1. [Executive Summary](#1-executive-summary)
2. [Unternehmensbeschreibung](#2-unternehmensbeschreibung)
3. [Problemstellung](#3-problemstellung)
4. [Lösungsüberblick](#4-lösungsüberblick)
5. [Marktanalyse](#5-marktanalyse)
6. [Zielkunden](#6-zielkunden)
7. [Geschäftsmodell / Monetarisierung](#7-geschäftsmodell--monetarisierung)
8. [Marketing & Wachstum](#8-marketing--wachstum)
9. [Wettbewerbsanalyse](#9-wettbewerbsanalyse)
10. [Operativer Plan](#10-operativer-plan)
11. [Finanzplan](#11-finanzplan)
12. [Risikoanalyse](#12-risikoanalyse)
13. [Finanzierungsbegründung](#13-finanzierungsbegründung)
14. [Fazit](#14-fazit)
- [Anlage: Variante 2 – Kurzfassung zur Kreditanfrage](#anlage-variante-2--kurzfassung-zur-kreditanfrage)

---

## 1. Executive Summary

**MaraAI** ist ein frühphasiges Startup-Konzept mit dem Ziel, eine modulare KI-Produktivitätsplattform für Kreative, Freiberufler und kleine Digitalunternehmen zu entwickeln. Das Angebot umfasst in der Konzeptphase einen KI-Chat-Companion, Schreibwerkzeuge für Content-Creator, leichte Automatisierungshilfen sowie einen KI-gestützten Interaktionslayer.

Das Unternehmen verfolgt eine **hybride KI-Architektur**: Primär wird eine lokal betriebene KI-Infrastruktur (Ollama mit Open-Source-Modellen der Familien Llama 3.1, Mistral, Qwen) eingesetzt. Externe Cloud-API-Dienste werden ausschließlich als Fallback-System genutzt, nicht als primäre Abhängigkeit.

**Kernziel dieser Finanzierungsanfrage:** Validierung des Produktmarkt-Fits und Aufbau der technischen Basisinfrastruktur mit einem Gesamtbudget von **20.000 €**.

Das Geschäftsmodell basiert auf monatlichen und jährlichen Abonnements (SaaS-Modell). Die Projektion ist bewusst konservativ gehalten: keine Gewinnannahmen im ersten Jahr, klare Meilensteine für erste Zahlungsbereitschaftsnachweise.

---

## 2. Unternehmensbeschreibung

### Unternehmenskonzept

MaraAI wird als **B2C/B2B2C SaaS-Produkt** positioniert. Es richtet sich an Einzelpersonen und kleine Teams, die KI-gestützte Produktivitätswerkzeuge für kreative Inhalte und digitale Workflows benötigen.

### Mission

*Praktische KI-Produktivität für kleine Creator und Mikrounternehmen in Europa – einfach, erschwinglich und datenschutzbewusst.*

### Vision

MaraAI soll mittelfristig ein vertrauenswürdiger KI-Produktivitätsbegleiter für die Creator Economy im DACH-Raum werden. Wachstum erfolgt ausschließlich nach nachgewiesener Marktnachfrage.

### Rechtsform und Gründungsplan (Deutschland)

- Geplante Gründung als Einzelunternehmen oder UG (haftungsbeschränkt) nach steuerrechtlicher Beratung.
- Betrieb von Beginn an DSGVO-konform.
- Buchführung und Compliance gemäß deutschen handels- und steuerrechtlichen Anforderungen.

---

## 3. Problemstellung

Creator, Freiberufler und kleine Digitalunternehmen stehen vor folgenden strukturellen Herausforderungen:

- **Dauerhafter Content-Druck:** Kontinuierlicher Bedarf an Posts, Skripten, Captions, Hooks – bei begrenzten Ressourcen.
- **Zeitknappheit:** Viele Kanäle, zu wenig Personal für Routineaufgaben.
- **Tool-Fragmentierung:** Mehrere Einzelabonnements mit überlappenden Funktionen und steigenden Gesamtkosten.
- **Fehlende Prozessautomatisierung:** Repetitive kreative Aufgaben werden weiterhin manuell erledigt.

Bestehende Lösungen auf dem Markt sind häufig:
- zu generisch und nicht auf kleine Creator-Workflows zugeschnitten,
- im Gesamtpaket zu kostspielig,
- datenschutzrechtlich für den deutschen Markt unzureichend positioniert.

---

## 4. Lösungsüberblick

MaraAI entwickelt ein integriertes Ökosystem mit vier initialen Wertpfeilern:

1. **KI-Chat-Companion** – tägliche Ideenfindung, Planung und Textentwürfe.
2. **Schreibwerkzeuge für Creator** – strukturierte Hilfe für Posts, Skripte, Captions und Textwiederverwendung.
3. **Creator-Automatisierungshilfen** – Vereinfachung wiederkehrender inhaltsbezogener Aufgaben.
4. **Interaktions-Supportlayer** – KI-gestützte Vorschläge für Zielgruppeninteraktion und Engagement.

### Technische Architekturstrategie (Hybridmodell)

MaraAI setzt auf eine **privacy-aware hybride KI-Plattform** mit folgendem Aufbau:

**1. Lokaler KI-Kern (Primärsystem)**

- Als primäres Laufzeitsystem wird **Ollama** (selbstgehostet, Open-Source) eingesetzt.
- Unterstützte Modellfamilien je nach Leistungsanforderung: **Llama 3.1, Mistral, Qwen**.
- Zielsetzung: Reduzierung wiederkehrender API-Kosten, Kontrolle über Datenschutz, vorhersehbare Betriebskosten in der Frühphase.

**2. Externer Cloud-Fallback (Sekundärsystem)**

- Externe API-Dienste (z. B. Anthropic Claude) werden ausschließlich als **Fallback-Mechanismus** genutzt.
- Einsatzszenario: temporäre Überlastung oder Nichtverfügbarkeit des lokalen Systems.
- Dieser Dienst ist **keine primäre Betriebsabhängigkeit**.

**3. Strategische Positionierung**

MaraAI wird positioniert als:
- „Privacy-aware hybride KI-Plattform"
- „Kosteneffiziente Local-First-KI-Architektur"
- „Unabhängiger KI-Kern mit optionalem Cloud-Fallback"

Diese Architektur ist realistisch für die MVP-Phase: ein lokaler KI-Knoten, begrenztes Nutzervolumen, kontrollierter Rollout.

> **Hinweis:** Das Produkt befindet sich in der Konzeptphase. Funktionstiefe wird durch Kundeninterviews und Pilotnutzung vor einer Erweiterung validiert.

---

## 5. Marktanalyse

### Branchenkontext

MaraAI bewegt sich an der Schnittstelle von:
- KI-Produktivitätswerkzeugen,
- Creator-Economy-Software,
- und abonnementbasiertem SaaS.

### Markttrends (Deutschland / DACH)

- Steigende Akzeptanz von KI-Tools bei Freiberuflern und kleinen Unternehmen.
- Anhaltende Nachfrage nach Kurzform-Content und KI-gestützter Texterstellung.
- Zunehmende Zahlungsbereitschaft für Produktivitätswerkzeuge mit messbarem Mehrwert.
- Wachsendes Bewusstsein für Datenschutz und DSGVO-Compliance als Differenzierungsmerkmal.

### Marktgelegenheit

Ein fokussiertes Produkt für kleine Creator in Deutschland kann sich über folgende Merkmale positionieren:
- Benutzerfreundlichkeit statt Funktionskomplexität,
- Lokale Vertrauens- und Compliance-Positionierung (Sprache, Kultur, DSGVO),
- Geringere Gesamtkosten im Vergleich zu mehreren Einzelabonnements.

### Go-to-Market-Geographie

- **Phase 1:** Deutschland (deutschsprachiges und englisches Onboarding)
- **Phase 2:** DACH-Erweiterung (Österreich, Schweiz)

---

## 6. Zielkunden

### Primärsegment

**Kleine Creator und Solopreneure (18–45 Jahre):**
- Social-Media-Creator,
- Coaches und Berater,
- Freiberufler (Texter, Marketer, Designer),
- Nischen-Educator und Kursanbieter.

### Sekundärsegment

**Mikro-Agenturen und kleine Teams (2–10 Personen):**
- Content-Teams mit Bedarf an Ideen- und Textbeschleunigung.

### Kundenbedürfnisse

- Schnellere Content-Produktion,
- Gleichbleibende Ausgabequalität,
- Geringere monatliche Werkzeugkosten,
- Einfaches Onboarding ohne technische Komplexität.

---

## 7. Geschäftsmodell / Monetarisierung

### Erlösmodell

Primär: **Monatliche und jährliche Abonnements (SaaS)**

### Indikativer Preisrahmen (Frühphase)

| Tarif | Preis | Zielgruppe |
|---|---|---|
| Free | kostenlos | Akquisition / Testen |
| Starter | 12–19 €/Monat | Einzelpersonen / Einsteiger |
| Pro | 29–49 €/Monat | Aktive Creator / Freiberufler |
| Team (spätere Phase) | ab 79 €/Monat | Kleine Teams / Agenturen |

### Ergänzende Erlösquellen (nach Validierung)

- Template-Pakete und Creator-Workflow-Bundles,
- selektive Partnerprovisionen (performance-basiert).

### Grundprinzipien der Wirtschaftlichkeit

- Customer Acquisition Cost (CAC) durch organische Kanäle und Community niedrig halten.
- Jahrespläne und Retention gegenüber bezahltem Wachstumseinsatz priorisieren.

---

## 8. Marketing & Wachstum

### Positionierung

*„Praktische KI für Creator, die Ergebnisse brauchen – keine Komplexität."*

### Kernkanäle (lean Budget)

1. **Organisches Content-Marketing** – LinkedIn, Instagram, kurze Bildungsinhalte zu KI-Produktivität.
2. **Founder-geführter Community-Aufbau** – Creator-Gruppen, Discord/Telegram-Communities.
3. **Micro-Influencer-Partnerschaften** – performance-basiert, wo möglich.
4. **Referral-Anreize** – kostenlose Credits oder rabattierte Monate für Empfehlungen.

### Funnel-Strategie

| Phase | Maßnahme |
|---|---|
| Awareness | Edukative Inhalte zu KI-Produktivität |
| Consideration | Demos, Anwendungsfallbeispiele |
| Conversion | Kostenloser Test / Freemium-Limits |
| Retention | Onboarding-Flows, regelmäßige Mehrwertimpulse |

### 12-Monats-Wachstumsfokus

- Einen starken Anwendungsfall validieren, bevor eine Erweiterung erfolgt.
- Ziel: erste 100–300 aktive Nutzer; danach Retention und Preisgestaltung optimieren.

---

## 9. Wettbewerbsanalyse

### Wettbewerbertypen

- Große horizontale KI-Tools (breite Funktionalität, hohe Bekanntheit).
- Creator-spezifische Schreib- und Ideenwerkzeuge.
- Social-Media-Scheduling- und Automatisierungstools.

### Geplante Differenzierung von MaraAI

- **Integrierter Creator-Workflow** statt mehrerer unverbundener Tools.
- **Einfachheit und praxisnahe Ergebnisse** als zentrales Nutzererlebnis.
- **DACH-Vertrauenspositionierung:** Sprachliche und kulturelle Anpassung sowie DSGVO-bewusster Betrieb.
- **Local-First-Datenschutzarchitektur** als Alleinstellungsmerkmal im Vergleich zu Cloud-only-Wettbewerbern.

### Wettbewerbsrisiko

Große Anbieter können Funktionen kopieren. MaraAI muss sich daher differenzieren durch:
- Nischenfokus und schnelle Reaktion auf Creator-Workflows,
- Kundennähe und direkte Kommunikation,
- Datenschutz-Positionierung als nachhaltiger Vertrauensvorteil.

---

## 10. Operativer Plan

### Phase 1 (Monate 0–3): Validierung & Infrastrukturaufbau

- Formalisierung der Unternehmensstruktur (Rechtsform, Steuerberatung, DSGVO-Basis).
- Kundeninterviews mit 30–50 Zielpersonen.
- Markenidentität, Landing Page, Warteliste und Pilotnetzwerk aufbauen.
- Beschaffung und Einrichtung eines dedizierten KI-Arbeitsplatzrechners / Servers für lokale Inferenz.
- Initiales Benchmarking ausgewählter Open-Source-Modelle (Qualität, Geschwindigkeit, Kosteneffizienz).

### Phase 2 (Monate 3–6): MVP-Pilot mit hybrider Verfügbarkeit

- MVP-Pilotbetrieb primär auf dem lokalen KI-Kern.
- Fallback-API ausschließlich für Kontinuität bei Kapazitätsengpässen konfiguriert.
- Frühe KPI-Erfassung:
  - Inferenzstabilität,
  - Antwortkonsistenz,
  - Kosten pro aktivem Nutzer,
  - Häufigkeit des Fallback-Einsatzes.

### Phase 3 (Monate 6–12): Kontrollierte Kommerzialisierung

- Einführung bezahlter Tarife mit strikter Kostenkontrolle.
- Onboarding und Kundensupport optimieren.
- Monatliches operatives Review: Conversion, Retention, KI-Betriebskostentrend und Fallback-Abhängigkeitsquote.

### Betriebsgrundsatz

- Kein Rechenzentrumsausbau.
- Keine umfangreiche Personalexpansion im ersten Jahr.
- Infrastruktur bleibt bewusst lean: **ein leistungsstarker lokaler KI-Knoten für MVP und frühe Skalierungsphase**.

### Team (initial)

- Gründergeführter Betrieb (Strategie, Kundenentwicklung, Partnerschaften).
- Freiberufliche Unterstützung für Design, Content, Recht und Buchhaltung nach Bedarf.

---

## 11. Finanzplan

### Mittelverwendung (Gesamtbudget: 20.000 €)

| Position | Betrag |
|---|---|
| KI-Hardware (lokaler Inferenzserver / GPU-Workstation) | 10.000 € |
| MVP / externe Produktdienstleistungen & Integrationsunterstützung | 3.000 € |
| Recht, Steuer, Compliance, Verwaltung (Deutschland) | 2.500 € |
| Marketing und Kundenakquisitionstests | 2.500 € |
| Betrieb, Tools und Abonnements (nicht-KI-Infrastruktur) | 1.200 € |
| Liquiditätspuffer / Contingency-Reserve | 800 € |
| **Gesamtsumme** | **20.000 €** |

### 12-Monats-Umsatzprognose (konservativ)

| Zeitraum | Monatlicher Umsatz (Schätzung) |
|---|---|
| Monate 1–3 (Validierungsphase) | 0 – 300 € |
| Monate 4–6 (Pilotphase) | 300 – 1.000 € |
| Monate 7–12 (Frühkommerzialisierung) | 1.000 – 3.000 € |

> Kein Break-even im ersten Jahr erwartet. Ziel dieser Finanzierungsrunde: **nachgewiesene Nachfrage und erste wiederholbare Umsätze**, die Folgefinanzierung oder organisches Wachstum ermöglichen.

### Finanzielle Begründung für Hardware-Erstinvestition (10.000 €)

Die Investition in einen lokalen KI-Inferenzknoten ist als strategische Kostenkontrollmaßnahme begründet:

- **Reduzierung langfristiger variabler Kosten:** Lokale Inferenz senkt wiederkehrende API-Kosten je Anfrage erheblich, sobald eine Basisnutzung erreicht ist.
- **Planungssicherheit:** Reduziert das Exposure gegenüber externen API-Preisänderungen, Kontingentlimits oder Richtlinienänderungen.
- **Betriebliche Resilienz:** Hybrides Setup (Local-First + Cloud-Fallback) gewährleistet Servicekontinuität bei Lastspitzen oder temporären Ausfällen.
- **Datenschutz und Vertrauensvorteil (Deutschland-relevant):** Lokale Verarbeitung stärkt die datenschutzkonforme Marktpositionierung für frühe Adopter.

Der Hardware-Einsatz wird als **Einzel-Knoten-Grundlagenwert** behandelt – keine Überkapazitätsplanung, sondern zweckgebundene Infrastruktur für MVP-Ausführung und frühe Nutzergewinnung.

### Kostendisziplin

- Gründervergütung in der ersten Phase minimal / begrenzt.
- Keine größeren Festanstellungen vor einem nachweisbaren Produkt-Markt-Signal.
- Marketingausgaben werden schrittweise auf Basis von Conversion-Daten freigegeben.

---

## 12. Risikoanalyse

### Hauptrisiken

| Risiko | Beschreibung | Minderungsmaßnahme |
|---|---|---|
| **Produkt-Markt-Fit-Risiko** | Nachfrage konvertiert möglicherweise nicht in zahlende Nutzer. | Enger Fokus auf einen Kernanwendungsfall; frühe Zahlungsbereitschaftstests. |
| **Wettbewerbsrisiko** | Starke globale Wettbewerber mit größeren Budgets. | Nischenfokus, Kundennähe und DACH-spezifische Positionierung. |
| **Monetarisierungsrisiko** | Nutzer widersetzen sich möglicherweise der Konvertierung von kostenlosen Alternativen. | Lean-Kostenstruktur; frühzeitige Bezahlttests, nicht nur Nutzungstests. |
| **Ausführungsrisiko** | Begrenzte Ressourcen können die Iterationsgeschwindigkeit verlangsamen. | Striktes Scope-Management; monatliche KPI-Überprüfung und schnelle Plananpassung. |
| **Regulierungs- / Vertrauensrisiko** | Hohe Datenschutzerwartungen in Deutschland. | DSGVO-konforme Prozesse von Beginn an; transparente Datenkommunikation. |

### Infrastrukturspezifische Risiken

| Risiko | Minderungsmaßnahme |
|---|---|
| **Lokaler Knoten bei Lastspitzen unterdimensioniert** | Fallback-API ausschließlich für Überlast / Kontinuität verfügbar. |
| **Hardware-Konzentrationsrisiko (Single-Node-Abhängigkeit)** | Backup-/Recovery-Verfahren, geplante Wartungsfenster und Reservebudget für kritische Reparaturen. |
| **Modell-Performanzvariabilität je Anwendungsfall** | Stufenweises Modell-Benchmarking und enger MVP-Anwendungsfallperimeter. |

---

## 13. Finanzierungsbegründung

### Warum werden 20.000 € benötigt?

Das beantragte **Kapital von 20.000 €** dient als **Seed-Level-Validierungskapital**, nicht als Expansionsfinanzierung.

Die Mittel werden für zwei gleichwertige Gründungsbedarfe eingesetzt:

**1. Kommerzielle Validierung:**
- Rechtskonformer Unternehmensaufbau in Deutschland,
- Finanzierung der initialen Produkt- und Marktvalidierung,
- Gewinnung erster zahlender Nutzer durch kontrollierte Marketing-Tests.

**2. Aufbau grundlegender KI-Infrastruktur-Unabhängigkeit:**
- Einmaliger Erwerb eines lokalen Inferenzknotens als betriebliche Grundlage,
- Reduzierung der dauerhaften Abhängigkeit von externen API-Kosten,
- Schaffung eines stabilen, skalierbaren technischen Fundaments für die Frühphase.

### Bankbewertungsrelevanz

Aus Bankperspektive demonstriert der überarbeitete Plan:
- **Umsichtige Vorabinvestition** in Infrastruktur mit klarer Kostenlogik,
- **Kontrolliertes Betriebsmodell** ohne unternehmensgroße Overheadstrukturen,
- **Reduzierte Abhängigkeit** von volatilen Drittanbieter-API-Kostenstrukturen,
- **Realistische Wachstumspfade** zu frühen wiederkehrenden Umsätzen.

Für eine Bank handelt es sich um eine **meilensteinbasierte Kapitalverwendung mit messbarem Risikorahmen** – keine Wachstumsfinanzierung, sondern gezielte Validierungskapital mit definierten Ausgabenkategorien.

---

## 14. Fazit

MaraAI ist ein glaubwürdiges Frühphasen-Konzept in einem wachsenden Markt mit praktischem Fokus auf Creator-Produktivität und KI-gestützte Workflows.

Der Businessplan vermeidet bewusst aggressive Projektionen und priorisiert stattdessen:
- disziplinierte Ausführung,
- schlanken Betrieb,
- frühe Umsatzvalidierung,
- und transparente Finanzkontrolle.

Mit **20.000 € Startfinanzierung** kann MaraAI vom Konzept zum validierten Markteintritt in Deutschland übergehen und die operativen Nachweise aufbauen, die für eine langfristige Tragfähigkeit erforderlich sind. Der Local-First-KI-Ansatz bietet dabei einen strukturellen Kostenvorteil, der mit wachsender Nutzerzahl zunehmend wirksam wird.

---

---

## Anlage: Variante 2 – Kurzfassung zur Kreditanfrage

**Anlage zur Kreditanfrage – MaraAI**  
Für: Sparkasse / KfW-Erstgespräch  
Stand: Juni 2026

---

### Unternehmen

**MaraAI** ist ein frühphasiges Startup-Konzept mit Sitz in Deutschland. Das Vorhaben zielt auf die Entwicklung einer KI-gestützten Produktivitätsplattform für Content-Creator, Freiberufler und kleine Digitalunternehmen.

---

### Kurzbeschreibung

MaraAI bietet ein modulares Toolset bestehend aus KI-Chat-Companion, Schreibwerkzeugen, Creator-Automatisierungshilfen und einem Interaktionslayer – als abonnementbasiertes SaaS-Produkt (monatlich / jährlich).

Der technische Betrieb basiert auf einem **hybriden KI-Architekturmodell**:
- **Primär:** lokal betriebener KI-Kern (Ollama, Open-Source-Modelle: Llama 3.1 / Mistral / Qwen)
- **Fallback:** externer Cloud-API-Dienst ausschließlich bei Überlast oder Nichtverfügbarkeit

---

### Finanzierungsanfrage

**Gesamtbetrag:** 20.000 €  
**Art der Finanzierung:** Seed-Kapital zur Validierung und Infrastrukturaufbau  
**Zielmarkt:** Deutschland (Phase 1), DACH (Phase 2)

---

### Budgetübersicht

| Position | Betrag |
|---|---|
| KI-Hardware (lokaler Inferenzserver / GPU-Workstation) | 10.000 € |
| MVP / externe Produktdienstleistungen | 3.000 € |
| Recht, Steuer, Compliance, Verwaltung | 2.500 € |
| Marketing und Kundenakquisitionstests | 2.500 € |
| Betrieb, Tools und Abonnements | 1.200 € |
| Liquiditätspuffer / Reserve | 800 € |
| **Gesamt** | **20.000 €** |

---

### Erwarteter Nutzen der Finanzierung

- Valider Markteintritt und erste zahlende Nutzer innerhalb von 6–12 Monaten.
- Aufbau einer kosteneffizienten, unabhängigen KI-Infrastruktur (Local-First-Betrieb).
- Rechtlich und steuerlich konformer Unternehmensstart in Deutschland.
- Schaffung der Grundlage für Folgefinanzierung oder organisches Wachstum.

---

### Konservative Umsatzerwartung (12 Monate)

| Zeitraum | Monatsumsatz (Schätzung) |
|---|---|
| Monate 1–3 | 0 – 300 € |
| Monate 4–6 | 300 – 1.000 € |
| Monate 7–12 | 1.000 – 3.000 € |

> Break-even im ersten Jahr nicht erwartet. Ziel: Validierung der Zahlungsbereitschaft und wiederholbarer Frühvertrieb als Basis für Phase 2.

---

*Ende der Anlage Variante 2*

---

*Ende des Businessplans MaraAI*
