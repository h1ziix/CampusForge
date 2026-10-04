const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const root = process.cwd();
const target = fs.mkdtempSync(path.join(os.tmpdir(), 'campusforge-clean-audit-'));
const inventory = [];
const excluded = new Set(['node_modules', '.next', 'dist', '.turbo', '.git']);
function copy(relative) {
  const source = path.join(root, relative);
  const stat = fs.lstatSync(source);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    fs.mkdirSync(path.join(target, relative), { recursive: true });
    for (const name of fs.readdirSync(source)) {
      if (excluded.has(name) || name.endsWith('.tsbuildinfo') || (name.startsWith('.env') && name !== '.env.example')) continue;
      copy(path.join(relative, name));
    }
  } else {
    fs.mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
    fs.copyFileSync(source, path.join(target, relative));
    inventory.push({ path: relative.replaceAll('\\', '/'), sha256: crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex') });
  }
}
for (const entry of ['apps', 'packages', 'infra', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'turbo.json', 'tsconfig.json', '.env.example', '.npmrc', '.nvmrc', '.prettierrc', '.gitignore']) copy(entry);
fs.writeFileSync(path.join(root, 'docs/audit-2026-10-04-independent/evidence/clean-snapshot.json'), JSON.stringify({ target, envCopied: false, inventory }, null, 2));
console.log(JSON.stringify({ target, files: inventory.length, envCopied: false }));
