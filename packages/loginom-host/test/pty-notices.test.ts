import { afterEach, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { gzip, ustar } from "../script/bun-notices"
import { stageCrateNotices } from "../script/stage-resources"

// The CLI embeds loginom-ai-agent-pty, built from packages/process-daemon, in the CLI artifact and in Desktop (B2.7a9,
// B4.7c). Its notices are staged with the other resource notices: its own license and those of every locked crate.
const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
})

const service = resolve(import.meta.dir, "../../process-daemon")
const lock = Bun.TOML.parse(await Bun.file(join(service, "Cargo.lock")).text()) as {
  package: { name: string; version: string; source?: string }[]
}
const registry = join(process.env.CARGO_HOME ?? join(homedir(), ".cargo"), "registry/cache")
const caches = (await readdir(registry).catch(() => [])).map((index) => join(registry, index))
const crates = lock.package.filter((pkg) => pkg.source !== undefined)
const cached = (
  await Promise.all(
    crates.map(async (pkg) => {
      const found = await Promise.all(
        caches.map((cache) => Bun.file(join(cache, `${pkg.name}-${pkg.version}.crate`)).exists()),
      )
      return found.includes(true)
    }),
  )
).every(Boolean)

// Reads the crate archives that building the service left in Cargo's download cache, without downloading or writing.
test.skipIf(!cached)(
  "the notices name the service and every crate of its Cargo.lock, with their license texts",
  async () => {
    const output = join(await temporary(), "notices")
    const inventory = await stageCrateNotices({
      output,
      caches,
      download: async (url) => {
        throw new Error(`unexpected download ${url}`)
      },
    })
    expect(inventory.packages.map((pkg) => `${pkg.name}@${pkg.version}`)).toEqual(
      lock.package.map((pkg) => `${pkg.name}@${pkg.version}`),
    )
    const own = inventory.packages.find((pkg) => pkg.name === "loginom-ai-agent-pty")!
    expect(own.license).toBe("MIT")
    expect(own.files.map((file) => file.path.split("/").slice(1).join("/"))).toEqual(["LICENSE"])
    expect(await readFile(join(output, own.files[0]!.path))).toEqual(await readFile(join(service, "LICENSE")))
    // The direct dependencies of Cargo.toml, of every platform.
    for (const name of [
      "anyhow",
      "base64",
      "crossbeam-channel",
      "fs2",
      "portable-pty",
      "rand",
      "serde",
      "serde_json",
      "shell-words",
      "libc",
      "nix",
      "sha2",
      "windows-sys",
    ]) {
      const pkg = inventory.packages.find((item) => item.name === name)
      expect({ name, licensed: pkg?.files.some((file) => file.scope === "package") }).toEqual({ name, licensed: true })
    }
    for (const pkg of inventory.packages)
      for (const file of [...pkg.files, ...pkg.documentation])
        expect(
          createHash("sha256")
            .update(await readFile(join(output, file.path)))
            .digest("hex"),
        ).toBe(file.sha256)
    expect(await Bun.file(join(output, "inventory.json")).json()).toEqual(inventory)
  },
)

