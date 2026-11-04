import { expect, test } from "bun:test"
import { validateUpdate } from "./update-policy"
import { generateKeyPairSync, sign } from "node:crypto"
import { AppUpdater, type DownloadUpdateOptions } from "electron-updater/out/AppUpdater"
import { GenericProvider } from "electron-updater/out/providers/GenericProvider"
import type { UpdateInfo } from "electron-updater"
import { configureUpdateFeed } from "./update-policy"
import { updateProxyOptions } from "./update-policy"
import {
  compareUpdateVersions,
  matchUpdateManifest,
  parseUpdateAdminPolicy,
  updateMode,
  updatePolicyPath,
  updateSettings,
  verifyUpdateManifest,
} from "./update-policy"

const file = { url: "loginom-ai-agent-linux-x86_64.AppImage", sha512: Buffer.alloc(64).toString("base64") }
const feed = "https://updates.example.test/agent/"

test("accepts a hashed asset within the own product feed", () => {
  expect(() => validateUpdate({ version: "0.1.1", files: [file] }, feed, "prod")).not.toThrow()
})

test("rejects upstream, escaped paths, missing hashes and foreign channels before download", () => {
  for (const url of ["https://opencode.ai/agent/" + file.url, "../" + file.url, "opencode.AppImage"]) {
    expect(() => validateUpdate({ version: "0.1.1", files: [{ ...file, url }] }, feed, "prod")).toThrow()
  }
  expect(() => validateUpdate({ version: "0.1.1", files: [{ ...file, sha512: "" }] }, feed, "prod")).toThrow()
  expect(() => validateUpdate({ version: "0.1.1-beta.1", files: [file] }, feed, "prod")).toThrow()
  expect(() => validateUpdate({ version: "0.1.1", files: [file] }, feed, "beta")).toThrow()
})

const primary = generateKeyPairSync("ed25519")
const spare = generateKeyPairSync("ed25519")
const outsider = generateKeyPairSync("ed25519")
const keys = [primary, spare].map((key) => key.publicKey.export({ type: "spki", format: "pem" }).toString())
const manifest = Buffer.from(
  `version: 0.4.1\nminSupportedVersion: 0.4.0\nstagingPercentage: 100\npath: 0.4.1/${file.url}\nsha512: ${file.sha512}\nfiles:\n  - url: 0.4.1/${file.url}\n    sha512: ${file.sha512}\n`,
)
const signature = (bytes = manifest, key = primary) => sign(null, bytes, key.privateKey).toString("base64")

test("accepts exact manifest bytes signed by either primary or rotation key", () => {
  for (const key of [primary, spare]) {
    const info = verifyUpdateManifest(manifest, signature(manifest, key), feed, keys)
    expect(info.version).toBe("0.4.1")
    expect(info.minSupportedVersion).toBe("0.4.0")
  }
})

test("rejects a foreign key, a changed byte, and malformed signature", () => {
  expect(() => verifyUpdateManifest(manifest, signature(manifest, outsider), feed, keys)).toThrow("SIGNATURE_INVALID")
  expect(() => verifyUpdateManifest(Buffer.concat([manifest, Buffer.from("\n")]), signature(), feed, keys)).toThrow(
    "SIGNATURE_INVALID",
  )
  for (const invalid of ["", "abc", signature().slice(1), "!".repeat(88)]) {
    expect(() => verifyUpdateManifest(manifest, invalid, feed, keys)).toThrow("SIGNATURE_INVALID")
  }
})

test("a valid signature cannot bypass existing product provenance or the version folder", () => {
  for (const url of [
    "https://upstream.test/" + file.url,
    "../" + file.url,
    "0.4.0/" + file.url,
    "0.4.1/../" + file.url,
    "0.4.1/%2e%2e/" + file.url,
    "0.4.1/opencode.AppImage",
    "0.4.1/" + file.url + "?other=1",
  ]) {
    const bytes = Buffer.from(manifest.toString().replaceAll("0.4.1/" + file.url, url))
    expect(() => verifyUpdateManifest(bytes, signature(bytes), feed, keys)).toThrow()
  }
  for (const value of ["-1", "101", "bad"]) {
    const bytes = Buffer.from(manifest.toString().replace("stagingPercentage: 100", "stagingPercentage: " + value))
    expect(() => verifyUpdateManifest(bytes, signature(bytes), feed, keys)).toThrow()
  }
})

test("matches updater metadata and rejects changed version, legacy path, hashes, files and rollout", () => {
  const info = verifyUpdateManifest(manifest, signature(), feed, keys)
  expect(() => matchUpdateManifest(info, structuredClone(info))).not.toThrow()
  for (const change of [
    { version: "0.4.2" },
    { path: "0.4.1/other.exe" },
    { sha512: "other" },
    { files: [] },
    { files: [{ ...info.files[0], sha512: "other" }] },
    { minSupportedVersion: "0.3.0" },
    { stagingPercentage: 0 },
  ])
    expect(() => matchUpdateManifest(info, { ...info, ...change })).toThrow("MANIFEST_MISMATCH")
})

