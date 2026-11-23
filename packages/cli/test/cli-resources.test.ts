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
import { isolatedEnv } from "./fixture/environment"

// Loginom AI Agent (B2.7a2, B2.7a2b, G5): the server of a built product CLI takes `LOGINOM_AI_AGENT_RESOURCES` from the
// artifact next to its binary only when every file matches `cli-manifest.json`, and does not start otherwise, as 0.4
// `standalone-bundle.ts` did. The fixture has the Linux layout of `loginom-host/script/build-cli.ts` with the real
// product skills; Node and the Host entry are placeholders. Windows also checks PE headers and macOS the Keychain
// helper, so Linux only.
const cli = path.join(import.meta.dir, "..")
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

  test("an explicit value is used as is, even next to a complete artifact", async () => {
    const env: NodeJS.ProcessEnv = { LOGINOM_AI_AGENT_RESOURCES: "/explicit/resources" }
    await Effect.runPromise(CliResources.apply(env, complete.executable))
    expect(env.LOGINOM_AI_AGENT_RESOURCES).toBe("/explicit/resources")
  })

  test.each([
    [
      "the Host entry is missing",
      (root: string) => fs.rm(path.join(root, "resources/loginom/host/node-host.mjs")),
      "LOGINOM_MANIFEST_PAYLOAD_MISMATCH",
    ],
    [
      "a product skill changed",
      (root: string) => fs.appendFile(path.join(root, "resources/loginom/skills/loginom-automation/SKILL.md"), "\n"),
      "LOGINOM_MANIFEST_PAYLOAD_MISMATCH",
    ],
    [
      "a file was added",
      (root: string) => Bun.write(path.join(root, "resources/loginom/bin/extra"), "extra"),
      "LOGINOM_MANIFEST_PAYLOAD_MISMATCH",
    ],
    ["the manifest is missing", (root: string) => fs.rm(path.join(root, "cli-manifest.json")), "ENOENT"],
  ])("an artifact where %s is refused", async (_, damage, reason) => {
    const root = await copy()
    await damage(root)
    await expectRefused(root, reason)
  })

  // What the server needs must be there even when the manifests describe the artifact accurately: Node and the Host
  // entry (B2.3), the product skills (B2.4). Both manifests are written again without them.
  test.each([
    ["resources/loginom/bin/node", "LOGINOM_MANIFEST_INCOMPLETE"],
    ["resources/loginom/host/node-host.mjs", "LOGINOM_MANIFEST_INCOMPLETE"],
    ["resources/loginom/skills", "LOGINOM_PRODUCT_SKILLS_INCOMPLETE"],
  ])("an artifact staged without %s is refused", async (file, reason) => {
    const root = await copy()
    await fs.rm(path.join(root, file), { recursive: true })
    await manifests(root)
    await expectRefused(root, reason)
  })

  test("a CLI run from source has no artifact", async () => {
    expect(await CliResources.locate(process.execPath)).toBeUndefined()
    const env: NodeJS.ProcessEnv = {}
    await Effect.runPromise(CliResources.apply(env))
    expect(env.LOGINOM_AI_AGENT_RESOURCES).toBeUndefined()
  })
})

// The server itself: a CLI run from source starts without resources, and a built one starts only with its whole
// artifact. Bun hard-linked as `bin/loginom-ai-agent-cli` of the fixture stands in for the compiled binary:
// `process.execPath` is then the artifact's binary, while the CLI still runs from source.
describe.skipIf(process.platform !== "linux")("serve of the product CLI", () => {
  const built = { root: "", executable: "" }

  beforeAll(async () => {
    Object.assign(built, await artifact(process.execPath))
  }, 60_000)

  test("from source, serve starts without resources", async () => {
    const result = await serve(process.execPath)
    expect(result.url).toBeDefined()
  }, 60_000)

  test("built, serve starts with a complete artifact", async () => {
    const result = await serve(built.executable)
    expect(result.url).toBeDefined()
  }, 60_000)

  test("built, serve refuses an artifact with a changed product skill", async () => {
    const skill = path.join(built.root, "resources/loginom/skills/loginom-automation/SKILL.md")
    const original = await fs.readFile(skill)
    await fs.appendFile(skill, "\n")
    const result = await serve(built.executable).finally(() => fs.writeFile(skill, original))
    expect(result.url).toBeUndefined()
    expect(result.code).not.toBe(0)
    expect(result.stderr).toContain("LOGINOM_BUNDLE_INCOMPLETE")
    expect(result.stderr).toContain("LOGINOM_MANIFEST_PAYLOAD_MISMATCH")
  }, 60_000)
})

async function artifact(binary?: string) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cli-resources-")))
  roots.push(root)
  const resources = path.join(root, "resources", "loginom")
  const executable = path.join(root, "bin", "loginom-ai-agent-cli")
  await Promise.all(
    ["resources/loginom/bin/node", "resources/loginom/host/node-host.mjs"].map((file) =>
      Bun.write(path.join(root, file), file),
    ),
  )
  if (!binary) await Bun.write(executable, "fixture")
  // A hard link keeps `process.execPath` in the artifact; across file systems a copy does the same.
  if (binary) await fs.mkdir(path.dirname(executable), { recursive: true })
  if (binary) await fs.link(binary, executable).catch(() => fs.copyFile(binary, executable))
  await copyProductSkillsFixture(resources)
  await manifests(root)
  return { root, resources, executable }
}

// The resource inventory and the artifact manifest, as `build-cli.ts` writes them.
async function manifests(root: string) {
  const resources = path.join(root, "resources", "loginom")
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
}

async function copy() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "cli-resources-damaged-"))
  roots.push(root)
  await fs.cp(complete.root, root, { recursive: true, verbatimSymlinks: true })
  return root
}

async function expectRefused(root: string, reason: string) {
  const executable = path.join(root, "bin", "loginom-ai-agent-cli")
  await expect(CliResources.locate(executable)).rejects.toThrow("LOGINOM_BUNDLE_INCOMPLETE")
  const env: NodeJS.ProcessEnv = {}
  await expect(Effect.runPromise(CliResources.apply(env, executable))).rejects.toThrow(reason)
  expect(env.LOGINOM_AI_AGENT_RESOURCES).toBeUndefined()
}

// `serve --port 0` of the product CLI entry in a fresh profile: the URL once it listens, or its exit code and stderr.
async function serve(executable: string) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cli-resources-serve-")))
  roots.push(root)
  // The CLI entry needs the preload from this package's bunfig.toml.
  const child = Bun.spawn([executable, path.join(cli, "src/loginom-cli.ts"), "serve", "--port", "0"], {
    cwd: cli,
    env: isolatedEnv(root, {
      LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile"),
      LOGINOM_AI_AGENT_PASSWORD: "cli-resources-test",
      LOGINOM_AI_AGENT_RESOURCES: undefined,
    }),
    stdout: "pipe",
    stderr: "pipe",
  })
  const stderr = new Response(child.stderr).text()
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (!url) continue
    child.kill("SIGTERM")
    await child.exited
    return { url, code: undefined, stderr: await stderr }
  }
  return { url: undefined, code: await child.exited, stderr: await stderr }
}
