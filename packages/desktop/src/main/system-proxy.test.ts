import { expect, test } from "bun:test"
import { assignProxyEnvironment } from "./proxy-env"
import { formatSystemProxyLog, loopbackNoProxy, sidecarEnvironment, startSystemProxyDetection } from "./system-proxy"

test("a later proxy message replaces only proxy variables", () => {
  const env = { HOME: "/tmp", HTTP_PROXY: "http://old:1", NO_PROXY: "old" }
  assignProxyEnvironment(env, { HTTP_PROXY: "http://127.0.0.1:8080", NO_PROXY: "localhost" })
  expect(env).toEqual({ HOME: "/tmp", HTTP_PROXY: "http://127.0.0.1:8080", NO_PROXY: "localhost" })
})

test("loopback bypass includes IPv6 bracket form", () => {
  expect(loopbackNoProxy("localhost").split(",")).toEqual(["localhost", "127.0.0.1", "::1", "[::1]"])
  expect(loopbackNoProxy("[::1],127.0.0.1").split(",")).toContain("localhost")
})

test("sidecar receives the proxy overlay and the main environment stays unchanged", async () => {
  const environment: NodeJS.ProcessEnv = { HOME: "/tmp", PATH: "/usr/bin" }
  const detection = startSystemProxyDetection({
    platform: "linux",
    environment,
    deadlineMs: 1000,
    read: async () => ({
      gnome: "org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port 8080\n",
    }),
  })
  detection.useChromium(async (url) => (url.includes("github.com") ? "DIRECT" : "PROXY 127.0.0.1:8080"))
  const result = await detection.result
  expect(environment.HTTP_PROXY).toBeUndefined()
  expect(result.state).toBe("applied")
  expect(result.summary.source).toBe("chromium")
  expect(formatSystemProxyLog(result)).toBe("system proxy: applied 127.0.0.1:8080")
  const sidecar = sidecarEnvironment(environment, result.environment)
  expect(sidecar.HTTP_PROXY).toBe("http://127.0.0.1:8080")
  expect(sidecar.HOME).toBe("/tmp")
  expect(sidecar.NO_PROXY?.split(",")).toContain("github.com")
  expect(environment.HTTP_PROXY).toBeUndefined()
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
