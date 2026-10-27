import { expect, test } from "bun:test"
import { AppInfo, Packager } from "electron-builder"
import { createRequire } from "node:module"
import path from "node:path"
import { fileURLToPath } from "node:url"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const builderRequire = createRequire(require.resolve("electron-builder", { paths: [packageDir] }))
const { getWindowsInstallationDirName } = builderRequire("app-builder-lib/out/targets/targetUtil") as {
  getWindowsInstallationDirName: (appInfo: AppInfo, isTryToUseProductName: boolean) => string
}

// Measured in the NSIS header of the published installers loginom-ai-agent-win-x64.exe, v0.3.3 (2eea642c) and v0.3.4 (db130098):
// INSTDIR = %LOCALAPPDATA%\Programs\@loginom-ai-agentdesktop, updater installer = @loginom-ai-agentdesktop-updater\installer.exe.
const published = {
  windowsInstallDir: "@loginom-ai-agentdesktop",
  updaterCacheDir: "@loginom-ai-agentdesktop-updater",
}

async function packagerOf(channel: string) {
  const previous = process.env.LOGINOM_AI_AGENT_CHANNEL
  process.env.LOGINOM_AI_AGENT_CHANNEL = channel
  try {
    const config = (await import(`./electron-builder.config.ts?external-names=${channel}`)).default
    const packager = new Packager({ projectDir: packageDir, config })
    await packager.validateConfig()
    const appInfo = new AppInfo(packager, null)
    return { appInfo, nsis: config.nsis ?? {} }
  } finally {
    if (previous === undefined) delete process.env.LOGINOM_AI_AGENT_CHANNEL
    else process.env.LOGINOM_AI_AGENT_CHANNEL = previous
  }
}

for (const channel of ["dev", "beta", "prod"] as const) {
  test(`${channel}: names derived from the package name equal the published Windows installer`, async () => {
    const { appInfo, nsis } = await packagerOf(channel)
    const installDir = getWindowsInstallationDirName(appInfo, nsis.oneClick === false || nsis.perMachine === true)
    expect(installDir).toBe(published.windowsInstallDir)
    expect(appInfo.updaterCacheDirName).toBe(published.updaterCacheDir)
  })
}
