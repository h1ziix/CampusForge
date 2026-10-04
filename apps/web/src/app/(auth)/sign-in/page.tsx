import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SignInForm } from '@/components/auth/sign-in-form';

export const metadata: Metadata = {
  title: 'Sign In',
};

/**
 * Suspense boundary is required because SignInForm uses useSearchParams(),
 * which causes the page to opt into client-side rendering.
 * Without Suspense, Next.js throws a build error.
 */
export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
