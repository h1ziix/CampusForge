// Test-only synthetic persistence; no real database or Redis endpoints are used.
export interface SyntheticUser {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  role: string;
  onboardingCompleted: boolean;
}
export interface FixtureState {
  users: Map<string, SyntheticUser>;
  budgets: Map<string, { count: number; expiresAt: number }>;
  counters: { lookups: number; compares: number; hashes: number; writes: number; uploads: number };
  outage: boolean;
}
const fixtureGlobal = globalThis as typeof globalThis & { __campusForgeR2Fixture?: FixtureState };
export function fixtureState(): FixtureState {
  return (fixtureGlobal.__campusForgeR2Fixture ??= {
    users: new Map(),
    budgets: new Map(),
    outage: false,
    counters: { lookups: 0, compares: 0, hashes: 0, writes: 0, uploads: 0 },
  });
}
