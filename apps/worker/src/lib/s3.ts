/**
 * CampusForge Worker — S3/MinIO client.
 *
 * Mirrors the web app's S3 client. Used to download documents
 * for text extraction during background processing.
 */
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

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
export async function getFromS3(key: string) {
  const response = await s3.send(
    new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    }),
  );
  return response.Body;
}
