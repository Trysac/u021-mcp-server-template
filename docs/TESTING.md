# Testing

## Tools

- [Vitest](https://vitest.dev/) runs the suites in `test/`.
- Coverage is collected with V8 (`@vitest/coverage-v8`) over `src/`.

## Commands

```sh
npx vitest run      # run all suites once
npx vitest          # watch mode while developing
```

## Test files

- `test/auth.test.ts`: `checkBearerToken` verdicts for missing, non-bearer, unknown and near-miss tokens, the case-insensitive scheme, and `createRateLimiter` window, eviction, default clock and option validation.
- `test/cli.test.ts`: `run` usage errors (exit 2), `--help`, missing `MCP_TOKENS`, stdio through an in-memory transport, HTTP serving until an abort signal, invalid origins and a runtime port conflict (exit 1).
- `test/http.test.ts`: `startHttp` on 127.0.0.1 with 401 challenges, 403 origin rejection, 413 body limits for Content-Length and chunked uploads, per-token 429 with `Retry-After`, 405 and 400 responses, concurrent requests, 500 without detail leaks, option validation and token-free logging.
- `test/server.test.ts`: `createServer` through an in-memory client: tool listing, JSON schema publication, `INVALID_ARGUMENTS`, `TIMEOUT`, `HANDLER_ERROR`, output truncation without splitting surrogate pairs, and `DUPLICATE_TOOL`.
- `test/index.test.ts`: the exported names, `defineTool` freezing, `echoTool`, `TemplateError` code and clipping, and `silentLogger`.
- `test/literals.test.ts`: scheme handling of `checkBearerToken`.
- `test/acceptance-literals.test.ts`: keeps acceptance phrases verbatim as a traceability list.

## Rules

- Test through the public entry point (`src/index.ts`) where possible and assert observable behavior: return values, status codes, thrown errors and their codes.
- Tests are deterministic: they use injected clocks where timing matters, bind to port 0, and do not share state.
- Coverage thresholds are set in `vitest.config.ts`; lowering them is not allowed.

## Reports

Coverage reports are written to `coverage/`. The folder is ignored by git.
