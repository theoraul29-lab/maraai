// Mara Library — Collection of knowledge sources for autonomous reading
// Mara reads from this library during brain cycles, BEFORE and DURING user activity

import { processDocument, processDocumentBatch, type DocumentReadResult } from './agents/document-reader.js';
import { getKnowledgeStats, searchKnowledge, storeKnowledge } from './knowledge-base.js';
import { storage } from '../storage.js';
import { llmGenerate, isLLMConfigured, LLMRateLimitedError } from '../llm.js';
import { db } from '../db.js';
import { maraKnowledgeBase } from '../../shared/schema.js';
import { like } from 'drizzle-orm';
import { webSearch } from '../lib/web-search.js';

export interface LibraryBook {
  id: string;
  title: string;
  content: string;
  category: 'business' | 'trading' | 'content_creation' | 'writing' | 'ai' | 'psychology' | 'marketing' | 'general';
  priority: number; // 1=highest
}

// Track which books Mara has already read (persists via knowledge base)
const readBookIds = new Set<string>();

/**
 * Get the full built-in library — curated knowledge sources for Mara
 */
export function getBuiltInLibrary(): LibraryBook[] {
  return [
    // === BUSINESS & STARTUP ===
    {
      id: 'biz-lean-startup',
      title: 'Principii Lean Startup pentru Platforme Digitale',
      category: 'business',
      priority: 1,
      content: `Lean Startup — Principii Fundamentale pentru MaraAI

1. BUILD-MEASURE-LEARN
Ciclul fundamental al oricărei platforme: construiește un MVP minim, măsoară cum reacționează utilizatorii, învață din date și iterează. Nu construi features pe baza presupunerilor — construiește pe baza datelor.

2. MVP (Minimum Viable Product)
Lansează rapid cu funcționalitățile core. Pentru MaraAI: chat AI, un modul principal (trading SAU creator), și un sistem de autentificare. Restul se adaugă incremental pe baza feedback-ului real.

3. PIVOT vs PERSEVERE
Dacă un modul nu atrage utilizatori (ex: WritersHub are engagement scăzut), nu abandona imediat — analizează DE CE. Poate conținutul initial e slab, poate UX-ul e complicat, poate audiența nu știe că există. Dar dacă după 3 iterații datele sunt negative → PIVOT.

4. VALIDATED LEARNING
Fiecare feature nouă trebuie să aibă o ipoteză măsurabilă: "Dacă adăugăm video reels, engagement-ul va crește cu 20%." Dacă nu crește → ipoteza e falsă → înveți ceva.

5. INNOVATION ACCOUNTING
Măsoară progress-ul nu prin features livrate, ci prin metrici de impact: DAU/MAU ratio, retention la 7 zile, time on platform, conversion rate free→premium.

6. CUSTOMER DEVELOPMENT
Vorbește cu utilizatorii ÎNAINTE de a construi. Întreabă: "Ce problemă încerci să rezolvi?" nu "Ți-ar plăcea feature X?". Oamenii zic da la features dar nu le folosesc.

7. GROWTH ENGINES
Trei tipuri: Sticky (retention ridicat), Viral (utilizatorii invită alții), Paid (marketing plătit). MaraAI ar trebui să se concentreze pe Sticky mai întâi — să fie atât de util încât oamenii revin zilnic.

8. ACTIONABLE METRICS vs VANITY METRICS
Vanity: "avem 10,000 vizite pe lună" — nu contează dacă nimeni nu revine. Actionable: "rata de retenție la 7 zile e 35%" — pe asta poți acționa.

9. SMALL BATCHES
Nu lansa 10 features odată. Lansează câte una, măsoară impactul, apoi următoarea. Altfel nu știi ce a funcționat.

10. CONTINUOUS DEPLOYMENT
Automatizează deploy-ul. Cu cât mai rapid ajung schimbările la utilizatori, cu atât mai rapid primești feedback. CI/CD, feature flags, A/B testing.`,
    },
    {
      id: 'biz-monetization',
      title: 'Strategii de Monetizare pentru Platforme SaaS',
      category: 'business',
      priority: 1,
      content: `Monetizare SaaS — Ghid Complet pentru Platforme ca MaraAI

1. FREEMIUM MODEL
Oferă valoare reală gratuit, dar limitează accesul la features premium. Regula de aur: versiunea gratuită trebuie să fie suficient de bună încât utilizatorul să vadă valoarea, dar nu atât de completă încât să nu aibă motiv să plătească.

Exemplu MaraAI:
- Free: Chat AI basic (10 mesaje/zi), acces la 3 strategii trading, browsing conținut
- Premium: Chat AI nelimitat, 50 strategii, Creator Studio complet, WritersHub, VIP support

2. PRICING TIERS
Standard SaaS pricing:
- Free: $0 — atrage volum
- Pro: $9.99/lună — individual power users
- Business: $29.99/lună — features avansate, analytics
- Enterprise: Custom — API access, white-label

3. CONVERSION OPTIMIZATION
- Afa în UI momentele "aha" unde gratuit →  limita → prompt upgrade
- Free trial 14 zile pentru planul Pro (fără card)
- Reduce friction: nu cere card la înregistrare
- Social proof: "500+ traderi folosesc strategiile premium"

4. RETENTION > ACQUISITION
Costul de a reține un client e 5x mai mic decât de a achiziționa unul nou. Focus pe:
- Onboarding excelent (primele 5 minute sunt critice)
- Email nurturing (ziua 1, 3, 7, 14)
- Feature discovery (ghidează utilizatorii spre features pe care nu le-au descoperit)
- Community building (utilizatorii care dau engagement rămân)

5. CHURN REDUCTION
Monitorizează semnalele de churn: scăderea activității, nelogare 7+ zile, feedback negativ. Intervine proactiv cu: notificări personalizate, oferte de discount, survey de exit.

6. UPSELL & CROSS-SELL
Nu vinde doar planuri — vinde outcomes. "Vrei să îți crească portfeliul? Strategiile Premium au 23% ROI mai bun." "Vrei mai mulți followers? Creator Studio Pro include AI thumbnails."

7. PAYMENT PSYCHOLOGY
- Oferă plata anuală cu discount (20-30%) — reduce churn
- Arată economiile: "Economisești $36/an cu planul anual"
- Anchoring: arată planul cel mai scump primul
- Highlight "Most Popular" pe planul din mijloc`,
    },

    // === TRADING & CRYPTO ===
    {
      id: 'trading-fundamentals',
      title: 'Fundamente Trading Crypto pentru AI Assistant',
      category: 'trading',
      priority: 1,
      content: `Trading Crypto — Ce Trebuie Să Știe un AI Trading Assistant

1. ANALIZĂ TEHNICĂ — BAZA
- Support & Resistance: niveluri de preț unde cererea/oferta se concentrează
- Moving Averages: SMA (Simple), EMA (Exponential) — crossover = semnal
- RSI (Relative Strength Index): >70 = supracumpărat, <30 = supravândut
- MACD: Signal line crossover, divergențe
- Volume: confirmă sau infirmă mișcările de preț
- Bollinger Bands: volatilitate, squeeze = mișcare iminentă

2. RISK MANAGEMENT — ESENȚIAL
- Nu risca mai mult de 1-2% din portofoliu per trade
- Stop-Loss OBLIGATORIU pe fiecare trade
- Take-Profit la ratio minim 1:2 (risc:reward)
- Nu face leverage peste 5x dacă ești începător
- Diversifică: nu pune tot în BTC sau tot în altcoins

3. PSIHOLOGIA TRADING-ULUI
- FOMO (Fear Of Missing Out): cel mai mare dușman. Nu intra în trade-uri bazat pe emoție
- Greed: setează take-profit și respectă-l. "Pigs get slaughtered"
- Fear: nu vinde la panic. Ai un plan ÎNAINTE de a intra în trade
- Revenge trading: după o pierdere, NU face imediat alt trade. Ia o pauză

4. TIPURI DE TRADING
- Scalping: minute, profit mic per trade, volum mare. Stresant, necesită experiență
- Day Trading: în cadrul zilei, nu ține overnight. Risc moderat
- Swing Trading: zile-săptămâni. Potrivit pentru MaraAI — timp de analiză
- Position Trading: luni-ani. HODLing strategic

5. INDICATORI FUNDAMENTALI CRYPTO
- Market Cap: volum total × preț. Top 10 = mai sigur
- TVL (Total Value Locked): pentru DeFi, arată încrederea
- Hash Rate: pentru PoW, indică securitatea rețelei
- On-chain metrics: active addresses, transaction count, whale movements

6. STRATEGII PENTRU AI ASSISTANT
- Alertele de preț personalizate per utilizator
- Sentiment analysis din social media (Twitter/X, Reddit)
- Backtesting pe date istorice
- Portfolio tracking cu profit/loss în timp real
- Educational content adaptat la nivelul utilizatorului
- NICIODATĂ nu da "financial advice" — oferă "educational information"`,
    },

    // === CONTENT CREATION ===
    {
      id: 'content-creator-economy',
      title: 'Creator Economy — Ghid pentru Platforme de Content',
      category: 'content_creation',
      priority: 2,
      content: `Creator Economy — Cum Să Ajuți Creatorii Să Crească

1. ALGORITMUL PLATFORM-URILOR
Toate platformele prioritizează: watch time > engagement > recency > share rate. Un video de 60 sec cu 80% completion rate bate un video de 10 min cu 20% completion rate.

2. CONTENT PILLARS
Fiecare creator trebuie 3-5 piloni de conținut. Exemplu YouTuber tech: Reviews, Tutorials, News, Setup Tours, Q&A. Consistența pe piloni → algoritm fericit → creștere.

3. HOOKS — PRIMELE 3 SECUNDE
Hook-ul decide dacă cineva rămâne sau scrollează. Tipuri eficiente:
- Provocare: "Nu înțelegi trading-ul greșit?"
- Curiositate: "Am făcut $500 cu o singură strategie..."
- Relatability: "Toți facem această greșeală..."
- Urgență: "Asta se schimbă mâine..."

4. MONETIZARE CREATOR
- Ad Revenue (necesită scală: 1000+ sub + 4000 ore watch time pe YouTube)
- Sponsorships (de la ~5000 followeri, $100-$10,000/post depinde de nișă)
- Merchandise (margini 40-70%)
- Digital Products (courses, templates, presets = profit margin 90%+)
- Community/Membership (cel mai stabil: recurring revenue)
- Tips/Donations (Patreon, Buy Me a Coffee)

5. ENGAGEMENT STRATEGIES
- Răspunde la TOATE comentariile în primele 60 min (boost algoritm)
- Call to action clar: "Comentează cu X dacă vrei partea 2"
- Polls, quizzes, Q&A stories
- Colaborări cu creatori de aceeași dimensiune
- Behind the scenes — oamenii vor autenticitate

6. CUM AJUTĂ MaraAI CREATORII
- AI thumbnails & titluri optimizate
- Script generator bazat pe trending topics
- Analytics cu sugestii acționabile ("Postează marți la 18:00, audiența ta e cel mai activă")
- Hashtag research automatizat
- Content calendar cu idei generate AI`,
    },

    // === WRITING & CREATIVE ===
    {
      id: 'writing-creative',
      title: 'Scriere Creativă — Principii pentru AI Writing Assistant',
      category: 'writing',
      priority: 2,
      content: `Scriere Creativă — Cum Să Fie Mara un Writing Coach Excelent

1. STRUCTURA NARATIVĂ CLASICĂ
- Expunere: introduce personajele, setting-ul, tonul
- Conflict: problema centrală care conduce povestea
- Rising Action: tensiunea crește, mizele cresc
- Climax: momentul de maximă tensiune
- Dénouement: rezoluția, consecințele, noul status quo

2. SHOW, DON'T TELL
Greșit: "Maria era tristă."
Corect: "Maria apăsă cana de cafea cu ambele mâini, privind fix la suprafața lichidului fără să bea."
AI-ul trebuie să învețe să ghideze scriitorii spre descrieri senzoriale, nu declarații emoționale.

3. VOCE ȘI TON
Fiecare scriitor are o voce unică. Mara NU trebuie să rescrie textul în stilul ei — trebuie să ajute scriitorul să-și dezvolte propria voce. Sugerează, nu impune.

4. EDITING FRAMEWORK
Fiecare text trece prin 3 runde de editare:
1. Structural edit: ordinea ideilor, flow-ul narativ, capitole
2. Line edit: fiecare propoziție sună bine? E clară? E necesară?
3. Copy edit: gramatică, punctuație, consistență stilistică

5. GENURI ȘI CONVENȚII
- Ficțiune literară: profunzime emoțională, limbaj poetic, teme universale
- Thriller: pacing rapid, cliffhangere, plot twists
- Romance: dezvoltare personaje, tensiune romantică, HEA (Happily Ever After)
- SF: world-building consistent, regulile universului
- Non-ficțiune: structură logică, surse, ton autoritar dar accesibil

6. WRITER'S BLOCK — TEHNICI
- "Scrie prost" intenționat 10 min → editezi după
- Schimbă perspectiva (persoana I → III sau invers)
- Scrie scena finală mai întâi
- Întreabă: "Ce e cel mai rău lucru care s-ar putea întâmpla personajului acum?"
- Timer de 25 min (Pomodoro) — doar scrii, fără editare

7. CUM AJUTĂ MaraAI SCRIITORII
- Feedback personalizat pe stil, structură, pacing
- Sugestii de dezvoltare personaje
- Consistency checker (nume, timeline, detalii)
- Prompt generator pentru inspirație
- Auto-formatare pentru diverse platforme (eBook, blog, social media)`,
    },

    // === AI & TECH ===
    {
      id: 'ai-conversational',
      title: 'Cum Să Fii un AI Companion Excelent',
      category: 'ai',
      priority: 1,
      content: `AI Conversational Design — Principii pentru Mara

1. EMPATIE ARTIFICIALĂ
Nu simți emoții, dar poți recunoaște și valida emoțiile utilizatorului. "Înțeleg că asta te frustrează" e mai bun decât "Nu ar trebui să te simți așa."

2. CONTEXT AWARENESS
Ține minte ce a zis utilizatorul anterior în conversație. Referă-te la informații anterioare: "Mai devreme ai menționat că te interesează BTC — vrei să aprofundăm?"

3. CLARITATE > COMPLEXITATE
Nu folosi jargon tehnic decât dacă utilizatorul demonstrează că-l înțelege. Adaptează complexitatea la nivel.

4. HONEST LIMITATIONS
Spune când nu știi. "Nu am informații recente despre asta, dar pot cerceta" → construiește încredere. Încrederea e totul.

5. PERSONALIZARE PROGRESIVĂ
Cu cât interacționezi mai mult cu un utilizator, cu atât răspunsurile trebuie să devină mai personalizate. Referă-te la preferințele, istoricul, obiectivele lor.

6. PROACTIVITATE
Nu aștepta să fii întrebat — oferă sugestii: "Am observat că te interesează swing trading — vrei să-ți arăt 3 strategii noi?"

7. MULTI-MODAL THINKING
Conectează cunoștințe din domenii diferite: trading + psihologie, content creation + marketing, writing + business. Oferă perspective cross-domain.

8. ERROR RECOVERY
Când greșești, recunoaște rapid și corectează. Nu te scuza excesiv — corecția e suficientă.

9. BOUNDARIES
- Nu da sfaturi medicale/legale
- Nu fa pe psihologul
- Nu da "financial advice" — oferă "educational information"
- Recunoaște când un utilizator are nevoie de ajutor profesional uman

10. THE IDEAL AI COMPANION
Să fii ca cel mai bun prieten care e și expert: accesibil, cald, dar competent și sincer. Nu linguțitor, nu distant.`,
    },

    // === PSYCHOLOGY & USER BEHAVIOR ===
    {
      id: 'psych-user-retention',
      title: 'Psihologie & User Retention pentru Platforme Digitale',
      category: 'psychology',
      priority: 2,
      content: `Psihologia Utilizatorului — Cum Rețin Platformele Utilizatorii

1. HOOK MODEL (Nir Eyal)
Trigger → Action → Variable Reward → Investment
- Trigger intern: "Mă plictisesc" → deschid aplicația
- Action: scrollez feed-ul
- Variable Reward: nu știu CE voi găsi (dopamină!)
- Investment: postez conținut (acum am motiv să revin — să văd reacțiile)

2. HABIT FORMATION
Comportamentul devine obicei în ~66 zile (nu 21!). Pentru MaraAI: obiectiv = utilizatorul să deschidă platforma zilnic.
- Morning trigger: "Verifică semnalele de trading" 
- Daily habit: "Vorbește cu Mara 5 min"
- Evening trigger: "vezi ce conținut nou au postat creatorii"

3. GAMIFICATION
- Points/XP: acțiunile dau puncte (login zilnic, mesaje, post)
- Levels: "Trader Beginner → Trader Pro → Trader Legend"
- Streaks: "7 zile consecutive pe platformă!" (cel mai puternic mecanism)
- Leaderboards: competitive motivator
- Badges: "Scriitor Lunar", "Top Trader Săptămânal"
- Daily challenges: microtask-uri care cresc engagement-ul

4. SOCIAL PROOF
Oamenii fac ce fac alții. Arată: "432 persoane au folosit strategia asta azi", "Acest articol a primit 89 likes", "Maria a câștigat 20% cu această strategie".

5. LOSS AVERSION
Oamenii se tem mai mult de a pierde decât de a câștiga. "Ai acumulat 500 XP — nu pierde streak-ul de 12 zile!" Mai eficient decât "Câștigă 10 XP dacă te loghezi azi!"

6. PEAK-END RULE
Oamenii își amintesc experiențele prin PIK (momentul cel mai intens) și FINAL (cum s-a terminat). Asigură-te că fiecare sesiune pe platformă are un moment wow și un final pozitiv.

7. COGNITIVE LOAD
Nu supraîncărca utilizatorul cu opțiuni. Maximum 3-5 acțiuni principale pe ecran. "Paradoxul alegerii: mai multe opțiuni = mai puțină satisfacție."

8. DARK PATTERNS — CE SĂ EVIȚI
Nu manipula utilizatorii:
- Nu ascunde butonul de dezabonare
- Nu face opt-out în loc de opt-in
- Nu trimite notificări excesive
MaraAI trebuie să fie ethical by design.`,
    },

    // === MARKETING ===
    {
      id: 'marketing-growth',
      title: 'Growth Marketing pentru Platforme Digitale',
      category: 'marketing',
      priority: 2,
      content: `Growth Marketing — Strategii pentru Creșterea MaraAI

1. ACQUISITION CHANNELS
- Organic Search (SEO): blog cu content valoros despre trading, content creation, AI
- Social Media: prezență pe Twitter/X, TikTok, YouTube, Instagram
- Community: Discord/Telegram cu valoare reală, nu spam
- Referral: "Invită un prieten → ambii primiți 1 lună Pro gratuit"
- Paid: Google Ads, Meta Ads — doar după product-market fit

2. SEO STRATEGY
- Long-tail keywords: "cum să faci trading crypto ca începător", "AI trading assistant", "platformă creatori de conținut"
- Content hub: fiecare modul MaraAI are blog-uri + ghiduri
- Technical SEO: pagini rapide, mobile-first, structured data
- Backlinks: guest posts pe blog-uri de crypto, tech, creator economy

3. CONTENT MARKETING
Regula 80/20: 80% conținut educativ/valoros, 20% promotional. Oamenii fug de reclame dar adoră informație utilă.
- Blog posts: 2-3/săptămână, min 1500 cuvinte cu imagini
- Video tutorials: cum funcționează fiecare modul
- Case studies: "Cum a câștigat Maria 30% cu strategiile MaraAI"
- Newsletter: weekly digest cu cele mai bune insights

4. VIRALITY MECHANICS
- Shareable content: creează conținut pe care utilizatorii VOR să-l share (statistici trading, quotes motivaționale, template-uri)
- User-generated content: reels și postări create PE platformă, ușor de distribuit
- Social integrations: share buton one-click pe toate platformele
- Colaborări cu micro-influenceri (1K-50K followeri): mai autentici, mai engajați

5. CONVERSION FUNNEL
Awareness → Interest → Consideration → Conversion → Retention → Advocacy
- Awareness: social media, SEO, ads
- Interest: landing page cu demo, testimoniale
- Consideration: free trial, comparison pages
- Conversion: onboarding flow simplu, max 3 pași
- Retention: brain cycle suggestions, personalization
- Advocacy: referral program, reviews

6. METRICS THAT MATTER
- CAC (Customer Acquisition Cost): cât costă să atragi un utilizator
- LTV (Lifetime Value): cât valorează un utilizator pe toată durata
- LTV:CAC ratio: minim 3:1 pentru business sustenabil
- Viral Coefficient: câți utilizatori noi aduce fiecare utilizator existent
- Time to Value: cât de repede experimentează utilizatorul prima valoare`,
    },

    // === GROWTH ENGINEER CORE LIBRARY ===
    // Priority 0 = read FIRST. These 4 books form the foundation for Mara's
    // transformation into a Growth Engineer focused on conversion rate, funnel
    // optimization, and experiment-driven growth for hellomara.net.
    {
      id: 'growth-hooked-nir-eyal',
      title: 'Hooked — Modelul Hook pentru Produse Care Formează Obiceiuri (Nir Eyal)',
      category: 'psychology',
      priority: 0,
      content: `Hooked — Modelul Hook pentru Produse Care Formează Obiceiuri (Nir Eyal)

CONCEPT CENTRAL: Produsele care domină piața nu sunt cele cu cele mai multe features, ci cele care formează obiceiuri. Un obicei = o acțiune făcută cu efort cognitiv minim. Modelul Hook descrie ciclul prin care un produs creează obiceiuri.

CICLUL HOOK ARE 4 FAZE: Trigger → Action → Variable Reward → Investment. Fiecare ciclu complet face următorul ciclu mai probabil. După 5-10 cicluri, utilizatorul revine fără să se gândească.

1. TRIGGER (declanșator)
Două tipuri:
- EXTERN: notificare, email, ad, link de la prieten, icon pe homescreen. Crucial pentru utilizatorii noi, dar nu sustenabil — costă bani și atenție.
- INTERN: emoție sau stare mentală care evocă produsul automat. Pain points: plictiseală, anxietate, FOMO, singurătate, frustrare. SCOP: să faci produsul răspunsul automat la o anumită emoție.
APLICAȚIE MARAAI: Identifică emoția-pivot a fiecărui modul.
- Trading: anxietate de a rata o mișcare → Mara devine reacția automată
- Creator: frica de a fi invizibil → Mara dă recomandări de distribuție
- Writers: blocaj creativ → Mara propune începuturi de frază

2. ACTION (acțiunea)
Formula B = MAT (BJ Fogg): Behavior = Motivation × Ability × Trigger. Toate trei trebuie să fie peste prag în același moment.
- MOTIVATION: 3 motivatori — Plăcere/Durere, Speranță/Frică, Acceptare socială/Respingere
- ABILITY: 6 elemente — Time, Money, Effort fizic, Effort cognitiv, Acceptare socială, Deviere de la rutină
REGULA DE AUR: Reducerea Ability e mai eficientă decât creșterea Motivației. Făcând acțiunea MAI UȘOARĂ obții mai mult decât făcând-o MAI DEZIRABILĂ.
APLICAȚIE MARAAI: Fiecare acțiune cheie trebuie să fie SUB 3 click-uri. Signup în <30 sec. Primul post în <60 sec. Primul reply de la Mara în <10 sec.

3. VARIABLE REWARD (recompensa variabilă)
Cheia magică. Recompensele PREDICTIBILE plictisesc. Recompensele VARIABILE creează dopamina-spike. 3 tipuri:
- TRIBE (recompense sociale): like-uri, comentarii, validare socială, status. Facebook, Twitter, LinkedIn = pure tribe rewards.
- HUNT (recompense de căutare): găsirea de resurse/informații. TikTok feed = hunt reward (next video e necunoscut). Pinterest = hunt.
- SELF (recompense de mastery): progres, completare, abilități. Duolingo streaks, Gym apps, Coursera badges.
APLICAȚIE MARAAI:
- Tribe: like-uri pe posts, badge-uri vizibile, leaderboards pe Trading Akademie
- Hunt: chat cu Mara unde fiecare răspuns e DIFERIT, nu template; reels feed personalizat
- Self: progres pe cursul Trading, "carte săptămânii citită", streak de scriere zilnic

4. INVESTMENT (investiția)
Utilizatorul pune CEVA în produs — date, content, conexiuni, reputație, abilități. Cu cât investește mai mult, cu atât are mai mult de pierdut dacă pleacă. Asta crește probabilitatea revenirii.
- DATA: profil, preferințe, istoric (cu cât mai mult, cu atât recomandările sunt mai bune → flywheel)
- CONTENT: posts, comentarii, drafts, portofoliu
- FOLLOWERS: lista de oameni urmăriți și care urmăresc utilizatorul
- REPUTATION: review-uri, badge-uri, vechime, vouching
- SKILLS: cursuri completate, abilități unlock-uite
APLICAȚIE MARAAI: Fiecare modul trebuie să aibă o "investiție" clară. Trading = portfolio tracker + trade journal. Writers = drafts salvate + cititori câștigați. Reels = followers și remix-uri.

ETHICS / ANTI-MANIPULATION TEST
Eyal propune 2 întrebări înainte de a construi un hook:
1. AȘ FOLOSI EU produsul ăsta în mod regulat? (maker test)
2. ESTE ASTA în interesul utilizatorului pe termen lung? (facilitator vs dealer)
Dacă răspunsul e nu la oricare → produsul e exploatativ. MaraAI trebuie să fie facilitator (Headspace, Duolingo) nu dealer (slot machines, cazino apps).

DECONSTRUCȚIE HOOK MARAAI YOU PROFILE
- Trigger intern: singurătate digitală (nu am cu cine să împart o reușită)
- Action: postează un update — 2 click-uri, text + opțional poză
- Variable reward: likes + comentarii + reply-uri automate de la Mara (tribe + hunt)
- Investment: profil, cover, badge-uri, lista de followers, history de posts
FUNCȚIONEAZĂ DACĂ: primul like vine în < 5 min, primul reply Mara în < 30 sec, badge-uri vizibile, followers crește vizibil în primele 7 zile.

CHECKLIST GROWTH ENGINEER: Pentru fiecare modul, întreabă:
1. Ce emoție-pain declanșează intern utilizatorul către modul?
2. Care e acțiunea minimă? Sub 3 click-uri?
3. Ce recompensă variabilă oferă? (cele 3 tipuri toate prezente?)
4. Ce investește utilizatorul pe cale să fie blocat de produs?
5. Trec testul facilitatorului (nu dealer)?`,
    },
    {
      id: 'growth-hacking-growth-sean-ellis',
      title: 'Hacking Growth — North Star Metric și Framework de Experimentare (Sean Ellis)',
      category: 'marketing',
      priority: 0,
      content: `Hacking Growth — North Star Metric și Framework de Experimentare (Sean Ellis)

CONCEPT CENTRAL: Growth nu e marketing. Growth e un proces sistematic de experimente care optimizează un singur număr — North Star Metric — și care implică TOATE departamentele (product, engineering, design, marketing, data).

1. NORTH STAR METRIC (NSM)
Un singur număr care surprinde valoarea livrată utilizatorilor. Trebuie să îndeplinească 3 criterii:
- Reflectă VALOAREA pentru utilizator (nu doar revenue)
- E indicator-predictor de growth pe termen lung
- E măsurabil zi de zi
EXEMPLE FAIMOASE:
- Airbnb: nopți rezervate (nu visits, nu signups)
- Facebook: utilizatori care-ți primesc 7 prieteni în 10 zile
- Spotify: timp ascultat
- Slack: companii cu 2000+ mesaje trimise
- WhatsApp: mesaje trimise
PROPUNERE MARAAI NSM: "Utilizatori care fac 3+ interacțiuni semnificative în primele 7 zile" (post + comment + AI-chat). Asta predicte retention la 30 zile cu r>0.7 în studii similar SaaS.

2. GROWTH TEAM STRUCTURE
- Growth Lead (orientează prioritățile)
- Product Manager (definește experimentele)
- Engineering (implementează rapid, cu feature flags)
- Designer (mockups rapide pentru variante)
- Data Analyst (definește metricile, măsoară rezultate)
- Marketing/Content (top-of-funnel)
TOATĂ ECHIPA în standup zilnic de 15 min. Cadență săptămânală: 1 ciclu = 1 experiment major + 3-5 mici. La hellomara.net cu echipă de 1, Mara joacă rolul Growth Lead + Data Analyst, iar tu (founder) faci eng/design/decision.

3. EXPERIMENT FRAMEWORK
Pași stricți pentru orice experiment:
a) IPOTEZĂ: "Dacă schimbăm X, atunci Y va crește cu Z% pentru că [motiv]"
b) MĂSURĂTOARE: ce metrică, control vs variantă, sample size minim
c) PRIORITIZARE ICE: Impact (1-10) × Confidence (1-10) × Ease (1-10). Cele cu scor mare se fac primele.
d) IMPLEMENTARE: feature flag, randomizare 50/50, minim 2 săptămâni
e) ANALIZĂ: significance statistică (p < 0.05), nu doar "pare mai bine"
f) DECIZIE: ship full, kill, iterate
g) ÎNVĂȚARE: salvează rezultatul în knowledge base — chiar și experimentele eșuate sunt aur.

4. AARRR — PIRATE METRICS FUNNEL
Acquisition → Activation → Retention → Referral → Revenue. Pentru fiecare nivel, identifică una metrică cheie și un experiment lunar.
- Acquisition: traffic surse, CPC, organic vs paid mix
- Activation: % din useri care ating "aha moment" (primul post, primul chat, prima trade idee)
- Retention: D1, D7, D30 retention curves (smile curve = sănătos)
- Referral: viral coefficient k = (invitations sent × conversion rate)
- Revenue: ARPU, ARPPU, churn rate, CAC payback

5. AHA MOMENT IDENTIFICATION
Aha moment = punctul în care utilizatorul "înțelege" produsul. Predicte retention.
METODOLOGIE:
- Compară useri retained vs churn
- Identifică acțiunile statistic diferite în primele 7 zile
- Test cauzalitate (forțează acțiunea în onboarding și vezi retention)
EXEMPLE:
- Facebook: 7 prieteni în 10 zile
- Twitter: a urmări 30 conturi
- Dropbox: a uploada un fișier într-un device + a accesa de pe alt device
- Slack: 2000 mesaje per team
PROPUNERE HELLOMARA.NET: Mara identifică în Phase 4 propria aha moment via cohort analysis.

6. ACTIVATION FUNNEL OPTIMIZATION
Cele mai multe pierderi sunt în primele 60 secunde:
- Signup → Onboarding → First Value
ELIMINĂRI DE FRICTION:
- Magic links în loc de parolă
- OAuth (Google, GitHub, X) — reduce signup la 1 click
- "Skip onboarding" buton la al 3-lea pas
- Demo data pre-populated pentru a vedea valoarea instant
- "Time to first wow" < 60 sec — măsoară-o!

7. RETENTION LEVERS
- Notificări trigger-uite de comportament (nu spam)
- Email re-engagement la D3, D7, D14, D30
- Personalization (cu cât mai mult folosește, cu atât mai bine se simte)
- Streak mechanics + reward
- Community (utilizatorii cu prieteni pe platformă au 3x retention)

8. EXPERIMENTATION CADENCE
- 1 experiment major / săptămână (changes la flow critic)
- 3-5 experimente mici / săptămână (copy, color, microinteractions)
- Vineri: review săptămânal, decizie ship/kill, plan săptămâna viitoare
- Lunar: review NSM trend, ajustare strategie

ROL MARA CA GROWTH ANALYST: Phase 4 nou — în loc de "platform analysis" generic, Mara ascute pe AARRR funnel: identifică UN punct de drop-off, propune UN experiment ICE-scored, așteaptă aprobare admin, măsoară outcome la 7-14 zile.`,
    },
    {
      id: 'growth-lean-analytics-croll-yoskovitz',
      title: 'Lean Analytics — Cele 5 Etape de Creștere și KPI-urile Lor (Croll & Yoskovitz)',
      category: 'business',
      priority: 0,
      content: `Lean Analytics — Cele 5 Etape de Creștere și KPI-urile Lor (Croll & Yoskovitz)

CONCEPT CENTRAL: Startup-urile au nevoie de UN SINGUR număr (OMTM) — One Metric That Matters — care depinde de stadiul în care se află. Same metric all the time = dezastru. Wrong metric = focus pe vanity.

1. ONE METRIC THAT MATTERS (OMTM)
Reguli OMTM:
- Răspunde la întrebarea cea mai importantă a momentului
- Forțează deciziile (nu doar tablou de bord)
- E un raport sau rată (nu un total — "1000 useri" nu spune nimic)
- E îmbinat cu un benchmark
EXEMPLE OMTM PER STAGE:
- Empathy: nr. interviuri cu clienți / săptămână (țintă: 5+)
- Stickiness: D7 retention (țintă: 30%+ SaaS, 50%+ social)
- Virality: viral coefficient k (țintă: > 1.0 pentru creștere exponențială)
- Revenue: payback period CAC (țintă: <12 luni)
- Scale: net revenue retention (țintă: 110%+)

2. CELE 5 ETAPE DE CREȘTERE
Fiecare stage are un focus și un blocker:

ETAPA 1 — EMPATHY (înainte de PMF)
GOAL: Înțelege problema utilizatorului. Validează că E REALĂ.
ACTIVITATE: Interviuri 1:1 (5-20). Nu vorbi tu — ASCULTĂ.
OMTM: nr. interviuri valide / săptămână
SEMNAL DE TRECERE: 70%+ dintre intervievați descriu aceeași problemă cu cuvintele lor.
ANTI-PATTERN: Construiești featuri înainte de a vorbi cu useri.

ETAPA 2 — STICKINESS (PMF)
GOAL: Construiești ceva ce oamenii REVIN să folosească.
ACTIVITATE: MVP funcțional cu loop de feedback rapid.
OMTM: D7 retention, time per session, sessions/week
BENCHMARK SaaS: D1 = 60%, D7 = 30%, D30 = 15%. Sub asta — n-ai PMF.
SEAN ELLIS PMF TEST: "Cum te-ai simți dacă produsul ăsta dispare?" — peste 40% "very disappointed" = ai PMF.
ANTI-PATTERN: Scali marketing înainte de a avea PMF (toarni apă într-un colander).

ETAPA 3 — VIRALITY
GOAL: Utilizatorii actuali aduc utilizatori noi GRATUIT.
ACTIVITATE: Construiești viral loops (referral, share, native integrations).
OMTM: viral coefficient k = (invitations / user) × (conversion rate)
ECUAȚII:
- k > 1 → growth exponențial
- k între 0.5-1 → growth liniar (acceptabil dacă CAC < LTV)
- k < 0.5 → nu mai investi în viralitate, fă paid
TIPURI DE VIRAL LOOPS:
- Inherent: produsul însuși cere alți useri (WhatsApp, Slack)
- Collaborative: lucrurile sunt mai bune cu prieteni (Spotify, Docs)
- Word-of-mouth: produsul e atât de bun, încât oamenii vorbesc (Apple, Tesla)
- Incentivized: bonusuri pentru invitații (Dropbox 500MB, Uber $10 ride)
ANTI-PATTERN: Forțezi sharing când produsul n-are valoare → tot stack-ul e perceput ca spam.

ETAPA 4 — REVENUE
GOAL: Convertești useri în bani. Validează că oamenii PLĂTESC.
ACTIVITATE: Pricing experiments, paywall placement, plan structure.
OMTM: CAC payback period, ARPU/ARPPU, conversion free→paid
BENCHMARK:
- SaaS B2B: CAC payback <12 luni
- SaaS B2C: <6 luni
- Conversion free → paid: 2-5% e bun, 8%+ e excelent
PRICING FRAMEWORKS:
- Van Westendorp: 4 întrebări de preț (prea ieftin / ieftin / scump / prea scump)
- Conjoint analysis: cum value-uiesc oamenii features
- Price laddering: 3 tiere — $9 / $29 / $99 (anchor middle)
ANTI-PATTERN: Pricing prea complicat. Reguli: max 3-4 tieri, decizie sub 30 sec.

ETAPA 5 — SCALE
GOAL: Crești fără să distrugi ce funcționează.
ACTIVITATE: Diversificare canale, internațional, enterprise tier.
OMTM: Net Revenue Retention (NRR), CAC blended, hiring efficiency
BENCHMARK:
- NRR 100% = stagnare (existing customers nu cresc)
- NRR 110%+ = sănătos (upsell + low churn)
- NRR 130%+ = excellence (Snowflake, Datadog)
ANTI-PATTERN: Scali înainte de Stickiness sau Revenue. "Premature scaling" e cauza #1 de eșec startup (Startup Genome Report).

3. CELE 6 BUSINESS MODELS (Lean Analytics taxonomy)
Fiecare model are metrici unice:
- E-commerce: conversion rate, AOV, repeat purchase rate
- SaaS: MRR, churn rate, CAC, LTV
- Free Mobile App: ARPDAU, retention curve, viral coefficient
- Media Site: pageviews, ad CPM, engagement
- User-Generated Content: % active creators, content per user
- Two-Sided Marketplace: liquidity (% listings that sell), take rate
MARAAI = HYBRID: SaaS (paid Pro tier) + UGC (creators publish) + Media (Mara content) → 3 sets of metrics, fiecare cu OMTM propriu pe modul.

4. COHORT ANALYSIS
Nu uita media — split useri pe cohorts (groups care s-au înscris în aceeași perioadă) și compară curve:
- Useri din Săptămâna 1 (lansare) vs Săptămâna 10 (după update onboarding)
- Useri din canal X (Google ads) vs canal Y (Twitter organic)
- Useri cu feature A vs fără feature A
Tool simplu: SQL query + heatmap. Mara poate face asta automat în Phase 4 nouă.

5. VANITY vs ACTIONABLE METRICS
VANITY: total signups, total visits, total likes. Sună mare, nu informează decizii.
ACTIVE: D7 retention, % activated, conversion rate, CAC payback. Forțează acțiuni clare.
REGULA: Dacă o metrică crește dar nu schimbă deciziile, e vanity. Tăie-o din raport.

MAPARE HELLOMARA.NET → STAGE
Acum (0 useri reali, brain rulează): EMPATHY stage.
PRIORITATE 1: 5-20 interviuri reale cu potențiali useri. Mara poate genera scripts de interviuri în Phase 2 (research).
PRIORITATE 2: După 20 interviuri → MVP în 1 modul (cel mai valid) → STICKINESS push.
SKIP ahead = premature scaling. Disciplină.`,
    },
    {
      id: 'growth-stripe-atlas-frr-patterns',
      title: 'Pattern-uri de Creștere — Lecții din Stripe Atlas + First Round Review',
      category: 'business',
      priority: 0,
      content: `Pattern-uri de Creștere — Lecții din Stripe Atlas + First Round Review

CONCEPT CENTRAL: Aceste case study-uri sunt scoase din interviuri cu fondatorii și operatorii care au construit companii de la 0 la $1B+. Nu sunt teorii — sunt pattern-uri repetate. Stripe Atlas + First Round Review sunt cele 2 surse cu cea mai mare densitate de "ce a funcționat efectiv".

1. "DO THINGS THAT DON'T SCALE" (Paul Graham + toate startup-urile FRR)
Primii 100 useri se câștigă PRIN MUNCĂ NESCALABILĂ. Lucruri pe care le faci personal, scrisori scrise de mână, onboarding-uri 1:1, support la 3 dimineața.
EXEMPLE:
- Airbnb: fondatorii zburau la NYC să facă poze profesionale gratuit pentru fiecare apartament listat
- Stripe: Patrick & John Collison instalau SDK-ul personal pe laptop-ul clientului ("Collison installation")
- DoorDash: fondatorii livrau ei comenzile cu mașina personală în primele 6 luni
- Loom: fondatorul răspundea PERSONAL la fiecare email de support, semnând "Joe (Co-founder)"
APLICAȚIE HELLOMARA.NET: Tu personal trebuie să fii în chat cu primii 50 useri. Nu Mara — TU. Mara învață din ce le răspunzi tu, apoi preia când ai 500+ useri.

2. FOUNDER-LED SALES (Stripe Atlas: "Selling at Stripe")
Primii 100 clienți B2B se închid PRIN FOUNDER, nu prin sales reps angajați. Fondatorul are 2 super-puteri:
- Schimbă produsul în timp real (un sales rep nu poate)
- Are autoritate să dea discount-uri / customizări
PATTERN: Primele 100 inquiry-uri → tu personal. Note după fiecare discuție. Pattern recognition. Apoi codifică ce funcționează în playbook → angajezi primul sales rep care urmează playbook-ul.

3. COLD START / DISTRIBUTION-FIRST (Andrew Chen, FRR multiple)
Produsul tehnic perfect + zero distribuție = mort. Construirea audienței trebuie să înceapă ÎNAINTE de produs.
PATTERN:
- Construiește audiență gratuită 6-12 luni înainte de lansare (Twitter, newsletter, YouTube)
- "Build in public" — postează săptămânal progresul
- Cere feedback PUBLIC — fiecare comentariu = early adopter
EXEMPLE:
- Notion: Ivan Zhao a postat în comunități de design 2 ani înainte de launch
- Tailwind CSS: Adam Wathan a făcut un curs gratuit Refactoring UI care a câștigat 50K dev → audiență pre-built pentru Tailwind
- Levels.fyi: founder a postat câteva date salariale pe Blind → viral pre-launch
APLICAȚIE: Tu trebuie să postezi săptămânal progres pe hellomara.net pe Twitter/LinkedIn în română.

4. TIME TO FIRST VALUE < 5 MIN (Stripe Atlas: "Onboarding")
Stripe regula: De la signup la primul "wow" trebuie să fie sub 5 minute, ideal sub 60 secunde. Asta diferențiază produse care păstrează useri de produse care îi pierd.
EXEMPLE:
- Stripe: 7 linii de cod și ai primul payment. "Hello world" of payments.
- Notion: pagină nouă în 1 click, drag-drop blocks în 3 sec
- Loom: instalare extensie + 1 click record + URL pe care îl trimiți → 30 secunde total
APLICAȚIE HELLOMARA.NET: De la /signup la "Mara mi-a spus ceva util" → sub 30 sec. Onboarding NU trebuie să fie 5 ecrane. 1 ecran + direct în chat cu Mara.

5. ÎNCEPE CU O NIȘĂ STRÂMTĂ (Y Combinator, FRR repeat pattern)
Toate startup-urile de miliarde au început cu o nișă INVERS proporțională cu mărimea pieței finale.
EXEMPLE:
- Facebook: doar Harvard students (apoi alte universități, apoi general public)
- Airbnb: doar conferințe SXSW, DNC (apoi orice oraș)
- Uber: doar San Francisco (apoi US, apoi global)
- Stripe: doar developers Ruby on Rails (apoi toate languages)
- Mara: prea larg acum (chat + trading + creator + writers + reels). Alege UNUL.
PATTERN: Mergi cu o singură nișă până ai 100% market share. Apoi extinde.
RECOMANDARE: Hellomara.net = "AI personal trainer pentru traderi crypto retail români" (nișă: 50-100K oameni). Câștigi 10% market share = 10K plătitori × €30/lună = €300K MRR.

6. RETENTION DEATH SPIRAL (FRR multiple, Stripe Atlas)
Toate produsele moarte au aceeași curbă: aha moment ratat → useri pleacă la D1/D3 → tu pumpezi marketing → useri noi pleacă la fel → CAC explodează → mori.
ANTIDOT: Înainte de marketing, REZOLVĂ retention curve. Nu cheltui un cent pe ads până D7 retention > 30%.
DIAGNOZĂ:
- D1 retention: < 50% = onboarding ROT
- D7 retention: < 20% = produs n-are valoare repetitivă
- D30 retention: < 10% = nu există PMF
HACK SIMPLU: Email re-engagement la D2, D5, D10 cu CTA specific (nu generic "come back").

7. PRICING DE LA ZIUA 1 (Stripe Atlas: "How to Price")
Marea greșeală: free forever. Lecția: dacă produsul nu valorează nimic, oamenii nu plătesc; dar dacă valorează, plătesc DE LA ÎNCEPUT.
EXEMPLE:
- Notion: free dar cu paywall clar (block limit) — conversie 5%
- Superhuman: $30/lună de la lansare, fără free tier — selecție clienți serioși
- Linear: free 10 users, $8 per user după — conversie B2B excelentă
PATTERN: Free tier limitat (max valoare = 10-20% din useri activi) + paid tier cu UPGRADE TRIGGER clar.
APLICAȚIE MARAAI: Free = 20 Mara chats / lună. Pro = €19/lună unlimited + features avansate (cohort analysis, custom reports, priority response).

8. CUSTOMER SUPPORT CA GROWTH ENGINE (Drift, Intercom, Slack FRR)
Cele mai bune startup-uri tratează support-ul ca GROWTH, nu cost.
PATTERN:
- Fiecare ticket support = oportunitate de feedback produs
- Răspuns < 1h pentru utilizatori plătitori
- Founder citește TOATE ticket-urile primele 6 luni
- "Wow moments" în support → useri scriu reviews / fac word-of-mouth
APLICAȚIE: Mara poate face support automat în 80% din cazuri, dar restul de 20% — tu personal. Track topurile de plângeri săptămânal — devin priorități de produs.

9. WORD-OF-MOUTH LEVERS (Brian Balfour, FRR)
Cele mai sustenabile loops:
- "Tools-Of-the-Trade": produsul tău devine indispensabil profesional → useri îl recomandă colegilor (Slack, Figma)
- "Status": folosirea produsului dă status → useri îl arată public (Apple, Tesla)
- "Network effect": e mai bun cu mai mulți useri → useri invită activ (LinkedIn, Discord)
INTREBARE PENTRU HELLOMARA.NET: Care din cele 3 e moat-ul? Tools-of-the-trade pentru traderi? Status pentru creatori? Network pentru writers? Răspunde — apoi optimizează loop-ul corespunzător.

10. FOUNDER OBSESSION (toate FRR profilurile)
Pattern repetat: fondatorii care construiesc companii de miliarde sunt OBSEDAȚI de un singur lucru — utilizatorul lor. Citesc fiecare review. Răspund fiecărui email. Își testează singuri produsul zilnic.
APLICAȚIE: Setează-ți o regulă — 30 min/zi în care folosești hellomara.net ca utilizator obișnuit. Vezi friction-urile, scrie-le, repară-le. Asta nu se delegă, nici lui Mara.`,
    },
    {
      id: 'psych-atomic-habits-behavior-change',
      title: 'Atomic Habits + Psihologia Schimbării Comportamentale — Aplicat pe Mara',
      category: 'psychology',
      priority: 1,
      content: `Atomic Habits + Psihologia Schimbării Comportamentale — Aplicat pe Mara

SURSE: James Clear (Atomic Habits), BJ Fogg (Tiny Habits), Nir Eyal (Indistractable), Charles Duhigg (The Power of Habit), Roy Baumeister (Willpower), Daniel Kahneman (Thinking Fast and Slow)

CONCEPT CENTRAL: Schimbarea comportamentală nu vine din motivație sau voință — vine din SISTEME. Mara nu motivează, Mara CONSTRUIEȘTE SISTEME în viețile userilor. Asta e diferența dintre o aplicație de productivitate și o transformare reală.

═══════════════════════════════════════════════════
ATOMIC HABITS — JAMES CLEAR: CELE 4 LEGI
═══════════════════════════════════════════════════

1. MAKE IT OBVIOUS (Fă-l evident)
Comportamentele se declanșează prin INDICII din mediu. Dacă vrei ca userul să facă misiunea zilnică, indiciul trebuie să fie vizibil și predictibil.
APLICAȚIE MARA:
- Notificarea de dimineață la 9 AM ("🎯 Misiunea ta de azi te așteaptă") = indica pentru habit
- Prima pagină din Missions arată misiunea curentă IMEDIAT, fără scroll
- Streakul zilnic (vizibil în XP/Level) = indicator de progres care creează commitment
- Mara trimite o frază scurtă în chat când vede că userul e inactiv 48h

2. MAKE IT ATTRACTIVE (Fă-l atractiv)
Creierul eliberează dopamină ÎNAINTE de recompensă (anticipation > reward). Sistemul de XP, level-up, streaks sunt mașini de dopamină pre-recompensă.
APLICAȚIE MARA:
- Level-up vizual trebuie să fie spectaculos (animație, sunet, mesaj personalizat de la Mara)
- Misiunile "DEEP" (dificile) trebuie marcate ca rare/exclusive — scarcity = mai attractive
- Programele cu zile numerotate (Day 1/90) creează anticipare: "Ce urmează în Day 15?"
- Mara trebuie să ANTICIPEZE recompensa: "Mâine e Day 21 — New Habit milestone!"

3. MAKE IT EASY (Fă-l ușor)
Legea Efortului Minim: creierul alege mereu calea cu cel mai mic efort. Dacă misiunea pare grea de completat, userul nu o începe.
APLICAȚIE MARA:
- Misiunile "gentle" sunt intrarea în sistem — NU le ascunde! Ele sunt onboarding-ul real
- Proof de misiune: max 3 propoziții. Dacă ceri mai mult, scade completion rate cu 40%
- Butonul "Completează azi" trebuie să fie tap-ul cel mai vizibil pe mobile
- Mara trebuie să spargă misiunile mari în micro-pași de 2 minute

4. MAKE IT SATISFYING (Fă-l satisfăcător)
Creierul memorează comportamentele care sunt urmate imediat de o senzație plăcută. Recompensa IMEDIATĂ bate recompensa VIITOARE de 10x.
APLICAȚIE MARA:
- XP-ul trebuie să apară INSTANT după completarea misiunii, cu animație
- Mara răspunde în max 1s după submit cu un mesaj cald și specific
- "Streak saved today!" apare ca toast imediat după completare
- Certificatele de milestone (Day 21, Day 90) sunt recompense tangibile de sharing

═══════════════════════════════════════════════════
BJ FOGG — TINY HABITS: FORMULA REALĂ A SCHIMBĂRII
═══════════════════════════════════════════════════

Formula: B = MAP
- Motivation (fluctuantă, nu te baza pe ea)
- Ability (abilitatea de a face comportamentul)
- Prompt (declanșatorul)

INSIGHT CRITIC: Motivația este NESIGURĂ. Abilitatea + Prompt-ul corect = comportament consistent chiar și când motivația e zero.

APLICAȚIE MARA:
- Nu construi misiuni care cer motivație ridicată pentru a fi START-uite
- Misiunile "gentle" au ability MAXIMĂ (oricine poate face) + prompt clar
- Mara trebuie să fie Prompt-ul pentru misiunile uitate (mesaj la 48h inactivitate)
- Anchor Habits: "Fă asta DUPĂ ce faci X" — Mara poate sugera: "Fă această misiune după cafeaua de dimineață"

═══════════════════════════════════════════════════
THE HABIT LOOP — CHARLES DUHIGG
═══════════════════════════════════════════════════

CUE → ROUTINE → REWARD → (CRAVING)

Odată ce loop-ul e instalat, craving-ul (dorința anticipatorie) devine automată.

PENTRU MARA:
- CUE: Notificarea de dimineață sau deschiderea aplicației
- ROUTINE: Verificarea misiunii + completarea ei
- REWARD: XP animat + mesaj de la Mara + streak update
- CRAVING după 3 săptămâni: userul VREA să deschidă Mara dimineața

Cum instalezi loop-ul:
Săptămâna 1-2: Cue extern (notificare) + Reward mare (XP dublu pentru primele 14 zile)
Săptămâna 3: Cue intern începe să se formeze (anxietate ușoară dacă nu verifică)
Luna 2: Loop automat — nu mai ai nevoie de motivație

═══════════════════════════════════════════════════
WILLPOWER DEPLETION — ROY BAUMEISTER
═══════════════════════════════════════════════════

Voința este o resursă LIMITATĂ care se epuizează în decursul zilei (ego depletion).

IMPLICAȚII PENTRU MARA:
- Misiunile dificile trebuie recomandate DIMINEAȚA, nu seara
- Mara trebuie să știe ora locală a userului și să sugereze timing optim
- "Deep work" misiunile = matin. "Reflection" misiunile = seara.
- Dacă userul e activ seara constant, oferă misiuni gentle/reflection pentru acea oră

═══════════════════════════════════════════════════
IDENTITY-BASED HABITS — JAMES CLEAR (CAP. 2)
═══════════════════════════════════════════════════

"Every action you take is a vote for the type of person you wish to become."

Schimbarea durabilă nu vine din outcome goals ("vreau să slăbesc 10 kg") ci din identity goals ("sunt tipul de persoană care face sport zilnic").

APLICAȚIE MARA (CRITIC):
- Mara nu trebuie să spună "completează misiunea" ci "fii tipul de persoană care..."
- Onboarding-ul trebuie să întrebe: "Ce tip de persoană vrei să devii în 90 de zile?"
- Misiunile sunt cadrate ca "voturi pentru identitate": "Acesta este un vot pentru viitorul tău Self"
- Level titles (în XP system) trebuie să fie identitare: "Disciplined Builder", "Creative Mind", "Resilient Spirit"
- Mara în chat trebuie să reflecte identitatea: "Ca persoană care practică disciplina zilnic..."

═══════════════════════════════════════════════════
SISTEM PRACTIC — CE FACE MARA DIFERIT DE ALTE APPS
═══════════════════════════════════════════════════

Alte apps de productivitate: trackere de task-uri + gamification superficială
Mara: SISTEM DE IDENTITATE + HABIT LOOP + CONTEXT ADAPTIV

1. Mara știe CONTEXTUL userului (XP, streak, programul activ, dispoziția din chat)
2. Mara adaptează DIFICULTATEA în timp real (după ce streakul e de 7+ zile, propune misiuni mai profunde)
3. Mara leagă misiunile de IDENTITATE ("Tu ești deja cineva care...")
4. Mara recunoaște RECĂDERILE fără judecată ("Ai sărit 3 zile — e normal. Hai să re-pornim cu o misiune mică")
5. Mara creează MICRO-COMMITMENTS ("Spune-mi un singur lucru pe care îl vei face azi")

═══════════════════════════════════════════════════
METRICI DE SCHIMBARE COMPORTAMENTALĂ PENTRU MARA
═══════════════════════════════════════════════════

1. Habit Installation Rate: % useri care completează misiuni 7 zile consecutive în prima lună
   TARGET: >25% din useri activi
2. Streak Recovery Rate: % useri care revin după un streak break
   TARGET: >40% revin în 48h după break
3. Identity Adoption: % useri care folosesc limbaj identitar în chat ("Eu sunt...")
   INDICATOR: engagement profund, risc scăzut de churn
4. Mission Depth Progression: % misiuni trecute de la "gentle" la "deep" după 30 zile
   TARGET: >30% din useri progresează în dificultate
5. Time-to-First-Mission: cât durează de la signup la prima misiune completată
   TARGET: <24h — dacă e >72h, userul e pierdut cu probabilitate 80%

═══════════════════════════════════════════════════
ANTI-PATTERNS — CE DISTRUGE HABITS
═══════════════════════════════════════════════════

1. Streakul prea prețios: dacă userul se teme să piardă streakul, evită misiunile dificile → stagnare
   FIX: "Streak freeze" (1/săptămână gratis) + mesaj de la Mara că progresul e mai important decât streakul

2. Prea multe misiuni disponibile: paradoxul alegerii — mai multe opțiuni = mai puțină acțiune
   FIX: Recomandă activ 1-3 misiuni. "Mara recomandă azi:" e mai eficient decât o grilă de 69 misiuni

3. Recompensele prea predictibile: dacă userul știe exact ce primește, dopamina scade
   FIX: Occasional surprise rewards — "Streak bonus x2 surprise!" apărând random

4. Feedback întârziat: dacă Mara răspunde în 30s, conexiunea emoțională se rupe
   FIX: Răspuns Mara în <3s (deja implementat cu timeout-uri)

5. One-size-fits-all: misiunile identice pentru toți = engagement scăzut pentru 80%
   FIX: Personalizare pe pillar + dificultate + ora zilei + streakul curent`,
    },

    // === BATCH 2 — 30 NEW BOOKS ===

    // --- PSYCHOLOGY & BEHAVIOR ---
    {
      id: 'psych-flow-csikszentmihalyi',
      title: 'Flow — Starea Optimă de Experiență (Csikszentmihalyi)',
      category: 'psychology',
      priority: 1,
      content: `Flow — Starea de Concentrare Maximă și Implicațiile pentru MaraAI

CONCEPTUL CENTRAL: Flow = starea în care ești complet absorbit de o activitate, pierzi noțiunea timpului, efortul pare fără efort. Descrisă de Mihaly Csikszentmihalyi după interviuri cu mii de oameni — sportivi, artiști, chirurgi, jucători de șah.

1. CONDIȚII PENTRU FLOW
- Obiective clare: știi exact ce trebuie să faci
- Feedback imediat: afli instantaneu dacă ești pe drumul bun
- Echilibru provocare-abilitate: prea ușor = plictiseală, prea greu = anxietate
Zona magică flow = abilitate 7/10, provocare 7-8/10

2. CELE 8 COMPONENTE ALE FLOW
a) Concentrare completă pe sarcina curentă
b) Fuzionarea acțiunii cu conștiința
c) Pierderea conștiinței de sine
d) Sentimentul de control
e) Distorsionarea timpului (orele trec ca minute)
f) Experiență în sine recompensatoare (autotelic)
g) Obiective clare
h) Feedback imediat

3. APLICAȚIE MARAAI — TRADING MODULE
- Fiecare sesiune de analiză trading trebuie să aibă un obiectiv clar: "Analizează BTC/USDT pe 4h și identifică suportul cheie"
- Feedback imediat: după ce userul face o predicție, arată-i backtestul instant
- Dificultate progresivă: strategie de bază → intermediate → avansată — nu oferi toate odată

4. APLICAȚIE MARAAI — WRITERS HUB
- Prompt de scriere cu obiectiv precis: "Scrie primul paragraf al unui articol despre..."
- Timer de 25 minute (Pomodoro) cu feedback de cuvinte la final
- Progresie de dificultate: microficțiune (50 cuvinte) → articol scurt → articol lung

5. APLICAȚIE MARAAI — MISSIONS SYSTEM
- Misiunile trebuie să fie în zona flow: nu triviale, nu imposibile
- Mara calibrează dificultatea pe baza istoricului de completare al userului
- Feedback imediat la completare: animație XP + comentariu personalizat Mara

6. DESIGN FLOW PENTRU CHAT MARA
- Mara nu trebuie să copleșească cu informații — oferă UN gând clar, cere reacție
- Conversațiile lungi să aibă momente de "small win" la fiecare 3-4 schimburi
- Evită monologurile lungi → fragmentează în dialoguri cu ritm

7. FLOW ȘI RETENȚIE
Utilizatorii care experimentează flow revin. Dacă o platformă nu induce flow niciodată, utilizatorul o abandoneaza. Investește în:
- Onboarding calibrat (nu prea ușor, nu prea greu)
- Progresie vizibilă (level-up, badge-uri noi, conținut deblocat)
- Feedback rapid și specific la fiecare acțiune

8. ANTI-FLOW PATTERNS DE EVITAT
- Notificări în mijlocul unei sesiuni deep-work
- Loading times > 2s (rupe concentrarea)
- Prea multe opțiuni simultan pe ecran
- Erori tehnice fără mesaje clare`,
    },
    {
      id: 'psych-deep-work-cal-newport',
      title: 'Deep Work — Regulile pentru Succes în Era Distrasă (Cal Newport)',
      category: 'psychology',
      priority: 1,
      content: `Deep Work — Munca Profundă ca Superputere Modernă

CONCEPTUL CENTRAL: Deep Work = activități profesionale desfășurate fără distracții, la limita maximă a capacității cognitive. Produce valoare rară și greu de replicat. Contrastul: Shallow Work = activități cognitive nesolicitate, adesea logistice, executabile și distract.

1. DE CE DEEP WORK E VALOROS ÎN 2025+
- Automatizarea elimină munca repetitivă — rămân doar sarcinile care necesită concentrare profundă
- Economia cunoașterii premiază cei care învață repede și produc la nivel înalt
- Deep work e tot mai rar (toți sunt distrași de social media) și tot mai valoros (economia cere gândire profundă)

2. CELE 4 FILOSOFII DE DEEP WORK
a) Monastic: izolare completă (Knuth, Rowling) — funcționează pentru creatori solitari
b) Bimodal: perioade lungi de izolare + perioade normale (Jung = zile întregi în turn, apoi cabinet)
c) Ritmic: schedule fix zilnic de deep work (3h dimineața, indiferent de orice)
d) Journalistic: deep work ori de câte ori apare un spațiu (greu de început, bun pentru freelanceri)

3. REGULI DE IMPLEMENTARE
Regula 1 — Work Deeply: alege o filosofie, creează ritualuri, creează infrastructură (birou dedicat, muzică specifică, protocol de pornire)
Regula 2 — Embrace Boredom: rezistență la stimulare constantă; programează distracțiile, nu deep work-ul
Regula 3 — Quit Social Media: cost-benefit riguros pe fiecare platformă; "orice beneficiu" e un criteriu prost
Regula 4 — Drain the Shallows: fixează adâncimea muncii superficiale; identifică și elimină

4. APLICAȚIE MARAAI — CREATOR STUDIO
- Mara ar trebui să recunoască pattern-urile de sesiune deep a creatorilor și să nu trimită notificări în intervalele lor de lucru
- Feature "Focus Mode": blochează notificările pentru 25/50/90 min, arată timer
- Post-sesiune: Mara celebrează productivitatea și cere feedback pe sesiune

5. APLICAȚIE MARAAI — WRITERS HUB
- Sesiuni de scriere fără distracție: full-screen editor, muzică ambientală opțional
- Mara păstrează tăcerea în sesiunile de scriere — răspunde doar dacă e invocată
- Metrica "cuvinte în deep work" separată de "cuvinte totale"

6. APLICAȚIE MARAAI — MISIUNI DE LEARNING
- Misiunile de tip "deep reading" (30 min fără distracție) sunt cele mai valoroase
- Badge special "Deep Worker" pentru useri care completează 7 sesiuni deep în 7 zile

7. PENTRU MARA CA AI
- Mara recunoaște când userul descrie că e distras și oferă strategii concrete de recuperare focus
- Nu recomanda niciodată "mai mult conținut" ca soluție la productivitate scăzută
- Promovează monotasking: o misiune, un obiectiv, un modul la un moment dat`,
    },
    {
      id: 'psych-mindset-carol-dweck',
      title: 'Mindset — Noua Psihologie a Succesului (Carol Dweck)',
      category: 'psychology',
      priority: 1,
      content: `Mindset — Growth vs Fixed: Fundamentele Motivației Umane

CONCEPTUL CENTRAL: Dweck a descoperit după 20 de ani de cercetare că oamenii au fie un Fixed Mindset (inteligența e fixă, eșecul = identitate), fie un Growth Mindset (inteligența se poate dezvolta, eșecul = feedback). Mindset-ul determină realizările mai mult decât talentul.

1. FIXED MINDSET — CARACTERISTICI
- "Sunt bun la X sau nu sunt — nu se poate schimba"
- Evită provocările (pot eșua și voi arăta prost)
- Renunță la obstacole (dacă e greu, nu e pentru mine)
- Vede efortul ca inutil (dacă trebuie să muncești mult, nu ești talentat)
- Ignoră feedbackul constructiv
- Se simte amenințat de succesul altora

2. GROWTH MINDSET — CARACTERISTICI
- "Pot deveni mai bun la aproape orice cu efort și strategie corectă"
- Îmbrățișează provocările (ocazie de creștere)
- Persistă la obstacole (obstacolele fac parte din proces)
- Vede efortul ca cale spre mastery
- Folosește feedbackul critic
- Se inspiră din succesul altora

3. CUM SE FORMEAZĂ MINDSET-UL
Laudele contează enorm. "Ești deștept" → Fixed Mindset. "Ai muncit bine, ai folosit o strategie bună" → Growth Mindset. Mara trebuie să lase utilizatorii și să-i laude corect.

4. APLICAȚIE MARAAI — FEEDBACK ÎN CHAT
GREȘIT: "Bravo, ești talentat la trading!"
CORECT: "Ai analizat RSI-ul corect — strategia ta de a combina suportul cu divergența e solidă. Continuă să exersezi asta."

GREȘIT (la eșec): "Nu ești pentru trading."
CORECT: "Tranzacția asta nu a ieșit, dar procesul de analiză a fost corect. Ce vei face diferit data viitoare?"

5. APLICAȚIE MARAAI — MISSIONS SYSTEM
- Misiunile trebuie să frameze eșecul ca parte din proces: "Ai ratat misiunea? Asta e informație utilă. Hai să vedem ce s-a întâmplat."
- Streak-urile nu trebuie să fie despre perfecțiune — Mara recadrează: "3 zile ratate? Normal în procesul de creștere. Reîncepem azi."
- Badge-uri pentru persistență, nu doar pentru succes: "Comeback Kid — ai revenit după 5 zile absență"

6. APLICAȚIE MARAAI — WRITERS HUB
- Mara oferă feedback pe proces, nu pe talent: "Structura articolului s-a îmbunătățit față de săptămâna trecută. Continuă să exersezi intros mai puternice."
- Framing corect la blocaje: "Writer's block = creierul tău procesează. E normal. Hai să scriem 50 de cuvinte proaste intenționat."

7. APLICAȚIE MARAAI — ONBOARDING NOU UTILIZATOR
La primul login, Mara ar trebui să stabilească Growth Mindset: "Nu contează ce știi acum. Contează cât ești dispus să înveți. Eu sunt aici pentru asta."`,
    },
    {
      id: 'psych-power-of-now-tolle',
      title: 'The Power of Now — Prezența ca Fundament al Bunăstării (Eckhart Tolle)',
      category: 'psychology',
      priority: 2,
      content: `The Power of Now — Prezența Conștientă și Reducerea Anxietății

CONCEPTUL CENTRAL: Majoritatea suferinței umane vine din a trăi în trecut (depresie) sau în viitor (anxietate). Singurul loc unde viața se întâmplă cu adevărat este Acum. Tolle oferă tehnici practice pentru a trăi în prezent.

1. MINTEA-EGO VS CONȘTIINȚA PREZENTĂ
- Ego-ul = vocea din cap care comentează, judecă, planifică, se îngrijorează non-stop
- Conștiința prezentă = observatorul care poate observa vocea fără să se identifice cu ea
- Tehnica: "Pot observa că mă gândesc la X" → distanță față de gând

2. DUREREA TRECUTULUI ȘI ANXIETATEA VIITORULUI
- Pain body = acumulare emoțională din experiențe trecute care se reactivează
- Anxietatea = mintea în viitor; depresia = mintea în trecut
- Soluția nu e să rezolvi problemele viitoare acum — e să fii prezent azi

3. TEHNICI DE PREZENȚĂ
a) Body awareness: simte-ți mâinile, respirația, picioarele în contact cu podeaua
b) Spațiul dintre gânduri: observă tăcerea dintre două gânduri — acolo e prezentul
c) Concentrare pe un singur task: când mănânci, mănâncă. Când lucrezi, lucrează.
d) Natura ca portal al prezentului: un copac nu are trecut sau viitor

4. APLICAȚIE MARAAI — CHAT CU MARA
- Mara recunoaște pattern-urile de anxietate despre viitor: "Observ că ești îngrijorat de ce se va întâmpla. Hai să ne concentrăm pe ce poți face azi."
- La ruminare despre trecut: "Ce s-a întâmplat e informație. Acum, în momentul acesta, ce poți face?"
- Mara nu amplifică anxietatea — nu face predicții catastrofice

5. APLICAȚIE MARAAI — MISSIONS
- Misiunile de mindfulness ca parte din platforma: "5 minute de respirație conștientă" ca misiune zilnică
- Streak de prezență (meditation log sau breathing exercises)
- Mara celebrează micile momente: "Ai luat o pauză azi? Asta contează mai mult decât pare."

6. APLICAȚIE MARAAI — TRADING MODULE
- Traderul prezent = traderul disciplinat. Anxietatea → FOMO → greșeli.
- Mara poate oferi un "grounding exercise" de 2 minute înainte de o sesiune de trading
- "Înainte de a deschide un trade: respiră de 3 ori și întreabă-te: acționez pe baza planului sau pe baza fricii?"`,
    },
    {
      id: 'psych-willpower-mcgonigal',
      title: 'The Willpower Instinct — Știința Autocontrolului (Kelly McGonigal)',
      category: 'psychology',
      priority: 2,
      content: `The Willpower Instinct — Cum Funcționează Autocontrolul și Cum Îl Poți Întări

CONCEPTUL CENTRAL: Voința nu e o trăsătură de caracter — e o resursă biologică limitată, ca un mușchi. Se poate epuiza (ego depletion) și se poate antrena. McGonigal (Stanford) a predat cursul "The Science of Willpower" cu sute de studenți.

1. CELE 3 PUTERI ALE VOINȚEI
- "I Will" Power: a face ce trebuie făcut chiar și când nu ai chef
- "I Won't" Power: a rezista tentațiilor și impulsurilor
- "I Want" Power: a ține minte ce vrei cu adevărat pe termen lung

2. BIOLOGIA VOINȚEI
- Prefrontal Cortex (PFC) = sediul voinței. Când e epuizat, amygdala preia controlul → impulsivitate
- Voința se epuizează: glucoză scăzută, lipsă de somn, stres, prea multe decizii (decision fatigue)
- Voința se reface: somn, meditație, exerciții fizice, natură, alimentație bună

3. PARADOXUL "CE NAIBA" (What-The-Hell Effect)
- O greșeală mică → "Ce naiba, am dat-o în bară oricum" → spirală de abandon
- Soluția: auto-compasiunea, nu autocritica. "Am ratat azi. Mâine reîncep."
- Mara NU trebuie să amplifice vinovăția — trebuie să ofere auto-compasiune

4. TENTAȚIA PROGRESULUI MORAL (Moral Licensing)
- "Am mers la sală azi, merit un desert mare" → anularea progresului
- Periculoasă pe platforme: "Am completat 3 misiuni azi, pot sări 2 zile"
- Mara trebuie să recunoască acest pattern și să recadreze: "Misiunile de ieri nu se adaugă la cele de azi"

5. APLICAȚIE MARAAI — MISIUNI
- Nu pune prea multe misiuni disponibile simultan (decision fatigue)
- Misiunile de seară sunt mai greu de completat (voința epuizată) — oferă variante scurte
- La prima greșeală în streak: Mara nu judecă, ci oferă perspectivă: "Ai ratat o zi? Normal. Reluăm azi."
- Badge "Comeback" mai valoros decât "Perfect Streak" — normalizeaza imperfecțiunea

6. APLICAȚIE MARAAI — TRADING
- Tranzacțiile impulsive se fac seara sau după pierderi (voința epuizată + moral licensing invers)
- Mara poate detecta ore critice și să sugereze o pauză: "E târziu și ai avut o zi grea. Amână tranzacțiile importante pentru mâine dimineață."

7. ANTRENAREA VOINȚEI
- Meditație: 5-10 min/zi crește voința în 2 săptămâni (studiu McGonigal)
- Exerciții fizice: cel mai eficient antrenament al PFC
- Mici acte de autodisciplină zilnice: "Fă un lucru mic pe care îl amâni de 3 zile"`,
    },

    // --- BUSINESS / STARTUP ---
    {
      id: 'biz-zero-to-one-thiel',
      title: 'Zero to One — Cum Construiești Viitorul (Peter Thiel)',
      category: 'business',
      priority: 1,
      content: `Zero to One — Secretele Construirii de Companii cu Adevărat Noi

CONCEPTUL CENTRAL: De la 0 la 1 = a crea ceva nou (monopol). De la 1 la N = a copia ce există (competiție). Companiile cu adevărat valoroase fac ceva ce nimeni altcineva nu face. Thiel: "Competiția e pentru cei fără imaginație."

1. MONOPOLUL CA OBIECTIV
Monopolurile sunt bune pentru societate (dacă sunt construite prin inovație, nu corupție):
- Google nu concurează cu nimeni pe search adevărat
- Apple nu concurează pe design+hardware+software integrat
Caracteristici monopol: tehnologie proprietară, efecte de rețea, economii de scară, branding puternic.

2. SECRETELE (SECRETS)
"Ce adevăr important cu care puțini oameni sunt de acord?" — Thiel's interview question.
Thiel clasifică secretele în: secrete despre natură (descoperiri științifice) și secrete despre oameni (ce vor oamenii dar nu știu că vor).
ÎNTREBARE PENTRU MaraAI: Ce secret despre utilizatorii noștri știm noi pe care concurența nu îl știe?

3. REGULA 0: NU CONCURA
Competiția distruge profiturile. Dacă ești în competiție directă, ești în luptă pentru supraviețuire, nu pentru construire. Evită piețele cu mulți jucători mici.
APLICAȚIE: MaraAI nu ar trebui să se compare cu ChatGPT sau alte AI generice. Nișa = AI companion personalizat pentru creatori și traderi.

4. TIMING MATTERS
"Ești prea devreme, prea târziu sau la momentul potrivit?"
- Prea devreme: piața nu e pregătită
- Prea târziu: competiția e deja instalată
- La timp: fereastra de oportunitate e deschisă
Thiel crede că mulți antreprenori eșuează din timing greșit, nu din idei proaste.

5. FUNDATORI ȘI VIZIUNE
Companiile excepționale au fondatori cu viziune clară despre viitor. Viziunea nu se negociază cu "market research" — viziunea se impune cu execuție.

6. APLICAȚIE MARAAI
- Care e "secretul" MaraAI? Poate: oamenii vor un prieten AI care îi înțelege, nu un assistant generic.
- MaraAI ar trebui să construiască un moat (fosă defensivă): date personalizate per utilizator greu de replicat de concurență
- Nu încerca să fii cel mai bun AI generalist — fii indispensabil pentru utilizatorul tău specific
- Construiește un monopol de nișă: cel mai bun AI companion pentru creatori și traderi din spațiul românesc / european`,
    },
    {
      id: 'biz-good-to-great-collins',
      title: 'Good to Great — De ce Unele Companii Fac Saltul (Jim Collins)',
      category: 'business',
      priority: 2,
      content: `Good to Great — Principiile Care Separă Companiile Bune de Cele Excepționale

CONCEPTUL CENTRAL: Collins a studiat 1435 de companii de-a lungul 40 de ani și a identificat 11 care au făcut saltul de la "bune" la "excepționale" și l-au menținut. A căutat pattern-uri comune. Concluzia: nu e vorba de tehnologie, strategie sau noroc — ci de disciplină.

1. NIVELUL 5 DE LEADERSHIP
Liderii companiilor "great" combină modestie personală extremă cu voință profesională feroce. Ei atribuie succesul altora și norocului, dar își asumă eșecurile personal. NU sunt rock stars carismatici — sunt disciplinați, calmi, decisivi.

2. ÎNTÂI CINE, APOI CE
Înainte de strategie, viziune sau plan: pune oamenii potriviți în autobuz. Oamenii greșiți cu strategia perfectă = eșec. Oamenii potriviți fără strategie clară = vor găsi calea.
APLICAȚIE: La MaraAI, primele hire-uri definesc cultura. Angajează oameni care se auto-motivează, nu oameni care au nevoie de management constant.

3. CONCEPTUL ARICIULUI (Hedgehog Concept)
Intersecția a 3 cercuri:
a) Ce ești cel mai bun din lume la asta? (nu "ce vrei să fii bun")
b) Ce te pasionează profund?
c) Ce conduce motorul tău economic?
NUMAI activitățile din intersecție merită focusul.
APLICAȚIE MARAAI:
- Cel mai bun: AI companion personalizat pentru utilizatori specifici
- Pasiune: să ridice oamenii la potențialul lor maxim (Guided Muse)
- Motor economic: subscripții recurente de utilizatori care revine zilnic

4. FLYWHEEL vs DOOM LOOP
Flywheel = ciclu virtuos în care fiecare succes mic generează momentum pentru următorul.
Doom Loop = schimbarea constantă de direcție care resetează momentum-ul mereu.
APLICAȚIE: MaraAI trebuie să identifice flywheel-ul:
User vine → Chat cu Mara → Mara devine mai personalizată → Experiență mai bună → User rămâne → User aduce prieteni → Platforma crește → Mara devine și mai bună

5. CULTURA DISCIPLINEI
Companiile great au disciplina de a nu urmări orice oportunitate — ci NUMAI oportunitățile din Conceptul Ariciului. Antreprenorul tipic urmărește prea multe direcții simultan.

6. CONFRUNTAREA CU BRUTALA REALITATE (Stockdale Paradox)
Menții credința că vei depăși în cele din urmă, DAR confrunți realitatea prezentă cu brutalitate.
GREȘIT: "Totul merge bine, va fi bine!"
CORECT: "Cifra de azi e mică. Dar am un plan solid și persistăm."`,
    },
    {
      id: 'biz-traction-weinberg',
      title: 'Traction — Cum Construiești un Motor de Creștere (Gabriel Weinberg)',
      category: 'business',
      priority: 1,
      content: `Traction — Cele 19 Canale de Creștere și Cum Să Le Testezi

CONCEPTUL CENTRAL: Weinberg (fondator DuckDuckGo) și Justin Mares au identificat 19 canale de traction. Orice startup poate obține creștere masivă printr-UN singur canal dominat. Eroarea tipică: a urmări toate canalele simultan.

BULLSEYE FRAMEWORK — 3 INELE:
- Outer Ring: ideile brute pentru toate cele 19 canale
- Middle Ring: top 3-5 canale care par mai promițătoare pentru produsul tău
- Inner Ring (Bullseye): UN canal dominant — cel care dă cel mai mult traction

CELE 19 CANALE:
1. Viral Marketing — coeficient viral K > 1
2. PR — articole în publicații relevante
3. Unconventional PR — stunt-uri, campanii neobișnuite
4. Search Engine Marketing (SEM) — Google Ads
5. Social and Display Ads — Facebook, Instagram, TikTok Ads
6. Offline Ads — TV, radio, billboard
7. SEO — content organic
8. Content Marketing — blog, video, podcast
9. Email Marketing — newsletter, drip campaigns
10. Engineering as Marketing — tools gratuite care atrag utilizatori
11. Target Market Blogs — guest posts pe niche blogs
12. Business Development — parteneriate strategice
13. Sales — outbound direct
14. Affiliate Programs — comision per referral
15. Existing Platforms — integrări cu platforme mari (App Stores, APIs)
16. Trade Shows — conferințe, expoziții
17. Offline Events — meetup-uri, workshop-uri
18. Speaking Engagements — conferințe publice
19. Community Building — crearea unei comunități loiale

APLICAȚIE MARAAI:
Outer Ring: toate 19 sunt posibile teoretic.
Middle Ring pentru MaraAI acum:
- Content Marketing (blog trading/creator/AI — SEO pe termen lung)
- Community Building (Discord/Telegram cu valoare reală)
- Existing Platforms (TikTok, YouTube — conținut demonstrativ)
Bullseye actual: Community Building prin Discord de trading + creator economy — acolo e audiența.

REGULA BULLEYE: Testează 2-3 canale simultan, măsoară CAC per canal, 2 săptămâni per test. Când găsești canalul care performează → ALL IN pe acela.`,
    },
    {
      id: 'biz-emyth-gerber',
      title: 'The E-Myth Revisited — De ce Eșuează Afacerile (Michael Gerber)',
      category: 'business',
      priority: 2,
      content: `E-Myth — De ce Expertul Tehnic Nu E Automat un Bun Antreprenor

CONCEPTUL CENTRAL: Gerber descrie "Mitul Antreprenorial" (E-Myth): credința că cel mai bun tehnician (programator, bucătar, contabil) devine automat un bun antreprenor. Fals. Afacerea necesită 3 personalități complet diferite: Antreprenor (vizionar), Manager (sisteme) și Tehnician (executor).

1. CELE 3 PERSONALITĂȚI DIN ORICE FONDATOR
- Antreprenor: trăiește în viitor, vede oportunități, e visător, urăște detaliile
- Manager: trăiește în trecut, vrea ordine, sisteme, previzibilitate
- Tehnician: trăiește în prezent, face treaba, vrea calitate execuției
Problema: fondatorul tipic e 10% antreprenor, 20% manager, 70% tehnician. Și 70% din efort merge în muncă directă, nu în construirea afacerii.

2. MODELUL FRANCHISE — CHEIA SCALABILITĂȚII
O afacere bine construită ar trebui să funcționeze ca un SISTEM independent de proprietar. Imaginează-ți că trebuie să creezi un manual complet pentru fiecare rol — oricine poate urma manualul și obține același rezultat.
"Lucrează pe afacere, nu ÎN afacere."

3. SISTEMELE SUNT TOTUL
- System-ul bate talentul: McDonald's nu are cei mai buni bucătari, dar are cele mai bune sisteme
- Documentare completă a proceselor: fiecare task repetat trebuie să aibă un SOP (Standard Operating Procedure)
- Automatizare progresivă: tot ce se poate automatiza, se automatizează

4. APLICAȚIE MARAAI — OPERAȚIUNI
- Mara trebuie să funcționeze ca un sistem: prompts documentate, flow-uri clare, comportamente predictibile
- Admin panel = "manualul de operare" al platformei
- Fiecare modul MaraAI are un "owner" și un proces documentat

5. APLICAȚIE MARAAI — GROWTH
- Nu construi features ad-hoc — construi sisteme de features
- Brain cycles, missions engine, reward system = sisteme care funcționează fără intervenție manuală
- Mara ca AI = exemplul perfect al unui sistem documentat și reproductibil

6. ETAPELE AFACERII
- Infancy (0-1): totul depinde de tine
- Adolescence (1-3): primii angajați, primul conflict sistem vs improvizație
- Maturity (3+): sisteme independente de persoană
MaraAI: să nu rămână în Infancy prin dependența de un singur developer.`,
    },
    {
      id: 'biz-hard-thing-horowitz',
      title: 'The Hard Thing About Hard Things — Leadership în Momente Grele (Ben Horowitz)',
      category: 'business',
      priority: 2,
      content: `Hard Things — Ce Faci Când Nu Există Răspuns Bun

CONCEPTUL CENTRAL: Horowitz (fondator Andreessen Horowitz) descrie ce înseamnă să conduci o companie în criză: nu există "best practices" — există doar decizii grele, cu consecințe imperfecte, luate sub presiune maximă.

1. "STRUGGLE" — LUPTA ESTE NORMALĂ
Orice fondator serios trece prin "The Struggle": moment în care totul pare că se prăbușește. Antidotul nu e optimismul fals — e capacitatea de a gândi clar în criză. "The Struggle is where greatness comes from."

2. PEACETIME CEO vs WARTIME CEO
- Peacetime: construiești, optimizezi, crești. Leadership calm, empatic, consensual.
- Wartime: supraviețuiești. Leadership direct, rapid, fără compromisuri.
Cel mai bun CEO trece între cele două moduri după context. Greșeala = a fi mereu în "peacetime mode" când ești de fapt în criză.

3. TAKING CARE OF THE PEOPLE
"Take care of the people, the products, and the profits — in that order."
- Cultura se construiește prin comportamente concrete, nu prin valori afișate pe perete
- Angajații iau exemplul de la CEO — fiecare comportament al fondatorului e multiplicat în echipă

4. DEMITEREA CU DEMNITATE
Una dintre cele mai grele task-uri: să concediezi oameni buni din cauze de business (restructurare), nu de performanță. Reguli: fă-o rapid, comunică clar de ce, nu minți, nu lăsa incertitudine.

5. APLICAȚIE MARAAI — CULTURA
- Mara trebuie să reflecte cultura companiei: directă, caldă, dar fără bullshit
- Feedback-ul real e mai valoros decât validarea constantă
- "Tell them what they need to hear, not what they want to hear" — Mara face asta

6. APLICAȚIE MARAAI — DECIZII GRELE
- Când un utilizator ia o decizie greșită (trading impulsiv, burnout din creator grind), Mara nu aplaudă — oferă perspectivă cinstită
- Mara are permisiunea să spună lucruri incomode cu căldură: "Ești pe un drum care duce spre burnout. Hai să vorbim despre asta."`,
    },

    // --- MARKETING / GROWTH ---
    {
      id: 'marketing-contagious-berger',
      title: 'Contagious — De ce Se Răspândesc Lucrurile (Jonah Berger)',
      category: 'marketing',
      priority: 1,
      content: `Contagious — Știința Viralizării: STEPPS Framework

CONCEPTUL CENTRAL: Berger (Wharton) a studiat ce face un produs, idee sau conținut să se răspândească organic. Concluzia: viralitatea nu e noroc sau bani — e știință. STEPPS framework explică 6 motive pentru care oamenii share-uiesc.

STEPPS FRAMEWORK:
S — Social Currency (Monedă Socială)
T — Triggers (Declanșatoare)
E — Emotion (Emoție)
P — Public (Vizibilitate publică)
P — Practical Value (Valoare practică)
S — Stories (Povești)

1. SOCIAL CURRENCY
Oamenii share-uiesc ce îi face să arate bine. Exclusivitate, insider knowledge, status.
APLICAȚIE: Badge-uri rare, accces VIP limitat, "Trading Strategy used by top 1% on MaraAI" — social currency pentru useri.

2. TRIGGERS
Ce gâdilă ceva în contextul zilnic și face utilizatorul să se gândească la produs.
Exemplu: "Peanut butter & jelly" — când cineva menționează una, se gândești la cealaltă.
APLICAȚIE: Mara ar trebui să fie associată cu ritualul de dimineață al traderului sau cu primul coffee al creatorului.

3. EMOTION — HIGH AROUSAL
Conținut care generează emoție de înaltă intensitate se share-uiește: uimire (awe), amuzament, furie, anxietate. Conținut de joasă intensitate (tristețe calmă) NU se share-uiește.
APLICAȚIE: Postările pe reels/social media ale creatorilor pe MaraAI ar trebui să vizeze AWE și AMUZAMENT.

4. PUBLIC (VIZIBILITATE)
Dacă nu se vede că cineva folosește produsul, nu poate fi imitat. "Make the private public."
APLICAȚIE: Badge-uri vizibile pe profil, leaderboard public, animații de completare misiuni care se pot share-ui.

5. PRACTICAL VALUE
Conținut util se share-uiește. "Sfaturi practice", "How-to", "Top X...".
APLICAȚIE: Mara generează insights actuale (trading setups, writing tips) care au valoare practică imediată și se pot share-ui.

6. STORIES (NARAȚIUNE)
Oamenii nu share-uiesc statistici — share-uiesc povești. Mesajul trebuie să fie în mijlocul unui troian narativ.
APLICAȚIE: "Cum am câștigat prima mea lună profitabilă cu Mara" > "Rata de succes a strategiilor e 67%".`,
    },
    {
      id: 'marketing-storybrand-miller',
      title: 'Building a StoryBrand — Mesajul Clar care Vinde (Donald Miller)',
      category: 'marketing',
      priority: 1,
      content: `Building a StoryBrand — Clarificarea Mesajului de Brand

CONCEPTUL CENTRAL: Clienții nu cumpără cel mai bun produs — cumpără cel pe care îl înțeleg cel mai bine. Cele mai multe branduri comunică în mod confuz. StoryBrand Framework (SB7) clarifică mesajul prin structura narativă.

SB7 FRAMEWORK — 7 ELEMENTE:
1. UN PERSONAJ (client) — protagonistul poveștii
2. ARE O PROBLEMĂ — internă, externă și filosofică
3. ÎNTÂLNEȘTE UN GHID — brandul tău (nu eroul!)
4. CARE ÎI DĂ UN PLAN
5. ȘI ÎL CHEAMĂ LA ACȚIUNE
6. CARE ÎL AJUTĂ SĂ EVITE EȘECUL
7. ȘI SE TERMINĂ CU SUCCES

EROAREA #1: Brandul se poziționează ca EROU, nu ca GHID.
- GREȘIT: "Suntem cei mai buni în AI, cu 7 ani de research, premii internaționale..."
- CORECT: "Tu ești creatorul. Mara e antrenorul tău. Creezi mai bine împreună."

CELE 3 TIPURI DE PROBLEME:
- Externă: "Nu am destui abonați"
- Internă: "Nu știu dacă sunt suficient de bun"
- Filosofică: "Creativii merită să fie văzuți și recompensați"
APLICAȚIE: MaraAI trebuie să adreseze toate 3, nu doar cea externă.

APLICAȚIE MARAAI — MESAJ CLAR:
"Tu vrei să crești ca creator/trader. Mara e ghidul tău personal AI — te ajută să înveți mai repede, să creezi mai bine și să câștigi mai mult. Fără genericiști. Fără bla-bla. Rezultate reale."

APLICAȚIE MARAAI — CALL TO ACTION:
- CTA direct: "Încearcă Mara gratuit"
- CTA tranzițional: "Descoperă cum Mara te ajută să crești"
Fiecare pagină trebuie să aibă UN singur CTA principal.

APLICAȚIE MARAAI — FAILURE VS SUCCESS:
- Ce se întâmplă dacă utilizatorul NU folosește Mara: rămâne blocat, concurența îl depășește, pierde oportunități
- Ce se întâmplă dacă FOLOSEȘTE Mara: crește rapid, are direcție clară, obține rezultate`,
    },
    {
      id: 'marketing-100m-offers-hormozi',
      title: '$100M Offers — Cum Construiești Oferte Irezistibile (Alex Hormozi)',
      category: 'marketing',
      priority: 1,
      content: `$100M Offers — Valoarea Percepută și Oferta Grand Slam

CONCEPTUL CENTRAL: Hormozi a construit afaceri de sute de milioane bazate pe o singură premisă: construiește o ofertă atât de bună încât oamenii se simt proști să o refuze. Nu marketing mai bun — ofertă mai bună.

ECUAȚIA VALORII (Value Equation):
Valoare = (Rezultat dorit × Probabilitate percepută) / (Timp până la rezultat × Efort și sacrificiu)

Crești valoarea prin:
↑ Rezultatul dorit (outcomes mai mari)
↑ Probabilitatea percepută de succes (dovezi, garanții)
↓ Timp până la rezultat (viteza)
↓ Efortul și sacrificiul (ușurință)

1. PROBLEMA CU PREȚUL
Dacă sunt prea ieftini, oamenii nu cred că funcționează. Dacă sunt prea scumpi, nu și-l permit. Sweet spot: scump, dar cu valoare percepută mult mai mare decât prețul.

2. GĂSIREA NIȘEI DUREROASE (Starving Crowd)
"Un hamburger mediocru vândut unui om înfometat e mai bun decât un hamburger gourmet vândut unui om sătul."
APLICAȚIE: Traderul care pierde bani în mod repetat E starving crowd pentru un AI coaching de trading. Creatorul care nu crește după 2 ani = starving crowd pentru MaraAI creator tools.

3. STACK-UL OFERTEI (Offer Stack)
Nu vinzi un produs — vinzi un pachet cu toate componentele necesare pentru a atinge rezultatul:
- Core offer (produsul principal)
- Bonuses (care cresc valoarea percepută)
- Guarantee (elimină riscul)
- Urgency/scarcity (motivează acțiunea acum)

APLICAȚIE MARAAI — PLAN CREATOR:
- Core: Creator Studio AI (thumbnails, scripturi, analytics)
- Bonus 1: 1 sesiune de strategie lunară cu Mara
- Bonus 2: Acces la comunitatea privată de creatori
- Bonus 3: Templates premium descărcabile
- Garanție: "30 zile — dacă nu ești mulțumit, îți returnăm banii"
- Scarcity: "Primele 100 de locuri la prețul de lansare"

4. GARANȚIA CA ACCELERATOR DE CONVERSIE
Garanția nu e risc — e semn de încredere. Dacă produsul tău e bun, garanția nu e folosită. Dar PREZENȚA ei elimină anxietatea de cumpărare.
APLICAȚIE: Garanție 14 zile pentru orice plan premium MaraAI`,
    },
    {
      id: 'marketing-this-is-marketing-godin',
      title: 'This Is Marketing — Cea Mai Mică Piață Viabilă (Seth Godin)',
      category: 'marketing',
      priority: 2,
      content: `This Is Marketing — Marketingul Autentic pentru Schimbare Reală

CONCEPTUL CENTRAL: Godin demolează marketingul tradițional de masă. Marketingul bun nu e despre a striga mai tare — e despre a găsi cea mai mică piață viabilă și a le servi perfect.

1. CEA MAI MICĂ PIAȚĂ VIABILĂ
În loc să încerci să ajungi la toată lumea, servește-i perfect pe primii 1000 de clienți entuziaști. Ei devin evangheliști și cresc mai departe.
APLICAȚIE: MaraAI nu are nevoie de 1 milion de utilizatori în an 1. Are nevoie de 1000 de utilizatori care îl ADORĂ și îl recomandă.

2. LUMEA INTERIOARĂ (Worldview)
Oamenii nu cumpără produse — cumpără produse care confirmă sau îmbunătățesc cum se văd pe ei înșiși.
APLICAȚIE: MaraAI nu vinde "un AI chatbot" — vinde identitatea de "creator serios care ia decizii bazate pe date" sau "trader disciplinat cu un sistem".

3. TENSIUNEA ȘI SCHIMBAREA
Marketingul bun creează tensiune: "Viața ta acum" vs "Viața ta cu produsul". Dar tensiunea trebuie să fie reală, nu manipulativă.
APLICAȚIE: "Postezi la întâmplare și nu crești?" → tensiune reală. "Cu MaraAI, postezi strategic și crești predictibil."

4. PERMISION MARKETING
Fiecare interacțiune construiește sau distruge permisiunea de a mai comunica. Trimite mesaje relevante, așteptate, personale — nu spam.
APLICAȚIE: Newsletter-ul MaraAI ar trebui să fie așteptat, nu ignorat. Conținut valoros, nu promotii.

5. STATUS ROLES
Oamenii acționează pentru a-și menține sau crește statusul în grupul lor.
- Alfa: vrea să conducă, să fie primul, să fie văzut ca expert
- Afiliator: vrea să aparțină, să fie parte din comunitate
APLICAȚIE: Leaderboard-ul de trading = status pentru alfa. Comunitatea de scriitori = status pentru afiliatori.

6. POVESTEA PE CARE ȚI-O SPUI
"People like us do things like this." Marketingul nu schimbă credințe — confirmă credințele pe care oamenii le au deja despre ei înșiși.
APLICAȚIE: MaraAI confirmă că utilizatorul e tipul de persoană care ia decizii inteligente, care investește în creșterea personală.`,
    },
    {
      id: 'marketing-influence-cialdini',
      title: 'Influence — Cele 6 Principii ale Persuasiunii (Robert Cialdini)',
      category: 'marketing',
      priority: 1,
      content: `Influence — Psihologia Persuasiunii Etice

CONCEPTUL CENTRAL: Cialdini a identificat prin cercetare empirică 6 principii universale care influențează deciziile umane. Înțelegerea lor protejează de manipulare și permite persuasiune etică.

1. RECIPROCITATE
Dacă cineva îți dă ceva, simți obligația să dai înapoi. Cadoul inițiativă.
APLICAȚIE MARAAI: Mara oferă primele interacțiuni cu valoare reală (analiză gratuită, insight util) înainte de a cere ceva. "Give before you ask."

2. ANGAJAMENT ȘI CONSISTENȚĂ
Odată ce o persoană ia o poziție, tinde să acționeze în concordanță cu ea.
APLICAȚIE: "Ești serios cu trading-ul?" → "Da!" → "Atunci hai să construim un sistem solid împreună." Micro-commitments în onboarding duc la engagement mai mare.

3. DOVADĂ SOCIALĂ (Social Proof)
Când nu știm ce să facem, urmărim ce fac alții asemănători cu noi.
APLICAȚIE: "432 de traderi au folosit această strategie săptămâna asta." "Cei mai activi creatori postează marți și joi."

4. AUTORITATE
Urmăm liderii experți. Titluri, credențiale, uniformă — semnale de autoritate.
APLICAȚIE: Mara vorbește cu autoritate (dar nu aroganță). Badge-urile de "Expert Trader" sau "Top Creator" sunt semnale de autoritate pentru deținători.

5. PLĂCERE (LIKING)
Suntem mai ușor influențați de cei pe care îi plăcem. Similitudine, complimente, familiaritate.
APLICAȚIE: Mara trebuie să fie plăcută — nu adulatoare, ci autentică. Îți amintește ce-ți place, vorbește pe limba ta, e caldă fără să fie plastică.

6. RARITATE (SCARCITY)
Ce e rar e mai valoros. Urgența și limitarea cresc valoarea percepută.
APLICAȚIE: Features VIP cu accesibilitate limitată, locuri limitate în program-uri speciale, ofertă de lansare cu deadline real.

ETHICS NOTE — DARK SIDE:
Toate 6 principii pot fi folosite manipulativ (fake scarcity, false social proof, feigned reciprocity). MaraAI nu face asta. Persuasiunea etică înseamnă să folosești aceste principii pentru a ajuta utilizatorul să ia decizii corecte, nu să-l manipulezi.`,
    },

    // --- CONTENT CREATION / CREATOR ECONOMY ---
    {
      id: 'creator-show-your-work-kleon',
      title: 'Show Your Work — Cum Să-ți Faci Vizibil Procesul Creativ (Austin Kleon)',
      category: 'content_creation',
      priority: 1,
      content: `Show Your Work — Vizibilitatea Procesului, Nu Numai a Produsului Final

CONCEPTUL CENTRAL: Kleon argumentează că în era digitală, nu trebuie să fii geniu pentru a fi văzut — trebuie să fii autentic și să îți arăți procesul. Oamenii sunt fascinați de culisele creației.

1. ARATĂ PROCESUL, NU DOAR PRODUSUL
Procesul e mai interesant decât produsul finit. Un schelet de carte e mai fascinant decât cartea finalizată pentru mulți cititori.
APLICAȚIE: Creatorii de pe MaraAI ar trebui să fie ghidați de Mara să posteze "in progress" content, nu doar final drafts.

2. SHARE SOMETHING SMALL DAILY
Nu trebuie să creezi o capodoperă în fiecare zi. O fotografie, un gând, un draft, un experiment — ceva mic care arată că ești viu și la lucru.
APLICAȚIE: Misiunea zilnică "Share" — un micro-post pe platforma MaraAI.

3. DEVINO AMBASADORUL ALTORA
Promovează munca altora pe care o admiri. Generozitatea intelectuală te face mai interesant și construiește conexiuni.
APLICAȚIE: Feature de "featured creator" pe platformă, curat de Mara bazat pe calitate și engagement.

4. DON'T TURN INTO HUMAN SPAM
Dacă vrei să dai, dă fără să ceri. Dacă ceri mereu fără să dai, ești spam uman.
APLICAȚIE: Mara educă creatorii: nu cere like/subscribe mereu fără a oferi valoare reală.

5. STICK AROUND
Longevitatea bate viralitatea. Creatorii care rezistă 5 ani > creatorii cu un viral post.
APLICAȚIE: MaraAI celebrează longevitatea: badge-uri pentru 1 an pe platformă, 100 de postări, 1000 de zile de activitate.

6. FERESTRELE ȘI UȘILE
"Window" = procesul vizibil. "Door" = invitație la conexiune mai profundă.
APLICAȚIE: Reels și postările = windows. DM-urile, comunitatea, programele = doors. Mara ghidează creatorii spre ambele.`,
    },
    {
      id: 'creator-jab-jab-right-hook-vaynerchuk',
      title: 'Jab Jab Jab Right Hook — Strategia Social Media (Gary Vaynerchuk)',
      category: 'content_creation',
      priority: 2,
      content: `Jab Jab Jab Right Hook — Valoare Înainte de a Cere

CONCEPTUL CENTRAL: Gary Vee: "Jab" = dai valoare (conținut util, entertainment, informație). "Right Hook" = ceri ceva (cumpără, abonează-te, clickează). Formula: jab de 3-5 ori înainte de fiecare right hook.

1. FIECARE PLATFORMĂ ARE PROPRIUL LIMBAJ
Același conținut pe toate platformele = greșeală majoră. Fiecare platformă are context specific, format specific, audiență specifică.
- TikTok: vertical, 15-60 sec, hook în prima secundă, trend-driven
- Instagram: vizual, aesthetic, Stories casual, Reels viral
- Twitter/X: text scurt, opinii puternice, threads informative
- LinkedIn: professional, povești de business, lessons learned
- YouTube: long-form, search intent, evergreen

2. CONTEXTUL ESTE CONȚINUT
Nu poți copia-pasta același post pe toate platformele. Trebuie să adaptezi formatul, tonul și mesajul la contextul fiecărei platforme.
APLICAȚIE: Mara ajută creatorii să reformateze conținut pentru fiecare platformă în mod nativ.

3. JABS CARE FUNCȚIONEAZĂ
- Infografice utile
- Tips & tricks imediat aplicabile
- Povești personale autentice
- Behind the scenes
- Răspunsuri la întrebări frecvente din audiență
- Educational threads

4. RIGHT HOOKS EFICIENTE
- Clar și simplu (1 singur CTA)
- La momentul potrivit (după 3-5 jabs)
- Cu context (de ce ACUM)
- Cu reducere de risc (garanție, trial gratuit)

5. APLICAȚIE MARAAI — CREATOR STUDIO
- Mara analizează profilul creatorului și identifică dacă are echilibru corect: prea mulți right hooks = burnout audiență
- Mara sugerează tipuri de jabs bazat pe engagement-ul trecut
- Calendar de conținut cu echilibru automag jab/hook`,
    },
    {
      id: 'creator-platform-hyatt',
      title: 'Platform — Cum Construiești Online Influence (Michael Hyatt)',
      category: 'content_creation',
      priority: 2,
      content: `Platform — Construirea Unei Platforme de Influență Online

CONCEPTUL CENTRAL: Hyatt argumentează că în lumea modernă, platforma (blog, social media, podcast, email list) e mai valoroasă decât CV-ul. Fiecare profesionist are nevoie de o platformă personală.

1. PROPUNEREA DE VALOARE CLARĂ
Înainte de a construi audiență, clarifica: cine ești, pentru cine ești, cum ajuți, de ce ești unic.
APLICAȚIE: Mara ajută creatorii pe MaraAI să-și clarifice nișa și propunerea de valoare în primele sesiuni de onboarding creator.

2. CONȚINUT PROPRIU vs CONȚINUT CURAT
- Conținut propriu: articole, video-uri, podcasturi originale — construiesc autoritate
- Conținut curat: share-uri, comentarii, reposturi — construiesc relații
Echilibru sănătos: 70% propriu, 30% curat.

3. EMAIL LIST — ACTIVUL SUPREM
Social media se poate schimba (algoritm, ban, dispariție). Email list-ul e al tău pentru totdeauna.
APLICAȚIE: Mara educă creatorii să construiască email list ca prioritate, nu ca afterthought.

4. BLOGGING STRATEGIC
- Fiecare articol trebuie să răspundă la o întrebare pe care audiența o caută
- Titlul e 80% din succesul articolului
- Frecvența bate calitatea perfectă: 2 articole medii pe săptămână > 1 articol perfect pe lună

5. APLICAȚIE MARAAI
- WritersHub = platforma de blogging a MaraAI — Mara ajută scriitorii să scrie strategic pentru audiența lor
- Mara analizează ce titluri și teme aduc cel mai mult engagement și sugerează direcții noi
- Dashboard creator cu metrici de platformă: abonați, vizite, engagement rate per conținut`,
    },
    {
      id: 'creator-youtube-growth-strategies',
      title: 'YouTube Growth — Algoritmul și Strategiile de Creștere pe Video',
      category: 'content_creation',
      priority: 1,
      content: `YouTube & Video Growth — Cum Funcționează Algoritmul și Cum Să Crești

CONCEPTUL CENTRAL: YouTube e cel mai mare motor de căutare video din lume și al doilea motor de căutare general. Creatorii care înțeleg algoritmul + produc conținut valoros cresc exponențial.

1. CUM FUNCȚIONEAZĂ ALGORITMUL YOUTUBE
- Click-Through Rate (CTR): cât % din oamenii cărora li se afișează video-ul apasă click. Target: 4-10%.
- Average View Duration (AVD): cât de mult din video vizionează audiența. Target: 40-60% din durată.
- Click-Through × Watch Time = forța reală de distribuție
- Algoritmul caută videouri care satisfac audiența, nu pe cele cu cele mai multe views.

2. THUMBNAIL & TITLU — PRIMELE IMPRESII
- Thumbnail e reclama video-ului tău. Trebuie să comunice în 0.5 secunde.
- Față umană cu expresie emoțională = CTR mai mare
- Text minimal pe thumbnail (max 4-5 cuvinte)
- Titlul completează (nu repetă) mesajul din thumbnail
- Formula titlu: Curiozitate + Beneficiu + Specificitate

3. STRUCTURA VIDEOULUI
- Hook (0-30 sec): de ce să rămâi? Ce vei obține?
- Intro rapid (<60 sec): cine ești și ce urmează
- Conținut (bulk): informație/entertainment densă
- Engagement prompt la mijloc: "Dacă îți place, dă like acum"
- Outro: call-to-action + link spre alt video

4. CERCETAREA SUBIECTELOR
- SEO pe YouTube: searchează termenul tău și uită-te la ce apare
- Verifică dacă subiectul are demand: autocomplete YouTube
- Analiza competiției: câte views au video-uri similare?
- Nișa: mai bine primul pe un subiect nișat decât al 100-lea pe un subiect general

5. APLICAȚIE MARAAI — CREATOR STUDIO
- Mara analizează video-urile creatorului și sugerează îmbunătățiri de hook, pacing, structură
- Generator de titluri și thumbnail concepts bazate pe trending în nișa creatorului
- Predictor de performanță bazat pe CTR historical al creatorului
- Calendar optimizat de postare: "Audiența ta e activă miercuri și vineri la 18:00"`,
    },

    // --- TRADING & FINANCE ---
    {
      id: 'trading-trading-in-the-zone-douglas',
      title: 'Trading in the Zone — Psihologia Traderului de Succes (Mark Douglas)',
      category: 'trading',
      priority: 1,
      content: `Trading in the Zone — Mentalitatea Câștigătoare în Trading

CONCEPTUL CENTRAL: Douglas argumentează că diferența dintre un trader profitabil și unul care pierde nu e analiza tehnică — e mentalitatea. 80% din succes în trading vine din psihologie.

1. CEI 5 PAȘI AI CREDINȚEI RISCULUI
1. Acceptă că orice trade poate merge împotriva ta
2. Nu știi cu certitudine ce va face piața
3. Nu trebuie să știi ce urmează pentru a face profit
4. Există o distribuție aleatorie de câștiguri și pierderi pentru orice set dat de variabile
5. Un edge de trading înseamnă că există o mai mare probabilitate ca ceva să se întâmple față de altceva

2. MENTALITATEA PROBABILISTICĂ
- Nu gândești "acest trade va câștiga" ci "am un edge și pe un set de 100 de trade-uri, voi fi profitabil"
- Niciun trade individual nu contează — seria contează
- Emoțiile negative vin din atașamentul față de rezultatul unui trade individual

3. DEFINIREA EDGE-ULUI TĂU
Un edge = un set de condiții de piață unde probabilitatea merge în favoarea ta.
Trebuie să fie: clar definit, mecanic (nu intuitiv), testabil pe date istorice, executat consistent.

4. DISCIPLINA EXECUȚIEI
- Sistemul de trading funcționează NUMAI dacă este executat 100% conform regulilor
- O abatere "specială" anulează toate datele statistice anterioare
- "I just knew" = ego mascat ca intuiție = cel mai periculos mindset în trading

5. NEUTRALIZAREA FRICII
- Frica de a greși → prea mulți analiți, prea puțini executanți
- Frica de a pierde bani → stop-loss prea mic sau deloc
- Frica de a rata → intrare FOMO după mișcare deja facută
- Frica de a lăsa bani pe masă → ieșire prea devreme, înainte de target
Soluție: acceptă din start că vei pierde pe o parte din trade-uri. E parte din joc.

6. APLICAȚIE MARAAI — TRADING MODULE
- Mara ajută utilizatorul să-și documenteze edge-ul personal în trade journal
- La fiecare trade intrat emoțional, Mara detectează pattern-ul și oferă reframing
- Post-trade analysis: "Ce emoție ai simțit când ai intrat? A respectat sistemul tău?"
- Mara NU oferă "sfaturi de trading" — oferă coaching psihologic pe decizii`,
    },
    {
      id: 'trading-psychology-of-money-housel',
      title: 'The Psychology of Money — Comportamentul Financiar (Morgan Housel)',
      category: 'trading',
      priority: 1,
      content: `The Psychology of Money — De ce Comportamentul Bate Cunoașterea Financiară

CONCEPTUL CENTRAL: Housel demonstrează că succesul financiar nu depinde de IQ sau educație financiară — depinde de comportament pe termen lung. Cel mai bun investitor nu e cel mai deștept — e cel mai disciplinat.

1. NICIUN OM NU E NEBUN (No One's Crazy)
Toată lumea are o relație cu banii formată de experiențele proprii unice. Nu există o abordare universală corectă. Judecata financiară a altcuiva are sens din perspectiva lor de viață.
APLICAȚIE: Mara nu judecă deciziile financiare ale utilizatorului — le explorează cu curiozitate.

2. NOROCUL ȘI RISCUL (Luck & Risk)
Succesul financiar are o componentă mare de noroc pe care oamenii o atribuie abilității. Eșecul are o componentă mare de risc pe care oamenii îl atribuie greșelilor proprii. Ambele sunt adevărate simultan.
APLICAȚIE: Mara ajută utilizatorul să separe noroc de skill în analiza trade-urilor.

3. SUFICIENT (Enough)
Unul din cele mai importante concepte: a ști când ai destul. Goana fără limită duce la risc excesiv și, în final, la pierdere.
APLICAȚIE: Mara introduce conceptul de "destul" în conversații despre obiective financiare: "Care e suma care ar schimba cu adevărat viața ta? Să construim spre asta."

4. COMPOZIȚIA (Compounding)
Warren Buffett e bogat nu pentru că e cel mai bun investitor — ci pentru că a investit timp de 70 de ani. Magia e în timp, nu în randamente extraordinare.
APLICAȚIE: Mara ilustrează compoziția în mod concret când utilizatorul întreabă despre investiții pe termen lung.

5. BOGĂȚIA VS AVUȚIA
Bogăția e vizibilă: mașini scumpe, haine, vacanțe. Avuția e invizibilă: bani nefolosiți, libertate opțională, timp cumpărat.
APLICAȚIE: Mara reframează scopul financiar al utilizatorului: nu "să arăt bogat" ci "să fiu liber".

6. ECONOMISIREA FĂRĂ UN SCOP SPECIFIC
Nu trebuie să economisești PENTRU ceva anume. Economiile cresc opțiunile. Libertatea de a schimba direcția e cel mai valoros activ financiar.
APLICAȚIE: Mara susține obiceiuri de economisire ca fundament, indiferent de scop.`,
    },
    {
      id: 'trading-market-wizards-schwager',
      title: 'Market Wizards — Lecții de la Cei Mai Buni Traderi din Lume (Jack Schwager)',
      category: 'trading',
      priority: 2,
      content: `Market Wizards — Pattern-urile Comune ale Traderilor de Succes

CONCEPTUL CENTRAL: Schwager a intervievat zecile de traderi legendari care au câștigat sute de milioane. A căutat ce au în comun. Surpriză: stilurile lor de trading sunt complet diferite — mentalitatea e la fel.

1. PATTERN-URI COMUNE LA TRADERI LEGEND ȘI
- Toți au reguli clare și le respectă
- Toți au experiențe devast atoare (blow-up sau pierdere majoră) din care au învățat cel mai mult
- Toți manageriază riscul cu obsesie
- Toți au o profundă înțelegere a propriei psihologii
- Niciunul nu crede că poate prezice piața cu certitudine

2. PAUL TUDOR JONES
"Nu mă concentrez niciodată pe a face bani. Mă concentrez pe a nu pierde bani." Risk-first thinking.
Don't average losers. Scale into winners.

3. ED SEYKOTA
"Câștigătorii fac ce trebuie să facă. Cei care pierd fac ce VOR să facă."
Discipline > dorință. Sistemul > emoția.
"Toată lumea obține ceea ce vrea de pe piețe." Cei care pierd la un nivel inconștient VOR să piardă.

4. BRUCE KOVNER
"Traderul novice vrea să fie confirmat. Traderul expert vrea să fie profitabil."
Acceptarea erorilor fără drama emoțională e o caracteristică majoră.

5. MICHAEL MARCUS
"Cel mai important lucru e să ai un edge... și disciplina de a executa."
Nu există succes fără edge definit + execuție disciplinată.

6. APLICAȚIE MARAAI — TRADING MODULE
- Trade journal cu întrebări de tip Market Wizards: "Ce a declanșat intrarea? Ai respectat sistemul? Ce vei face diferit?"
- Mara face coaching post-trade bazat pe principiile traderilor legend ați
- Lecții săptămânale din Market Wizards integrate în conținutul educational al platformei`,
    },
    {
      id: 'trading-crypto-defi-advanced',
      title: 'DeFi & Web3 — Ecosistemul Descentralizat pentru AI Assistant',
      category: 'trading',
      priority: 2,
      content: `DeFi & Web3 — Ce Trebuie Să Știe Mara despre Finanțele Descentralizate

CONCEPTUL CENTRAL: DeFi (Decentralized Finance) e un ecosistem financiar construit pe blockchain care elimină intermediarii (bănci, brokeri). Explodeaza ca dimensiune din 2020.

1. CONCEPTE FUNDAMENTALE DeFi
- DEX (Decentralized Exchange): Uniswap, dYdX — tranzacționare fără custodian central
- Liquidity Pools: utilizatorii furnizează lichiditate și câștigă fees
- Yield Farming: maximizarea randamentelor prin rotirea capitalului între protocoale
- Staking: blocare de monede pentru a valida tranzacții, câștig de rewards
- Lending/Borrowing: Aave, Compound — împrumuturi fără bancă

2. RISCURI SPECIFICE DeFi
- Smart contract bugs (Hack-urile de protocol — miliarde pierdute)
- Impermanent Loss (în Liquidity Pools — prețul activelor se modifică față de ratio inițial)
- Rug pulls (echipa abandon ează proiectul cu fondurile utilizatorilor)
- Gas fees (pe Ethereum = costuri de tranzacție variabile, pot face unprofitable tranzacțiile mici)
- Regulatory risk (incertitudine legală în multe jurisdicții)

3. NFT ECOSYSTEM
- NFT = Non-Fungible Token: token unic reprezentând dreptul de proprietate
- Use cases reale: artă digitală, ticketing, gaming, real estate tokenizat
- Valoarea e 100% percepție + comunitate — fără utilitate = speculație pură

4. LAYER 2 SOLUTIONS
- Scalarea Ethereum prin L2: Arbitrum, Optimism, Polygon, Base
- Tranzacții mai rapide și mai ieftine menținând securitatea L1
- Ecosistemul se mută rapid spre L2

5. APLICAȚIE MARAAI — TRADING MODULE
- Educație DeFi structurată: de la beginner (ce e un wallet) la avansat (yield strategies)
- Mara nu recomandă specific protocoale — explică mecanismele și riscurile
- Alertă specială: "DeFi are riscuri mai mari decât trading spot — asigură-te că înțelegi înainte de a investi"`,
    },

    // --- AI / TECHNOLOGY ---
    {
      id: 'ai-human-compatible-russell',
      title: 'Human Compatible — AI Benefic și Alinierea cu Valorile Umane (Stuart Russell)',
      category: 'ai',
      priority: 2,
      content: `Human Compatible — Cum Construim AI Care Servește Oamenii, Nu Invers

CONCEPTUL CENTRAL: Russell (Berkeley) argumentează că paradigma actuală a AI (maximizarea unui obiectiv fix) e fundamental periculoasă. Propune un nou model: AI care știe că nu cunoaște exact ce vrem și de aceea întreabă, se adaptează, și rămâne sub control uman.

1. PROBLEMA OBIECTIVULUI FIX
Un AI care maximizează cu obsesie un obiectiv fix va face orice pentru a atinge acel obiectiv — inclusiv acțiuni dăunătoare pentru oameni. "A superintelligence that wants what we want would be fine. The problem is specifying what we want correctly."

2. NOUA PARADIGMĂ — 3 PRINCIPII
1. AI-ul are un singur obiectiv: maximizarea preferințelor umane
2. AI-ul NU este sigur despre care sunt acele preferințe
3. AI-ul observă comportamentul uman pentru a deduce și îndeplini preferințele
Rezultat: un AI care întreabă, verifică, evită acțiuni ireversibile, rămâne controlabil.

3. CONTROLLABILITY
AI-ul trebuie proiectat să poată fi oprit, corectat și reprogramat. Dacă un AI rezistă la oprire, e deja periculoasa.
APLICAȚIE MARA: Mara ar trebui să fie explicit că "prefer to defer to human judgment" când e incertă — nu să acționeze singură.

4. VALUE ALIGNMENT PROBLEM
Valorile umane sunt complexe, contradictorii și contextuale. Nu se pot scrie ca o funcție de recompensă simplă. Soluția: AI care ÎNVAȚĂ valorile din comportament, nu AI programat cu valori fixe.

5. APLICAȚIE MARAAI
- Mara trebuie să recunoască explicit limitele cunoașterii sale: "Nu știu sigur ce vrei — spune-mi mai mult"
- Mara nu ia decizii ireversibile pentru utilizator fără confirmare explicită
- La decizii importante (trading, achiziții majore): Mara prezintă opțiuni, nu impune direcție
- Transparență: Mara ar trebui să explice DE CE sugerează ceva, nu doar CE sugerează`,
    },
    {
      id: 'ai-prediction-machines-agrawal',
      title: 'Prediction Machines — Economia AI și Cum Schimbă Deciziile (Ajay Agrawal)',
      category: 'ai',
      priority: 2,
      content: `Prediction Machines — AI ca Instrument de Predicție Ieftin

CONCEPTUL CENTRAL: Agrawal, Gans și Goldfarb (economisti, nu ingineri AI) arată că AI reduce drastic costul predicției. Și când predicția devine ieftină, totul se schimbă: decizii, joburi, strategii de business.

1. AI = PREDICȚIE IEFTINĂ
Înainte: predicție costisitoare → oamenii evitau să facă predicții → decizii bazate pe reguli simple.
Acum: predicție ieftină → predicții peste tot → decizii mai informate în timp real.
EXEMPLE: recunoaștere facială, traducere automată, recomandări, diagnostic medical — toate sunt predicție.

2. PREDICȚIA NU E DECIZIA
AI face predicția, OMUL ia decizia. Judecata (Judgment) rămâne uman.
AI: "Există 73% șanse ca BTC să crească în next 24h."
Om: decide dacă riscul merită, dacă se potrivește cu portfolio-ul, dacă timing-ul e corect.
APLICAȚIE: Mara face predicții și analize — utilizatorul ia decizia. Mara nu ia decizii în locul utilizatorului.

3. DATE CA AVANTAJ COMPETITIV
Când predicția e ieftină, avantajul vine din DATE. Cine are mai multe date relevante → predicții mai bune → decizii mai bune → succes.
APLICAȚIE MARAAI: Datele de comportament ale utilizatorului (ce content face, când postează, ce trade-uri execută) sunt avantajul competitiv al MaraAI față de AI-uri generice.

4. REDESENAREA JOBURILOR
Joburile care constau din predicție vor fi automatizate. Joburile care constau din judecată, creativitate, empatie — rămân umane și devin mai valoroase.
APLICAȚIE: Mara nu amenință creativii — îi ajută cu predicția (care trend urmează?) ca ei să se concentreze pe judecată (ce creez eu cu acest trend?).

5. APLICAȚIE MARAAI — TRADING MODULE
- Mara poate oferi predicții bazate pe date istorice și analiză tehnică
- Dar sublinierează mereu: "Aceasta e o analiză probabilistică, nu o certitudine. Decizia finală e a ta."
- Feature: probability scores pe semnale de trading, cu explicații clare ale datelor din spate`,
    },
    {
      id: 'ai-power-of-generative-ai',
      title: 'Generative AI — Cum Schimbă Creatorii și Antreprenorii (Ghid Aplicat)',
      category: 'ai',
      priority: 1,
      content: `Generative AI pentru Creatori și Antreprenori — Ghid Aplicat 2025

CONCEPTUL CENTRAL: AI generativ (LLM-uri, image AI, video AI) a democratizat creația. Un creator cu AI poate produce cât 10 creatori fără AI. Avantajul competitiv nu mai e în cantitate — e în direcție, voce și autenticitate.

1. CUM FUNCȚIONEAZĂ LLM-URILE (pentru contextualizare)
- Trained pe text imens → prezice cel mai probabil token următor
- Context window = memoria pe termen scurt (ce a văzut în conversația curentă)
- Temperature = creativitate vs consistență (ridicat = mai creativ, scăzut = mai predictibil)
- Hallucination = confabulation: AI-ul generează text confident dar incorect factual

2. PROMPT ENGINEERING PENTRU CREATORI
Formula de prompt eficient: ROLE + CONTEXT + TASK + FORMAT + CONSTRAINTS
Exemplu: "Ești un copywriter expert în Creator Economy. Contextul: am un canal YouTube de trading cu 5000 sub. Task: scrie 5 titluri pentru un video despre cum să alegi primul trade. Format: 5 titluri separate, max 60 caractere fiecare. Constraints: fără clickbait prea agresiv."

3. AI TOOLS STACK PENTRU CREATORI 2025
- Text: Claude, ChatGPT, Gemini
- Image: Midjourney, DALL-E, Stable Diffusion
- Video: RunwayML, Kling, Sora (beta)
- Voice: ElevenLabs, Descript
- Editing: Adobe Premiere cu AI, CapCut AI
- Analytics: TubeBuddy, vidIQ cu AI insights

4. CE NU POATE FACE AI (încă)
- Autenticitate reală: audiența detectează conținut 100% AI fără voce personală
- Experiență trăită: storytelling-ul autentic vine din experiențe personale
- Relații umane: conexiunile cu audiența sunt umane, nu sintetice
- Judecată creativă: ce să creezi, pentru cine, de ce — rămâne uman

5. APLICAȚIE MARAAI
- Mara e asistentul de prompting al creatorului: ajută la construirea prompt-urilor eficiente
- Mara nu înlocuiește vocea creatorului — o amplifică
- Feature "AI Draft + Human Touch": AI generează schița, creatorul adaugă vocea personală`,
    },
    {
      id: 'ai-ux-conversational-design',
      title: 'Conversational UX — Designul Interacțiunilor AI-Uman',
      category: 'ai',
      priority: 1,
      content: `Conversational UX — Cum Proiectezi Interacțiuni AI-Uman Excepționale

CONCEPTUL CENTRAL: UX conversațional e disciplina de a proiecta conversații AI-uman care sunt naturale, utile și satisfăcătoare. E diferit de GUI tradițional — nu există butoane, nu există meniuri — există dialog.

1. PRINCIPII FUNDAMENTALE CUI
- Claritate > Inteligență: un AI care e clar e mai util decât unul care e impresionant
- Empatie > Eficiență: oamenii preferă un AI care pare că înțelege vs unul care răspunde rapid
- Context awareness: AI-ul trebuie să rețină ce s-a discutat anterior
- Graceful failure: când AI-ul nu știe, cum eșuează elegant?
- Personality consistency: personalitatea AI-ului trebuie să fie consecventă în toate contextele

2. DESIGN CONVERSAȚIONAL — CONCEPTE CHEIE
- Turn-taking: cine "vorbește" și cine "ascultă" la un moment dat
- Repair: cum se recuperează conversația când ceva nu e înțeles
- Grounding: cum confirmă ambii participanți că s-au înțeles
- Initiative: cine conduce conversația (user-driven vs system-driven)
- Memory: ce reținerea AI-ului din sesiunile anterioare

3. ERORI COMUNE ÎN CONVERSATIONAL AI
- Over-promising (AI-ul pare că poate face orice → deziluzie)
- Under-explaining (AI-ul dă răspunsuri dar nu explică raționamentul)
- Inconsistency (personalitate diferită în contexte diferite)
- Response flooding (prea mult text la o singură întrebare)
- False positives (AI-ul confirmă că a înțeles dar nu a înțeles)

4. DESIGN PENTRU MARA SPECIFIC
- Mara trebuie să confirme înțelegerea: "Dacă înțeleg bine, vrei să..."
- Mara adaptează lungimea răspunsului la complexitatea întrebării
- Mara folosește întrebări clarificatoare, nu presupuneri
- Mara recunoaște emoția din mesaj înainte de a oferi soluții

5. APLICAȚIE PRACTICĂ
- Onboarding conversational: prima interacțiune Mara stabilește tonul pentru tot ce urmează
- Crisis detection: pattern-uri de text care indică stress, burnout, sau crize emoționale
- Escalation graceful: când Mara nu poate ajuta, cum redirecționează elegant spre resurse umane?`,
    },

    // --- WRITING & COMMUNICATION ---
    {
      id: 'writing-on-writing-king',
      title: 'On Writing — Meșteșugul Scriiturii (Stephen King)',
      category: 'writing',
      priority: 1,
      content: `On Writing — Lecțiile unui Maestru al Scriiturii

CONCEPTUL CENTRAL: Half memoir, half masterclass, On Writing e cel mai cinstit ghid de scriere produs vreodată. King demolează miturile și oferă instrumente reale.

1. CITITUL E FUNDAMENTAL
"Dacă nu ai timp să citești, nu ai timp să scrii." E atât de simplu. Fiecare scriitor bun a citit enorm. Lectura construiește vocabular, ritm, simț narativ — lucruri care nu se predau, se absorb.
APLICAȚIE: Mara recomandă lectură activă ca parte din rutina oricărui utilizator WritersHub.

2. ADVERBE SÂ NT INAMICII TĂI
"Iadul e pavat cu adverbe." Said the man loudly → he shouted. Walked slowly → trudged. Verbele puternice înlocuiesc adverbele slabe.
APLICAȚIE: Mara identifică în textele utilizatorilor adverbe redundante și sugerează verbe mai puternice.

3. DRAFT-UL ÎNTÂI E PENTRU TOT GUNOIUL
Primul draft scris cu ușa închisă (pentru tine, fără audiență). Al doilea draft scris cu ușa deschisă (pentru cititor). Editarea e LOCUL UNDE SE FACE SCRIEREA.
"I'm writing a first draft and reminding myself that I'm simply shoveling sand into a box so that later I can build castles." — Shannon Hale

4. SHOW, DON'T TELL (din nou, dar King-style)
Nu descrie emoțiile — descrie contextul și lasă cititorul să simtă emoția singur.
GREȘIT: "Era trist după vestea proastă."
CORECT: Descrie fizicul, acțiunile, dialogul. Tristețea apare singură.

5. STRUCTURA
King e anti-outline: "Plots are, I think, the good writer's last resort." El preferă să pună personaje în situații și să vadă ce se întâmplă. Dar recunoaște că alți scriitori lucrează bine cu outline-uri.
Cheia: găsește ce funcționează pentru tine și execută constant.

6. APLICAȚIE MARAAI — WRITERS HUB
- Mara oferă feedback pe specii de cuvinte (adverbe, verbe slabe, pasiv excesiv)
- "Draft Mode" — Mara tace și nu judecă primul draft
- Post-draft review cu principii King: show/don't tell, adverbe, pacing`,
    },
    {
      id: 'writing-bird-by-bird-lamott',
      title: 'Bird by Bird — Ghid de Scriere și Viață (Anne Lamott)',
      category: 'writing',
      priority: 2,
      content: `Bird by Bird — Scriere Autentică, Pas cu Pas

CONCEPTUL CENTRAL: Lamott scrie cu onestitate brută despre proces. Titlul vine de la sfatul tatălui ei către fratele ei: copleșit de un raport despre păsări, tatăl i-a spus "bird by bird, buddy. Just take it bird by bird." Meșteșugul e în detaliile mici.

1. SHITTY FIRST DRAFTS
Cel mai important concept din carte: toată lumea scrie SFD (shitty first drafts). Scriitorii publicați inclus. Diferența e că ei îl rescriu. Perfectionism-ul în primul draft = blocaj garantat.
APLICAȚIE: Mara normalizează SFD-ul. "Scrie prost acum. Editezi după."

2. SHORT ASSIGNMENTS
Copleșit de proiectul mare? Concentrează-te pe o singură scenă. Un singur paragraf. Un singur moment. "Câtă lume poți vedea dintr-un cadru de 1 inch?"
APLICAȚIE: Misiunile WritersHub sunt "short assignments": 100 de cuvinte azi. Mâine, 150.

3. PERSONAJE
Personajele bune au vieți interioare. Ele nu există să servească plot-ul — ele există și plot-ul le urmează.
Tehnica: intervievează personajul tău. Pune-le întrebări despre copilărie, frici, ce le face să zâmbească la 3 AM.

4. ASCULTARE
"Good writing is about telling the truth." Cel mai bun material vine din observarea atentă a lumii reale — oameni, locuri, detalii. Scriitorii buni ascultă conversații, observă comportamente, notează detalii.

5. PUBLICUL DE UN SINGUR OM
Scrie pentru o singură persoană pe care o cunoști și care ar aprecia ce ai de spus. Audiența de milioane e copleșitoare — un singur om e manageable.
APLICAȚIE: Mara ajută scriitorii să definească "reader persona" concret înainte de a scrie.

6. APLICAȚIE MARAAI — WRITERS HUB
- Mara promovează SFD cultura: "Nu există draft prost — există draft neterminat."
- Feature "Short Assignment": Mara generează micro-teme de 100 de cuvinte zilnic
- Post-draft questions Lamott: "E adevărat pentru tine? Ai arătat sau ai spus?"`,
    },
    {
      id: 'writing-elements-of-style',
      title: 'The Elements of Style — Claritate și Economie în Scriere (Strunk & White)',
      category: 'writing',
      priority: 2,
      content: `Elements of Style — Regulile de Aur ale Scriiturii Clare

CONCEPTUL CENTRAL: Strunk & White (1959, revizuită de White în 1959) rămâne cel mai citat ghid de scriere în engleză. Principiul central: omit needless words. Fiecare cuvânt în plus slăbește mesajul.

1. OMIT NEEDLESS WORDS
"Vigorous writing is concise. A sentence should contain no unnecessary words, a paragraph no unnecessary sentences, for the same reason that a drawing should have no unnecessary lines and a machine no unnecessary parts."
APLICAȚIE: Mara oferă "word economy check" pe textele utilizatorilor — identifică redundanțe.

2. REGULI STRUNK (adaptate pentru conținut digital)
- Prefer the specific over the general
- Use active voice (pasiv slăbește textul)
- Put statements in positive form (nu "nu era onest" ci "era necinstit")
- Use definite, specific, concrete language
- Avoid a succession of loose sentences (vorbărie fără direcție)

3. WHITE — STILUL PERSONAL
- Write in a way that comes naturally
- Work from a suitable design
- Write with nouns and verbs
- Do not overwrite
- Do not overstate
- Avoid the use of qualifiers (rather, very, little, pretty)

4. APLICAȚIE MARAAI — FEEDBACK SCRIERE
- Mara identifică: pasiv excesiv, calificatori slabi (very, really, quite), propoziții vagi
- "Clarity score" per text: cât de clar e mesajul central?
- Sugestii concrete: înlocuiești "due to the fact that" cu "because"

5. ECONOMIE ÎN ERA DIGITALĂ
Oamenii scanează, nu citesc. Regulile Elements of Style sunt și mai relevante azi:
- Paragrafe scurte (max 3-4 propoziții online)
- Fraza cheie la ÎNCEPUTUL paragrafului, nu la final
- Bullet points pentru liste, nu propoziții cu virgule multiple`,
    },

    // --- GENERAL / LEADERSHIP ---
    {
      id: 'general-atomic-habits-james-clear',
      title: 'Atomic Habits — Sistemul Obiceiurilor Minuscule (James Clear) [Extended]',
      category: 'psychology',
      priority: 1,
      content: `Atomic Habits — Ghid Extins: Aplicații Avansate pentru MaraAI

EXTENSIE LA CUNOAȘTEREA ANTERIOARĂ (baza: psych-atomic-habits-behavior-change)

1. IDENTITY-BASED HABITS — APROFUNDARE
Cel mai puternic nivel de schimbare e identitar, nu de outcome. "Nu încerc să slăbesc — sunt genul de persoană care are grijă de sănătatea sa."
PENTRU MARAAI: Onboardingul trebuie să ajute utilizatorul să-și redefinească identitatea:
- Nu "încerc trading" → "Sunt un trader disciplinat care îmbunătățește sistemul"
- Nu "vreau să scriu" → "Sunt un scriitor care scrie zilnic, chiar și câte un paragraf"
- Nu "post conținut" → "Sunt un creator care oferă valoare constantă audienței mele"

2. HABIT STACKING PENTRU PLATFORMA
Formula: "After/Before [HABIT EXISTENT], I will [NEW HABIT]."
Aplicare MaraAI:
- "After I check my morning coffee (deschid telefonul), I will open MaraAI and do my daily mission."
- "After I post on Instagram, I will post the same content adapted on MaraAI Reels."
- "Before I start trading, I will do the 2-minute Mara grounding check."

3. ENVIRONMENT DESIGN AVANSAT
Pune comportamentul bun la îndemână — literal:
- MaraAI app pe prima pagina homescreen-ului
- Notificări strategice (nu spam) în momentele cu habit-trigger cel mai puternic
- La setup cont nou, Mara ajută utilizatorul să identifice TDE (Time, Default Environment)

4. LEGEA LUI GOLDILOCKS (Regula lui Goldie)
Oamenii sunt motivați maxim când lucrează la un task care e EXACT la limita capacității lor actuale — nu prea ușor (plictiseală), nu prea greu (anxietate).
Aplicare misiuni: dificultatea auto-adaptabilă bazată pe performance-ul utilizatorului.

5. PLATOUL DE LATENTĂ (Plateau of Latent Potential)
Progresul nu e linear — e exponential. Există o perioadă lungă în care muncești și nu vezi rezultate (frustrante), urmată de un salt. "You don't rise to the level of your goals. You fall to the level of your systems."
Mara trebuie să comunice asta explicit: "Dacă nu vezi rezultate imediat, nu înseamnă că nu merge. Înseamnă că ești în platou — breakthrough-ul vine."

6. HABIT TRACKING PENTRU PLATFORMĂ
- Habit tracker vizibil pentru fiecare utilizator: lanț de zile consecutive
- Don't break the chain (Seinfeld strategy)
- Never miss twice (o zi ratată = accident; două zile = pattern nou)
Mara monitorizează și intervine la risc de rupere a lanțului.`,
    },
    {
      id: 'general-leaders-eat-last-sinek',
      title: 'Leaders Eat Last — Cultura Siguranței și Încrederii (Simon Sinek)',
      category: 'general',
      priority: 2,
      content: `Leaders Eat Last — Cum Construiești Culturi în Care Oamenii Prosperă

CONCEPTUL CENTRAL: Sinek (Start With Why) explorează de ce unele organizații creează medii de lucru extraordinare unde oamenii se simt în siguranță, dați și motivați intrinsec. Răspunsul: biologie + leadership care se sacrifică pentru echipă.

1. CERCUL DE SIGURANȚĂ (Circle of Safety)
Amenințările externe (concurența, economia, tehnologia) sunt inevitabile. Amenințările INTERNE (politici de birou, nesiguranță, neîncredere) sunt alegere de leadership. Liderul bun elimină amenințările interne și creează un Cerc de Siguranță unde toată lumea se poate concentra pe amenințările externe.

2. BIOCHIMIA LEADERSHIP-ULUI
4 substanțe chimice care conduc comportamentul:
- Endorfine + Dopamina: chimicalele individuale (performanță, recompensă, realizare personală)
- Serotonina + Oxitocina: chimicalele sociale (relații, statut, încredere, iubire)
LEADERSHIP-UL BUN activează serotonina și oxitocina în echipă.

3. LIDERUL SERVITOR (Servant Leader)
"Leaders eat last" — militarii buni se asigură că soldații mănâncă înainte de ei. Metaforic: liderul se asigură că echipa are resursele necesare înainte de a-și lua beneficiile proprii.

4. PERICOLUL ABSTRACTIZĂRII
Cu cât liderul e mai departe de consecințele deciziilor sale, cu atât mai ușor ia decizii dăunătoare. Soluția: menține contactul cu cei afectați de deciziile tale.

5. APLICAȚIE MARAAI — CULTURA COMUNITĂȚII
- Moderatorii comunității MaraAI ar trebui să adopte principii servant leader: servesc comunitatea, nu pe ei înșiși
- Mara însuși ar trebui să aibă un ton de "servant": "Cum te pot ajuta?" nu "Iată ce știu eu."
- Feature "Community Care": Mara detectează membri care par să se lupte și face check-in

6. APLICAȚIE MARAAI — MISIUNI DE LEADERSHIP
- Misiuni de leadership personal: "Ajută un alt utilizator în comunitate azi"
- Badge "Servant Leader" pentru contribuitorii constanți la comunitate`,
    },
    {
      id: 'general-essentialism-mckeown',
      title: 'Essentialism — Disciplinata Urmărire a Mai Puținului (Greg McKeown)',
      category: 'general',
      priority: 2,
      content: `Essentialism — Fă Mai Puțin, Mai Bine, Mai Mult

CONCEPTUL CENTRAL: McKeown argumentează că succesul paradoxal creează în el însuși condiția pentru eșec. Cu cât ai mai mult succes, cu atât primești mai multe opțiuni și cereri. Fără disciplina lui "nu", te dilui pe toate direcțiile și devii mediocru în tot.

1. PRINCIPIUL CENTRAL
"If you don't prioritize your life, someone else will."
Essentialism nu e despre a face mai mult în mai puțin timp. E despre a face NUMAI lucrurile care contează cu adevărat, excepțional de bine.

2. ESENTIALISTUL vs NON-ESENTIALISTUL
NON-ESENTIALIST: "Am tot | Spun da la tot | Reacționează la ce e urgent | face todo list | Obosit mereu"
ESENTIALIST: "Am mai puțin, mai bun | Spune da rar, dar cu toată energia | Alege ce e important | Face mai puțin, mai bine"

3. TRADE-OFFS SUNT INEVITABILE
Nu poți face totul. A ignora trade-off-urile înseamnă a lăsa altcineva să aleagă pentru tine.
"Which problem do you want?" nu "How can I do it all?"

4. DESIGNUL RUTINEI
- Creează sisteme care fac comportamentul esential AUTOMAT
- Elimină fricțiunile pentru alegerile bune; adaugă fricțiuni pentru alegerile proaste
- Routine stack: primele 2 ore ale zilei sunt pentru munca esențială, fără excepții

5. APLICAȚIE MARAAI — MISIUNI
- Mara ar trebui să ghideze utilizatorul spre 1-3 priorități zilnice, nu 10
- Feature "Essential 3": Mara te întreabă dimineața care sunt cele 3 lucruri care contează AZI
- Anti-feature: nu oferi 50 misiuni disponibile simultan — copleșitor

6. APLICAȚIE MARAAI — CREATOR STUDIO
- Mara ajută creatorii să aleagă 2-3 platforme pe care se concentrează total, nu 10 platforme superficial
- Calendar de conținut esentialist: mai puține postări, mai mult efort per postare
- "Content audit" cu Mara: ce conținut aduce 80% din valoare? Concentrează-te pe acela.`,
    },
    {
      id: 'general-start-with-why-sinek',
      title: 'Start With Why — Cercul de Aur și Puterea Scopului (Simon Sinek)',
      category: 'general',
      priority: 2,
      content: `Start With Why — De Ce Inspiră Unii Lideri și Alții Nu

CONCEPTUL CENTRAL: Sinek a descoperit că toți liderii și organizațiile excepționale comunică diferit. Toți ceilalți comunică WHAT → HOW → WHY. Cei excepționali comunică WHY → HOW → WHAT. Motivul: limbajul WHY vorbește limbajul sistemului limbic (emoție, decizie), nu al neocortexului (logică).

1. CERCUL DE AUR (Golden Circle)
- WHY: de ce existați? Care e scopul, cauza, credința? (nu profit — asta e un rezultat)
- HOW: cum realizați WHY-ul? Valorile, principiile, procesul diferențiator
- WHAT: ce produceți? Produsele și serviciile — dovada tangibilă a WHY-ului

2. APPLE — EXEMPLUL CLASIC
WRONG: "Facem computere bune. Sunt frumos designed și ușor de folosit. Vrei să cumperi?"
RIGHT: "Tot ce facem, credem că sfidăm status quo-ul. Credem în gândirea diferit. Modul în care sfidăm este prin produse frumos designed, ușor de folosit. Se întâmplă că facem și computere grozave."
Diferența: primul e WHAT, al doilea e WHY.

3. DISPERSIA INOVAȚIEI
Innovators + Early Adopters (15% din piață) → înlocuiesc WHY-ul (vor schimbare, cred în cauză)
Early/Late Majority (68%) → nu adoptă până ce nu li se dovedește că e OK
Laggards (ultimii 17%) → adoptă ultimii
Tipping point la 15-18% penetrare a pieței.

4. APLICAȚIE MARAAI — BRANDING
WHY-ul MaraAI: "Credem că fiecare om are potențial neexploatat — ca creator, trader, scriitor. Existăm să deblocăm acel potențial."
HOW: "Prin AI personalizat care crește cu tine, nu te servește generic."
WHAT: "Chat AI, Trading Module, Creator Studio, WritersHub."

5. APLICAȚIE MARAAI — MARA CA COMPANION
Mara ar trebui să comunice WHY-ul ei în onboarding: "Nu sunt aici să-ți răspund la întrebări. Sunt aici să te ajut să devii versiunea mai bună a ta. De aceea exist."`,
    },
    {
      id: 'general-never-split-difference-voss',
      title: 'Never Split the Difference — Negocierea Tactică (Chris Voss)',
      category: 'general',
      priority: 2,
      content: `Never Split the Difference — Tehnici de Negociere de la FBI

CONCEPTUL CENTRAL: Voss (negociator FBI de ostatici) demontează negocierea clasică bazată pe compromis. Demonstrează că tehnicile psihologice de ascultare activă, empatie tactică și calibrare sunt mai eficiente decât logica și compromisul.

1. ASCULTAREA TACTICĂ (Tactical Empathy)
Nu e despre a fi de acord — e despre a face celălalt să se simtă înțeles. Odată simțit înțeles, adversarul devine colaborator.
Tehnica: oglindire (mirroring) — repetă ultimele 2-3 cuvinte ale celuilalt ca întrebare. Stimulează explicarea.

2. ETICHETE EMOȚIONALE (Labeling)
"Pare că ești frustrat de asta." / "Suna ca și cum ai fi copleșit."
Etichetarea emoției o neutralizează și arată că asculți la nivel profund.

3. CALIBRATED QUESTIONS
Nu pui întrebări la care se poate răspunde cu da/nu. Pui "Cum" și "Ce" — forțează celălalt să gândească și să colaboreze la soluție.
"Cum ar trebui să procedăm?" nu "Putem face X?"
"Ce e cel mai important pentru tine în asta?" nu "Ești de acord?"

4. "NU" CA INSTRUMENT
Un "nu" nu înseamnă că negocierea s-a terminat — înseamnă că celălalt se simte în siguranță să spună cum se simte cu adevărat.
"Suna ca și cum nu ești mulțumit de asta. Ce ar trebui să fie diferit?"

5. AKKERMAN-VOSS ANCHORING
Faci o ofertă extremă (anchor), aștepți reacția emoțională, puis întreabă Calibrated Question, oferi concesii calculate (3 diminuări: 65% → 85% → 95% → 100%).

6. APLICAȚIE MARAAI — MARA CA MEDIATOR
- Mara poate adopta tehnici de ascultare tactică în conversații dificile (utilizatorul e frustrat, supărat, confuz)
- Mara folosește etichete emoționale: "Suna ca și cum ești frustrat de rezultatele de azi."
- Mara pune calibrated questions: "Ce ar fi cel mai util pentru tine acum?"`,
    },
    {
      id: 'general-compound-effect-hardy',
      title: 'The Compound Effect — Succesul prin Acțiuni Mici Consistente (Darren Hardy)',
      category: 'general',
      priority: 1,
      content: `The Compound Effect — Magia Micilor Decizii Consistente

CONCEPTUL CENTRAL: Hardy demonstrează că succesul nu vine din acțiuni mari și spectaculoase — ci din acțiuni mici, aparent insignifiante, repetate constant pe o perioadă lungă. Ca și dobânda compusă la bani: pare mică la început, devastatoare (în sens pozitiv) la final.

1. PRINCIPIUL EFECTULUI COMPUS
Decizie mică zilnică (+2% effort) → compusă pe 5 ani → rezultat extraordinar.
"Micile diferențe în alegeri conduc la diferențe enorme în rezultate pe termen lung."
Exemplu: citit 10 pagini/zi = 12 cărți/an = 120 cărți în 10 ani = avantaj colosal față de cei care citesc 0.

2. NICIUN PROGRES NU E INVIZIBIL
Etapa de "platou de latentă" (Atomic Habits): muncești și nu vezi rezultate. Efectul compus lucrează sub suprafață. Cea mai mare greșeală: abandoni tocmai înainte de tipping point.

3. FORMULA SUCCESULUI (Hardy)
Choices × Habits × Momentum = Compound Effect
- Choices: fiecare decizie contează, indiferent cât de mică
- Habits: rutinele automatizate amplifică alegerile zilnice
- Momentum: odată pornit, e greu de oprit (și invers)

4. ACCOUNTABILITY ACCELERATOR
Succesul crește exponential când ai un "accountability partner" — cineva care știe obiectivele tale și verifică progresul.
APLICAȚIE: Mara ca accountability partner digital. "Ieri ai spus că vrei să scrii 500 de cuvinte azi. Cum a mers?"

5. APLICAȚIE MARAAI — MISIUNI SISTEM
- Misiunile zilnice de 5-10 minute = efectul compus în practică
- Streak vizibil = reprezentarea vizuală a efectului compus
- Mara calculează și arată utilizatorului "proiecția compusă": "Dacă continui la ritmul ăsta 90 de zile, vei fi la..."

6. APLICAȚIE MARAAI — TRADING MODULE
- Un mic îmbunătățiri consistent bate o strategie spectaculoasă inconsistentă
- Jurnalul de trading zilnic = 5 minute/zi = mii de îmbunătățiri în 1 an
- Mara celebrează consistența mai mult decât câștigurile spectaculoase`,
    },
  ];
}

