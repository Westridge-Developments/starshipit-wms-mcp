import assert from "node:assert/strict";
import { test } from "node:test";
import axios from "axios";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// Set before importing the server: every outbound WMS request is intercepted.
// These tests never use warehouse credentials or make real network requests.
let responseBody;
const requests = [];
axios.defaults.adapter = async (config) => {
  assert.equal(config.method, "post");
  assert.equal(config.url, "/api/stock-movement");
  requests.push(JSON.parse(config.data));
  return { data: responseBody, status: 201, statusText: "Created", headers: {}, config };
};
const { createMcpServer } = await import("../dist/server.js");
const { runWithContext } = await import("../dist/services/context.js");

const removal = {
  stockMovement: { id: "movement-out", change: -1 },
  allocation: { inventoryId: "inventory-1", quantityAllocated: 1 }
};
const addition = { stockMovement: { id: "movement-in", change: 1 } };

// The response shapes follow the vendored WMS API reference.
test("stock movement results round-trip through MCP without a second POST", async (t) => {
  const server = createMcpServer();
  const client = new Client({ name: "offline-regression", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  try {
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    for (const format of ["json", "markdown"]) {
      for (const [name, body, change] of [
        ["deduction array", [removal], -1],
        ["multi-entry deduction array", [removal, { ...removal, stockMovement: { id: "movement-out-2", change: -1 } }], -2],
        ["addition object", addition, 1],
        ["transfer object", { removalResult: [removal], additionResult: addition }, 1]
      ]) {
        await t.test(`${format}: ${name}`, async () => {
          responseBody = body;
          const before = requests.length;
          const args = {
            productId: "mock-product", locationId: "mock-location", change,
            reason: "Adj SHOP", reference: `offline-${format}-${name}`,
            response_format: format,
            ...(name === "transfer object" ? { transferLocationId: "mock-source" } : {})
          };
          const result = await runWithContext({ apiKey: "offline-placeholder-not-a-real-key" }, () => client.callTool({
            name: "starshipit_wms_create_stock_movement", arguments: args
          }));
          assert.notEqual(result.isError, true);
          assert.deepEqual(result.structuredContent, Array.isArray(body) ? { result: body } : body);
          assert.equal(requests.length - before, 1, "exactly one outbound request per call");
          const { response_format, ...expectedRequest } = args;
          assert.deepEqual(requests.at(-1), expectedRequest);
        });
      }
    }
  } finally {
    await client.close();
    await server.close();
  }
});
