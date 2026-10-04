'use client';

import { createContext, useContext } from 'react';

/**
 * The workspace data shape passed through context.
 * Populated by the workspace layout (server component),
 * consumed by client components (switcher, nav, pages).
 */
export interface WorkspaceContextValue {
  id: string;
  name: string;
  type: string;
  role: string;
  memberCount: number;
  taskCount: number;
  noteCount: number;
  documentCount: number;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

/**
 * Hook to access the current CampusForge workspace.
 * Must be called within a WorkspaceProvider (inside /w/[workspaceId] layout).
 */
export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error(
      'useWorkspace must be used within a WorkspaceProvider. ' +
        'This usually means you are rendering outside of /w/[workspaceId].',
    );
  }
  return ctx;
}

/**
 * Provider component. Used in the workspace layout to inject
 * server-fetched workspace data into the client component tree.
 */
export function WorkspaceProvider({
  workspace,
  children,
}: {
  workspace: WorkspaceContextValue;
  children: React.ReactNode;
}) {
  return <WorkspaceContext.Provider value={workspace}>{children}</WorkspaceContext.Provider>;
}
