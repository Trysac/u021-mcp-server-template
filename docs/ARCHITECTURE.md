# Architecture

## Overview

`@trysac/mcp-server-template` is a TypeScript library published to npm as ES modules with type declarations. It provides a hardened MCP server skeleton: zod-validated tools with a timeout race and output cap, a bearer-token check, Origin checks, request size and rate limits, and a stateless Streamable HTTP transport bound to localhost by default. A CLI entry point (`run`) serves stdio by default and HTTP with `--http`.

## Modules

| Module | Responsibility |
|---|---|
| `src/index.ts` | Public entry point. Re-exports auth, echo, errors, http, logger, ratelimit, server and tool. |
| `src/tool.ts` | `ToolDefinition`, `ToolContext` and `defineTool`, which freezes a copy of the definition. |
| `src/server.ts` | `createServer`. Registers tools, validates arguments with zod, races the handler against a timer and caps output. |
| `src/auth.ts` | `checkBearerToken`. Parses the Bearer scheme and compares sha256 digests with `timingSafeEqual`. |
| `src/ratelimit.ts` | `createRateLimiter`. Fixed-window limiter with oldest-key eviction at `maxKeys`. |
| `src/http.ts` | `startHttp`. Node HTTP server applying Origin, auth, rate limit, method, body size and parse checks before a stateless transport. |
| `src/cli.ts` | `run`. Argument parsing, environment handling, stdio or HTTP mode and exit codes. |
| `src/echo.ts` | `echoTool`, the example tool. |
| `src/errors.ts` | `TemplateError` with a stable `code`. |
| `src/limits.ts` | `requirePositiveInteger`, which throws `INVALID_LIMIT`. |
| `src/logger.ts` | `Logger` contract and `silentLogger`. |
| `src/text.ts` | `clip` and `truncate`, which never split a surrogate pair. |

## Boundaries

- Runtime dependencies are `@modelcontextprotocol/sdk` and `zod` only.
- Logging is injected through the `Logger` interface; the library never configures logging globally.
- Configuration errors are thrown as `TemplateError` with a stable code.
- Tool code is trusted; the HTTP layer enforces the guards before any tool runs.
- `src/cli.ts` reads `process.env`, `process.stdio` and signals only when the caller does not inject them.

## Request flow over HTTP

Origin check (403), bearer authentication (401), rate limit keyed by token id (429), method check (405), body size limit (413), JSON parse (400), then a new `StreamableHTTPServerTransport` for each request.

## Decisions

Architectural decisions are recorded in [decisions/](decisions/), starting with [0001](decisions/0001-record-architecture-decisions.md).
