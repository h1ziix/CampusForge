import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import ts from 'typescript';

const source = resolve(dirname(fileURLToPath(import.meta.url)), '../src');
const require = createRequire(import.meta.url);

function serverPage(relative, mocks) {
  const path = resolve(source, relative);
  const module = { exports: {} };
  const result = ts.transpileModule(readFileSync(path, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  });
  runInNewContext(
    result.outputText,
    {
      module,
      exports: module.exports,
      require(request) {
        if (request === 'react/jsx-runtime') return require(request);
        if (Object.hasOwn(mocks, request)) return mocks[request];
        throw new Error(`Unexpected server dependency: ${request}`);
      },
    },
    { filename: path },
  );
  return module.exports.default;
}

// Actual application modules; only browser APIs are simulated. The shared hub
// models distinct module realms/windows and storage/BroadcastChannel delivery.
function browserHub() {
  const values = new Map();
  const windows = [];
  const channels = [];
  function tab({ blocked = false, cannotRemove = false, broadcast = true } = {}) {
    const listeners = new Map();
    const window = {
      localStorage: {
        get length() {
          if (blocked) throw new Error('Blocked storage');
          return values.size;
        },
        key(index) {
          if (blocked) throw new Error('Blocked storage');
          return [...values.keys()][index] ?? null;
        },
        getItem(key) {
          if (blocked) throw new Error('Blocked storage');
          return values.get(key) ?? null;
        },
        setItem(key, value) {
          if (blocked) throw new Error('Blocked storage');
          values.set(key, String(value));
          for (const other of windows) if (other !== window) other.emit('storage', { key });
        },
        removeItem(key) {
          if (blocked || cannotRemove) throw new Error('Blocked storage');
          values.delete(key);
        },
      },
      addEventListener(name, listener) {
        const group = listeners.get(name) ?? [];
        group.push(listener);
        listeners.set(name, group);
      },
      emit(name, event) {
        listeners.get(name)?.forEach((listener) => listener(event));
      },
      location: {
        reloads: 0,
        reload() {
          this.reloads += 1;
        },
      },
    };
    windows.push(window);
    class BroadcastChannel {
      constructor(name) {
        this.name = name;
        this.handlers = [];
        channels.push(this);
      }
      addEventListener(_event, listener) {
        this.handlers.push(listener);
      }
      postMessage(data) {
        for (const other of channels)
          if (other !== this && other.name === this.name)
            other.handlers.forEach((listener) => listener({ data }));
      }
    }
    const globals = {
      window,
      crypto: { randomUUID },
      BroadcastChannel: broadcast ? BroadcastChannel : undefined,
    };
    const modules = new Map();
    function load(relative) {
      const path = resolve(source, relative);
      if (modules.has(path)) return modules.get(path).exports;
      const module = { exports: {} };
      modules.set(path, module);
      const result = ts.transpileModule(readFileSync(path, 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      });
      runInNewContext(
        result.outputText,
        {
          ...globals,
          module,
          exports: module.exports,
          require(request) {
            if (request.startsWith('@/')) return load(`${request.slice(2)}.ts`);
            return load(`${resolve(dirname(path), request)}.ts`);
          },
        },
        { filename: path },
      );
      return module.exports;
    }
    return { window, privacy: load('lib/privacy.ts'), storage: load('lib/assistant/storage.ts') };
  }
  return { values, tab };
}

const A1 = { userId: 'user-A', workspaceId: 'ws-1' };
const A2 = { userId: 'user-A', workspaceId: 'ws-2' };
const B1 = { userId: 'user-B', workspaceId: 'ws-1' };
function state(storage, marker, autoSave = true) {
  return {
    conversations: [
      {
        id: marker,
        title: marker,
        model: 'gpt-4.1',
        createdAt: 1,
        updatedAt: 1,
        messages: [
          {
            id: 'm',
            role: 'user',
            content: marker,
            createdAt: 1,
            status: 'streaming',
            attachments: [
              {
                id: 'f',
                name: `${marker}.png`,
                ext: 'png',
                size: '1 KB',
                kind: 'image',
                previewUrl: 'blob:synthetic',
              },
            ],
          },
        ],
      },
    ],
    activeId: marker,
    settings: {
      ...storage.DEFAULT_SETTINGS,
      theme: 'dark',
      autoSave,
      systemPrompt: `private-${marker}`,
    },
  };
}

