import assert from 'node:assert/strict';
import { createDryRunContext, withBrainRunContext, getBrainRunContext, assertPersistentWriteAllowed } from '../server/mara-brain/run-context.js';
import { storeKnowledge, searchKnowledge } from '../server/mara-brain/knowledge-base.js';
import { researchTopic } from '../server/mara-brain/agents/web-research.js';

const context = createDryRunContext();
await withBrainRunContext(context, async () => {
  const firstId = await storeKnowledge('llm_learning', 'dry-run topic', 'local knowledge', 'llm');
  const secondId = await storeKnowledge('llm_learning', 'dry-run topic', 'local knowledge', 'llm');
  assert.equal(firstId, secondId, 'knowledge sink should deduplicate');
  assert.equal(context.knowledge.length, 1);
  assert.equal((await searchKnowledge('dry-run')).length, 1);

  const research = await researchTopic('blocked external topic');
  assert.equal(research.source, 'research_unavailable_dry_run');
  assert.equal(context.researchUnavailable, 1);
  assert.equal(getBrainRunContext(), context);

  assert.throws(
    () => assertPersistentWriteAllowed('test-write'),
    /Persistent write not intercepted/,
  );
});

assert.equal(getBrainRunContext(), undefined);
console.log('brain dry-run sink and guard tests passed');
