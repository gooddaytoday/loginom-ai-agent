#!/usr/bin/env bun
import { createPrivateKey, sign } from "node:crypto"
import { mkdtemp, readdir, rm, stat, lstat } from "node:fs/promises"
import { homedir, tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { parseArgs } from "node:util"
import { createReadStream } from "node:fs"
import { S3Client, GetObjectCommand, PutObjectCommand, HeadObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3"
import { FetchHttpHandler } from "@smithy/fetch-http-handler"
import { UPDATE_PUBLIC_KEYS, verifyUpdateSignature } from "../packages/product/src/update-signature"

const metadataNames = ["latest.yml", "latest-mac.yml", "latest-linux.yml", "cli.json"] as const
const immutable = "public, max-age=31536000, immutable"
const decoder = new TextDecoder()
type MetadataName = (typeof metadataNames)[number]
type Desktop = {
  version: string
  minSupportedVersion: string
  stagingPercentage: number
  path: string
  sha512: string
  files: { url: string; sha512: string; size: number }[]
  [key: string]: unknown
}
type Cli = { version: string; minSupportedVersion: string; downloads: Record<string, { url: string; sha256: string }> }
export type Store = {
  get(name: string): Promise<Uint8Array>
  put(name: string, bytes: Uint8Array | Blob, cache: string): Promise<void>
  head(name: string): Promise<{ size: number; cache: string } | undefined>
  copy(from: string, to: string): Promise<void>
}

export function validateVersion(version: string) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw Error("Expected version X.Y.Z without suffix")
  return version
}
function percent(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 100) throw Error("Staging must be an integer from 0 to 100")
  return value
}
function channel(value: string) {
  if (value !== "stable" && value !== "unstable") throw Error("Channel must be stable or unstable")
  return value
}
function asset(name: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === "." || name === "..") throw Error("Unsafe asset name")
  return name
}
function relative(url: string, version: string) {
  if (!url.startsWith(`${version}/`)) throw Error("Expected version-relative URL")
  return asset(url.slice(version.length + 1))
}
async function digest(file: string, algorithm: "sha256" | "sha512", encoding: "hex" | "base64") {
  const hash = new Bun.CryptoHasher(algorithm)
  for await (const bytes of createReadStream(file)) hash.update(bytes)
  return hash.digest(encoding)
}
function checksums(text: string) {
  const entries = text
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const match = /^([a-f0-9]{64})  (.+)$/.exec(line)
      if (!match) throw Error("Malformed SHA256SUMS.txt")
      return [asset(match[2]), match[1]] as const
    })
  if (new Set(entries.map(([name]) => name)).size !== entries.length) throw Error("Duplicate checksum entry")
  if (entries.some(([name]) => name === "SHA256SUMS.txt")) throw Error("Checksum manifest cannot include itself")
  return new Map(entries)
}
export async function checkRelease(dir: string) {
  const sums = checksums(await Bun.file(join(dir, "SHA256SUMS.txt")).text())
  const names = await readdir(dir)
  if (names.some((name) => name !== "SHA256SUMS.txt" && !sums.has(name)))
    throw Error("Asset missing from SHA256SUMS.txt")
  for (const [name, hash] of sums) {
    if (!(await lstat(join(dir, name))).isFile() || (await digest(join(dir, name), "sha256", "hex")) !== hash)
      throw Error(`SHA256 mismatch: ${name}`)
  }
  return sums
}
function minimum(version: string, min: string) {
  validateVersion(version)
  validateVersion(min)
  const a = version.split(".").map(Number)
  const b = min.split(".").map(Number)
  const first = a.findIndex((n, i) => n !== b[i])
  if (first >= 0 && a[first] < b[first]) throw Error("Minimum supported version exceeds release version")
  return min
}
function signed(bytes: Uint8Array, pem: string, keys: readonly string[]) {
  const key = createPrivateKey(pem)
  if (key.asymmetricKeyType !== "ed25519") throw Error("Expected Ed25519 private key")
  const signature = sign(null, bytes, key).toString("base64")
  if (!verifyUpdateSignature(bytes, signature, keys)) throw Error("Signing key is not trusted")
  return new TextEncoder().encode(signature + "\n")
}

export class Feed {
  constructor(
    private store: Store,
    private keys: readonly string[] = UPDATE_PUBLIC_KEYS,
  ) {}

