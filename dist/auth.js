import { createHash, timingSafeEqual } from "node:crypto";
const MAX_TOKEN_CHARS = 4096;
const TOKEN_ID_CHARS = 8;
const BEARER_PATTERN = /^bearer +(.*)$/i;
function sha256(value) {
    return createHash("sha256").update(value, "utf8").digest();
}
function tokenIdOf(token) {
    return sha256(token).toString("hex").slice(0, TOKEN_ID_CHARS);
}
/**
 * Checks an `Authorization` header against the configured tokens (RFC 6750 sections 2.1
 * and 3). The scheme is matched case-insensitively (RFC 9110 section 11.1). Tokens are
 * compared as sha256 digests with `timingSafeEqual` against every configured digest, with
 * no early exit.
 *
 * @param header - Raw `Authorization` header value, if any.
 * @param allowed - Accepted tokens.
 * @returns `ok` with a non-secret `tokenId` (first 8 hex characters of the token's
 * sha256), or a 401 verdict. `error: "invalid_token"` is set only when a token was presented.
 */
export function checkBearerToken(header, allowed) {
    if (header === undefined) {
        return { ok: false, status: 401 };
    }
    const token = BEARER_PATTERN.exec(header)?.[1]?.trim() ?? "";
    if (token === "") {
        return { ok: false, status: 401 };
    }
    if (token.length > MAX_TOKEN_CHARS) {
        return { ok: false, status: 401, error: "invalid_token" };
    }
    const presented = sha256(token);
    let matched;
    for (const candidate of allowed) {
        const equal = timingSafeEqual(presented, sha256(candidate));
        if (equal && matched === undefined) {
            matched = candidate;
        }
    }
    if (matched === undefined) {
        return { ok: false, status: 401, error: "invalid_token" };
    }
    return { ok: true, tokenId: tokenIdOf(matched) };
}
