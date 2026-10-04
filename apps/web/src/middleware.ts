import NextAuth from 'next-auth';
import { authConfig } from '@/lib/auth.config';
import { NextResponse } from 'next/server';

/**
 * CampusForge route protection middleware.
 *
 * Uses the Edge-safe auth config (no bcryptjs, no Prisma).
 * JWT validation runs in Edge Runtime — only the token is decoded,
 * no database calls.
 *
 * Handles:
 * 1. Redirect unauthenticated users away from protected routes
 * 2. Redirect authenticated users away from auth pages
 * 3. Redirect non-onboarded users to /onboarding
 */
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const { nextUrl } = req;
  const userId = req.auth?.user?.id;
  const isSignedIn = typeof userId === 'string' && userId.length > 0;
  const hasOnboarded = req.auth?.user?.onboardingCompleted === true;
  const path = nextUrl.pathname;

  // Auth pages: redirect signed-in users to dashboard
  const isAuthPage = path.startsWith('/sign-in') || path.startsWith('/sign-up');
  if (isAuthPage && isSignedIn) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl));
  }

  // Protected routes: /dashboard, /w/*, /onboarding
  const isProtectedRoute =
    path.startsWith('/dashboard') || path.startsWith('/w/') || path.startsWith('/onboarding');

  if (isProtectedRoute && !isSignedIn) {
    const callbackUrl = encodeURIComponent(path);
    return NextResponse.redirect(new URL(`/sign-in?callbackUrl=${callbackUrl}`, nextUrl));
  }

  // Onboarding enforcement: signed-in users who haven't completed
  // onboarding are redirected to /onboarding (unless already there)
  if (isSignedIn && !hasOnboarded && (path.startsWith('/dashboard') || path.startsWith('/w/'))) {
    return NextResponse.redirect(new URL('/onboarding', nextUrl));
  }

  // Already onboarded users shouldn't see onboarding again
  if (isSignedIn && hasOnboarded && path.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/dashboard', nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Match all routes except static files and API routes
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
