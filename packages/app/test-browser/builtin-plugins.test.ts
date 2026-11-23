import { expect, test } from "bun:test"

// Loginom AI Agent (B4.11e): the product window loads no pairing, SSH or WSL, as in 0.4; SSH and WSL install upstream
// OpenCode on the remote machine. Every other built-in stays. Desktop main still lists all three, as upstream does:
// without a window entry they have no UI.
const product = [
  "context",
  "btw",
  "debug",
  "terminal",
  "file",
  "review",
  "details",
  "browser",
  "updater",
  "microsoft-office",
  "sources",
  "goal",
]

const app = await import("@/runtime/plugin/builtins")

const desktop = await import("@opencode/gui-plugins/main")

test("the product window registers every built-in but pairing, SSH and WSL, which only Desktop main lists", () => {
  expect(app.builtins.map((plugin) => plugin.id)).toEqual(product)
  expect(desktop.builtins.map((plugin) => plugin.id).toSorted()).toEqual(
    [...product, "pairing", "ssh", "wsl"].toSorted(),
  )
})
