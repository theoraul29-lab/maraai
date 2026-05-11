// Mara Library — Collection of knowledge sources for autonomous reading
// Mara reads from this library during brain cycles, BEFORE and DURING user activity

import { processDocument, processDocumentBatch, type DocumentReadResult } from './agents/document-reader.js';
import { getKnowledgeStats, searchKnowledge } from './knowledge-base.js';
import { storage } from '../storage.js';

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
  ];
}

/**
 * Check which books from the library Mara has already read
 */
async function getReadBookIds(): Promise<Set<string>> {
  const existing = await searchKnowledge('Document:', 100);
  const ids = new Set<string>();
  for (const entry of existing) {
    if (entry.topic.startsWith('Document: ')) {
      // Match book title to library ID
      const title = entry.topic.replace('Document: ', '');
      const book = getBuiltInLibrary().find((b) => b.title === title);
      if (book) ids.add(book.id);
    }
  }
  // Also merge runtime tracking
  const runtimeIds = Array.from(readBookIds);
  for (const id of runtimeIds) {
    ids.add(id);
  }
  return ids;
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

/**
 * Read the next book from the library — called during brain cycle
 * Reads one book per cycle to stay within rate limits
 */
export async function readNextLibraryBook(): Promise<DocumentReadResult | null> {
  const book = await getNextUnreadBook();
  if (!book) {
    console.log('[Library] 📚 All library books have been read!');
    return null;
  }

  console.log(`[Library] 📚 Reading: "${book.title}" [${book.category}]`);
  const result = await processDocument(book.content, book.title, `library:${book.category}`);
  readBookIds.add(book.id);
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
