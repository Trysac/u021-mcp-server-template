/** Result of {@link checkBearerToken}. */
export type BearerResult = {
    ok: true;
    tokenId: string;
} | {
    ok: false;
    status: 401;
    error?: "invalid_token";
};
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
export declare function checkBearerToken(header: string | undefined, allowed: readonly string[]): BearerResult;
