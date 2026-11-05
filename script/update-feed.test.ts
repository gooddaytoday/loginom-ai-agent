import { expect, test } from "bun:test"
import { generateKeyPairSync } from "node:crypto"
import { mkdtemp, rm, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  Feed,
  type Store,
  checkRelease,
  validateVersion,
  signRelease,
  mirrorRelease,
  verifySignedRelease,
  verifyPublicRelease,
  s3Store,
} from "./update-feed"
import { createServer } from "node:http"
import { rename, readdir } from "node:fs/promises"

const pair = generateKeyPairSync("ed25519")
const key = pair.privateKey.export({ format: "pem", type: "pkcs8" }).toString()
const publicKey = pair.publicKey.export({ format: "pem", type: "spki" }).toString()

function memory() {
  const files = new Map<string, { bytes: Uint8Array; cache: string }>()
  const events: string[] = []
  const store: Store = {
    async get(name) {
      const file = files.get(name)
      if (!file) throw Error(`Missing ${name}`)
      return file.bytes
    },
    async put(name, bytes, cache) {
      events.push(`put ${name}`)
      files.set(name, { bytes: bytes instanceof Blob ? new Uint8Array(await bytes.arrayBuffer()) : bytes, cache })
    },
    async head(name) {
      const file = files.get(name)
      if (!file) return undefined
      return { size: file.bytes.length, cache: file.cache }
    },
    async copy(from, to, cache) {
      events.push(`copy ${to}`)
      const file = files.get(from)
      if (!file) throw Error(`Missing ${from}`)
      files.set(to, { ...file, cache: cache ?? file.cache })
    },
  }
  return { files, events, store }
}

async function fixture(version = "0.4.0") {
  const dir = await mkdtemp(join(tmpdir(), "update-release-"))
  const binaries = [
    "desktop.exe",
    "desktop.zip",
    "desktop.AppImage",
    "desktop.deb",
    "desktop.exe.blockmap",
    "desktop.zip.blockmap",
    "desktop.AppImage.blockmap",
    ...["linux-x64.tar.gz", "win32-x64.zip", "darwin-arm64.tar.gz"].map(
      (suffix) => `loginom-ai-agent-cli-${version}-${suffix}`,
    ),
  ]
  for (const file of binaries) await Bun.write(join(dir, file), `bytes:${file}`)
  for (const [name, artifact] of [
    ["latest.yml", "desktop.exe"],
    ["latest-mac.yml", "desktop.zip"],
    ["latest-linux.yml", "desktop.AppImage"],
  ]) {
    const bytes = await Bun.file(join(dir, artifact)).bytes()
    const sha512 = new Bun.CryptoHasher("sha512").update(bytes).digest("base64")
    await Bun.write(
      join(dir, name),
      Bun.YAML.stringify({
        version,
        path: artifact,
        sha512,
        files: [
          { url: artifact, sha512, size: bytes.length },
          ...(name === "latest-linux.yml"
            ? [
                {
                  url: "desktop.deb",
                  sha512: new Bun.CryptoHasher("sha512")
                    .update(await Bun.file(join(dir, "desktop.deb")).bytes())
                    .digest("base64"),
                  size: Bun.file(join(dir, "desktop.deb")).size,
                },
              ]
            : []),
        ],
      }),
    )
  }
  await Bun.write(join(dir, "test-public-key.pem"), publicKey)
  await Bun.write(
    join(dir, "TEST-ONLY.txt"),
    "Synthetic LAB-801 transport fixture. These files are not executable installers. Trust only the accompanying test public key.\n",
  )
  const names = [
    "test-public-key.pem",
    "TEST-ONLY.txt",
    ...binaries,
    "latest.yml",
    "latest-mac.yml",
    "latest-linux.yml",
  ]
  await Bun.write(
    join(dir, "SHA256SUMS.txt"),
    (
      await Promise.all(
        names.map(
          async (name) =>
            `${new Bun.CryptoHasher("sha256").update(await Bun.file(join(dir, name)).bytes()).digest("hex")}  ${name}\n`,
        ),
      )
    ).join(""),
  )
  return dir
}

