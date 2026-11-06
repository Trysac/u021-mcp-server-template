# mcp-server-template

[![npm version](https://img.shields.io/npm/v/@trysac/mcp-server-template.svg)](https://www.npmjs.com/package/@trysac/mcp-server-template)
[![license: MIT](https://img.shields.io/npm/l/@trysac/mcp-server-template.svg)](LICENSE)
[![CI](https://github.com/Trysac/u021-mcp-server-template/actions/workflows/ci.yml/badge.svg)](https://github.com/Trysac/u021-mcp-server-template/actions/workflows/ci.yml)

Hardened TypeScript MCP server template: zod tool schemas, Streamable HTTP on localhost with Origin checks, bearer tokens, size and rate limits, timeouts and tests.

## Problem

Teams starting an MCP server copy a quickstart that has no authentication, no Origin validation, no input limits and no tests, and then expose it. The MCP transport specification requires Origin validation against DNS rebinding and recommends binding to localhost. This template builds those guards in: bearer tokens, Origin checks, request size and rate limits, and per-tool timeouts and output caps. Every tool is covered end to end through an in-memory client. See [docs/SECURITY.md](docs/SECURITY.md).

## Install

```sh
npm install @trysac/mcp-server-template
```

Requires Node.js 20 or newer. The package ships ES modules with TypeScript declarations. Runtime dependencies are @modelcontextprotocol/sdk (^1.23.0) and zod (^4.1.0).

## Usage

```ts
import { createServer, echoTool, startHttp } from "@trysac/mcp-server-template";

const handle = await startHttp(
  () => createServer({ name: "demo", version: "1.0.0", tools: [echoTool] }),
  { port: 3000, tokens: [process.env["MCP_TOKEN"] ?? ""], rateLimit: { limit: 60, windowMs: 60_000 } },
);
console.log(`listening on ${handle.host}:${handle.port}`);
```

## API

| Export | Signature | Description |
|---|---|---|
| `defineTool` | `(def: ToolDefinition) => ToolDefinition` | Declares a tool with a zod raw shape, optional `timeoutMs` and `maxOutputChars`. Returns a frozen copy. |
| `createServer` | `(opts: { name, version, tools, clock?, logger? }) => McpServer` | Builds an MCP server that serves tools/list and tools/call with validation, timeout and output cap. |
| `startHttp` | `(source: McpServer or () => McpServer, opts) => Promise<{ host, port, close() }>` | Stateless Streamable HTTP with Origin, bearer, rate limit and size guards. |
| `checkBearerToken` | `(header: string or undefined, allowed: string[]) => result` | Checks an Authorization header; returns `{ ok: true, tokenId }` or `{ ok: false, status: 401, error? }`. |
| `createRateLimiter` | `(opts: { limit, windowMs, now?, maxKeys? }) => { take(key) }` | In-memory fixed-window limiter; returns `{ ok, retryAfterMs }`. |
| `run` | `(argv: string[], io) => Promise<number>` | CLI entry point. Flags: `--http`, `--port N`, `--host H`. Stdio is the default transport. |
| `echoTool` | `ToolDefinition` | Example tool that returns its `text` argument unchanged. |
| `TemplateError` | `class extends Error` | Carries a stable `code`. |
| `silentLogger` | `Logger` | Logger that discards every record; the default. |

### Errors

`TemplateError` codes: `DUPLICATE_TOOL` (repeated tool name in `createServer`), `NO_TOKENS` (no non-empty token in `startHttp`), `INVALID_LIMIT` (a numeric option is not a valid integer in range), `INVALID_ORIGIN` (an allowed origin is not an exact origin string). Messages are clipped to 200 characters.

Tool failures are returned as results with `isError: true` and text `ERROR <CODE>: <message>`, with codes `INVALID_ARGUMENTS`, `TIMEOUT` and `HANDLER_ERROR`. Handler error messages are replaced by a generic text.

CLI exit codes: 0 on success, 1 when the server fails at runtime, 2 for usage, configuration or parse errors. The CLI reads tokens from `MCP_TOKENS` and origins from `MCP_ALLOWED_ORIGINS` (comma separated). `--http` refuses to start without tokens.

### Limits and defaults

- `timeoutMs`: 10 000 ms per tool call.
- `maxOutputChars`: 100 000 UTF-16 units per tool result; longer output is cut and a marker states how many units were omitted.
- `maxRequestBytes`: 1 MiB per HTTP request body.
- `maxKeys`: 10 000 rate-limit keys; the oldest key is evicted.
- `echo` input: at most 10 000 characters.
- Bearer tokens longer than 4 096 characters are rejected.
- `port`: integer from 0 to 65 535; 0 picks a free port.

### startHttp options

- `host`: default `127.0.0.1`.
- `allowedOrigins`: exact Origin strings; default none.
- `rateLimit`: optional per-token limit; `now` supplies the clock.
- `logger`: optional; records carry the token id only, never a token.

When a factory is passed, requests run concurrently. A single `McpServer` instance serves one request at a time.

## Why not the SDK quickstart

The MCP SDK examples omit authentication, Origin validation, body limits, rate limits and timeouts. This template keeps those guards in the request path and tests them.

## Development

Tests run with Vitest. See [docs/TESTING.md](docs/TESTING.md).

## Security

The threat model, the guards and their limits are described in [docs/SECURITY.md](docs/SECURITY.md).

## License

[MIT](LICENSE) © 2026 Miguel Gomez
