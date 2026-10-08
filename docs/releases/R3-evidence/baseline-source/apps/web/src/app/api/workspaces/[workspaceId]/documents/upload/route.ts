/**
 * CampusForge document upload route handler.
 *
 * POST /api/workspaces/[workspaceId]/documents/upload
 *
 * Accepts multipart/form-data with a single "file" field.
 * Validates auth, workspace membership, file type, and size.
 * Uploads to S3, creates DB record, enqueues parsing job.
 *
 * This is a Route Handler (not a Server Action) because file uploads
 * benefit from direct control over the request/response cycle and
 * allow the client to track upload progress via XHR/fetch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@campusforge/db';
import { uploadDocumentSchema } from '@campusforge/shared';
import { createDocument } from '@/server/services/document';
import { isTrustedMutationOrigin } from '@/lib/request-origin';

export async function POST(
  request: NextRequest,
  { params: paramsPromise }: { params: Promise<{ workspaceId: string }> },
) {
  // Check before reading cookies, accessing DB or parsing attacker-controlled multipart data.
  if (!isTrustedMutationOrigin(request.headers)) {
    return NextResponse.json({ error: 'Untrusted request origin' }, { status: 403 });
  }
  const params = await paramsPromise;
  // 1. Auth check
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // 2. Workspace membership check
  const membership = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId: session.user.id,
        workspaceId: params.workspaceId,
      },
    },
    select: { id: true },
  });

  if (!membership) {
    return NextResponse.json({ error: 'Not a member of this workspace' }, { status: 403 });
  }

  // 3. Parse multipart form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: 'No file provided. Include a "file" field.' },
      { status: 400 },
    );
  }

  // 4. Validate file metadata
  const validation = uploadDocumentSchema.safeParse({
    workspaceId: params.workspaceId,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  });

  if (!validation.success) {
    const firstError = validation.error.errors[0]?.message ?? 'Invalid file';
    return NextResponse.json({ error: firstError }, { status: 400 });
  }

  // 5. Read file bytes
  let fileBuffer: Buffer;
  try {
    const arrayBuffer = await file.arrayBuffer();
    fileBuffer = Buffer.from(arrayBuffer);
  } catch {
    return NextResponse.json({ error: 'Failed to read file contents' }, { status: 400 });
  }

  // 6. Create document (S3 upload + DB record + enqueue parsing)
  try {
    const result = await createDocument({
      workspaceId: params.workspaceId,
      filename: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      fileBuffer,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ documentId: result.documentId }, { status: 201 });
  } catch (error) {
    console.error('[CampusForge] Upload route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
