'use client';

import { useState } from 'react';
import { AssistantApp } from '@/components/assistant/assistant-app';
import { SignOutButton } from '@/components/auth/sign-out-button';

export default function PrivacyFixture({ initialUser }: { initialUser: 'a' | 'b' }) {
  const [identity, setIdentity] = useState({
    userId: `r2-user-${initialUser}`,
    workspaceId: 'ws1',
  });
  return (
    <main>
      <header className="flex flex-wrap items-center gap-2 border-b p-2">
        <p className="text-xs">Synthetic trusted identity fixture</p>
        {(['a', 'b'] as const).flatMap((user) =>
          ['ws1', 'ws2'].map((workspaceId) => (
            <button
              key={`${user}/${workspaceId}`}
              onClick={() => setIdentity({ userId: `r2-user-${user}`, workspaceId })}
            >
              {user.toUpperCase()}/{workspaceId}
            </button>
          )),
        )}
        <SignOutButton />
        <output data-testid="privacy-identity">
          {identity.userId}/{identity.workspaceId}
        </output>
      </header>
      <section className="p-6">
        <AssistantApp
          identity={identity}
          user={{ name: identity.userId, email: `${identity.userId}@example.test` }}
        />
      </section>
    </main>
  );
}
