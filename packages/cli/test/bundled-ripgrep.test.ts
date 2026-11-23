import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import net from "node:net"
import os from "node:os"
import path from "node:path"
import { writeCliManifest } from "@loginom-ai-agent/loginom-host/cli-manifest"
import { ripgrepPinForTarget, ripgrepPins, stageRipgrep } from "../../loginom-host/script/ripgrep-resource"
import { copyProductSkillsFixture } from "../../loginom-host/test/fixtures/product-skills"
import { resourceInventory } from "../../loginom-runtime/src/resource-inventory.mjs"
import { LOGINOM_AI_AGENT_VERSION } from "../src/version"
import { isolatedEnv } from "./fixture/environment"

// Loginom AI Agent (B2.7a10b): as in 0.4 (`standalone-run.ts`, Desktop `proxy-env.ts`), the server takes rg from the
// product resources and never downloads it (LAB-1094). Each case starts `serve` without a system rg on PATH and with
// every proxy variable pointing to a stub that records connections, so a runtime download is seen, not made. The file
// search of the API goes through core's ripgrep only with fff off. The rg is the pinned release the build stages, from
// the build cache (`LOGINOM_AI_AGENT_RIPGREP_CACHE`). Linux only, as `cli-resources.test.ts`, where the product pins rg.
const cli = path.join(import.meta.dir, "..")
const target = `${process.platform}-${process.arch}`
const pinned = process.platform === "linux" && Object.hasOwn(ripgrepPins.archives, target)
const password = "bundled-ripgrep-test"
const roots: string[] = []
const staged = { resources: "", artifact: "", executable: "" }

