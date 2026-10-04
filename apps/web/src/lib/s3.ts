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

function getS3Client(): S3Client {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION ?? 'us-east-1',
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY!,
      secretAccessKey: process.env.S3_SECRET_KEY!,
    },
    forcePathStyle: true,
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
 * @param key   - Object key (e.g. "documents/workspace123/1713200000000-file.pdf")
 * @param body  - File contents as Buffer
 * @param contentType - MIME type
 */
export async function uploadToS3(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string,
): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
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
  );
}
