import assert from 'node:assert/strict';
import test from 'node:test';
import { applicationLoader } from '../../../tests/fixtures/r3-source-loader.mjs';

const workspaceId = 'csyntheticworkspace000000001';
const url = 'https://campusforge.example/api/workspaces/x/documents/upload';

function fixture(globals = {}) {
  const calls = { auth: 0, membership: 0, create: [] };
  const state = { authenticated: true, member: true, saveFails: false };
  const schema = applicationLoader().load('packages/shared/src/schemas/document.ts');
  const { load } = applicationLoader(
    {
      '@campusforge/shared': schema,
      '@/lib/auth': {
        auth: async () => {
          calls.auth++;
          return state.authenticated ? { user: { id: 'synthetic-user' } } : null;
        },
      },
      '@campusforge/db': {
        prisma: {
          membership: {
            findUnique: async () => {
              calls.membership++;
              return state.member ? { id: 'synthetic-member' } : null;
            },
          },
        },
      },
      '@/server/services/document': {
        createDocument: async (input) => {
          calls.create.push(input);
          return state.saveFails
            ? { ok: false, error: 'Synthetic save failure' }
            : { ok: true, documentId: 'synthetic-document' };
        },
      },
    },
    { AUTH_URL: 'https://campusforge.example' },
    globals,
  );
  const { POST } = load('apps/web/src/app/api/workspaces/[workspaceId]/documents/upload/route.ts');
  const helper = load('apps/web/src/lib/document-upload.ts');
  return {
    calls,
    state,
    helper,
    post: (request) => POST(request, { params: Promise.resolve({ workspaceId }) }),
  };
}

