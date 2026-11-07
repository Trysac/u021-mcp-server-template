import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Logger } from "./logger.js";
import type { ToolDefinition } from "./tool.js";
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
/**
 * Builds an MCP server whose tools are guarded by argument validation, a timeout race and
 * an output cap.
 *
 * @param options - Server identity, tools, optional clock and logger.
 * @returns A server ready to be connected to any transport.
 * @throws {TemplateError} `DUPLICATE_TOOL` for repeated names, `INVALID_LIMIT` for bad limits.
 */
export declare function createServer(options: ServerOptions): McpServer;
