import { afterEach, describe, expect, test } from "bun:test"
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import release from "../../../../product/loginom-release.json"
import { resourceInventory } from "../../../../loginom-runtime/src/resource-inventory.mjs"
import { LoginomResources } from "./resources"

// Contract (B4.8a, PKG-01): the installer's `--verify-resources` passes only for the complete Loginom resources that
// scripts/bundle-loginom.ts stages, and a packaged app hands its background service those resources or refuses to
// start it, as a built CLI refuses to serve without its artifact (B2.7a2b). Fixtures are laid out as bundle-loginom
// lays them out: the manifest lists the staged files, and the Host entry is built after it.
const node = process.platform === "win32" ? "bin/node.exe" : "bin/node"

const cleanup: Array<() => Promise<void>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((run) => run()))
})

async function installation() {
  const directory = await mkdtemp(path.join(tmpdir(), "desktop-loginom-resources-"))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  const resources = path.join(directory, "resources", "loginom")
  const staged = { [node]: "node", "browsers/chrome": "chrome", "skills/loginom-automation/SKILL.md": "skill" }

  for (const [file, text] of Object.entries(staged)) {
    await mkdir(path.dirname(path.join(resources, file)), { recursive: true })
    await writeFile(path.join(resources, file), text)
  }

  await writeFile(
    path.join(resources, "resource-manifest.json"),
    JSON.stringify({
      protocol: 1,
      nodeVersion: release.nodeVersion,
      node,
      browser: "browsers/chrome",
      files: await resourceInventory(resources),
    }),
  )
  await mkdir(path.join(resources, "host"))
  await writeFile(path.join(resources, "host", "node-host.mjs"), "host")

  return { packaged: true, resources, root: path.join(directory, "userData", "loginom"), version: "1.2.3" }
}

describe("LoginomResources", () => {
  test.each([
    { name: "complete resources", remove: [], append: [], error: undefined },
    { name: "a staged file missing", remove: ["browsers/chrome"], append: [], error: "ENOENT" },
    { name: "Node missing", remove: [node], append: [], error: "LOGINOM_BUNDLE_INCOMPLETE" },
    { name: "the Host entry missing", remove: ["host/node-host.mjs"], append: [], error: "LOGINOM_BUNDLE_INCOMPLETE" },
    {
      name: "a product skill changed",
      remove: [],
      append: ["skills/loginom-automation/SKILL.md"],
      error: "LOGINOM_RESOURCE_HASH_MISMATCH",
    },
  ])("--verify-resources with $name", async (input) => {
    const target = await installation()
    await Promise.all(input.remove.map((file) => rm(path.join(target.resources, file))))
    await Promise.all(input.append.map((file) => appendFile(path.join(target.resources, file), " ")))

    if (!input.error) return expect(LoginomResources.verify(target)).resolves.toBeUndefined()

    await expect(LoginomResources.verify(target)).rejects.toThrow(input.error)
  })

  test.each([
    {
      name: "a packaged app with complete resources",
      packaged: true,
      remove: [],
      expected: (resources: string) => ({ LOGINOM_AI_AGENT_RESOURCES: resources }),
    },
    { name: "a run from source", packaged: false, remove: ["host/node-host.mjs"], expected: () => undefined },
  ])("the service environment of $name", async (input) => {
    const target = await installation()
    await Promise.all(input.remove.map((file) => rm(path.join(target.resources, file))))

    expect(await LoginomResources.serviceEnvironment({ ...target, packaged: input.packaged })).toEqual(
      input.expected(target.resources),
    )
  })

  test.each([
    { name: "the Host entry", remove: ["host/node-host.mjs"], missing: "host/node-host.mjs" },
    { name: "Node", remove: [node], missing: node },
    { name: "the manifest", remove: ["resource-manifest.json"], missing: "resource-manifest.json" },
    { name: "any resources", remove: ["."], missing: `resource-manifest.json, ${node}, host/node-host.mjs` },
  ])("a packaged app without $name does not start its service", async (input) => {
    const target = await installation()
    await Promise.all(input.remove.map((file) => rm(path.join(target.resources, file), { recursive: true })))

    await expect(LoginomResources.serviceEnvironment(target)).rejects.toThrow(
      `LOGINOM_BUNDLE_INCOMPLETE: ${target.resources} lacks ${input.missing}; reinstall the application`,
    )
  })
})