  async publish(dir: string, version: string, staging: number, min: string, key: string) {
    minimum(version, min)
    percent(staging)
    const sums = await checkRelease(dir)
    const documents = new Map<MetadataName, Uint8Array>()
    for (const name of metadataNames.filter((name) => name !== "cli.json")) {
      const data = Bun.YAML.parse(await Bun.file(join(dir, name)).text()) as Desktop
      if (data.version !== version || !Array.isArray(data.files) || !data.files.length)
        throw Error(`Invalid metadata: ${name}`)
      for (const file of data.files) {
        asset(file.url)
        if (!sums.has(file.url) || (/\.(exe|zip|AppImage)$/.test(file.url) && !sums.has(`${file.url}.blockmap`)))
          throw Error(`Missing binary/blockmap: ${name}`)
        if (
          file.sha512 !== (await digest(join(dir, file.url), "sha512", "base64")) ||
          file.size !== (await stat(join(dir, file.url))).size
        )
          throw Error(`Metadata hash/size mismatch: ${name}`)
      }
      if (!data.files.some((file) => file.url === data.path && file.sha512 === data.sha512))
        throw Error(`Invalid legacy path/hash: ${name}`)
      documents.set(
        name,
        new TextEncoder().encode(
          Bun.YAML.stringify({
            ...data,
            version,
            minSupportedVersion: min,
            stagingPercentage: staging,
            path: `${version}/${asset(data.path)}`,
            files: data.files.map((file) => ({ ...file, url: `${version}/${asset(file.url)}` })),
          }),
        ),
      )
    }
    const downloads = Object.fromEntries(
      ["linux-x64", "win32-x64", "darwin-arm64"].map((target) => {
        const name = `loginom-ai-agent-cli-${version}-${target}.${target === "win32-x64" ? "zip" : "tar.gz"}`
        const sha256 = sums.get(name)
        if (!sha256) throw Error(`Missing CLI archive: ${target}`)
        return [target, { url: `${version}/${name}`, sha256 }]
      }),
    )
    documents.set(
      "cli.json",
      new TextEncoder().encode(JSON.stringify({ version, minSupportedVersion: min, downloads }, null, 2) + "\n"),
    )
    // Validate the signing key and every input before performing the first write.
    for (const bytes of documents.values()) signed(bytes, key, this.keys)
    for (const name of [...sums.keys(), "SHA256SUMS.txt"])
      if (await this.store.head(`unstable/${version}/${name}`))
        throw Error("Version already exists; immutable releases cannot be overwritten")
    for (const name of [...sums.keys(), "SHA256SUMS.txt"])
      await this.store.put(`unstable/${version}/${name}`, Bun.file(join(dir, name)), immutable)
    await this.write("unstable", documents, key)
    return this.status("unstable")
  }

  async promote(version: string, staging: number | undefined, key: string) {
    validateVersion(version)
    if (staging !== undefined) percent(staging)
    const current = await this.status("unstable")
    if (current.version !== version) throw Error("Requested version must be the current signed unstable release")
    const documents = await this.read("unstable")
    const updated = this.withStaging(documents, staging ?? current.stagingPercentage)
    for (const bytes of updated.values()) signed(bytes, key, this.keys)
    const sums = checksums(decoder.decode(await this.store.get(`unstable/${version}/SHA256SUMS.txt`)))
    for (const name of [...sums.keys(), "SHA256SUMS.txt"])
      if (await this.store.head(`stable/${version}/${name}`))
        throw Error("Stable version already exists; use stage for rollout changes")
    for (const name of [...sums.keys(), "SHA256SUMS.txt"])
      await this.store.copy(`unstable/${version}/${name}`, `stable/${version}/${name}`)
    await this.write("stable", updated, key)
    return this.status("stable")
  }

  async stage(target: string, staging: number, key: string) {
    channel(target)
    percent(staging)
    await this.status(target)
    await this.write(target, this.withStaging(await this.read(target), staging), key)
    return this.status(target)
  }

  private withStaging(documents: Map<MetadataName, Uint8Array>, staging: number) {
    return new Map(
      [...documents].map(([name, bytes]) => [
        name,
        name === "cli.json"
          ? bytes
          : new TextEncoder().encode(
              Bun.YAML.stringify({
                ...(Bun.YAML.parse(decoder.decode(bytes)) as Desktop),
                stagingPercentage: percent(staging),
              }),
            ),
      ]),
    )
  }

  private async read(target: string) {
    const documents = new Map<MetadataName, Uint8Array>()
    for (const name of metadataNames) {
      const bytes = await this.store.get(`${target}/${name}`)
      const signature = decoder.decode(await this.store.get(`${target}/${name}.sig`))
      if (!verifyUpdateSignature(bytes, signature, this.keys)) throw Error(`Invalid signature: ${name}`)
      documents.set(name, bytes)
    }
    return documents
  }

  private async write(target: string, documents: Map<MetadataName, Uint8Array>, key: string) {
    const signatures = new Map([...documents].map(([name, bytes]) => [name, signed(bytes, key, this.keys)]))
    for (const [name, bytes] of documents) {
      await this.store.put(`${target}/${name}`, bytes, "no-cache")
      await this.store.put(`${target}/${name}.sig`, signatures.get(name)!, "no-cache")
    }
  }

