import {
  MAX_DOCUMENT_SIZE_BYTES,
  resolveDocumentMimeType,
  uploadDocumentSchema,
} from '@campusforge/shared';

export const MAX_MULTIPART_BODY_BYTES = MAX_DOCUMENT_SIZE_BYTES + 64 * 1024;
export const MAX_MULTIPART_HEADER_BYTES = 8 * 1024;
export const MAX_MULTIPART_FIELD_BYTES = 1024;
export const DOCUMENT_UPLOAD_READ_DEADLINE_MS = 30_000;
const MAX_FILENAME_BYTES = 2048;
const MAX_MIME_TYPE_BYTES = 128;

export class DocumentUploadError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 408 | 413 | 415,
  ) {
    super(message);
    this.name = 'DocumentUploadError';
  }
}

function boundaryFromHeaders(headers: Headers): string {
  const contentType = headers.get('content-type') ?? '';
  if (contentType.length > 256) {
    throw new DocumentUploadError('Multipart metadata is too large', 413);
  }
  const match = /^multipart\/form-data\s*;\s*boundary=(?:"([^"]+)"|([^\s;]+))\s*$/i.exec(
    contentType,
  );
  const boundary = match?.[1] ?? match?.[2];
  if (!boundary || !/^[0-9A-Za-z'()+_,./:=? -]{1,70}$/.test(boundary) || boundary.endsWith(' ')) {
    throw new DocumentUploadError('Invalid multipart boundary', 400);
  }
  return boundary;
}

async function readBoundedBody(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const length = request.headers.get('content-length');
  // A declared length is only an early rejection; actual streamed bytes remain authoritative.
  if (length && /^\d+$/.test(length) && Number(length) > MAX_MULTIPART_BODY_BYTES) {
    void request.body?.cancel().catch(() => {});
    throw new DocumentUploadError('Upload body is too large', 413);
  }
  if (!request.body || request.signal.aborted) {
    void request.body?.cancel().catch(() => {});
    throw new DocumentUploadError('Upload was interrupted', 400);
  }

  const reader = request.body.getReader();
  // One fixed allocation avoids unbounded per-chunk bookkeeping for tiny chunks.
  const bytes = new Uint8Array(MAX_MULTIPART_BODY_BYTES);
  const expiresAt = performance.now() + DOCUMENT_UPLOAD_READ_DEADLINE_MS;
  let used = 0;
  let stopError: DocumentUploadError | undefined;
  const stop = (error: DocumentUploadError) => {
    stopError = error;
    // Cancellation settles an outstanding read; it cannot later continue parsing the body.
    void reader.cancel(error).catch(() => {});
  };
  const onAbort = () => stop(new DocumentUploadError('Upload was interrupted', 400));
  request.signal.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(
    () => stop(new DocumentUploadError('Upload read deadline exceeded', 408)),
    DOCUMENT_UPLOAD_READ_DEADLINE_MS,
  );

  try {
    while (true) {
      // A pre-buffered stream of tiny chunks can keep the microtask queue busy.
      // Check monotonic time too, so the deadline does not rely on timer fairness.
      if (performance.now() >= expiresAt) {
        stop(new DocumentUploadError('Upload read deadline exceeded', 408));
      }
      if (stopError) throw stopError;
      // cancel() resolves pending reads even when the source cancellation itself
      // is asynchronous; no shared never-settled promise accumulates reactions.
      const chunk = await reader.read();
      if (stopError) throw stopError;
      if (chunk.done) break;
      if (chunk.value.byteLength > MAX_MULTIPART_BODY_BYTES - used) {
        throw new DocumentUploadError('Upload body is too large', 413);
      }
      bytes.set(chunk.value, used);
      used += chunk.value.byteLength;
    }
    if (request.signal.aborted) throw new DocumentUploadError('Upload was interrupted', 400);
    return bytes.subarray(0, used);
  } catch (error) {
    void reader.cancel(error).catch(() => {});
    if (error instanceof DocumentUploadError) throw error;
    throw new DocumentUploadError('Upload was interrupted or malformed', 400);
  } finally {
    clearTimeout(timer);
    request.signal.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
}

/**
 * Validate framing and part/header budgets before the platform allocates FormData entries.
 * Only the browser's single-file form is supported; text fields have no application meaning.
 */
function validateMultipartFraming(bytes: Uint8Array, boundary: string): void {
  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const opening = Buffer.from(`--${boundary}\r\n`);
  const delimiter = Buffer.from(`\r\n--${boundary}`);
  if (!body.subarray(0, opening.length).equals(opening)) {
    throw new DocumentUploadError('Invalid multipart body', 400);
  }
  let offset = opening.length;
  let parts = 0;
  while (true) {
    parts += 1;
    if (parts > 1) throw new DocumentUploadError('Exactly one file part is required', 400);
    const headerEnd = body.indexOf('\r\n\r\n', offset);
    if (headerEnd === -1) throw new DocumentUploadError('Invalid multipart headers', 400);
    if (headerEnd - offset > MAX_MULTIPART_HEADER_BYTES) {
      throw new DocumentUploadError('Multipart headers are too large', 413);
    }
    let headers: string;
    try {
      headers = new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(offset, headerEnd));
    } catch {
      throw new DocumentUploadError('Invalid multipart metadata', 400);
    }
    const lines = headers.split('\r\n');
    if (lines.length > 8 || lines.some((line) => !/^[\w-]+: /.test(line))) {
      throw new DocumentUploadError('Unsupported multipart headers', 400);
    }
    const dispositions = lines.filter((line) => /^content-disposition:/i.test(line));
    const types = lines.filter((line) => /^content-type:/i.test(line));
    if (dispositions.length !== 1 || types.length > 1) {
      throw new DocumentUploadError('Invalid multipart metadata', 400);
    }
    if (
      types[0] &&
      Buffer.byteLength(types[0].slice('content-type:'.length).trim()) > MAX_MIME_TYPE_BYTES
    ) {
      throw new DocumentUploadError('File type metadata is too large', 413);
    }

    const contentStart = headerEnd + 4;
    // MIME boundaries count only when followed by CRLF or the closing -- marker.
    let partEnd = body.indexOf(delimiter, contentStart);
    while (partEnd !== -1) {
      const suffix = body.subarray(partEnd + delimiter.length, partEnd + delimiter.length + 2);
      if (suffix.equals(Buffer.from('--')) || suffix.equals(Buffer.from('\r\n'))) break;
      partEnd = body.indexOf(delimiter, partEnd + delimiter.length);
    }
    if (partEnd === -1) throw new DocumentUploadError('Incomplete multipart body', 400);
    const isFile = /;\s*filename\s*=/i.test(dispositions[0]!);
    if (!isFile && partEnd - contentStart > MAX_MULTIPART_FIELD_BYTES) {
      throw new DocumentUploadError('Text field is too large', 413);
    }
    if (!isFile || !/;\s*name="file"(?:;|$)/i.test(dispositions[0]!)) {
      throw new DocumentUploadError('Only the file field is supported', 400);
    }
    if (partEnd - contentStart > MAX_DOCUMENT_SIZE_BYTES) {
      throw new DocumentUploadError('File too large (max 10 MB)', 413);
    }
    offset = partEnd + delimiter.length;
    if (body.subarray(offset, offset + 2).equals(Buffer.from('--'))) {
      offset += 2;
      if (body.subarray(offset, offset + 2).equals(Buffer.from('\r\n'))) offset += 2;
      if (offset !== body.length)
        throw new DocumentUploadError('Unexpected multipart epilogue', 400);
      return;
    }
    offset += 2;
  }
}

