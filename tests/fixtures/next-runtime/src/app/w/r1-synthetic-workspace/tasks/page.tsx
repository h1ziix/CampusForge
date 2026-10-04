'use client';

import { SidebarWorkspaceNav } from '@/components/workspace/sidebar-workspace-nav';

export default function WorkspaceRegression() {
  return (
    <SidebarWorkspaceNav
      workspaces={[
        {
          id: 'r1-synthetic-workspace',
          name: 'R1 synthetic workspace',
          type: 'TEAM',
          role: 'OWNER',
        },
      ]}
    />
  );
}
