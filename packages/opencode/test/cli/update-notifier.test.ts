import { describe, expect, test } from "bun:test"
import { generateKeyPairSync, sign } from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { notifyUpdate, updatePolicyPath } from "../../src/cli/update-notifier"
import { tmpdir } from "../fixture/fixture"

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
  const tmp = await tmpdir()
  const requests: string[] = []
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
    data: path.join(tmp.path, "data"),
    config: path.join(tmp.path, "config"),
    policyFile: path.join(tmp.path, "policy.json"),
    feed: `${server.url}feed/`,
    current: "0.3.9",
    platform: "linux" as NodeJS.Platform,
    arch: "x64",
    env: {},
    isTTY: true,
    publicKeys,
    write: (text: string) => {
      output.push(text)
    },
  }
  await fs.mkdir(input.data)
  await fs.mkdir(input.config)
  return {
    input,
    requests,
    output,
    async [Symbol.asyncDispose]() {
      await server.stop(true)
      await tmp[Symbol.asyncDispose]()
    },
  }
}

describe("signed CLI update notifier", () => {
  test("new release produces exactly one line with the platform download", async () => {
    await using f = await fixture()
    await notifyUpdate(f.input)
    expect(f.requests.toSorted()).toEqual(["/feed/stable/cli.json", "/feed/stable/cli.json.sig"])
    expect(f.output).toEqual([`Доступна версия 0.4.0 — скачать: ${f.input.feed}stable/0.4.0/cli-linux.tar.gz\n`])
  })

  for (const current of ["0.4.0", "0.5.0"]) {
    test(`no notice when current is ${current}`, async () => {
      await using f = await fixture()
      await notifyUpdate({ ...f.input, current })
      expect(f.output).toEqual([])
    })
  }

  test("updates can cross major versions", async () => {
    await using f = await fixture({ value: { ...manifest, version: "1.0.0" } })
    await notifyUpdate(f.input)
    expect(f.output[0]).toContain("Доступна версия 1.0.0")
  })

  test("unsupported release has a prominent warning on the same line", async () => {
    await using f = await fixture()
    await notifyUpdate({ ...f.input, current: "0.2.9" })
    expect(f.output).toHaveLength(1)
    expect(f.output[0]).toStartWith("ВНИМАНИЕ: Эта версия больше не поддерживается сервером — обновитесь.")
    expect(f.output[0].trim().split("\n")).toHaveLength(1)
  })

  test("accepts the backup key", async () => {
    await using f = await fixture({ key: backup })
    await notifyUpdate(f.input)
    expect(f.output).toHaveLength(1)
  })

  test("rejects a signature from an unknown key", async () => {
    await using f = await fixture({ key: generateKeyPairSync("ed25519") })
    await notifyUpdate(f.input)
    expect(f.output).toEqual([])
  })

  test("rejects malformed signature", async () => {
    await using f = await fixture({ invalid: true })
    await notifyUpdate(f.input)
    expect(f.output).toEqual([])
  })

  test("verifies exact bytes, including insignificant JSON whitespace", async () => {
    await using f = await fixture({ tamper: true })
    await notifyUpdate(f.input)
    expect(f.output).toEqual([])
  })

  test("a damaged timestamp does not permanently disable checks", async () => {
    await using f = await fixture()
    await Bun.write(path.join(f.input.data, "update-notifier.json"), "{")
    await notifyUpdate(f.input)
    expect(f.output).toHaveLength(1)
  })

  test("build-time feed and version are used without runtime overrides", async () => {
    await using f = await fixture()
    const options = {
      entrypoints: [path.resolve(import.meta.dir, "../../src/cli/update-notifier.ts")],
      target: "bun",
      outdir: path.join(f.input.config, "compiled"),
      define: {
        LOGINOM_AI_AGENT_UPDATE_FEED: JSON.stringify(f.input.feed),
        LOGINOM_AI_AGENT_VERSION: JSON.stringify("0.3.9"),
      },
    }
    const { feed, current, ...input } = f.input
    // Building in its own process also exercises the build's constant substitution boundary.
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `
      const build = await Bun.build(${JSON.stringify(options)});
      if (!build.success) throw new AggregateError(build.logs);
      const compiled = await import(build.outputs[0].path);
      await compiled.notifyUpdate(${JSON.stringify(input)});
    `,
      ],
      { stdout: "pipe", stderr: "pipe" },
    )
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(stderr).toBe(`Доступна версия 0.4.0 — скачать: ${f.input.feed}stable/0.4.0/cli-linux.tar.gz\n`)
    expect(f.requests).toHaveLength(2)
  })

  test("fetch respects proxy environment without querying the feed host directly", async () => {
    await using f = await fixture()
    const child = Bun.spawn(
      [
        process.execPath,
        "--eval",
        `
      import { notifyUpdate } from ${JSON.stringify(path.resolve(import.meta.dir, "../../src/cli/update-notifier.ts"))};
      await notifyUpdate(${JSON.stringify({ ...f.input, feed: "http://updates.example.invalid/feed/" })});
    `,
      ],
      {
        env: {
          ...process.env,
          HTTP_PROXY: new URL(f.input.feed).origin,
          http_proxy: new URL(f.input.feed).origin,
          HTTPS_PROXY: new URL(f.input.feed).origin,
          https_proxy: new URL(f.input.feed).origin,
          NO_PROXY: "",
          no_proxy: "",
        },
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ])
    expect(code).toBe(0)
    expect(stdout).toBe("")
    expect(stderr).toBe(
      "Доступна версия 0.4.0 — скачать: http://updates.example.invalid/feed/stable/0.4.0/cli-linux.tar.gz\n",
    )
    expect(f.requests).toHaveLength(2)
  })

  test("checks at most daily, including failed checks", async () => {
    await using f = await fixture({ invalid: true })
    const now = 1_800_000_000_000
    await notifyUpdate({ ...f.input, now })
    await notifyUpdate({ ...f.input, now: now + 86_400_000 - 1 })
    expect(f.requests).toHaveLength(2)
    await notifyUpdate({ ...f.input, now: now + 86_400_000 })
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
      await notifyUpdate({ ...f.input, ...override })
      expect(f.requests).toEqual([])
      expect(f.output).toEqual([])
      expect(await fs.readdir(f.input.data)).toEqual([])
    })
  }

  test("runtime feed environment cannot enable a build without a feed", async () => {
    await using f = await fixture()
    const { feed, ...input } = f.input
    await notifyUpdate({ ...input, env: { LOGINOM_AI_AGENT_UPDATE_FEED: feed } })
    expect(f.requests).toEqual([])
    expect(f.output).toEqual([])
    expect(await fs.readdir(f.input.data)).toEqual([])
  })

  test("machine policy off overrides the CLI config", async () => {
    await using f = await fixture()
    await Bun.write(f.input.policyFile, JSON.stringify({ updates: "off", channel: "unstable" }))
    await Bun.write(path.join(f.input.config, "updates.json"), JSON.stringify({ channel: "stable" }))
    await notifyUpdate(f.input)
    expect(f.requests).toEqual([])
    expect(f.output).toEqual([])
    expect(await fs.readdir(f.input.data)).toEqual([])
  })

  test("policy channel overrides CLI channel", async () => {
    await using f = await fixture()
    await Bun.write(f.input.policyFile, JSON.stringify({ channel: "unstable" }))
    await Bun.write(path.join(f.input.config, "updates.json"), JSON.stringify({ channel: "stable" }))
    await notifyUpdate(f.input)
    expect(f.requests).toContain("/feed/unstable/cli.json")
    expect(f.output[0]).toContain("/feed/unstable/0.4.0/")
  })

  test("CLI channel is used when policy does not select one", async () => {
    await using f = await fixture()
    await Bun.write(path.join(f.input.config, "updates.json"), JSON.stringify({ channel: "unstable" }))
    await notifyUpdate(f.input)
    expect(f.requests).toContain("/feed/unstable/cli.json")
  })

  for (const [platform, arch, filename] of [
    ["win32", "x64", "cli-windows.zip"],
    ["darwin", "arm64", "cli-mac.tar.gz"],
  ] as const) {
    test(`selects ${platform}-${arch} download`, async () => {
      await using f = await fixture()
      await notifyUpdate({ ...f.input, platform, arch })
      expect(f.output[0]).toContain(filename)
    })
  }

  for (const value of [
    "not json",
    { ...manifest, version: "0.4.0-beta.1" },
    { ...manifest, minSupportedVersion: "9.0.0" },
    { ...manifest, downloads: { "linux-x64": { url: "javascript:alert(1)", sha256: "ab".repeat(32) } } },
    { ...manifest, downloads: { "linux-x64": { url: "0.4.0/cli.tar.gz", sha256: "invalid" } } },
  ]) {
    test(`invalid signed manifest is silent: ${JSON.stringify(value)}`, async () => {
      await using f = await fixture({ value })
      await notifyUpdate(f.input)
      expect(f.output).toEqual([])
    })
  }

  test("HTTP failure is silent", async () => {
    await using f = await fixture({ status: 503 })
    await notifyUpdate(f.input)
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
      await notifyUpdate({ ...f.input, feed: server.url.toString(), timeout: 100 })
      expect(Date.now() - start).toBeLessThan(1500)
      expect(f.output).toEqual([])
    } finally {
      await server.stop(true)
    }
  })

  test("an already aborted invocation does not start a check", async () => {
    await using f = await fixture()
    const signal = AbortSignal.abort()
    await notifyUpdate({ ...f.input, signal })
    expect(f.requests).toEqual([])
    expect(f.output).toEqual([])
  })

  test("command completion cancels an active request without waiting for the timeout", async () => {
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
      const pending = notifyUpdate({
        ...f.input,
        feed: server.url.toString(),
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
  expect(updatePolicyPath("linux", {})).toBe("/etc/loginom-ai-agent/policy.json")
  expect(updatePolicyPath("darwin", {})).toBe("/Library/Application Support/Loginom AI Agent/policy.json")
  expect(updatePolicyPath("win32", { ProgramData: "D:\\ProgramData" })).toBe(
    "D:\\ProgramData\\Loginom AI Agent\\policy.json",
  )
})
