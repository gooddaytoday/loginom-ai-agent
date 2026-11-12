import assert from "node:assert/strict"
import { once } from "node:events"
import { createServer } from "node:http"
import type { Socket } from "node:net"
import { sidecarEnvironment } from "../../desktop/src/main/proxy-env"
import { resolveSystemProxy } from "../src/system-proxy"

if (process.argv.includes("--assert-windows")) await assertWindowsProxy()
else await readProxy()

async function readProxy() {
  const result = await resolveSystemProxy({ environment: process.env, deadlineMs: 8000 })
  const target = result.summary.http ?? result.summary.https ?? ""
  console.log(`system proxy: ${result.state}${target ? ` ${target}` : ""}`)
  for (const notice of result.notices) console.log(`system proxy notice: ${notice.code}`)
}

async function assertWindowsProxy() {
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
    const result = await resolveSystemProxy({ environment, deadlineMs: 8000 })
    console.log(`system proxy: ${result.state} source=${result.summary.source} https=${result.summary.https}`)
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
        env: sidecarEnvironment(environment),
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
