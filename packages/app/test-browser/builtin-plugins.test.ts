import { expect, test } from "bun:test"

const product = [
  "context",
  "btw",
  "debug",
  "terminal",
  "file",
  "review",
  "details",
  "browser",
  "wsl",
  "updater",
  "microsoft-office",
  "sources",
  "goal",
  "loginom-gui",
]

const app = await import("@/runtime/plugin/builtins")

const desktop = await import("@opencode/gui-plugins/main")

test("the product window registers WSL and keeps pairing and SSH hidden", () => {
  expect(app.builtins.map((plugin) => plugin.id)).toEqual(product)
  expect(desktop.builtins.map((plugin) => plugin.id).toSorted()).toEqual([...product, "pairing", "ssh"].toSorted())
})
