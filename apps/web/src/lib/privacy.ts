/** Device-local privacy boundary. Logout revokes every live sensitive cache lease. */
export interface LocalIdentity {
  userId: string;
  workspaceId: string;
}

export const LOGOUT_EPOCH_KEY = 'campusforge:privacy:logout:v1';
const CHANNEL = 'campusforge:privacy:v1';
const sensitivePrefixes = ['campusforge:assistant:v2:', 'campusforge:doc-ai:'];
const listeners = new Set<() => void>();
let generation = 0;
let channel: BroadcastChannel | undefined;
let listening = false;

export function identityNamespace(identity: LocalIdentity): string {
  if (!identity.userId || !identity.workspaceId) throw new Error('Verified identity is required');
  return `${encodeURIComponent(identity.userId)}:${encodeURIComponent(identity.workspaceId)}`;
}

function currentEpoch(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(LOGOUT_EPOCH_KEY) ?? '';
  } catch {
    return '';
  }
}

/** A stable primitive snapshot also detects changes during React subscription. */
export function getPrivacySnapshot(): string {
  return `${generation}:${currentEpoch()}`;
}

function revoke() {
  generation += 1;
  listeners.forEach((listener) => listener());
}

function listen() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  window.addEventListener('storage', (event) => {
    if (event.key === LOGOUT_EPOCH_KEY || event.key === null) revoke();
  });
  // A restored BFCache page must re-enter the authenticated server boundary.
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      revoke();
      window.location.reload();
    }
  });
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.addEventListener('message', (event: MessageEvent<unknown>) => {
      if (event.data === 'logout') revoke();
    });
  } catch {
    // Storage events still synchronize tabs when BroadcastChannel is unavailable.
  }
}

export interface SensitiveLease {
  readonly epoch: string;
  isValid(): boolean;
}

export function createSensitiveLease(): SensitiveLease {
  listen();
  const acquiredGeneration = generation;
  const epoch = currentEpoch();
  return { epoch, isValid: () => generation === acquiredGeneration && currentEpoch() === epoch };
}

export function subscribeToLogout(listener: () => void): () => void {
  listen();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Logout removes all CampusForge assistant content and document AI cache
 * namespaces on this device, including ownerless legacy keys. Preserve theme,
 * scoped non-sensitive preferences, unrelated origin keys and the revocation epoch.
 * Local revocation happens even if browser storage is unavailable.
 */
export function clearCampusForgeSensitiveStorage(): void {
  if (typeof window === 'undefined') return;
  listen();
  revoke();
  try {
    window.localStorage.setItem(LOGOUT_EPOCH_KEY, crypto.randomUUID());
  } catch {
    // The in-memory fence and BroadcastChannel still revoke live tabs.
  }
  try {
    const storage = window.localStorage;
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    for (const key of keys) {
      if (
        key &&
        (key === 'campusforge:assistant:v1' ||
          sensitivePrefixes.some((prefix) => key.startsWith(prefix)))
      ) {
        try {
          storage.removeItem(key);
        } catch {
          // An epoch mismatch also prevents loading content that could not be erased.
        }
      }
    }
  } catch {
    // Browser storage errors never prevent actual authentication logout.
  }
  try {
    channel?.postMessage('logout');
  } catch {
    /* A closed channel is non-fatal. */
  }
}
