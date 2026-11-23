import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { copyFile, readdir, stat } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"

import { Arch, type Configuration } from "electron-builder"
import { Product, productName, productSlug } from "@loginom-ai-agent/product"
import { NativeArch } from "../../script/native-arch"
import { DESKTOP_NATIVE_ENGLISH } from "@opencode/app/i18n/desktop-native"
import release from "../product/loginom-release.json"
import { linuxPermissions } from "./scripts/linux-permissions"
import { CLI_BINARIES, getCurrentCli, nodePtyPackage } from "./script/utils"

const packageDir = path.dirname(fileURLToPath(import.meta.url))

// Loginom AI Agent (B4.5b): FPM also creates desktop entries outside appOutDir; their modes must not inherit a private
// shell umask.
if (process.platform === "linux") process.umask(0o022)

// Loginom AI Agent (B4.5b): Electron and the bundled Chromium both link these libraries on all supported distributions.
const debDepends = [
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
  // Ubuntu 24's unversioned libasound2 virtual package can select the incomplete OSS shim.
  "libasound2t64 | libasound2 (>= 1.0.16)",
  "ca-certificates",
  "fonts-liberation",
  "libcurl4 | libcurl4t64 | libcurl3-gnutls",
  "libvulkan1",
]

// rpmbuild adds /usr/lib/.build-id links for every ELF file. The bundled Electron
// binaries are byte-identical across apps on the same Electron version, so those
// links collide with other Electron RPMs (Slack, Unity Hub, ...) and rpm/zypper
// refuse to install or update. They only serve debuginfo lookup, so skip them.
// fpm only accepts flags before the first src=dest mapping, so keep this first.
const rpmNoBuildIdLinksFpm = "--rpm-rpmbuild-define=_build_id_links none"

const metainfoFpm = (appId: string) =>
  `${path.join(packageDir, "resources", `${appId}.metainfo.xml`)}=/usr/share/metainfo/${appId}.metainfo.xml`

// Dev and beta package every commit, so they trade about 5% (deb) and 17% (rpm) larger files for xz -1, which
// compresses the payload about 3x faster than the deb default (-3) and 5x faster than the rpm default (-9).
const previewCompressionFpm = (target: "deb" | "rpm") => [`--${target}-compression-level`, "1"]

function resolveChannel() {
  const raw = process.env.LOGINOM_AI_AGENT_CHANNEL

  if (raw === "dev" || raw === "beta" || raw === "prod") return raw

  if (raw === "latest") return "prod"

  return "dev"
}

