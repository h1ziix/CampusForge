/**
 * CampusForge Worker — S3/MinIO client.
 *
 * Mirrors the web app's S3 client. Used to download documents
 * for text extraction during background processing.
 */
import {
  S3Client,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY!,
    secretAccessKey: process.env.S3_SECRET_KEY!,
  },
  forcePathStyle: true,
});

const BUCKET = process.env.S3_BUCKET ?? 'campusforge';

/**
 * Download a file from S3/MinIO.
 * Returns the readable stream body.
 */
export async function getFromS3(key: string, signal?: AbortSignal) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
    { abortSignal: signal },
  );
  return response.Body;
}

export async function deleteFromS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }), {
    abortSignal: AbortSignal.timeout(30_000),
  });
}

export async function deleteUploadFromS3(key: string, uploadId: string): Promise<void> {
  try {
    const object = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }), {
      abortSignal: AbortSignal.timeout(30_000),
    });
    if (object.Metadata?.['campusforge-upload-id'] !== uploadId) return;
    await deleteFromS3(key);
  } catch (error) {
    const response = error as { $metadata?: { httpStatusCode?: number } };
    if (response.$metadata?.httpStatusCode === 404) return;
    throw error;
  }
}
