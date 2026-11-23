import { describe, expect, test } from "bun:test"
import { generateKeyPairSync, sign } from "node:crypto"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { UpdateNotifier } from "../src/update-notifier"

// Loginom AI Agent (B2.7d): the cases of 0.4 `test/cli/update-notifier.test.ts` (`v0.4.0:packages/opencode`). The feed is
// a local server; every request goes through `request`, which records it and refuses any host but the local one, so a
// notifier that asked another feed (opencode.ai) fails here without leaving the machine.
const source = path.resolve(import.meta.dir, "../src/update-notifier.ts")
const primary = generateKeyPairSync("ed25519")
const backup = generateKeyPairSync("ed25519")
const publicKeys = [primary, backup].map((key) => key.publicKey.export({ type: "spki", format: "pem" }).toString())
const manifest = {
  version: "0.4.0",
  minSupportedVersion: "0.3.0",
  downloads: {
    "linux-x64": { url: "0.4.0/cli-linux.tar.gz", sha256: "ab".repeat(32) },
    "win32-x64": { url: "0.4.0/cli-windows.zip", sha256: "cd".repeat(32) },
    "darwin-arm64": { url: "0.4.0/cli-mac.tar.gz", sha256: "ef".repeat(32) },
  },
}

async function fixture(
  options: { value?: unknown; key?: typeof primary; invalid?: boolean; tamper?: boolean; status?: number } = {},
) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "loginom-update-notifier-"))
  const requests: string[] = []
  const asked: string[] = []
  const output: string[] = []
  const bytes = JSON.stringify(options.value ?? manifest, null, 2) + "\n"
  const signature = sign(null, Buffer.from(bytes), (options.key ?? primary).privateKey).toString("base64")
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request) {
      const route = new URL(request.url).pathname
      requests.push(route)
      if (options.status) return new Response(null, { status: options.status })
      return new Response(
        route.endsWith(".sig") ? (options.invalid ? "bad signature" : signature) : bytes + (options.tamper ? " " : ""),
      )
    },
  })
  const input = {
    data: path.join(root, "data"),
    config: path.join(root, "config"),
    policyFile: path.join(root, "policy.json"),
    feed: `${server.url}feed/`.replace(/^http:/, "https:"),
    current: "0.3.9",
    platform: "linux" as NodeJS.Platform,
    arch: "x64",
    env: {},
    isTTY: true,
    publicKeys,
    // Test HTTPS URL validation independently of TLS trust using a local HTTP fixture transport.
    request: (url: URL, init: RequestInit) => {
      asked.push(url.href)
      if (url.hostname !== "127.0.0.1") return Promise.reject(new Error(`unexpected host: ${url.href}`))
      return fetch(url.href.replace(/^https:/, "http:"), init)
    },
    write: (text: string) => {
      output.push(text)
    },
  }
  await fs.mkdir(input.data)
  await fs.mkdir(input.config)
  return {
    input,
    requests,
    asked,
    output,
    async [Symbol.asyncDispose]() {
      await server.stop(true)
      await fs.rm(root, { recursive: true, force: true })
    },
  }
}

// Runs the notifier in its own Bun process, with `defines` applied by the runtime transpiler as the build applies them.
async function child(
  input: Record<string, unknown>,
  host: string,
  options: { defines?: Record<string, string>; env?: Record<string, string> } = {},
) {
  const process_ = Bun.spawn(
    [
      process.execPath,
      ...Object.entries(options.defines ?? {}).flatMap(([name, value]) => [
        "--define",
        `${name}=${JSON.stringify(value)}`,
      ]),
      "--eval",
      `
      import { UpdateNotifier } from ${JSON.stringify(source)};
      await UpdateNotifier.notify({ ...${JSON.stringify(input)},
        request: (url, init) => url.hostname === ${JSON.stringify(host)}
          ? fetch(url.href.replace(/^https:/, 'http:'), init)
          : Promise.reject(new Error('unexpected host: ' + url.href)),
      });
    `,
    ],
    { env: { ...process.env, ...options.env }, stdout: "pipe", stderr: "pipe" },
  )
  const [code, stdout, stderr] = await Promise.all([
    process_.exited,
    new Response(process_.stdout).text(),
    new Response(process_.stderr).text(),
  ])
  return { code, stdout, stderr }
}

