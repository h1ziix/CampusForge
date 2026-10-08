/**
 * CampusForge S3/MinIO storage client.
 *
 * Used server-side only (Route Handlers, Server Actions).
 * Connects to MinIO in development, real S3 in production.
 * forcePathStyle is required for MinIO compatibility.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';

export const S3_OPERATION_DEADLINE_MS = 30_000;

/** New uploads use immutable identities. Existing object keys remain untouched. */
export function documentStorageKey(workspaceId: string, documentId: string): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId) || !/^[a-f0-9-]{36}$/i.test(documentId)) {
    throw new Error('Invalid document storage identity');
  }
  return `documents/${workspaceId}/${documentId}`;
}

export function isS3ObjectAlreadyPresent(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    '$metadata' in error &&
    (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 412
  );
}

function originalFilenameMetadata(filename?: string): Record<string, string> {
  if (!filename) return {};
  try {
    const encoded = encodeURIComponent(filename);
    // S3 user metadata has a 2 KiB total budget. The exact name always lives in
    // PostgreSQL; omit an optional display copy rather than truncate its value.
    return Buffer.byteLength(encoded) <= 1024 ? { 'original-filename': encoded } : {};
  } catch {
    return {};
  }
}

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
    maxAttempts: 1,
  });
}

// Lazy singleton — created on first use, avoids issues during build
let _client: S3Client | null = null;
function client(): S3Client {
  if (!_client) _client = getS3Client();
  return _client;
}

const BUCKET = process.env.S3_BUCKET ?? 'campusforge';

/**
 * Upload a file to S3/MinIO.
 * @param key - Immutable object key, e.g. "documents/workspace123/upload-uuid"
 * @param body  - File contents as Buffer
 * @param contentType - MIME type
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
  filename?: string,
  uploadId?: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      IfNoneMatch: '*',
      Metadata: {
        ...originalFilenameMetadata(filename),
        ...(uploadId ? { 'campusforge-upload-id': uploadId } : {}),
      },
    }),
    { abortSignal: AbortSignal.timeout(S3_OPERATION_DEADLINE_MS) },
  );
}

/**
 * Download a file from S3/MinIO.
 * Returns the readable stream body.
 */
export async function getFromS3(key: string) {
  const response = await client().send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
    { abortSignal: AbortSignal.timeout(S3_OPERATION_DEADLINE_MS) },
  );
  return response.Body;
}

/**
 * Delete a file from S3/MinIO.
 */
export async function deleteFromS3(key: string): Promise<void> {
  await client().send(
    new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
    { abortSignal: AbortSignal.timeout(S3_OPERATION_DEADLINE_MS) },
  );
}