function multipart(parts, boundary = 'r3-synthetic-boundary') {
  const chunks = [];
  for (const {
    name = 'file',
    filename = 'notes.txt',
    mime = 'text/plain',
    text = 'Synthetic notes',
    extraHeaders = '',
  } of parts) {
    const disposition = `Content-Disposition: form-data; name="${name}"${filename === null ? '' : `; filename="${filename}"`}`;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\n${disposition}\r\n${filename === null ? '' : `Content-Type: ${mime}\r\n`}${extraHeaders}\r\n`,
      ),
    );
    chunks.push(Buffer.isBuffer(text) ? text : Buffer.from(text));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { bytes: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

function streamed(
  body,
  { headers = {}, chunks = 16 * 1024, signal, failAt, suspended = false } = {},
) {
  const observation = { reads: 0, bytes: 0, cancelled: 0 };
  let offset = 0;
  const stream = new ReadableStream(
    {
      pull(controller) {
        observation.reads++;
        if (suspended) return;
        if (failAt !== undefined && offset >= failAt) {
          controller.error(new Error('Synthetic disconnected client'));
          return;
        }
        if (offset === body.bytes.length) {
          controller.close();
          return;
        }
        const chunk = body.bytes.subarray(offset, Math.min(offset + chunks, body.bytes.length));
        offset += chunk.length;
        observation.bytes += chunk.length;
        controller.enqueue(chunk);
      },
      cancel() {
        observation.cancelled++;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request(url, {
    method: 'POST',
    headers: {
      origin: 'https://campusforge.example',
      'content-type': body.contentType,
      ...headers,
    },
    body: stream,
    duplex: 'half',
    signal,
  });
  return { request, observation };
}

test('actual upload Origin/auth/membership guards precede reading the multipart body', async () => {
  const f = fixture();
  for (const headers of [
    { origin: 'https://attacker.example' },
    { origin: 'null' },
    { origin: '' },
    { 'sec-fetch-site': 'same-site' },
  ]) {
    const r = streamed(multipart([{}]), { headers });
    assert.equal((await f.post(r.request)).status, 403);
    assert.equal(r.observation.reads, 0);
  }
  assert.equal(f.calls.auth, 0);
  f.state.authenticated = false;
  const anonymous = streamed(multipart([{}]));
  assert.equal((await f.post(anonymous.request)).status, 401);
  assert.equal(anonymous.observation.reads, 0);
  f.state.authenticated = true;
  f.state.member = false;
  const outsider = streamed(multipart([{}]));
  assert.equal((await f.post(outsider.request)).status, 403);
  assert.equal(outsider.observation.reads, 0);
  assert.equal(f.calls.create.length, 0);
});

test('actual route accepts one UTF-8 file at the exact file boundary and reports persisted PENDING', async () => {
  const f = fixture();
  for (const part of [
    { text: 'Синтетические заметки' },
    { filename: 'notes.md', mime: 'text/markdown', text: '# R3 notes' },
    { text: Buffer.alloc(10 * 1024 * 1024, 'x') },
    {
      filename: 'notes.pdf',
      mime: 'application/pdf',
      text: '%PDF-1.7\nsynthetic framing; parser verification is separate',
    },
  ]) {
    const response = await f.post(streamed(multipart([part])).request);
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), {
      documentId: 'synthetic-document',
      processingStatus: 'PENDING',
    });
  }
  assert.equal(f.calls.create.length, 4);
  assert.equal(f.calls.create[0].fileBuffer.toString('utf8'), 'Синтетические заметки');
  assert.equal(f.calls.create[2].fileBuffer.length, 10 * 1024 * 1024);
});

test('whole actual streamed body budget cannot be bypassed by absent, small, or malformed Content-Length', async () => {
  const f = fixture();
  const body = multipart([
    { text: 'x' },
    { name: 'ignored', filename: 'ignored.bin', text: Buffer.alloc(11 * 1024 * 1024) },
  ]);
  for (const headers of [{}, { 'content-length': '1' }, { 'content-length': 'invalid' }]) {
    const r = streamed(body, { headers });
    assert.equal((await f.post(r.request)).status, 413);
    assert.equal(r.observation.cancelled, 1);
    assert.ok(r.observation.bytes <= f.helper.MAX_MULTIPART_BODY_BYTES + 16 * 1024);
    assert.ok(r.observation.bytes < body.bytes.length);
  }
  const r = streamed(multipart([{}]), {
    headers: { 'content-length': String(f.helper.MAX_MULTIPART_BODY_BYTES + 1) },
  });
  assert.equal((await f.post(r.request)).status, 413);
  assert.equal(r.observation.reads, 0);
  assert.equal(r.observation.cancelled, 1);
  assert.equal(f.calls.create.length, 0);
});

test('actual route rejects oversized file, duplicate parts, ignored fields and malformed framing without persistence', async () => {
  const f = fixture();
  const cases = [
    [multipart([{ text: Buffer.alloc(10 * 1024 * 1024 + 1, 'x') }]), 413],
    [multipart([{}, {}]), 400],
    [multipart([{}, { name: 'ignored', filename: null, text: 'extra' }]), 400],
    [multipart([{ name: 'ignored', filename: null, text: Buffer.alloc(1025, 'x') }]), 413],
    [multipart([{ filename: `${'x'.repeat(501)}.txt` }]), 400],
    [multipart([{ extraHeaders: `X-Synthetic: ${'x'.repeat(8192)}\r\n` }]), 413],
    [multipart([{}], 'x'.repeat(71)), 400],
    [
      { bytes: Buffer.from('invalid multipart'), contentType: 'multipart/form-data; boundary=r3' },
      400,
    ],
  ];
  for (const [body, status] of cases)
    assert.equal((await f.post(streamed(body).request)).status, status);
  assert.equal(f.calls.create.length, 0);
});

test('actual route rejects client MIME spoofing and invalid UTF-8 bytes', async () => {
  const f = fixture();
  for (const part of [
    { filename: 'notes.pdf', mime: 'application/pdf', text: 'not PDF' },
    { filename: 'binary.txt', text: Buffer.from([0, 1, 2]) },
    { text: Buffer.from([0xff, 0xfe]) },
    { filename: 'script.exe', text: 'text' },
  ]) {
    assert.equal((await f.post(streamed(multipart([part])).request)).status, 415);
  }
  assert.equal(f.calls.create.length, 0);
});

test('actual route rejects disconnected/aborted streams, cancels hanging reads at finite deadline', async () => {
  const f = fixture({
    setTimeout(callback, ms, ...args) {
      return setTimeout(callback, ms === 30_000 ? 10 : ms, ...args);
    },
  });
  const partial = streamed(multipart([{ text: 'x'.repeat(10_000) }]), {
    chunks: 1000,
    failAt: 1000,
  });
  assert.equal((await f.post(partial.request)).status, 400);
  const controller = new AbortController();
  const aborted = streamed(multipart([{}]), { signal: controller.signal, suspended: true });
  const pending = f.post(aborted.request);
  setTimeout(() => controller.abort(), 2);
  assert.equal((await pending).status, 400);
  assert.equal(aborted.observation.cancelled, 1);
  const hung = streamed(multipart([{}]), { suspended: true });
  assert.equal((await f.post(hung.request)).status, 408);
  assert.equal(hung.observation.cancelled, 1);
  assert.equal(f.calls.create.length, 0);
});

test('actual route accepts a permitted file from many tiny stream chunks', async () => {
  const f = fixture();
  const body = multipart([{ text: 'x'.repeat(64 * 1024) }]);
  const tiny = streamed(body, { chunks: 1 });
  const response = await f.post(tiny.request);
  assert.equal(response.status, 201);
  assert.equal(tiny.observation.bytes, body.bytes.length);
  assert.equal(f.calls.create[0].fileBuffer.length, 64 * 1024);
});
