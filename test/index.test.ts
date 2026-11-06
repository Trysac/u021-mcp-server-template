import { describe, expect, it } from "vitest";
import { z } from "zod";
import * as api from "../src/index.js";

describe("public API", () => {
  it("exports the documented names", () => {
    expect(Object.keys(api)).toEqual(
      expect.arrayContaining([
        "TemplateError",
        "checkBearerToken",
        "createRateLimiter",
        "createServer",
        "defineTool",
        "echoTool",
        "startHttp",
      ]),
    );
  });

  it("defineTool returns a frozen definition that keeps its handler", async () => {
    const tool = api.defineTool({
      name: "double",
      description: "Doubles a number.",
      input: { n: z.number() },
      handler: (args) => Promise.resolve(String(args.n * 2)),
    });
    const ctx = { signal: new AbortController().signal, now: () => new Date(0) };
    expect(Object.isFrozen(tool)).toBe(true);
    expect(tool.name).toBe("double");
    await expect(tool.handler({ n: 2 }, ctx)).resolves.toBe("4");
  });

  it("echoTool returns its text", async () => {
    const ctx = { signal: new AbortController().signal, now: () => new Date(0) };
    await expect(api.echoTool.handler({ text: "x" }, ctx)).resolves.toBe("x");
  });

  it("TemplateError carries a stable code and clips long messages", () => {
    const error = new api.TemplateError("NO_TOKENS", "x".repeat(500));
    expect(error.code).toBe("NO_TOKENS");
    expect(error.name).toBe("TemplateError");
    expect(error.message).toHaveLength(200);
    expect(error).toBeInstanceOf(Error);
  });

  it("silentLogger discards records", () => {
    expect(api.silentLogger.info("a", { b: 1 })).toBeUndefined();
    expect(api.silentLogger.warn("a")).toBeUndefined();
  });
});
