'use client';

import { useEffect, useState } from 'react';
import { clearCampusForgeSensitiveStorage } from '@/lib/privacy';
import { SessionEnded, usePrivacyLease } from '@/lib/use-privacy-lease';

export function AuthenticatedPrivacyBoundary({
  children,
  userId,
}: {
  children: React.ReactNode;
  userId: string;
}) {
  return (
    <VerifiedSession key={userId} userId={userId}>
      {children}
    </VerifiedSession>
  );
}

function VerifiedSession({ children, userId }: { children: React.ReactNode; userId: string }) {
  const { revoked } = usePrivacyLease();
  const [status, setStatus] = useState<'checking' | 'verified' | 'unavailable'>('checking');
  const [verifiedOnce, setVerifiedOnce] = useState(false);

  useEffect(() => {
    let controller: AbortController | undefined;
    let disposed = false;
    async function verify() {
      controller?.abort();
      const request = new AbortController();
      controller = request;
      const timeout = window.setTimeout(() => request.abort(), 5000);
      try {
        const response = await fetch('/api/auth/session', {
          cache: 'no-store',
          credentials: 'same-origin',
          signal: request.signal,
        });
        if (!response.ok) throw new Error('Session unavailable');
        const session = (await response.json()) as { user?: { id?: unknown } } | null;
        if (disposed || request !== controller) return;
        if (session?.user?.id !== userId) {
          clearCampusForgeSensitiveStorage();
          return;
        }
        setVerifiedOnce(true);
        setStatus('verified');
      } catch {
        if (!disposed && request === controller) setStatus('unavailable');
      } finally {
        window.clearTimeout(timeout);
      }
    }
    // Cached RSC/back navigation must verify the current cookie before exposing
    // a previous server-rendered account's children. Also recheck on tab focus.
    void verify();
    const onFocus = () => {
      setStatus('checking');
      void verify();
    };
    window.addEventListener('focus', onFocus);
    return () => {
      disposed = true;
      controller?.abort();
      window.removeEventListener('focus', onFocus);
    };
  }, [userId]);

  if (revoked) return <SessionEnded />;
  return (
    <>
      {/* Hide private content while rechecking without discarding autosave-off
          conversations, attachment drafts or other same-session work. */}
      {verifiedOnce && (
        <div hidden={status !== 'verified'} aria-hidden={status !== 'verified'}>
          {children}
        </div>
      )}
      {status !== 'verified' && (
        <div
          className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center"
          role="status"
        >
          <p className="text-sm text-muted-foreground">
            {status === 'checking' ? 'Checking session...' : 'Unable to verify your session.'}
          </p>
          {status === 'unavailable' && (
            <button
              className="rounded-md text-sm font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => window.location.reload()}
            >
              Reload to try again
            </button>
          )}
        </div>
      )}
    </>
  );
}
