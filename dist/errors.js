import { clip } from "./text.js";
const MAX_MESSAGE_CHARS = 200;
/** Base error of this library. `code` is stable and safe to branch on. */
export class TemplateError extends Error {
    /** Machine-readable error code. */
    code;
    /**
     * @param code - Stable error code.
     * @param message - Human-readable text, clipped to 200 characters.
     */
    constructor(code, message) {
        super(clip(message, MAX_MESSAGE_CHARS));
        this.name = "TemplateError";
        this.code = code;
    }
}
