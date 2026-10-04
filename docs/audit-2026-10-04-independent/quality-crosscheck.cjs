// Read-only cross-check of main checkout's type resolution and clean snapshot.
// No node_modules/source changes. Virtual host aliases exist only in this process.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const nextTypes = webRequire.resolve('next/types/index.d.ts');
const configPath = path.join(root, 'apps/web/tsconfig.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, path.dirname(configPath));
const mappings = ['react', 'react-dom'].map((name) => ({
  name,
  virtual: path.join(root, 'node_modules/.pnpm/node_modules/@types', name),
  actual: fs.realpathSync(path.join(root, 'apps/web/node_modules/@types', name)),
}));
function alias(file) {
  const normalized = path.normalize(file);
  for (const entry of mappings) {
    if (normalized === entry.virtual || normalized.startsWith(entry.virtual + path.sep))
      return entry.actual + normalized.slice(entry.virtual.length);
  }
  return file;
}
const virtualSys = {
  ...ts.sys,
  fileExists: (f) => ts.sys.fileExists(alias(f)),
  directoryExists: (f) => ts.sys.directoryExists(alias(f)),
  readFile: (f) => ts.sys.readFile(alias(f)),
  realpath: (f) => ts.sys.realpath(alias(f)),
  getDirectories: (f) => ts.sys.getDirectories(alias(f)),
};
function check(hostSys) {
  const resolved = ts.resolveTypeReferenceDirective('react/experimental', nextTypes, config.options, hostSys).resolvedTypeReferenceDirective;
  const host = ts.createCompilerHost(config.options);
  for (const key of ['fileExists', 'directoryExists', 'readFile', 'realpath', 'getDirectories']) host[key] = hostSys[key];
  const program = ts.createProgram(config.fileNames, { ...config.options, incremental: false }, host);
  const diagnostics = ts.getPreEmitDiagnostics(program).map((d) => ({
    file: d.file ? path.relative(root, d.file.fileName) : null,
    code: d.code, text: ts.flattenDiagnosticMessageText(d.messageText, ' '),
  }));
  return { resolvedExperimental: resolved?.resolvedFileName ?? null, diagnostics };
}
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'evidence/clean-snapshot.json'), 'utf8'));
const snapshotMismatches = { main: [], clean: [] };
for (const entry of snapshot.inventory) {
  for (const [label, base] of [['main', root], ['clean', snapshot.target]]) {
    const f = path.join(base, entry.path);
    const hash = fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null;
    if (hash !== entry.sha256) snapshotMismatches[label].push({ path: entry.path, exists: hash !== null });
  }
}
const result = {
  method: 'read-only actual TypeScript compiler + virtual in-memory @types directory aliases',
  typescriptVersion: ts.version,
  installedTypes: mappings.map((entry) => ({ ...entry,
    hoistedEntryIsDirectory: fs.lstatSync(entry.virtual).isDirectory(),
    hoistedEntryIsSymlink: fs.lstatSync(entry.virtual).isSymbolicLink(),
    hoistedFiles: fs.readdirSync(entry.virtual),
    directExperimentalPresent: fs.existsSync(path.join(entry.actual, 'experimental.d.ts')),
  })),
  original: check(ts.sys),
  virtualAliasOnly: check(virtualSys),
  snapshotFiles: snapshot.inventory.length,
  snapshotMismatches,
  productionOnlyExecutablesPresent: {
    webDotenv: fs.existsSync(path.join(snapshot.target, 'apps/web/node_modules/.bin/dotenv.CMD')),
    workerDotenv: fs.existsSync(path.join(snapshot.target, 'apps/worker/node_modules/.bin/dotenv.CMD')),
    workerTsx: fs.existsSync(path.join(snapshot.target, 'apps/worker/node_modules/.bin/tsx.CMD')),
  },
};
fs.writeFileSync(path.join(__dirname, 'evidence/quality-crosscheck.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
