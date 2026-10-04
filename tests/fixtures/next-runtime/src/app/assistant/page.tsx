'use client';

import { AssistantApp } from '@/components/assistant/assistant-app';

export default function AssistantRegression() {
  return (
    <main className="p-6">
      <AssistantApp
        identity={{ userId: 'r1-synthetic-user', workspaceId: 'r1-synthetic-workspace' }}
        user={{ name: 'R1 Synthetic User', email: 'synthetic@example.test' }}
      />
    </main>
  );
}
