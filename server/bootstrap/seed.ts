import { seedPlans } from '../billing/seed.js';
import { seedDefaultObjective } from '../mara-core/objective.js';
import { seedMissions, seedMissionTranslations } from '../missions/seed.js';
import { warmTranslationCache } from '../missions/engine.js';
import { seedSparksRebrandKnowledge } from './knowledge-seed.js';
import { fixMalformedYouTubeVideoUrls, flagVideosWithUnplayableUrls } from './fix-video-urls.js';

export async function runBootstrapSeeders(): Promise<void> {
  try {
    await seedPlans();
    console.log('[billing] plans seeded');
  } catch (err) {
    console.error('[billing] seed failed:', err);
    throw err;
  }

  try {
    seedMissions();
    console.log('[missions] catalogue seeded');
  } catch (err) {
    console.error('[missions] seed failed (continuing):', err);
  }

  try {
    seedMissionTranslations();
  } catch (err) {
    console.error('[missions] translation seed failed (continuing):', err);
  }

  warmTranslationCache(['en']).catch((err) =>
    console.warn('[missions:warm] startup warm failed:', (err as Error).message),
  );

  try {
    seedDefaultObjective();
  } catch (err) {
    console.error('[mara-core] objective seed failed (continuing):', err);
  }

  await seedSparksRebrandKnowledge();

  try {
    fixMalformedYouTubeVideoUrls();
  } catch (err) {
    console.error('[bootstrap] youtube URL fix failed (continuing):', err);
  }

  try {
    flagVideosWithUnplayableUrls();
  } catch (err) {
    console.error('[bootstrap] unplayable-video flag failed (continuing):', err);
  }
}