test('actual storage isolates user + workspace; only metadata persists for attachments', () => {
  const hub = browserHub();
  const { storage, privacy } = hub.tab();
  const lease = privacy.createSensitiveLease();
  storage.saveState(A1, state(storage, 'marker-A1'), lease);
  storage.saveState(A2, state(storage, 'marker-A2'), lease);
  storage.saveState(B1, state(storage, 'marker-B1'), lease);
  for (const [identity, marker] of [
    [A1, 'marker-A1'],
    [A2, 'marker-A2'],
    [B1, 'marker-B1'],
  ]) {
    const loaded = storage.loadState(identity, lease);
    assert.equal(loaded.conversations[0].title, marker);
    assert.equal(loaded.conversations[0].messages[0].attachments[0].previewUrl, undefined);
    assert.equal(loaded.conversations[0].messages[0].status, undefined);
    const preferences = JSON.parse(hub.values.get(storage.assistantPreferencesKey(identity)));
    assert.equal(preferences.theme, 'dark');
    assert.equal(preferences.systemPrompt, undefined);
  }
  assert.notEqual(
    privacy.identityNamespace({ userId: 'a:b', workspaceId: 'c' }),
    privacy.identityNamespace({ userId: 'a', workspaceId: 'b:c' }),
  );
});

test('autosave false removes sensitive history and custom prompt while retaining preferences and in-memory state', () => {
  const hub = browserHub();
  const { storage, privacy } = hub.tab();
  const lease = privacy.createSensitiveLease();
  const sensitive = state(storage, 'autosave-marker');
  storage.saveState(A1, sensitive, lease);
  sensitive.settings.autoSave = false;
  storage.saveState(A1, sensitive, lease);
  assert.equal(sensitive.conversations[0].title, 'autosave-marker');
  assert.equal(sensitive.settings.systemPrompt, 'private-autosave-marker');
  assert.equal(hub.values.has(storage.assistantStorageKey(A1)), false);
  assert.doesNotMatch(
    hub.values.get(storage.assistantPreferencesKey(A1)),
    /private-autosave-marker|systemPrompt/,
  );
  const loaded = storage.loadState(A1, lease);
  assert.equal(loaded.conversations.length, 0);
  assert.equal(loaded.activeId, null);
  assert.equal(loaded.settings.autoSave, false);
  assert.equal(loaded.settings.theme, 'dark');
  assert.equal(loaded.settings.systemPrompt, storage.DEFAULT_SETTINGS.systemPrompt);
});

test('ownerless legacy history is never loaded, corrupt data and storage failures are safe', () => {
  const hub = browserHub();
  const { storage, privacy } = hub.tab();
  const lease = privacy.createSensitiveLease();
  hub.values.set('campusforge:assistant:v1', JSON.stringify(state(storage, 'legacy-private')));
  assert.doesNotMatch(JSON.stringify(storage.loadState(A1, lease)), /legacy-private/);
  hub.values.set(storage.assistantStorageKey(A1), '{');
  assert.equal(storage.loadState(A1, lease).conversations.length, 0);
  hub.values.set(
    storage.assistantStorageKey(A1),
    JSON.stringify({ epoch: '', conversations: [{ messages: null }] }),
  );
  assert.equal(storage.loadState(A1, lease).conversations.length, 0);
  const blocked = hub.tab({ blocked: true });
  const blockedLease = blocked.privacy.createSensitiveLease();
  assert.equal(blocked.storage.loadState(A1, blockedLease).conversations.length, 0);
  assert.doesNotThrow(() =>
    blocked.storage.saveState(A1, state(storage, 'never-written'), blockedLease),
  );
  assert.doesNotThrow(() => blocked.privacy.clearCampusForgeSensitiveStorage());
  assert.equal(blockedLease.isValid(), false);
});

test('logout revokes both tabs and pending writes; removes only documented sensitive keys', () => {
  const hub = browserHub();
  const first = hub.tab();
  const second = hub.tab();
  const lease1 = first.privacy.createSensitiveLease();
  const lease2 = second.privacy.createSensitiveLease();
  first.storage.saveState(A1, state(first.storage, 'private-A1'), lease1);
  first.storage.saveState(A2, state(first.storage, 'private-A2'), lease1);
  hub.values.set('campusforge:assistant:v1', 'legacy');
  hub.values.set('campusforge:doc-ai:old-document', 'legacy sensitive summary');
  hub.values.set('campusforge:doc-ai:v2:user-A:ws-1:doc', 'sensitive summary');
  hub.values.set('campusforge-theme', 'dark');
  hub.values.set('unrelated-application', 'leave alone');
  let revoked = 0;
  second.privacy.subscribeToLogout(() => {
    revoked += 1;
  });
  first.privacy.clearCampusForgeSensitiveStorage();
  assert.equal(lease1.isValid(), false);
  assert.equal(lease2.isValid(), false);
  assert.ok(revoked > 0);
  second.storage.saveState(A1, state(second.storage, 'stale-write'), lease2);
  assert.equal(hub.values.has(first.storage.assistantStorageKey(A1)), false);
  assert.equal(hub.values.has(first.storage.assistantStorageKey(A2)), false);
  assert.equal(hub.values.has('campusforge:assistant:v1'), false);
  assert.equal(hub.values.has('campusforge:doc-ai:old-document'), false);
  assert.equal(hub.values.has('campusforge:doc-ai:v2:user-A:ws-1:doc'), false);
  assert.equal(hub.values.get('campusforge-theme'), 'dark');
  assert.equal(hub.values.get('unrelated-application'), 'leave alone');
  assert.equal(JSON.parse(hub.values.get(first.storage.assistantPreferencesKey(A1))).theme, 'dark');
  assert.doesNotMatch(
    JSON.stringify(first.storage.loadState(B1, first.privacy.createSensitiveLease())),
    /private-A|stale-write/,
  );
});

