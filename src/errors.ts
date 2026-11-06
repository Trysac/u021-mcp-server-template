import { clip } from "./text.js";

/** Stable machine-readable codes carried by {@link TemplateError}. */
export type TemplateErrorCode = "DUPLICATE_TOOL" | "NO_TOKENS" | "INVALID_LIMIT" | "INVALID_ORIGIN";

const MAX_MESSAGE_CHARS = 200;

/** Base error of this library. `code` is stable and safe to branch on. */
export class TemplateError extends Error {
  /** Machine-readable error code. */
  readonly code: TemplateErrorCode;

  /**
   * @param code - Stable error code.
   * @param message - Human-readable text, clipped to 200 characters.
   */
  constructor(code: TemplateErrorCode, message: string) {
    super(clip(message, MAX_MESSAGE_CHARS));
    this.name = "TemplateError";
    this.code = code;
  }
}
