import { describe, expect, it } from "vitest";
import { checkBearerToken } from "../src/index.js";

describe("checkBearerToken scheme handling", () => {
  it("rejects a missing header and a non-bearer scheme with 401", () => {
    expect(checkBearerToken(undefined, ["tok"])).toEqual({ ok: false, status: 401 });
    expect(checkBearerToken("Basic x", ["tok"])).toEqual({ ok: false, status: 401 });
  });

  it("accepts the scheme case-insensitively", () => {
    expect(checkBearerToken("bearer tok", ["tok"]).ok).toBe(true);
  });
});