function validateDocumentBytes(filename: string, mimeType: string, buffer: Buffer): void {
  const extension = filename.split('.').at(-1)?.toLowerCase();
  // Client MIME is a hint. Bytes and extension must also match a supported parser format.
  if (mimeType === 'application/pdf') {
    if (extension !== 'pdf' || !buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
      throw new DocumentUploadError('File contents do not match a PDF document', 415);
    }
    return;
  }
  if (
    (mimeType === 'text/plain' && extension !== 'txt') ||
    (mimeType === 'text/markdown' && extension !== 'md' && extension !== 'markdown')
  ) {
    throw new DocumentUploadError('File extension does not match its document type', 415);
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    throw new DocumentUploadError('Text documents must use UTF-8 encoding', 415);
  }
  if (/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/.test(text)) {
    throw new DocumentUploadError('Binary content is not a supported text document', 415);
  }
}

export async function readDocumentUpload(request: Request, workspaceId: string) {
  let boundary: string;
  try {
    boundary = boundaryFromHeaders(request.headers);
  } catch (error) {
    void request.body?.cancel().catch(() => {});
    throw error;
  }
  const bytes = await readBoundedBody(request);
  validateMultipartFraming(bytes, boundary);
  let form: FormData;
  try {
    // The full buffer is already bounded, with at most one part and bounded headers.
    form = await new Response(bytes, {
      headers: { 'content-type': request.headers.get('content-type')! },
    }).formData();
  } catch {
    throw new DocumentUploadError('Invalid form data', 400);
  }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0]?.[0] !== 'file' || !(entries[0][1] instanceof File)) {
    throw new DocumentUploadError('Exactly one file field is required', 400);
  }
  const file = entries[0][1];
  if (
    Buffer.byteLength(file.name, 'utf8') > MAX_FILENAME_BYTES ||
    Buffer.byteLength(file.type) > MAX_MIME_TYPE_BYTES
  ) {
    throw new DocumentUploadError('File metadata is too large', 413);
  }
  const validation = uploadDocumentSchema.safeParse({
    workspaceId,
    filename: file.name,
    mimeType: resolveDocumentMimeType(file.name, file.type),
    sizeBytes: file.size,
  });
  if (!validation.success) {
    throw new DocumentUploadError(validation.error.errors[0]?.message ?? 'Invalid file', 400);
  }
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  validateDocumentBytes(file.name, validation.data.mimeType, fileBuffer);
  return { ...validation.data, fileBuffer };
}
