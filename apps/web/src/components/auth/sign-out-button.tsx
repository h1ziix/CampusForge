'use client';

import { useTransition } from 'react';
import { signOut } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { LogOut } from 'lucide-react';
import { clearCampusForgeSensitiveStorage } from '@/lib/privacy';

export function SignOutButton() {
  const [isPending, startTransition] = useTransition();

  function handleSignOut() {
    // Revoke live state and queued writes before the network logout begins.
    clearCampusForgeSensitiveStorage();
    startTransition(async () => {
      try {
        await signOut({ callbackUrl: '/sign-in' });
      } catch {
        // Sensitive views already show the local-session boundary. Its explicit
        // retry action can complete network logout without restoring content.
      }
    });
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isPending}>
      <LogOut className="mr-2 h-4 w-4" />
      {isPending ? 'Signing out...' : 'Sign Out'}
    </Button>
  );
}
