import { z } from "zod";
/** Maximum length of the text accepted by the echo tool. */
export declare const ECHO_MAX_CHARS = 10000;
/** Example tool that returns its `text` argument unchanged. */
export declare const echoTool: import("./tool.js").ToolDefinition<{
    text: z.ZodString;
}>;
