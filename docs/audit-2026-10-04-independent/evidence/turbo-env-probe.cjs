const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = process.cwd();
const meta = JSON.parse(fs.readFileSync(path.join(root, 'docs/audit-2026-10-04-independent/evidence/clean-snapshot.json')));
const target = meta.target;
if (!path.basename(target).startsWith('campusforge-clean-audit-') || fs.existsSync(path.join(target, '.env'))) throw Error('Expected isolated source snapshot without .env');
const workerFile = path.join(target, 'apps/worker/package.json');
const original = fs.readFileSync(workerFile, 'utf8');
const worker = JSON.parse(original);
const keys = ['DATABASE_URL', 'AUTH_SECRET', 'REDIS_URL', 'OPENAI_API_KEY', 'OPENAI_MODEL', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'];
const probeFile = path.join(target, 'apps/worker/audit-env-probe.cjs');
fs.writeFileSync(probeFile, 'console.log("AUDIT_ENV_PRESENCE="+JSON.stringify(Object.fromEntries('+JSON.stringify(keys)+'.map(k=>[k,Boolean(process.env[k])]))))');
worker.scripts.dev = 'node audit-env-probe.cjs';
let result;
try {
  fs.writeFileSync(workerFile, JSON.stringify(worker, null, 2));
  const env = {...process.env, NEXT_TELEMETRY_DISABLED: '1', ...Object.fromEntries(keys.map(k=>[k,'synthetic-audit']))};
  const output = cp.execSync('pnpm exec turbo run dev --filter=@campusforge/worker', {cwd:target, env, encoding:'utf8', timeout:30000});
  const match = output.match(/AUDIT_ENV_PRESENCE=(\{[^\n]+\})/);
  result = {noRootEnvFile:true, invokedThrough:'turbo dev --filter=@campusforge/worker', presence:JSON.parse(match[1])};
} finally {
  fs.writeFileSync(workerFile, original);
  fs.unlinkSync(probeFile);
}
fs.writeFileSync(path.join(root,'docs/audit-2026-10-04-independent/evidence/turbo-env-result.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
