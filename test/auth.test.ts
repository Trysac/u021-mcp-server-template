import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TemplateError } from "../src/errors.js";
import { checkBearerToken, createRateLimiter } from "../src/index.js";

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof TemplateError ? error.code : "OTHER";
  }
  return "NONE";
}

const FIRST = "first-token-value";
const SECOND = "second-token-value";

describe("checkBearerToken", () => {
  it("answers 401 without an error for missing or non-bearer credentials", () => {
    const none = { ok: false, status: 401 };
    expect(checkBearerToken(undefined, [FIRST])).toEqual(none);
    expect(checkBearerToken("Basic x", [FIRST])).toEqual(none);
    expect(checkBearerToken("Bearer", [FIRST])).toEqual(none);
    expect(checkBearerToken("Bearer ", [FIRST])).toEqual(none);
    expect(checkBearerToken("Bearerx", [FIRST])).toEqual(none);
    expect(checkBearerToken("", [FIRST])).toEqual(none);
  });

  it("answers invalid_token for an unknown token", () => {
    const invalid = { ok: false, status: 401, error: "invalid_token" };
    expect(checkBearerToken("Bearer nope", [FIRST])).toEqual(invalid);
    expect(checkBearerToken("Bearer nope", [])).toEqual(invalid);
  });

  it("returns the token id of the second of two tokens", () => {
    const expected = { ok: true, tokenId: sha256Hex(SECOND).slice(0, 8) };
    expect(checkBearerToken(`Bearer ${SECOND}`, [FIRST, SECOND])).toEqual(expected);
    expect(checkBearerToken(`bearer ${SECOND}`, [FIRST, SECOND])).toEqual(expected);
    expect(checkBearerToken(`BEARER   ${SECOND}`, [FIRST, SECOND])).toEqual(expected);
    expect(expected.tokenId).toMatch(/^[0-9a-f]{8}$/);
  });

  it("rejects near misses next to a valid token", () => {
    const invalid = { ok: false, status: 401, error: "invalid_token" };
    const allowed = [FIRST, SECOND];
    expect(checkBearerToken(`Bearer ${SECOND}2`, allowed)).toEqual(invalid);
    expect(checkBearerToken(`Bearer ${SECOND.slice(1)}`, allowed)).toEqual(invalid);
    expect(checkBearerToken(`Bearer ${SECOND} extra`, allowed)).toEqual(invalid);
    expect(checkBearerToken(`Bearer ${"x".repeat(5000)}`, allowed)).toEqual(invalid);
  });
});

describe("createRateLimiter", () => {
  it("allows the limit per window and reports the time left", () => {
    let now = 0;
    const limiter = createRateLimiter({
      limit: 2,
      windowMs: 1000,
      now: () => now,
    });
    expect(limiter.take("a")).toEqual({ ok: true, retryAfterMs: 0 });
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("a")).toEqual({ ok: false, retryAfterMs: 1000 });
    now = 400;
    expect(limiter.take("a")).toEqual({ ok: false, retryAfterMs: 600 });
    expect(limiter.take("b").ok).toBe(true);
    now = 1000;
    expect(limiter.take("a").ok).toBe(true);
  });

  it("evicts the oldest key at maxKeys", () => {
    const limiter = createRateLimiter({
      limit: 1,
      windowMs: 1000,
      maxKeys: 2,
      now: () => 0,
    });
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("b").ok).toBe(true);
    expect(limiter.take("c").ok).toBe(true);
    expect(limiter.take("b").ok).toBe(false);
    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("b").ok).toBe(true);
  });

  it("uses the system clock by default", () => {
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.take("k").ok).toBe(true);
    expect(limiter.take("k").ok).toBe(false);
  });

  it("validates its options", () => {
    const make = (patch: Record<string, number>) => () =>
      createRateLimiter({ limit: 1, windowMs: 1000, ...patch });
    expect(codeOf(make({ limit: 0 }))).toBe("INVALID_LIMIT");
    expect(codeOf(make({ limit: 1.5 }))).toBe("INVALID_LIMIT");
    expect(codeOf(make({ windowMs: -1 }))).toBe("INVALID_LIMIT");
    expect(codeOf(make({ maxKeys: 0 }))).toBe("INVALID_LIMIT");
    expect(codeOf(make({}))).toBe("NONE");
  });
});
