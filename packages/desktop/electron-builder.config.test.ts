import { expect, test } from "bun:test"
import { statSync } from "node:fs"
import { cp, mkdir, mkdtemp, readdir, rm, stat, writeFile } from "node:fs/promises"
import { createRequire } from "node:module"
import os from "node:os"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"
import { AppInfo, Arch, Packager, type Configuration } from "electron-builder"
import { Product } from "@loginom-ai-agent/product"
import { bundledLanguages, lcid } from "app-builder-lib/out/util/langs"
import release from "../product/loginom-release.json"
import { getConfig } from "./electron-builder.config"
import { copyIcons } from "./script/copy-icons"
import { CLI_BINARIES, nodePtyPackage } from "./script/utils"

const builderRequire = createRequire(import.meta.resolve("electron-builder"))

// Use electron-builder's matcher so the tests also cover its glob and directory traversal semantics.
const { FileMatcher } = builderRequire("app-builder-lib/out/fileMatcher")

const { getWindowsInstallationDirName } = builderRequire("app-builder-lib/out/targets/targetUtil")

// Names of Loginom AI Agent 0.4, by channel.
const channels = [
  { channel: "dev", appId: "com.loginom.aiagent.dev", name: "Loginom AI Agent Dev", slug: "loginom-ai-agent-dev" },
  { channel: "beta", appId: "com.loginom.aiagent.beta", name: "Loginom AI Agent Beta", slug: "loginom-ai-agent-beta" },
  { channel: "prod", appId: "com.loginom.aiagent", name: "Loginom AI Agent", slug: "loginom-ai-agent" },
] as const

// The bundled CLI keeps its upstream file name until the Desktop service and script/utils.ts rename it (B4.7).
const bundledCli = ["!resources/opencode-cli*", "opencode-cli", "opencode-cli.exe", "opencode-cli.version"]

function load(channel: string, target?: string, feed?: string): Configuration {
  const env = {
    LOGINOM_AI_AGENT_CHANNEL: channel,
    LOGINOM_AI_AGENT_TARGET: target,
    LOGINOM_AI_AGENT_UPDATE_FEED: feed,
  }

  const previous = Object.fromEntries(Object.keys(env).map((name) => [name, process.env[name]]))

  const apply = (values: Record<string, string | undefined>) =>
    Object.entries(values).forEach(([name, value]) => {
      delete process.env[name]

      if (value !== undefined) process.env[name] = value
    })

  apply(env)

  try {
    return getConfig()
  } finally {
    apply(previous)
  }
}

function trimFilter(dir: string, config: Configuration) {
  const patterns = Array.isArray(config.files) ? config.files.flatMap((value) => (value ? [String(value)] : [])) : []

  return new FileMatcher(dir, "", (value: string) => value, [
    "**/*",
    ...patterns.filter((value) => value.startsWith("!")),
  ]).createFilter()
}

test.each(channels)("channel identity for $channel", ({ channel, appId, name, slug }) => {
  const config = load(channel)
  expect(config.appId).toBe(appId)
  // electron-builder installs Linux packages into /opt/<productName>.
  expect(config.productName).toBe(process.platform === "linux" ? slug : name)
  expect(config.extraMetadata?.productName).toBe(name)
  expect(config.artifactName).toBe("loginom-ai-agent-${os}-${arch}.${ext}")
  expect(config.protocols).toEqual({ name: "Loginom AI Agent", schemes: ["loginom-ai-agent"] })
  expect(config.win?.executableName).toBe(slug)
  expect(config.nsis?.shortcutName).toBe(name)
  // Without a product feed at build time, app-update.yml points nowhere rather than at an upstream feed.
  expect(config.publish).toEqual({ provider: "generic", url: "https://updates.invalid/", channel: "latest" })
  expect(load(channel, undefined, " https://updates.example/feed/ ").publish).toEqual({
    provider: "generic",
    url: "https://updates.example/feed/",
    channel: "latest",
  })
  expect(config.extraMetadata?.desktopName).toBe(`${appId}.desktop`)
  // The executable must never end in `.desktop`: libappimage resolves the
  // AppImage's desktop entry by globbing `*.desktop`, and an ELF matching
  // that glob breaks integration (anomalyco/opencode#51867).
  expect(config.linux?.executableName).toBe(slug)
  expect(config.linux?.executableName).not.toMatch(/\.desktop$/)
  // The installed `.desktop` filename still derives from `desktopName` so
  // window association (StartupWMClass/desktop file basename) is unchanged.
  expect(config.linux?.syncDesktopName).toBe(true)
  expect(config.linux?.desktop?.entry?.StartupWMClass).toBe(appId)
  expect(config.linux?.desktop?.entry?.Name).toBe(name)
  expect(config.deb?.packageName).toBe(slug)
  expect(config.rpm?.packageName).toBe(slug)

  // The packages install the channel's metainfo and no other file of their own.
  for (const fpm of [config.deb?.fpm, config.rpm?.fpm]) {
    expect(fpm?.filter((entry) => entry.includes("=/"))).toEqual([
      expect.stringMatching(new RegExp(`/${appId}\\.metainfo\\.xml=/usr/share/metainfo/${appId}\\.metainfo\\.xml$`)),
    ])
  }

  // Shared Electron binaries must not ship /usr/lib/.build-id links that collide with other Electron RPMs.
  // fpm rejects flags after the first src=dest mapping, so the flag must come first.
  expect(config.rpm?.fpm?.[0]).toBe("--rpm-rpmbuild-define=_build_id_links none")
  expect(config.deb?.fpm).not.toContain("--rpm-rpmbuild-define=_build_id_links none")
})

