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

function load(file, mocks) {
  const compiled = ts.transpileModule(readFileSync(resolve(web, 'src', file), 'utf8'), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    module,
    exports: module.exports,
    require: (name) => (Object.hasOwn(mocks, name) ? mocks[name] : require(name)),
  });
  return module.exports;
}

function dashboard({ userId = 'user-a', member = true, documents = [], sets = [] } = {}) {
  const calls = [];
  const { default: Page } = load('app/(dashboard)/w/[workspaceId]/dashboard/page.tsx', {
    '@/lib/auth': { auth: async () => ({ user: { id: userId } }) },
    'next/navigation': {
      notFound: () => {
        throw new Error('NOT_FOUND');
      },
    },
    '@/server/queries/workspace': {
      getWorkspaceForUser: async (workspaceId, principal) => {
        calls.push(['membership', workspaceId, principal]);
        return member ? { id: workspaceId, name: 'Actual workspace' } : null;
      },
    },
    '@/server/queries/document': {
      getRecentDocuments: async (...args) => {
        calls.push(['documents', ...args]);
        return documents;
      },
    },
    '@/server/queries/flashcard': {
      getWorkspaceFlashcardSets: async (...args) => {
        calls.push(['sets', ...args]);
        return sets;
      },
    },
    '@/components/dashboard/study-dashboard': { StudyDashboard: () => null },
    '@/components/task/task-priority-badge': { TaskPriorityBadge: () => null },
    '@/components/ui/card': {},
    '@/components/ui/badge': {},
    '@/components/ui/button': {},
  });
  return { calls, run: () => Page({ params: Promise.resolve({ workspaceId: 'workspace-b' }) }) };
}

test('dashboard leaves an empty workspace empty and loads bounded scoped material after membership', async () => {
  const { calls, run } = dashboard();
  const element = await run();
  assert.deepEqual(calls, [
    ['membership', 'workspace-b', 'user-a'],
    ['documents', 'workspace-b', 5],
    ['sets', 'workspace-b', 5],
  ]);
  assert.equal(element.props.workspaceId, 'workspace-b');
  assert.equal(element.props.documents.length, 0);
  assert.equal(element.props.flashcardSets.length, 0);
});

test('dashboard passes actual material IDs unchanged instead of replacing them with samples', async () => {
  const documents = [{ id: 'actual-document', filename: 'actual-notes.txt' }];
  const sets = [{ id: 'actual-set', title: 'Actual saved cards' }];
  const { run } = dashboard({ documents, sets });
  const element = await run();
  assert.equal(element.props.documents, documents);
  assert.equal(element.props.flashcardSets, sets);
});

test('dashboard never reads materials without an authenticated workspace member', async () => {
  for (const options of [{ userId: null }, { member: false }]) {
    const { calls, run } = dashboard(options);
    await assert.rejects(run, /NOT_FOUND/);
    assert.equal(
      calls.some(([operation]) => operation !== 'membership'),
      false,
    );
  }
});

test('actual dashboard queries scope both lists, exclude inactive documents and bound recent results', async () => {
  const calls = [];
  const prisma = {
    document: {
      findMany: async (query) => {
        calls.push(['documents', query]);
        return [];
      },
    },
    flashcardSet: {
      findMany: async (query) => {
        calls.push(['sets', query]);
        return [];
      },
    },
  };
  const documents = load('server/queries/document.ts', {
    '@campusforge/db': { prisma },
    '@/server/services/ai-input': {
      getDocumentAIInput: () => {
        throw new Error('List must not measure full text');
      },
    },
  });
  const flashcards = load('server/queries/flashcard.ts', { '@campusforge/db': { prisma } });
  await documents.getRecentDocuments('actual-workspace', 5);
  await flashcards.getWorkspaceFlashcardSets('actual-workspace', 5);
  const [[, documentQuery], [, setQuery]] = calls;
  assert.equal(documentQuery.where.workspaceId, 'actual-workspace');
  assert.equal(documentQuery.where.lifecycle, 'ACTIVE');
  assert.equal(setQuery.where.workspaceId, 'actual-workspace');
  for (const query of [documentQuery, setQuery]) {
    assert.equal(query.take, 5);
    assert.equal(query.orderBy.createdAt, 'desc');
  }
});
