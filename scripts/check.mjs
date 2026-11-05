import { readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
let count = 0;
async function check(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await check(path);
    else if (/\.(?:mjs|js)$/.test(entry.name)) {
      execFileSync(process.execPath, ['--check', path], { stdio: 'pipe' });
      count++;
    }
  }
}
for (const folder of ['server', 'scripts', 'public/js', 'tests']) await check(resolve(root, folder));
console.info(`Sintaxe verificada em ${count} arquivos JavaScript.`);
