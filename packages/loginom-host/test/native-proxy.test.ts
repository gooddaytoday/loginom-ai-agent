import { expect, test } from "bun:test"
import { loadNativeProxy, macProxyEnvironment, windowsProxyEnvironment } from "../src/native-proxy"
import { loadCliProxyEnvironment, loadSystemProxyEnvironment } from "../src/system-proxy"

const windows = {
  autoDetect: false,
  autoConfigUrl: "",
  proxy: "http=proxy.test:8080;https=[::1]:8443",
  bypass: "*.example.test;localhost",
}
const mac = `<dictionary> {
  HTTPEnable : 1
  HTTPProxy : proxy.test
  HTTPPort : 8080
  HTTPSEnable : 1
  HTTPSProxy : ::1
  HTTPSPort : 8443
  ExceptionsList : <array> {
    0 : *.example.test
    1 : localhost
  }
}
`

test("native manual policies override stale proxy environment and preserve unrelated values", () => {
  for (const value of [
    windowsProxyEnvironment(windows, {
      HTTP_PROXY: "stale",
      HTTPS_PROXY: "stale",
      ALL_PROXY: "stale",
      CUSTOM: "retained",
    }),
    macProxyEnvironment(mac, { CUSTOM: "retained" }),
  ]) {
    expect(value).toMatchObject({
      HTTP_PROXY: "http://proxy.test:8080",
      http_proxy: "http://proxy.test:8080",
      HTTPS_PROXY: "http://[::1]:8443",
      https_proxy: "http://[::1]:8443",
      ALL_PROXY: "",
      all_proxy: "",
      CUSTOM: "retained",
      NODE_USE_ENV_PROXY: "1",
    })
    expect(value?.NO_PROXY).toBe(".example.test,localhost,127.0.0.1,::1")
    expect(value?.no_proxy).toBe(value?.NO_PROXY)
  }
  expect(windowsProxyEnvironment({ ...windows, proxy: "proxy.test:8080" }, {})?.HTTPS_PROXY).toBe(
    "http://proxy.test:8080",
  )
  expect(windowsProxyEnvironment({ ...windows, proxy: "http=proxy.test:8080" }, {})?.HTTPS_PROXY).toBe("")
})

test("Windows manual proxy accepts default HTTP ports without changing protocols", () => {
  for (const proxy of ["proxy.test", "http://proxy.test", "proxy.test:80"])
    expect(windowsProxyEnvironment({ ...windows, proxy }, {})?.HTTP_PROXY).toBe("http://proxy.test")
})

test("Windows bypass rules map domain and IPv4 wildcards into Node NO_PROXY", () => {
  const value = windowsProxyEnvironment(
    {
      ...windows,
      bypass: "*.example.test;.suffix.test;10.*;192.168.1.*;172.1*;127.*;<local>;LOCALHOST",
    },
    { COMPUTERNAME: "WORKSTATION", HOSTNAME: "workstation" },
  )
  expect(value?.NO_PROXY).toBe(
    ".example.test,.suffix.test,10.0.0.0-10.255.255.255,192.168.1.0-192.168.1.255,172.1.0.0-172.1.255.255,172.10.0.0-172.19.255.255,172.100.0.0-172.199.255.255,127.0.0.0-127.255.255.255,workstation,localhost,127.0.0.1,::1",
  )
  expect(value?.no_proxy).toBe(value?.NO_PROXY)
})

test("Windows <-loopback> keeps loopback traffic on the proxy route", () => {
  const value = windowsProxyEnvironment(
    { ...windows, bypass: "<-loopback>;<local>;10.*" },
    { COMPUTERNAME: "WORKSTATION" },
  )
  expect(value?.NO_PROXY).toBe("workstation,10.0.0.0-10.255.255.255")
})

test("no configured native proxy preserves the shell environment", () => {
  expect(windowsProxyEnvironment({ ...windows, proxy: "" }, {})).toBeUndefined()
  expect(macProxyEnvironment("<dictionary> {\n}\n", {})).toBeUndefined()
})

