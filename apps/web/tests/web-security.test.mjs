import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const web = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(resolve(web, 'package.json'));
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { NextRequest } = require('next/server');

// Actual application TS is executed; only infrastructure/auth boundaries are mocked.
function sourceLoader(mocks = {}, environment = { AUTH_URL: 'https://campusforge.example' }) {
  const cache = new Map();
  const load = (file) => {
    const absolute = resolve(web, 'src', file);
    if (cache.has(absolute)) return cache.get(absolute);
    const compiled = ts.transpileModule(readFileSync(absolute, 'utf8'), {
      fileName: absolute,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
    }).outputText;
    const module = { exports: {} };
    const imported = (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name.startsWith('@/')) return load(`${name.slice(2)}.ts`);
      return require(name);
    };
    vm.runInNewContext(compiled, {
      module,
      exports: module.exports,
      require: imported,
      URL,
      Headers,
      FormData,
      File,
      Buffer,
      setTimeout,
      clearTimeout,
      process: { env: environment },
      console,
    });
    cache.set(absolute, module.exports);
    return module.exports;
  };
  return load;
}

test('Markdown URL allowlist rejects executable, opaque and ambiguous URLs', () => {
  const { safeMarkdownUrl } = sourceLoader()('lib/markdown-url.ts');
  for (const url of [
    'javascript:window.__marker=1',
    'JaVaScRiPt:alert',
    'java\nscript:alert',
    'data:text/html,marker',
    'vbscript:marker',
    'file:///sensitive',
    'blob:https://example.com/id',
    '//example.invalid/path',
    '/\\example.invalid',
    '/%2fexample.invalid',
    '/%255cexample.invalid',
    '/%25250aevil',
    'javascript%3aalert',
    'https://example.com/%0dmarker',
    'https://example.com/%',
    'https://user:password@example.com',
    ' https://example.com',
    'mailto:student@example.com?body=marker',
  ]) {
    assert.equal(safeMarkdownUrl(url), null, url);
  }
  for (const url of [
    'https://example.com/notes?q=good#section',
    'https://example.com/notes%20folder?q=good%20value',
    'http://localhost:3000/notes',
    '/w/owned/notes?q=good#section',
    '#section',
    '?view=notes',
    'mailto:student@example.com',
  ]) {
    assert.equal(safeMarkdownUrl(url), url, url);
  }
});

test('actual Markdown renders rejected links as text, escapes HTML and protects external links', () => {
  const { Markdown } = sourceLoader()('components/assistant/markdown.tsx');
  const html = renderToStaticMarkup(
    React.createElement(Markdown, {
      content:
        '[unsafe](javascript:window.__marker=1) [opaque](data:text/html,marker)\n\n' +
        '[safe](https://example.com/notes)\n\n<img src=x onerror=window.__marker=1>',
    }),
  );
  assert.equal((html.match(/<a /g) ?? []).length, 1);
  assert.ok(html.includes('unsafe opaque'));
  assert.ok(html.includes('href="https://example.com/notes"'));
  assert.ok(html.includes('target="_blank"'));
  assert.ok(html.includes('rel="noopener noreferrer"'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img'));
});

test('upload Origin policy is exact, configured and independent of spoofed host headers', () => {
  const { isTrustedMutationOrigin } = sourceLoader()('lib/request-origin.ts');
  const env = { AUTH_URL: 'https://campusforge.example' };
  for (const origin of [
    null,
    'null',
    'https://attacker.example',
    'https://evil.campusforge.example',
    'http://campusforge.example',
    'https://campusforge.example:444',
    'https://campusforge.example/',
    'https://campusforge.example https://evil.example',
  ]) {
    const headers = new Headers({
      host: 'attacker.example',
      'x-forwarded-host': 'attacker.example',
    });
    if (origin) headers.set('origin', origin);
    assert.equal(isTrustedMutationOrigin(headers, env), false, String(origin));
  }
  const trusted = new Headers({ origin: env.AUTH_URL, 'sec-fetch-site': 'same-origin' });
  assert.equal(isTrustedMutationOrigin(trusted, env), true);
  assert.equal(isTrustedMutationOrigin(trusted, {}), false);
  assert.equal(isTrustedMutationOrigin(trusted, { NEXTAUTH_URL: env.AUTH_URL }), true);
  assert.equal(isTrustedMutationOrigin(trusted, { AUTH_URL: 'invalid' }), false);
  trusted.set('sec-fetch-site', 'same-site');
  assert.equal(isTrustedMutationOrigin(trusted, env), false);
});

function uploadFixture() {
  const calls = { auth: 0, membership: 0, createDocument: 0 };
  const state = { authenticated: true, member: true };
  const load = sourceLoader({
    '@/lib/auth': {
      auth() {
        calls.auth += 1;
        return state.authenticated ? { user: { id: 'synthetic-a' } } : null;
      },
    },
    '@campusforge/db': {
      prisma: {
        membership: {
          findUnique() {
            calls.membership += 1;
            return state.member ? { id: 'synthetic-member' } : null;
          },
        },
      },
    },
    '@campusforge/shared': (() => {
      const file = resolve(web, '../../packages/shared/src/schemas/document.ts');
      const compiled = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
      }).outputText;
      const module = { exports: {} };
      vm.runInNewContext(compiled, { module, exports: module.exports, require });
      return module.exports;
    })(),
    '@/server/services/document': {
      createDocument() {
        calls.createDocument += 1;
        return { ok: true, documentId: 'synthetic-doc' };
      },
    },
  });
  return {
    ...load('app/api/workspaces/[workspaceId]/documents/upload/route.ts'),
    calls,
    state,
    params: { params: Promise.resolve({ workspaceId: 'csyntheticworkspace000000001' }) },
  };
}