  async status(target: string) {
    channel(target)
    const documents = await this.read(target)
    const desktop = metadataNames
      .filter((name) => name !== "cli.json")
      .map((name) => Bun.YAML.parse(decoder.decode(documents.get(name)!)) as Desktop)
    const cli = JSON.parse(decoder.decode(documents.get("cli.json")!)) as Cli
    const version = validateVersion(cli.version)
    minimum(version, cli.minSupportedVersion)
    for (const data of desktop) {
      if (
        data.version !== version ||
        data.minSupportedVersion !== cli.minSupportedVersion ||
        data.stagingPercentage !== desktop[0].stagingPercentage
      )
        throw Error("Channel metadata disagrees")
      percent(data.stagingPercentage)
      relative(data.path, version)
      if (!data.files.length || !data.files.some((file) => file.url === data.path && file.sha512 === data.sha512))
        throw Error("Invalid desktop metadata")
    }
    const sums = checksums(decoder.decode(await this.store.get(`${target}/${version}/SHA256SUMS.txt`)))
    for (const name of documents.keys()) {
      if (!(await this.store.head(`${target}/${name}`)) || !(await this.store.head(`${target}/${name}.sig`)))
        throw Error("Missing metadata")
    }
    for (const name of [...sums.keys(), "SHA256SUMS.txt"]) {
      const info = await this.store.head(`${target}/${version}/${name}`)
      if (!info) throw Error(`Missing ${name}`)
      if (info.cache !== immutable) throw Error(`Invalid immutable cache policy: ${name}`)
    }
    for (const data of desktop)
      for (const file of data.files) {
        const name = relative(file.url, version)
        const info = await this.store.head(`${target}/${file.url}`)
        if (
          !sums.has(name) ||
          (/\.(exe|zip|AppImage)$/.test(name) && !sums.has(`${name}.blockmap`)) ||
          !info ||
          info.size !== file.size
        )
          throw Error(`Missing/invalid desktop file: ${name}`)
      }
    if (Object.keys(cli.downloads).sort().join() !== ["darwin-arm64", "linux-x64", "win32-x64"].join())
      throw Error("Incomplete CLI platforms")
    for (const file of Object.values(cli.downloads))
      if (sums.get(relative(file.url, version)) !== file.sha256) throw Error("CLI checksum mismatch")
    for (const name of metadataNames)
      for (const suffix of ["", ".sig"]) {
        if ((await this.store.head(`${target}/${name}${suffix}`))?.cache !== "no-cache")
          throw Error("Invalid metadata cache policy")
      }
    return {
      status: "PASS",
      channel: target,
      version,
      minSupportedVersion: cli.minSupportedVersion,
      stagingPercentage: desktop[0].stagingPercentage,
      signatures: documents.size,
      files: sums.size + 1,
    }
  }
}