test("automatic, scoped, authenticated and unrepresentable policies fail without exposing values", () => {
  for (const auto of [{ autoDetect: true }, { autoConfigUrl: "https://secret.test/pac" }])
    expect(() => windowsProxyEnvironment({ ...windows, ...auto }, {})).toThrow("SYSTEM_PROXY_AUTOMATIC_UNSUPPORTED")
  for (const proxy of ["http=proxy.test:80;http=other.test:80", "socks=proxy.test:1080"])
    expect(() => windowsProxyEnvironment({ ...windows, proxy }, {})).toThrow("SYSTEM_PROXY_PROTOCOL_UNSUPPORTED")
  for (const proxy of ["secret:password@proxy.test:8080", "proxy.test:70000", "proxy.test:0", "proxy.test:80/path"])
    expect(() => windowsProxyEnvironment({ ...windows, proxy }, {})).toThrow("SYSTEM_PROXY_ADDRESS_INVALID")
  for (const bypass of ["169.254/16", "10.*.1.*", "300.*", "proxy.*"])
    expect(() => windowsProxyEnvironment({ ...windows, bypass }, {})).toThrow("SYSTEM_PROXY_BYPASS_UNSUPPORTED")
  for (const key of ["ProxyAutoConfigEnable", "ProxyAutoDiscoveryEnable"])
    expect(() => macProxyEnvironment(mac.replace("  HTTPEnable", `  ${key} : 1\n  HTTPEnable`), {})).toThrow(
      "SYSTEM_PROXY_AUTOMATIC_UNSUPPORTED",
    )
  expect(() =>
    macProxyEnvironment(mac.replace("  HTTPEnable", "  __SCOPED__ : <dictionary> {\n  }\n  HTTPEnable"), {}),
  ).toThrow("SYSTEM_PROXY_SCOPED_UNSUPPORTED")
  expect(() =>
    macProxyEnvironment(mac.replace("  HTTPEnable", "  HTTPRequiresPassword : 1\n  HTTPEnable"), {}),
  ).toThrow("SYSTEM_PROXY_AUTHENTICATION_UNSUPPORTED")
})

test.skipIf(process.platform !== "win32")(
  "native Windows current-user proxy policy is representable",
  () => {
    const value = loadNativeProxy(process.env, "win32")
    expect(value === undefined || value.NODE_USE_ENV_PROXY === "1").toBe(true)
    const desktop = loadSystemProxyEnvironment(process.env)
    const cli = loadCliProxyEnvironment(process.env)
    expect(desktop?.HTTP_PROXY).toBe(value?.HTTP_PROXY)
    expect(desktop?.HTTPS_PROXY).toBe(value?.HTTPS_PROXY)
    expect(desktop?.NO_PROXY).toBe(value?.NO_PROXY)
    expect(cli?.HTTP_PROXY).toBe(desktop?.HTTP_PROXY)
    expect(cli?.HTTPS_PROXY).toBe(desktop?.HTTPS_PROXY)
    expect(cli?.NO_PROXY).toBe(desktop?.NO_PROXY)
  },
  60000,
)

test("malformed native settings and foreign-platform collection cannot silently bypass policy", () => {
  expect(() => windowsProxyEnvironment({ proxy: "proxy.test:80" }, {})).toThrow("SYSTEM_PROXY_SETTINGS_INVALID")
  expect(() => macProxyEnvironment("unexpected", {})).toThrow("SYSTEM_PROXY_SETTINGS_INVALID")
  expect(() => macProxyEnvironment(mac.replace("HTTPEnable : 1", "HTTPEnable : maybe"), {})).toThrow(
    "SYSTEM_PROXY_SETTINGS_INVALID",
  )
  for (const platform of ["win32", "darwin"] as const)
    if (process.platform !== platform)
      expect(() => loadNativeProxy({}, platform)).toThrow("SYSTEM_PROXY_PLATFORM_UNAVAILABLE")
})
