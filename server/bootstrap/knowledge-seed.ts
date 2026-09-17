import { storeKnowledge } from '../mara-brain/knowledge-base.js';

// One-time (dedup-guarded — see storeKnowledge's topic-similarity check, so
// repeat boots just bump confidence instead of duplicating) knowledge-base
// entry recording the Reels -> Sparks rebrand and everything connected to it,
// so Mara's own self-reflection has an explicit record of the change instead
// of only inferring it from current-state data (module registry, analyzers).
export async function seedSparksRebrandKnowledge(): Promise<void> {
  try {
    await storeKnowledge(
      'platform_insight',
      'Reels a devenit Sparks',
      [
        'Modulul Reels a fost redenumit Sparks (owner-ul a ales acest nume explicit).',
        'Sparks nu mai concurează direct cu TikTok/Instagram — e reconectat la',
        'diferențiatorul real al platformei: Missions, Writers Hub și You.',
        '',
        'Ce s-a schimbat concret:',
        '- Missions: la finalul unei misiuni completate, un buton "Share as Spark"',
        '  creează un Spark din dovada foto/video + feedback-ul Marei',
        '  (POST /api/missions/:userMissionId/share-as-spark).',
        '- Writers Hub: după publicarea unui articol, autorul poate înregistra un',
        '  "trailer" scurt care promovează articolul (reutilizează',
        '  /api/reels/upload cu sourceKind=writers).',
        '- Postare de linkuri externe (opțional): YouTube și TikTok, prin oEmbed',
        '  legitim (POST /api/reels/link) — niciodată nu descărcăm/reginăzduim',
        '  videoclipul, doar linkul + metadate oficiale. Numele brandurilor nu',
        '  apar niciodată în copy-ul nostru propriu (doar playerul lor, în afara',
        '  controlului nostru, își arată branding-ul nativ).',
        '- Creator Panel a primit un panou nou "Growth Path": progres vizibil spre',
        '  pragul de 1000 followeri (100/250/500/1000), tendință săptămânală de',
        '  followeri, o sugestie de misiune pentru consistență (nu un truc de',
        '  creștere a audienței — Missions e un sistem de dezvoltare personală).',
        '  Endpoint-ul GET /api/creator/growth-path e deliberat NEBLOCAT de',
        '  pragul de 1000 followeri, ca să ajute exact pe cei care nu au ajuns',
        '  încă acolo.',
        '- Nouă rută reală /profile/:id (UserProfile nu mai e doar un modal local',
        '  în You) — numele creatorilor din Sparks și autorii din Writers Hub sunt',
        '  acum clickabile spre profil, iar un follow de acolo poate fi atribuit',
        '  sursei (sourceKind spark/writers pe tabela followers).',
        '',
        'Bug-uri reale găsite și reparate cu ocazia asta:',
        '- Feed-ul Sparks arăta "Creator" pentru toată lumea — getReelsFeed nu',
        '  făcea niciodată join cu users, deci numele afișat nu exista niciodată.',
        '- Analizoarele de creștere ale Marei (module-analyzers.ts) filtrau',
        '  videos.type după \'reel\'/\'reels\' — valori pe care niciun cod nu le-a',
        '  scris vreodată; Sparks reale folosesc \'creator\', \'mission-spark\',',
        '  \'writers-trailer\', \'external-link\'. Analiza raporta practic zero',
        '  Sparks tot timpul asta.',
        '- Health grid-ul din Control Center (hellomara-module-registry.ts)',
        '  putea marca un modul "error" din cauza unui task EȘUAT complet',
        '  neînrudit (ex. un ciclu de learning), pentru că fallback-ul de',
        '  potrivire după titlu făcea substring match fără graniță de cuvânt —',
        '  modulul "You" era cel mai expus, orice titlu care conținea cuvântul',
        '  "you" se atașa greșit lui. Reparat: fallback-ul acum cere graniță de',
        '  cuvânt și se aplică doar task-urilor cu source=\'control\' (singurele',
        '  care chiar pot purta un moduleId real).',
        '',
        'Toate schimbările sunt live pe hellomara.net, verificate una câte una',
        '(typecheck + build + deploy + verificare live) — nu doar descrise.',
      ].join('\n'),
      'self_reflection',
      90,
      { module: 'reels', renamedTo: 'sparks', scope: ['missions', 'writers-hub', 'creators', 'you', 'control-center'] },
    );
    console.log('[knowledge-seed] Sparks rebrand summary recorded');
  } catch (err) {
    console.error('[knowledge-seed] Sparks rebrand summary failed (continuing):', err);
  }
}
