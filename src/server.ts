import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { TemplateError } from "./errors.js";
import { requirePositiveInteger } from "./limits.js";
import { type Logger, silentLogger } from "./logger.js";
import { clip, truncate } from "./text.js";
import type { ToolContext, ToolDefinition } from "./tool.js";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_OUTPUT_CHARS = 100_000;
const MAX_ISSUES = 5;
const MAX_ERROR_CHARS = 200;

type ToolErrorCode = "INVALID_ARGUMENTS" | "TIMEOUT" | "HANDLER_ERROR";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

type Outcome = { kind: "value"; value: unknown } | { kind: "error" } | { kind: "timeout" };

interface Issue {
  readonly path: readonly PropertyKey[];
  readonly message: string;
}

/** Options of {@link createServer}. */
export interface ServerOptions {
  /** Server name announced to clients. */
  readonly name: string;
  /** Server version announced to clients. */
  readonly version: string;
  /** Tools to serve. Names must be unique. */
  readonly tools: readonly ToolDefinition[];
  /** Clock handed to tool handlers. Defaults to the system clock. */
  readonly clock?: (() => Date) | undefined;
  /** Logger. Defaults to a logger that discards everything. */
  readonly logger?: Logger | undefined;
}

function prepare(def: ToolDefinition) {
  const schema = z.object(def.input);
  const json = z.toJSONSchema(schema, { io: "input" });
  const timeoutMs = requirePositiveInteger(def.timeoutMs ?? DEFAULT_TIMEOUT_MS, "timeoutMs");
  const maxOutputChars = requirePositiveInteger(
    def.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS,
    "maxOutputChars",
  );
  return {
    def,
    schema,
    inputSchema: { ...json, type: "object" as const },
    timeoutMs,
    maxOutputChars,
  };
}

type Prepared = ReturnType<typeof prepare>;

function failure(code: ToolErrorCode, message: string): ToolResult {
  return {
    content: [{ type: "text", text: `ERROR ${code}: ${message}` }],
    isError: true,
  };
}

function describeIssues(issues: readonly Issue[]): string {
  const parts = issues.slice(0, MAX_ISSUES).map((issue) => {
    const path = issue.path.map(String).join(".");
    return `${path === "" ? "(root)" : path}: ${issue.message}`;
  });
  return clip(parts.join("; "), MAX_ERROR_CHARS);
}

function toValue(value: string): Outcome {
  return { kind: "value", value };
}

function toError(): Outcome {
  return { kind: "error" };
}

async function execute(
  tool: Prepared,
  args: unknown,
  clock: () => Date,
  logger: Logger,
): Promise<ToolResult> {
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return failure("INVALID_ARGUMENTS", describeIssues(parsed.error.issues));
  }
  const controller = new AbortController();
  const ctx: ToolContext = { signal: controller.signal, now: clock };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<Outcome>((resolve) => {
    timer = setTimeout(() => {
      controller.abort();
      resolve({ kind: "timeout" });
    }, tool.timeoutMs);
  });
  // The handler promise is always observed, so a late rejection after a
  // timeout never becomes an unhandled rejection.
  const settled = Promise.resolve()
    .then(() => tool.def.handler(parsed.data as never, ctx))
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
export function createServer(options: ServerOptions): McpServer {
  const clock = options.clock ?? (() => new Date());
  const logger = options.logger ?? silentLogger;
  const registry = new Map<string, Prepared>();
  for (const def of options.tools) {
    if (registry.has(def.name)) {
      throw new TemplateError("DUPLICATE_TOOL", `Duplicate tool name: ${def.name}`);
    }
    registry.set(def.name, prepare(def));
  }
  const server = new McpServer(
    { name: options.name, version: options.version },
    { capabilities: { tools: {} } },
  );
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
