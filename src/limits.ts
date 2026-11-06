import { TemplateError } from "./errors.js";

/**
 * Returns `value` when it is a positive integer.
 *
 * @throws {TemplateError} With code `INVALID_LIMIT` otherwise.
 */
export function requirePositiveInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new TemplateError("INVALID_LIMIT", `${label} must be a positive integer`);
  }
  return value;
}
