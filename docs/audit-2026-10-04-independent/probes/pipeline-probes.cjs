/* Independent audit: execute unchanged application sources with in-memory mocks.
 * No .env imports, network, real Redis/S3/Prisma or paid AI requests.
 * Run from project root: node docs/audit-2026-10-04-independent/probes/pipeline-probes.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../../..');
const results = [];
const logs = [];
const silentConsole = { log: (...args) => logs.push(args.map(String).join(' ')), warn: (...args) => logs.push(args.map(String).join(' ')), error: (...args) => logs.push(args.map(String).join(' ')) };

function loadSource(relative, imports = {}, globals = {}) {
  const filename = path.join(root, relative);
  const source = fs.readFileSync(filename, 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  const context = vm.createContext({ module, exports: module.exports, require: (id) => {
    if (!(id in imports)) throw new Error(`Audit blocked unmocked import ${id} in ${relative}`);
    return imports[id];
  }, Buffer, Date, Math, JSON, process: { env: {} }, console: silentConsole, ...globals });
  new vm.Script(js, { filename }).runInContext(context);
  return module.exports;
}
function record(name, observations) { results.push({ name, defectReproduced: true, observations }); }
function recordWorks(name, observations) { results.push({ name, defectReproduced: false, mockedBehaviorPassed: true, observations }); }
const fixedDate = class extends Date { static now() { return 1728000000000; } };
const uploadInput = (filename = 'lecture.txt', text = 'first') => ({ workspaceId: 'cm000000000000000000000000', filename, mimeType: 'text/plain', sizeBytes: text.length, fileBuffer: Buffer.from(text) });

function documentMocks() {
  const state = { documents: [], objects: new Map(), queued: [], insertFails: false, enqueueFails: false, deleteFails: false, dbDeleteFails: false };
  const prisma = { document: {
    create: async ({ data }) => { if (state.insertFails) throw new Error('mock DB insert failure'); const doc = { ...data, id: `d${state.documents.length + 1}` }; state.documents.push(doc); return doc; },
    findFirst: async ({ where }) => state.documents.find(d => d.id === where.id && d.workspaceId === where.workspaceId),
    delete: async ({ where }) => { if (state.dbDeleteFails) throw new Error('mock DB delete failure'); const i = state.documents.findIndex(d => d.id === where.id); return state.documents.splice(i, 1)[0]; },
  } };
  const source = loadSource('apps/web/src/server/services/document.ts', {
    '@campusforge/db': { prisma },
    '@/lib/s3': { uploadToS3: async (key, body) => state.objects.set(key, body.toString()), deleteFromS3: async key => { if (state.deleteFails) throw new Error('mock S3 deletion outage'); state.objects.delete(key); } },
    '@/lib/queue': { enqueueDocumentParsing: async id => { if (state.enqueueFails) throw new Error('mock Redis unavailable'); state.queued.push(id); } },
  }, { Date: fixedDate });
  return { state, source };
}

function lazy(operation) { return { then(resolve, reject) { return Promise.resolve().then(operation).then(resolve, reject); }, catch(reject) { return this.then(undefined, reject); }, run: operation }; }
const summary = { title: 'Real source summary', tldr: 'Based on sentinel lecture content.', sections: [{ heading: 'Concept', content: 'Sentinel content.' }], keyTerms: ['sentinel'] };
const cards = { title: 'Sentinel flashcards', cards: [{ front: 'What is sentinel?', back: 'From uploaded lecture.' }] };
const meta = { model: 'gpt-4o-mini', totalTokens: 300, promptTokens: 200, completionTokens: 100, latencyMs: 4, estimatedCost: 0.00009 };
function jobMocks(actualPrompts = {}) {
  const state = { jobs: [], sets: [], queued: [], calls: [], transactionFails: false, complete: async input => ({ data: input.maxTokens ? cards : summary, meta }) };
  const doc = { id: 'd1', workspaceId: 'w1', filename: 'lecture.txt', parsedText: 'Sentinel real lecture body.', summaryJson: null, processingStatus: 'COMPLETED' };
  const prisma = {
    document: { findUnique: async () => doc, findFirst: async ({ where }) => where.id === doc.id && where.workspaceId === doc.workspaceId ? doc : null, update: ({ data }) => lazy(() => Object.assign(doc, data)) },
    aIJob: {
      create: ({ data }) => lazy(() => { const job = { id: `j${state.jobs.length + 1}`, ...data }; state.jobs.push(job); return job; }),
      update: ({ where, data }) => lazy(() => Object.assign(state.jobs.find(j => j.id === where.id), data)),
      findFirst: async ({ where }) => state.jobs.find(j => j.documentId === where.documentId && j.type === where.type && where.status.in.includes(j.status)) || null,
    },
    flashcardSet: { create: ({ data }) => lazy(() => { const set = { id: `f${state.sets.length + 1}`, ...data }; state.sets.push(set); return set; }) },
    $transaction: async operations => { if (state.transactionFails) throw new Error('mock DB unavailable after provider returned'); return operations.map(op => op.run()); },
  };
  const prompts = { getAIProvider: () => ({ completeJSON: async input => { state.calls.push(input); return state.complete(input); } }), SUMMARY_SYSTEM_PROMPT: 'JSON summary', FLASHCARD_SYSTEM_PROMPT: 'JSON flashcards', buildSummaryUserPrompt: text => text, buildFlashcardUserPrompt: text => text, buildFlashcardFromSummaryPrompt: s => JSON.stringify(s), parseSummaryOutput: x => x, parseFlashcardOutput: x => x, ...actualPrompts };
  const imports = { '@campusforge/db': { prisma }, '@campusforge/ai': prompts };
  const actionImports = { '@campusforge/db': { prisma }, '@campusforge/shared': { ok: data => ({ ok: true, data }), err: error => ({ ok: false, error }) }, '@/server/services/auth-helpers': { requireAuth: async () => ({ id: 'u1' }), requireWorkspaceMember: async () => ({ id: 'm1' }) }, '@/lib/queue': { enqueueSummaryGeneration: async data => state.queued.push({ type: 'summary', data }), enqueueFlashcardGeneration: async data => state.queued.push({ type: 'flashcard', data }) } };
  return { state, doc, prisma,
    summary: loadSource('apps/worker/src/jobs/generate-summary.ts', imports),
    flashcard: loadSource('apps/worker/src/jobs/generate-flashcards.ts', imports),
    summaryAction: loadSource('apps/web/src/server/actions/summary.ts', actionImports),
    flashcardAction: loadSource('apps/web/src/server/actions/flashcard.ts', actionImports),
  };
}
const data = { documentId: 'd1', workspaceId: 'w1', userId: 'u1' };
const form = { get: key => ({ documentId: 'd1', workspaceId: 'w1' })[key] };

async function main() {
  {
    const doc = { id: 'd1', storageKey: 'audit/synthetic.txt', mimeType: 'text/plain', filename: 'synthetic.txt', parsedText: null, processingStatus: 'PENDING' };
    const parser = loadSource('apps/worker/src/jobs/parse-document.ts', {
      '@campusforge/db': { prisma: { document: { update: async ({ data }) => Object.assign(doc, data), findUnique: async () => doc } } },
      '../lib/s3': { getFromS3: async () => (async function* () { yield Buffer.from('Синтетический учебный текст.'); })() },
    });
    await parser.processDocumentJob('d1');
    await parser.processDocumentJob('d1');
    assert.equal(doc.processingStatus, 'COMPLETED');
    assert.equal(doc.parsedText, 'Синтетический учебный текст.');
    recordWorks('actual TXT processor downloads mocked stream and persists UTF-8 repeatably', { status: doc.processingStatus, decodedText: doc.parsedText, invocations: 2 });
  }
  {
    const summaryPrompts = loadSource('packages/ai/src/prompts/summary.ts');
    const flashcardPrompts = loadSource('packages/ai/src/prompts/flashcard.ts');
    const requests = [];
    class FakeOpenAI { constructor() { this.chat = { completions: { create: async input => {
      requests.push(input);
      return { choices: [{ message: { content: JSON.stringify(input.max_tokens === 4096 ? cards : summary) }, finish_reason: 'stop' }], usage: { prompt_tokens: 200, completion_tokens: 100 } };
    } } }; } }
    const { AIProvider } = loadSource('packages/ai/src/provider.ts', { openai: FakeOpenAI });
    const provider = new AIProvider({ apiKey: 'audit-not-a-real-key', model: 'gpt-4o-mini' });
    const m = jobMocks({ ...summaryPrompts, ...flashcardPrompts });
    m.state.complete = input => provider.completeJSON(input);
    await m.summary.processSummaryJob(data);
    await m.flashcard.processFlashcardJob(data);
    assert.equal(m.doc.summaryJson.title, summary.title);
    assert.equal(m.state.sets[0].cardsJson[0].front, cards.cards[0].front);
    assert.equal(m.state.jobs.every(j => j.status === 'COMPLETED' && j.tokenUsage === 300), true);
    assert.equal(requests[0].messages[1].content.includes('Sentinel real lecture body.'), true);
    assert.equal(requests[1].messages[1].content.includes('DOCUMENT SUMMARY'), true);
    recordWorks('actual workers provider prompt builders validators and DB transactions pass with synthetic OpenAI responses', { providerRequests: 2, summaryPersisted: m.doc.summaryJson.title, generatedFlashcardSets: 1, statuses: m.state.jobs.map(j => j.status), recordedTokens: m.state.jobs.map(j => j.tokenUsage), realNetworkRequests: 0 });
  }
  {
    const { state, source } = documentMocks();
    const first = await source.createDocument(uploadInput('a b.txt', 'alpha'));
    const second = await source.createDocument(uploadInput('a?b.txt', 'bravo'));
    assert.equal(first.ok && second.ok, true);
    assert.equal(state.documents.length, 2);
    assert.equal(state.objects.size, 1);
    assert.equal(state.documents[0].storageKey, state.documents[1].storageKey);
    record('same-millisecond sanitized S3 key collision', { documents: 2, objects: 1, firstStoredText: state.objects.get(state.documents[0].storageKey), sharedKey: state.documents[0].storageKey });
  }
  {
    const { state, source } = documentMocks();
    await source.createDocument(uploadInput());
    state.insertFails = true;
    const second = await source.createDocument(uploadInput('lecture.txt', 'second'));
    assert.equal(second.ok, false);
    assert.equal(state.documents.length, 1);
    assert.equal(state.objects.size, 0);
    record('collision plus failed DB insert cleanup destroys first document object', { existingDocumentRows: 1, survivingObjects: 0 });
  }
  {
    const { state, source } = documentMocks();
    state.enqueueFails = true;
    const response = await source.createDocument(uploadInput());
    assert.equal(response.ok, true);
    assert.equal(state.documents[0].processingStatus, 'PENDING');
    assert.equal(state.queued.length, 0);
    record('enqueue rejection returns successful upload with unqueued PENDING row', { result: response, status: state.documents[0].processingStatus, queued: 0 });
  }
  {
    const { state, source } = documentMocks();
    await source.createDocument(uploadInput());
    state.deleteFails = true;
    const response = await source.deleteDocument('d1', uploadInput().workspaceId);
    assert.equal(response.ok, true);
    assert.equal(state.documents.length, 0);
    assert.equal(state.objects.size, 1);
    record('S3 delete rejection removes DB reference and returns success', { result: response, documentRows: 0, retainedObjects: 1 });
  }
  {
    const { state, source } = documentMocks();
    await source.createDocument(uploadInput());
    state.dbDeleteFails = true;
    await assert.rejects(source.deleteDocument('d1', uploadInput().workspaceId), /DB delete failure/);
    assert.equal(state.documents.length, 1);
    assert.equal(state.objects.size, 0);
    record('DB deletion rejection leaves row referencing deleted S3 object', { documentRows: 1, survivingObjects: 0 });
  }
  {
    const m = jobMocks();
    const responses = [await m.summaryAction.generateSummaryAction(form), await m.summaryAction.generateSummaryAction(form), await m.flashcardAction.generateFlashcardsAction(form), await m.flashcardAction.generateFlashcardsAction(form)];
    assert.equal(responses.every(r => r.ok), true);
    assert.equal(m.state.queued.length, 4);
    assert.equal(m.state.jobs.length, 0);
    record('sequential action submissions before worker starts bypass in-flight guard', { successes: 4, queued: m.state.queued.length, persistedAIJobs: 0 });
  }
  {
    const m = jobMocks();
    await m.flashcard.processFlashcardJob(data);
    // Simulated redelivery after DB commit before queue ack. Execute same actual processor.
    await m.flashcard.processFlashcardJob(data);
    assert.equal(m.state.calls.length, 2);
    assert.equal(m.state.sets.length, 2);
    record('redelivery same logical flashcard job creates second paid call and set', { providerAttempts: 2, completedAIJobs: m.state.jobs.length, flashcardSets: 2 });
  }
  {
    const m = jobMocks();
    let resolveFirst;
    m.state.complete = () => new Promise(resolve => { resolveFirst = resolve; });
    const interrupted = m.summary.processSummaryJob(data);
    for (let i = 0; i < 12; i++) await Promise.resolve();
    assert.equal(m.state.jobs[0].status, 'PROCESSING');
    // Simulated process loss: old execution never finishes, recovery delivers same job again.
    m.state.complete = async () => ({ data: summary, meta });
    await m.summary.processSummaryJob(data);
    const blocked = await m.summaryAction.generateSummaryAction(form);
    assert.equal(m.state.jobs[0].status, 'PROCESSING');
    assert.equal(m.state.jobs[1].status, 'COMPLETED');
    assert.equal(blocked.ok, false);
    record('stalled-attempt replay leaves old PROCESSING row that permanently blocks new requests', { statuses: m.state.jobs.map(j => j.status), subsequentAction: blocked });
    // unresolved Promise has no event-loop handle; no worker/network is running.
    void interrupted; void resolveFirst;
  }
  {
    const m = jobMocks();
    m.state.transactionFails = true;
    await assert.rejects(m.summary.processSummaryJob(data), /DB unavailable/);
    assert.equal(m.state.calls.length, 1);
    assert.equal(m.state.jobs[0].status, 'FAILED');
    assert.equal(m.state.jobs[0].tokenUsage, undefined);
    assert.equal(m.state.jobs[0].estimatedCost, undefined);
    record('paid successful completion followed by DB transaction failure loses usage metadata', { providerAttempts: 1, status: 'FAILED', recordedTokens: null, recordedCost: null });
  }
  {
    const payload = { choices: [{ message: { content: 'not JSON' }, finish_reason: 'length' }], usage: { prompt_tokens: 100, completion_tokens: 2048 } };
    class FakeOpenAI { constructor() { this.chat = { completions: { create: async () => payload } }; } }
    const { AIProvider } = loadSource('packages/ai/src/provider.ts', { openai: FakeOpenAI });
    const provider = new AIProvider({ apiKey: 'audit-not-a-real-key', model: 'gpt-4o-mini' });
    let failure;
    try { await provider.completeJSON({ systemPrompt: 'JSON', userPrompt: 'audit synthetic content', parse: x => x }); } catch (error) { failure = error; }
    assert.match(failure.message, /invalid JSON/);
    assert.equal(failure.meta, undefined);
    record('provider parse error drops billed usage and finish_reason classification', { mockedBilledTokens: 2148, error: failure.message, usageOnError: null, finishReason: 'length' });
  }
  {
    const payload = { choices: [{ message: { content: '{}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 100, completion_tokens: 100 } };
    class FakeOpenAI { constructor() { this.chat = { completions: { create: async () => payload } }; } }
    const { AIProvider } = loadSource('packages/ai/src/provider.ts', { openai: FakeOpenAI });
    const response = await new AIProvider({ apiKey: 'audit-not-a-real-key', model: 'gpt-4.1' }).completeJSON({ systemPrompt: 'JSON', userPrompt: 'audit', parse: x => x });
    assert.equal(response.meta.estimatedCost, 0);
    record('unknown configured model reports zero estimated cost', { configuredModel: response.meta.model, actualUsageTokens: response.meta.totalTokens, estimatedCost: 0 });
  }
  {
    const SDK = require(path.join(root, 'packages/ai/node_modules/openai')).default;
    let httpAttempts = 0;
    let capturedClient;
    class MockTransportOpenAI extends SDK {
      constructor(config) {
        super({ ...config, fetch: async () => { httpAttempts++; return new Response(JSON.stringify({ error: { message: 'audit synthetic upstream failure', type: 'server_error' } }), { status: 500, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } }); } });
        capturedClient = this;
      }
    }
    const { AIProvider } = loadSource('packages/ai/src/provider.ts', { openai: MockTransportOpenAI });
    const provider = new AIProvider({ apiKey: 'audit-not-a-real-key', model: 'gpt-4o-mini' });
    const m = jobMocks(); m.state.complete = input => provider.completeJSON(input);
    // Two actual worker invocations model queue attempts: 2. All HTTP responses synthetic.
    await assert.rejects(m.summary.processSummaryJob(data));
    await assert.rejects(m.summary.processSummaryJob(data));
    assert.equal(httpAttempts, 6);
    assert.equal(capturedClient.maxRetries, 2);
    assert.equal(capturedClient.timeout, 600000);
    record('installed OpenAI SDK retries multiply two BullMQ attempts into six transport attempts', { logicalQueueAttempts: 2, SDKMaxRetries: capturedClient.maxRetries, SDKTimeoutMs: capturedClient.timeout, mockedHTTPAttempts: httpAttempts, failedAIJobRows: m.state.jobs.length, actualNetworkCalls: 0 });
  }
  {
    const imports = { zod: require(path.join(root, 'packages/shared/node_modules/zod')) };
    const { uploadDocumentSchema } = loadSource('packages/shared/src/schemas/document.ts', imports);
    const { File } = require('node:buffer');
    const body = new FormData();
    body.append('file', new File(['x'], 'ok.txt', { type: 'text/plain' }));
    body.append('ignored', new File([Buffer.alloc(11 * 1024 * 1024, 65)], 'junk.bin', { type: 'application/octet-stream' }));
    const request = new Request('http://audit.invalid/upload', { method: 'POST', body });
    const serialized = await request.clone().arrayBuffer();
    let accepted;
    const route = loadSource('apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts', {
      'next/server': { NextResponse: { json: (value, init) => new Response(JSON.stringify(value), { status: init.status, headers: { 'content-type': 'application/json' } }) } },
      '@/lib/auth': { auth: async () => ({ user: { id: 'audit-user' } }) },
      '@campusforge/db': { prisma: { membership: { findUnique: async () => ({ id: 'audit-member' }) } } },
      '@campusforge/shared': { uploadDocumentSchema },
      '@/server/services/document': { createDocument: async input => { accepted = input; return { ok: true, documentId: 'audit-doc' }; } },
    }, { File });
    const response = await route.POST(request, { params: { workspaceId: uploadInput().workspaceId } });
    assert.equal(response.status, 201);
    assert.equal(accepted.sizeBytes, 1);
    record('real multipart parser accepts >11MB total body when selected file is 1 byte', { totalSerializedBytes: serialized.byteLength, selectedFileBytes: accepted.sizeBytes, status: response.status });
  }
  {
    const summaryPrompts = loadSource('packages/ai/src/prompts/summary.ts');
    const flashcardPrompts = loadSource('packages/ai/src/prompts/flashcard.ts');
    const invalidSummary = summaryPrompts.parseSummaryOutput({ title: ' ', tldr: ' ', sections: [{ heading: '', content: '' }], keyTerms: [] });
    const invalidCards = flashcardPrompts.parseFlashcardOutput({ title: ' ', cards: [{ front: ' ', back: ' ' }] });
    assert.equal(invalidSummary.sections[0].content, '');
    assert.equal(invalidCards.cards.length, 1);
    const text = 'A'.repeat(48000) + 'AUDIT_END_SENTINEL';
    const prompt = summaryPrompts.buildSummaryUserPrompt(text, 'audit.txt');
    assert.equal(prompt.includes('AUDIT_END_SENTINEL'), false);
    record('runtime validators accept blank study content and long documents lose tail', { acceptedBlankSections: 1, acceptedBlankCards: 1, tailContentSent: false, truncationNoteInPrompt: prompt.includes('truncated') });
  }
  {
    // Same source in fresh VM isolates avoids category dedupe affecting determinism.
    const noRandomMath = Object.create(Math); noRandomMath.random = () => 0;
    const imports = { './models': {} };
    const contextA = { model: 'gpt-4.1', responseLength: 'balanced', temperature: 0, systemPrompt: 'Return only 123.' };
    const contextB = { ...contextA, temperature: 1, systemPrompt: 'Return only 456.' };
    const a = loadSource('apps/web/src/lib/assistant/engine.ts', imports, { Math: noRandomMath }).generateResponse('help me study', contextA);
    const b = loadSource('apps/web/src/lib/assistant/engine.ts', imports, { Math: noRandomMath }).generateResponse('help me study', contextB);
    assert.equal(a, b);
    const att = { id: 'att1', name: 'audit.txt', ext: 'txt', size: '14 B', kind: 'document' };
    const fileA = loadSource('apps/web/src/lib/assistant/engine.ts', imports, { Math: noRandomMath }).generateFileAnalysis([{ ...att, content: 'Cats eat fish.' }], contextA);
    const fileB = loadSource('apps/web/src/lib/assistant/engine.ts', imports, { Math: noRandomMath }).generateFileAnalysis([{ ...att, content: 'Stars are hot.' }], contextA);
    assert.equal(fileA, fileB);
    record('mock chat ignores system prompt temperature and differing attachment bytes', { textResponsesEqual: a === b, differingFileAnalysesEqual: fileA === fileB, contentRead: false });
  }
  process.stdout.write(JSON.stringify({ executedAt: new Date().toISOString(), sourceUnmodified: true, externalServices: 'in-memory mocks only', paidAICalls: 0, assertions: results.length, results }, null, 2) + '\n');
}
main().catch(error => { process.stderr.write(error.stack + '\n'); process.exitCode = 1; });