test.each(channels)("the $channel packaging names nothing of OpenCode but the bundled CLI", ({ channel }) => {
  // Every key and string value that mentions it, without the absolute path of this package.
  const json = JSON.stringify(load(channel)).replaceAll(JSON.stringify(import.meta.dirname).slice(1, -1), "")
  const names = (json.match(/"(?:[^"\\]|\\.)*opencode(?:[^"\\]|\\.)*"/gi) ?? []).map((name) => JSON.parse(name))
  expect(names.toSorted()).toEqual(bundledCli.toSorted())
})

// The per-user install directory and the updater cache come from the package name, not from the config's
// own fields. They must stay those of the published 0.4 installers: the install moves out of the shared
// directory, and the uninstaller finds the cache.
test.each(channels)("the $channel installer keeps the 0.4 directory and updater cache names", async ({ channel }) => {
  const packager = new Packager({ projectDir: import.meta.dirname, config: load(channel) })

  await packager.validateConfig()
  const app = new AppInfo(packager, null)
  expect(getWindowsInstallationDirName(app, false)).toBe("@loginom-ai-agentdesktop")
  expect(app.updaterCacheDirName).toBe("@loginom-ai-agentdesktop-updater")
})

// Installers run only on Windows (script/windows-installer.test.ts), so here the include is read as text.
test("the installer verifies the installed app, and the uninstaller removes the scheme and updater cache", async () => {
  const include = (await Bun.file(String(load("prod").nsis?.include)).text()).replaceAll("\r\n", "\n")

  const macro = (name: string) =>
    include
      .match(new RegExp(`^!macro ${name}\\n([\\s\\S]*?)^!macroend$`, "m"))?.[1]
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith(";")) ?? []

  // The app checks its resources last, and a refusal stops the install before NSIS reports success.
  const install = macro("customInstall")
  const verify = install.indexOf(`ExecWait '"$INSTDIR\\\${APP_EXECUTABLE_FILENAME}" --verify-resources' $0`)
  expect(verify).toBeGreaterThan(install.indexOf("!insertmacro leaveSharedInstall"))
  expect(install.slice(verify)).toEqual(
    expect.arrayContaining(["${If} ${Errors}", "${If} $0 != 0", "SetErrorLevel 1", "Abort"]),
  )

  // An update runs the old uninstaller too, and its installer may run from the updater cache.
  const uninstall = macro("customUnInstall")
  expect(uninstall[0]).toBe("${IfNot} ${isUpdated}")
  expect(uninstall.at(-1)).toBe("${EndIf}")
  expect(uninstall).toEqual(
    expect.arrayContaining([
      "!insertmacro removeProtocolKey",
      '${StdUtils.GetParentPath} $R0 "$LOCALAPPDATA\\${APP_INSTALLER_STORE_FILE}"',
      "RMDir /r $R0",
    ]),
  )
  expect(macro("removeProtocolKey")).toEqual(
    expect.arrayContaining([
      `ReadRegStr $0 HKCU "Software\\Classes\\${Product.scheme}\\shell\\open\\command" ""`,
      `DeleteRegKey HKCU "Software\\Classes\\${Product.scheme}"`,
    ]),
  )

  // makensis -WX fails on a message that a bundled installer language lacks.
  for (const language of bundledLanguages) {
    const id = lcid[language]
    expect(
      include.includes(`!insertmacro VerifyResourcesEnglish ${id}\n`) ||
        ["VerifyResourcesStatus", "VerifyResourcesError"].every((key) => include.includes(`LangString ${key} ${id} `)),
      language,
    ).toBe(true)
  }
})