test("stable and unstable are feed folders with stable as default and policy precedence", () => {
  expect(updateSettings(feed, undefined).feed).toBe(feed + "stable/")
  expect(updateSettings(feed.slice(0, -1), "unstable").feed).toBe(feed + "unstable/")
  expect(updateSettings(null, undefined).enabled).toBe(false)
  const policy = parseUpdateAdminPolicy({ updates: "on", channel: "stable", feedUrl: "https://admin.test/agent" })
  expect(updateSettings(feed, "unstable", policy)).toEqual({
    enabled: true,
    channel: "stable",
    feed: "https://admin.test/agent/stable/",
    managed: true,
    channelLocked: true,
  })
  expect(updateSettings(feed, "unstable", { updates: "off" }).enabled).toBe(false)
  expect(updateSettings(null, "stable", policy).enabled).toBe(true)
  for (const invalid of [
    null,
    [],
    { channel: "beta" },
    { updates: true },
    { feedUrl: "http://unsafe.test/" },
    { feedUrl: "https://user:password@feed.test/" },
    { feedUrl: "https://feed.test/?query=1" },
  ])
    expect(() => parseUpdateAdminPolicy(invalid)).toThrow()
})

test("administrator policy has platform-specific system locations", () => {
  expect(updatePolicyPath("linux")).toBe("/etc/loginom-ai-agent/policy.json")
  expect(updatePolicyPath("darwin")).toBe("/Library/Application Support/Loginom AI Agent/policy.json")
  expect(updatePolicyPath("win32", "D:\\ProgramData")).toBe("D:\\ProgramData\\Loginom AI Agent\\policy.json")
})

test("only Windows NSIS and AppImage auto-download; macOS and deb notify", () => {
  expect(updateMode("win32")).toBe("automatic")
  expect(updateMode("linux", "/app.AppImage")).toBe("automatic")
  expect(updateMode("linux")).toBe("notify")
  expect(updateMode("linux", "")).toBe("notify")
  expect(updateMode("darwin", "/ignored.AppImage")).toBe("notify")
})

test("minSupportedVersion and no-downgrade comparison are numeric semver", () => {
  expect(compareUpdateVersions("0.4.0", "0.4.1")).toBe(-1)
  expect(compareUpdateVersions("0.4.0", "0.4.0")).toBe(0)
  expect(compareUpdateVersions("0.10.0", "0.9.9")).toBe(1)
  expect(() => compareUpdateVersions("0.4.1-beta.1", "0.4.0")).toThrow()
})

test("updater session receives application proxy rules, bypasses and scoped credentials", () => {
  const proxy = updateProxyOptions(
    {
      HTTP_PROXY: "http://proxy.test:2080",
      HTTPS_PROXY: "http://user:secret%21@secure.test:8080",
      NO_PROXY: "localhost,127.0.0.1,app.loginom.ai",
    },
    true,
  )
  expect(proxy.config).toEqual({
    mode: "fixed_servers",
    proxyRules: "http=http://proxy.test:2080;https=http://secure.test:8080",
    proxyBypassRules: "localhost;127.0.0.1;app.loginom.ai",
  })
  expect(JSON.stringify(proxy.config)).not.toContain("secret")
  expect(proxy.credentials).toEqual([{ host: "secure.test", port: 8080, username: "user", password: "secret!" }])
  expect(updateProxyOptions({}, false).config).toEqual({ mode: "direct" })
  expect(updateProxyOptions({}, true).config).toEqual({ mode: "system" })
  expect(updateProxyOptions({ ALL_PROXY: "socks5://localhost:1080" }, false).config.proxyRules).toBe(
    "http=socks5://localhost:1080;https=socks5://localhost:1080",
  )
  expect(() => updateProxyOptions({ HTTPS_PROXY: "invalid" }, false)).toThrow()
})

test("pinned electron-updater returns the same object it passes to download and refuses channel downgrades", async () => {
  class Updater extends AppUpdater {
    info: UpdateInfo = verifyUpdateManifest(manifest, signature(), feed, keys)
    downloaded?: UpdateInfo
    constructor() {
      super(null, {
        version: "0.4.0",
        name: "test",
        isPackaged: true,
        userDataPath: "unused",
        baseCachePath: "unused",
        appUpdateConfigPath: "unused",
        whenReady: async () => {},
        relaunch() {},
        quit() {},
        onQuit() {},
      })
      this.autoDownload = false
      this.logger = null
      this.isUserWithinRollout = () => true
    }
    protected async getUpdateInfoAndProvider() {
      return {
        info: this.info,
        provider: new GenericProvider({ provider: "generic", url: feed }, this, {
          executor: null!,
          isUseMultipleRangeRequest: true,
          platform: "linux",
        }),
      }
    }
    protected async doDownloadUpdate(options: DownloadUpdateOptions) {
      this.downloaded = options.updateInfoAndProvider.info
      return ["fixture"]
    }
    quitAndInstall() {}
    stored() {
      return this.updateInfoAndProvider?.info
    }
  }
  const updater = new Updater()
  configureUpdateFeed(updater, feed + "unstable/")
  expect(updater.channel).toBeNull()
  const result = await updater.checkForUpdates()
  expect(result?.isUpdateAvailable).toBe(true)
  expect(result?.updateInfo).toBe(updater.stored())
  await updater.downloadUpdate()
  expect(updater.downloaded).toBe(result?.updateInfo)
  // Simulate a more recent installed unstable release switching to stable.
  updater.info = { ...updater.info, version: "0.3.9" }
  updater.allowDowngrade = true
  configureUpdateFeed(updater, feed + "stable/")
  expect(updater.allowDowngrade).toBe(false)
  expect(updater.channel).toBeNull()
  expect((await updater.checkForUpdates())?.isUpdateAvailable).toBe(false)
})