const getBase = (channel: keyof typeof Product.channels): Configuration => {
  const target = getCurrentCli()
  const appId = Product.channels[channel]
  const desktopName = `${appId}.desktop`

  return {
    appId,
    // electron-builder names the /opt directory after productName, so Linux takes the slug; the launcher and
    // the packaged metadata keep the display name.
    productName: process.platform === "linux" ? productSlug(channel) : productName(channel),
    artifactName: Product.artifactName,
    directories: {
      output: "dist",
      buildResources: "resources",
    },
    // Linux launchers are .desktop files, so this is the desktop file name,
    // not just the app id. For prod, app id "com.loginom.aiagent" becomes
    // "com.loginom.aiagent.desktop".
    // https://developer.gnome.org/documentation/guidelines/maintainer/integrating.html
    // https://www.electron.build/docs/linux/
    // The package name gives the per-user install directory and the updater cache their names; the 0.4
    // installers published them as @loginom-ai-agentdesktop and @loginom-ai-agentdesktop-updater.
    extraMetadata: {
      name: `${Product.namespace}/desktop`,
      productName: productName(channel),
      desktopName,
      // Release builds take their version from LOGINOM_AI_AGENT_VERSION instead of rewriting package.json;
      // electron-builder skips an undefined value.
      version: process.env.LOGINOM_AI_AGENT_VERSION || undefined,
    },
    files: [
      "out/**/*",
      "resources/**/*",
      "!resources/opencode-cli*",
      // Loginom AI Agent (B4.8a): the Loginom resources ship next to app.asar. The 0.4 S3 read key for updates waits
      // for the updater that reads it (stage C).
      "!resources/loginom{,/**/*}",
      "!resources/updates-s3.json",
      // Keep only the target platform's node-pty prebuild when cross-packaging with --cpu=*.
      ...CLI_BINARIES.filter((item) => item.os !== target.os || item.cpu !== target.cpu).map(
        (item) => `!**/node_modules/@lydell/node-pty-${item.os}-${item.cpu}{,/**/*}`,
      ),
      // Log export imports Zip.js as ESM. Keep index.js and lib, including its inline worker.
      "!**/node_modules/@zip.js/zip.js/dist{,/**/*}",
      "!**/node_modules/@zip.js/zip.js/{index.cjs,index.min.js,index-fflate.js,deno.json,eslint.config.mjs}",
      // Nothing executes type declarations or source maps, and every entry costs startup time: the
      // main process parses the whole asar header before it runs any JavaScript.
      "!**/node_modules/**/*.d.{ts,cts,mts}",
      "!**/node_modules/**/*.d.{ts,cts,mts}.map",
      "!**/node_modules/**/*.{js,cjs,mjs}.map",
      // These packages execute compiled JavaScript, not their sources.
      "!**/node_modules/ajv/lib{,/**/*}",
      "!**/node_modules/ajv-formats/src{,/**/*}",
      // Keep js-yaml's CommonJS sources and dist/js-yaml.mjs ESM entry, not browser bundles or its CLI.
      "!**/node_modules/js-yaml/dist/{js-yaml.js,js-yaml.min.js,*.map}",
      "!**/node_modules/js-yaml/bin{,/**/*}",
    ],
    extraResources: [
      {
        from: "resources/",
        to: "",
        filter: ["opencode-cli", "opencode-cli.exe", "opencode-cli.version"],
      },
      { from: "resources/loginom", to: "loginom" },
    ],
    // Loginom AI Agent (B4.5b): the service and the Host run in the bundled CLI and Node. Main-process native
    // dependencies are N-API platform packages that the lockfile already selected, so nothing is rebuilt for Electron.
    npmRebuild: false,
    afterPack: async (context) => {
      const arch = Arch[context.arch]

      // The --arm64 flag picks Electron while LOGINOM_AI_AGENT_TARGET picks the CLI and node-pty, so they can disagree.
      if (arch !== "x64" && arch !== "arm64") throw new Error(`Unsupported desktop architecture: ${arch}`)

      if (arch !== target.cpu) throw new Error(`Packaging ${arch} Electron with the ${target.target} CLI`)
      const resources = context.packager.getResourcesDir(context.appOutDir)
      const cli = path.join(resources, context.electronPlatformName === "win32" ? "opencode-cli.exe" : "opencode-cli")

      const file = await stat(cli)

      if (!file.isFile() || file.size === 0) throw new Error(`Bundled CLI must be a non-empty file: ${cli}`)
      await NativeArch.verify(cli, arch)
      const version = path.join(path.dirname(cli), "opencode-cli.version")

      if ((await stat(version)).size === 0) throw new Error(`Bundled CLI version must be a non-empty file: ${version}`)

      // With an Icon Composer mac.icon, electron-builder bundles the ICNS that actool generates as the pre-macOS 26
      // fallback. That one tops out at 256px and draws a light ring around the squircle, so ship ours instead.
      if (context.electronPlatformName === "darwin")
        await copyFile(path.join(packageDir, "resources/icons/icon.icns"), path.join(resources, "icon.icns"))

      // Loginom AI Agent (B4.5b): installed Linux payloads are root-owned and must stay readable by every user, so
      // every mode is opened first. That leaves chrome-sandbox 0755, but Chromium's setuid sandbox needs 4755 once
      // the package makes it root-owned. /bin/chmod sets the bit whatever runtime loads this config (Bun 1.3.14's
      // fs.chmod cleared it).
      if (context.electronPlatformName === "linux") {
        await linuxPermissions(context.appOutDir)
        // FPM packs the icons and the metainfo straight from the build resources, with the modes the build gave them.
        await Promise.all(
          ["icons", `${appId}.metainfo.xml`].flatMap((name) => {
            const file = path.join(context.packager.buildResourcesDir, name)

            return existsSync(file) ? [linuxPermissions(file)] : []
          }),
        )
        await promisify(execFile)("/bin/chmod", [
          "4755",
          path.join(resources, `loginom/browsers/chromium-${release.chromiumRevision}/chrome-linux64/chrome-sandbox`),
        ])
      }

      if (context.electronPlatformName !== "win32") return

      const prebuilds = path.join(
        resources,
        "app.asar.unpacked/node_modules",
        nodePtyPackage(target.target),
        "prebuilds",
        `${target.os}-${target.cpu}`,
      )

      const addon = path.join(prebuilds, "conpty.node")

      if ((await stat(addon)).size === 0) throw new Error(`Bundled node-pty must be a non-empty file: ${addon}`)
      const entries = await readdir(prebuilds, { recursive: true, withFileTypes: true })

      await Promise.all(
        entries
          .filter((entry) => entry.isFile())
          .map(async (entry) => {
            const file = path.join(entry.parentPath, entry.name)

            if (await NativeArch.isNative(file)) await NativeArch.verify(file, arch)
          }),
      )
    },
    mac: {
      category: "public.app-category.developer-tools",
      icon: `resources/icons/icon.icns`,
      extendInfo: {
        NSMicrophoneUsageDescription: DESKTOP_NATIVE_ENGLISH["desktop.microphoneUsage"],
        // The CLI server and its terminals run as children of the app, so macOS asks for their access to
        // these protected locations in the app's name. The prompt shows the description (#56479).
        NSDocumentsFolderUsageDescription: DESKTOP_NATIVE_ENGLISH["desktop.documentsFolderUsage"],
        NSDesktopFolderUsageDescription: DESKTOP_NATIVE_ENGLISH["desktop.desktopFolderUsage"],
        NSDownloadsFolderUsageDescription: DESKTOP_NATIVE_ENGLISH["desktop.downloadsFolderUsage"],
        NSNetworkVolumesUsageDescription: DESKTOP_NATIVE_ENGLISH["desktop.networkVolumesUsage"],
        NSRemovableVolumesUsageDescription: DESKTOP_NATIVE_ENGLISH["desktop.removableVolumesUsage"],
        NSAutoFillRequiresTextContentTypeForOneTimeCodeOnMac: true,
      },
      // Loginom AI Agent (B4.5b): macOS 14 and later, as in 0.4.
      minimumSystemVersion: "14.0",
      // Loginom AI Agent (B4.5b): the 0.4 signing settings. They apply when electron-builder signs the app itself.
      hardenedRuntime: true,
      entitlements: "resources/entitlements.plist",
      entitlementsInherit: "resources/entitlements.plist",
      // Preserve upstream signatures and the staged resource-manifest hashes.
      signIgnore: [
        "/Contents/Resources/loginom/bin/",
        "/Contents/Resources/loginom/browsers/",
        "/Contents/Resources/loginom/ripgrep/",
        // The dashboard kit's npm packages ship signed esbuild and rollup binaries.
        "/Contents/Resources/loginom/dashboard/",
      ],
      // macOS packages are arm64, as in 0.4. pack.ts's --dir builds take their architecture from the CLI target.
      target: [
        { target: "dmg", arch: ["arm64"] },
        { target: "zip", arch: ["arm64"] },
      ],
    },
    protocols: { name: Product.name, schemes: [Product.scheme] },
    win: {
      icon: `resources/icons/icon.ico`,
      executableName: productSlug(channel),
      target: ["nsis"],
      verifyUpdateCodeSignature: false,
    },
    nsis: {
      include: path.join(packageDir, "resources", "windows", "installer.nsh"),
      oneClick: true,
      perMachine: false,
      installerIcon: `resources/icons/icon.ico`,
      installerHeaderIcon: `resources/icons/icon.ico`,
      shortcutName: productName(channel),
    },
    linux: {
      // Loginom AI Agent (B4.6): the 0.4 Linux sizes, which script/copy-icons.ts stages in linux/.
      icon: `resources/icons/linux`,
      category: "Development",
      // libappimage finds the AppImage's desktop entry by globbing `*.desktop`, so the executable must never
      // end in `.desktop` (anomalyco/opencode#51867). The slug does not.
      executableName: productSlug(channel),
      // deb and rpm otherwise need an email in the manifest's author.
      maintainer: "Loginom",
      // Derive the installed `.desktop` filename from `desktopName`
      // (`com.loginom.aiagent.desktop` for prod) instead of `executableName`.
      syncDesktopName: true,
      desktop: {
        entry: {
          Name: productName(channel),
          // Match the installed .desktop file and hicolor icon basename so
          // Linux shells can associate the running Electron window with its launcher.
          StartupWMClass: appId,
        },
      },
      target: ["AppImage", "deb", "rpm"],
    },
  }
}

