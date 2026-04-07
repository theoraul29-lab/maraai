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
