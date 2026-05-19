import { rawSqlite } from '../db.js';

const MISSIONS = [
  {
    id: 'disc-001', title: 'Trezește-te cu 1 oră mai devreme',
    description: 'Dimineața îți aparține înainte să aparțină lumii. Trezește-te cu o oră mai devreme și folosește acel timp doar pentru tine.',
    pillar: 'discipline', difficulty: 'medium', xp_reward: 200,
    proof_type: 'text', proof_prompt: 'Scrie ce ai făcut în acea oră și cum te-ai simțit.',
    steps: JSON.stringify(['Setează alarma cu 1h mai devreme', 'Rezistă tentației de a dormi mai mult', 'Fă ceva doar pentru tine în acea oră']),
    reflection: 'Ce ai descoperit despre tine în liniștea dimineții?', is_daily: 0,
  },
  {
    id: 'disc-002', title: '24h fără social media',
    description: 'O zi întreagă fără scroll. Observă ce apare când nu mai ești distras.',
    pillar: 'discipline', difficulty: 'medium', xp_reward: 250,
    proof_type: 'screenshot', proof_prompt: 'Screenshot cu Screen Time care arată 0 minute.',
    steps: JSON.stringify(['Șterge temporar aplicațiile', 'Notifică prietenii că ești offline', 'Observă ce simți când ai impulsul de a deschide telefonul']),
    reflection: 'Ce ai făcut cu timpul câștigat?', is_daily: 0,
  },
  {
    id: 'disc-003', title: '7 zile consecutive de sport',
    description: '20 minute de mișcare pe zi, 7 zile la rând. Orice formă contează.',
    pillar: 'discipline', difficulty: 'deep', xp_reward: 500,
    proof_type: 'photo', proof_prompt: 'Foto sau screenshot din aplicația de fitness în ziua 7.',
    steps: JSON.stringify(['Alege o activitate plăcută', 'Programează fix în calendar', 'Nu rata nicio zi']),
    reflection: 'Cum s-a schimbat energia ta în cele 7 zile?', is_daily: 0,
  },
  {
    id: 'creat-001', title: 'Creează ceva cu mâinile tale',
    description: 'Un desen, o sculptură, o poză cu intenție. Contează procesul, nu rezultatul.',
    pillar: 'creativity', difficulty: 'gentle', xp_reward: 150,
    proof_type: 'photo', proof_prompt: 'Foto cu ce ai creat.',
    steps: JSON.stringify(['Alege materialul', 'Fă fără să judeci', 'Bucură-te de proces']),
    reflection: 'Ce ai exprimat fără să îți dai seama?', is_daily: 0,
  },
  {
    id: 'creat-002', title: 'Scrie o scrisoare viitorului tău eu',
    description: 'Scrie-i celui care vei fi peste 1 an. Spune-i ce speri, ce te temi, ce înveți.',
    pillar: 'creativity', difficulty: 'gentle', xp_reward: 200,
    proof_type: 'text', proof_prompt: 'Lipește scrisoarea sau un fragment din ea.',
    steps: JSON.stringify(['Găsește 20 minute de liniște', 'Scrie fără să editezi', 'Sigilează și păstrează pentru 1 an']),
    reflection: 'Ce ți-ai dori cel mai mult să știi peste un an?', is_daily: 0,
  },
  {
    id: 'creat-003', title: 'Fotografiază frumusețea obișnuitului',
    description: 'Mergi 30 minute și fotografiază lucruri obișnuite care au ceva special.',
    pillar: 'creativity', difficulty: 'gentle', xp_reward: 120,
    proof_type: 'photo', proof_prompt: 'Postează cea mai frumoasă fotografie.',
    steps: JSON.stringify(['Ieși fără destinație precisă', 'Privește ca și cum ai vedea totul prima dată', 'Fotografiază ce îți atrage atenția']),
    reflection: 'Ce ai observat ce de obicei trece nevăzut?', is_daily: 0,
  },
  {
    id: 'life-001', title: 'O masă gătită cu intenție',
    description: 'Gătește ceva de la zero, fără grabă. Fii prezent în fiecare pas.',
    pillar: 'life', difficulty: 'gentle', xp_reward: 130,
    proof_type: 'photo', proof_prompt: 'Foto cu masa pregătită.',
    steps: JSON.stringify(['Alege o rețetă nouă', 'Cumpără ingredientele conștient', 'Gătește fără telefon sau TV']),
    reflection: 'Cum a fost să fii complet prezent în bucătărie?', is_daily: 0,
  },
  {
    id: 'life-002', title: 'Sună pe cineva drag fără motiv',
    description: 'Nu un mesaj text — un apel real. Povestiți fără grabă.',
    pillar: 'life', difficulty: 'gentle', xp_reward: 100,
    proof_type: 'text', proof_prompt: 'Scrie cum a fost acea conversație.',
    steps: JSON.stringify(['Gândește-te la cineva cu care nu ai vorbit de mult', 'Sună fără un anume scop', 'Fii prezent în conversație']),
    reflection: 'Ce conexiune ai simțit?', is_daily: 0,
  },
  {
    id: 'life-003', title: '30 minute în natură — fără telefon',
    description: 'Mergi afară și lasă telefonul acasă. Observă. Ascultă. Fii.',
    pillar: 'life', difficulty: 'gentle', xp_reward: 150,
    proof_type: 'text', proof_prompt: 'Scrie ce ai observat, auzit sau simțit.',
    steps: JSON.stringify(['Lasă telefonul acasă', 'Mergi fără destinație', 'Observă cu toți simții']),
    reflection: 'Când ai simțit ultima dată prezența deplină în natură?', is_daily: 0,
  },
  {
    id: 'acc-001', title: 'Scrisoarea de iertare față de tine',
    description: 'Scrie-ți o scrisoare de iertare pentru ceva din trecut pe care îl mai porți.',
    pillar: 'acceptance', difficulty: 'deep', xp_reward: 400,
    proof_type: 'text', proof_prompt: 'Scrie un fragment sau cum te-ai simțit scriind-o.',
    steps: JSON.stringify(['Alege ceva din trecut pe care nu te-ai iertat', 'Scrie ca și cum i-ai scrie unui prieten', 'Citește-o cu blândețe']),
    reflection: 'Ce s-a schimbat în tine după ce ai scris-o?', is_daily: 0,
  },
  {
    id: 'acc-002', title: '3 lucruri pe care le accept la mine',
    description: 'Nu calitățile — lucruri pe care le vezi ca defecte și alegi să le accepți.',
    pillar: 'acceptance', difficulty: 'medium', xp_reward: 200,
    proof_type: 'text', proof_prompt: 'Scrie cele 3 lucruri și de ce alegi să le accepți.',
    steps: JSON.stringify(['Stai cu tine în liniște 5 minute', 'Scrie fără să judeci', 'Citește cu voce tare']),
    reflection: 'Cum te-ai simțit spunând aceste lucruri cu blândețe?', is_daily: 0,
  },
  {
    id: 'help-001', title: 'Fă un gest neașteptat pentru un străin',
    description: 'Cumpără o cafea, ține ușa, spune ceva frumos. Fără să speri la nimic în schimb.',
    pillar: 'helping', difficulty: 'gentle', xp_reward: 150,
    proof_type: 'text', proof_prompt: 'Povestește ce s-a întâmplat și cum te-ai simțit.',
    steps: JSON.stringify(['Rămâi atent la cei din jur azi', 'Alege un gest mic dar sincer', 'Fă-l fără să îl menționezi altcuiva']),
    reflection: 'Ce ai simțit dând fără să aștepți nimic?', is_daily: 0,
  },
  {
    id: 'help-002', title: 'Ascultă cu adevărat pe cineva',
    description: 'Găsește pe cineva care are nevoie să fie ascultat. Nu da sfaturi. Doar ascultă.',
    pillar: 'helping', difficulty: 'medium', xp_reward: 200,
    proof_type: 'text', proof_prompt: 'Cum a fost să asculți fără să intervii?',
    steps: JSON.stringify(['Alege pe cineva care pare că are ceva pe suflet', 'Întreabă-l cum e și ascultă', 'Rezistă impulsului de a oferi soluții']),
    reflection: 'Ce ai aflat despre această persoană pe care nu știai?', is_daily: 0,
  },
  {
    id: 'self-001', title: 'Ce valori îți ghidează viața?',
    description: 'Scrie primele 5 valori fără să gândești prea mult. Întreabă-te: trăiești conform lor?',
    pillar: 'self', difficulty: 'medium', xp_reward: 250,
    proof_type: 'text', proof_prompt: 'Scrie valorile și o reflecție despre cât de prezente sunt.',
    steps: JSON.stringify(['Scrie 5 valori în 2 minute', 'Nu edita, nu gândi prea mult', 'Reflectează: care e cea mai neglijată?']),
    reflection: 'Dacă viața ta ar fi un film, ce valoare ar fi tema centrală?', is_daily: 0,
  },
  {
    id: 'self-002', title: 'Ce te face pe tine fericit?',
    description: 'Nu ce ar trebui să te facă fericit. Ce TE face pe TINE fericit.',
    pillar: 'self', difficulty: 'deep', xp_reward: 300,
    proof_type: 'text', proof_prompt: 'Listează 10 lucruri și alege cel mai important.',
    steps: JSON.stringify(['Scrie rapid 10 lucruri care îți aduc bucurie', 'Nu censura nimic', 'Întreabă-te: câte din ele faci regulat?']),
    reflection: 'Cât de des îți permiți să faci ceea ce te face fericit?', is_daily: 0,
  },
  {
    id: 'hobby-001', title: 'Încearcă ceva ce nu ai mai făcut niciodată',
    description: 'Ieși din zona de confort plăcut. Dă-i minim 30 minute.',
    pillar: 'hobby', difficulty: 'medium', xp_reward: 300,
    proof_type: 'photo', proof_prompt: 'Foto din timpul activității sau după.',
    steps: JSON.stringify(['Alege ceva complet nou', 'Dă-i minim 30 minute', 'Nu judeca dacă nu ești bun de prima dată']),
    reflection: 'Ai simțit că ai descoperit ceva despre tine?', is_daily: 0,
  },
  {
    id: 'hobby-002', title: 'Reînvie un hobby abandonat',
    description: 'Ceva ce iubeai cândva și ai lăsat baltă. Readuce-l la viață pentru o zi.',
    pillar: 'hobby', difficulty: 'gentle', xp_reward: 200,
    proof_type: 'any', proof_prompt: 'Orice dovadă — foto, text, video.',
    steps: JSON.stringify(['Gândește-te la ce îți plăcea în copilărie', 'Alocă 1h pentru acel hobby', 'Observă cum te simți revenind']),
    reflection: 'De ce l-ai abandonat? Ce l-a adus înapoi?', is_daily: 0,
  },
  {
    id: 'daily-001', title: 'Check-in cu tine însuți',
    description: 'Cum ești azi — cu adevărat? 2 minute de onestitate cu tine.',
    pillar: 'self', difficulty: 'gentle', xp_reward: 30,
    proof_type: 'text', proof_prompt: 'Scrie un cuvânt sau o propoziție despre cum ești azi.',
    steps: JSON.stringify(['Stai cu tine 2 minute', 'Fii complet onest', 'Nu există răspuns greșit']),
    reflection: null, is_daily: 1,
  },
  {
    id: 'daily-002', title: '3 lucruri pentru care ești recunoscător',
    description: 'Nu ceva generic — ceva specific de azi.',
    pillar: 'acceptance', difficulty: 'gentle', xp_reward: 40,
    proof_type: 'text', proof_prompt: 'Scrie cele 3 lucruri.',
    steps: JSON.stringify(['Gândește-te la ziua de azi', 'Alege 3 lucruri concrete și specifice', 'Scrie-le']),
    reflection: null, is_daily: 1,
  },
];

const insertMission = rawSqlite.prepare(`
  INSERT OR IGNORE INTO missions (
    id, title, description, pillar, difficulty, xp_reward,
    proof_type, proof_prompt, steps, reflection, is_active, is_daily
  ) VALUES (
    @id, @title, @description, @pillar, @difficulty, @xp_reward,
    @proof_type, @proof_prompt, @steps, @reflection, 1, @is_daily
  )
`);

export function seedMissions(): void {
  console.log('[missions] Seeding missions...');
  const insert = rawSqlite.transaction(() => {
    for (const m of MISSIONS) {
      insertMission.run({
        id: m.id,
        title: m.title,
        description: m.description,
        pillar: m.pillar,
        difficulty: m.difficulty,
        xp_reward: m.xp_reward,
        proof_type: m.proof_type,
        proof_prompt: m.proof_prompt,
        steps: m.steps,
        reflection: m.reflection ?? null,
        is_daily: m.is_daily,
      });
    }
  });
  insert();
  console.log(`[missions] ✅ ${MISSIONS.length} misiuni seed-uite`);
}
