import { expect, test } from "bun:test"
import { loadWhatsNewHighlights } from "../../gui-plugins/src/updater/whats-new"

// Loginom AI Agent (B4.12): What's New reads only the product changelog, and the product has none, as in 0.4. Then it
// requests nothing and shows nothing; the release is marked seen. A fetch with an aborted signal rejects at once, so any
// request (opencode.ai or another host) fails this test without reaching the network.
test("What's New requests no changelog while the product has none", async () => {
  expect(await loadWhatsNewHighlights({ previous: "0.4.0", current: "0.5.0", signal: AbortSignal.abort() })).toEqual([])
})