test("publish uploads verified immutable files first; promote copies identical bytes; stage zero preserves CLI", async () => {
  const dir = await fixture()
  const m = memory()
  const feed = new Feed(m.store, [publicKey])
  try {
    await feed.publish(dir, "0.4.0", 25, "0.3.9", key)
    expect(await feed.status("unstable")).toMatchObject({ version: "0.4.0", stagingPercentage: 25 })
    const pointer = m.events.indexOf("put unstable/latest.yml")
    expect(m.events.slice(pointer).every((event) => !event.includes("/0.4.0/"))).toBe(true)
    await feed.promote("0.4.0", undefined, key)
    for (const [name, file] of m.files) {
      if (!name.startsWith("unstable/0.4.0/")) continue
      expect(m.files.get(name.replace("unstable/", "stable/"))?.bytes).toEqual(file.bytes)
      expect(file.cache).toBe("public, max-age=31536000, immutable")
    }
    const cli = m.files.get("stable/cli.json")!.bytes
    await feed.stage("stable", 0, key)
    expect((await feed.status("stable")).stagingPercentage).toBe(0)
    expect(m.files.get("stable/cli.json")!.bytes).toEqual(cli)
    const yml = Bun.YAML.parse(new TextDecoder().decode(m.files.get("stable/latest.yml")!.bytes)) as { path: string }
    expect(yml.path).toBe("0.4.0/desktop.exe")
    expect(m.files.get("stable/latest.yml")!.cache).toBe("no-cache")
    await expect(feed.publish(dir, "0.4.0", 100, "0.3.9", key)).rejects.toThrow("already exists")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("bad hashes and traversal fail before any upload", async () => {
  const dir = await fixture()
  const m = memory()
  try {
    await Bun.write(join(dir, "desktop.exe"), "tampered")
    await expect(new Feed(m.store, [publicKey]).publish(dir, "0.4.0", 100, "0.3.9", key)).rejects.toThrow("SHA256")
    expect(m.events).toHaveLength(0)
    await Bun.write(join(dir, "SHA256SUMS.txt"), `${"0".repeat(64)}  ../escape\n`)
    await expect(checkRelease(dir)).rejects.toThrow()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
  for (const version of ["1.2.3-beta", "../1", "01.2.3", "v1.2.3"]) expect(() => validateVersion(version)).toThrow()
})

test("status fails on tampered signature or missing binary; stage refuses an untrusted signing key", async () => {
  const dir = await fixture()
  const m = memory()
  const feed = new Feed(m.store, [publicKey])
  try {
    await feed.publish(dir, "0.4.0", 100, "0.3.9", key)
    const foreign = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString()
    const before = m.events.length
    await expect(feed.stage("unstable", 0, foreign)).rejects.toThrow()
    expect(m.events).toHaveLength(before)
    const file = m.files.get("unstable/latest.yml")!
    m.files.set("unstable/latest.yml", { ...file, bytes: Buffer.from("version: 9.9.9\n") })
    await expect(feed.status("unstable")).rejects.toThrow("signature")
    m.files.set("unstable/latest.yml", file)
    m.files.delete("unstable/0.4.0/desktop.exe")
    await expect(feed.status("unstable")).rejects.toThrow("Missing")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

async function releaseSums(dir: string) {
  const files = (await readdir(dir)).filter((name) => name !== "SHA256SUMS.txt")
  await Bun.write(
    join(dir, "SHA256SUMS.txt"),
    (
      await Promise.all(
        files.map(
          async (name) =>
            new Bun.CryptoHasher("sha256").update(await Bun.file(join(dir, name)).bytes()).digest("hex") +
            "  " +
            name +
            "\n",
        ),
      )
    ).join(""),
  )
}

async function signedFixture() {
  const dir = await fixture()
  for (const name of await readdir(dir))
    if (name.startsWith("desktop")) await rename(join(dir, name), join(dir, "loginom-ai-agent-" + name))
  for (const name of ["latest.yml", "latest-linux.yml", "latest-mac.yml"])
    await Bun.write(
      join(dir, name),
      (await Bun.file(join(dir, name)).text()).replaceAll("desktop.", "loginom-ai-agent-desktop."),
    )
  await releaseSums(dir)
  return dir
}

test("dual release signs GitHub bytes, mirrors immutable assets and server-copies both channel pointers", async () => {
  const dir = await signedFixture()
  const m = memory()
  try {
    await signRelease(dir, "0.4.0", "0.3.9", key, [publicKey])
    await releaseSums(dir)
    await verifySignedRelease(dir, "0.4.0", [publicKey])
    await mirrorRelease(m.store, dir, "0.4.0", "unstable", [publicKey])
    const puts = m.events.filter((event) => event.startsWith("put "))
    expect(puts.every((event) => event.startsWith("put releases/0.4.0/"))).toBe(true)
    expect(m.files.get("unstable/latest.yml")!.bytes).toEqual(await Bun.file(join(dir, "latest.yml")).bytes())
    expect(m.files.get("unstable/latest.yml")!.cache).toBe("no-cache")
    expect(m.files.get("releases/0.4.0/latest.yml")!.cache).toContain("immutable")
    const previous = m.events.length
    await mirrorRelease(m.store, dir, "0.4.0", "stable", [publicKey])
    expect(m.events.slice(previous).every((event) => event.startsWith("copy stable/"))).toBe(true)
    expect(m.files.get("stable/latest.yml")!.bytes).toEqual(m.files.get("unstable/latest.yml")!.bytes)

    let privateRead = false
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, "http://" + req.headers.host)
      const path = url.pathname.slice(1)
      if (privateRead && !path.startsWith("github/") && !url.searchParams.has("X-Amz-Signature")) {
        res.writeHead(403).end("AccessDenied")
        return
      }
      const bytes = path.startsWith("github/")
        ? await Bun.file(join(dir, path.slice(7))).bytes()
        : m.files.get(path)?.bytes
      if (!bytes) {
        res.writeHead(404).end()
        return
      }
      res.end(bytes)
    })
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/`
    try {
      await verifyPublicRelease(dir, "0.4.0", base + "github/", base, "stable", [publicKey])
      privateRead = true
      const send: typeof fetch = async (input, init) => {
        const url = new URL(String(input))
        if (url.hostname !== "updates-test.s3.local.test") return fetch(input, init)
        const headers = new Headers(init?.headers)
        headers.set("Host", url.host)
        return fetch(new URL(url.pathname + url.search, base), { ...init, headers })
      }
      const s3 = {
        endpoint: "https://s3.local.test",
        region: "ru-central-1",
        bucket: "updates-test",
        accessKeyId: "tenant:read-key",
        secretAccessKey: "test-only-secret",
      }
      await verifyPublicRelease(
        dir,
        "0.4.0",
        base + "github/",
        "https://updates-test.s3.local.test/",
        "stable",
        [publicKey],
        { s3, fetch: send },
      )
      privateRead = false
      m.files.set("stable/latest.yml.sig", { bytes: Buffer.from("tampered"), cache: "no-cache" })
      await expect(verifyPublicRelease(dir, "0.4.0", base + "github/", base, "stable", [publicKey])).rejects.toThrow(
        "verification failed",
      )
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
    m.files.set("releases/0.4.0/loginom-ai-agent-desktop.exe", { bytes: Buffer.from("tampered"), cache: "immutable" })
    await expect(mirrorRelease(m.store, dir, "0.4.0", "stable", [publicKey])).rejects.toThrow(
      "Immutable release differs",
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("dual mirror rejects an invalid signature before any S3 write, even with valid SHA256SUMS", async () => {
  const dir = await signedFixture()
  const m = memory()
  try {
    await signRelease(dir, "0.4.0", "0.3.9", key, [publicKey])
    await Bun.write(join(dir, "latest.yml.sig"), "invalid")
    await releaseSums(dir)
    await expect(mirrorRelease(m.store, dir, "0.4.0", "unstable", [publicKey])).rejects.toThrow("Invalid signature")
    expect(m.events).toHaveLength(0)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("cloud.ru SDK uses ru-central-1 and preserves copy bytes with no-cache metadata", async () => {
  const dir = await mkdtemp(join(tmpdir(), "update-local-s3-"))
  const objects = new Map<string, { bytes: Buffer; cache: string }>()
  const scopes: string[] = []
  const server = createServer(async (req, res) => {
    scopes.push(req.headers.authorization ?? "")
    if (!req.headers.host?.startsWith("updates-test.")) {
      res.writeHead(404).end("NoSuchBucket")
      return
    }
    const path = req.url!.split("?")[0]
    const source = req.headers["x-amz-copy-source"]
    if (req.method === "PUT" && typeof source === "string") {
      const data = objects.get("/" + decodeURIComponent(source).replace(/^\/?updates-test\//, ""))!
      objects.set(path, { bytes: data.bytes, cache: String(req.headers["cache-control"] ?? data.cache) })
      res.end('<CopyObjectResult><ETag>"test"</ETag></CopyObjectResult>')
      return
    }
    if (req.method === "PUT") {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(chunk)
      objects.set(path, { bytes: Buffer.concat(chunks), cache: String(req.headers["cache-control"]) })
      res.end()
      return
    }
    const data = objects.get(path)
    if (!data) {
      res.writeHead(404).end()
      return
    }
    res.setHeader("Cache-Control", data.cache)
    res.setHeader("Content-Length", data.bytes.length)
    res.end(req.method === "HEAD" ? undefined : data.bytes)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  try {
    const config = join(dir, "s3.json")
    await Bun.write(
      config,
      JSON.stringify({
        endpoint: "https://s3.local.test/",
        bucket: "updates-test",
        access_key: "test-tenant:test-key",
        secret_key: "test-secret",
      }),
    )
    const store = await s3Store(config, "https://updates-test.s3.local.test/", {
      async handle(input) {
        const query = new URLSearchParams()
        for (const [key, value] of Object.entries(input.query ?? {})) {
          for (const item of Array.isArray(value) ? value : [value])
            if (item !== undefined && item !== null) query.append(key, String(item))
        }
        const response = await fetch(
          `http://127.0.0.1:${(server.address() as { port: number }).port}${input.path}?${query}`,
          {
            method: input.method,
            headers: input.headers,
            body: input.body,
          },
        )
        return {
          response: { statusCode: response.status, headers: Object.fromEntries(response.headers), body: response.body },
        }
      },
    })
    expect(await store.head("missing")).toBeUndefined()
    await store.put("releases/0.4.0/latest.yml", new Blob(["signed bytes"]), "public, max-age=31536000, immutable")
    await store.copy("releases/0.4.0/latest.yml", "stable/latest.yml", "no-cache")
    expect(Buffer.from(await store.get("stable/latest.yml")).toString()).toBe("signed bytes")
    expect(await store.head("stable/latest.yml")).toEqual({ size: 12, cache: "no-cache" })
    expect(scopes.every((value) => value.includes("/ru-central-1/s3/aws4_request"))).toBe(true)
  } finally {
    server.closeAllConnections()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await rm(dir, { recursive: true, force: true })
  }
})

