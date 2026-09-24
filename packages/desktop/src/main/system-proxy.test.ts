import { expect, test } from "bun:test"
import { createServer as createNetServer } from "node:net"
import { once } from "node:events"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { assignProxyEnvironment, SidecarStartError, startWithProxyFallback } from "./proxy-env"
import { formatSystemProxyLog, loopbackNoProxy, sidecarEnvironment, startSystemProxyDetection } from "./system-proxy"

test("a later proxy message replaces only proxy variables", () => {
  const env = { HOME: "/tmp", HTTP_PROXY: "http://old:1", NO_PROXY: "old" }
  assignProxyEnvironment(env, { HTTP_PROXY: "http://127.0.0.1:8080", NO_PROXY: "localhost" })
  expect(env).toEqual({ HOME: "/tmp", HTTP_PROXY: "http://127.0.0.1:8080", NO_PROXY: "localhost" })
})

test("a sidecar that dies before ready with proxy variables restarts once without them", async () => {
  const calls: Array<Record<string, string> | undefined> = []
  const result = await startWithProxyFallback({
    proxy: { HTTP_PROXY: "http://127.0.0.1:8080", NODE_USE_ENV_PROXY: "1" },
    start: async (proxy) => {
      calls.push(proxy)
      if (calls.length === 1) throw new SidecarStartError("exit", "died")
      return "ready"
    },
  })
  expect(result).toEqual({ value: "ready", fallback: true })
  expect(calls).toEqual([{ HTTP_PROXY: "http://127.0.0.1:8080", NODE_USE_ENV_PROXY: "1" }, undefined])
})

test("without proxy variables the original error propagates", async () => {
  let calls = 0
  await expect(
    startWithProxyFallback({
      start: async () => {
        calls += 1
        throw new SidecarStartError("exit", "died")
      },
    }),
  ).rejects.toThrow("died")
  expect(calls).toBe(1)
})

test("a stalled sidecar is not restarted", async () => {
  let calls = 0
  await expect(
    startWithProxyFallback({
      proxy: { HTTPS_PROXY: "http://127.0.0.1:8080" },
      start: async () => {
        calls += 1
        throw new SidecarStartError("stall", "stalled")
      },
    }),
  ).rejects.toThrow("stalled")
  expect(calls).toBe(1)
})

test("a second failure propagates the second error", async () => {
  let calls = 0
  await expect(
    startWithProxyFallback({
      proxy: { HTTP_PROXY: "http://127.0.0.1:8080" },
      start: async () => {
        calls += 1
        throw new SidecarStartError(calls === 1 ? "error" : "exit", calls === 1 ? "first" : "second")
      },
    }),
  ).rejects.toThrow("second")
  expect(calls).toBe(2)
})

test("loopback bypass includes IPv6 bracket form", () => {
  expect(loopbackNoProxy("localhost").split(",")).toEqual(["localhost", "127.0.0.1", "::1", "[::1]"])
  expect(loopbackNoProxy("[::1],127.0.0.1").split(",")).toContain("localhost")
})

test("sidecar receives the proxy overlay and the main environment stays unchanged", async () => {
  const proxy = createNetServer((socket) => {
    socket.on("data", () => socket.end("HTTP/1.1 200 Connection Established\r\n\r\n"))
  })
  proxy.listen(0, "127.0.0.1")
  await once(proxy, "listening")
  const address = proxy.address()
  const proxyPort = address && typeof address !== "string" ? address.port : 0
  try {
    const environment: NodeJS.ProcessEnv = { HOME: "/tmp", PATH: "/usr/bin" }
    const detection = startSystemProxyDetection({
      platform: "linux",
      environment,
      deadlineMs: 1000,
      read: async () => ({
        gnome: `org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port ${proxyPort}\n`,
      }),
    })
    detection.useChromium(async (url) => (url.includes("github.com") ? "DIRECT" : `PROXY 127.0.0.1:${proxyPort}`))
    const result = await detection.result
    expect(environment.HTTP_PROXY).toBeUndefined()
    expect(result.state).toBe("applied")
    expect(result.summary.source).toBe("chromium")
    expect(formatSystemProxyLog(result)).toBe(`system proxy: applied 127.0.0.1:${proxyPort}`)
    const sidecar = sidecarEnvironment(environment, result.environment)
    expect(sidecar.HTTP_PROXY).toBe(`http://127.0.0.1:${proxyPort}`)
    expect(sidecar.HOME).toBe("/tmp")
    expect(sidecar.NO_PROXY?.split(",")).toContain("github.com")
    expect(environment.HTTP_PROXY).toBeUndefined()
  } finally {
    proxy.close()
  }
})

