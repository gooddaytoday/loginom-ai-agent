import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { Effect } from "effect"
import { writeCliManifest } from "@loginom-ai-agent/loginom-host/cli-manifest"
import { copyProductSkillsFixture } from "../../loginom-host/test/fixtures/product-skills"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { CliResources } from "../src/resources"
import { LOGINOM_AI_AGENT_VERSION } from "../src/version"

// Loginom AI Agent (B2.7a2, G5): the server of a built product CLI takes `LOGINOM_AI_AGENT_RESOURCES` from the artifact
// next to its binary only when every file matches `cli-manifest.json`, as 0.4 `standalone-bundle.ts` did. The fixture
// has the Linux layout of `loginom-host/script/build-cli.ts` with the real product skills; Node and the Host entry are
// placeholders, nothing is launched. Windows also checks PE headers and macOS the Keychain helper, so Linux only.
const roots: string[] = []
const complete = { root: "", resources: "", executable: "" }

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe.skipIf(process.platform !== "linux")("CLI resources", () => {
  beforeAll(async () => {
    Object.assign(complete, await artifact())
  }, 60_000)

  test("a complete artifact gives the server its resources", async () => {
    expect(await CliResources.locate(complete.executable)).toBe(complete.resources)
    const env: NodeJS.ProcessEnv = {}
    await Effect.runPromise(CliResources.apply(env, complete.executable))
    expect(env.LOGINOM_AI_AGENT_RESOURCES).toBe(complete.resources)
  })

  test("an explicit value is used as is", async () => {
    const env: NodeJS.ProcessEnv = { LOGINOM_AI_AGENT_RESOURCES: "/explicit/resources" }
    await Effect.runPromise(
      CliResources.apply(env, path.join(os.tmpdir(), "no-artifact", "bin", "loginom-ai-agent-cli")),
    )
    expect(env.LOGINOM_AI_AGENT_RESOURCES).toBe("/explicit/resources")
  })

  test.each([
    ["the Host entry is missing", (root: string) => fs.rm(path.join(root, "resources/loginom/host/node-host.mjs"))],
    [
      "a product skill changed",
      (root: string) => fs.appendFile(path.join(root, "resources/loginom/skills/loginom-automation/SKILL.md"), "\n"),
    ],
    ["a file was added", (root: string) => Bun.write(path.join(root, "resources/loginom/bin/extra"), "extra")],
    ["the manifest is missing", (root: string) => fs.rm(path.join(root, "cli-manifest.json"))],
  ])("an artifact where %s leaves the resources unset", async (_, damage) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-resources-damaged-"))
    roots.push(root)
    await fs.cp(complete.root, root, { recursive: true, verbatimSymlinks: true })
    await damage(root)
    const executable = path.join(root, "bin", "loginom-ai-agent-cli")
    await expect(CliResources.locate(executable)).rejects.toThrow("LOGINOM_BUNDLE_INCOMPLETE")
    const env: NodeJS.ProcessEnv = {}
    await Effect.runPromise(CliResources.apply(env, executable))
    expect(env.LOGINOM_AI_AGENT_RESOURCES).toBeUndefined()
  })

  test("a CLI run from source has no artifact", async () => {
    expect(await CliResources.locate(process.execPath)).toBeUndefined()
  })
})

async function artifact() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cli-resources-")))
  roots.push(root)
  const resources = path.join(root, "resources", "loginom")
  await Promise.all(
    ["bin/loginom-ai-agent-cli", "resources/loginom/bin/node", "resources/loginom/host/node-host.mjs"].map((file) =>
      Bun.write(path.join(root, file), file),
    ),
  )
  await copyProductSkillsFixture(resources)
  await Bun.write(
    path.join(resources, "resource-manifest.json"),
    JSON.stringify({ protocol: 1, files: await resourceInventory(resources) }),
  )
  await writeCliManifest(root, {
    version: LOGINOM_AI_AGENT_VERSION,
    channel: "dev",
    platform: process.platform,
    arch: process.arch,
    sourceCommit: "a".repeat(40),
    sourceTreeSha256: "b".repeat(64),
    sourceDirty: true,
    dependencies: {},
  })
  return { root, resources, executable: path.join(root, "bin", "loginom-ai-agent-cli") }
}
