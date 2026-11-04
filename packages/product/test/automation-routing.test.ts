import { expect, test } from "bun:test"
import { readdir } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const root = new URL("../skills/loginom-automation/", import.meta.url)
const skill = await Bun.file(new URL("SKILL.md", root)).text()

test("automation entry stays below 40 KB as the node catalog grows", () => {
  expect(Buffer.byteLength(skill)).toBeLessThanOrEqual(40_000)
})

test("every installed node handler has one routing row and one bounded reference", async () => {
  // Ask the production registration function, without launching a browser.
  const inventory = Bun.spawnSync([
    process.execPath,
    "--eval",
    `import { createCandidateNodeSupport } from ${JSON.stringify(new URL("../../loginom-runtime/client/lib/node-support.mjs", import.meta.url).href)};
     import { NODE_TYPES } from ${JSON.stringify(new URL("../../loginom-runtime/client/lib/node-contracts.mjs", import.meta.url).href)};
     console.log(JSON.stringify({registered:Object.keys(NODE_TYPES),handlers:[...createCandidateNodeSupport({targetOrigin:"https://app.loginom.ai",targetBuild:"7.4.2"}).nodeApplyHandlers.keys()]}));`,
  ])
  expect(inventory.exitCode, inventory.stderr.toString()).toBe(0)
  const { handlers, registered }: { handlers: string[]; registered: string[] } = JSON.parse(inventory.stdout.toString())
  const rows = [...skill.matchAll(/^\|.*\[([^\]]+)\]\((references\/nodes\/([\w.]+)\.md)\).*\|$/gm)]
  expect(rows.map((row) => row[3]).toSorted()).toEqual(handlers.toSorted())
  expect((await readdir(new URL("references/nodes/", root))).toSorted()).toEqual(
    handlers.map((type) => `${type}.md`).toSorted(),
  )
  for (const row of rows) {
    expect(registered).toContain(row[3])
    expect(row[0]).toContain(`\`${row[3]}\``)
    const node = Bun.file(new URL(row[2], root))
    expect(await node.exists(), fileURLToPath(new URL(row[2], root))).toBe(true)
    expect(node.size, row[3]).toBeLessThanOrEqual(6_000)
    expect((await node.text()).trim().length).toBeGreaterThan(0)
  }
})

test("node paths are usable beyond the sampled SkillTool resource list", () => {
  expect(skill).toContain("Base directory for this skill")
  expect(skill).toContain("Список ресурсов")
  expect(skill).toContain("буквально")
  expect(skill).toContain("references/nodes/")
})
