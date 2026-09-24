import { expect, test } from "bun:test"
import { createServer } from "node:http"
import { createServer as createNetServer, type Server as NetServer } from "node:net"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { once } from "node:events"

import { probeProxyPort, probeProxyUrl, readSystemProxy, resolveSystemProxy } from "../src/system-proxy"

test("socket probe distinguishes an HTTP proxy, a non-HTTP port, refusal and timeout", async () => {
  const http = createNetServer((socket) => {
    socket.on("data", () => socket.end("HTTP/1.1 200 Connection Established\r\n\r\n"))
  })
  const other = createNetServer((socket) => {
    socket.on("data", () => socket.end("\x05\x00"))
  })
  await listen(http)
  await listen(other)
  try {
    expect(await probeProxyPort("127.0.0.1", port(http), 500)).toBe("http")
    expect(await probeProxyPort("127.0.0.1", port(other), 500)).toBe("other")
    expect(await probeProxyPort("127.0.0.1", 1, 500)).toBe("closed")
    expect(await probeProxyPort("127.0.0.1", port(http), 50)).toBe("http")
    const silent = createNetServer((socket) => {
      socket.on("data", () => undefined)
    })
    await listen(silent)
    try {
      expect(await probeProxyPort("127.0.0.1", port(silent), 80)).toBe("timeout")
    } finally {
      silent.close()
    }
  } finally {
    http.close()
    other.close()
  }
})

test("the probe tells proxies from servers that merely speak HTTP", async () => {
  const closed = createNetServer((socket) => socket.end())
  await listen(closed)
  const started = Date.now()
  try {
    expect(await probeProxyPort("127.0.0.1", port(closed), 1000)).toBe("other")
    expect(Date.now() - started).toBeLessThan(500)
  } finally {
    closed.close()
  }
  for (const code of [501, 400]) {
    const server = createNetServer((socket) => {
      socket.on("data", () => socket.end(`HTTP/1.1 ${code} No\r\n\r\n`))
    })
    await listen(server)
    try {
      expect(await probeProxyPort("127.0.0.1", port(server), 500)).toBe("other")
    } finally {
      server.close()
    }
  }
  for (const code of [200, 403, 407, 502, 503, 504]) {
    const server = createNetServer((socket) => {
      socket.on("data", () => socket.end(`HTTP/1.1 ${code} Ok\r\n\r\n`))
    })
    await listen(server)
    try {
      expect(await probeProxyPort("127.0.0.1", port(server), 500)).toBe("http")
    } finally {
      server.close()
    }
  }
})

test("an HTTPS proxy probe checks TCP reachability", async () => {
  const server = createNetServer((socket) => {
    socket.on("data", () => socket.end("HTTP/1.1 200 Ok\r\n\r\n"))
  })
  await listen(server)
  try {
    const result = await resolveSystemProxy({
      platform: "linux",
      gnome: "org.gnome.system.proxy mode 'none'\n",
      chromium: [{ url: "https://api.openai.com/v1/models", resolution: `HTTPS 127.0.0.1:${port(server)}` }],
      probe: (url) => probeProxyUrl(url, 500),
    })
    expect(result.environment?.HTTPS_PROXY).toBe(`https://127.0.0.1:${port(server)}`)
    expect(result.notices.map((notice) => notice.code)).not.toContain("unreachable")
  } finally {
    server.close()
  }
})

test("a hung probe is bounded", async () => {
  const silent = createNetServer((socket) => {
    socket.on("data", () => undefined)
  })
  await listen(silent)
  const started = Date.now()
  try {
    expect(await probeProxyPort("127.0.0.1", port(silent), 100)).toBe("timeout")
    expect(Date.now() - started).toBeLessThan(500)
  } finally {
    silent.close()
  }
  let connects = 0
  const http = createNetServer((socket) => {
    connects += 1
    socket.on("data", () => socket.end("HTTP/1.1 200 Ok\r\n\r\n"))
  })
  await listen(http)
  try {
    const result = await resolveSystemProxy({
      platform: "win32",
      windows: { autoDetect: false, autoConfigUrl: "", proxy: `127.0.0.1:${port(http)}`, bypass: "" },
      probe: (url) => probeProxyUrl(url, 500),
    })
    expect(result.state).toBe("applied")
    expect(connects).toBe(1)
  } finally {
    http.close()
  }
})

