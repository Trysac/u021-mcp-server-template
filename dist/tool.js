/**
 * Declares a tool. Returns a frozen copy so definitions cannot be mutated later.
 *
 * @param def - The tool definition.
 * @returns The frozen definition.
 */
export function defineTool(def) {
    return Object.freeze({ ...def });
}
