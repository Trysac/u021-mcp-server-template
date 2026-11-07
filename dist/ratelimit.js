import { requirePositiveInteger } from "./limits.js";
const DEFAULT_MAX_KEYS = 10_000;
/**
 * Creates an in-memory fixed-window rate limiter. At `maxKeys` tracked keys the oldest key
 * is evicted, so memory stays bounded.
 *
 * @param options - Limit, window, optional clock and key cap.
 * @throws {TemplateError} `INVALID_LIMIT` when a number is not a positive integer.
 */
export function createRateLimiter(options) {
    const limit = requirePositiveInteger(options.limit, "limit");
    const windowMs = requirePositiveInteger(options.windowMs, "windowMs");
    const maxKeys = requirePositiveInteger(options.maxKeys ?? DEFAULT_MAX_KEYS, "maxKeys");
    const now = options.now ?? (() => Date.now());
    const windows = new Map();
    return {
        take(key) {
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