test('actual upload entrance rejects hostile/missing Origin before auth, DB and multipart', async () => {
  const fixture = uploadFixture();
  for (const origin of [null, 'https://attacker.example', 'https://evil.campusforge.example']) {
    const headers = { 'content-type': 'multipart/form-data; boundary=missing' };
    if (origin) headers.origin = origin;
    const response = await fixture.POST(
      new NextRequest('https://campusforge.example/api/workspaces/x/documents/upload', {
        method: 'POST',
        headers,
        body: 'intentionally malformed',
      }),
      fixture.params,
    );
    assert.equal(response.status, 403);
  }
  assert.deepEqual(fixture.calls, { auth: 0, membership: 0, createDocument: 0 });
});

test('actual same-origin upload preserves auth, membership and multipart lifecycle', async () => {
  const fixture = uploadFixture();
  const request = () => {
    const body = new FormData();
    body.set('file', new File(['Synthetic notes'], 'notes.txt', { type: 'text/plain' }));
    return new NextRequest('https://campusforge.example/api/workspaces/x/documents/upload', {
      method: 'POST',
      headers: { origin: 'https://campusforge.example' },
      body,
    });
  };
  fixture.state.authenticated = false;
  assert.equal((await fixture.POST(request(), fixture.params)).status, 401);
  fixture.state.authenticated = true;
  fixture.state.member = false;
  assert.equal((await fixture.POST(request(), fixture.params)).status, 403);
  assert.equal(fixture.calls.createDocument, 0);
  fixture.state.member = true;
  const response = await fixture.POST(request(), fixture.params);
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { documentId: 'synthetic-doc' });
  assert.equal(fixture.calls.createDocument, 1);
});

test('actual ioredis transport on closed synthetic localhost fails closed within deadline', async () => {
  const { enforcePasswordBudget } = sourceLoader(
    {},
    {
      AUTH_SECRET: 'synthetic-limiter-secret-at-least-32-characters',
      REDIS_URL: 'redis://127.0.0.1:1/15',
    },
  )('lib/auth-rate-limit.ts');
  const started = performance.now();
  await assert.rejects(
    enforcePasswordBudget('credentials', 'synthetic@example.invalid', new Headers()),
    (error) => error.reason === 'unavailable' && error.retryAfterSeconds === 30,
  );
  assert.ok(performance.now() - started < 2500);
});