test.each(channels)("macOS bundle for $channel", ({ channel }) => {
  const config = load(channel)
  expect(config.mac?.icon).toBe("resources/icons/icon.icns")
  expect(config.dmg?.icon).toBeUndefined()
  // The prod override must keep the rest of the shared macOS settings.
  expect(config.mac?.target).toEqual([
    { target: "dmg", arch: ["arm64"] },
    { target: "zip", arch: ["arm64"] },
  ])

  for (const key of [
    "NSMicrophoneUsageDescription",
    "NSDocumentsFolderUsageDescription",
    "NSDesktopFolderUsageDescription",
    "NSDownloadsFolderUsageDescription",
    "NSNetworkVolumesUsageDescription",
    "NSRemovableVolumesUsageDescription",
  ])
    expect(config.mac?.extendInfo?.[key], key).toMatch(/\S/)
})

// Loginom AI Agent (B4.6): every icon the packaging names is in the set script/copy-icons.ts stages.
test.each(channels)("the $channel packaging icons are in the staged 0.4 icon set", async ({ channel }) => {
  const config = load(channel)
  const directory = await mkdtemp(path.join(os.tmpdir(), "loginom-icons-"))

  try {
    await cp(path.join(import.meta.dirname, "icons", channel), path.join(directory, "icons", channel), {
      recursive: true,
    })
    await copyIcons(channel, directory)

    for (const icon of [
      config.mac?.icon,
      config.win?.icon,
      config.nsis?.installerIcon,
      config.nsis?.installerHeaderIcon,
    ])
      expect(statSync(path.join(directory, String(icon))).isFile(), String(icon)).toBe(true)
    // electron-builder takes the Linux sizes from the file names in this directory.
    expect((await readdir(path.join(directory, String(config.linux?.icon)))).sort()).toEqual(
      [16, 24, 32, 48, 64, 96, 128, 256, 512].map((size) => `${size}x${size}.png`).sort(),
    )
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// Loginom AI Agent (B4.5b): the 0.4 platform and signing settings, for when electron-builder signs the app itself.
test.each(channels)(
  "macOS $channel packages target arm64 macOS 14 and sign with the 0.4 entitlements without rewriting vendor resources",
  async ({ channel }) => {
    const config = load(channel)
    expect(config.mac?.target).toEqual([
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ])
    expect(config.mac?.minimumSystemVersion).toBe("14.0")
    expect(config.mac?.hardenedRuntime).toBe(true)
    expect(config.mac?.entitlements).toBe("resources/entitlements.plist")
    expect(config.mac?.entitlementsInherit).toBe("resources/entitlements.plist")

    // Ad-hoc signing with the hardened runtime needs disable-library-validation, or the app does not launch.
    const plist = await Bun.file(path.join(import.meta.dirname, String(config.mac?.entitlements))).text()
    expect([...plist.matchAll(/<key>([^<]+)<\/key>\s*<true\/>/g)].map((match) => match[1])).toEqual([
      "com.apple.security.cs.allow-jit",
      "com.apple.security.cs.allow-unsigned-executable-memory",
      "com.apple.security.cs.disable-executable-page-protection",
      "com.apple.security.cs.allow-dyld-environment-variables",
      "com.apple.security.cs.disable-library-validation",
      "com.apple.security.device.audio-input",
    ])

    // Node, Chromium, ripgrep and the dashboard kit keep their upstream signatures and resource-manifest hashes.
    expect(config.mac?.signIgnore).toEqual([
      "/Contents/Resources/loginom/bin/",
      "/Contents/Resources/loginom/browsers/",
      "/Contents/Resources/loginom/ripgrep/",
      "/Contents/Resources/loginom/dashboard/",
    ])
  },
)

// Loginom AI Agent (B4.5b): the 0.4 Debian dependencies; rpm keeps electron-builder's.
test.each(channels)("Linux $channel packages declare the 0.4 dependencies and rebuild nothing", ({ channel }) => {
  const config = load(channel)
  expect(config.npmRebuild).toBe(false)
  expect(config.deb?.depends).toEqual([
    "libgtk-3-0",
    "libnotify4",
    "libnss3",
    "libxss1",
    "libxtst6",
    "xdg-utils",
    "libatspi2.0-0",
    "libuuid1",
    "libsecret-1-0",
    "libgbm1",
    "libasound2t64 | libasound2 (>= 1.0.16)",
    "ca-certificates",
    "fonts-liberation",
    "libcurl4 | libcurl4t64 | libcurl3-gnutls",
    "libvulkan1",
  ])
  expect(config.rpm?.depends).toBeUndefined()
})

// Loginom AI Agent (B4.5b): electron-builder writes the launcher and package-type after afterPack with the umask of
// its process, and FPM keeps those modes in the package.
test.skipIf(process.platform !== "linux")("Linux packaging resets a private build umask", async () => {
  const previous = process.umask(0o077)

  try {
    await import(`./electron-builder.config.ts?umask=${Date.now()}`)
    expect(process.umask()).toBe(0o022)
  } finally {
    process.umask(previous)
  }
})

// Loginom AI Agent (B4.5b): FPM makes the payload root-owned, so a private build umask must not reach it.
test.skipIf(process.platform !== "linux")(
  "Linux afterPack opens the payload and packaging input modes and restores the pinned Chromium sandbox mode",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "loginom-afterpack-"))
    const app = path.join(root, "app")
    const resources = path.join(app, "resources")
    const build = path.join(root, "build")

    const sandbox = path.join(
      resources,
      `loginom/browsers/chromium-${release.chromiumRevision}/chrome-linux64/chrome-sandbox`,
    )

    const icon = path.join(build, "icons/32x32.png")
    const metainfo = path.join(build, "com.loginom.aiagent.dev.metainfo.xml")
    const mode = async (file: string) => (await stat(file)).mode & 0o7777

    try {
      await mkdir(path.dirname(sandbox), { recursive: true, mode: 0o700 })
      await mkdir(path.dirname(icon), { recursive: true, mode: 0o700 })
      await writeFile(sandbox, "fixture", { mode: 0o700 })
      await writeFile(icon, "fixture", { mode: 0o600 })
      await writeFile(metainfo, "fixture", { mode: 0o600 })

      // afterPack first checks the bundled CLI: a non-empty x64 ELF image and a non-empty version file.
      const elf = Buffer.alloc(64)
      elf.write("\x7fELF", "latin1")
      elf.set([2, 1, 1], 4)
      elf.writeUInt16LE(62, 18)
      elf.writeUInt32LE(1, 20)
      await writeFile(path.join(resources, "opencode-cli"), elf, { mode: 0o700 })
      await writeFile(path.join(resources, "opencode-cli.version"), "fixture", { mode: 0o600 })

      // SAFETY: getBase sets afterPack to an async function that reads only these fields of its context.
      const afterPack = load("dev", "linux-x64").afterPack as (context: {
        appOutDir: string
        electronPlatformName: string
        arch: Arch
        packager: { buildResourcesDir: string; getResourcesDir: (dir: string) => string }
      }) => Promise<void>

      await afterPack({
        appOutDir: app,
        electronPlatformName: "linux",
        arch: Arch.x64,
        packager: { buildResourcesDir: build, getResourcesDir: (dir: string) => path.join(dir, "resources") },
      })
      expect(await mode(sandbox)).toBe(0o4755)
      expect(await mode(path.dirname(sandbox))).toBe(0o755)
      expect(await mode(path.join(resources, "opencode-cli"))).toBe(0o755)
      expect(await mode(path.join(resources, "opencode-cli.version"))).toBe(0o644)
      expect(await mode(app)).toBe(0o755)
      expect(await mode(path.dirname(icon))).toBe(0o755)
      expect(await mode(icon)).toBe(0o644)
      expect(await mode(metainfo)).toBe(0o644)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  },
)

test("shared packaging defaults", async () => {
  const config = load("dev")
  // Packaging runs in secretless build jobs; the release workflow signs and notarizes afterwards.
  expect(config.mac?.sign).toBeUndefined()
  expect(config.mac?.notarize).toBeUndefined()
  expect(config.win?.signtoolOptions).toBeUndefined()
  expect(config.dmg?.sign).not.toBe(true)
  expect(config.mac?.extendInfo?.NSAutoFillRequiresTextContentTypeForOneTimeCodeOnMac).toBe(true)
  const include = path.join(import.meta.dirname, "resources/windows/installer.nsh")
  expect(config.nsis?.include).toBe(include)
  expect(await Bun.file(include).exists()).toBe(true)
  expect(config.files).toContain("!resources/opencode-cli*")
  expect(config.extraResources).toEqual([
    { from: "resources/", to: "", filter: ["opencode-cli", "opencode-cli.exe", "opencode-cli.version"] },
    { from: "resources/loginom", to: "loginom" },
  ])

  // Loginom AI Agent (B4.8a): the Loginom resources and the 0.4 S3 read key stay out of app.asar.
  const included = (file: string, stats = statSync(import.meta.filename)) =>
    trimFilter(import.meta.dirname, config)(path.join(import.meta.dirname, file), stats)

  expect(included("resources/loginom", statSync(import.meta.dirname))).toBe(false)
  expect(included("resources/loginom/host/node-host.mjs")).toBe(false)
  expect(included("resources/updates-s3.json")).toBe(false)
  expect(included("resources/windows/installer.nsh")).toBe(true)
})

test("trims external dependencies without excluding runtime files", () => {
  const fileStats = statSync(import.meta.filename)
  const dirStats = statSync(import.meta.dirname)
  const filter = trimFilter(import.meta.dirname, load("dev"))

  for (const prefix of ["node_modules/", "node_modules/parent/node_modules/"]) {
    const included = (file: string, stats = fileStats) => filter(path.join(import.meta.dirname, prefix, file), stats)

    // One file for each excluded pattern, including each brace alternative.
    for (const file of [
      "@zip.js/zip.js/dist/zip.js",
      ...["index.cjs", "index.min.js", "index-fflate.js", "deno.json", "eslint.config.mjs"].map(
        (name) => `@zip.js/zip.js/${name}`,
      ),
      ...["d.ts", "d.cts", "d.mts", "d.ts.map", "d.cts.map", "d.mts.map", "js.map", "cjs.map", "mjs.map"].map(
        (extension) => `unrelated/dist/index.${extension}`,
      ),
      "ajv/lib/core.ts",
      "ajv-formats/src/formats.ts",
      "js-yaml/dist/js-yaml.js",
      "js-yaml/dist/js-yaml.min.js",
      "js-yaml/dist/js-yaml.mjs.map",
      "js-yaml/bin/js-yaml.js",
    ]) {
      expect(included(file)).toBe(false)
    }

    for (const file of [
      "@zip.js/zip.js/index.js",
      "@zip.js/zip.js/lib/z-worker-inline.js",
      "electron-updater/out/main.js",
      "electron-updater/out/MacUpdater.js",
      "electron-updater/out/NsisUpdater.js",
      "electron-updater/out/providers/GitHubProvider.js",
      "builder-util-runtime/out/httpExecutor.js",
      "ajv/dist/ajv.js",
      "ajv/dist/refs/json-schema-draft-07.json",
      "ajv-formats/dist/formats.js",
      "js-yaml/index.js",
      "js-yaml/dist/js-yaml.mjs",
      "unrelated/dist/index.js",
      "unrelated/dist/index.cjs",
      "unrelated/dist/data.json",
      "unrelated/src/index.ts",
      ...["@zip.js/zip.js", "electron-updater", "builder-util-runtime", "ajv", "ajv-formats", "js-yaml"].flatMap(
        (name) => [`${name}/package.json`, `${name}/LICENSE`],
      ),
    ]) {
      expect(included(file)).toBe(true)
    }

    expect(included("@zip.js/zip.js/dist", dirStats)).toBe(false)
    expect(included("@zip.js/zip.js/lib", dirStats)).toBe(true)
  }

  for (const item of CLI_BINARIES) {
    const targetFilter = trimFilter(import.meta.dirname, load("prod", item.target))
    const active = nodePtyPackage(item.target)

    for (const candidate of CLI_BINARIES) {
      const pkg = nodePtyPackage(candidate.target)
      const included = targetFilter(path.join(import.meta.dirname, "node_modules", pkg, "lib/index.js"), fileStats)
      expect(included).toBe(pkg === active)
    }
  }
})

test("the trimmed Zip.js package can still export compressed logs", async () => {
  const config = load("dev")
  const dir = await mkdtemp(path.join(os.tmpdir(), "opencode-zip-package-"))
  const source = path.dirname(fileURLToPath(import.meta.resolve("@zip.js/zip.js/package.json")))
  const filter = trimFilter(dir, config)

  try {
    await cp(source, dir, {
      recursive: true,
      filter: (file) =>
        filter(path.join(dir, "node_modules/@zip.js/zip.js", path.relative(source, file)), statSync(file)),
    })
    const zip = await import(pathToFileURL(path.join(dir, "index.js")).href)
    const writer = new zip.ZipWriter(new zip.BlobWriter("application/zip"))
    await writer.add("desktop.log", new zip.BlobReader(new Blob(["diagnostic log\n".repeat(100)])))
    const reader = new zip.ZipReader(new zip.BlobReader(await writer.close()))
    const entries = await reader.getEntries()
    expect(entries.map((entry: { filename: string }) => entry.filename)).toEqual(["desktop.log"])
    expect(entries[0].compressionMethod).toBe(8)
    expect(await entries[0].getData(new zip.TextWriter())).toBe("diagnostic log\n".repeat(100))
    await reader.close()
    await zip.terminateWorkers()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