// Explicit opt-in; this test can only mutate this issue's isolated S3 prefix.
test.skipIf(!process.env.LOGINOM_UPDATE_S3_TEST_BASE)(
  "live S3 publish, promote, stage zero, anonymous cache and Range",
  async () => {
    const base = process.env.LOGINOM_UPDATE_S3_TEST_BASE!
    if (!new URL(base).pathname.endsWith("/_test/LAB-801/")) throw Error("Live test requires /_test/LAB-801/")
    const version = process.env.LOGINOM_UPDATE_S3_TEST_VERSION ?? "0.4.801"
    validateVersion(version)
    const dir = await fixture(version)
    const keys = await mkdtemp(join(tmpdir(), "loginom-update-keys-"))
    const pem = join(keys, "test-private.pem")
    await Bun.write(pem, key)
    await chmod(pem, 0o600)
    const run = async (...args: string[]) => {
      const process = Bun.spawn(
        [
          Bun.which("bun")!,
          join(import.meta.dir, "update-feed.ts"),
          ...args,
          "--feed-base",
          base,
          "--public-key",
          join(dir, "test-public-key.pem"),
        ],
        { stdout: "pipe", stderr: "pipe", timeout: 90000 },
      )
      const [out, err, code] = await Promise.all([
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
        process.exited,
      ])
      expect(code, err).toBe(0)
      const result = JSON.parse(out)
      console.log(`${args[0]}: ${JSON.stringify(result)}`)
      expect(result.status).toBe("PASS")
      return result
    }
    try {
      await run(
        "publish",
        "--channel",
        "unstable",
        "--version",
        version,
        "--assets",
        dir,
        "--staging",
        "25",
        "--min-supported",
        "0.3.9",
        "--key",
        pem,
      )
      await run("status", "--channel", "unstable")
      await run("promote", "--to", "stable", "--version", version, "--key", pem)
      expect((await run("stage", "--channel", "stable", "--percent", "0", "--key", pem)).stagingPercentage).toBe(0)
      await run("status", "--channel", "stable")
      for (const target of ["stable", "unstable"]) {
        for (const name of ["latest.yml", "latest-mac.yml", "latest-linux.yml", "cli.json"]) {
          for (const suffix of ["", ".sig"]) {
            const response = await fetch(`${base}${target}/${name}${suffix}`)
            expect(response.status).toBe(200)
            expect(response.headers.get("cache-control")).toBe("no-cache")
            await response.arrayBuffer()
          }
        }
        const response = await fetch(`${base}${target}/${version}/desktop.AppImage`, {
          headers: { Range: "bytes=0-15" },
        })
        expect(response.status).toBe(206)
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable")
        expect(response.headers.get("content-range")).toStartWith("bytes 0-15/")
        expect((await response.arrayBuffer()).byteLength).toBe(16)
        console.log(`${target}: anonymous metadata no-cache; version immutable; Range 206`)
      }
      const names = [...(await checkRelease(dir)).keys(), "SHA256SUMS.txt"]
      for (const name of names) {
        const [a, b] = await Promise.all([
          fetch(`${base}unstable/${version}/${name}`),
          fetch(`${base}stable/${version}/${name}`),
        ])
        expect(new Uint8Array(await a.arrayBuffer())).toEqual(new Uint8Array(await b.arrayBuffer()))
      }
      console.log(`Test feed retained: ${base}; test key: ${base}stable/${version}/test-public-key.pem`)
    } finally {
      await rm(dir, { recursive: true, force: true })
      await rm(keys, { recursive: true, force: true })
    }
  },
  120000,
)

