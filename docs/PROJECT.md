# Project record: mcp-server-template

## Objective

Provide a small TypeScript MCP server skeleton in which authentication, Origin validation, request size and rate limits, and per-tool timeouts and output caps are built in and tested, so that a team starting an MCP server does not expose an unguarded quickstart. The intended users are developers who build MCP servers in TypeScript on Node.js 20 or newer.

## Scope

In scope:

- The public API documented in the README: `defineTool`, `createServer`, `startHttp`, `checkBearerToken`, `createRateLimiter`, `run`, `echoTool`, `TemplateError`, `silentLogger`.
- Tools served over stdio and over stateless Streamable HTTP.
- Bearer tokens from configuration, Origin allow-listing, per-token fixed-window rate limiting, body size caps and output caps.

Out of scope:

- Resources, prompts and sessions. The HTTP transport is stateless and only tools are served.
- MCP OAuth 2.1 authorization. Static bearer tokens are the only authentication.
- TLS termination. The server speaks plain HTTP.
- Rate limits shared across processes.
- Authentication on the stdio transport.

## Timeline

| Date | Milestone |
|---|---|
| 2026 | Repository created from the factory utility template. |

## Effort metrics

Measured values only. Leave "pending measurement" until a real figure is recorded; never estimate here.

| Metric | Value | Source |
|---|---|---|
| Tokens (input / output) | 676712 / 151174 | factory ledger |
| Hours (human) | pending measurement | time log |
| Cost (USD) | 1.1951 | factory ledger |

## Factory run u021 (measured from API usage)

| Phase | Model | Batch | Input | Output | Cache write | Cache read | Cost (USD) |
|---|---|---|---|---|---|---|---|
| generation | claude-sonnet-5-5 | yes | 2757 | 119048 | 0 | 4473 | 0.5984 |
| fix-1 | claude-sonnet-5-5 | no | 6 | 3594 | 13923 | 47018 | 0.0755 |
| fix-2 | claude-sonnet-5-5 | no | 6 | 3704 | 18001 | 50683 | 0.0871 |
| fix-3 | claude-sonnet-5-5 | no | 6 | 1370 | 10591 | 45125 | 0.0447 |
| fix-4 | claude-sonnet-5-5 | no | 16 | 2601 | 14090 | 147471 | 0.0760 |
| fix-1 | claude-sonnet-5-5 | no | 6 | 522 | 7178 | 42071 | 0.0274 |
| fix-2 | claude-sonnet-5-5 | no | 6 | 945 | 6531 | 40038 | 0.0298 |
| audit | claude-sonnet-5-5 | no | 12 | 4832 | 38189 | 139431 | 0.1578 |
| fix-3 | claude-sonnet-5-5 | no | 8 | 2809 | 11093 | 61028 | 0.0619 |
| fix-4 | claude-sonnet-5-5 | no | 8 | 1094 | 4215 | 58599 | 0.0274 |
| docs | claude-haiku-5-5 | no | 37944 | 10655 | 0 | 0 | 0.0091 |

Total: $1.1951. Prices: Anthropic list prices.