afterAll(async () => {
  await Promise.all(roots.map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe.skipIf(!pinned)("bundled ripgrep of the server", () => {
  beforeAll(async () => {
    const root = await temporary("cli-bundled-rg-")
    staged.resources = path.join(root, "resources")
    await stageRipgrep({ resources: staged.resources, pin: ripgrepPinForTarget(target) })
    Object.assign(staged, await artifact(staged.resources))
  }, 120_000)

  // Desktop's service and a run from source get the resources as `LOGINOM_AI_AGENT_RESOURCES`, without a CLI profile.
  test("a server given the resources finds files with their rg, offline and without downloading", async () => {
    const result = await find({ executable: process.execPath, entry: "src/index.ts", resources: staged.resources })
    expect(result).toEqual({ status: 200, files: ["src/table.csv"], requests: [], downloaded: [] })
  }, 90_000)

  // A built product CLI takes the resources of its artifact, next to its binary.
  test("a built product CLI finds files with the rg of its artifact, offline and without downloading", async () => {
    const result = await find({ executable: staged.executable, entry: "src/loginom-cli.ts" })
    expect(result).toEqual({ status: 200, files: ["src/table.csv"], requests: [], downloaded: [] })
  }, 90_000)

  // The stub sees a download: without resources the server behaves as OpenCode and fails offline.
  test("without resources the server tries to download rg and the search fails", async () => {
    const result = await find({ executable: process.execPath, entry: "src/index.ts" })
    expect(result.status).not.toBe(200)
    expect(result.requests).toContain("CONNECT github.com:443 HTTP/1.1")
  }, 90_000)
})

// `serve --port 0` with a project holding `src/table.csv`, asked for `table` once it listens.
async function find(input: { executable: string; entry: string; resources?: string }) {
  const root = await temporary("cli-bundled-rg-serve-")
  const workspace = path.join(root, "workspace")
  await Bun.write(path.join(workspace, "src/table.csv"), "a,b\n")
  // An empty PATH hides any system rg; core then looks only in its cache, which starts empty.
  const bin = path.join(root, "empty-bin")
  await Promise.all([bin, path.join(root, "tmp")].map((directory) => fs.mkdir(directory)))
  expect(Bun.which("rg", { PATH: bin })).toBeNull()
  const requests: string[] = []
  const stub = net.createServer((socket) =>
    socket.once("data", (chunk) => {
      requests.push(chunk.toString("latin1").split("\r\n")[0]!)
      socket.destroy()
    }),
  )
  await new Promise<void>((resolve) => stub.listen(0, "127.0.0.1", resolve))
  const proxy = `http://127.0.0.1:${(stub.address() as net.AddressInfo).port}`
  // The CLI entry needs the preload from this package's bunfig.toml.
  const child = Bun.spawn([input.executable, path.join(cli, input.entry), "serve", "--port", "0"], {
    cwd: cli,
    env: isolatedEnv(root, {
      PATH: bin,
      TMPDIR: path.join(root, "tmp"),
      LOGINOM_AI_AGENT_CLI_PROFILE: path.join(root, "profile"),
      LOGINOM_AI_AGENT_CLI_ROOT: undefined,
      LOGINOM_AI_AGENT_DISABLE_FFF: "1",
      LOGINOM_AI_AGENT_PASSWORD: password,
      LOGINOM_AI_AGENT_RESOURCES: input.resources,
      HTTPS_PROXY: proxy,
      HTTP_PROXY: proxy,
      ALL_PROXY: proxy,
      https_proxy: proxy,
      http_proxy: proxy,
      all_proxy: proxy,
      NO_PROXY: "127.0.0.1,localhost",
      no_proxy: "127.0.0.1,localhost",
    }),
    stdout: "pipe",
    stderr: "pipe",
  })
  try {
    const url = await listening(child)
    const response = await fetch(
      new URL(`/api/fs/find?query=table&type=file&location[directory]=${encodeURIComponent(workspace)}`, url),
      { headers: { authorization: `Basic ${btoa(`loginom-ai-agent:${password}`)}` } },
    )
    const body = await response.text()
    const files = response.ok
      ? (JSON.parse(body) as { data: { path: string }[] }).data.map((entry) => entry.path)
      : body
    // A downloaded rg would land in core's cache under the isolated XDG directories.
    const downloaded = (await Array.fromAsync(new Bun.Glob("**/rg*").scan({ cwd: root, onlyFiles: true }))).filter(
      (file) => !file.startsWith("workspace/"),
    )
    return { status: response.status, files, requests, downloaded }
  } finally {
    child.kill("SIGTERM")
    await child.exited
    await new Promise((resolve) => stub.close(resolve))
  }
}

async function listening(child: Bun.Subprocess<"ignore", "pipe", "pipe">) {
  const stderr = new Response(child.stderr).text()
  const decoder = new TextDecoder()
  const output = { text: "" }
  for await (const chunk of child.stdout) {
    output.text += decoder.decode(chunk)
    const url = /server listening on (http:\/\/\S+)/.exec(output.text)?.[1]
    if (url) return url
  }
  throw new Error(`serve exited with ${await child.exited}: ${await stderr}`)
}

// The layout of `loginom-host/script/build-cli.ts` with the staged rg, as `cli-resources.test.ts` builds it: the real
// product skills, placeholder Node and Host entry, and Bun hard-linked as `bin/loginom-ai-agent-cli`, so
// `process.execPath` is the artifact's binary while the CLI runs from source.
async function artifact(ripgrep: string) {
  const root = await temporary("cli-bundled-rg-artifact-")
  const resources = path.join(root, "resources", "loginom")
  const executable = path.join(root, "bin", "loginom-ai-agent-cli")
  await fs.cp(ripgrep, resources, { recursive: true })
  await Promise.all(["bin/node", "host/node-host.mjs"].map((file) => Bun.write(path.join(resources, file), file)))
  await fs.mkdir(path.dirname(executable), { recursive: true })
  await fs.link(process.execPath, executable).catch(() => fs.copyFile(process.execPath, executable))
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
  return { artifact: root, executable }
}

async function temporary(prefix: string) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), prefix)))
  roots.push(root)
  return root
}
