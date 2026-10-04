import type { NextAuthConfig } from 'next-auth';
import { safePostLoginPath } from './auth-redirect';

/**
 * CampusForge NextAuth configuration — Edge-safe portion.
 *
 * This file contains ONLY config that can run in the Edge Runtime
 * (middleware). No bcryptjs, no Prisma, no Node.js APIs.
 *
 * The full auth config in auth.ts extends this with providers and adapter.
 */
export const authConfig: NextAuthConfig = {
  pages: {
    signIn: '/sign-in',
  },
  providers: [], // Providers are added in auth.ts (not Edge-safe)
  callbacks: {
    /**
     * JWT callback: runs on sign-in and every subsequent request.
     * On initial sign-in, `user` is present — we copy fields into the token.
     * On subsequent requests, the token already carries these fields.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.onboardingCompleted = user.onboardingCompleted;
      }

      // Client update payloads are never claims. DB refresh lives in Node auth.ts.
      return token;
    },

    async redirect({ url, baseUrl }) {
      return `${new URL(baseUrl).origin}${safePostLoginPath(url, baseUrl)}`;
    },

    /**
     * Session callback: shapes what components see via useSession / auth().
     * Maps JWT token fields into the session.user object.
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.onboardingCompleted = token.onboardingCompleted as boolean;
      }
      return session;
    },
  },
};
