import { expect, test } from "bun:test"
import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { createServer, request } from "node:http"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NsisUpdater } from "electron-updater/out/NsisUpdater.js"
import { checkAutomaticUpdate, loadSignedUpdate, readUpdateBytes, readUpdateSettings } from "./signed-feed"

const installedVersion = "0.4.3"
const nextVersion = "0.5.0"
const feed = "https://updates.s3.example.test/updates/"
const override = "https://admin.example.test/alternate/"
const github = { api: "https://api.example.test/releases", download: "https://download.example.test/assets/" }
const trusted = generateKeyPairSync("ed25519")
const foreign = generateKeyPairSync("ed25519")
const keys = [trusted.publicKey.export({ format: "pem", type: "spki" }).toString()]
const hash = createHash("sha512").update("fixture installer").digest("base64")

function manifest(target = `releases/${nextVersion}/loginom-ai-agent-win-x64.exe`, version = nextVersion) {
  return `version: ${version}\nminSupportedVersion: ${installedVersion}\nfiles:\n  - url: ${target}\n    sha512: ${hash}\npath: ${target}\nsha512: ${hash}\n`
}

test.each([
  { name: "trusted signature offers N+1", path: "/updates/stable", offered: nextVersion },
  { name: "foreign signature refuses N+1", path: "/updates/stable", signer: foreign, error: "SIGNATURE_INVALID" },
  { name: "changed bytes refuse N+1", path: "/updates/stable", tamper: true, error: "SIGNATURE_INVALID" },
  {
    name: "a signed OpenCode target is refused",
    path: "/updates/stable",
    target: `releases/${nextVersion}/opencode-desktop-win-x64.exe`,
    error: "TARGET_INVALID",
  },
  {
    name: "a signed cross-origin target is refused",
    path: "/updates/stable",
    target: `https://other.example.test/releases/${nextVersion}/loginom-ai-agent-win-x64.exe`,
    error: "TARGET_INVALID",
  },
  {
    name: "a signed traversing target is refused",
    path: "/updates/stable",
    target: `../stable/${nextVersion}/loginom-ai-agent-win-x64.exe`,
    error: "TARGET_INVALID",
  },
  {
    name: "an installed release is not offered again",
    path: "/updates/stable",
    version: installedVersion,
    target: `releases/${installedVersion}/loginom-ai-agent-win-x64.exe`,
  },
  {
    name: "an older signed release cannot downgrade",
    path: "/updates/stable",
    version: "0.4.2",
    target: "releases/0.4.2/loginom-ai-agent-win-x64.exe",
  },
  { name: "updates off makes no requests", policy: { updates: "off" } },
  { name: "invalid policy fails closed", policy: { updates: "false" }, error: "POLICY_INVALID" },
  { name: "the imported preference is used", preference: "unstable", path: "/updates/unstable", offered: nextVersion },
  {
    name: "policy overrides the imported preference and built-in sources",
    preference: "stable",
    policy: { updates: "on", channel: "unstable", feedUrl: override },
    path: "/alternate/unstable",
    offered: nextVersion,
  },
  { name: "GitHub precedes its S3 mirror", githubStatus: 200, path: `/assets/v${nextVersion}`, offered: nextVersion },
  {
    name: "GitHub transport failure falls back to signed S3",
    githubStatus: 503,
    path: "/stable",
    offered: nextVersion,
  },
  {
    name: "GitHub signature failure does not fall back",
    githubStatus: 200,
    path: `/assets/v${nextVersion}`,
    signer: foreign,
    error: "SIGNATURE_INVALID",
  },
  { name: "an absent GitHub release does not fall back", githubStatus: 404 },
])(
  "UPDATE-01: $name",
  async ({ path, offered, signer, tamper, policy, preference, error, target, version, githubStatus }) => {
    const root = mkdtempSync(join(tmpdir(), "loginom-updates-"))
    const policyPath = join(root, "policy.json")
    const s3Path = join(root, "updates-s3.json")
    if (policy) writeFileSync(policyPath, JSON.stringify(policy))
    writeFileSync(
      s3Path,
      JSON.stringify({
        endpoint: "https://s3.example.test",
        region: "fixture",
        bucket: "updates",
        accessKeyId: "fixture:reader",
        secretAccessKey: "fixture-only",
      }),
    )
    const yaml = manifest(target, version)
    const signature = sign(null, Buffer.from(yaml), (signer ?? trusted).privateKey).toString("base64")
    const observed: string[] = []
    const server = createServer((req, response) => {
      const url = new URL(req.url ?? "", "http://127.0.0.1")
      const pathname = url.pathname
      observed.push(pathname)
      if (pathname === "/releases/latest" && githubStatus)
        return response
          .writeHead(githubStatus)
          .end(JSON.stringify({ tag_name: `v${nextVersion}`, draft: false, prerelease: false }))
      if (
        (pathname.startsWith("/stable/") || pathname.startsWith("/updates/")) &&
        !url.searchParams.has("X-Amz-Signature")
      )
        return response.writeHead(403).end()
      if (pathname === `${path}/latest.yml`) return response.end(tamper ? `${yaml}\n` : yaml)
      if (pathname === `${path}/latest.yml.sig`) return response.end(signature)
      response.writeHead(404).end()
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const address = server.address()
    if (!address || typeof address === "string") throw Error("Expected a TCP fixture")
    const updater = new NsisUpdater(null, {
      version: installedVersion,
      name: "fixture desktop",
      isPackaged: true,
      appUpdateConfigPath: join(root, "app-update.yml"),
      userDataPath: root,
      baseCachePath: root,
      whenReady: async () => {},
      relaunch: () => {},
      quit: () => {},
      onQuit: () => {},
    })
    updater.autoDownload = false
    updater.logger = null
    const emitted: string[] = []
    updater.on("update-available", (info) => emitted.push(info.version))

    const check = async () => {
      const settings = readUpdateSettings({
        policyPath,
        s3Path,
        feed: githubStatus ? null : feed,
        preference,
        github: githubStatus || (policy && "feedUrl" in policy) ? github : null,
      })
      if (!settings.enabled) return undefined
      const selected = await loadSignedUpdate({
        sources: settings.sources,
        currentVersion: installedVersion,
        file: "latest.yml",
        keys,
        read: (url, timeout) =>
          readUpdateBytes(
            url,
            (url) => {
              const { pathname, search } = new URL(url)
              return request({ hostname: "127.0.0.1", port: address.port, path: pathname + search })
            },
            timeout,
          ),
      })
      return selected && (await checkAutomaticUpdate(updater, selected, false))?.info.version
    }

    try {
      if (error) await expect(check()).rejects.toThrow(`LOGINOM_UPDATE_${error}`)
      else expect(await check()).toBe(offered)
      expect(emitted).toEqual(offered ? [offered] : [])
      expect(observed).toEqual([
        ...(githubStatus ? ["/releases/latest"] : []),
        ...(path ? [`${path}/latest.yml`, `${path}/latest.yml.sig`] : []),
      ])
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      rmSync(root, { recursive: true, force: true })
    }
  },
)
