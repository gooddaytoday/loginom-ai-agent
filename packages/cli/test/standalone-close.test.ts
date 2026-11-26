import { expect, test } from "bun:test"
import { Effect } from "effect"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../../core/test/fixture/tmpdir"
import { Standalone } from "../src/services/standalone"

test("closing a private server waits for its graceful shutdown before signalling its group", async () => {
  // The server's Host closes the Runtime children and acknowledges it; a group SIGTERM sent first disconnects them
  // before the acknowledgement (RUNTIME_CLOSE_ACK_MISSING).
  await using root = await tmpdir("opencode-cli-standalone-close-")
  const marker = path.join(root.path, "marker")
  process.env.STANDALONE_MARKER = marker
  await Effect.runPromise(
    Effect.scoped(
      Standalone.start({ command: [process.execPath, path.join(import.meta.dir, "fixture/standalone-slow-server.mjs")] }),
    ),
  )
  expect(await fs.readFile(marker, "utf8")).toBe("graceful\n")
})
