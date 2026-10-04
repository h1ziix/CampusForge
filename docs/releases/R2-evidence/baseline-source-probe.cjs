/* Independent audit probes. No .env, network, Prisma DB, S3, Redis or AI calls.
 * Real TS/TSX modules are transpiled in memory; external boundaries are mocks.
 * Run: node docs/audit-2026-10-04-independent/security-probes.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '../../..');
const webRequire = createRequire(path.join(root, 'apps/web/package.json'));
const ts = require(path.join(root, 'node_modules/typescript'));
const react = webRequire('react');
const jsx = webRequire('react/jsx-runtime');
const bcrypt = webRequire('bcryptjs');
const results = [];
function load(relative, mocks = {}, globals = {}) {
  const absolute = path.join(root, relative);
  const output = ts.transpileModule(fs.readFileSync(absolute, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: absolute,
  }).outputText;
  const module = { exports: {} };
  const context = { module, exports: module.exports, Buffer, URL, FormData,
    setTimeout, clearTimeout, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (Object.hasOwn(mocks, name)) return mocks[name];
      if (name === 'react/jsx-runtime') return jsx;
      if (name.startsWith('.')) throw new Error('Unmocked relative import ' + name);
      return webRequire(name);
    }, ...globals };
  vm.runInNewContext(output, context, { filename: relative });
  return module.exports;
}
function record(name, details) { results.push({ name, status: 'PASS', details }); }
function form(input) { const f = new FormData(); for (const [k, v] of Object.entries(input)) f.set(k, v); return f; }
const shared = {
  ...load('packages/shared/src/schemas/auth.ts'),
  ...load('packages/shared/src/schemas/task.ts'),
  ...load('packages/shared/src/schemas/note.ts'),
  ...load('packages/shared/src/schemas/workspace.ts'),
  ...load('packages/shared/src/types/action-result.ts'),
};
async function main() {
  // A real client update can change onboarding/name, but id/role are ignored.
  const config = load('apps/web/src/lib/auth.config.ts').authConfig;
  const originalToken = { id: 'user-a', role: 'STUDENT', name: 'Original', onboardingCompleted: false };
  const updated = await config.callbacks.jwt({ token: originalToken, trigger: 'update',
    session: { onboardingCompleted: true, name: 'Claimed without DB write', role: 'ADMIN', id: 'user-b' } });
  assert.equal(updated.onboardingCompleted, true);
  assert.equal(updated.name, 'Claimed without DB write');
  assert.equal(updated.role, 'STUDENT');
  assert.equal(updated.id, 'user-a');
  record('jwt-client-update', { onboardingChangedWithoutDB: true, nameChangedWithoutDB: true, roleInjectionRejected: true, idInjectionRejected: true });

  // Deliberately long, synthetic passwords. Real hashing at application's rounds.
  const first = 'A'.repeat(72) + 'first-suffix';
  const second = 'A'.repeat(72) + 'different-suffix';
  assert(shared.signUpSchema.safeParse({ name: 'Audit', email: 'audit@example.invalid', password: first }).success);
  assert(shared.signUpSchema.safeParse({ name: 'Audit', email: 'audit@example.invalid', password: second }).success);
  const passwordHash = await bcrypt.hash(first, 12);
  assert(await bcrypt.compare(second, passwordHash));
  const unicodeFirst = '€'.repeat(24) + 'one';
  const unicodeSecond = '€'.repeat(24) + 'two';
  const unicodeHash = await bcrypt.hash(unicodeFirst, 12);
  assert(await bcrypt.compare(unicodeSecond, unicodeHash));
  record('bcrypt-72-byte-collision', { saltRounds: 12, asciiDifferentSuffixAuthenticates: true, unicodeDifferentSuffixAuthenticates: true, schemaAllowed: true });

  // Credentials authorize executes DB lookup and password comparison for each
  // supplied attempt. Mocks prevent a real brute-force attack or DB access.
  let capturedConfig, lookupCount = 0, compareCount = 0;
  load('apps/web/src/lib/auth.ts', {
    'next-auth': (c) => { capturedConfig = c; return { handlers: {}, auth() {}, signIn() {}, signOut() {} }; },
    'next-auth/providers/credentials': (c) => c,
    '@auth/prisma-adapter': { PrismaAdapter() { return {}; } },
    bcryptjs: { async compare() { compareCount++; return false; } },
    '@campusforge/shared': shared,
    '@campusforge/db': { prisma: { user: { async findUnique() { lookupCount++; return {
      id: 'user-a', email: 'audit@example.invalid', name: 'Audit', passwordHash: 'mock-only', role: 'STUDENT', onboardingCompleted: false,
    }; } } } },
    './auth.config': { authConfig: config },
  });
  for (let i = 0; i < 12; i++) assert.equal(await capturedConfig.providers[0].authorize({ email: 'audit@example.invalid', password: 'wrong' }), null);
  assert.equal(lookupCount, 12); assert.equal(compareCount, 12);
  record('credentials-no-application-throttle', { attempts: 12, databaseLookups: lookupCount, bcryptCompares: compareCount, noThrottleInAuthorize: true });

  // Signup reveals account existence and each new, valid email is hashed.
  let signupHashes = 0, signupTransactions = 0;
  const authService = load('apps/web/src/server/services/auth.ts', {
    bcryptjs: { async hash() { signupHashes++; return 'mock-hash'; } },
    '@campusforge/db': { prisma: { user: { async findUnique({ where }) { return where.email === 'existing@example.invalid' ? { id: 'existing' } : null; } },
      async $transaction(f) { signupTransactions++; return f({
        user: { async create({ data }) { return { id: 'created', email: data.email, name: data.name }; } },
        workspace: { async create() { return { id: 'own-workspace' }; } },
        membership: { async create() { return {}; } },
      }); },
    } },
  });
  const existingResult = await authService.createUser({ name: 'Audit', email: 'existing@example.invalid', password: 'synthetic' });
  assert.equal(existingResult.ok, false); assert.equal(existingResult.error, 'An account with this email already exists');
  for (let i = 0; i < 12; i++) assert.equal((await authService.createUser({ name: 'Audit', email: 'new' + i + '@example.invalid', password: 'synthetic' })).ok, true);
  assert.equal(signupHashes, 12); assert.equal(signupTransactions, 12);
  record('signup-no-application-throttle-and-enumeration', { mockedNewEmails: 12, hashes: signupHashes, transactions: signupTransactions, existingEmailHasDistinctError: true });

  // Same mock browser storage represents workspace/user change on one origin.
  const persisted = new Map();
  const localStorage = { getItem: (k) => persisted.get(k) ?? null, setItem: (k, v) => persisted.set(k, v) };
  const storage = load('apps/web/src/lib/assistant/storage.ts', { './seed': { seedConversations() { return []; } } }, { window: { localStorage } });
  const secretMessage = 'AUDIT_SYNTHETIC_USER_A_PRIVATE_NOTE';
  storage.saveState({ conversations: [{ id: 'user-a-conv', title: 'Private', messages: [{ id: 'm1', content: secretMessage, role: 'user' }] }], activeId: 'user-a-conv', settings: storage.DEFAULT_SETTINGS });
  const loadedByUserB = storage.loadState();
  assert.equal(loadedByUserB.conversations[0].messages[0].content, secretMessage);
  let logoutPromise;
  const logoutReact = { useTransition: () => [false, (f) => { logoutPromise = f(); }] };
  let authLogoutCalled = false;
  const logoutModule = load('apps/web/src/components/auth/sign-out-button.tsx', {
    react: logoutReact, 'next-auth/react': { async signOut() { authLogoutCalled = true; } },
    '@/components/ui/button': { Button: 'button' }, 'lucide-react': { LogOut: 'span' },
  }, { window: { localStorage } });
  logoutModule.SignOutButton().props.onClick(); await logoutPromise;
  assert(authLogoutCalled); assert.equal(storage.loadState().conversations[0].messages[0].content, secretMessage);
  record('assistant-storage-isolation-and-logout', { keys: [...persisted.keys()], otherPrincipalLoadsPriorContent: true, logoutRetainsContent: true });

  // Invoke the actual submit handler with success action but no real login.
  async function callbackSink(callback) {
    let pushed, transitionPromise;
    const ui = { Button: 'button', Input: 'input', Label: 'label', Card: 'div', CardContent: 'div', CardDescription: 'div', CardFooter: 'div', CardHeader: 'div', CardTitle: 'h1' };
    const module = load('apps/web/src/components/auth/sign-in-form.tsx', {
      react: { useTransition: () => [false, (f) => { transitionPromise = f(); }], useState: (v) => [v, () => {}] },
      'next/navigation': { useRouter: () => ({ push: (v) => { pushed = v; }, refresh() {} }), useSearchParams: () => new URLSearchParams({ callbackUrl: callback }) },
      'next/link': 'a', '@/components/ui/button': ui, '@/components/ui/input': ui,
      '@/components/ui/label': ui, '@/components/ui/card': ui,
      '@/server/actions/auth': { async signInAction() { return { success: true }; } },
    }, { FormData: class {}, });
    const tree = module.SignInForm();
    const formElement = tree.props.children.find((e) => e?.type === 'form');
    formElement.props.onSubmit({ preventDefault() {}, currentTarget: {} });
    await transitionPromise; return pushed;
  }
  const malicious = 'javascript:window.__auditCallback=1';
  assert.equal(await callbackSink(malicious), malicious);
  assert.equal(await callbackSink('https://example.invalid/audit'), 'https://example.invalid/audit');
  record('sign-in-callback-url-sink', { javascriptPassedToRouterPush: true, crossOriginPassedToRouterPush: true, successLoginMocked: true });

  // React escaping blocks raw HTML injection; URL scheme is not allow-listed.
  const markdown = load('apps/web/src/components/assistant/markdown.tsx', {
    react, 'lucide-react': { Check: 'span', Copy: 'span' }, '@/lib/utils': { cn: (...xs) => xs.filter(Boolean).join(' ') },
  });
  const render = webRequire('react-dom/server').renderToStaticMarkup;
  const oldError = console.error; console.error = () => {};
  let hrefHtml, rawHtml;
  try {
    hrefHtml = render(react.createElement(markdown.Markdown, { content: '[audit](javascript:window.__auditMarkdown=1)\n\n[data](data:text/html,audit)' }));
    rawHtml = render(react.createElement(markdown.Markdown, { content: '<img src=x onerror=window.__auditMarkup=1>' }));
  } finally { console.error = oldError; }
  assert(hrefHtml.includes('javascript:'));
  assert(hrefHtml.includes('href="data:text/html,audit"'));
  assert(rawHtml.includes('&lt;img'));
  record('markdown-url-schemes-vs-react-escaping', { unsafeJavascriptMarkerHrefRendered: false, reactRewritesJavascriptToThrow: true, dataHrefRendered: true, rawHtmlEscaped: true, clickExecutionNotTested: true });

  // Actual membership helper and actual actions/services with in-memory rows.
  const userId = 'caudituser00000000000000001';
  const ownWs = 'cauditws0000000000000000001';
  const foreignWs = 'cauditws0000000000000000002';
  const objectId = 'cauditobj000000000000000001';
  let principal = { id: userId }, writes = 0, s3Deletes = 0, enqueues = 0;
  const database = { membership: { async findUnique({ where }) { return where.userId_workspaceId.userId === userId && where.userId_workspaceId.workspaceId === ownWs ? { id: 'membership', role: 'MEMBER' } : null; } },
    note: { async findFirst({ where }) { return where.workspaceId === foreignWs ? { id: objectId } : null; }, async update() { writes++; } },
    task: { async findFirst({ where }) { return where.workspaceId === foreignWs ? { id: objectId } : null; }, async update() { writes++; } },
    document: { async findFirst({ where }) { return where.workspaceId === foreignWs ? { id: objectId, storageKey: 'foreign', parsedText: 'synthetic', processingStatus: 'COMPLETED' } : null; }, async delete() { writes++; } },
    flashcardSet: { async findFirst({ where }) { return where.workspaceId === foreignWs ? { id: objectId } : null; }, async delete() { writes++; } },
  };
  const helpers = load('apps/web/src/server/services/auth-helpers.ts', { '@/lib/auth': { async auth() { return { user: principal }; } }, '@campusforge/db': { prisma: database } });
  principal = null; await assert.rejects(() => helpers.requireAuth(), /Not authenticated/); principal = { id: userId };
  await assert.rejects(() => helpers.requireWorkspaceMember(userId, foreignWs), /Not a member/);
  const mocks = { '@campusforge/db': { prisma: database }, '@campusforge/shared': shared,
    '@/server/services/auth-helpers': helpers, '@/lib/s3': { async deleteFromS3() { s3Deletes++; } },
    '@/lib/queue': { async enqueueSummaryGeneration() { enqueues++; }, async enqueueFlashcardGeneration() { enqueues++; } },
  };
  const serviceTask = load('apps/web/src/server/services/task.ts', mocks);
  const serviceNote = load('apps/web/src/server/services/note.ts', mocks);
  const serviceDocument = load('apps/web/src/server/services/document.ts', mocks);
  const taskActions = load('apps/web/src/server/actions/task.ts', { ...mocks, '@/server/services/task': serviceTask });
  const noteActions = load('apps/web/src/server/actions/note.ts', { ...mocks, '@/server/services/note': serviceNote });
  const docActions = load('apps/web/src/server/actions/document.ts', { ...mocks, '@/server/services/document': serviceDocument });
  const cardActions = load('apps/web/src/server/actions/flashcard.ts', mocks);
  const summaryActions = load('apps/web/src/server/actions/summary.ts', mocks);
  const scopedCases = [
    ['task-update', taskActions.updateTaskAction, { id: objectId, title: 'Audit' }],
    ['note-update', noteActions.updateNoteAction, { id: objectId, content: 'Audit' }],
    ['document-delete', docActions.deleteDocumentAction, { documentId: objectId }],
    ['flashcard-delete', cardActions.deleteFlashcardSetAction, { flashcardSetId: objectId }],
    ['summary-generate', summaryActions.generateSummaryAction, { documentId: objectId }],
    ['flashcard-generate', cardActions.generateFlashcardsAction, { documentId: objectId }],
  ];
  const matrix = [];
  for (const [name, action, input] of scopedCases) {
    const result = await action(form({ ...input, workspaceId: ownWs }));
    assert.equal(result.success, false);
    await assert.rejects(() => action(form({ ...input, workspaceId: foreignWs })), /Not a member/);
    matrix.push({ name, foreignObjectUnderOwnWorkspace: 'rejected', foreignWorkspace: 'rejected' });
  }
  assert.equal(writes, 0); assert.equal(s3Deletes, 0); assert.equal(enqueues, 0);
  record('authorization-matrix', { anonRejected: true, nonmemberRejected: true, matrix, dbWrites: writes, s3Deletes, aiEnqueues: enqueues });
  const artifact = { date: '2026-10-05', boundary: 'actual-source modules; isolated in-memory dependencies; no live login/DB/storage/provider', results };
  fs.writeFileSync(path.join(__dirname, 'baseline-source.json'), JSON.stringify(artifact, null, 2) + '\n');
  console.log(JSON.stringify(artifact, null, 2));
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
