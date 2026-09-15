import assert from 'node:assert/strict';
import process from 'node:process';
import { executeControlledProcess } from '../server/services/controlled-execution.js';

const cwd = process.cwd();
const node = process.execPath;
const run = (args: string[], label: string, timeoutMs = 2_000) => executeControlledProcess({
  command: `test.${label}`,
  executable: node,
  args,
  cwd,
  timeoutMs,
  taskId: 0,
});

const success = await run(['-e', "process.stdout.write('ok')"], 'success');
assert.equal(success.started, true);
assert.equal(success.state, 'COMPLETED');
assert.equal(success.exitCode, 0);
assert.equal(success.stdout, 'ok');
assert.equal(success.errorClass, 'none');
assert.ok(success.artifactPath);

const nonZero = await run(['-e', "process.stderr.write('bad'); process.exit(7)"], 'nonzero');
assert.equal(nonZero.started, true);
assert.equal(nonZero.state, 'FAILED');
assert.equal(nonZero.exitCode, 7);
assert.equal(nonZero.stderr, 'bad');
assert.equal(nonZero.errorClass, 'non_zero_exit');
assert.ok(nonZero.artifactPath);

const failedStart = await executeControlledProcess({ command: 'test.failed-start', executable: `${node}.missing`, args: [], cwd, taskId: 0 });
assert.equal(failedStart.started, false);
assert.equal(failedStart.state, 'FAILED_TO_START');
assert.equal(failedStart.exitCode, null);
assert.equal(failedStart.errorClass, 'failed_to_start');
assert.ok(failedStart.artifactPath);

const timedOut = await run(['-e', 'setTimeout(() => {}, 5000)'], 'timeout', 50);
assert.equal(timedOut.started, true);
assert.equal(timedOut.timedOut, true);
assert.equal(timedOut.state, 'TIMED_OUT');
assert.equal(timedOut.errorClass, 'timeout');

const outputLimit = await run(['-e', "process.stdout.write('x'.repeat(300000))"], 'output');
assert.equal(outputLimit.started, true);
assert.ok(outputLimit.stdout.length <= 200000);
assert.equal(outputLimit.exitCode, 0);

console.log('controlled execution contract tests passed');
