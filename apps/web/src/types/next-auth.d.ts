import { DefaultSession } from 'next-auth';

/**
 * CampusForge NextAuth type extensions.
 *
 * Extends the default session and JWT types to include
 * CampusForge-specific user fields (role, onboardingCompleted).
 */
declare module 'next-auth' {
  interface User {
    role?: string;
    onboardingCompleted?: boolean;
  }

  interface Session {
    user: {
      id: string;
      role: string;
      onboardingCompleted: boolean;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    onboardingCompleted?: boolean;
  }
}
