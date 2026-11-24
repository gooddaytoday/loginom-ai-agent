// A stdio MCP server with instructions and one tool, for `loginom-access.test.ts` (B2.9b): its instructions reach the
// model's context only while the Location keeps the server.
const readline = require("node:readline")

readline
  .createInterface({ input: process.stdin })
  .on("line", (line) => {
    const request = JSON.parse(line)
    if (request.id === undefined) return
    const result =
      request.method === "initialize"
        ? {
            protocolVersion: request.params.protocolVersion,
            capabilities: { tools: {} },
            serverInfo: { name: "guide", version: "1" },
            instructions: "Use lookup before mutate.",
          }
        : request.method === "tools/list"
          ? { tools: [{ name: "lookup", description: "Look up", inputSchema: { type: "object", properties: {} } }] }
          : {}
    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }) + "\n")
  })
  .on("close", () => process.exit(0))
