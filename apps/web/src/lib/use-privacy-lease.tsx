'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import {
  createSensitiveLease,
  getPrivacySnapshot,
  subscribeToLogout,
  type SensitiveLease,
} from '@/lib/privacy';
import { useClientReady } from '@/lib/use-client-ready';

export function usePrivacyLease() {
  const hydrated = useClientReady();
  const [lease, setLease] = useState<SensitiveLease | null>(null);
  // React rechecks snapshots between render and subscription, closing the
  // hydration gap where a passive-effect listener could miss a logout.
  useSyncExternalStore(subscribeToLogout, getPrivacySnapshot, serverSnapshot);
  // Acquire against browser storage after hydration, never against the SSR epoch.
  if (hydrated && lease === null) setLease(createSensitiveLease());
  return { lease, revoked: lease !== null && !lease.isValid() };
}

const serverSnapshot = () => 'server';

export function SessionEnded() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const retry = () => {
    setError(null);
    startTransition(async () => {
      try {
        await signOut({ callbackUrl: '/sign-in' });
      } catch {
        setError('Unable to sign out. Check your connection and try again.');
      }
    });
  };
  return (
    <div
      className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center"
      role="status"
    >
      <p className="text-sm text-muted-foreground">Local session cleared. Sign in to continue.</p>
      <Button variant="outline" size="sm" onClick={retry} disabled={pending}>
        {pending ? 'Signing out...' : 'Retry sign out'}
      </Button>
      {error && (
        <p className="max-w-sm text-sm text-error-foreground" role="alert">
          {error}
        </p>
      )}
      <a
        href="/sign-in"
        className="rounded-md text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Sign in
      </a>
    </div>
  );
}
