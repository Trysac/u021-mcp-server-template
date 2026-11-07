import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Logger } from "./logger.js";
type ServerSource = McpServer | (() => McpServer);
/** Fixed-window rate limit applied per token. */
export interface HttpRateLimit {
    readonly limit: number;
    readonly windowMs: number;
    readonly maxKeys?: number | undefined;
}
/** Options of {@link startHttp}. */
export interface HttpOptions {
    /** Interface to bind. Default `127.0.0.1`. */
    readonly host?: string | undefined;
    /** TCP port; 0 picks a free port. */
    readonly port: number;
    /** Accepted bearer tokens. At least one non-empty token is required. */
    readonly tokens: readonly string[];
    /** Exact Origin strings that may call the server. Default none. */
    readonly allowedOrigins?: readonly string[] | undefined;
    /** Maximum request body in bytes. Default 1 MiB. */
    readonly maxRequestBytes?: number | undefined;
    /** Optional per-token rate limit. */
    readonly rateLimit?: HttpRateLimit | undefined;
    /** Clock in milliseconds used by the rate limiter. */
    readonly now?: (() => number) | undefined;
    /** Logger. Records carry the token id only, never a token. */
    readonly logger?: Logger | undefined;
}
/** Handle of a running HTTP server. */
export interface HttpHandle {
    /** Interface the server is bound to. */
    readonly host: string;
    /** Port the server listens on. */
    readonly port: number;
    /** Stops listening and closes open connections. */
    close(): Promise<void>;
}
/**
 * Serves an MCP server over stateless Streamable HTTP with the guards applied in this
 * order: Origin check (403), bearer auth (401), per-token rate limit (429), method check
 * (405), streaming body size cap (413), then a fresh transport per request.
 *
 * Pass a factory to serve requests concurrently; a single instance is served one request at
 * a time because one server can only be connected to one transport at once.
 *
 * @param source - A server, or a factory creating one server per request.
 * @param options - Binding, tokens and limits.
 * @returns The bound host and port plus a `close` function.
 * @throws {TemplateError} `NO_TOKENS`, `INVALID_ORIGIN` or `INVALID_LIMIT` for bad options.
 */
export declare function startHttp(source: ServerSource, options: HttpOptions): Promise<HttpHandle>;
export {};
