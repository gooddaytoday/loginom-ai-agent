import { expect, test } from "bun:test"

// Loginom AI Agent (B4.11e): the product window loads no pairing, SSH or WSL, as in 0.4; SSH and WSL install upstream
// OpenCode on the remote machine. Every other built-in stays. Desktop main still lists WSL: without its window entry it
// has no UI, and its main entry alone bundles node-pty for the Desktop build.
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

test("the product window and Desktop main register every built-in but pairing and SSH, and WSL only in main", () => {
  expect(app.builtins.map((plugin) => plugin.id)).toEqual(product)
  expect(desktop.builtins.map((plugin) => plugin.id)).toEqual(
    product.flatMap((id) => (id === "updater" ? [id, "wsl"] : [id])),
  )
})