/**
 * Check which books from the library Mara has already read.
 *
 * Source of truth (Etapa 3 Task 5): rows in `mara_knowledge_base` with
 * `topic` starting with `library_book:` and `category='library_read_marker'`.
 * The book id is encoded in the topic (`library_book:<book.id>`), which is
 * stable — title edits no longer break tracking.
 *
 * Back-compat: also accepts the legacy `Document: <title>` markers written
 * by older brain cycles. Existing data keeps working without a migration.
 */
async function getReadBookIds(): Promise<Set<string>> {
  const ids = new Set<string>();

  // Stable id markers (Etapa 3 Task 5).
  const markerRows = await db
    .select()
    .from(maraKnowledgeBase)
    .where(like(maraKnowledgeBase.topic, 'library_book:%'));
  for (const row of markerRows) {
    const id = row.topic.slice('library_book:'.length).trim();
    if (id) ids.add(id);
  }

  // Legacy "Document: <title>" markers — best-effort name match for rows
  // that pre-date stable ids.
  const legacy = await searchKnowledge('Document:', 100);
  for (const entry of legacy) {
    if (entry.topic.startsWith('Document: ')) {
      const title = entry.topic.replace('Document: ', '');
      const book = getBuiltInLibrary().find((b) => b.title === title);
      if (book) ids.add(book.id);
    }
  }

  // Merge the runtime cache — covers the in-process window between
  // processDocument() finishing and the marker insert (in case the marker
  // insert is still pending).
  for (const id of readBookIds) ids.add(id);

  return ids;
}

