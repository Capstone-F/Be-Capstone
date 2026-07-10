/**
 * Minimal in-memory Redis stand-in for e2e tests.
 * Supports set (with EX), get, getDel, and TTL expiry via Date.now().
 */
export type InMemoryRedis = {
  set: (
    key: string,
    value: string,
    options?: { EX?: number },
  ) => Promise<string>;
  get: (key: string) => Promise<string | null>;
  getDel: (key: string) => Promise<string | null>;
  /** Advance fake clock used for TTL checks (ms). */
  advanceTime: (ms: number) => void;
  clear: () => void;
  isOpen: boolean;
  connect: () => Promise<void>;
  quit: () => Promise<void>;
  on: (..._args: unknown[]) => void;
};

export function createInMemoryRedis(): InMemoryRedis {
  const store = new Map<string, { value: string; expiresAt?: number }>();
  let now = Date.now();

  const isExpired = (entry: { expiresAt?: number }) =>
    entry.expiresAt !== undefined && entry.expiresAt <= now;

  return {
    isOpen: true,
    connect: async () => undefined,
    quit: async () => undefined,
    on: () => undefined,
    advanceTime: (ms: number) => {
      now += ms;
    },
    clear: () => store.clear(),
    async set(key, value, options) {
      const expiresAt =
        options?.EX !== undefined ? now + options.EX * 1000 : undefined;
      store.set(key, { value, expiresAt });
      return 'OK';
    },
    async get(key) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) {
        if (entry) store.delete(key);
        return null;
      }
      return entry.value;
    },
    async getDel(key) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) {
        store.delete(key);
        return null;
      }
      store.delete(key);
      return entry.value;
    },
  };
}
