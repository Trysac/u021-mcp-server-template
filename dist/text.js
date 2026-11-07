/** Cuts `text` to at most `max` UTF-16 code units. */
export function clip(text, max) {
    return text.length <= max ? text : text.slice(0, max);
}
function isHighSurrogate(unit) {
    return unit >= 0xd800 && unit <= 0xdbff;
}
function isLowSurrogate(unit) {
    return unit >= 0xdc00 && unit <= 0xdfff;
}
/**
 * Truncates `text` to at most `max` UTF-16 units without splitting a surrogate pair
 * and appends a marker stating how many units were omitted.
 */
export function truncate(text, max) {
    if (text.length <= max) {
        return text;
    }
    let cut = max;
    const splitsPair = cut > 0 && isHighSurrogate(text.charCodeAt(cut - 1)) && isLowSurrogate(text.charCodeAt(cut));
    if (splitsPair) {
        cut -= 1;
    }
    const omitted = text.length - cut;
    return `${text.slice(0, cut)}\n[truncated: ${omitted} chars omitted]`;
}
