import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolRequestSchema, ErrorCode, ListToolsRequestSchema, McpError, } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TemplateError } from "./errors.js";
import { requirePositiveInteger } from "./limits.js";
import { silentLogger } from "./logger.js";
import { clip, truncate } from "./text.js";
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_OUTPUT_CHARS = 100_000;
const MAX_ISSUES = 5;
const MAX_ERROR_CHARS = 200;
function prepare(def) {
    const schema = z.object(def.input);
    const json = z.toJSONSchema(schema, { io: "input" });
    const timeoutMs = requirePositiveInteger(def.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
    const maxOutputChars = requirePositiveInteger(def.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS, "maxOutputChars");
    return {
        def,
        schema,
        inputSchema: { ...json, type: "object" },
        timeoutMs,
        maxOutputChars,
    };
}
function failure(code, message) {
    return {
        content: [{ type: "text", text: `ERROR ${code}: ${message}` }],
        isError: true,
    };
}
function describeIssues(issues) {
    const parts = issues.slice(0, MAX_ISSUES).map((issue) => {
        const path = issue.path.map(String).join(".");
        return `${path === "" ? "(root)" : path}: ${issue.message}`;
    });
    return clip(parts.join("; "), MAX_ERROR_CHARS);
}
function toValue(value) {
    return { kind: "value", value };
}
function toError() {
    return { kind: "error" };
}
async function execute(tool, args, clock, logger) {
    const parsed = tool.schema.safeParse(args);
    if (!parsed.success) {
        return failure("INVALID_ARGUMENTS", describeIssues(parsed.error.issues));
    }
    const controller = new AbortController();
    const ctx = { signal: controller.signal, now: clock };
    let timer;
    const timedOut = new Promise((resolve) => {
        timer = setTimeout(() => {
            controller.abort();
            resolve({ kind: "timeout" });
        }, tool.timeoutMs);
    });
    // The handler promise is always observed, so a late rejection after a
    // timeout never becomes an unhandled rejection.
    const settled = Promise.resolve()
        .then(() => tool.def.handler(parsed.data, ctx))
        .then(toValue, toError);
    const outcome = await Promise.race([settled, timedOut]);
    clearTimeout(timer);
    if (outcome.kind === "timeout") {
        logger.warn("tool_timeout", { tool: tool.def.name });
        return failure("TIMEOUT", `Tool did not finish within ${tool.timeoutMs} ms`);
    }
    if (outcome.kind === "value" && typeof outcome.value === "string") {
        const text = truncate(outcome.value, tool.maxOutputChars);
        return { content: [{ type: "text", text }] };
    }
    logger.warn("tool_failed", { tool: tool.def.name });
    return failure("HANDLER_ERROR", "The tool handler failed");
}
/**
 * Builds an MCP server whose tools are guarded by argument validation, a timeout race and
 * an output cap.
 *
 * @param options - Server identity, tools, optional clock and logger.
 * @returns A server ready to be connected to any transport.
 * @throws {TemplateError} `DUPLICATE_TOOL` for repeated names, `INVALID_LIMIT` for bad limits.
 */
export function createServer(options) {
    const clock = options.clock ?? (() => new Date());
    const logger = options.logger ?? silentLogger;
    const registry = new Map();
    for (const def of options.tools) {
        if (registry.has(def.name)) {
            throw new TemplateError("DUPLICATE_TOOL", `Duplicate tool name: ${def.name}`);
        }
        registry.set(def.name, prepare(def));
    }
    const server = new McpServer({ name: options.name, version: options.version }, { capabilities: { tools: {} } });
    const listing = [...registry.values()].map((tool) => ({
        name: tool.def.name,
        description: tool.def.description,
        inputSchema: tool.inputSchema,
    }));
    server.server.setRequestHandler(ListToolsRequestSchema, () => ({
        tools: listing,
    }));
    server.server.setRequestHandler(CallToolRequestSchema, (request) => {
        const tool = registry.get(request.params.name);
        if (tool === undefined) {
            throw new McpError(ErrorCode.InvalidParams, "Unknown tool");
        }
        return execute(tool, request.params.arguments ?? {}, clock, logger);
    });
    return server;
}
