import { expect, test } from "bun:test"
import { createServer as createNetServer, type Server as NetServer } from "node:net"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { once } from "node:events"

import { probeProxyPort, readSystemProxy, resolveSystemProxy } from "../src/system-proxy"

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

function listen(server: NetServer) {
  server.listen(0, "127.0.0.1")
  return once(server, "listening")
}

function port(server: NetServer) {
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("port unavailable")
  return address.port
}