describe("signed CLI update notifier", () => {
  test("rejects HTTP feed before requests or timestamp writes", async () => {
    await using f = await fixture()
    await UpdateNotifier.notify({ ...f.input, feed: f.input.feed.replace(/^https:/, "http:") })
    expect(f.requests).toEqual([])
    expect(f.output).toEqual([])
    expect(await fs.readdir(f.input.data)).toEqual([])
  })

  test("rejects HTTP download even with a valid signature", async () => {
    await using f = await fixture({
      value: {
        ...manifest,
        downloads: {
          "linux-x64": { url: "http://downloads.example.invalid/cli.tar.gz", sha256: "ab".repeat(32) },
        },
      },
    })
    await UpdateNotifier.notify(f.input)
    expect(f.requests).toHaveLength(2)
    expect(f.output).toEqual([])
  })

  test("new release produces exactly one line with the platform download, asking only the product feed", async () => {
    await using f = await fixture()
    await UpdateNotifier.notify(f.input)
    expect(f.requests.toSorted()).toEqual(["/feed/stable/cli.json", "/feed/stable/cli.json.sig"])
    expect(f.asked.toSorted()).toEqual([`${f.input.feed}stable/cli.json`, `${f.input.feed}stable/cli.json.sig`])
    expect(f.output).toEqual([`Доступна версия 0.4.0 — скачать: ${f.input.feed}stable/0.4.0/cli-linux.tar.gz\n`])
  })

  for (const current of ["0.4.0", "0.5.0"]) {
    test(`no notice when current is ${current}`, async () => {
      await using f = await fixture()
      await UpdateNotifier.notify({ ...f.input, current })
      expect(f.output).toEqual([])
    })
  }

  test("a source build (version local) asks nothing", async () => {
    await using f = await fixture()
    await UpdateNotifier.notify({ ...f.input, current: "local" })
    expect(f.asked).toEqual([])
    expect(f.output).toEqual([])
  })

  test("updates can cross major versions", async () => {
    await using f = await fixture({ value: { ...manifest, version: "1.0.0" } })
    await UpdateNotifier.notify(f.input)
    expect(f.output[0]).toContain("Доступна версия 1.0.0")
  })

  test("versions compare by number, not by text", async () => {
    await using f = await fixture({ value: { ...manifest, version: "0.10.0" } })
    await UpdateNotifier.notify(f.input)
    expect(f.output[0]).toContain("Доступна версия 0.10.0")
  })

  test("unsupported release has a prominent warning on the same line", async () => {
    await using f = await fixture()
    await UpdateNotifier.notify({ ...f.input, current: "0.2.9" })
    expect(f.output).toHaveLength(1)
    expect(f.output[0]).toStartWith("ВНИМАНИЕ: Эта версия больше не поддерживается сервером — обновитесь.")
    expect(f.output[0].trim().split("\n")).toHaveLength(1)
  })

  test("accepts the backup key", async () => {
    await using f = await fixture({ key: backup })
    await UpdateNotifier.notify(f.input)
    expect(f.output).toHaveLength(1)
  })

  test("rejects a signature from an unknown key", async () => {
    await using f = await fixture({ key: generateKeyPairSync("ed25519") })
    await UpdateNotifier.notify(f.input)
    expect(f.output).toEqual([])
  })

  test("trusts only the product keys by default", async () => {
    await using f = await fixture()
    const { publicKeys, ...input } = f.input
    await UpdateNotifier.notify(input)
    expect(f.requests).toHaveLength(2)
    expect(f.output).toEqual([])
  })

  test("rejects malformed signature", async () => {
    await using f = await fixture({ invalid: true })
    await UpdateNotifier.notify(f.input)
    expect(f.output).toEqual([])
  })

  test("verifies exact bytes, including insignificant JSON whitespace", async () => {
    await using f = await fixture({ tamper: true })
    await UpdateNotifier.notify(f.input)
    expect(f.output).toEqual([])
  })

  test("a damaged timestamp does not permanently disable checks", async () => {
    await using f = await fixture()
    await Bun.write(path.join(f.input.data, "update-notifier.json"), "{")
    await UpdateNotifier.notify(f.input)
    expect(f.output).toHaveLength(1)
  })

  test("build-time feed and version are used without runtime overrides", async () => {
    await using f = await fixture()
    const { feed, current, request, write, ...input } = f.input
    const result = await child(input, "127.0.0.1", {
      defines: { LOGINOM_AI_AGENT_UPDATE_FEED: feed, LOGINOM_AI_AGENT_VERSION: "0.3.9" },
    })
    expect(result).toEqual({
      code: 0,
      stdout: "",
      stderr: `Доступна версия 0.4.0 — скачать: ${feed}stable/0.4.0/cli-linux.tar.gz\n`,
    })
    expect(f.requests).toHaveLength(2)
  })

  test("fixture transport respects proxy environment without querying the feed host directly", async () => {
    await using f = await fixture()
    const { request, write, ...input } = f.input
    const proxy = new URL(f.input.feed).origin.replace(/^https:/, "http:")
    const result = await child({ ...input, feed: "https://updates.example.invalid/feed/" }, "updates.example.invalid", {
      env: {
        HTTP_PROXY: proxy,
        http_proxy: proxy,
        HTTPS_PROXY: proxy,
        https_proxy: proxy,
        NO_PROXY: "",
        no_proxy: "",
      },
    })
    expect(result).toEqual({
      code: 0,
      stdout: "",
      stderr: "Доступна версия 0.4.0 — скачать: https://updates.example.invalid/feed/stable/0.4.0/cli-linux.tar.gz\n",
    })
    expect(f.requests).toHaveLength(2)
  })

  test("checks at most daily, including failed checks", async () => {
    await using f = await fixture({ invalid: true })
    const now = 1_800_000_000_000
    await UpdateNotifier.notify({ ...f.input, now })
    await UpdateNotifier.notify({ ...f.input, now: now + 86_400_000 - 1 })
    expect(f.requests).toHaveLength(2)
    await UpdateNotifier.notify({ ...f.input, now: now + 86_400_000 })
    expect(f.requests).toHaveLength(4)
    expect(await fs.readdir(f.input.data)).toEqual(["update-notifier.json"])
  })

  for (const override of [
    { isTTY: false },
    { feed: "" },
    { env: { CI: "true" } },
    { env: { CONTINUOUS_INTEGRATION: "1" } },
    { env: { GITHUB_ACTIONS: "true" } },
    { env: { TF_BUILD: "True" } },
    { env: { LOGINOM_AI_AGENT_NO_UPDATE_NOTIFIER: "1" } },
  ]) {
    test(`disabled without network or data writes: ${JSON.stringify(override)}`, async () => {
      await using f = await fixture()
      await UpdateNotifier.notify({ ...f.input, ...override })
      expect(f.asked).toEqual([])
      expect(f.output).toEqual([])
      expect(await fs.readdir(f.input.data)).toEqual([])
    })
  }

  test("a build without a product feed asks nobody, whatever the environment says", async () => {
    await using f = await fixture()
    const { feed, ...input } = f.input
    await UpdateNotifier.notify({ ...input, env: { LOGINOM_AI_AGENT_UPDATE_FEED: feed } })
    expect(f.asked).toEqual([])
    expect(f.output).toEqual([])
    expect(await fs.readdir(f.input.data)).toEqual([])
  })

  test("machine policy off overrides the CLI config", async () => {
    await using f = await fixture()
    await Bun.write(f.input.policyFile, JSON.stringify({ updates: "off", channel: "unstable" }))
    await Bun.write(path.join(f.input.config, "updates.json"), JSON.stringify({ channel: "stable" }))
    await UpdateNotifier.notify(f.input)
    expect(f.asked).toEqual([])
    expect(f.output).toEqual([])
    expect(await fs.readdir(f.input.data)).toEqual([])
  })

  test("policy channel overrides CLI channel", async () => {
    await using f = await fixture()
    await Bun.write(f.input.policyFile, JSON.stringify({ channel: "unstable" }))
    await Bun.write(path.join(f.input.config, "updates.json"), JSON.stringify({ channel: "stable" }))
    await UpdateNotifier.notify(f.input)
    expect(f.requests).toContain("/feed/unstable/cli.json")
    expect(f.output[0]).toContain("/feed/unstable/0.4.0/")
  })

  test("CLI channel is used when policy does not select one", async () => {
    await using f = await fixture()
    await Bun.write(path.join(f.input.config, "updates.json"), JSON.stringify({ channel: "unstable" }))
    await UpdateNotifier.notify(f.input)
    expect(f.requests).toContain("/feed/unstable/cli.json")
  })

  for (const [platform, arch, filename] of [
    ["win32", "x64", "cli-windows.zip"],
    ["darwin", "arm64", "cli-mac.tar.gz"],
  ] as const) {
    test(`selects ${platform}-${arch} download`, async () => {
      await using f = await fixture()
      await UpdateNotifier.notify({ ...f.input, platform, arch })
      expect(f.output[0]).toContain(filename)
    })
  }

  for (const value of [
    "not json",
    { ...manifest, version: "0.4.0-beta.1" },
    { ...manifest, minSupportedVersion: "9.0.0" },
    { ...manifest, version: "9007199254740992.0.0" },
    { ...manifest, downloads: { "linux-x64": { url: "javascript:alert(1)", sha256: "ab".repeat(32) } } },
    { ...manifest, downloads: { "linux-x64": { url: "0.4.0/cli.tar.gz", sha256: "invalid" } } },
  ]) {
    test(`invalid signed manifest is silent: ${JSON.stringify(value)}`, async () => {
      await using f = await fixture({ value })
      await UpdateNotifier.notify(f.input)
      expect(f.output).toEqual([])
    })
  }

  test("HTTP failure is silent", async () => {
    await using f = await fixture({ status: 503 })
    await UpdateNotifier.notify(f.input)
    expect(f.output).toEqual([])
  })

  test("a stalled body is bounded by the overall timeout", async () => {
    await using f = await fixture()
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([123]))
            },
          }),
        ),
    })
    try {
      const start = Date.now()
      await UpdateNotifier.notify({ ...f.input, feed: server.url.toString().replace(/^http:/, "https:"), timeout: 100 })
      expect(Date.now() - start).toBeLessThan(1500)
      expect(f.output).toEqual([])
    } finally {
      await server.stop(true)
    }
  })

  test("an already aborted invocation does not start a check", async () => {
    await using f = await fixture()
    await UpdateNotifier.notify({ ...f.input, signal: AbortSignal.abort() })
    expect(f.asked).toEqual([])
    expect(f.output).toEqual([])
  })

  test("an abort cancels an active request without waiting for the timeout", async () => {
    await using f = await fixture()
    const received = Promise.withResolvers<void>()
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch() {
        received.resolve()
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new Uint8Array([123]))
            },
          }),
        )
      },
    })
    const controller = new AbortController()
    try {
      const pending = UpdateNotifier.notify({
        ...f.input,
        feed: server.url.toString().replace(/^http:/, "https:"),
        signal: controller.signal,
        timeout: 5000,
      })
      await received.promise
      const start = Date.now()
      controller.abort()
      await pending
      expect(Date.now() - start).toBeLessThan(1000)
      expect(f.output).toEqual([])
    } finally {
      controller.abort()
      await server.stop(true)
    }
  })
})

test("machine policy paths match Desktop locations", () => {
  expect(UpdateNotifier.policyPath("linux", {})).toBe("/etc/loginom-ai-agent/policy.json")
  expect(UpdateNotifier.policyPath("darwin", {})).toBe("/Library/Application Support/Loginom AI Agent/policy.json")
  expect(UpdateNotifier.policyPath("win32", { ProgramData: "D:\\ProgramData" })).toBe(
    "D:\\ProgramData\\Loginom AI Agent\\policy.json",
  )
})
