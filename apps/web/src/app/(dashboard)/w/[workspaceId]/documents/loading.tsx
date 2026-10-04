import { DocumentListSkeleton } from '@/components/document/document-list';

/**
 * Loading state for the documents page.
 * Next.js wraps the page in a Suspense boundary using this file.
 */
export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <DocumentListSkeleton />
    </div>
  );
}
