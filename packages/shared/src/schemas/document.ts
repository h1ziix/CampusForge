import { z } from 'zod';

/**
 * Allowed MIME types for CampusForge document uploads.
 * Kept intentionally narrow for MVP — only types we can actually parse.
 */
export const ALLOWED_DOCUMENT_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
] as const;

/**
 * Max file size: 10 MB.
 * Sized for lecture notes, syllabi, and research papers.
 */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

export const PROCESSING_STATUSES = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED'] as const;

/**
 * Validates metadata for a document upload.
 * Used server-side in the upload route handler.
 * The actual file bytes are handled separately (not part of Zod).
 */
export const uploadDocumentSchema = z.object({
  workspaceId: z.string().cuid(),
  filename: z.string().min(1, 'Filename is required').max(500, 'Filename too long'),
  mimeType: z
    .string()
    .refine(
      (type) => (ALLOWED_DOCUMENT_MIME_TYPES as readonly string[]).includes(type),
      'Unsupported file type. Allowed: PDF, TXT, Markdown.',
    ),
  sizeBytes: z
    .number()
    .int()
    .positive('File must not be empty')
    .max(MAX_DOCUMENT_SIZE_BYTES, 'File too large (max 10 MB)'),
});

export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
