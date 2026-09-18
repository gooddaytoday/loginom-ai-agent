import { expect, test } from "bun:test"
import { $ } from "bun"
import { verifyMacBrowserSignature } from "./verify-macos"
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { decodeManifest, hash, relativePath, verifyResourceTree } from "./manifest"

test("static extraction validation detects missing, altered, escaped and foreign architecture resources", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-static-test-"))
  const executable = Buffer.alloc(64)
  executable.write("\x7fELF")
  executable[4] = 2
  executable.writeUInt16LE(62, 18)
  const resource = {
    protocol: 1,
    target: "linux-x64",
    node: "node",
    browser: "chrome",
    files: ["node", "chrome"].map((path) => ({ path, sha256: hash(executable) })),
  }
  const manifest = JSON.stringify(resource)
  try {
    await writeFile(join(directory, "resource-manifest.json"), manifest)
    for (const file of ["node", "chrome"]) {
      await writeFile(join(directory, file), executable)
      await chmod(join(directory, file), 0o755)
    }
    expect((await verifyResourceTree(directory, hash(manifest))).files).toBe(2)
    await expect(verifyResourceTree(directory, "0".repeat(64))).rejects.toThrow("RELEASE_RESOURCES_MANIFEST_MISMATCH")
    await writeFile(join(directory, "chrome"), "modified")
    await expect(verifyResourceTree(directory, hash(manifest))).rejects.toThrow("RELEASE_RESOURCE_HASH_MISMATCH")
    await rm(join(directory, "chrome"))
    await expect(verifyResourceTree(directory, hash(manifest))).rejects.toThrow()
    await symlink("/etc/hosts", join(directory, "chrome"))
    await expect(verifyResourceTree(directory, hash(manifest))).rejects.toThrow("RELEASE_RESOURCE_ESCAPE")
    await rm(join(directory, "chrome"))
    executable.writeUInt16LE(183, 18)
    await writeFile(join(directory, "chrome"), executable, { mode: 0o755 })
    resource.files[1].sha256 = hash(executable)
    const foreign = JSON.stringify(resource)
    await writeFile(join(directory, "resource-manifest.json"), foreign)
    await expect(verifyResourceTree(directory, hash(foreign))).rejects.toThrow("RELEASE_EXECUTABLE_INVALID")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("release paths and unsupported targets cannot enter the static verifier", () => {
  for (const path of ["../escape", "/absolute", "a/../b", "a\\b", "a//b", ""])
    expect(() => relativePath(path)).toThrow()
  expect(relativePath("resources/loginom/bin/node")).toBe("resources/loginom/bin/node")
  expect(() => decodeManifest({ schemaVersion: 1, target: { platform: "linux", arch: "arm64" } })).toThrow()
})

test("macOS resources preserve framework links and reject foreign architecture and lost executable bits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-mac-static-test-"))
  const executable = Buffer.alloc(64)
  executable.writeUInt32LE(0xfeedfacf)
  executable.writeUInt32LE(0x0100000c, 4)
  try {
    await mkdir(join(directory, "Framework/Versions/A"), { recursive: true })
    await writeFile(join(directory, "Framework/Versions/A/chrome"), executable, { mode: 0o755 })
    await writeFile(join(directory, "node"), executable, { mode: 0o755 })
    await symlink("A", join(directory, "Framework/Versions/Current"))
    const resource = {
      protocol: 1,
      target: "darwin-arm64",
      node: "node",
      browser: "Framework/Versions/A/chrome",
      files: [
        { path: "node", sha256: hash(executable) },
        { path: "Framework/Versions/A/chrome", sha256: hash(executable) },
        { path: "Framework/Versions/Current", link: "A", directory: true, sha256: hash("A") },
      ],
    }
    const manifest = JSON.stringify(resource)
    await writeFile(join(directory, "resource-manifest.json"), manifest)
    expect((await verifyResourceTree(directory, hash(manifest), "darwin-arm64")).files).toBe(3)
    await chmod(join(directory, "node"), 0o644)
    await expect(verifyResourceTree(directory, hash(manifest), "darwin-arm64")).rejects.toThrow(
      "RELEASE_EXECUTABLE_INVALID",
    )
    await chmod(join(directory, "node"), 0o755)
    executable.writeUInt32LE(0x01000007, 4)
    await writeFile(join(directory, "node"), executable)
    resource.files[0].sha256 = hash(executable)
    const foreign = JSON.stringify(resource)
    await writeFile(join(directory, "resource-manifest.json"), foreign)
    await expect(verifyResourceTree(directory, hash(foreign), "darwin-arm64")).rejects.toThrow(
      "RELEASE_EXECUTABLE_INVALID",
    )
    await symlink("/tmp", join(directory, "escape"))
    await expect(verifyResourceTree(directory, hash(foreign), "darwin-arm64")).rejects.toThrow(
      "RELEASE_RESOURCE_ESCAPE",
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("schema version 1 reads the released Linux manifest and accepts the macOS extension", async () => {
  const linux = await Bun.file(
    new URL(
      "../../../../docs/testing/loginom-ai-agent/reports/2026-09-17-proxy/release-manifest.json",
      import.meta.url,
    ),
  ).json()
  expect(decodeManifest(linux).target).toMatchObject({ platform: "linux", arch: "x64" })
  const mac = {
    ...linux,
    target: { platform: "darwin", arch: "arm64", minimumOS: "14.0", backend: "v1" },
    signing: { status: "ad-hoc", identity: "-", notarized: false },
    artifacts: linux.artifacts.map((file: { kind: string; file: string }) => ({
      ...file,
      kind: file.kind === "deb" ? "dmg" : file.kind === "appimage" ? "zip" : file.kind,
      file: file.file.replace(/\.deb$/, ".dmg").replace(/\.AppImage$/, ".zip"),
    })),
  }
  expect(decodeManifest(mac).target.platform).toBe("darwin")
  expect(() => decodeManifest({ ...mac, signing: linux.signing })).toThrow("RELEASE_MAC_POLICY_INVALID")
  expect(() => decodeManifest({ ...mac, target: { ...mac.target, arch: "x64" } })).toThrow("RELEASE_TARGET_INVALID")
})

test.skipIf(process.platform !== "darwin")(
  "upstream linker-signed browser code is checked without a nonexistent resource seal",
  async () => {
    const directory = await mkdtemp(join(tmpdir(), "loginom-linker-signature-"))
    const bundle = join(directory, "Browser.app")
    const executable = join(bundle, "Contents/MacOS/Browser")
    try {
      await mkdir(join(bundle, "Contents/MacOS"), { recursive: true })
      await writeFile(join(directory, "main.c"), "int main(void) { return 0; }\n")
      await writeFile(
        join(bundle, "Contents/Info.plist"),
        `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleExecutable</key><string>Browser</string><key>CFBundleIdentifier</key><string>com.loginom.signature-fixture</string></dict></plist>`,
      )
      await $`clang -arch arm64 -mmacosx-version-min=14.0 ${join(directory, "main.c")} -o ${executable}`.quiet()
      expect(await verifyMacBrowserSignature(executable)).toBe("linker-signed-code-only; resource seal absent upstream")
      const original = await readFile(executable)
      const modified = Buffer.from(original)
      modified[1024] ^= 1
      await writeFile(executable, modified)
      await expect(verifyMacBrowserSignature(executable)).rejects.toThrow()
      await writeFile(executable, original)
      await $`codesign --force --sign - ${bundle}`.quiet()
      expect(await verifyMacBrowserSignature(executable)).toBe("bundle-and-code")
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
)
