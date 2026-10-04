import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { PrismaAdapter } from '@auth/prisma-adapter';
import bcrypt from 'bcryptjs';
import { prisma } from '@campusforge/db';
import {
  signInSchema,
  storedPasswordPolicy,
  BCRYPT_PASSWORD_MAX_BYTES,
  passwordByteLength,
  isWellFormedPassword,
} from '@campusforge/shared';
import { authConfig } from './auth.config';
import { enforcePasswordBudget, PasswordBudgetError } from './auth-rate-limit';
import { PasswordRequestRejected } from './auth-errors';

// Cost 12, random synthetic input. Missing accounts also perform one bounded compare.
const DUMMY_PASSWORD_HASH = '$2b$12$DZVaID1hY0XzgbEmVzvpOeCNzkbzW5acWrCuQbiNe2v7oFmvp5kbq';

/**
 * CampusForge NextAuth configuration — full Node.js version.
 *
 * Extends the Edge-safe authConfig with:
 * - Prisma adapter (database sessions for future OAuth)
 * - Credentials provider (bcryptjs password verification)
 *
 * Used by: API route handler, server actions, server components.
 * NOT used by: middleware (uses auth.config.ts instead).
 *
 * NOTE: Exports are assigned individually (not destructured at export)
 * to work around a TypeScript type-portability issue in monorepos
 * with NextAuth v5 beta. See: https://github.com/nextauthjs/next-auth/issues/9493
 */
const nextAuth = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  callbacks: {
    ...authConfig.callbacks,
    async jwt(params) {
      const token = await authConfig.callbacks!.jwt!(params);
      if (!token || params.trigger !== 'update') return token;
      // The encrypted JWT identity is the only selector. Never read params.session.
      if (typeof token.id !== 'string' || token.id.length > 128) return null;
      const user = await prisma.user.findUnique({
        where: { id: token.id },
        select: { id: true, email: true, name: true, role: true, onboardingCompleted: true },
      });
      if (!user) return null;
      token.id = user.id;
      token.name = user.name?.slice(0, 100) ?? null;
      token.email = user.email.slice(0, 320);
      token.role = user.role;
      token.onboardingCompleted = user.onboardingCompleted;
      return token;
    },
  },
  providers: [
    Credentials({
      credentials: {
        email: {},
        password: {},
      },
      async authorize(credentials, request) {
        try {
          await enforcePasswordBudget(
            'credentials',
            typeof credentials.email === 'string' ? credentials.email : '',
            request.headers,
          );
        } catch (error) {
          if (error instanceof PasswordBudgetError) throw new PasswordRequestRejected(error);
          throw error;
        }
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        const user = await prisma.user.findUnique({
          where: { email: email.toLowerCase().trim() },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            role: true,
            onboardingCompleted: true,
          },
        });

        const policy = storedPasswordPolicy(user?.passwordHash ?? DUMMY_PASSWORD_HASH);
        const withinPolicy =
          !policy.strictBytes ||
          (isWellFormedPassword(password) &&
            passwordByteLength(password) <= BCRYPT_PASSWORD_MAX_BYTES);
        // Still do one cost-equivalent compare for rejected strict inputs.
        const valid = await bcrypt.compare(password, policy.hash);
        if (!valid || !withinPolicy || !user?.passwordHash) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          onboardingCompleted: user.onboardingCompleted,
        };
      },
    }),
  ],
});

export const handlers = nextAuth.handlers;
export const auth = nextAuth.auth;
export const signIn = nextAuth.signIn;
export const signOut = nextAuth.signOut;
