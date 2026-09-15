import assert from 'node:assert/strict';
import { parseExperimentDecision } from '../server/mara-brain/experiment-decision-parser.js';
import { classifyTaskRisk } from '../server/services/task-policy.js';
import { permissionForRisk } from '../server/services/permission-policy.js';
import { isKnownToolType, requiredRiskForTool } from '../server/services/tool-policy.js';
import { canTransitionTask, transitionTask } from '../server/services/task-lifecycle.js';

const parsed = parseExperimentDecision(
  { params: { id: '42' }, body: { note: 'Review funnel evidence' }, user: { email: 'admin@example.com' } },
  'approved',
);
assert.deepEqual(parsed, {
  ok: true,
  id: 42,
  decidedBy: 'admin@example.com',
  note: 'Review funnel evidence',
  decision: 'approved',
});

assert.deepEqual(
  parseExperimentDecision({ params: { id: 'invalid' } }, 'rejected'),
  { ok: false, error: 'Invalid experiment id' },
);

assert.deepEqual(
  parseExperimentDecision({ params: { id: 7 }, user: {} }, 'rejected'),
  { ok: true, id: 7, decidedBy: 'unknown-admin', decision: 'rejected' },
);

assert.equal(classifyTaskRisk('learning', 'RUNNING'), 'LOW_RISK');
assert.equal(classifyTaskRisk('p2p', 'RUNNING'), 'MODERATE_RISK');
assert.equal(classifyTaskRisk('growth_experiment', 'WAITING_APPROVAL'), 'HIGH_RISK');
assert.equal(classifyTaskRisk('learning', 'COMPLETED'), 'READ_ONLY');
assert.equal(permissionForRisk('READ_ONLY').approvalRequired, false);
assert.equal(permissionForRisk('MODERATE_RISK').approvalRequired, true);
assert.equal(permissionForRisk('CRITICAL').level, 'CRITICAL');
assert.deepEqual(permissionForRisk('HIGH_RISK'), {
  level: 'HIGH_RISK',
  approvalRequired: true,
  reason: 'Requires explicit administrative approval.',
});
assert.equal(requiredRiskForTool('git.commit_staged'), 'HIGH_RISK');
assert.equal(requiredRiskForTool('project.typecheck'), 'LOW_RISK');
assert.equal(isKnownToolType('arbitrary.shell'), false);
assert.equal(canTransitionTask('QUEUED', 'PLANNING'), true);
assert.equal(canTransitionTask('COMPLETED', 'RUNNING'), false);
assert.equal(transitionTask('WAITING_APPROVAL', 'PLANNING'), 'PLANNING');
assert.throws(() => transitionTask('CANCELLED', 'RUNNING'), /Invalid task transition/);

console.log('control capability parser tests passed');