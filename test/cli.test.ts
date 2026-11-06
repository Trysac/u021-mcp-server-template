import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { run } from "../src/cli.js";
import { createServer, echoTool, startHttp } from "../src/index.js";

type RunIo = Parameters<typeof run>[1];
type Env = Record<string, string | undefined>;

const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};
const TOK_ONE = ["cli-token", "one", "Zp3"].join("-");
const TOK_TWO = ["cli-token", "two", "Qw8"].join("-");
const LIST = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" });

function makeIo(
  env: Env,
  extra: Partial<RunIo> = {},
  onErr: (text: string) => void = () => undefined,
) {
  const out: string[] = [];
  const err: string[] = [];
  const io: RunIo = {
    stdout: {
      write: (text) => {
        out.push(text);
      },
    },
    stderr: {
      write: (text) => {
        err.push(text);
        onErr(text);
      },
    },
    env,
    ...extra,
  };
  return { io, out, err };
}

describe("run", () => {
  it("refuses --http without MCP_TOKENS", async () => {
    const { io, err } = makeIo({});
    const code = await run(["--http"], io);
    expect(code).toBe(2);
    expect(err.join("")).toContain("MCP_TOKENS");
  });

  it("refuses --http when MCP_TOKENS holds only separators", async () => {
    const { io, err } = makeIo({ MCP_TOKENS: " , ," });
    expect(await run(["--http"], io)).toBe(2);
    expect(err.join("")).toContain("MCP_TOKENS");
  });

  it("answers usage errors with exit code 2", async () => {
    const cases = [
      ["--bogus"],
      ["--port"],
      ["--port", "abc"],
      ["--port", "70000"],
      ["--port", "--http"],
      ["--host"],
      ["--host", ""],
      ["--port", "80"],
      ["--host", "127.0.0.1"],
    ];
    for (const argv of cases) {
      const { io, err } = makeIo({ MCP_TOKENS: "tok-xyz-123" });
      expect(await run(argv, io)).toBe(2);
      expect(err.join("")).toContain("Usage:");
    }
  });

  it("prints usage for --help", async () => {
    const { io, out } = makeIo({});
    expect(await run(["--help"], io)).toBe(0);
    expect(out.join("")).toContain("Usage:");
  });

  it("serves stdio through an injected transport", async () => {
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const { io, out } = makeIo({}, { transport: serverSide });
    const exit = run([], io);
    const client = new Client({ name: "cli-test", version: "1.0.0" });
    await client.connect(clientSide);
    const listed = await client.listTools();
    expect(listed.tools.map((tool) => tool.name)).toEqual(["echo"]);
    await client.close();
    await expect(exit).resolves.toBe(0);
    expect(out).toEqual([]);
  });

  it("serves HTTP until the signal aborts", async () => {
    const controller = new AbortController();
    let announce: (text: string) => void = () => undefined;
    const announced = new Promise<string>((resolve) => {
      announce = resolve;
    });
    const { io, err, out } = makeIo(
      {
        MCP_TOKENS: `${TOK_ONE}, ${TOK_TWO}`,
        MCP_ALLOWED_ORIGINS: "https://app.example",
      },
      { signal: controller.signal },
      (text) => {
        if (text.includes("Listening on")) {
          announce(text);
        }
      },
    );
    const exit = run(["--http", "--port", "0", "--host", "127.0.0.1"], io);
    const line = await announced;
    const port = /:(\d+)\//.exec(line)?.[1];
    const url = `http://127.0.0.1:${port}/mcp`;
    const denied = await fetch(url, {
      method: "POST",
      headers: MCP_HEADERS,
      body: LIST,
    });
    await denied.text();
    expect(denied.status).toBe(401);
    const allowed = await fetch(url, {
      method: "POST",
      headers: { ...MCP_HEADERS, Authorization: `Bearer ${TOK_TWO}` },
      body: LIST,
    });
    await allowed.text();
    expect(allowed.status).toBe(200);
    controller.abort();
    await expect(exit).resolves.toBe(0);
    expect(out).toEqual([]);
    expect(err.join("")).not.toContain(TOK_TWO);
  });

  it("returns 2 for an invalid allowed origin", async () => {
    const { io, err } = makeIo({
      MCP_TOKENS: "tok-xyz-123",
      MCP_ALLOWED_ORIGINS: "*",
    });
    expect(await run(["--http", "--port", "0"], io)).toBe(2);
    expect(err.join("")).toContain("INVALID_ORIGIN");
  });

  it("returns 1 when the server fails at runtime", async () => {
    const taken = await startHttp(
      () => createServer({ name: "x", version: "1.0.0", tools: [echoTool] }),
      { port: 0, tokens: ["tok-aaa-111"] },
    );
    const { io, err } = makeIo({ MCP_TOKENS: "tok-xyz-123" });
    const code = await run(["--http", "--port", String(taken.port)], io);
    await taken.close();
    expect(code).toBe(1);
    expect(err.join("")).toContain("Server failed");
  });
});
