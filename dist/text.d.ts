/** Cuts `text` to at most `max` UTF-16 code units. */
export declare function clip(text: string, max: number): string;
/**
 * Truncates `text` to at most `max` UTF-16 units without splitting a surrogate pair
 * and appends a marker stating how many units were omitted.
 */
export declare function truncate(text: string, max: number): string;