test("stop() settles detection while chromium hangs", async () => {
  const detection = startSystemProxyDetection({
    platform: "win32",
    deadlineMs: 5000,
    read: async () => ({
      windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
    }),
  })
  detection.useChromium(() => new Promise(() => undefined))
  await new Promise((resolve) => setTimeout(resolve, 30))
  const started = Date.now()
  detection.stop()
  const result = await detection.result
  expect(result.state).toBe("direct")
  expect(Date.now() - started).toBeLessThan(500)
})

test("detection settles by the total cap even if a stage never resolves", async () => {
  const started = Date.now()
  const detection = startSystemProxyDetection({
    read: () => new Promise(() => undefined),
    timeoutMs: 200,
  })
  const result = await detection.result
  expect(result.state).toBe("failed")
  expect(result.notices.map((notice) => notice.code)).toEqual(["timeout"])
  expect(Date.now() - started).toBeLessThan(1500)
})

test("an empty OS snapshot is not read a second time", async () => {
  const root = await mkdtemp(join(tmpdir(), "loginom-proxy-reread-"))
  const bin = join(root, "bin")
  const marker = join(root, "marker")
  await mkdir(bin)
  await writeFile(join(bin, "gsettings"), `#!/bin/sh\necho called >> "${marker}"\nexit 0\n`, { mode: 0o755 })
  try {
    const detection = startSystemProxyDetection({
      platform: "linux",
      environment: { PATH: `${bin}:${process.env.PATH ?? ""}`, XDG_CURRENT_DESKTOP: "GNOME" },
      read: async () => ({}),
    })
    detection.useChromium(async () => "DIRECT")
    await detection.result
    const markerText = await readFile(marker, "utf8").catch(() => "")
    expect(markerText).toBe("")
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test("stopping detection does not wait for a hung reader", async () => {
  const detection = startSystemProxyDetection({
    deadlineMs: 5000,
    read: () => new Promise(() => undefined),
  })
  detection.stop()
  const result = await detection.result
  expect(result.state).toBe("direct")
})

test("production paths probe SOCKS-only mixed ports and closed proxies", async () => {
  const server = createNetServer((socket) => {
    socket.on("data", () => socket.end("HTTP/1.1 200 Ok\r\n\r\n"))
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const address = server.address()
  const proxyPort = address && typeof address !== "string" ? address.port : 0
  try {
    const detection = startSystemProxyDetection({
      platform: "win32",
      deadlineMs: 2000,
      read: async () => ({
        windows: { autoDetect: false, autoConfigUrl: "", proxy: `socks=127.0.0.1:${proxyPort}`, bypass: "" },
      }),
    })
    detection.useChromium(async () => "DIRECT")
    const result = await detection.result
    expect(result.state).toBe("applied")
    expect(result.environment?.HTTP_PROXY).toBe(`http://127.0.0.1:${proxyPort}`)
  } finally {
    server.close()
  }
})

test("an explicit switch skips system proxy discovery", async () => {
  let reads = 0
  const detection = startSystemProxyDetection({
    environment: { LOGINOM_AI_AGENT_SYSTEM_PROXY: "off" },
    read: async () => {
      reads += 1
      return {}
    },
  })
  const result = await detection.result
  expect(result.state).toBe("off")
  expect(reads).toBe(0)
  expect(formatSystemProxyLog(result)).toBe("system proxy: off")
})
