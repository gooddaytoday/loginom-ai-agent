import { expect, test } from "bun:test"
import { createServer, request } from "node:http"
import { createHash, createHmac, generateKeyPairSync, sign } from "node:crypto"
import { AppUpdater, type DownloadUpdateOptions } from "electron-updater/out/AppUpdater"
const {
  loadSignedUpdate,
  readUpdateBytes,
  configureSignedUpdate,
  downloadSignedUpdate,
  updateSources,
  isUpdateTransportError,
} = await import("./update-policy")
import { presignUpdateGet } from "@loginom-ai-agent/product/update-signature"

const key = generateKeyPairSync("ed25519")
const keys = [key.publicKey.export({ type: "spki", format: "pem" }).toString()]
const payload = Buffer.from("test update payload")
const sha512 = createHash("sha512").update(payload).digest("base64")
const filename = "loginom-ai-agent-linux-x86_64.AppImage"
const metadata = (version = "0.4.2") =>
  Buffer.from(
    `version: ${version}\nminSupportedVersion: 0.4.0\nstagingPercentage: 100\npath: releases/${version}/${filename}\nsha512: ${sha512}\nfiles:\n  - url: releases/${version}/${filename}\n    sha512: ${sha512}\n    size: ${payload.length}\n`,
  )

test("private S3 rejects anonymous and modified GETs, then verifies SigV4 metadata and payload after GitHub failure", async () => {
  const calls: string[] = []
  const secret = "local-only-secret"
  let corruptSignature = false
  const server = createServer((req, res) => {
    if (req.url!.startsWith("/github")) {
      res.writeHead(503).end()
      return
    }
    const url = new URL(req.url!, "https://" + req.headers.host)
    if (!url.hostname.startsWith("updates-test.")) {
      res.writeHead(404).end("NoSuchBucket")
      return
    }
    const signature = url.searchParams.get("X-Amz-Signature")
    if (!signature) {
      res.writeHead(403).end("AccessDenied")
      return
    }
    const date = url.searchParams.get("X-Amz-Date") ?? ""
    const timestamp = Date.parse(date.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z"))
    const expires = Number(url.searchParams.get("X-Amz-Expires"))
    if (
      req.method !== "GET" ||
      !Number.isFinite(timestamp) ||
      timestamp > Date.now() + 300_000 ||
      timestamp + expires * 1000 < Date.now() ||
      url.searchParams.get("X-Amz-SignedHeaders") !== "host" ||
      url.searchParams.get("X-Amz-Algorithm") !== "AWS4-HMAC-SHA256"
    ) {
      res.writeHead(403).end("AccessDenied")
      return
    }
    url.searchParams.delete("X-Amz-Signature")
    const encode = (value: string) =>
      encodeURIComponent(value).replace(/[!'()*]/g, (ch) => "%" + ch.charCodeAt(0).toString(16).toUpperCase())
    const query = [...url.searchParams]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([a, b]) => encode(a) + "=" + encode(b))
      .join("&")
    const credential = url.searchParams.get("X-Amz-Credential")!.split("/")
    const canonical = `${req.method}\n${url.pathname}\n${query}\nhost:${req.headers.host}\n\nhost\nUNSIGNED-PAYLOAD`
    let signing = Buffer.from("AWS4" + secret)
    for (const part of credential.slice(1)) signing = createHmac("sha256", signing).update(part).digest()
    const expected = createHmac("sha256", signing)
      .update(
        "AWS4-HMAC-SHA256\n" +
          url.searchParams.get("X-Amz-Date") +
          "\n" +
          credential.slice(1).join("/") +
          "\n" +
          createHash("sha256").update(canonical).digest("hex"),
      )
      .digest("hex")
    if (expected !== signature || credential[0] !== "tenant:read-key" || credential[2] !== "ru-central-1") {
      res.writeHead(403).end("SignatureDoesNotMatch")
      return
    }
    calls.push(url.pathname)
    if (url.pathname.endsWith(".sig")) {
      res.end(corruptSignature ? "invalid" : sign(null, metadata(), key.privateKey).toString("base64"))
      return
    }
    if (url.pathname.endsWith(".yml")) {
      res.end(metadata())
      return
    }
    if (url.pathname.endsWith(filename)) {
      res.end(payload)
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port
  const config = {
    endpoint: `https://s3.local.test:${port}`,
    region: "ru-central-1",
    bucket: "updates-test",
    accessKeyId: "tenant:read-key",
    secretAccessKey: secret,
  }
  const feed = `https://updates-test.s3.local.test:${port}/stable/`
  const read = (value: string) =>
    readUpdateBytes(
      value,
      (value) => {
        const url = new URL(value)
        return request({ hostname: "127.0.0.1", port, path: url.pathname + url.search, headers: { Host: url.host } })
      },
      200,
    )
  try {
    await expect(read(feed + "latest-linux.yml")).rejects.toThrow("HTTP_403")
    const tampered = presignUpdateGet(config, "stable/latest-linux.yml").replace("latest-linux.yml", "other.yml")
    await expect(read(tampered)).rejects.toThrow("HTTP_403")
    const settings = updateSources(
      null,
      { api: `https://github.local.test:${port}/github/`, download: `https://github.local.test:${port}/download/` },
      "stable",
      {},
      config,
    )
    const selected = await loadSignedUpdate({
      sources: settings.sources,
      read,
      file: "latest-linux.yml",
      currentVersion: "0.4.1",
      keys,
    })
    expect(selected.source).toBe("s3")
    const updater = new Updater()
    configureSignedUpdate(updater, selected)
    expect((await updater.checkForUpdates())?.isUpdateAvailable).toBe(true)
    updater.read = read
    await updater.downloadUpdate()
    expect(calls).toEqual(["/stable/latest-linux.yml", "/stable/latest-linux.yml.sig", `/releases/0.4.2/${filename}`])
    expect(updater.allowDowngrade).toBe(false)
    corruptSignature = true
    await expect(
      loadSignedUpdate({
        sources: settings.sources.filter((source) => source.kind === "s3"),
        read,
        file: "latest-linux.yml",
        currentVersion: "0.4.1",
        keys,
      }),
    ).rejects.toThrow("SIGNATURE_INVALID")
    const managed = updateSources(
      feed.replace(/stable\/$/, ""),
      null,
      "stable",
      { feedUrl: "https://admin.example.test/" },
      config,
    )
    expect(managed.sources).toEqual([{ kind: "generic", feed: "https://admin.example.test/stable/" }])
    await expect(
      read(presignUpdateGet(config, "stable/latest-linux.yml", { now: new Date("2000-01-01") })),
    ).rejects.toThrow("HTTP_403")
    const wrong = presignUpdateGet({ ...config, secretAccessKey: "wrong" }, "stable/latest-linux.yml")
    await expect(read(wrong)).rejects.toThrow("HTTP_403")
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})

async function fixture(
  options: {
    status?: number
    timeout?: boolean
    badSignature?: boolean
    invalid?: boolean
    version?: string
    s3Down?: boolean
    artifactStatus?: number
  } = {},
) {
  const calls: string[] = []
  const raw = options.invalid ? Buffer.from("version: [invalid") : metadata(options.version)
  const signature = sign(null, raw, key.privateKey).toString("base64")
  const server = createServer((req, res) => {
    const path = req.url!
    calls.push(path)
    if (path.startsWith("/api") && options.timeout) return
    if (path.startsWith("/api") && options.status) {
      res.writeHead(options.status).end()
      return
    }
    if (path.startsWith("/s3") && options.s3Down) {
      res.writeHead(503).end()
      return
    }
    if (path.startsWith("/api")) {
      const stable = { tag_name: "v0.4.2", draft: false, prerelease: false }
      res.end(
        JSON.stringify(
          path.includes("/latest") ? stable : [stable, { ...stable, tag_name: "v0.4.3", prerelease: true }],
        ),
      )
      return
    }
    if (path.endsWith(".sig")) {
      res.end(options.badSignature && path.startsWith("/download") ? "invalid" : signature)
      return
    }
    if (path.endsWith(".yml")) {
      res.end(raw)
      return
    }
    if (path.endsWith(filename)) {
      if (path.startsWith("/download") && options.artifactStatus) {
        res.writeHead(options.artifactStatus).end()
        return
      }
      res.end(payload)
      return
    }
    res.writeHead(404).end()
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`
  const read = (url: string) => readUpdateBytes(url, (url) => request(url), 50)
  const sources = [
    { kind: "github" as const, api: base + "/api/", download: base + "/download/", channel: "stable" as const },
    { kind: "generic" as const, feed: base + "/s3/stable/" },
  ]
  return {
    calls,
    read,
    sources,
    base,
    async close() {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}

class Updater extends AppUpdater {
  read = (url: string) => readUpdateBytes(url, (url) => request(url), 200)
  urls: string[] = []
  constructor() {
    super(null, {
      version: "0.4.1",
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
    this.on("error", () => {})
    this.logger = null
    this.isUserWithinRollout = () => true
  }
  protected async doDownloadUpdate(options: DownloadUpdateOptions) {
    const files = options.updateInfoAndProvider.provider.resolveFiles(options.updateInfoAndProvider.info)
    for (const file of files) {
      this.urls.push(file.url.href)
      const bytes = await this.read(file.url.href)
      expect(createHash("sha512").update(bytes).digest("base64")).toBe(file.info.sha512)
    }
    return ["fixture"]
  }
  quitAndInstall() {}
}

for (const options of [{ timeout: true }, { status: 503 }, { status: 500 }, { status: 429 }, { status: 403 }]) {
  test(`GitHub transport ${JSON.stringify(options)} falls back and downloads only S3`, async () => {
    const f = await fixture(options)
    try {
      const selected = await loadSignedUpdate({
        sources: f.sources,
        read: f.read,
        file: "latest-linux.yml",
        currentVersion: "0.4.1",
        keys,
      })
      expect(selected.source).toBe("generic")
      const updater = new Updater()
      configureSignedUpdate(updater, selected)
      expect((await updater.checkForUpdates())?.isUpdateAvailable).toBe(true)
      await updater.downloadUpdate()
      expect(updater.urls).toEqual([f.base + `/s3/releases/0.4.2/${filename}`])
      expect(updater.allowDowngrade).toBe(false)
      expect(f.calls.filter((url) => url.includes(".yml"))).toEqual([
        "/s3/stable/latest-linux.yml",
        "/s3/stable/latest-linux.yml.sig",
      ])
    } finally {
      await f.close()
    }
  })
}

for (const options of [{ badSignature: true }, { invalid: true }, { status: 404 }, { version: "0.4.0" }]) {
  test(`GitHub invalid evidence ${JSON.stringify(options)} never uses S3`, async () => {
    const f = await fixture(options)
    try {
      await expect(
        loadSignedUpdate({ sources: f.sources, read: f.read, file: "latest-linux.yml", currentVersion: "0.4.1", keys }),
      ).rejects.toThrow()
      expect(f.calls.some((url) => url.startsWith("/s3"))).toBe(false)
    } finally {
      await f.close()
    }
  })
}

test("both sources fail within bounded time with an explicit error", async () => {
  const f = await fixture({ timeout: true, s3Down: true })
  try {
    await expect(
      loadSignedUpdate({ sources: f.sources, read: f.read, file: "latest-linux.yml", currentVersion: "0.4.1", keys }),
    ).rejects.toThrow("LOGINOM_UPDATE_SOURCES_UNAVAILABLE")
  } finally {
    await f.close()
  }
})

test("an older signed S3 release is an error and cannot enable a downgrade", async () => {
  const f = await fixture({ status: 503, version: "0.4.0" })
  try {
    await expect(
      loadSignedUpdate({ sources: f.sources, read: f.read, file: "latest-linux.yml", currentVersion: "0.4.1", keys }),
    ).rejects.toThrow("LOGINOM_UPDATE_VERSION_OLDER")
  } finally {
    await f.close()
  }
})

test("GitHub success pins metadata and payload to that exact release; unstable selects a prerelease", async () => {
  const f = await fixture()
  try {
    const selected = await loadSignedUpdate({
      sources: f.sources,
      read: f.read,
      file: "latest-linux.yml",
      currentVersion: "0.4.1",
      keys,
    })
    const updater = new Updater()
    configureSignedUpdate(updater, selected)
    await updater.checkForUpdates()
    await updater.downloadUpdate()
    expect(updater.urls).toEqual([f.base + `/download/v0.4.2/${filename}`])
    expect(f.calls.filter((url) => url.endsWith(".yml"))).toHaveLength(1)
    expect(f.calls.some((url) => url.startsWith("/s3"))).toBe(false)
    const sources = [{ ...f.sources[0], channel: "unstable" as const }]
    await expect(
      loadSignedUpdate({ sources, read: f.read, file: "latest-linux.yml", currentVersion: "0.4.1", keys }),
    ).rejects.toThrow("LOGINOM_UPDATE_RELEASE_MISMATCH")
    expect(f.calls).toContain("/download/v0.4.3/latest-linux.yml")
  } finally {
    await f.close()
  }
})

test("policy feedUrl overrides both built-in transports and validates all build inputs", () => {
  const github = {
    api: "https://api.example.test/releases/",
    download: "https://github.example.test/releases/download/",
  }
  expect(
    updateSources("https://s3.example.test/", github, "unstable", { feedUrl: "https://admin.example.test/" }).sources,
  ).toEqual([{ kind: "generic", feed: "https://admin.example.test/unstable/" }])
  expect(updateSources("https://s3.example.test/", github, undefined).sources[0]).toMatchObject({
    kind: "github",
    channel: "stable",
  })
  expect(updateSources(null, null, undefined).enabled).toBe(false)
  expect(updateSources(null, github, undefined, { updates: "off" }).enabled).toBe(false)
  expect(() => updateSources("https://s3.example.test/", { ...github, api: "http://bad.test/" }, undefined)).toThrow()
})

test("GitHub artifact transport failure re-verifies the same target on S3 before retrying the download", async () => {
  const f = await fixture({ artifactStatus: 503 })
  try {
    const selected = await loadSignedUpdate({
      sources: f.sources,
      read: f.read,
      file: "latest-linux.yml",
      currentVersion: "0.4.1",
      keys,
    })
    const updater = new Updater()
    configureSignedUpdate(updater, selected)
    await updater.checkForUpdates()
    await downloadSignedUpdate(updater, selected, () =>
      loadSignedUpdate({
        sources: f.sources.slice(1),
        read: f.read,
        file: "latest-linux.yml",
        currentVersion: selected.signed.version,
        keys,
      }),
    )
    expect(updater.urls).toEqual([f.base + `/download/v0.4.2/${filename}`, f.base + `/s3/releases/0.4.2/${filename}`])
    expect(updater.allowDowngrade).toBe(false)
  } finally {
    await f.close()
  }
})

test("only explicit network, timeout, 5xx and rate-limit errors permit failover", () => {
  for (const code of ["ENOTFOUND", "ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"])
    expect(isUpdateTransportError(Object.assign(Error("network"), { code }))).toBe(true)
  for (const statusCode of [403, 429, 500, 502, 503, 504])
    expect(isUpdateTransportError(Object.assign(Error("http"), { statusCode }))).toBe(true)
  expect(isUpdateTransportError(Error("net::ERR_CONNECTION_REFUSED"))).toBe(true)
  expect(
    isUpdateTransportError(Error('Cannot download "https://github.test/asset", status 503: Service Unavailable')),
  ).toBe(true)
  expect(isUpdateTransportError(Error('Cannot download "https://github.test/asset", status 404: Not Found'))).toBe(
    false,
  )
  expect(isUpdateTransportError(Error("Request timed out"))).toBe(true)
  for (const code of [
    "ERR_CERT_AUTHORITY_INVALID",
    "CERT_HAS_EXPIRED",
    "ERR_UPDATER_CHECKSUM_MISMATCH",
    "LOGINOM_UPDATE_SIGNATURE_INVALID",
  ])
    expect(isUpdateTransportError(Object.assign(Error("invalid"), { code }))).toBe(false)
  for (const statusCode of [400, 401, 404, 422])
    expect(isUpdateTransportError(Object.assign(Error("http"), { statusCode }))).toBe(false)
})

test("mutating electron-updater metadata cannot mutate approval evidence or trigger S3", async () => {
  const f = await fixture()
  try {
    const selected = await loadSignedUpdate({
      sources: f.sources,
      read: f.read,
      file: "latest-linux.yml",
      currentVersion: "0.4.1",
      keys,
    })
    const updater = new Updater()
    configureSignedUpdate(updater, selected)
    const result = await updater.checkForUpdates()
    expect(result!.updateInfo).not.toBe(selected.signed)
    result!.updateInfo.files[0].sha512 = Buffer.alloc(64).toString("base64")
    expect(selected.signed.files[0].sha512).toBe(sha512)
    let fallback = false
    await expect(
      downloadSignedUpdate(updater, selected, async () => {
        fallback = true
        return selected
      }),
    ).rejects.toThrow("LOGINOM_UPDATE_MANIFEST_MISMATCH")
    expect(fallback).toBe(false)
    expect(updater.urls).toHaveLength(0)
  } finally {
    await f.close()
  }
})

test("unstable successfully checks and downloads a prerelease without selecting the stable release", async () => {
  const f = await fixture({ version: "0.4.3" })
  try {
    const sources = [{ ...f.sources[0], channel: "unstable" as const }, f.sources[1]]
    const selected = await loadSignedUpdate({
      sources,
      read: f.read,
      file: "latest-linux.yml",
      currentVersion: "0.4.1",
      keys,
    })
    const updater = new Updater()
    configureSignedUpdate(updater, selected)
    expect((await updater.checkForUpdates())?.isUpdateAvailable).toBe(true)
    await updater.downloadUpdate()
    expect(updater.urls).toEqual([f.base + `/download/v0.4.3/${filename}`])
    expect(f.calls.some((url) => url.startsWith("/s3") || url.includes("v0.4.2") || url.includes("/api/latest"))).toBe(
      false,
    )
  } finally {
    await f.close()
  }
})

test("policy feedUrl is the only metadata and artifact source used at runtime", async () => {
  const f = await fixture()
  try {
    const settings = updateSources(
      "https://s3.example.test/",
      { api: "https://github.example.test/api/", download: "https://github.example.test/download/" },
      "unstable",
      { feedUrl: "https://admin.example.test/" },
    )
    const read = (url: string) => readUpdateBytes(url, (url) => request(new URL(new URL(url).pathname, f.base)), 200)
    const selected = await loadSignedUpdate({
      sources: settings.sources,
      read,
      file: "latest-linux.yml",
      currentVersion: "0.4.1",
      keys,
    })
    expect(selected.url(selected.signed.files[0].url)).toBe(`https://admin.example.test/releases/0.4.2/${filename}`)
    expect(f.calls).toEqual(["/unstable/latest-linux.yml", "/unstable/latest-linux.yml.sig"])
  } finally {
    await f.close()
  }
})
