import { expect, test } from "bun:test"
import { supervise } from "../src/supervisor"

test("managed launch rejects relative executable paths before starting any process", async () => {
  await expect(supervise({ node: "node", entry: "/runtime/entry.mjs", resources: "/runtime", stateDir: "/data", chat: "chat", generation: 1,
    endpoint: "https://example.test/mcp", connection: { apiKey: "key", password: "", url: "http://example.test", username: "user" } })).rejects.toThrow("LOGINOM_ABSOLUTE_PATH_REQUIRED")
})
