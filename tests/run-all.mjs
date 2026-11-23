// Runs every test file in sequence. Usage: node tests/run-all.mjs
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const t of ['sfx.test.mjs', 'resize.test.mjs', 'sprites.test.mjs', 'pages.test.mjs']) {
  console.log(`\n=== ${t} ===`);
  const r = spawnSync(process.execPath, [path.join(dir, t)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
console.log(failed ? `\n${failed} test file(s) failed` : '\nALL TEST FILES PASSED');
process.exit(failed ? 1 : 0);
