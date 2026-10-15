import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const version = pkg.version;

const envLine = `VITE_APP_VERSION=${version}`;
const envContent = `# Sincronizado automáticamente desde package.json (v${version})\n# No editar manualmente: se sobrescribe en cada build/dev.\n${envLine}\n`;

for (const file of ['.env', '.env.production']) {
  const path = resolve(root, file);
  let existing = '';
  try {
    existing = readFileSync(path, 'utf8');
  } catch {
    existing = '';
  }
  const lines = existing.split('\n').filter((l) => !l.startsWith('VITE_APP_VERSION=') && !l.startsWith('# Sincronizado'));
  writeFileSync(path, [...lines, envContent].join('\n').trim() + '\n');
}

console.log(`✅ VITE_APP_VERSION sincronizado a ${version} en .env y .env.production`);