import { describe, expect, test } from "bun:test"
import { loadSystemProxyEnvironment, systemProxyEnvironment } from "./system-proxy"

const settings = `org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy use-same-proxy false
org.gnome.system.proxy ignore-hosts ['localhost,127.0.0.0/8,::1', '*.internal']
org.gnome.system.proxy.http host '127.0.0.1'
org.gnome.system.proxy.http port 10808
org.gnome.system.proxy.http use-authentication false
org.gnome.system.proxy.https host 'proxy.internal'
org.gnome.system.proxy.https port 3128`

describe("Linux system proxy", () => {
  test("system HTTP and HTTPS routes override stale upper/lowercase shell settings", () => {
    const input = {
      HTTP_PROXY: "http://old:1",
      https_proxy: "http://old:2",
      ALL_PROXY: "socks5://old:3",
      NO_PROXY: "*",
      HOME: "/home/test",
    }
    const result = systemProxyEnvironment(settings, input)!
    expect(result.HTTP_PROXY).toBe("http://127.0.0.1:10808")
    expect(result.http_proxy).toBe(result.HTTP_PROXY)
    expect(result.HTTPS_PROXY).toBe("http://proxy.internal:3128")
    expect(result.https_proxy).toBe(result.HTTPS_PROXY)
    expect(result.ALL_PROXY).toBe("")
    expect(result.all_proxy).toBe("")
    expect(result.NO_PROXY).toBe("localhost,127.0.0.0/8,::1,*.internal,127.0.0.1")
    expect(result.no_proxy).toBe(result.NO_PROXY)
    expect(result.NODE_USE_ENV_PROXY).toBe("1")
    expect(result.HOME).toBe(input.HOME)
    expect(input.NO_PROXY).toBe("*")
  })

  test("same-proxy and IPv6 settings apply to both protocols", () => {
    const result = systemProxyEnvironment(
      settings.replace("use-same-proxy false", "use-same-proxy true").replace("host '127.0.0.1'", "host '::1'"),
      {},
    )!
    expect(result.HTTP_PROXY).toBe("http://[::1]:10808")
    expect(result.HTTPS_PROXY).toBe(result.HTTP_PROXY)
  })

  test("unconfigured systems keep existing environment", () => {
    expect(systemProxyEnvironment("", {})).toBeUndefined()
    expect(systemProxyEnvironment(settings.replace("mode 'manual'", "mode 'none'"), {})).toBeUndefined()
    const foreignNative = process.platform === "win32" ? "darwin" : "win32"
    expect(loadSystemProxyEnvironment({}, foreignNative)).toBeUndefined()
    expect(loadSystemProxyEnvironment({}, "freebsd")).toBeUndefined()
  })

  test("does not silently bypass an authenticated system proxy", () => {
    expect(() =>
      systemProxyEnvironment(settings.replace("use-authentication false", "use-authentication true"), {}),
    ).toThrow("SYSTEM_PROXY_AUTHENTICATION_UNSUPPORTED")
  })

  test("invalid configured addresses fail instead of silently connecting directly", () => {
    expect(() => systemProxyEnvironment(settings.replace("port 10808", "port 70000"), {})).toThrow(
      "SYSTEM_PROXY_ADDRESS_INVALID",
    )
  })
})
