import assert from "node:assert/strict";
import { test } from "node:test";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { wrapRecord } from "../dist/tools/helpers.js";
import { formatToolResult, toMarkdown } from "../dist/services/format.js";

for (const format of ["json", "markdown"]) {
  for (const [name, data] of [
    ["array", [{ stockMovement: { id: "movement-1", change: -1 } }]],
    ["empty array", []],
    ["object", { stockMovement: { id: "movement-1", change: 1 } }],
    ["null", null],
    ["string", "ok"],
    ["number", 0],
    ["boolean", false],
    ["undefined", undefined]
  ]) {
    test(`wrapRecord produces valid ${format} MCP content for ${name}`, () => {
      const result = wrapRecord(data, format, "Stock Movement");
      const expected = data !== null && typeof data === "object" && !Array.isArray(data)
        ? data : { result: data };
      assert.deepEqual(result.output, expected);
      assert.equal(Array.isArray(result.output), false);
      if (Array.isArray(data)) {
        assert.equal(result.markdown, toMarkdown(data, "Stock Movement"));
        assert.equal(result.output.result, data, "preserve the complete array");
      }
      const formatted = formatToolResult(result.output, result.responseFormat, result.markdown);
      const parsed = CallToolResultSchema.safeParse({
        content: [{ type: "text", text: formatted.text }],
        structuredContent: formatted.structured
      });
      assert.equal(parsed.success, true);
      if (format === "json") {
        assert.deepEqual(JSON.parse(formatted.text), JSON.parse(JSON.stringify(expected)));
      }
    });
  }
}
