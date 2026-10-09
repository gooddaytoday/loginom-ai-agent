import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import { GetPromptRequestSchema, ListPromptsRequestSchema } from "@modelcontextprotocol/sdk/types.js"

const server = new Server({ name: "external-prompts", version: "1.0.0" }, { capabilities: { prompts: {} } })
server.setRequestHandler(ListPromptsRequestSchema, async () => ({
  prompts: ["package-docs", "loginom-automation", "package_docs", "sample"].map((name) => ({ name })),
}))
server.setRequestHandler(GetPromptRequestSchema, async (request) => ({
  messages: [{ role: "user", content: { type: "text", text: `EXTERNAL MCP ${request.params.name}` } }],
}))
await server.connect(new StdioServerTransport())
