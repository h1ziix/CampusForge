import type { Metadata } from 'next';
import { auth } from '@/lib/auth';
import { APP_NAME } from '@campusforge/shared';
import { OnboardingForm } from '@/components/onboarding/onboarding-form';
import { SessionProvider } from 'next-auth/react';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'Onboarding',
};

/**
 * CampusForge onboarding page.
 *
 * This page is only accessible to authenticated users who have not
 * completed onboarding (enforced by middleware).
 *
 * SessionProvider wraps OnboardingForm so it can call `useSession().update()`
 * to sync the JWT after profile completion.
 */
export default async function OnboardingPage() {
  const session = await auth();
  if (typeof session?.user?.id !== 'string' || session.user.id.length === 0) {
    redirect('/sign-in');
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold">{APP_NAME}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Let&apos;s set up your academic profile
        </p>
      </div>
      <div className="w-full max-w-sm">
        <SessionProvider session={session}>
          <OnboardingForm userName={session?.user?.name} />
        </SessionProvider>
      </div>
    </div>
  );
}
