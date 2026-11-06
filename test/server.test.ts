import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { TemplateError } from "../src/errors.js";
import { createServer, defineTool, echoTool } from "../src/index.js";

interface Reply {
  content: { type: string; text: string }[];
  isError?: boolean;
}

type Options = Parameters<typeof createServer>[0];

const base = { name: "test-server", version: "1.0.0" };

async function connect(options: Options): Promise<Client> {
  const server = createServer(options);
  const client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>): Promise<Reply> {
  const result = await client.callTool({ name, arguments: args });
  return result as unknown as Reply;
}

function textOf(reply: Reply): string {
  return reply.content[0]?.text ?? "";
}

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return error instanceof TemplateError ? error.code : "OTHER";
  }
  return "NONE";
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

const boom = defineTool({
  name: "boom",
  description: "Always throws.",
  input: {},
  handler: () => {
    throw new Error("secret detail");
  },
});

const rejecting = defineTool({
  name: "rejecting",
  description: "Always rejects.",
  input: {},
  handler: () => Promise.reject(new Error("async secret")),
});

const notText = defineTool({
  name: "not-text",
  description: "Returns a number.",
  input: {},
  handler: () => Promise.resolve(42 as unknown as string),
});

const outputs: Record<string, string> = {
  plain: "a".repeat(15),
  pair: ["a".repeat(9), "\u{1F600}", "b"].join(""),
  exact: "a".repeat(10),
};

const loud = defineTool({
  name: "loud",
  description: "Returns a canned long output.",
  input: { kind: z.string() },
  maxOutputChars: 10,
  handler: (args) => Promise.resolve(outputs[args.kind] ?? ""),
});

describe("createServer", () => {
  it("lists echo and echoes text through an in-memory client", async () => {
    const client = await connect({ ...base, tools: [echoTool] });
    const listed = await client.listTools();
    expect(listed.tools.map((t) => t.name)).toEqual(["echo"]);
    const result = await client.callTool({
      name: "echo",
      arguments: { text: "hi" },
    });
    expect(result.content).toEqual([{ type: "text", text: "hi" }]);
  });

  it("publishes a JSON schema for the arguments", async () => {
    const client = await connect({ ...base, tools: [echoTool] });
    const [tool] = (await client.listTools()).tools;
    expect(tool?.description).toBe("Returns the given text unchanged.");
    expect(tool?.inputSchema.type).toBe("object");
    expect(tool?.inputSchema.properties).toHaveProperty("text");
  });

  it("rejects invalid arguments with INVALID_ARGUMENTS", async () => {
    const client = await connect({ ...base, tools: [echoTool] });
    const wrongType = await call(client, "echo", { text: 5 });
    expect(wrongType.isError).toBe(true);
    expect(textOf(wrongType).startsWith("ERROR INVALID_ARGUMENTS")).toBe(true);
    const missing = await call(client, "echo", {});
    expect(textOf(missing).startsWith("ERROR INVALID_ARGUMENTS")).toBe(true);
    const tooLong = await call(client, "echo", { text: "x".repeat(10_001) });
    expect(tooLong.isError).toBe(true);
    expect(textOf(tooLong).startsWith("ERROR INVALID_ARGUMENTS")).toBe(true);
    expect(textOf(tooLong).length).toBeLessThan(300);
    const boundary = "x".repeat(10_000);
    const fine = await call(client, "echo", { text: boundary });
    expect(fine.isError).toBeUndefined();
    expect(textOf(fine)).toBe(boundary);
  });

  it("returns TIMEOUT for a handler that never settles", async () => {
    const seen: { signal?: AbortSignal } = {};
    const spy = spyLogger();
    const hang = defineTool({
      name: "hang",
      description: "Never settles.",
      input: {},
      timeoutMs: 20,
      handler: (_args, ctx) => {
        seen.signal = ctx.signal;
        return new Promise<string>(() => undefined);
      },
    });
    const client = await connect({ ...base, tools: [hang], logger: spy.logger });
    const started = Date.now();
    const reply = await call(client, "hang", {});
    expect(reply.isError).toBe(true);
    expect(textOf(reply).startsWith("ERROR TIMEOUT")).toBe(true);
    expect(seen.signal?.aborted).toBe(true);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(spy.calls.map((c) => c.message)).toContain("tool_timeout");
  });

  it("truncates long output without splitting surrogate pairs", async () => {
    const client = await connect({ ...base, tools: [loud] });
    const plain = await call(client, "loud", { kind: "plain" });
    expect(textOf(plain)).toBe("aaaaaaaaaa\n[truncated: 5 chars omitted]");
    const pair = await call(client, "loud", { kind: "pair" });
    expect(textOf(pair)).toBe("aaaaaaaaa\n[truncated: 3 chars omitted]");
    const exact = await call(client, "loud", { kind: "exact" });
    expect(textOf(exact)).toBe("aaaaaaaaaa");
    expect(exact.isError).toBeUndefined();
  });

  it("replaces thrown messages with a generic HANDLER_ERROR", async () => {
    const spy = spyLogger();
    const tools = [boom, rejecting, notText];
    const client = await connect({ ...base, tools, logger: spy.logger });
    for (const name of ["boom", "rejecting", "not-text"]) {
      const reply = await call(client, name, {});
      expect(reply.isError).toBe(true);
      expect(textOf(reply)).toBe("ERROR HANDLER_ERROR: The tool handler failed");
    }
    const logged = JSON.stringify(spy.calls);
    expect(logged).toContain("tool_failed");
    expect(logged).not.toContain("secret detail");
    expect(logged).not.toContain("async secret");
  });

  it("injects the clock into handlers", async () => {
    const stamp = defineTool({
      name: "stamp",
      description: "Returns the injected time.",
      input: {},
      handler: (_args, ctx) => Promise.resolve(ctx.now().toISOString()),
    });
    const clock = () => new Date("2024-01-02T03:04:05.000Z");
    const client = await connect({ ...base, tools: [stamp], clock });
    const reply = await call(client, "stamp", {});
    expect(textOf(reply)).toBe("2024-01-02T03:04:05.000Z");
  });

  it("rejects unknown tools at the protocol level", async () => {
    const client = await connect({ ...base, tools: [echoTool] });
    await expect(client.callTool({ name: "missing", arguments: {} })).rejects.toThrow();
  });

  it("rejects duplicate tool names and invalid limits", () => {
    const duplicate = () => createServer({ ...base, tools: [echoTool, echoTool] });
    expect(codeOf(duplicate)).toBe("DUPLICATE_TOOL");
    const limited = (patch: Record<string, number>) => () =>
      createServer({
        ...base,
        tools: [
          defineTool({
            name: "limited",
            description: "Has a bad limit.",
            input: {},
            ...patch,
            handler: () => Promise.resolve(""),
          }),
        ],
      });
    expect(codeOf(limited({ timeoutMs: 0 }))).toBe("INVALID_LIMIT");
    expect(codeOf(limited({ timeoutMs: 1.5 }))).toBe("INVALID_LIMIT");
    expect(codeOf(limited({ maxOutputChars: -1 }))).toBe("INVALID_LIMIT");
    expect(codeOf(limited({ timeoutMs: 5 }))).toBe("NONE");
  });
});
