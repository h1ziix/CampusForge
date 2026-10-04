'use client';

import { useState, version } from 'react';
import { CreateTaskDialog } from '@/components/task/create-task-dialog';

export default function RuntimeRegression() {
  const [open, setOpen] = useState(true);
  return (
    <main>
      <p data-testid="react-version">{version}</p>
      <CreateTaskDialog
        open={open}
        onOpenChange={setOpen}
        workspaceId="r1-synthetic-workspace"
        members={[]}
      />
    </main>
  );
}
