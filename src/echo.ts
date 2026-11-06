import { z } from "zod";
import { defineTool } from "./tool.js";

/** Maximum length of the text accepted by the echo tool. */
export const ECHO_MAX_CHARS = 10_000;

/** Example tool that returns its `text` argument unchanged. */
export const echoTool = defineTool({
  name: "echo",
  description: "Returns the given text unchanged.",
  input: {
    text: z.string().max(ECHO_MAX_CHARS).describe("Text to echo back"),
  },
  handler: (args) => Promise.resolve(args.text),
});
