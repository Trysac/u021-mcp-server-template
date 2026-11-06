import { requirePositiveInteger } from "./limits.js";

const DEFAULT_MAX_KEYS = 10_000;

/** Options of {@link createRateLimiter}. */
export interface RateLimiterOptions {
  /** Requests allowed per window and key. */
  readonly limit: number;
  /** Window length in milliseconds. */
  readonly windowMs: number;
  /** Clock in milliseconds. Defaults to `Date.now`. */
  readonly now?: (() => number) | undefined;
  /** Maximum number of tracked keys; the oldest key is evicted. Default 10_000. */
  readonly maxKeys?: number | undefined;
}

/** Verdict returned by {@link RateLimiter.take}. */
export interface RateLimitVerdict {
  readonly ok: boolean;
  /** Milliseconds until the window resets when `ok` is false, otherwise 0. */
  readonly retryAfterMs: number;
}

/** Fixed-window limiter keyed by an arbitrary string. */
export interface RateLimiter {
  take(key: string): RateLimitVerdict;
}

interface Window {
  start: number;
  count: number;
}

/**
 * Creates an in-memory fixed-window rate limiter. At `maxKeys` tracked keys the oldest key
 * is evicted, so memory stays bounded.
 *
 * @param options - Limit, window, optional clock and key cap.
 * @throws {TemplateError} `INVALID_LIMIT` when a number is not a positive integer.
 */
export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  const limit = requirePositiveInteger(options.limit, "limit");
  const windowMs = requirePositiveInteger(options.windowMs, "windowMs");
  const maxKeys = requirePositiveInteger(options.maxKeys ?? DEFAULT_MAX_KEYS, "maxKeys");
  const now = options.now ?? (() => Date.now());
  const windows = new Map<string, Window>();

  return {
    take(key: string): RateLimitVerdict {
      const current = now();
      let entry = windows.get(key);
      if (entry === undefined || current - entry.start >= windowMs) {
        windows.delete(key);
        if (windows.size >= maxKeys) {
          const oldest = windows.keys().next();
          if (!oldest.done) {
            windows.delete(oldest.value);
          }
        }
        entry = { start: current, count: 0 };
        windows.set(key, entry);
      }
      if (entry.count >= limit) {
        return { ok: false, retryAfterMs: entry.start + windowMs - current };
      }
      entry.count += 1;
      return { ok: true, retryAfterMs: 0 };
    },
  };
}
