import { execFile } from "node:child_process"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { chmod } from "node:fs/promises"
import type { Configuration } from "electron-builder"
import { Product, productChannel, productName, productSlug } from "@loginom-ai-agent/product"

const execFileAsync = promisify(execFile)
const packageDir = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(packageDir, "../..")
const signScript = path.join(rootDir, "script", "sign-windows.ps1")

async function signWindows(configuration: { path: string }) {
  if (process.platform !== "win32") return
  if (process.env.GITHUB_ACTIONS !== "true") return

  await execFileAsync(
    "pwsh",
    ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", signScript, configuration.path],
    { cwd: rootDir },
  )
}

const channel = productChannel(process.env.LOGINOM_AI_AGENT_CHANNEL)
const appId = Product.channels[channel]
const config: Configuration = {
  appId,
  productName: productName(channel),
  artifactName: Product.artifactName,
  publish: null,
  async afterPack(context) {
    if (context.electronPlatformName !== "linux") return
    // Resource copying normalizes modes. Restore the Chromium fallback before DEB ownership becomes root.
    await chmod(
      path.join(context.appOutDir, "resources/loginom/browsers/chromium-1243/chrome-linux64/chrome-sandbox"),
      0o4755,
    )
  },
  directories: { output: "dist", buildResources: "resources" },
  extraMetadata: { desktopName: `${appId}.desktop` },
  files: ["out/**/*", "resources/icons/**/*"],
  extraResources: [
    { from: "resources/loginom", to: "loginom" },
    { from: "resources/icons", to: "icons" },
    ...(process.platform === "darwin"
      ? [
          {
            from: "native/",
            to: "native/",
            filter: ["index.js", "index.d.ts", "build/Release/mac_window.node", "swift-build/**"],
          },
        ]
      : []),
  ],
  protocols: { name: Product.name, schemes: [Product.scheme] },
  mac: {
    category: "public.app-category.productivity",
    icon: "resources/icons/icon.icns",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "resources/entitlements.plist",
    entitlementsInherit: "resources/entitlements.plist",
    notarize: true,
    target: ["dmg", "zip"],
  },
  dmg: { sign: true },
  win: {
    icon: "resources/icons/icon.ico",
    signtoolOptions: { sign: signWindows },
    target: ["nsis"],
    verifyUpdateCodeSignature: true,
  },
  nsis: {
    oneClick: true,
    perMachine: false,
    installerIcon: "resources/icons/icon.ico",
    installerHeaderIcon: "resources/icons/icon.ico",
  },
  linux: {
    syncDesktopName: true,
    icon: "resources/icons",
    category: "Office",
    executableName: productSlug(channel),
    desktop: { entry: { StartupWMClass: appId } },
    target: ["AppImage", "deb"],
  },
  deb: {
    // Electron and the bundled Chromium both link these libraries on all supported distributions.
    depends: [
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
      "libasound2 | libasound2t64",
      "ca-certificates",
      "fonts-liberation",
      "libcurl4 | libcurl4t64 | libcurl3-gnutls",
      "libvulkan1",
    ],
    maintainer: "Loginom",
    packageName: productSlug(channel),
    fpm: [`${path.join(packageDir, "resources", `${appId}.metainfo.xml`)}=/usr/share/metainfo/${appId}.metainfo.xml`],
  },
}
export default config