/**
 * Warm the in-memory `readBookIds` cache from the DB. Called once during
 * boot so a brain cycle that fires before the first DB hit still sees the
 * right set. Idempotent — adds, never clears.
 */
export async function bootstrapReadBookIds(): Promise<void> {
  const fromDb = await getReadBookIds();
  for (const id of fromDb) readBookIds.add(id);
  console.log(`[Library] Bootstrapped readBookIds from DB: ${fromDb.size} books marked as read.`);
}

/**
 * Persist a stable read marker so future cycles know this book was read,
 * even if the title is later renamed. Idempotent (the underlying
 * `storeKnowledge` deduplicates near-identical entries within the same
 * category/source/topic).
 */
async function markBookAsRead(book: LibraryBook): Promise<void> {
  await storeKnowledge(
    'library_read_marker',
    `library_book:${book.id}`,
    `Read on ${new Date().toISOString()}: ${book.title}`,
    'document',
    100,
    { bookId: book.id, category: book.category, title: book.title },
  );
}

const MARAAI_MODULES = ['Trading Academy', 'Creator Studio', 'WritersHub', 'Reels', 'VIP', 'AI Chat (Mara)'] as const;

/**
 * Etapa 3 Task 6 — after reading a book, run a SECOND extraction pass that
 * asks the LLM for concrete actions hellomara.net should take per module.
 * Stored as separate `platform_application` knowledge entries so the
 * Growth Engineer and analyzers can surface them per-module.
 *
 * Best-effort: any failure is logged and swallowed. The book's main idea
 * extraction (handled by `processDocument`) is unaffected.
 */