test("malformed release metadata and incomplete blockmaps fail without side effects", async () => {
  for (const corruption of ["version", "path", "size", "blockmap", "missing-sha"]) {
    const dir = await fixture()
    const m = memory()
    try {
      if (corruption === "blockmap") await rm(join(dir, "desktop.exe.blockmap"))
      if (corruption === "missing-sha") await Bun.write(join(dir, "unhashed.txt"), "must fail")
      const data = Bun.YAML.parse(await Bun.file(join(dir, "latest.yml")).text()) as {
        version: string
        path: string
        files: { size: number }[]
      }
      if (corruption === "version") data.version = "0.5.0"
      if (corruption === "path") data.path = "https://example.test/installer.exe"
      if (corruption === "size") data.files[0].size += 1
      await Bun.write(join(dir, "latest.yml"), Bun.YAML.stringify(data))
      if (corruption !== "missing-sha") {
        const { readdir } = await import("node:fs/promises")
        const names = (await readdir(dir)).filter((name) => name !== "SHA256SUMS.txt")
        await Bun.write(
          join(dir, "SHA256SUMS.txt"),
          (
            await Promise.all(
              names.map(
                async (name) =>
                  `${new Bun.CryptoHasher("sha256").update(await Bun.file(join(dir, name)).bytes()).digest("hex")}  ${name}\n`,
              ),
            )
          ).join(""),
        )
      }
      await expect(new Feed(m.store, [publicKey]).publish(dir, "0.4.0", 100, "0.3.9", key)).rejects.toThrow()
      expect(m.events).toHaveLength(0)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  }
})

test("invalid rollout, version minimum and channel cannot write; promotion refuses missing source or existing stable version", async () => {
  const dir = await fixture()
  const m = memory()
  const feed = new Feed(m.store, [publicKey])
  try {
    await expect(feed.publish(dir, "0.4.0", -1, "0.3.9", key)).rejects.toThrow()
    await expect(feed.publish(dir, "0.4.0", 101, "0.3.9", key)).rejects.toThrow()
    await expect(feed.publish(dir, "0.4.0", 5.5, "0.3.9", key)).rejects.toThrow()
    await expect(feed.publish(dir, "0.4.0", 100, "0.5.0", key)).rejects.toThrow()
    await expect(feed.stage("invalid", 0, key)).rejects.toThrow()
    await expect(feed.promote("0.4.0", undefined, key)).rejects.toThrow()
    expect(m.events).toHaveLength(0)
    await feed.publish(dir, "0.4.0", 50, "0.3.9", key)
    await feed.promote("0.4.0", 15, key)
    expect((await feed.status("stable")).stagingPercentage).toBe(15)
    const count = m.events.length
    await expect(feed.promote("0.4.0", undefined, key)).rejects.toThrow("already exists")
    expect(m.events).toHaveLength(count)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
