import { expect, test } from "bun:test"
import { createServer } from "node:http"
import { runtimeEnvironment } from "../src/supervisor"
import { desktopServiceProxy, onceDesktopServiceProxy } from "../src/system-proxy"

const inherited = { NO_PROXY: "private.example", no_proxy: "another.example" }
const loopback = ["localhost", "127.0.0.1", "::1", "[::1]"]
const windows = { autoDetect: false, autoConfigUrl: "", proxy: "proxy.example:8080", bypass: "internal.example" }

test("WinINET reaches the Desktop service but not its Loginom runtime", async () => {
  const proxy = await desktopServiceProxy({
    platform: "win32",
    environment: inherited,
    windows: {
      autoDetect: false,
      autoConfigUrl: "",
      proxy: "http=proxy.example:8080;https=secure.example:8080",
      bypass: "internal.example",
    },
  })
  expect(proxy.state).toBe("applied")
  expect(proxy.status).toEqual({ source: "windows", hosts: ["proxy.example:8080", "secure.example:8080"] })
  expect(proxy.environment.HTTPS_PROXY).toBe("http://secure.example:8080")
  expect(proxy.environment.NO_PROXY?.split(",")).toEqual(
    expect.arrayContaining([...loopback, "private.example", "another.example", "internal.example"]),
  )
  expect(runtimeEnvironment({ ...inherited, ...proxy.environment }, "win32")).toEqual({
    NO_PROXY: [...loopback, "private.example", "another.example"].join(","),
  })
})

test("explicit HTTPS_PROXY skips system and PAC readers and survives in the runtime", async () => {
  const environment = {
    ...inherited,
    HTTPS_PROXY: "http://sample-user:sample-pass@explicit.example:8080",
    NODE_USE_ENV_PROXY: "1",
  }
  const proxy = await desktopServiceProxy({
    platform: "linux",
    environment,
    read: async () => {
      throw new Error("must not read")
    },
    chromium: async () => {
      throw new Error("must not resolve")
    },
  })
  expect(proxy.state).toBe("environment")
  expect(proxy.status).toEqual({ source: "environment", hosts: ["explicit.example:8080"] })
  const noProxy = [...loopback, "private.example", "another.example"].join(",")
  expect(runtimeEnvironment({ ...environment, ...proxy.environment }, "linux")).toEqual({
    ...environment,
    NO_PROXY: noProxy,
    no_proxy: noProxy,
  })
})

test.each(["win32", "linux"] as const)("a terminal CLI preserves its new explicit proxy on %s", async (platform) => {
  const proxy = await desktopServiceProxy({
    platform,
    environment: inherited,
    windows,
  })
  expect(proxy.state).toBe("applied")
  const HTTPS_PROXY = "http://explicit.example:8080"
  const runtime = runtimeEnvironment({ ...proxy.environment, HTTPS_PROXY }, platform)
  expect(runtime).toMatchObject({
    HTTPS_PROXY,
    NODE_USE_ENV_PROXY: "1",
    NO_PROXY: [...loopback, "private.example", "another.example"].join(","),
  })
  expect(runtime.HTTP_PROXY).toBeUndefined()
  expect(runtime.https_proxy).toBeUndefined()
})

test("Desktop shares one detection across startup and reconnect and exposes unreachable without going direct", async () => {
  let probes = 0
  const detect = onceDesktopServiceProxy(() => ({
    platform: "win32",
    windows,
    probe: async () => {
      probes++
      return "closed"
    },
  }))
  const [startup, reconnect] = await Promise.all([detect(), detect()])
  expect(reconnect).toEqual(startup)
  expect(await detect()).toEqual(startup)
  expect(startup.notices).toContain("unreachable")
  expect(startup.environment.HTTPS_PROXY).toBe("http://proxy.example:8080")
  expect(probes).toBe(1)
})

test("Desktop does not resolve system routes when the imported preference is off", async () => {
  const result = await desktopServiceProxy({
    enabled: false,
    windows,
  })
  expect(result.state).toBe("off")
  expect(result.environment.HTTPS_PROXY).toBeUndefined()
})

test("Desktop exposes SOCKS-only as an unsupported route", async () => {
  const result = await desktopServiceProxy({
    platform: "win32",
    windows: { ...windows, proxy: "socks=proxy.example:1080" },
    probe: async () => "other",
  })
  expect(result.notices).toContain("socks-only")
  expect(result.environment.HTTPS_PROXY).toBeUndefined()
})

test.each(["deadline", "quit"] as const)(
  "Desktop stops waiting for Chromium on %s",
  async (stop) => {
    const controller = new AbortController()
    const pending = Promise.withResolvers<string>()
    const entered = Promise.withResolvers<void>()
    const detection = desktopServiceProxy(
      {
        platform: "win32",
        signal: controller.signal,
        windows,
        chromium: () => {
          entered.resolve()
          return pending.promise
        },
      },
      stop === "deadline" ? 25 : 10_000,
    )
    await entered.promise
    if (stop === "quit") controller.abort()
    try {
      expect(await detection).toMatchObject({ state: "failed", notices: ["timeout"] })
    } finally {
      pending.resolve("DIRECT")
    }
  },
  2_000,
)

test("a Bun sidecar connects through PAC's proxy, but reaches loopback directly", async () => {
  const connects: string[] = []
  const proxyServer = createServer().on("connect", (request, socket) => {
    connects.push(request.url ?? "")
    socket.end("HTTP/1.1 502 Bad Gateway\r\n\r\n")
  })
  const loopbackServer = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("local") })
  try {
    await new Promise<void>((resolve, reject) => {
      proxyServer.once("error", reject).listen(0, "127.0.0.1", resolve)
    })
    const address = proxyServer.address()
    if (!address || typeof address === "string") throw new Error("Proxy did not listen")
    const destination = "https://catalog.invalid/"
    const proxy = await desktopServiceProxy({
      platform: "linux",
      environment: {},
      gnome: "org.gnome.system.proxy mode 'auto'\norg.gnome.system.proxy autoconfig-url 'http://pac.invalid/proxy.pac'",
      urls: [destination, "https://direct.invalid/"],
      chromium: async (url) => (url === destination ? `PROXY 127.0.0.1:${address.port}` : "DIRECT"),
    })
    expect(proxy.environment.no_proxy?.split(",")).toContain("direct.invalid")
    const subprocess = Bun.spawn(
      [
        process.execPath,
        "-e",
        `
      await fetch(${JSON.stringify(destination)}, { signal: AbortSignal.timeout(2000) }).catch(() => {});
      console.log(await (await fetch(${JSON.stringify(loopbackServer.url.href)}, { signal: AbortSignal.timeout(2000) })).text());
    `,
      ],
      { env: proxy.environment, stdout: "pipe" },
    )
    expect(await new Response(subprocess.stdout).text()).toBe("local\n")
    expect(await subprocess.exited).toBe(0)
    expect(connects).toEqual(["catalog.invalid:443"])
  } finally {
    proxyServer.close()
    await loopbackServer.stop(true)
  }
})
