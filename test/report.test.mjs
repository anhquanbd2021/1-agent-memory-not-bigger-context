import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const run = promisify(execFile);

test('report exits 0 and prints the side-by-side verdicts', async () => {
  const { stdout } = await run(process.execPath, [`${root}scripts/report.mjs`]);
  assert.match(stdout, /Memory Gate — transcript report/);
  assert.match(stdout, /naive/);
  assert.match(stdout, /gated/);
  assert.match(stdout, /PENDING/);
  assert.match(stdout, /DROPPED/);
  assert.match(stdout, /All invariants hold/);
});
