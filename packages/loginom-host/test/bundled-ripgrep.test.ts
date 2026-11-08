import { expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join, resolve } from "node:path"
import { ripgrepArchiveName, ripgrepPinForTarget, ripgrepPins, stageRipgrep } from "../script/ripgrep-resource"
import { ripgrepDirectory, withBundledRipgrep } from "../src/bundled-ripgrep"

const posixTest = test.skipIf(process.platform !== "linux" && process.platform !== "darwin")
const coreBinary = resolve(import.meta.dir, "../../core/src/ripgrep/binary.ts")

test("ripgrep pins match the release the agent would otherwise download, for every release target", async () => {
  const source = await readFile(coreBinary, "utf8")
  expect(source).toContain(`const VERSION = "${ripgrepPins.version}"`)
  for (const [target, key] of [
    ["linux-x64", "x64-linux"],
    ["darwin-arm64", "arm64-darwin"],
    ["win32-x64", "x64-win32"],
  ] as const) {
    const pin = ripgrepPinForTarget(target)
    expect(source).toContain(`"${key}": { platform: "${pin.platform}", extension: "${pin.extension}" }`)
    expect(pin.sha256).toMatch(/^[0-9a-f]{64}$/)
  }
  expect(() => ripgrepPinForTarget("darwin-x64")).toThrow("LOGINOM_NATIVE_RESOURCES_UNAVAILABLE")
})

async function fakeRelease(root: string, version = "15.1.0", platform = "x86_64-unknown-linux-musl") {
  const name = `ripgrep-${version}-${platform}`
  const tree = join(root, "tree")
  await mkdir(join(tree, name), { recursive: true })
  await writeFile(join(tree, name, "rg"), "#!/bin/sh\necho fake-rg\n")
  for (const file of ["LICENSE-MIT", "UNLICENSE", "COPYING"]) await writeFile(join(tree, name, file), `${file} text\n`)
  const cache = join(root, "cache")
  await mkdir(cache)
  const pin = { version, platform, extension: "tar.gz" as const, sha256: "" }
  const archive = join(cache, ripgrepArchiveName(pin))
  expect(Bun.spawnSync(["tar", "-czf", archive, "-C", tree, name]).exitCode).toBe(0)
  pin.sha256 = createHash("sha256").update(await readFile(archive)).digest("hex")
  return { pin, cache, archive }
}

