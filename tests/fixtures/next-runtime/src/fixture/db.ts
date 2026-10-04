import bcrypt from 'bcryptjs';
import { fixtureState, type SyntheticUser } from './state';

export function resetFixture() {
  const state = fixtureState();
  state.budgets.clear();
  state.users.clear();
  state.outage = false;
  state.counters = { lookups: 0, compares: 0, hashes: 0, writes: 0, uploads: 0 };
  // Low-cost synthetic seed hash only; actual application signup still uses cost 12.
  for (const id of ['r2-user-a', 'r2-user-b']) {
    state.users.set(id, {
      id,
      email: `${id}@example.test`,
      name: id,
      passwordHash: bcrypt.hashSync('R2 synthetic password', 4),
      role: 'STUDENT',
      onboardingCompleted: false,
    });
  }
  state.users.set('r2-legacy-long', {
    id: 'r2-legacy-long',
    email: 'r2-legacy-long@example.test',
    name: 'R2 legacy',
    passwordHash: bcrypt.hashSync('L'.repeat(72) + 'legacy suffix', 4),
    role: 'STUDENT',
    onboardingCompleted: false,
  });
}
if (!fixtureState().users.size) resetFixture();

const syntheticTables = {
  user: {
    async findUnique({ where }: { where: { id?: string; email?: string } }) {
      const state = fixtureState();
      state.counters.lookups++;
      return (
        [...state.users.values()].find(
          (user) => user.id === where.id || user.email === where.email,
        ) ?? null
      );
    },
    async update({ where, data }: { where: { id: string }; data: Partial<SyntheticUser> }) {
      const state = fixtureState();
      const user = state.users.get(where.id);
      if (!user) throw new Error('Synthetic user missing');
      state.counters.writes++;
      Object.assign(user, data);
      return user;
    },
    async create({ data }: { data: Partial<SyntheticUser> & { email: string } }) {
      const state = fixtureState();
      state.counters.writes++;
      const id = `r2-created-${state.users.size}`;
      const user = {
        id,
        name: 'Synthetic',
        passwordHash: '',
        role: 'STUDENT',
        onboardingCompleted: false,
        ...data,
      } as SyntheticUser;
      state.users.set(id, user);
      return user;
    },
  },
  membership: {
    async findUnique({
      where,
    }: {
      where: { userId_workspaceId: { userId: string; workspaceId: string } };
    }) {
      const { userId, workspaceId } = where.userId_workspaceId;
      return userId === 'r2-user-a' && workspaceId === 'cr2workspace00000000000001'
        ? { id: 'r2-member', role: 'OWNER' }
        : null;
    },
    async create() {
      return { id: 'r2-new-member' };
    },
  },
  workspace: {
    async create() {
      return { id: 'cr2workspace00000000000001' };
    },
  },
};

export const prisma = {
  ...syntheticTables,
  async $transaction<T>(callback: (transaction: typeof syntheticTables) => Promise<T>): Promise<T> {
    return callback(syntheticTables);
  },
};
