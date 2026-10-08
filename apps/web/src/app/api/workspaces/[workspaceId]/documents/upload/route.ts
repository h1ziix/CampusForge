/**
 * CampusForge document upload route handler.
 *
 * POST /api/workspaces/[workspaceId]/documents/upload
 *
 * Accepts multipart/form-data with a single "file" field.
 * Validates auth, workspace membership, file type, and size.
 * Uploads to S3, then atomically saves the document and durable parsing task.
 *
 * This is a Route Handler (not a Server Action) because file uploads
 * benefit from direct control over the request/response cycle and
 * allow the client to track upload progress via XHR/fetch.
 */
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@campusforge/db';
import { createDocument } from '@/server/services/document';
import { isTrustedMutationOrigin } from '@/lib/request-origin';
import { DocumentUploadError, readDocumentUpload } from '@/lib/document-upload';

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

  // 3. Bound actual body reads and multipart structure before platform parsing.
  let input: Awaited<ReturnType<typeof readDocumentUpload>>;
  try {
    input = await readDocumentUpload(request, params.workspaceId);
  } catch (error) {
    if (error instanceof DocumentUploadError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: 'Invalid file upload' }, { status: 400 });
  }

  // 4. Durable upload acceptance. Redis is outside the HTTP request path.
  try {
    const result = await createDocument(input);

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json(
      { documentId: result.documentId, processingStatus: 'PENDING' },
      { status: 201 },
    );
  } catch (error) {
    console.error('[CampusForge] Upload route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