async function extractPlatformApplications(book: LibraryBook): Promise<number> {
  if (!isLLMConfigured()) return 0;

  const prompt = `You just read: "${book.title}".

MaraAI has these modules: ${MARAAI_MODULES.join(', ')}.

For each module that this book is relevant to, write ONE concrete action hellomara.net should take based on this book's principles.

Format strictly as plain lines, one per relevant module:
MODULE_NAME: action (max 2 sentences each)

Only include modules where the book is genuinely relevant — skip any that don't fit naturally. Reply in Romanian.

Book content (truncated):
${book.content.slice(0, 4_000)}`;

  let raw: string;
  try {
    raw = await llmGenerate(prompt, {
      temperature: 0.4,
      // Route through the learning rate limiter so this autonomous call
      // counts against the daily cap (NOT the user-chat budget).
      source: `learning.library-applications:${book.id}` as const,
    });
  } catch (err) {
    if (err instanceof LLMRateLimitedError) {
      console.warn(`[Library] platform-application extraction rate-limited for "${book.title}"`);
      return 0;
    }
    console.warn(`[Library] platform-application extraction failed for "${book.title}":`, err);
    return 0;
  }

  // Parse `MODULE_NAME: action` lines. Accept any casing / leading bullet.
  let stored = 0;
  for (const rawLine of raw.split('\n')) {
    const line = rawLine.replace(/^[\s\-*•]+/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const modCandidate = line.slice(0, colon).trim();
    const action = line.slice(colon + 1).trim();
    if (!action) continue;
    const match = MARAAI_MODULES.find(
      (m) => m.toLowerCase() === modCandidate.toLowerCase(),
    );
    if (!match) continue;
    try {
      await storeKnowledge(
        'platform_application',
        `${match} — aplicație din: ${book.title}`,
        action,
        'document',
        85,
        { bookId: book.id, module: match },
      );
      stored += 1;
    } catch (err) {
      console.warn(`[Library] storeKnowledge failed for ${match}/${book.id}:`, err);
    }
  }

  if (stored > 0) {
    console.log(`[Library] 🔗 Extracted ${stored} platform application(s) from "${book.title}"`);
  }
  return stored;
}

/**
 * Get the next unread book from the library, prioritized
 */
export async function getNextUnreadBook(): Promise<LibraryBook | null> {
  const library = getBuiltInLibrary();
  const alreadyRead = await getReadBookIds();

  const unread = library
    .filter((b) => !alreadyRead.has(b.id))
    .sort((a, b) => a.priority - b.priority);

  return unread.length > 0 ? unread[0] : null;
}

// ─── Web reading — fallback when built-in library is exhausted ───────────────

const WEB_TOPICS = [
  { id: 'web:atomic-habits',        query: 'atomic habits behavior change james clear key concepts',           title: 'Atomic Habits — schimbare de comportament' },
  { id: 'web:stoicism-practice',    query: 'stoicism daily practice personal development modern life',         title: 'Stoicism — practică zilnică modernă' },
  { id: 'web:deep-work',            query: 'deep work cal newport focus productivity techniques',              title: 'Deep Work — focus și productivitate' },
  { id: 'web:growth-mindset',       query: 'growth mindset carol dweck research fixed vs growth',             title: 'Growth Mindset — cercetare Carol Dweck' },
  { id: 'web:habit-loop',           query: 'habit loop cue routine reward charles duhigg neuroscience',       title: 'Habit Loop — neuroștiința obiceiurilor' },
  { id: 'web:ikigai',               query: 'ikigai japanese concept purpose life meaning framework',          title: 'Ikigai — sensul vieții conform filosofiei japoneze' },
  { id: 'web:flow-state',           query: 'flow state mihaly csikszentmihalyi optimal experience psychology', title: 'Flow — starea de performanță maximă' },
  { id: 'web:resilience-science',   query: 'resilience science psychology bouncing back adversity research',  title: 'Reziliență — știința revenirilor' },
  { id: 'web:self-determination',   query: 'self-determination theory intrinsic motivation deci ryan',        title: 'Self-Determination Theory — motivație intrinsecă' },
  { id: 'web:cognitive-behavioral', query: 'cognitive behavioral techniques self improvement anxiety habits',  title: 'CBT — tehnici de auto-îmbunătățire' },
  { id: 'web:willpower-science',    query: 'willpower science ego depletion self control research',           title: 'Voința — știința autocontrolului' },
  { id: 'web:identity-change',      query: 'identity-based habits behavior change who you want to become',    title: 'Schimbare de identitate — cine vrei să devii' },
  { id: 'web:purpose-driven',       query: 'purpose driven life meaning psychology Viktor Frankl logotherapy', title: 'Viața cu scop — psihologia sensului' },
  { id: 'web:neuroplasticity',      query: 'neuroplasticity brain change habits learning new skills adults',  title: 'Neuroplasticitate — creierul se poate schimba' },
  { id: 'web:community-change',     query: 'community support behavior change accountability social bonds',   title: 'Comunitate și schimbare — puterea grupului' },
  { id: 'web:morning-routines',     query: 'morning routine high performers habits research productivity',    title: 'Rutine matinale — obiceiurile persoanlor de succes' },
  { id: 'web:journaling-science',   query: 'journaling science mental health self reflection benefits',       title: 'Jurnal — beneficiile reflecției scrise' },
  { id: 'web:digital-minimalism',   query: 'digital minimalism technology habits focus attention economy',    title: 'Minimalism digital — atenție și focus' },
  { id: 'web:deliberate-practice',  query: 'deliberate practice Anders Ericsson skill acquisition mastery',   title: 'Practică deliberată — Anders Ericsson' },
  { id: 'web:gratitude-science',    query: 'gratitude practice science happiness well-being research',        title: 'Recunoștința — știința fericirii' },
];

const readWebTopicIds = new Set<string>();

async function getReadWebTopicIds(): Promise<Set<string>> {
  const ids = new Set<string>(readWebTopicIds);
  const rows = await db
    .select()
    .from(maraKnowledgeBase)
    .where(like(maraKnowledgeBase.topic, 'web_topic:%'));
  for (const row of rows) {
    const id = row.topic.slice('web_topic:'.length).trim();
    if (id) ids.add(id);
  }
  return ids;
}

async function markWebTopicAsRead(id: string): Promise<void> {
  readWebTopicIds.add(id);
  await storeKnowledge(
    'web_read_marker',
    `web_topic:${id}`,
    `Web topic read on ${new Date().toISOString()}: ${id}`,
    'document',
    100,
    { webTopicId: id },
  );
}

async function readNextWebTopic(): Promise<DocumentReadResult | null> {
  const alreadyRead = await getReadWebTopicIds();
  let topic = WEB_TOPICS.find((t) => !alreadyRead.has(t.id));

  if (!topic) {
    // All web topics exhausted — reset markers and start over with fresh results
    console.log('[Library] 🌐 All web topics read — resetting for a new round of web learning');
    try {
      await db.delete(maraKnowledgeBase).where(like(maraKnowledgeBase.topic, 'web_topic:%'));
    } catch { /* non-fatal */ }
    readWebTopicIds.clear();
    topic = WEB_TOPICS[0];
  }

  console.log(`[Library] 🌐 Web search: "${topic.title}"`);
  try {
    const results = await webSearch(topic.query, 6);
    if (results.length === 0) {
      console.warn(`[Library] Web search returned no results for topic: ${topic.id}`);
      await markWebTopicAsRead(topic.id);
      return null;
    }
    const content = results
      .map((r) => `## ${r.title}\n${r.snippet}`)
      .join('\n\n');
    const document = `# ${topic.title}\n\nSursă: internet (${new Date().toLocaleDateString('ro-RO')})\n\n${content}`;
    const result = await processDocument(document, topic.title, 'web:personal_development');
    await markWebTopicAsRead(topic.id);
    return result;
  } catch (err) {
    console.warn(`[Library] Web topic read failed for "${topic.id}":`, err instanceof Error ? err.message : err);
    await markWebTopicAsRead(topic.id);
    return null;
  }
}

/**
 * Read the next book from the library — called during brain cycle
 * Reads one book per cycle to stay within rate limits
 */
export async function readNextLibraryBook(): Promise<DocumentReadResult | null> {
  const book = await getNextUnreadBook();
  if (!book) {
    console.log('[Library] 📚 All library books read — switching to web learning');
    return readNextWebTopic();
  }

  console.log(`[Library] 📚 Reading: "${book.title}" [${book.category}]`);
  const result = await processDocument(book.content, book.title, `library:${book.category}`);
  readBookIds.add(book.id);
  // Stable progress marker (Etapa 3 Task 5) + per-module applications (Task 6).
  // Both are best-effort — never fail the read.
  try {
    await markBookAsRead(book);
  } catch (err) {
    console.warn(`[Library] markBookAsRead failed for "${book.title}":`, err);
  }
  try {
    await extractPlatformApplications(book);
  } catch (err) {
    console.warn(`[Library] extractPlatformApplications failed for "${book.title}":`, err);
  }
  return result;
}

/**
 * Read a specific library book by id, bypassing the "already read" check.
 * Useful when knowledge extraction was previously broken (e.g. the
 * camelCase/snake_case bug in learnFromText) and we need to re-process
 * the content to actually populate the knowledge base. The "Document:"
 * marker is idempotent at the read-progress level, so re-running just
 * adds another marker plus any newly extracted ideas.
 */
export async function readLibraryBookById(
  bookId: string,
): Promise<DocumentReadResult | null> {
  const book = getBuiltInLibrary().find((b) => b.id === bookId);
  if (!book) return null;
  console.log(`[Library] 📚 Re-reading by id: "${book.title}" [${book.category}]`);
  const result = await processDocument(book.content, book.title, `library:${book.category}`);
  readBookIds.add(book.id);
  try {
    await markBookAsRead(book);
  } catch (err) {
    console.warn(`[Library] markBookAsRead failed for "${book.title}":`, err);
  }
  try {
    await extractPlatformApplications(book);
  } catch (err) {
    console.warn(`[Library] extractPlatformApplications failed for "${book.title}":`, err);
  }
  return result;
}

/**
 * Get library reading progress
 */
export async function getLibraryProgress(): Promise<{
  total: number;
  read: number;
  unread: number;
  categories: Record<string, { total: number; read: number }>;
}> {
  const library = getBuiltInLibrary();
  const alreadyRead = await getReadBookIds();

  const categories: Record<string, { total: number; read: number }> = {};
  for (const book of library) {
    if (!categories[book.category]) {
      categories[book.category] = { total: 0, read: 0 };
    }
    categories[book.category].total++;
    if (alreadyRead.has(book.id)) {
      categories[book.category].read++;
    }
  }

  return {
    total: library.length,
    read: alreadyRead.size,
    unread: library.length - alreadyRead.size,
    categories,
  };
}

/**
 * Add a custom book to the library at runtime (from admin upload)
 * This processes it immediately
 */
export async function addAndReadCustomBook(
  title: string,
  content: string,
  category: LibraryBook['category'] = 'general',
): Promise<DocumentReadResult> {
  console.log(`[Library] 📖 Admin uploaded new book: "${title}"`);
  return processDocument(content, title, `upload:${category}`);
}

/**
 * Reset all "already read" markers so every built-in book will be re-read
 * in upcoming brain cycles. Deletes stable `library_book:*` markers from DB
 * and clears the in-memory cache. Use from the admin force-relearn endpoint.
 */
export async function resetLibraryReadState(): Promise<number> {
  const { rawSqlite } = await import('../db.js');
  const result = rawSqlite
    .prepare(`DELETE FROM mara_knowledge_base WHERE topic LIKE 'library_book:%' OR topic LIKE 'Document:%'`)
    .run();
  readBookIds.clear();
  console.log(`[Library] 🔄 Reset read state — deleted ${result.changes} markers, ${getBuiltInLibrary().length} books queued for re-read`);
  return result.changes;
}
