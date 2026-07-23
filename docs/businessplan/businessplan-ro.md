---
pdf_options:
  format: A4
  margin: 22mm 18mm 24mm 18mm
  printBackground: true
  headerTemplate: |
    <style>section{margin:0 auto;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:8px;color:#888;width:100%;padding:0 18mm;}</style>
    <section><span>MaraAI — Plan de afaceri</span></section>
  footerTemplate: |
    <section style="margin:0 auto;font-family:system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:8px;color:#888;width:100%;padding:0 18mm;text-align:right;">
      Pagina <span class="pageNumber"></span> / <span class="totalPages"></span>
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

# Plan de afaceri — MaraAI

**Platformă KI companion & transformare personală · domeniu: `hellomara.net`**

> **Notă privind cifrele.** Toate valorile financiare din acest document sunt
> **valori exemplu / placeholder** și trebuie ajustate la datele reale înainte
> de utilizare pentru finanțare sau înregistrare. Câmpurile marcate cu
> `[…]` (nume fondator, CV, capital propriu etc.) rămân de completat.

| | |
|---|---|
| **Denumire proiect** | MaraAI |
| **Domeniu** | https://hellomara.net |
| **Formă juridică (recomandată)** | UG (haftungsbeschränkt) |
| **Fondator/ă** | `[Nume, prenume]` |
| **Data** | `[LL.AAAA]` |
| **Versiune document** | 1.0 (draft) |

---

## Cuprins

<div class="toc">

1. [Ideea de afaceri](#1-ideea-de-afaceri)
2. [Condiții personale](#2-condiții-personale)
3. [Evaluarea pieței (grupuri țintă, planificare venituri)](#3-evaluarea-pieței)
4. [Situația concurenței](#4-situația-concurenței)
5. [Factori de producție / servicii](#5-factori-de-producție--servicii)
6. [Alegerea locației (infrastructură / deployment)](#6-alegerea-locației)
7. [Perspective de viitor (șanse și riscuri)](#7-perspective-de-viitor)
8. [Alte aspecte importante (formă juridică, GDPR, asigurări)](#8-alte-aspecte-importante)
9. [Anexe (plan investiții, lichidități, rentabilitate, ToDo)](#9-anexe)

</div>

---

## 1. Ideea de afaceri

**MaraAI** este o platformă „KI companion" (însoțitor AI) pentru transformare
personală, disponibilă la domeniul `hellomara.net`. Utilizatorii interacționează
cu **Mara**, un asistent conversațional AI, și parcurg programe de dezvoltare
personală gamificate, într-un ecosistem social integrat (video reels, articole,
instrumente pentru creatori).

**Propunerea de valoare.** Spre deosebire de un simplu chatbot, MaraAI combină:

- **Conversație AI cu persona „Mara"** — chat empatic, cu posibilitatea de
  personalitate personalizată pentru abonații VIP.
- **Programe de transformare progresive** (mecanica „o misiune pe zi"):
  New Mindset (1 zi) → New Habit (21 zile) → New Skills (90 zile) →
  New Body (180 zile) → New Life (365 zile) → New You (1095 zile).
- **Ecosistem de conținut**: Reels (video scurt), WritersHub (articole cu
  monetizare pe niveluri), Creators (instrumente + partajare venituri), You/Profile.
- **„Mara Brain"** — un sistem autonom de învățare care rulează un ciclu de
  analiză la fiecare 2 ore, propunând experimente de creștere pentru aprobare.

**Model tehnologic diferențiator.** Costul marginal per utilizator este ținut
scăzut printr-un **router de provideri AI** care preferă un model **Ollama
self-hosted** (fără cost per token) și folosește **Anthropic Claude** doar ca
fallback. Aceasta permite o marjă mai bună decât modelele dependente 100% de
API-uri comerciale.

**Misiune.** Să facă dezvoltarea personală susținută de AI accesibilă,
măsurabilă și motivantă, transformând intențiile utilizatorilor în obiceiuri și
rezultate pe termen lung.

---

## 2. Condiții personale

> Secțiune de completat de către fondator/fondatoare.

**Fondator/ă:** `[Nume, prenume]`

**Calificare & experiență:** `[CV — studii, experiență în software/produs/AI,
antreprenoriat, marketing digital]`

**Rolul în firmă:** `[ex. Founder & CEO — produs, dezvoltare, strategie]`

**Competențe relevante deja acoperite (pe baza produsului existent):**

- Dezvoltare full-stack (Node.js/Express + React/TypeScript).
- Integrare și operare de modele AI (Ollama self-hosted, Anthropic Claude).
- Arhitectură și deployment cloud (Docker, Railway), baze de date (SQLite/Drizzle).
- Produs, UX și internaționalizare (27+ limbi).

**Competențe de completat / de externalizat:** `[ex. vânzări B2C, marketing de
performanță, aspecte fiscale și juridice, suport clienți la scară]`

**Situație personală / disponibilitate:** `[full-time / part-time, rezerve
financiare pentru perioada de start, sprijin familial]`

---

## 3. Evaluarea pieței

### 3.1 Piața și tendințele

MaraAI activează la intersecția a trei piețe în creștere: **aplicații de
dezvoltare personală / wellbeing**, **însoțitori AI conversaționali** și
**economia creatorilor de conținut**. Adoptarea asistenților AI de tip
consumer a accelerat semnificativ, iar disponibilitatea de a plăti pentru
instrumente de coaching/motivație personalizate este în creștere.

### 3.2 Grupuri țintă

| Segment | Descriere | Nevoie principală |
|---|---|---|
| **Utilizatori „self-improvement"** (18–45) | Persoane care vor obiceiuri mai bune, disciplină, claritate | Ghidaj structurat, motivație zilnică |
| **Utilizatori AI-curioși** | Vor un companion AI pentru conversație și reflecție | Interacțiune empatică, personalizată |
| **Creatori de conținut** | Scriitori/creatori care vor să publice și să monetizeze | Instrumente + partajare venituri (creatorul păstrează 70%) |
| **Comunitate multilingvă** | Public internațional (27+ limbi) | Acces în limba proprie, PWA instalabilă |

### 3.3 Planificare venituri (model)

Sursele de venit sunt:

1. **Abonament VIP** (principal) — vezi capitolul 5 pentru modelul de preț.
2. **Partajare venituri din conținut** — platforma reține 30% din veniturile
   creatorilor monetizați (creatorul păstrează 70%).
3. **(Potențial) venituri auxiliare** — funcții premium suplimentare, rețea P2P.

> Proiecțiile de venit detaliate (număr de utilizatori, rată de conversie
> free→VIP, ARPU) sunt în **Anexa – Plan de rentabilitate** și sunt marcate ca
> valori exemplu.

---

## 4. Situația concurenței

| Categorie | Exemple | Poziționarea MaraAI |
|---|---|---|
| Aplicații de obiceiuri / productivitate | Habitica, Fabulous, Finch | MaraAI adaugă un companion AI conversațional real + conținut social |
| Însoțitori AI | Replika, Character.AI, Pi | MaraAI adaugă programe structurate de transformare + monetizare pentru creatori |
| Coaching / meditație | Calm, Headspace | MaraAI este interactiv și personalizat prin AI, nu conținut pre-înregistrat |
| Chatboți generici | ChatGPT, Claude (direct) | MaraAI oferă persona dedicată, gamificare, comunitate și progresie pe termen lung |

**Avantaje competitive:**

- **Cost AI mai mic** prin Ollama self-hosted cu fallback Claude → marjă mai bună.
- **Retenție prin programe lungi** (până la 1095 de zile) și gamificare (XP, streaks).
- **Ecosistem integrat** (chat + reels + articole + creatori) într-o singură PWA.
- **Multilingv nativ** (27+ limbi) → piață adresabilă globală.

**Dezavantaje / riscuri competitive:** notorietate de brand redusă la start,
resurse de marketing limitate, concurenți cu bugete mari. Vezi capitolul 7.

---

## 5. Factori de producție / servicii

### 5.1 Dezvoltare

Aplicația este dezvoltată intern ca un **singur serviciu** full-stack:
un proces **Node.js / Express** care servește atât API-ul JSON (`/api/**`)
cât și **SPA-ul React** (fișiere statice din `dist/public`). Persistență în
**SQLite** prin `better-sqlite3` + **Drizzle ORM**. (Vezi `ARCHITECTURE.md`.)

### 5.2 Hosting / operare

- **Deployment**: un singur container Docker (`Dockerfile.nodejs`) pe **Railway**
  (`railway.json`), cu fișierul SQLite pe un **volum montat la `/data`**.
- **Furnizori AI**: router de provideri (`server/lib/provider-router.ts`) —
  **primar Ollama** self-hosted (fără cost per token), **fallback Anthropic
  Claude**; **graceful degrade** (mesaj localizat „îmi trag sufletul") dacă
  ambii pică, fără eroare 500.
- **„Mara Brain"**: ciclu autonom de învățare care rulează la fiecare **2 ore**
  (`server/mara-brain/platform-context.ts`).
- **Email tranzacțional**: prin **Resend** (`noreply@hellomara.net`,
  `server/lib/email.ts`).
- **Observabilitate**: Sentry (opțional), loguri Railway, dashboard admin.

### 5.3 Distribuție

- **PWA instalabilă** (mobil + desktop).
- **Suport multilingv**: 27+ limbi (`frontend/src/i18n/locales/`).
- **Rețea P2P** (Node Supporter / Gold Node) pentru distribuție video/compute și
  reducerea costurilor de CDN.
- Canale de achiziție: SEO/conținut, social media, recomandări/referral.

### 5.4 Angajați / roluri

| Rol | Fază start | Notă |
|---|---|---|
| Founder (produs + dezvoltare) | Intern | `[fondator]` |
| Marketing / conținut | Extern/part-time | de completat |
| Suport clienți | Extern/part-time | scalare la creșterea bazei |
| Juridic / contabilitate | Extern (servicii) | notar, contabil, consultant GDPR |

---

## 6. Alegerea locației (infrastructură / deployment)

Fiind un produs pur digital (SaaS/PWA), „locația" relevantă este
**infrastructura tehnică**, nu un spațiu fizic comercial.

- **Sediu social**: `[adresă în Germania — necesară pentru UG și Impressum]`.
- **Loc de muncă**: birou la domiciliu / remote (fără spațiu comercial la start).
- **Infrastructură de producție**:
  - **Railway** (platformă de hosting containere) — build din `Dockerfile.nodejs`.
  - **Volum persistent** montat la `/data` pentru baza de date SQLite.
  - **Domeniu**: `hellomara.net` (CNAME către Railway).
  - **Provider AI primar**: server Ollama self-hosted `[locație/host de precizat]`.
  - **Fallback AI**: API Anthropic Claude.
  - **Email**: Resend.

**Avantaje ale acestei alegeri:** costuri fixe reduse, scalare elastică,
independență geografică, timp de lansare rapid. **Constrângere cunoscută:**
o singură instanță SQLite (un singur writer) — potrivită scalei actuale, nu
pentru concurență mare la scriere (vezi `ARCHITECTURE.md`).

---

## 7. Perspective de viitor (șanse și riscuri)

### 7.1 Șanse

- Creșterea cererii pentru companioni AI și instrumente de wellbeing.
- Marjă favorabilă datorită AI self-hosted (Ollama) cu fallback comercial.
- Extindere internațională rapidă (deja 27+ limbi).
- Efecte de rețea prin conținutul creatorilor și rețeaua P2P.
- Upsell: funcții premium, personalitate AI personalizată, monetizare creatori.

### 7.2 Riscuri

| Risc | Impact | Măsură de atenuare |
|---|---|---|
| **Inconsistență de preț (9€/89€ frontend vs. 20€/lună backend)** | Confuzie clienți, venituri/afișare incorecte | Unificarea modelului de preț înainte de lansarea plăților (vezi ToDo) |
| Dependență de furnizori AI (costuri, disponibilitate) | Costuri variabile, întreruperi | Router cu fallback + graceful degrade; monitorizare |
| Plăți neactivate (PayPal/Stripe „lazy", 503 fără chei) | Fără încasări până la configurare | Activare și testare PayPal/Stripe înainte de lansare |
| Retenție / churn scăzut | Venituri sub proiecții | Gamificare, programe lungi, notificări, conținut |
| Conformitate GDPR | Amenzi, blocaje | Impressum, AGB, politică confidențialitate, contracte AV |
| Scalabilitate SQLite (single-writer) | Limitare la creștere mare | Plan de migrare/replicare la nevoie |
| Notorietate redusă / marketing limitat | Achiziție lentă | SEO, referral, parteneriate, conținut organic |

---

## 8. Alte aspecte importante

### 8.1 Formă juridică

Formă juridică recomandată: **UG (haftungsbeschränkt)** — răspundere limitată,
capital de pornire redus, potrivită pentru un start solo/mic. Alternativ, la
creșterea capitalului, conversie în **GmbH**.

### 8.2 Autorizații / GDPR

- **Impressum**, **AGB** (termeni și condiții) și **politică de confidențialitate**
  publicate pe `hellomara.net`.
- **Contracte de prelucrare a datelor (AV / DPA)** cu furnizorii care procesează
  date: **Anthropic**, hosting (**Railway**), email (**Resend**).
- **Consent gate opt-in** pentru cookie-uri/prelucrare (deja prevăzut în produs).
- Minimizarea datelor, drepturile persoanelor vizate, securitatea sesiunilor
  (bcrypt, CSRF, connect-sqlite3).

### 8.3 Infrastructură (rezumat operațional)

- Un container Docker pe Railway; SQLite pe volum `/data`; domeniu `hellomara.net`.
- Backup periodic al bazei de date (`npm run backup:db`).
- Monitorizare: Sentry (opțional), loguri Railway, health checks
  (`/api/health`, `/api/health/db`, `/api/ai/health`).

### 8.4 Asigurări

- **Asigurare de răspundere profesională / cyber** (recomandată pentru SaaS).
- **Asigurare de răspundere a firmei** (Betriebshaftpflicht).
- `[Verificat cu broker de asigurări — valori de completat]`.

---

## 9. Anexe

> **Toate cifrele de mai jos sunt valori exemplu / placeholder.** Trebuie
> ajustate la ofertele reale ale furnizorilor și la ipotezele proprii de piață.
> Proiecțiile financiare folosesc **prețurile din frontend (9 €/lună, 89 €/an)**,
> conform cerinței, deși backend-ul definește momentan `vip_monthly` la 20 €/lună
> — vezi riscul de inconsistență (cap. 7) și lista ToDo (Anexa 9.4).

### 9.1 Plan de investiții / necesar de capital (3 ani)

*Valori exemplu, în EUR.*

| Poziție | An 1 | An 2 | An 3 |
|---|--:|--:|--:|
| Costuri de înființare (notar, Handelsregister, consultanță) | 1.500 | 0 | 0 |
| Hosting Railway (container + volum) | 600 | 900 | 1.200 |
| Server Ollama self-hosted (GPU/host) | 2.400 | 2.400 | 3.000 |
| Costuri API Anthropic (fallback) | 1.200 | 1.800 | 2.400 |
| Software / licențe (Resend, Sentry, domenii, unelte) | 900 | 1.100 | 1.300 |
| Marketing / achiziție utilizatori | 3.000 | 6.000 | 10.000 |
| Salariu antreprenor (Unternehmerlohn) | 18.000 | 24.000 | 30.000 |
| Rezervă / diverse | 1.500 | 2.000 | 2.500 |
| **Total necesar de capital** | **29.100** | **38.200** | **50.400** |

### 9.2 Plan de lichiditate — Anul 1 (lunar)

*Valori exemplu, în EUR. Capital propriu inițial: `[X]` · Împrumut: `[Y]`.*

| Lună | Venituri abonamente | Plăți (op. + marketing + salariu) | Flux net | Sold lichiditate |
|---|--:|--:|--:|--:|
| Capital inițial | — | — | — | 15.000 |
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
| **Total An 1** | **22.550** | **30.600** | **−8.050** | **6.950** |

### 9.3 Plan de rentabilitate (3 ani)

*Valori exemplu, în EUR. Ipoteze: ARPU mediu ≈ 8 €/lună (mix 9 €/lună și 89 €/an),
conversie free→VIP crescătoare.*

| Poziție | An 1 | An 2 | An 3 |
|---|--:|--:|--:|
| Venituri abonamente VIP | 22.550 | 60.000 | 120.000 |
| Venituri partajare conținut (30%) | 500 | 2.000 | 5.000 |
| **Total venituri** | **23.050** | **62.000** | **125.000** |
| Costuri AI (Ollama host + Anthropic) | 3.600 | 4.200 | 5.400 |
| Hosting + software/licențe | 1.500 | 2.000 | 2.500 |
| Marketing | 3.000 | 6.000 | 10.000 |
| Salariu antreprenor | 18.000 | 24.000 | 30.000 |
| Alte cheltuieli | 1.500 | 2.000 | 2.500 |
| **Total cheltuieli** | **27.600** | **38.200** | **50.400** |
| **Rezultat operațional** | **−4.550** | **23.800** | **74.600** |

### 9.4 Listă ToDo — formalități juridice / tehnice

| # | Sarcină | Tip | Stare |
|---|---|---|---|
| 1 | Contract de societate UG + autentificare notarială | Juridic | ☐ |
| 2 | Înregistrare în Handelsregister | Juridic | ☐ |
| 3 | Înregistrare activitate (Gewerbeanmeldung) | Juridic | ☐ |
| 4 | Înregistrare fiscală (Finanzamt) + TVA | Fiscal | ☐ |
| 5 | Publicare Impressum, AGB, politică de confidențialitate | GDPR | ☐ |
| 6 | Contracte AV/DPA cu Anthropic, Railway, Resend | GDPR | ☐ |
| 7 | **Unificarea modelului de preț (9 € frontend vs. 20 € backend)** | Produs | ☐ |
| 8 | Activarea și testarea plăților PayPal + Stripe (chei API) | Tehnic | ☐ |
| 9 | Configurare backup automat al bazei de date | Tehnic | ☐ |
| 10 | Asigurări (răspundere profesională / cyber) | Operațional | ☐ |
| 11 | Completare date fondator, CV, capital propriu | Administrativ | ☐ |

---

*Document generat pentru MaraAI · `hellomara.net`. Toate valorile financiare
sunt exemple și trebuie validate înainte de utilizare.*
