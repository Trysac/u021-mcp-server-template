import type { z } from "zod";
/** Per-call context handed to a tool handler. */
export interface ToolContext {
    /** Aborted when the tool exceeds its timeout. */
    readonly signal: AbortSignal;
    /** Injected clock; use it instead of `new Date()` to stay deterministic. */
    now(): Date;
}
/** Declarative description of one MCP tool. */
export interface ToolDefinition<S extends z.ZodRawShape = z.ZodRawShape> {
    /** Tool name, unique inside one server. */
    readonly name: string;
    /** Human-readable description shown to clients. */
    readonly description: string;
    /** Zod raw shape describing the arguments. */
    readonly input: S;
    /** Maximum run time in milliseconds. Default 10_000. */
    readonly timeoutMs?: number | undefined;
    /** Maximum output length in UTF-16 units. Default 100_000. */
    readonly maxOutputChars?: number | undefined;
    /** Runs the tool with validated arguments and returns its text output. */
    handler(args: z.output<z.ZodObject<S>>, ctx: ToolContext): Promise<string>;
}
/**
 * Declares a tool. Returns a frozen copy so definitions cannot be mutated later.
 *
 * @param def - The tool definition.
 * @returns The frozen definition.
 */
export declare function defineTool<S extends z.ZodRawShape>(def: ToolDefinition<S>): ToolDefinition<S>;
