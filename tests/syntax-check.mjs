// Fails if any extension script has a syntax error or the manifest is invalid JSON.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = new URL('../extension/', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === 'vendor') continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.js')) files.push(p);
  }
})(root);

let failed = 0;
for (const f of files) {
  try { execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' }); }
  catch (e) { failed++; console.log('FAIL', f, e.stderr.toString()); }
}
JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
console.log(`${files.length - failed}/${files.length} scripts OK, manifest OK`);
process.exit(failed ? 1 : 0);
