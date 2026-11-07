import * as http from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { checkBearerToken } from "./auth.js";
import { TemplateError } from "./errors.js";
import { requirePositiveInteger } from "./limits.js";
import { silentLogger } from "./logger.js";
import { createRateLimiter } from "./ratelimit.js";
const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_MAX_REQUEST_BYTES = 1_048_576;
const MAX_PORT = 65_535;
const CHALLENGE = 'Bearer realm="mcp"';
function originOf(value) {
    try {
        return new URL(value).origin;
    }
    catch {
        return undefined;
    }
}
function assertOrigin(origin) {
    if (origin !== "null" && originOf(origin) !== origin) {
        throw new TemplateError("INVALID_ORIGIN", `Invalid origin: ${origin}`);
    }
}
function challengeFor(error) {
    if (error === undefined) {
        return CHALLENGE;
    }
    return `${CHALLENGE}, error="${error}"`;
}
function sendJson(res, status, body, headers = {}) {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
        ...headers,
    });
    res.end(payload);
}
function tooLarge(res) {
    sendJson(res, 413, { error: "payload_too_large" }, { Connection: "close" });
}
function readBody(req, maxBytes) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let total = 0;
        let done = false;
        const finish = (value) => {
            if (!done) {
                done = true;
                resolve(value);
            }
        };
        req.on("data", (chunk) => {
            if (done) {
                return;
            }
            total += chunk.length;
            if (total > maxBytes) {
                chunks.length = 0;
                finish(undefined);
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => {
            finish(Buffer.concat(chunks));
        });
        req.on("close", () => {
            finish(Buffer.concat(chunks));
        });
        req.on("error", (error) => {
            if (!done) {
                done = true;
                reject(error);
            }
        });
    });
}
async function dispatch(env, req, res, body) {
    const source = env.source;
    const task = async () => {
        const mcp = typeof source === "function" ? source() : source;
        const transport = new StreamableHTTPServerTransport({
            enableJsonResponse: true,
        });
        const finished = new Promise((resolve) => {
            res.once("close", () => {
                resolve();
            });
        });
        try {
            await mcp.connect(transport);
            await transport.handleRequest(req, res, body);
            await finished;
        }
        finally {
            await mcp.close().catch(() => undefined);
        }
    };
    if (typeof source === "function") {
        await task();
    }
    else {
        await env.exclusive(task);
    }
}
async function handleRequest(env, req, res) {
    let tokenId;
    res.once("close", () => {
        const status = res.statusCode;
        const fields = tokenId === undefined ? { status } : { status, tokenId };
        env.logger.info("http_request", fields);
    });
    try {
        const origin = req.headers.origin;
        if (origin !== undefined && !env.origins.has(origin)) {
            sendJson(res, 403, { error: "forbidden_origin" });
            return;
        }
        const auth = checkBearerToken(req.headers.authorization, env.tokens);
        if (!auth.ok) {
            sendJson(res, 401, { error: auth.error ?? "unauthorized" }, { "WWW-Authenticate": challengeFor(auth.error) });
            return;
        }
        tokenId = auth.tokenId;
        if (env.limiter !== undefined) {
            const verdict = env.limiter.take(auth.tokenId);
            if (!verdict.ok) {
                const seconds = Math.ceil(verdict.retryAfterMs / 1000);
                sendJson(res, 429, { error: "rate_limited" }, { "Retry-After": String(seconds) });
                return;
            }
        }
        if (req.method !== "POST") {
            sendJson(res, 405, { error: "method_not_allowed" }, { Allow: "POST" });
            return;
        }
        const declared = req.headers["content-length"];
        if (declared !== undefined && Number(declared) > env.maxRequestBytes) {
            tooLarge(res);
            return;
        }
        const raw = await readBody(req, env.maxRequestBytes);
        if (raw === undefined) {
            tooLarge(res);
            return;
        }
        let body;
        try {
            body = JSON.parse(raw.toString("utf8"));
        }
        catch {
            sendJson(res, 400, {
                jsonrpc: "2.0",
                error: { code: -32700, message: "Parse error" },
                id: null,
            });
            return;
        }
        await dispatch(env, req, res, body);
    }
    catch {
        env.logger.warn("http_request_failed");
        if (res.headersSent) {
            res.end();
        }
        else {
            sendJson(res, 500, { error: "internal_error" });
        }
    }
}
function closeServer(server) {
    return new Promise((resolve, reject) => {
        server.close((error) => {
            if (error === undefined) {
                resolve();
            }
            else {
                reject(error);
            }
        });
        server.closeAllConnections();
    });
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
export async function startHttp(source, options) {
    if (options.tokens.length === 0 || options.tokens.includes("")) {
        throw new TemplateError("NO_TOKENS", "At least one non-empty token is required");
    }
    const allowedOrigins = options.allowedOrigins ?? [];
    for (const origin of allowedOrigins) {
        assertOrigin(origin);
    }
    const maxRequestBytes = requirePositiveInteger(options.maxRequestBytes ?? DEFAULT_MAX_REQUEST_BYTES, "maxRequestBytes");
    const portOk = Number.isInteger(options.port) && options.port >= 0 && options.port <= MAX_PORT;
    if (!portOk) {
        throw new TemplateError("INVALID_LIMIT", "port must be an integer between 0 and 65535");
    }
    const host = options.host ?? DEFAULT_HOST;
    const limiter = options.rateLimit === undefined
        ? undefined
        : createRateLimiter({
            limit: options.rateLimit.limit,
            windowMs: options.rateLimit.windowMs,
            maxKeys: options.rateLimit.maxKeys,
            now: options.now,
        });
    let tail = Promise.resolve();
    const exclusive = (task) => {
        const result = tail.then(task);
        tail = result.catch(() => undefined);
        return result;
    };
    const env = {
        source,
        tokens: [...options.tokens],
        origins: new Set(allowedOrigins),
        limiter,
        maxRequestBytes,
        logger: options.logger ?? silentLogger,
        exclusive,
    };
    const httpServer = http.createServer((req, res) => {
        void handleRequest(env, req, res);
    });
    await new Promise((resolve, reject) => {
        httpServer.once("error", reject);
        httpServer.listen(options.port, host, () => {
            httpServer.off("error", reject);
            resolve();
        });
    });
    const address = httpServer.address();
    const port = typeof address === "object" && address !== null ? address.port : options.port;
    return { host, port, close: () => closeServer(httpServer) };
}
