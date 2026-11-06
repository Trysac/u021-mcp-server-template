# Guard the MCP SDK with explicit request handlers and a stateless HTTP pipeline

Status: accepted (generated, pending human review)

## Context

MCP server quickstarts ship without authentication, Origin validation, input limits or tests. The transport specification requires Origin validation against DNS rebinding and recommends binding to localhost. The SDK's McpServer.registerTool validates arguments itself and reports failures with its own text, so it cannot produce the stable 'ERROR INVALID_ARGUMENTS' result this template promises. One McpServer can also only be connected to one transport at a time, which conflicts with a stateless transport per request.

## Decision

createServer builds an McpServer with the tools capability and installs tools/list and tools/call through server.server.setRequestHandler. Zod validation, the Promise.race timeout, the output cap and the generic error replacement therefore live in one place with stable ERROR codes. startHttp is a plain node:http server with a fixed pipeline: Origin check, bearer auth with sha256 digests and timingSafeEqual, fixed-window limiter keyed by token id, streaming body cap, then a stateless StreamableHTTPServerTransport per request. It accepts either a single server, which is serialised, or a factory, which allows concurrency. Failures are typed through one TemplateError class with stable codes.

## Consequences

Guards are testable end to end through InMemoryTransport and real sockets without network access. Tools are not registered through registerTool, so calling registerTool on the returned server later would replace the handlers. A shared server instance handles one HTTP request at a time, and the factory form is recommended for concurrency. The rate limiter is per process only. TLS and OAuth 2.1 remain the deployer's responsibility, as documented in docs/SECURITY.md.
