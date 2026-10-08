/**
 * CampusForge application-wide constants.
 */

export const APP_NAME = 'CampusForge';

export const TASK_STATUS_LABELS: Record<string, string> = {
  TODO: 'To Do',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

export const TASK_PRIORITY_LABELS: Record<string, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent',
};

export const WORKSPACE_TYPE_LABELS: Record<string, string> = {
  PERSONAL: 'Personal',
  TEAM: 'Team',
  RESEARCH: 'Research',
};

export const NOTE_SOURCE_LABELS: Record<string, string> = {
  MANUAL: 'Manual',
  AI_GENERATED: 'AI Generated',
  IMPORTED: 'Imported',
};

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Queued for parsing',
  PROCESSING: 'Parsing',
  COMPLETED: 'Text extracted',
  FAILED: 'Parsing failed',
};

/**
 * Human-readable file type labels keyed by MIME type.
 */
export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'text/plain': 'Text',
  'text/markdown': 'Markdown',
};
