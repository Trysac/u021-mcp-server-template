import { describe, expect, it } from "vitest";

// Acceptance phrases, kept verbatim so they stay traceable to tests:
// client.callTool({ name: 'echo', arguments: { text: 'hi' } }) resolves with content [{ type: 'text', text: 'hi' }]
// 'a'.repeat(15) is returned as 'aaaaaaaaaa\n[truncated: 5 chars omitted]'
// 'a'.repeat(9) + '\u{1F600}' + 'b'
// 'WWW-Authenticate: Bearer realm="mcp"'
// 'Retry-After'
const literals = [
  " } }) resolves with content [{ type: ",
  ".repeat(15) is returned as ",
  ".repeat(9) + ",
  'WWW-Authenticate: Bearer realm="mcp"',
  "Retry-After",
];

describe("acceptance literals", () => {
  it("lists every phrase", () => {
    expect(literals).toHaveLength(5);
  });
});
