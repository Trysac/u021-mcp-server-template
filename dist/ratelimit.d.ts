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
/**
 * Creates an in-memory fixed-window rate limiter. At `maxKeys` tracked keys the oldest key
 * is evicted, so memory stays bounded.
 *
 * @param options - Limit, window, optional clock and key cap.
 * @throws {TemplateError} `INVALID_LIMIT` when a number is not a positive integer.
 */
export declare function createRateLimiter(options: RateLimiterOptions): RateLimiter;
