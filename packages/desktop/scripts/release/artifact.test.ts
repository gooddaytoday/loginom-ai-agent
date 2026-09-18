import { expect, test } from "bun:test"
import { chmod, mkdir, mkdtemp, rm, symlink, unlink, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { decodeManifest, hash, relativePath, verifyResourceTree, verifyWindowsApplication } from "./manifest"

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
    await symlink(
      process.platform === "win32" ? tmpdir() : "/etc/hosts",
      join(directory, "chrome"),
      process.platform === "win32" ? "junction" : "file",
    )
    await expect(verifyResourceTree(directory, hash(manifest))).rejects.toThrow("RELEASE_RESOURCE_ESCAPE")
    await unlink(join(directory, "chrome"))
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

test("validates win32-x64 PE resources and unpacked application payload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-windows-static-test-"))
  const executable = pe()
  const paths = {
    node: "bin/node.exe",
    browser: "browsers/chromium-1243/chrome-win64/chrome.exe",
  }
  const resource = {
    protocol: 1,
    target: "win32-x64",
    ...paths,
    files: Object.values(paths).map((path) => ({ path, sha256: hash(executable) })),
  }
  const manifest = JSON.stringify(resource)
  try {
    for (const path of Object.values(paths)) {
      await mkdir(join(directory, "resources/loginom", path, ".."), { recursive: true })
      await writeFile(join(directory, "resources/loginom", path), executable)
    }
    await writeFile(join(directory, "resources/loginom/resource-manifest.json"), manifest)
    await mkdir(join(directory, "resources/icons"), { recursive: true })
    await writeFile(join(directory, "loginom-ai-agent.exe"), executable)
    await writeFile(join(directory, "resources/app.asar"), "asar")
    await writeFile(join(directory, "resources/icons/icon.ico"), "icon")
    await writeFile(join(directory, "LICENSE.electron.txt"), "electron")
    await writeFile(join(directory, "LICENSES.chromium.html"), "chromium")

    expect((await verifyWindowsApplication(directory, "loginom-ai-agent", hash(manifest))).target).toBe("win32-x64")
    executable.writeUInt16LE(0x014c, executable.readUInt32LE(0x3c) + 4)
    await writeFile(join(directory, "resources/loginom", paths.browser), executable)
    resource.files[1].sha256 = hash(executable)
    const foreign = JSON.stringify(resource)
    await writeFile(join(directory, "resources/loginom/resource-manifest.json"), foreign)
    await expect(verifyWindowsApplication(directory, "loginom-ai-agent", hash(foreign))).rejects.toThrow(
      "RELEASE_EXECUTABLE_INVALID",
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("decodes Linux and Windows manifests without mixing installation or artifact contracts", () => {
  expect(decodeManifest(releaseManifest("linux")).installation.scope).toBe("machine")
  expect(decodeManifest(releaseManifest("win32")).installation.scope).toBe("user")
  expect(() =>
    decodeManifest({
      ...releaseManifest("win32"),
      installation: { ...releaseManifest("win32").installation, scope: "machine" },
    }),
  ).toThrow("RELEASE_MANIFEST_INVALID")
  expect(() =>
    decodeManifest({
      ...releaseManifest("win32"),
      artifacts: [{ file: "agent.deb", kind: "deb", bytes: 1, sha256: "0".repeat(64) }],
    }),
  ).toThrow("RELEASE_MANIFEST_INVALID")
})

function pe() {
  const executable = Buffer.alloc(256)
  executable.write("MZ")
  executable.writeUInt32LE(128, 0x3c)
  executable.write("PE\0\0", 128, "binary")
  executable.writeUInt16LE(0x8664, 132)
  return executable
}

function releaseManifest(platform: "linux" | "win32") {
  const windows = platform === "win32"
  return {
    schemaVersion: 1,
    version: "1.0.0",
    channel: "prod",
    builtAt: "2026-09-18T00:00:00.000Z",
    source: {
      commit: "0".repeat(40),
      dirty: false,
      patchSha256: null,
      inputsManifestSha256: "1".repeat(64),
      importSha256: "2".repeat(64),
    },
    target: { platform, arch: "x64", minimumOS: windows ? "Windows 11 x64" : "Ubuntu 22.04", backend: "v1" },
    build: { os: platform, arch: "x64", bun: "1.3.14", lockSha256: "3".repeat(64) },
    runtime: {
      electron: "42.3.3",
      electronNode: "24.0.0",
      node: "24.19.0",
      playwright: "1.0.0",
      playwrightMcp: "1.0.0",
      chromiumVersion: "1",
      chromiumRevision: "1243",
      catalogSha256: "4".repeat(64),
      resourcesSha256: "5".repeat(64),
    },
    product: {
      name: "Loginom AI Agent",
      appId: "com.loginom.aiagent",
      executable: "loginom-ai-agent",
      uriScheme: "loginom-ai-agent",
    },
    paths: {
      executor: "resources/loginom/runtime/src/managed-entry.mjs",
      node: windows ? "resources/loginom/bin/node.exe" : "resources/loginom/bin/node",
      chromium: windows
        ? "resources/loginom/browsers/chromium-1243/chrome-win64/chrome.exe"
        : "resources/loginom/browsers/chromium-1243/chrome-linux64/chrome",
      config: "profile",
      data: "profile",
      cache: "profile/cache",
      state: "profile",
      logs: "profile/logs",
      profiles: "profile/loginom/runtime",
      secretStore: windows ? "electron-safeStorage-dpapi-current-user" : "plaintext-private-0600",
    },
    connection: { schemaVersion: 1, generationProtocol: 1, knowledgeEndpoint: "https://example.test" },
    updater: { feed: null, channel: "prod", previousVersion: null },
    signing: { status: "unsigned", identity: null, notarized: false },
    installation: {
      scope: windows ? "user" : "machine",
      uninstallPolicy: "Retains user data.",
      preservesUserData: true,
    },
    validation: { commands: [], reportFiles: [] },
    provenance: { licensesSha256: "6".repeat(64), migrationManifestSha256: "7".repeat(64) },
    artifacts: [
      {
        file: windows ? "loginom-ai-agent-win-x64.exe" : "loginom-ai-agent-linux-x64.AppImage",
        kind: windows ? "nsis" : "appimage",
        bytes: 1,
        sha256: "8".repeat(64),
      },
    ],
  }
}