export function getConfig() {
  const channel = resolveChannel()
  const appId = Product.channels[channel]
  const packageName = productSlug(channel)

  const base = {
    ...getBase(channel),
    // A generic target writes app-update.yml even with --publish never. Until the build supplies the product
    // feed, the invalid placeholder only enables that file; no channel updates from an upstream feed.
    publish: {
      provider: "generic",
      url: process.env.LOGINOM_AI_AGENT_UPDATE_FEED?.trim() || "https://updates.invalid/",
      channel: "latest",
    },
  }

  switch (channel) {
    case "dev": {
      return {
        ...base,
        deb: { packageName, depends: debDepends, fpm: [...previewCompressionFpm("deb"), metainfoFpm(appId)] },
        rpm: {
          packageName,
          fpm: [rpmNoBuildIdLinksFpm, ...previewCompressionFpm("rpm"), metainfoFpm(appId)],
        },
      }
    }

    case "beta": {
      return {
        ...base,
        deb: { packageName, depends: debDepends, fpm: [...previewCompressionFpm("deb"), metainfoFpm(appId)] },
        rpm: {
          packageName,
          fpm: [rpmNoBuildIdLinksFpm, ...previewCompressionFpm("rpm"), metainfoFpm(appId)],
        },
      }
    }

    case "prod": {
      return {
        ...base,
        // Loginom AI Agent (B4.6): the 0.4 icons have no Icon Composer package, so prod keeps the shared ICNS.
        deb: { packageName, depends: debDepends, fpm: [metainfoFpm(appId)] },
        rpm: { packageName, fpm: [rpmNoBuildIdLinksFpm, metainfoFpm(appId)] },
      }
    }
  }
}

export default getConfig()
