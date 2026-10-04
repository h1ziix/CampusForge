import { fixtureState } from './state';

// Explicit mock of Redis transport/eval semantics, not proof of Lua/distribution.
export default class SyntheticRedis {
  status = 'wait';
  constructor(_url: string, _options: unknown) {
    void _url;
    void _options;
  }
  on(_event: string, _listener: () => void) {
    void _event;
    void _listener;
    return this;
  }
  async connect() {
    this.status = 'ready';
  }
  disconnect() {
    this.status = 'end';
  }
  async eval(_script: string, numberOfKeys: number, ...args: (number | string)[]) {
    const state = fixtureState();
    if (state.outage) throw new Error('Synthetic Redis outage');
    const now = Date.now();
    const keys = args.slice(0, numberOfKeys).map(String);
    let retry = 0;
    for (const [index, key] of keys.entries()) {
      const entry = state.budgets.get(key);
      if (entry && entry.expiresAt > now && entry.count >= Number(args[numberOfKeys + index * 2])) {
        retry = Math.max(retry, entry.expiresAt - now);
      }
    }
    if (retry) return [0, retry];
    for (const [index, key] of keys.entries()) {
      const entry = state.budgets.get(key);
      state.budgets.set(
        key,
        entry && entry.expiresAt > now
          ? { ...entry, count: entry.count + 1 }
          : { count: 1, expiresAt: now + Number(args[numberOfKeys + index * 2 + 1]) },
      );
    }
    return [1, 0];
  }
}
