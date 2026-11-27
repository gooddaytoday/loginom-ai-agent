import { expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { bundledItems } from "./catalog"

test("the installed catalog lists every bundled skill and only bundled skills", () => {
  const source = new URL("../../../product/skills/", import.meta.url)

  const skillNames = readdirSync(source, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  const installed = bundledItems.filter((item) => item.installed && item.kind === "skill")
  expect(installed.map((item) => item.id).sort()).toEqual(skillNames.sort())
})
