import { cn } from '@/lib/utils';
import { PROCESSING_STATUS_LABELS } from '@campusforge/shared';
import { Loader2 } from 'lucide-react';

const statusColors: Record<string, string> = {
  PENDING:
    'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/35 dark:text-amber-300 dark:border-amber-800/60',
  PROCESSING:
    'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/35 dark:text-blue-300 dark:border-blue-800/60',
  COMPLETED:
    'bg-green-50 text-green-700 border-green-200 dark:bg-green-950/35 dark:text-green-300 dark:border-green-800/60',
  FAILED:
    'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/35 dark:text-red-300 dark:border-red-800/60',
};

interface DocumentStatusBadgeProps {
  status: string;
  className?: string;
}

/**
 * Colored processing status badge for CampusForge documents.
 * Shows a spinner icon for PROCESSING state.
 */
export function DocumentStatusBadge({ status, className }: DocumentStatusBadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium leading-none shadow-sm',
        statusColors[status] ?? statusColors.PENDING,
        className,
      )}
    >
      {status === 'PROCESSING' && <Loader2 className="h-3 w-3 animate-spin" />}
      {PROCESSING_STATUS_LABELS[status] ?? status}
    </span>
  );
}