export async function s3Store(configFile: string, feedBase: string): Promise<Store> {
  const config = (await Bun.file(configFile).json()) as {
    endpoint: string
    bucket: string
    access_key: string
    secret_key: string
  }
  const base = new URL(feedBase)
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash)
    throw Error("Feed base must be a clean HTTPS URL")
  const path = base.pathname.replace(/^\/+|\/+$/g, "")
  const prefix =
    path === config.bucket ? "" : path.startsWith(`${config.bucket}/`) ? path.slice(config.bucket.length + 1) : path
  if (prefix.split("/").some((part) => part === "." || part === ".." || /%|\\/.test(part)))
    throw Error("Invalid feed prefix")
  const key = (name: string) => [prefix, name].filter(Boolean).join("/")
  const client = new S3Client({
    endpoint: config.endpoint,
    region: "ru-1",
    requestHandler: new FetchHttpHandler({
      requestInit: (request) => ({ signal: AbortSignal.timeout(request.method === "PUT" ? 15 * 60_000 : 15_000) }),
    }),
    maxAttempts: 2,
    forcePathStyle: true,
    credentials: { accessKeyId: config.access_key, secretAccessKey: config.secret_key },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  })
  return {
    async get(name) {
      const result = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key(name) }))
      if (!result.Body) throw Error("Empty S3 body")
      return result.Body.transformToByteArray()
    },
    async head(name) {
      try {
        const result = await client.send(new HeadObjectCommand({ Bucket: config.bucket, Key: key(name) }))
        return { size: result.ContentLength ?? 0, cache: result.CacheControl ?? "" }
      } catch (error) {
        if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return undefined
        throw Error("S3 HEAD failed")
      }
    },
    async put(name, bytes, cache) {
      await client.send(
        new PutObjectCommand({
          Bucket: config.bucket,
          Key: key(name),
          Body: bytes,
          ContentLength: bytes instanceof Blob ? bytes.size : bytes.byteLength,
          CacheControl: cache,
          ContentType: name.endsWith(".yml")
            ? "application/yaml"
            : name.endsWith(".json")
              ? "application/json"
              : "application/octet-stream",
        }),
      )
    },
    async copy(from, to) {
      await client.send(
        new CopyObjectCommand({
          Bucket: config.bucket,
          Key: key(to),
          CopySource: `${config.bucket}/${key(from).split("/").map(encodeURIComponent).join("/")}`,
          MetadataDirective: "COPY",
        }),
      )
    },
  }
}

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    allowPositionals: true,
    strict: true,
    options: {
      channel: { type: "string" },
      version: { type: "string" },
      "from-release": { type: "string" },
      staging: { type: "string" },
      "min-supported": { type: "string" },
      key: { type: "string" },
      to: { type: "string" },
      percent: { type: "string" },
      "feed-base": { type: "string" },
      config: { type: "string" },
      "public-key": { type: "string", multiple: true },
      assets: { type: "string" },
      help: { type: "boolean" },
    },
  })
  if (values.help) {
    console.log(
      "update-feed.ts publish --channel unstable --version X.Y.Z --from-release vX.Y.Z --key <file> [--staging 100] [--min-supported X.Y.Z]\npromote --to stable --version X.Y.Z --key <file> [--staging N]\nstage --channel stable|unstable --percent N --key <file>\nstatus --channel stable|unstable\nCommon: --feed-base HTTPS_URL (or LOGINOM_AI_AGENT_UPDATE_FEED), --config <S3 credentials file>, --public-key <test PEM> (repeatable). publish: --assets <checked local release directory> instead of --from-release.",
    )
    return
  }
  const command = positionals[0]
  if (positionals.length !== 1 || !["publish", "promote", "stage", "status"].includes(command))
    throw Error("Expected publish, promote, stage or status; see --help")
  const base = values["feed-base"] ?? process.env.LOGINOM_AI_AGENT_UPDATE_FEED
  if (!base) throw Error("Set --feed-base or LOGINOM_AI_AGENT_UPDATE_FEED")
  const keys = values["public-key"]
    ? await Promise.all(values["public-key"].map((file) => Bun.file(resolve(file)).text()))
    : UPDATE_PUBLIC_KEYS
  const feed = new Feed(
    await s3Store(values.config ?? join(homedir(), ".config/loginom-ai-agent/updates-s3.json"), base),
    keys,
  )
  if (command === "status") return console.log(JSON.stringify(await feed.status(channel(values.channel ?? ""))))
  if (!values.key) throw Error("Signing requires --key <Ed25519 PEM file>")
  const key = await Bun.file(resolve(values.key)).text()
  if (command === "stage") {
    if (values.percent === undefined || !values.percent.trim()) throw Error("stage requires --percent N")
    return console.log(
      JSON.stringify(await feed.stage(channel(values.channel ?? ""), percent(Number(values.percent)), key)),
    )
  }
  const version = validateVersion(values.version ?? "")
  const staging = values.staging === undefined ? undefined : percent(Number(values.staging))
  if (command === "promote") {
    if (values.to !== "stable") throw Error("promote requires --to stable")
    return console.log(JSON.stringify(await feed.promote(version, staging, key)))
  }
  if (values.channel !== "unstable") throw Error("New releases must publish to unstable")
  const min = minimum(version, values["min-supported"] ?? version)
  if (Boolean(values.assets) === Boolean(values["from-release"]))
    throw Error("Specify exactly one of --from-release or --assets")
  if (values["from-release"] && values["from-release"] !== `v${version}`)
    throw Error("Release tag must match --version")
  const dir = values.assets ? resolve(values.assets) : await mkdtemp(join(tmpdir(), "loginom-update-"))
  try {
    if (!values.assets) {
      const result = Bun.spawn(
        ["gh", "release", "download", values["from-release"]!, "--repo", "gooddaytoday/loginom-ai-agent", "--dir", dir],
        { stdout: "ignore", stderr: "ignore" },
      )
      if ((await result.exited) !== 0) throw Error("GitHub release download failed")
    }
    console.log(JSON.stringify(await feed.publish(dir, version, staging ?? 100, min, key)))
  } finally {
    if (!values.assets) await rm(dir, { recursive: true, force: true })
  }
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    // Never dump SDK/crypto exceptions: they may contain credentials or key material.
    console.error(
      error instanceof Error && error.message.startsWith("S3 ")
        ? error.message
        : "Update feed command failed: " +
            (error instanceof Error && !/key|secret|credential|PEM|DECODER|ASN1|SSL/i.test(error.message)
              ? error.message
              : "check inputs, signing key and S3 credentials"),
    )
    process.exitCode = 1
  }
}
