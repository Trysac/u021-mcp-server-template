import * as http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { TemplateError } from "../src/errors.js";
import { createServer, defineTool, echoTool, startHttp } from "../src/index.js";

type Options = Parameters<typeof startHttp>[1];
type Handle = Awaited<ReturnType<typeof startHttp>>;

interface SendInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  chunks?: string[];
}

interface Reply {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
}

const TOKEN_A = ["Zx9qLm4", "vWb2Kp7"].join("");
const TOKEN_B = ["Rt5nHd8", "sYc3Jf6"].join("");
const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

const open: Handle[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((handle) => handle.close()));
});

const leak = defineTool({
  name: "leak",
  description: "Throws an error that contains a token.",
  input: {},
  handler: () => {
    throw new Error(`token ${TOKEN_A}`);
  },
});

function makeServer(logger?: Options["logger"]) {
  return createServer({
    name: "http-test",
    version: "1.0.0",
    tools: [echoTool, leak],
    logger,
  });
}

async function start(extra: Partial<Options> = {}): Promise<Handle> {
  const handle = await startHttp(() => makeServer(extra.logger), {
    port: 0,
    tokens: [TOKEN_A, TOKEN_B],
    ...extra,
  });
  open.push(handle);
  return handle;
}

function rpc(method: string, params?: Record<string, unknown>): string {
  return JSON.stringify({ jsonrpc: "2.0", id: 1, method, params });
}

function authed(token: string, extra: Record<string, string> = {}): Record<string, string> {
  return { ...MCP_HEADERS, Authorization: `Bearer ${token}`, ...extra };
}

function send(port: number, init: SendInit = {}): Promise<Reply> {
  return new Promise<Reply>((resolve, reject) => {
    const headers: Record<string, string> = { ...init.headers };
    if (init.body !== undefined) {
      headers["Content-Length"] = String(Buffer.byteLength(init.body));
    }
    const request = http.request(
      {
        host: "127.0.0.1",
        port,
        method: init.method ?? "POST",
        path: "/mcp",
        headers,
      },
      (response) => {
        const parts: Buffer[] = [];
        response.on("data", (chunk: Buffer) => {
          parts.push(chunk);
        });
        response.on("end", () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(parts).toString("utf8"),
          });
        });
      },
    );
    request.on("error", reject);
    for (const chunk of init.chunks ?? []) {
      request.write(chunk);
    }
    request.end(init.body);
  });
}

function spyLogger() {
  const calls: { level: string; message: string; fields: unknown }[] = [];
  return {
    calls,
    logger: {
      info: (message: string, fields?: unknown) => {
        calls.push({ level: "info", message, fields });
      },
      warn: (message: string, fields?: unknown) => {
        calls.push({ level: "warn", message, fields });
      },
    },
  };
}

function leaksSubstring(haystack: string, token: string): boolean {
  for (let i = 0; i + 6 <= token.length; i += 1) {
    if (haystack.includes(token.slice(i, i + 6))) {
      return true;
    }
  }
  return haystack.includes(token);
}

