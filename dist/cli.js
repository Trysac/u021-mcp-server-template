import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { echoTool } from "./echo.js";
import { TemplateError } from "./errors.js";
import { startHttp } from "./http.js";
import { createServer } from "./server.js";
import { clip } from "./text.js";
const SERVER_NAME = "mcp-server-template";
const SERVER_VERSION = "0.0.0";
const DEFAULT_PORT = 3000;
const MAX_PORT = 65_535;
const EXIT_OK = 0;
const EXIT_FAILURE = 1;
const EXIT_USAGE = 2;
const USAGE = [
    "Usage: mcp-server-template [--http] [--port N] [--host H]",
    "",
    "  --http     serve Streamable HTTP instead of stdio",
    "  --port N   TCP port for --http (default 3000)",
    "  --host H   interface for --http (default 127.0.0.1)",
    "",
    "Environment:",
    "  MCP_TOKENS           comma separated bearer tokens (required for --http)",
    "  MCP_ALLOWED_ORIGINS  comma separated Origin values allowed to call",
    "",
].join("\n");
function fail(message) {
    return { ok: false, message };
}
function parseArgs(argv) {
    let http = false;
    let help = false;
    let port;
    let host;
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index] ?? "";
        if (arg === "--http") {
            http = true;
            continue;
        }
        if (arg === "--help") {
            help = true;
            continue;
        }
        if (arg !== "--port" && arg !== "--host") {
            return fail(`Unknown argument: ${clip(arg, 50)}`);
        }
        const value = argv[index + 1];
        if (value === undefined || value === "" || value.startsWith("--")) {
            return fail(`${arg} requires a value`);
        }
        index += 1;
        if (arg === "--host") {
            host = value;
            continue;
        }
        if (!/^\d{1,5}$/.test(value) || Number(value) > MAX_PORT) {
            return fail("--port must be an integer between 0 and 65535");
        }
        port = Number(value);
    }
    if (!http && (port !== undefined || host !== undefined)) {
        return fail("--port and --host require --http");
    }
    return { ok: true, options: { http, help, port: port ?? DEFAULT_PORT, host } };
}
function splitList(value) {
    if (value === undefined) {
        return [];
    }
    return value
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "");
}
function stderrLogger(io) {
    const write = (level, message, fields) => {
        io.stderr.write(`${JSON.stringify({ level, message, ...fields })}\n`);
    };
    return {
        info: (message, fields) => {
            write("info", message, fields);
        },
        warn: (message, fields) => {
            write("warn", message, fields);
        },
    };
}
function buildServer(logger) {
    return createServer({
        name: SERVER_NAME,
        version: SERVER_VERSION,
        tools: [echoTool],
        logger,
    });
}
function shutdownSignal() {
    const controller = new AbortController();
    const stop = () => {
        controller.abort();
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    return controller.signal;
}
function waitForAbort(signal) {
    return new Promise((resolve) => {
        if (signal.aborted) {
            resolve();
            return;
        }
        signal.addEventListener("abort", () => {
            resolve();
        }, { once: true });
    });
}
async function runHttp(options, io, logger) {
    const env = io.env ?? process.env;
    const tokens = splitList(env.MCP_TOKENS);
    if (tokens.length === 0) {
        io.stderr.write("MCP_TOKENS must list at least one token when --http is used\n");
        return EXIT_USAGE;
    }
    const handle = await startHttp(() => buildServer(logger), {
        host: options.host,
        port: options.port,
        tokens,
        allowedOrigins: splitList(env.MCP_ALLOWED_ORIGINS),
        logger,
    });
    io.stderr.write(`Listening on http://${handle.host}:${handle.port}/\n`);
    await waitForAbort(io.signal ?? shutdownSignal());
    await handle.close();
    return EXIT_OK;
}
async function runStdio(io, logger) {
    const transport = io.transport ?? new StdioServerTransport();
    const server = buildServer(logger);
    const closed = new Promise((resolve) => {
        server.server.onclose = () => {
            resolve();
        };
    });
    await server.connect(transport);
    await closed;
    return EXIT_OK;
}
function reportFailure(error, io) {
    if (error instanceof TemplateError) {
        io.stderr.write(`${error.code}: ${error.message}\n`);
        return EXIT_USAGE;
    }
    const message = error instanceof Error ? error.message : "unknown error";
    io.stderr.write(`Server failed: ${clip(message, 200)}\n`);
    return EXIT_FAILURE;
}
/**
 * Command line entry point. Serves stdio by default and Streamable HTTP with `--http`.
 * Tokens come from `MCP_TOKENS`, allowed origins from `MCP_ALLOWED_ORIGINS`.
 *
 * @param argv - Arguments without the program name.
 * @param io - Output streams and optional environment, signal and transport.
 * @returns 0 on success, 1 when the server fails at runtime, 2 for usage or configuration errors.
 */
export async function run(argv, io) {
    const parsed = parseArgs(argv);
    if (!parsed.ok) {
        io.stderr.write(`${parsed.message}\n${USAGE}`);
        return EXIT_USAGE;
    }
    const { options } = parsed;
    if (options.help) {
        io.stdout.write(USAGE);
        return EXIT_OK;
    }
    const logger = stderrLogger(io);
    try {
        if (options.http) {
            return await runHttp(options, io, logger);
        }
        return await runStdio(io, logger);
    }
    catch (error) {
        return reportFailure(error, io);
    }
}
