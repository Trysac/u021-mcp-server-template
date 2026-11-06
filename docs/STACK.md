# Stack

## Used

| Tool | Purpose | Why |
|---|---|---|
| TypeScript | Language and type declarations | Typed public API for consumers. |
| Node.js 20+ | Runtime | Native ES modules and the `node:http` and `node:crypto` modules used by the code. |
| @modelcontextprotocol/sdk ^1.23.0 | MCP server, stdio and Streamable HTTP transports | Protocol implementation; the template wraps it with guards. |
| zod ^4.1.0 | Tool argument schemas and JSON Schema export | Validates arguments and publishes an input schema to clients. |
| Vitest with @vitest/coverage-v8 | Tests and coverage | Runs TypeScript suites in `test/` with V8 coverage over `src/`. |

## Discarded

| Tool | Why not |
|---|---|
| Jest | Needs extra transforms for ESM and TypeScript; slower. |
| Bundlers (tsup, Rollup) | Not needed for a small ESM library; `tsc` emits what is published. |
| Express or Fastify | The guards are written against `node:http` directly, which keeps the request path short and visible. |