test("crate archives must match the lock, cached or downloaded; a crate without license text is missing", async () => {
  const root = await temporary()
  await Bun.write(
    join(root, "service/Cargo.toml"),
    '[package]\nname = "own-service"\nversion = "0.1.0"\nlicense = "MIT"\n',
  )
  await Bun.write(join(root, "service/LICENSE"), "Own service license\n")
  await Bun.write(join(root, "service/README.md"), "# Own service\n")
  // Build output under the service directory is not read.
  await Bun.write(join(root, "service/target/release/build/LICENSE"), "Build output\n")
  const licensed = crate("licensed", "1.0.0", {
    "Cargo.toml": '[package]\nname = "licensed"\nversion = "1.0.0"\nlicense = "MIT OR Apache-2.0"\n',
    "LICENSE-MIT": "Licensed MIT text\n",
    "LICENSE-APACHE": "Licensed Apache text\n",
    "README.md": "# Licensed\n",
    "src/lib.rs": "pub fn value() {}\n",
    "src/license.rs": "pub fn license() {}\n",
    "vendor/COPYING": "Vendored attribution\n",
  })
  const unlicensed = crate("unlicensed", "2.0.0", {
    "Cargo.toml": '[package]\nname = "unlicensed"\nversion = "2.0.0"\nlicense = "MIT"\n',
    "README.md": "# Unlicensed\n",
  })
  await Bun.write(join(root, "cache/licensed-1.0.0.crate"), licensed)
  const lockfile = (checksum: string) =>
    [
      "version = 4",
      ...[
        { name: "licensed", version: "1.0.0", checksum },
        { name: "own-service", version: "0.1.0" },
        { name: "unlicensed", version: "2.0.0", checksum: sha256(unlicensed) },
      ].map((pkg) =>
        [
          "",
          "[[package]]",
          `name = "${pkg.name}"`,
          `version = "${pkg.version}"`,
          ...(pkg.checksum
            ? ['source = "registry+https://github.com/rust-lang/crates.io-index"', `checksum = "${pkg.checksum}"`]
            : []),
        ].join("\n"),
      ),
    ].join("\n") + "\n"
  await Bun.write(join(root, "service/Cargo.lock"), lockfile(sha256(licensed)))
  const downloads: string[] = []
  const download = async (url: string) => {
    downloads.push(url)
    return unlicensed
  }
  const output = join(root, "notices")
  const inventory = await stageCrateNotices({
    output,
    lock: join(root, "service/Cargo.lock"),
    caches: [join(root, "empty"), join(root, "cache")],
    download,
  })
  expect(downloads).toEqual(["https://static.crates.io/crates/unlicensed/unlicensed-2.0.0.crate"])
  const summary = inventory.packages.map((pkg) => ({
    name: pkg.name,
    license: pkg.license,
    files: pkg.files.map((file) => `${file.scope}:${file.path}`),
    documentation: pkg.documentation.map((file) => file.path),
  }))
  expect(summary).toEqual([
    {
      name: "licensed",
      license: "MIT OR Apache-2.0",
      files: ["package:0001/LICENSE-APACHE", "package:0001/LICENSE-MIT", "nested:0001/vendor/COPYING"],
      documentation: ["0001/README.md"],
    },
    { name: "own-service", license: "MIT", files: ["package:0002/LICENSE"], documentation: ["0002/README.md"] },
    { name: "unlicensed", license: "MIT", files: [], documentation: ["0003/README.md"] },
  ])
  expect(inventory.missing).toEqual(["unlicensed@2.0.0"])
  expect(await Bun.file(join(output, "0001/vendor/COPYING")).text()).toBe("Vendored attribution\n")
  expect(await Bun.file(join(output, "0002/LICENSE")).text()).toBe("Own service license\n")
  expect(inventory.status).toBe("incomplete")
  expect(inventory.exclusions.join("\n")).toContain("Ghostty")

  // An archive that does not match the lock is refused, cached or downloaded.
  await Bun.write(join(root, "service/Cargo.lock"), lockfile(sha256(unlicensed)))
  await expect(
    stageCrateNotices({
      output: join(root, "refused"),
      lock: join(root, "service/Cargo.lock"),
      caches: [join(root, "cache")],
      download,
    }),
  ).rejects.toThrow("LOGINOM_CRATE_HASH_MISMATCH: licensed-1.0.0.crate")
  await expect(
    stageCrateNotices({
      output: join(root, "refused"),
      lock: join(root, "service/Cargo.lock"),
      caches: [],
      download: async () => licensed,
    }),
  ).rejects.toThrow("LOGINOM_CRATE_HASH_MISMATCH: licensed-1.0.0.crate")
  expect(await Bun.file(join(root, "refused/inventory.json")).exists()).toBe(false)
})

function crate(name: string, version: string, files: Record<string, string>) {
  return gzip(
    ustar(
      Object.entries(files).map(([path, text]) => ({
        path: `${name}-${version}/${path}`,
        type: "file" as const,
        data: new TextEncoder().encode(text),
      })),
    ),
  )
}

function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex")
}

async function temporary() {
  const root = await mkdtemp(join(tmpdir(), "loginom-pty-notices-"))
  roots.push(root)
  return root
}
