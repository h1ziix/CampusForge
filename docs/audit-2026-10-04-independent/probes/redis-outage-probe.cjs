/* Execute actual queue.ts with installed BullMQ/ioredis against an isolated
 * loopback TCP server that immediately closes connections. No Redis commands
 * can reach a Redis server; no .env is loaded and no queue data is written.
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const net = require('node:net');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const IORedis = require(path.join(root, 'apps/web/node_modules/ioredis'));
const { Queue } = require(path.join(root, 'apps/web/node_modules/bullmq'));
const clients = [];
const queues = [];
const observedErrors = [];
class TrackedIORedis extends IORedis {
  constructor(...args) { super(...args); clients.push(this); this.on('error', e => observedErrors.push(e.code || e.message)); }
}
class TrackedQueue extends Queue {
  constructor(...args) { super(...args); queues.push(this); this.on('error', e => observedErrors.push(e.code || e.message)); }
}
async function main() {
  let connections = 0;
  const refusal = net.createServer(socket => { connections++; socket.destroy(); });
  await new Promise(resolve => refusal.listen(0, '127.0.0.1', resolve));
  const port = refusal.address().port;
  const module = { exports: {} };
  const filename = path.join(root, 'apps/web/src/lib/queue.ts');
  const js = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const context = vm.createContext({ module, exports: module.exports, process: { env: { REDIS_URL: `redis://127.0.0.1:${port}` } }, require: id => {
    if (id === 'bullmq') return { Queue: TrackedQueue };
    if (id === 'ioredis') return TrackedIORedis;
    throw new Error(`unmocked import ${id}`);
  }, console: { log() {}, warn() {}, error() {} } });
  new vm.Script(js, { filename }).runInContext(context);
  let outcome = 'pending';
  const start = Date.now();
  module.exports.enqueueDocumentParsing('audit-synthetic-document').then(() => outcome = 'resolved', () => outcome = 'rejected');
  await new Promise(resolve => setTimeout(resolve, 1500));
  const output = { executedAt: new Date().toISOString(), source: 'apps/web/src/lib/queue.ts', libraries: { bullmq: require(path.join(root, 'apps/web/node_modules/bullmq/package.json')).version, ioredis: require(path.join(root, 'apps/web/node_modules/ioredis/package.json')).version }, endpoint: 'isolated loopback close-only TCP server; no real Redis', elapsedMs: Date.now() - start, connectionAttempts: connections, enqueueOutcome: outcome, maxRetriesPerRequest: clients[0].options.maxRetriesPerRequest, enableOfflineQueue: clients[0].options.enableOfflineQueue, actualRedisWrites: 0 };
  for (const client of clients) client.disconnect(false);
  for (const queue of queues) await queue.close();
  await new Promise(resolve => refusal.close(resolve));
  process.stdout.write(JSON.stringify(output, null, 2) + '\n');
  if (outcome !== 'pending') process.exitCode = 1;
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
