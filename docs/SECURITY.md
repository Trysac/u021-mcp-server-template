# Security

This document describes the threat model of `@trysac/mcp-server-template`, a hardened MCP server skeleton. The MCP SDK quickstart examples omit the guards below; this template implements them and tests each one.

## Threat model

The server exposes tools to an MCP client over stdio or stateless Streamable HTTP. The HTTP endpoint is the main attack surface. It may be reached by a browser controlled by an attacker (DNS rebinding, cross-origin requests), by a network peer without credentials, or by a peer sending oversized or abusive traffic. Tool code is trusted, but its failures must not leak details to the caller or into logs.

## Defended

| Threat | Guard |
|---|---|
| DNS rebinding and cross-origin browser calls | An Origin header that is present and not listed in `allowedOrigins` gets 403, as the MCP specification (2025-06-18, Transports, Security Warning) requires. Origins compare as exact strings; `null` passes only when listed. Requests without an Origin header pass. |
| Exposure on the network | The HTTP server binds to `127.0.0.1` unless a host is given explicitly. |
| Missing or wrong credentials | Bearer authentication per RFC 6750 sections 2.1 and 3. The response is 401 with `WWW-Authenticate: Bearer realm="mcp"`; `error="invalid_token"` is added only when a token was presented. The scheme matches case-insensitively (RFC 9110 section 11.1). Presented tokens longer than 4 096 characters are rejected. |
| Token guessing through timing | Tokens are compared as sha256 digests with `crypto.timingSafeEqual` against every configured digest, with no early exit. |
| Oversized requests | The body is counted while it streams. Once it exceeds `maxRequestBytes` (default 1 MiB) the answer is 413, for Content-Length and chunked uploads alike. |
| Request floods from an authenticated token | A fixed-window limiter keyed by token id answers 429 with `Retry-After` in whole seconds, rounded up. At `maxKeys` (default 10 000) the oldest key is evicted, so memory stays bounded. |
| Hanging or slow tools | Arguments are validated with zod, then the handler races a timer (default 10 s). On timeout the signal aborts and an `ERROR TIMEOUT` result is returned even if the handler never settles. |
| Oversized tool output | Output is capped at `maxOutputChars` (default 100 000 UTF-16 units). A surrogate pair is never split. |
| Leaks through errors and logs | Thrown handler messages are replaced by a generic text. Logs carry the token id (first 8 hex characters of the token's sha256) only, never a token, header, body or tool argument. |

## Not defended

- Unauthenticated floods. The rate limit runs only after a token is accepted, so requests without a valid token are not rate limited; they are rejected with 401 after the Origin check.
- MCP OAuth 2.1 authorization. Static bearer tokens are the only authentication.
- TLS. The server speaks plain HTTP; terminate TLS in a reverse proxy when it is reachable beyond localhost.
- Multi-instance rate limits. The limiter lives in the memory of one process; several instances each enforce their own window.
- Stdio transport. Authentication, Origin and rate checks apply only to HTTP; stdio trusts its local parent process.
- Tool-level authorization. Every authenticated token can call every registered tool.

## Guard order for HTTP requests

1. Origin check (403).
2. Bearer authentication (401).
3. Rate limit keyed by token id (429).
4. Method check (405) and body size limit (413).
5. JSON parsing (400) and a fresh stateless transport per request.

A single `McpServer` instance passed to `startHttp` is served one request at a time, because it can connect to only one transport at once. Pass a factory to serve requests concurrently.

## Reporting vulnerabilities

Follow the instructions in the repository `SECURITY.md`. Never include real tokens in reports.
