import { describe, expect, test } from "bun:test"
import { loadDesktopProxyEnvironment, systemProxyEnvironment } from "./system-proxy"
import { loadNativeProxy, macProxyEnvironment } from "@loginom-ai-agent/loginom-host/native-proxy"

describe("macOS system proxy", () => {
  test.skipIf(process.platform !== "darwin")("Desktop uses the native system adapter", () => {
    expect(loadDesktopProxyEnvironment({}, "darwin")).toEqual(loadNativeProxy({}, "darwin"))
  })

  test("manual routes override shell values and bypass loopback", () => {
    const result = macProxyEnvironment(
      `<dictionary> {
  HTTPEnable : 1
  HTTPProxy : proxy.internal
  HTTPPort : 3128
  HTTPSEnable : 1
  HTTPSProxy : secure.internal
  HTTPSPort : 8080
}`,
      { ALL_PROXY: "socks5://stale:1", NO_PROXY: "*" },
    )!
    expect(result.HTTP_PROXY).toBe("http://proxy.internal:3128")
    expect(result.HTTPS_PROXY).toBe("http://secure.internal:8080")
    expect(result.ALL_PROXY).toBe("")
    expect(result.NO_PROXY).toBe("localhost,127.0.0.1,::1")
    expect(result.NODE_USE_ENV_PROXY).toBe("1")
  })

  test("automatic and SOCKS routes fail explicitly", () => {
    expect(() => macProxyEnvironment("<dictionary> {\n  ProxyAutoConfigEnable : 1\n}", {})).toThrow(
      "SYSTEM_PROXY_AUTOMATIC_UNSUPPORTED",
    )
    expect(() => macProxyEnvironment("<dictionary> {\n  SOCKSEnable : 1\n}", {})).toThrow(
      "SYSTEM_PROXY_PROTOCOL_UNSUPPORTED",
    )
  })
})

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
    if (process.platform !== "darwin")
      expect(() => loadDesktopProxyEnvironment({}, "darwin")).toThrow("SYSTEM_PROXY_PLATFORM_UNAVAILABLE")
    if (process.platform !== "win32") expect(loadDesktopProxyEnvironment({}, "win32")).toBeUndefined()
    expect(loadDesktopProxyEnvironment({}, "freebsd")).toBeUndefined()
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
