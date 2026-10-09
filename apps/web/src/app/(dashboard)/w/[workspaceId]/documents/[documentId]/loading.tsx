import { Skeleton } from '@/components/ui/skeleton';

export default function DocumentDetailLoading() {
  return (
    <div
      role="status"
      aria-label="Loading document"
      aria-busy="true"
      className="flex min-w-0 flex-col gap-6"
    >
      <span className="sr-only">Loading document...</span>
      <div aria-hidden="true" className="flex min-w-0 flex-col gap-6">
        {/* Back link */}
        <Skeleton className="h-5 w-32" />

        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <Skeleton className="mt-1 size-6 shrink-0 rounded" />
            <div className="min-w-0 flex-1">
              <Skeleton className="h-8 w-full max-w-64" />
              <Skeleton className="mt-2 h-4 w-full max-w-48" />
            </div>
          </div>
          <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
        </div>

        {/* Summary section */}
        <div className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="h-9 w-40" />
          </div>
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}