test("a SOCKS port that speaks HTTP is used as an HTTP proxy", async () => {
  const result = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "socks=127.0.0.1:1080", bypass: "" },
    probe: async () => "http",
  })
  expect(result.state).toBe("applied")
  expect(result.environment?.HTTP_PROXY).toBe("http://127.0.0.1:1080")
  expect(result.environment?.HTTPS_PROXY).toBe("http://127.0.0.1:1080")
})

test("resolveSystemProxy turns reader failures into a result", async () => {
  const sync = await resolveSystemProxy({
    platform: "linux",
    read: () => {
      throw new Error("sync")
    },
  })
  expect(sync.state).toBe("failed")
  expect(sync.notices[0]?.code).toBe("read-failed")
  const rejected = await resolveSystemProxy({
    platform: "linux",
    read: async () => {
      throw new Error("rejected")
    },
  })
  expect(rejected.notices[0]?.code).toBe("read-failed")
  const hung = await resolveSystemProxy({
    platform: "linux",
    deadlineMs: 30,
    read: () => new Promise(() => undefined),
  })
  expect(hung.notices[0]?.code).toBe("timeout")
  const garbage = await resolveSystemProxy({
    platform: "win32",
    read: async () => ({ windows: { proxy: "127.0.0.1:1" } }),
  })
  expect(garbage.state).toBe("failed")
  expect(garbage.notices[0]?.code).toBe("internal")
})

