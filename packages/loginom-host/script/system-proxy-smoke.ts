import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer } from "node:http"
import type { Socket } from "node:net"
import { resolve } from "node:path"
import { pathToFileURL } from "node:url"
import { resolveSystemProxy } from "../src/system-proxy"

if (process.argv.includes("--measure-windows")) await measureWindows()
else if (process.argv.includes("--assert-windows")) await assertWindowsProxy()
else await readProxy()

// Run each source/operation on its own disposable runner. The first subprocess
// is cold; later subprocesses measure the same implementation with warm OS caches.
async function measureWindows() {
  assert.equal(process.platform, "win32")
  assert.equal(process.env.GITHUB_ACTIONS, "true")
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted")
  const source = process.argv[process.argv.indexOf("--source") + 1]
  const operation = process.argv[process.argv.indexOf("--operation") + 1]
  assert.ok(source && ["proxy", "dpapi"].includes(operation))
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(https?_proxy|all_proxy|no_proxy|node_use_env_proxy|loginom_ai_agent_system_proxy)$/i.test(key)))
  const module = await import(pathToFileURL(resolve(source, operation === "proxy"
    ? "packages/loginom-host/src/system-proxy/index.ts"
    : "packages/loginom-host/src/connection/cli-dpapi.ts")).href)
  let failures = 0
  for (const sample of ["cold", "warm-1", "warm-2"]) {
    const started = performance.now()
    try {
      if (operation === "proxy") {
        const result = await module.resolveSystemProxy({ environment })
        console.log(JSON.stringify({ operation, sample, elapsedMs: Math.round(performance.now() - started),
          state: result.state, notices: result.notices }))
        if (result.state !== "applied" || result.notices.length) failures++
        continue
      }
      const input = Buffer.from("loginom-windows-native-timing")
      const protectedValue = await module.cliDpapi("Protect", input)
      console.log(JSON.stringify({ operation: "dpapi-protect", sample, elapsedMs: Math.round(performance.now() - started), state: "ok" }))
      const unprotectStarted = performance.now()
      assert.deepEqual(await module.cliDpapi("Unprotect", protectedValue), input)
      console.log(JSON.stringify({ operation: "dpapi-unprotect", sample, elapsedMs: Math.round(performance.now() - unprotectStarted), state: "ok" }))
    } catch {
      failures++
      console.log(JSON.stringify({ operation, sample, elapsedMs: Math.round(performance.now() - started), state: "failed" }))
    }
  }
  if (process.argv.includes("--require-success")) assert.equal(failures, 0, "Native timing samples failed")
}

async function readProxy() {
  const result = await resolveSystemProxy({ environment: process.env })
  const target = result.summary.http ?? result.summary.https ?? ""
  console.log(`system proxy: ${result.state}${target ? ` ${target}` : ""}`)
  for (const notice of result.notices) console.log(`system proxy notice: ${notice.code}`)
}

async function assertWindowsProxy() {
  const { sidecarEnvironment } = await import("../../desktop/src/main/proxy-env")
  assert.equal(process.platform, "win32")
  assert.equal(process.env.GITHUB_ACTIONS, "true", "Requires a disposable GitHub-hosted runner")
  assert.equal(process.env.RUNNER_ENVIRONMENT, "github-hosted")
  // Only the native settings may supply a proxy or loopback exemption.
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !/^(https?_proxy|all_proxy|no_proxy|node_use_env_proxy|loginom_ai_agent_system_proxy)$/i.test(key),
    ),
  )
  const connects: string[] = []
  const requests: string[] = []
  const sockets = new Set<Socket>()
  const trap = createServer((request, response) => {
    requests.push(request.url ?? "")
    response.writeHead(502).end()
  })
  trap.on("connection", (socket) => {
    sockets.add(socket)
    socket.once("close", () => sockets.delete(socket))
  })
  trap.on("connect", (request, socket) => {
    connects.push(request.url ?? "")
    console.log(`trap: CONNECT ${request.url}`)
    // Never open an upstream connection or perform TLS/OAuth.
    socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
  })
  let loopbackHits = 0
  const local = createServer((_request, response) => {
    loopbackHits += 1
    response.end("system-proxy-loopback")
  })
  try {
    trap.listen(18797, "127.0.0.1")
    await once(trap, "listening")
    local.listen(0, "127.0.0.1")
    await once(local, "listening")
    const address = local.address()
    assert.ok(address && typeof address !== "string")
    const started = performance.now()
    const result = await resolveSystemProxy({ environment })
    console.log(`system proxy elapsedMs=${Math.round(performance.now() - started)}`)
    console.log(`system proxy: ${result.state} source=${result.summary.source} https=${result.summary.https}`)
    for (const notice of result.notices) console.log(`system proxy notice: ${notice.code}`)
    assert.equal(result.state, "applied", "System proxy was not applied")
    assert.equal(result.summary.source, "windows", "Proxy must come from Windows, not environment")
    assert.equal(result.environment?.HTTP_PROXY, "http://127.0.0.1:18797")
    assert.equal(result.environment?.HTTPS_PROXY, "http://127.0.0.1:18797")
    assert.deepEqual(result.notices, [])

    const child = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
      import assert from "node:assert/strict"
      import { lookup } from "node:dns/promises"
      for (const url of ["https://api.openai.com/v1/models", "https://auth.openai.com/oauth/token"]) {
        const addresses = await lookup(new URL(url).hostname, { all: true })
        assert.ok(addresses.length > 0 && addresses.every(({ address }) => ["127.0.0.1", "::1"].includes(address)), "Direct fallback must stay on loopback")
        // The trap rejects CONNECT. The parent asserts actual traffic, not fetch errors.
        await fetch(url, { signal: AbortSignal.timeout(3000) }).catch(() => undefined)
      }
      for (const host of ["localhost", "127.0.0.1"]) {
        const response = await fetch("http://" + host + ":${address.port}/", { signal: AbortSignal.timeout(3000) })
        assert.equal(response.status, 200)
        assert.equal(await response.text(), "system-proxy-loopback")
        console.log("sidecar: direct " + host)
      }
    `,
      ],
      {
        env: sidecarEnvironment(environment, result.environment),
        stdout: "inherit",
        stderr: "inherit",
      },
    )
    const timer = setTimeout(() => child.kill(), 20000)
    try {
      assert.equal(await child.exited, 0, "Sidecar request process failed")
    } finally {
      clearTimeout(timer)
      if (child.exitCode === null) child.kill()
      await child.exited
    }
    for (const host of ["api.openai.com", "auth.openai.com"]) {
      assert.ok(connects.includes(`${host}:443`), `Missing CONNECT ${host}:443`)
    }
    assert.ok(connects.every((target) => ["api.openai.com:443", "auth.openai.com:443"].includes(target)))
    assert.deepEqual(requests, [], "Loopback request reached the proxy")
    assert.equal(loopbackHits, 2, "Both loopback requests must arrive directly")
    console.log("PASS: Windows system proxy -> sidecar -> model/OAuth CONNECT; localhost bypass")
  } finally {
    for (const socket of sockets) socket.destroy()
    local.closeAllConnections()
    await Promise.all([
      new Promise<void>((resolve) => trap.close(() => resolve())),
      new Promise<void>((resolve) => local.close(() => resolve())),
    ])
  }
}