posixTest("staging places the verified rg and its licenses in resources without downloading", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-rg-stage-"))
  try {
    const { pin, cache } = await fakeRelease(root)
    const resources = join(root, "resources")
    const staged = await stageRipgrep({
      resources,
      pin,
      cache,
      download: () => Promise.reject(new Error("unexpected download")),
    })
    expect(staged).toBe(join(resources, ripgrepDirectory, "rg"))
    expect((await stat(staged)).mode & 0o777).toBe(0o755)
    expect(await readdir(join(resources, ripgrepDirectory))).toEqual(["rg"])
    expect((await readdir(join(resources, "licenses/ripgrep"))).toSorted()).toEqual(["COPYING", "LICENSE-MIT", "UNLICENSE"])
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

posixTest("staging fails the build when the archive does not match the pinned SHA256", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-rg-hash-"))
  try {
    const { pin, cache } = await fakeRelease(root)
    const resources = join(root, "resources")
    const wrong = { ...pin, sha256: "0".repeat(64) }
    await expect(stageRipgrep({ resources, pin: wrong, cache })).rejects.toThrow("LOGINOM_RIPGREP_HASH_MISMATCH")
    // A downloaded archive is checked before it is cached.
    const empty = join(root, "empty-cache")
    await expect(
      stageRipgrep({ resources, pin: wrong, cache: empty, download: async () => new Uint8Array([1, 2, 3]) }),
    ).rejects.toThrow("LOGINOM_RIPGREP_HASH_MISMATCH")
    expect(await stat(empty).then(() => true, () => false)).toBe(false)
    expect(await stat(resources).then(() => true, () => false)).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

posixTest("a downloaded archive is cached only after verification and then reused", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-rg-download-"))
  try {
    const { pin, archive } = await fakeRelease(root)
    const bytes = await readFile(archive)
    const cache = join(root, "fresh-cache")
    const urls: string[] = []
    const download = async (url: string) => {
      urls.push(url)
      return new Uint8Array(bytes)
    }
    await stageRipgrep({ resources: join(root, "a"), pin, cache, download })
    await stageRipgrep({ resources: join(root, "b"), pin, cache, download })
    expect(urls).toEqual([
      "https://github.com/BurntSushi/ripgrep/releases/download/15.1.0/ripgrep-15.1.0-x86_64-unknown-linux-musl.tar.gz",
    ])
    expect(await readFile(join(cache, ripgrepArchiveName(pin)))).toEqual(bytes)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("bundled ripgrep is appended to PATH once and never shadows a system rg", () => {
  const resources = resolve("/app/resources/loginom")
  const bundled = join(resources, ripgrepDirectory)
  expect(withBundledRipgrep({ PATH: ["/usr/bin", "/bin"].join(delimiter) }, resources).PATH).toBe(
    ["/usr/bin", "/bin", bundled].join(delimiter),
  )
  expect(withBundledRipgrep({ PATH: bundled }, resources).PATH).toBe(bundled)
  expect(withBundledRipgrep({}, resources).PATH).toBe(bundled)
  // Windows environments copied into plain objects keep the original key casing.
  const windows = withBundledRipgrep({ Path: "C:\\Windows" }, resources)
  expect(windows).toEqual({ Path: ["C:\\Windows", bundled].join(delimiter) })
})

// The agent's glob resolves rg through packages/core. With the bundled directory
// on PATH it must neither need a system rg nor reach github.com.
const systemRipgrep = Bun.which("rg")
posixTest.skipIf(!systemRipgrep)(
  "glob uses the bundled rg without a system rg and without network access",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "loginom-rg-glob-"))
    try {
      const resources = join(root, "resources")
      await mkdir(join(resources, ripgrepDirectory), { recursive: true })
      await copyFile(systemRipgrep!, join(resources, ripgrepDirectory, "rg"))
      await chmod(join(resources, ripgrepDirectory, "rg"), 0o755)
      const workspace = join(root, "workspace")
      await mkdir(join(workspace, "src"), { recursive: true })
      await writeFile(join(workspace, "src/table.csv"), "a,b\n")
      const emptyBin = join(root, "empty-bin")
      await mkdir(emptyBin)
      const script = join(root, "glob.ts")
      await writeFile(
        script,
        [
          `import { Effect } from ${JSON.stringify(Bun.resolveSync("effect", resolve(import.meta.dir, "../../core/src")))}`,
          `import { LayerNode } from ${JSON.stringify(resolve(import.meta.dir, "../../core/src/effect/layer-node.ts"))}`,
          `import { Ripgrep } from ${JSON.stringify(resolve(import.meta.dir, "../../core/src/ripgrep.ts"))}`,
          `const files = await Effect.runPromise(Effect.gen(function* () {`,
          `  return yield* (yield* Ripgrep.Service).glob({ cwd: ${JSON.stringify(workspace)}, pattern: "**/*", limit: 10 })`,
          `}).pipe(Effect.provide(LayerNode.compile(Ripgrep.node))))`,
          `console.log(JSON.stringify(files.map((file) => file.path)))`,
        ].join("\n"),
      )
      const closed = "http://127.0.0.1:9"
      const env = withBundledRipgrep(
        {
          PATH: emptyBin,
          HOME: join(root, "home"),
          XDG_CACHE_HOME: join(root, "xdg/cache"),
          XDG_DATA_HOME: join(root, "xdg/data"),
          XDG_CONFIG_HOME: join(root, "xdg/config"),
          XDG_STATE_HOME: join(root, "xdg/state"),
          HTTPS_PROXY: closed,
          HTTP_PROXY: closed,
          https_proxy: closed,
          http_proxy: closed,
          NO_PROXY: "",
        },
        resources,
      )
      const child = Bun.spawn([process.execPath, script], {
        cwd: resolve(import.meta.dir, ".."),
        env,
        stdout: "pipe",
        stderr: "pipe",
      })
      const [stdout, stderr, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ])
      expect({ code, stderr: code === 0 ? "" : stderr }).toEqual({ code: 0, stderr: "" })
      expect(JSON.parse(stdout.trim().split("\n").at(-1)!)).toEqual(["src/table.csv"])
      // No runtime download: core's cache bin directory is never created.
      const downloaded = Bun.spawnSync(["find", join(root, "xdg"), "-name", "rg*"]).stdout.toString()
      expect(downloaded).toBe("")
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
  60_000,
)
