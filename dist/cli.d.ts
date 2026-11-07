import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
/** Input and output streams of {@link run}; injectable for tests. */
export interface CliIo {
    readonly stdout: {
        write(text: string): void;
    };
    readonly stderr: {
        write(text: string): void;
    };
    /** Environment variables. Defaults to `process.env`. */
    readonly env?: Readonly<Record<string, string | undefined>> | undefined;
    /** Stops the HTTP server when aborted. Defaults to SIGINT and SIGTERM. */
    readonly signal?: AbortSignal | undefined;
    /** Transport used in stdio mode. Defaults to process stdio. */
    readonly transport?: Transport | undefined;
}
/**
 * Command line entry point. Serves stdio by default and Streamable HTTP with `--http`.
 * Tokens come from `MCP_TOKENS`, allowed origins from `MCP_ALLOWED_ORIGINS`.
 *
 * @param argv - Arguments without the program name.
 * @param io - Output streams and optional environment, signal and transport.
 * @returns 0 on success, 1 when the server fails at runtime, 2 for usage or configuration errors.
 */
export declare function run(argv: string[], io: CliIo): Promise<number>;