test("linux readers honor a fake gsettings and a temporary kioslaverc", async () => {
  const directory = await mkdtemp(join(tmpdir(), "loginom-proxy-read-"))
  try {
    const bin = join(directory, "bin")
    await mkdir(bin)
    await writeFile(join(bin, "gsettings"), "#!/bin/sh\nprintf '%s\\n' 'not-settings'\nexit 1\n", { mode: 0o755 })
    const failed = await readSystemProxy({
      platform: "linux",
      timeoutMs: 1000,
      environment: { PATH: bin, XDG_CURRENT_DESKTOP: "GNOME" },
    })
    expect(failed).toEqual({ ok: false, code: "read-failed" })
    await writeFile(join(bin, "gsettings"), "#!/bin/sh\n/bin/sleep 30\n", { mode: 0o755 })
    const hung = await readSystemProxy({
      platform: "linux",
      timeoutMs: 200,
      environment: { PATH: bin, XDG_CURRENT_DESKTOP: "GNOME" },
    })
    expect(hung).toEqual({ ok: false, code: "timeout" })
    await writeFile(
      join(bin, "gsettings"),
      "#!/bin/sh\nprintf '%s\\n' \"org.gnome.system.proxy mode 'manual'\" \"org.gnome.system.proxy.http host '127.0.0.1'\" \"org.gnome.system.proxy.http port 8080\"\n",
      { mode: 0o755 },
    )
    const manual = await readSystemProxy({
      platform: "linux",
      timeoutMs: 1000,
      environment: { PATH: bin, XDG_CURRENT_DESKTOP: "GNOME" },
    })
    expect(manual.ok).toBe(true)
    const config = join(directory, "config")
    await mkdir(config)
    await writeFile(
      join(config, "kioslaverc"),
      "[Proxy Settings]\nProxyType=1\nhttpProxy=http://127.0.0.1 9090\n",
    )
    const kde = await readSystemProxy({
      platform: "linux",
      environment: { XDG_CURRENT_DESKTOP: "KDE", XDG_CONFIG_HOME: config, HOME: directory },
    })
    expect(kde.ok && kde.snapshot.kde).toContain("9090")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("the CLI downloads a PAC from GNOME autoconfig-url and applies its single proxy", async () => {
  let hits = 0
  const pac = createServer((_request, response) => {
    hits += 1
    response.end("function FindProxyForURL(){ return 'PROXY 127.0.0.1:10809'; }")
  })
  pac.listen(0, "127.0.0.1")
  await once(pac, "listening")
  const address = pac.address()
  const pacPort = address && typeof address !== "string" ? address.port : 0
  try {
    const result = await resolveSystemProxy({
      platform: "linux",
      gnome: `org.gnome.system.proxy mode 'auto'\norg.gnome.system.proxy autoconfig-url 'http://127.0.0.1:${pacPort}/proxy.pac'\n`,
    })
    expect(hits).toBe(1)
    expect(result.environment?.HTTP_PROXY).toBe("http://127.0.0.1:10809")
  } finally {
    pac.close()
  }
})

test("Windows, macOS and KDE PAC URLs use the same download", async () => {
  let hits = 0
  const pac = createServer((_request, response) => {
    hits += 1
    response.end("return 'PROXY 127.0.0.1:10810';")
  })
  pac.listen(0, "127.0.0.1")
  await once(pac, "listening")
  const address = pac.address()
  const pacPort = address && typeof address !== "string" ? address.port : 0
  const url = `http://127.0.0.1:${pacPort}/proxy.pac`
  try {
    const windows = await resolveSystemProxy({
      platform: "win32",
      windows: { autoDetect: false, autoConfigUrl: url, proxy: "", bypass: "" },
    })
    const macos = await resolveSystemProxy({
      platform: "darwin",
      macos: `<dictionary> {\n  ProxyAutoConfigEnable : 1\n  ProxyAutoConfigURLString : ${url}\n}\n`,
    })
    const kde = await resolveSystemProxy({
      platform: "linux",
      environment: { XDG_CURRENT_DESKTOP: "KDE" },
      kde: `[Proxy Settings]\nProxyType=2\nProxy Config Script=${url}\n`,
    })
    expect(windows.environment?.HTTP_PROXY).toBe("http://127.0.0.1:10810")
    expect(macos.environment?.HTTP_PROXY).toBe("http://127.0.0.1:10810")
    expect(kde.environment?.HTTP_PROXY).toBe("http://127.0.0.1:10810")
    expect(hits).toBe(3)
  } finally {
    pac.close()
  }
})

test("a PAC server that never answers or returns an oversized script is skipped within budget", async () => {
  const silent = createServer(() => undefined)
  silent.listen(0, "127.0.0.1")
  await once(silent, "listening")
  const silentAddress = silent.address()
  const silentPort = silentAddress && typeof silentAddress !== "string" ? silentAddress.port : 0
  const started = Date.now()
  try {
    const hung = await resolveSystemProxy({
      platform: "linux",
      gnome: `org.gnome.system.proxy mode 'auto'\norg.gnome.system.proxy autoconfig-url 'http://127.0.0.1:${silentPort}/proxy.pac'\n`,
    })
    expect(Date.now() - started).toBeLessThan(2500)
    expect(hung.state).toBe("direct")
    expect(hung.environment).toBeUndefined()
    expect(hung.notices.map((notice) => notice.code)).toContain("automatic-unsupported")
  } finally {
    silent.close()
  }

  const huge = createServer((_request, response) => {
    response.end(`PROXY 127.0.0.1:8080\n${"x".repeat(1024 * 1024 + 8)}`)
  })
  huge.listen(0, "127.0.0.1")
  await once(huge, "listening")
  const hugeAddress = huge.address()
  const hugePort = hugeAddress && typeof hugeAddress !== "string" ? hugeAddress.port : 0
  try {
    const oversized = await resolveSystemProxy({
      platform: "linux",
      gnome: `org.gnome.system.proxy mode 'auto'\norg.gnome.system.proxy autoconfig-url 'http://127.0.0.1:${hugePort}/proxy.pac'\n`,
    })
    expect(oversized.environment).toBeUndefined()
    expect(oversized.notices.map((notice) => notice.code)).toContain("automatic-unsupported")
  } finally {
    huge.close()
  }
})

test("Desktop never downloads PAC", async () => {
  let hits = 0
  const pac = createServer((_request, response) => {
    hits += 1
    response.end("return 'PROXY 127.0.0.1:8080';")
  })
  pac.listen(0, "127.0.0.1")
  await once(pac, "listening")
  const address = pac.address()
  const pacPort = address && typeof address !== "string" ? address.port : 0
  try {
    const result = await resolveSystemProxy({
      platform: "linux",
      gnome: `org.gnome.system.proxy mode 'auto'\norg.gnome.system.proxy autoconfig-url 'http://127.0.0.1:${pacPort}/proxy.pac'\n`,
      chromium: async () => "DIRECT",
    })
    expect(hits).toBe(0)
    expect(result.environment?.HTTP_PROXY).toBeUndefined()
  } finally {
    pac.close()
  }
})

function listen(server: NetServer) {
  server.listen(0, "127.0.0.1")
  return once(server, "listening")
}

function port(server: NetServer) {
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("port unavailable")
  return address.port
}