test('epoch fences content when removal fails, storage-only and BroadcastChannel-only logout work', () => {
  const hub = browserHub();
  const first = hub.tab({ cannotRemove: true, broadcast: false });
  const second = hub.tab({ broadcast: false });
  const lease1 = first.privacy.createSensitiveLease();
  const lease2 = second.privacy.createSensitiveLease();
  first.storage.saveState(A1, state(first.storage, 'cannot-erase'), lease1);
  first.privacy.clearCampusForgeSensitiveStorage();
  assert.equal(lease2.isValid(), false);
  assert.equal(
    first.storage.loadState(A1, first.privacy.createSensitiveLease()).conversations.length,
    0,
  );
  const broadcastHub = browserHub();
  const blocked = broadcastHub.tab({ blocked: true });
  const receiving = broadcastHub.tab();
  const receivingLease = receiving.privacy.createSensitiveLease();
  blocked.privacy.clearCampusForgeSensitiveStorage();
  assert.equal(receivingLease.isValid(), false);
});

test('BFCache restoration revokes memory and forces the trusted server boundary', () => {
  const { window, privacy } = browserHub().tab();
  const lease = privacy.createSensitiveLease();
  window.emit('pageshow', { persisted: true });
  assert.equal(lease.isValid(), false);
  assert.equal(window.location.reloads, 1);
});

test('snapshot catches an epoch change between render and subscription even without an event', () => {
  const hub = browserHub();
  const { privacy } = hub.tab();
  const lease = privacy.createSensitiveLease();
  const before = privacy.getPrivacySnapshot();
  hub.values.set(privacy.LOGOUT_EPOCH_KEY, 'changed-before-subscribe');
  assert.notEqual(privacy.getPrivacySnapshot(), before);
  assert.equal(lease.isValid(), false);
});

test('actual assistant server entrance rejects malformed/foreign principals before returning identity (auth and membership mocked)', async () => {
  const calls = [];
  let session = { user: { id: A1.userId, name: 'Synthetic A', email: 'a@example.test' } };
  const page = serverPage('app/(dashboard)/w/[workspaceId]/assistant/page.tsx', {
    'next/navigation': {
      notFound() {
        throw new Error('NOT_FOUND');
      },
    },
    '@/lib/auth': { auth: async () => session },
    '@/server/services/auth-helpers': {
      requireWorkspaceMember: async (userId, workspaceId) => {
        calls.push({ userId, workspaceId });
        if (workspaceId !== A1.workspaceId) throw new Error('FORBIDDEN');
      },
    },
    '@/components/assistant/assistant-app': { AssistantApp() {} },
  });
  const element = await page({ params: Promise.resolve({ workspaceId: A1.workspaceId }) });
  assert.deepEqual(JSON.parse(JSON.stringify(element.props.identity)), A1);
  assert.equal(calls.length, 1);
  await assert.rejects(
    page({ params: Promise.resolve({ workspaceId: 'foreign-ws' }) }),
    /FORBIDDEN/,
  );
  for (const invalid of [null, {}, { user: {} }, { user: { id: '' } }, { user: { id: 42 } }]) {
    session = invalid;
    await assert.rejects(
      page({ params: Promise.resolve({ workspaceId: A1.workspaceId }) }),
      /NOT_FOUND/,
    );
  }
  assert.equal(calls.length, 2);
});

test('actual document entrance passes verified principal into the cache view (auth, membership and queries mocked)', async () => {
  const calls = [];
  const doc = { id: 'synthetic-document' };
  const page = serverPage('app/(dashboard)/w/[workspaceId]/documents/[documentId]/page.tsx', {
    'next/navigation': {
      notFound() {
        throw new Error('NOT_FOUND');
      },
    },
    '@/lib/auth': { auth: async () => ({ user: { id: A1.userId } }) },
    '@/server/services/auth-helpers': {
      requireWorkspaceMember: async (userId, workspaceId) => {
        calls.push({ userId, workspaceId });
      },
    },
    '@/server/queries/document-state': {
      getDocumentGenerationState: async (id, workspaceId) => {
        assert.equal(id, doc.id);
        assert.equal(workspaceId, A1.workspaceId);
        return {
          document: doc,
          summary: null,
          summaryJob: null,
          flashcardSets: [],
          flashcardJob: null,
        };
      },
    },
    '@/components/document/document-detail-view': { DocumentDetailView() {} },
  });
  const element = await page({
    params: Promise.resolve({ workspaceId: A1.workspaceId, documentId: doc.id }),
  });
  assert.deepEqual(JSON.parse(JSON.stringify(element.props.children.props.identity)), A1);
  assert.deepEqual(calls, [A1]);
});