describe("startHttp", () => {
  it("binds to 127.0.0.1 by default and serves tools", async () => {
    const handle = await start();
    expect(handle.host).toBe("127.0.0.1");
    expect(handle.port).toBeGreaterThan(0);
    const listed = await send(handle.port, {
      headers: authed(TOKEN_B),
      body: rpc("tools/list"),
    });
    expect(listed.status).toBe(200);
    const parsed = JSON.parse(listed.text) as {
      result: { tools: { name: string }[] };
    };
    expect(parsed.result.tools.map((t) => t.name)).toEqual(["echo", "leak"]);
    const echoed = await send(handle.port, {
      headers: authed(TOKEN_A),
      body: rpc("tools/call", { name: "echo", arguments: { text: "hi" } }),
    });
    const called = JSON.parse(echoed.text) as {
      result: { content: { text: string }[] };
    };
    expect(called.result.content[0]?.text).toBe("hi");
  });

  it("answers missing and bad credentials with 401 and a challenge", async () => {
    const handle = await start();
    const missing = await send(handle.port, {
      headers: MCP_HEADERS,
      body: rpc("tools/list"),
    });
    expect(missing.status).toBe(401);
    expect(missing.headers["www-authenticate"]).toBe('Bearer realm="mcp"');
    const basic = await send(handle.port, {
      headers: { ...MCP_HEADERS, Authorization: "Basic x" },
      body: rpc("tools/list"),
    });
    expect(basic.status).toBe(401);
    expect(basic.headers["www-authenticate"]).toBe('Bearer realm="mcp"');
    const bad = await send(handle.port, {
      headers: authed(`${TOKEN_A}x`),
      body: rpc("tools/list"),
    });
    expect(bad.status).toBe(401);
    expect(bad.headers["www-authenticate"]).toBe('Bearer realm="mcp", error="invalid_token"');
  });

  it("rejects foreign origins before authentication", async () => {
    const handle = await start({ allowedOrigins: ["https://app.example"] });
    const foreign = [
      "https://evil.example",
      "null",
      "https://app.example.evil",
      "HTTPS://APP.EXAMPLE",
      "",
    ];
    for (const origin of foreign) {
      const withToken = await send(handle.port, {
        headers: authed(TOKEN_A, { Origin: origin }),
        body: rpc("tools/list"),
      });
      expect(withToken.status).toBe(403);
      const withoutToken = await send(handle.port, {
        headers: { ...MCP_HEADERS, Origin: origin },
        body: rpc("tools/list"),
      });
      expect(withoutToken.status).toBe(403);
    }
  });

  it("accepts listed origins and requests without Origin", async () => {
    const handle = await start({
      allowedOrigins: ["https://app.example", "null"],
    });
    for (const origin of ["https://app.example", "null"]) {
      const reply = await send(handle.port, {
        headers: authed(TOKEN_A, { Origin: origin }),
        body: rpc("tools/list"),
      });
      expect(reply.status).toBe(200);
    }
    const plain = await send(handle.port, {
      headers: authed(TOKEN_A),
      body: rpc("tools/list"),
    });
    expect(plain.status).toBe(200);
  });

  it("enforces the body size limit for Content-Length and chunked uploads", async () => {
    const limited = await start({ maxRequestBytes: 100 });
    const declared = await send(limited.port, {
      headers: authed(TOKEN_A),
      body: "x".repeat(200),
    });
    expect(declared.status).toBe(413);
    const chunked = await send(limited.port, {
      headers: authed(TOKEN_A),
      chunks: ["x".repeat(60), "x".repeat(60)],
    });
    expect(chunked.status).toBe(413);
    const exact = Buffer.byteLength(rpc("tools/list"));
    const atLimit = await start({ maxRequestBytes: exact });
    const accepted = await send(atLimit.port, {
      headers: authed(TOKEN_A),
      body: rpc("tools/list"),
    });
    expect(accepted.status).toBe(200);
    const below = await start({ maxRequestBytes: exact - 1 });
    const refused = await send(below.port, {
      headers: authed(TOKEN_A),
      body: rpc("tools/list"),
    });
    expect(refused.status).toBe(413);
  });

  it("limits requests per token with an injected clock", async () => {
    let clock = 0;
    const handle = await start({
      rateLimit: { limit: 2, windowMs: 60_000 },
      now: () => clock,
    });
    const ask = (token: string) =>
      send(handle.port, { headers: authed(token), body: rpc("tools/list") });
    expect((await ask(TOKEN_A)).status).toBe(200);
    expect((await ask(TOKEN_A)).status).toBe(200);
    clock = 29_500;
    const rounded = await ask(TOKEN_A);
    expect(rounded.status).toBe(429);
    expect(rounded.headers["retry-after"]).toBe("31");
    clock = 30_000;
    const limited = await ask(TOKEN_A);
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("30");
    expect((await ask(TOKEN_B)).status).toBe(200);
    clock = 60_000;
    expect((await ask(TOKEN_A)).status).toBe(200);
  });

  it("never logs or returns configured tokens", async () => {
    const spy = spyLogger();
    const handle = await start({ logger: spy.logger });
    const texts: string[] = [];
    const requests: SendInit[] = [
      { headers: authed(TOKEN_A), body: rpc("tools/list") },
      {
        headers: authed(TOKEN_B),
        body: rpc("tools/call", { name: "echo", arguments: { text: "hi" } }),
      },
      { headers: authed(`${TOKEN_A}x`), body: rpc("tools/list") },
      { headers: authed(TOKEN_B.slice(0, 6)), body: rpc("tools/list") },
      { headers: MCP_HEADERS, body: rpc("tools/list") },
      {
        headers: authed(TOKEN_A),
        body: rpc("tools/call", { name: "leak", arguments: {} }),
      },
    ];
    for (const init of requests) {
      texts.push((await send(handle.port, init)).text);
    }
    const logged = JSON.stringify(spy.calls);
    expect(spy.calls.length).toBeGreaterThan(0);
    expect(logged).toContain("tokenId");
    expect(texts.join("")).toContain("ERROR HANDLER_ERROR");
    for (const token of [TOKEN_A, TOKEN_B]) {
      expect(leaksSubstring(logged, token)).toBe(false);
      expect(leaksSubstring(texts.join(""), token)).toBe(false);
    }
  });

  it("rejects other methods and malformed bodies", async () => {
    const handle = await start();
    const get = await send(handle.port, {
      method: "GET",
      headers: authed(TOKEN_A),
    });
    expect(get.status).toBe(405);
    expect(get.headers.allow).toBe("POST");
    const anonymousGet = await send(handle.port, { method: "GET" });
    expect(anonymousGet.status).toBe(401);
    const invalid = await send(handle.port, {
      headers: authed(TOKEN_A),
      body: "{not json",
    });
    expect(invalid.status).toBe(400);
    const parsed = JSON.parse(invalid.text) as { error: { code: number } };
    expect(parsed.error.code).toBe(-32700);
    const empty = await send(handle.port, {
      headers: authed(TOKEN_A),
      body: "",
    });
    expect(empty.status).toBe(400);
  });

  it("serves concurrent requests with one shared instance and with a factory", async () => {
    const shared = await startHttp(makeServer(), {
      port: 0,
      tokens: [TOKEN_A],
    });
    open.push(shared);
    const factory = await start();
    for (const handle of [shared, factory]) {
      const replies = await Promise.all(
        [1, 2, 3].map(() =>
          send(handle.port, {
            headers: authed(TOKEN_A),
            body: rpc("tools/list"),
          }),
        ),
      );
      expect(replies.map((r) => r.status)).toEqual([200, 200, 200]);
    }
  });

  it("reports internal errors without leaking details", async () => {
    const spy = spyLogger();
    const handle = await startHttp(
      () => {
        throw new Error("factory exploded");
      },
      { port: 0, tokens: [TOKEN_A], logger: spy.logger },
    );
    open.push(handle);
    const reply = await send(handle.port, {
      headers: authed(TOKEN_A),
      body: rpc("tools/list"),
    });
    expect(reply.status).toBe(500);
    expect(reply.text).not.toContain("factory exploded");
    expect(spy.calls.map((c) => c.message)).toContain("http_request_failed");
  });

  it("validates its options", async () => {
    const factory = () => makeServer();
    const attempt = (patch: Partial<Options>) =>
      startHttp(factory, { port: 0, tokens: [TOKEN_A], ...patch });
    await expect(attempt({ tokens: [] })).rejects.toMatchObject({
      code: "NO_TOKENS",
    });
    await expect(attempt({ tokens: [""] })).rejects.toMatchObject({
      code: "NO_TOKENS",
    });
    for (const origin of ["*", "https://app.example/", "app.example"]) {
      await expect(attempt({ allowedOrigins: [origin] })).rejects.toMatchObject({
        code: "INVALID_ORIGIN",
      });
    }
    await expect(attempt({ maxRequestBytes: 0 })).rejects.toMatchObject({
      code: "INVALID_LIMIT",
    });
    for (const port of [70_000, -1, 1.5]) {
      await expect(attempt({ port })).rejects.toMatchObject({
        code: "INVALID_LIMIT",
      });
    }
    await expect(attempt({ rateLimit: { limit: 0, windowMs: 1000 } })).rejects.toBeInstanceOf(
      TemplateError,
    );
  });

  it("fails when the port is taken", async () => {
    const first = await start();
    await expect(
      startHttp(() => makeServer(), { port: first.port, tokens: [TOKEN_A] }),
    ).rejects.toThrow();
  });
});
