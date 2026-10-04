import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { notFound } from 'next/navigation';
import { requireWorkspaceMember } from '@/server/services/auth-helpers';
import { getDocumentById } from '@/server/queries/document';
import { getDocumentSummary, getLatestAIJob } from '@/server/queries/summary';
import { getFlashcardSetsForDocument } from '@/server/queries/flashcard';
import { DocumentDetailView } from '@/components/document/document-detail-view';

export const metadata: Metadata = {
  title: 'Document',
};

/**
 * CampusForge document detail page — shows document info,
 * summary generation trigger, flashcard generation trigger,
 * and summary/flashcard display.
 */
export default async function DocumentDetailPage({
  params: paramsPromise,
}: {
  params: Promise<{ workspaceId: string; documentId: string }>;
}) {
  const params = await paramsPromise;
  const session = await auth();
  if (typeof session?.user?.id !== 'string' || !session.user.id) notFound();

  await requireWorkspaceMember(session.user.id, params.workspaceId);

  const document = await getDocumentById(params.documentId, params.workspaceId);
  if (!document) notFound();

  const [summary, latestSummaryJob, flashcardSets, latestFlashcardJob] = await Promise.all([
    getDocumentSummary(params.documentId, params.workspaceId),
    getLatestAIJob(params.documentId, 'SUMMARY'),
    getFlashcardSetsForDocument(params.documentId, params.workspaceId),
    getLatestAIJob(params.documentId, 'FLASHCARD'),
  ]);

  return (
    <div className="space-y-6">
      <DocumentDetailView
        document={document}
        summary={summary}
        summaryJob={latestSummaryJob}
        flashcardSets={flashcardSets}
        flashcardJob={latestFlashcardJob}
        workspaceId={params.workspaceId}
        identity={{ userId: session.user.id, workspaceId: params.workspaceId }}
      />
    </div>
  );
}
