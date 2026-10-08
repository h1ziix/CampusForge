import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

export const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(resolve(root, 'apps/web/package.json'));
const ts = require('typescript');

// Actual TS application functions, with explicit dependency boundaries. The DB,
// AI providers, auth, and S3 may only be supplied by the caller; no .env is read.
export function applicationLoader(mocks = {}, environment = {}, globals = {}) {
  const cache = new Map();
  const logs = [];
  const load = (relative) => {
    const path = resolve(root, relative);
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      fileName: path,
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText;
    vm.runInNewContext(
      compiled,
      {
        module,
        exports: module.exports,
        Buffer,
        File,
        FormData,
        Request,
        Response,
        Headers,
        URL,
        ReadableStream,
        TextDecoder,
        TextEncoder,
        AbortController,
        AbortSignal,
        Date,
        performance,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        process: { env: environment },
        console: Object.fromEntries(
          ['log', 'warn', 'error'].map((name) => [
            name,
            (...args) => logs.push(args.map(String).join(' ')),
          ]),
        ),
        require(name) {
          if (Object.hasOwn(mocks, name)) return mocks[name];
          if (name.startsWith('node:')) return require(name);
          if (name.startsWith('@/')) return load(`apps/web/src/${name.slice(2)}.ts`);
          if (name.startsWith('.')) {
            const resolved = resolve(dirname(path), name);
            for (const extension of ['.ts', '.mjs', '/index.ts'])
              if (existsSync(`${resolved}${extension}`)) return load(`${resolved}${extension}`);
          }
          if (['next/server', 'zod', 'ioredis', 'bullmq'].includes(name)) return require(name);
          throw new Error(`R3 blocked unprovided dependency ${name} in ${relative}`);
        },
        ...globals,
      },
      { filename: path },
    );
    return module.exports;
  };
  return { load, logs };
}

export function deferred() {
  let resolvePromise, rejectPromise;
  const promise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}
