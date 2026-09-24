import { expect, test } from "bun:test"
import { parseProxyAddress, proxyHostPort, resolveSystemProxy } from "../src/system-proxy"

const windows = (proxy: string, bypass = "", extra: Record<string, unknown> = {}) =>
  resolveSystemProxy({
    platform: "win32",
    environment: { COMPUTERNAME: "WORKSTATION" },
    windows: { autoDetect: false, autoConfigUrl: "", proxy, bypass, ...extra },
  })

const rules = async (result: Awaited<ReturnType<typeof resolveSystemProxy>>) =>
  (result.environment?.NO_PROXY ?? "").split(",").filter(Boolean)

test("windows and macOS bypass dialects keep representable rules and skip the rest", async () => {
  const suffix = await windows("127.0.0.1:8080", "*vk.com;*.example.test;.suffix.test;vk.com")
  expect(await rules(suffix)).toEqual([
    "vk.com",
    ".vk.com",
    ".example.test",
    ".suffix.test",
    "localhost",
    "127.0.0.1",
    "::1",
    "[::1]",
  ])

  const skipped = await windows("127.0.0.1:8080", "169.254/16;10.*.1.*;300.*;proxy.*;<-loopback>;<local>")
  expect(skipped.state).toBe("applied")
  expect(skipped.summary.skipped).toEqual(["169.254/16", "10.*.1.*", "300.*", "proxy.*"])
  expect(await rules(skipped)).toContain("workstation")
  expect(await rules(skipped)).toContain("127.0.0.1")
  expect(skipped.notices.map((notice) => notice.code)).toEqual(["rules-skipped", "approximated"])

  const exact = await resolveSystemProxy({
    platform: "linux",
    gnome: `
org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy.http host 'proxy.test'
org.gnome.system.proxy.http port 8080
org.gnome.system.proxy ignore-hosts ['vk.com', '*.internal', '127.0.0.0/8']
`,
  })
  expect(await rules(exact)).toEqual(["vk.com", ".vk.com", ".internal", "localhost", "127.0.0.1", "::1", "[::1]"])
  expect(exact.summary.skipped).toEqual(["127.0.0.0/8"])
})

test("windows proxy grammar accepts addresses and never throws on garbage", async () => {
  expect((await windows("proxy.test:8080")).environment?.HTTPS_PROXY).toBe("http://proxy.test:8080")
  expect((await windows("proxy.test")).environment?.HTTP_PROXY).toBe("http://proxy.test")
  expect((await windows("http://proxy.test")).environment?.HTTP_PROXY).toBe("http://proxy.test")
  expect((await windows("proxy.test:80")).environment?.HTTP_PROXY).toBe("http://proxy.test")
  const split = await windows("http=proxy.test:8080;https=[::1]:8443")
  expect(split.environment).toMatchObject({
    HTTP_PROXY: "http://proxy.test:8080",
    HTTPS_PROXY: "http://[::1]:8443",
  })
  expect((await windows("http=proxy.test:8080")).environment?.HTTPS_PROXY).toBe("")
  const duplicate = await windows("http=proxy.test:8080;http=other.test:8080")
  expect(duplicate.state).toBe("applied")
  expect(duplicate.environment?.HTTP_PROXY).toBe("http://proxy.test:8080")
  const auth = await windows("secret:password@proxy.test:8080")
  expect(auth.state).toBe("applied")
  expect(auth.environment?.HTTP_PROXY).toBe("http://proxy.test:8080")
  expect(auth.summary.http).toBe("proxy.test:8080")
  expect(auth.notices.map((notice) => notice.code)).toContain("auth-required")
  expect(JSON.stringify(auth)).not.toContain("password")
  const invalid = await windows("proxy.test:70000")
  expect(invalid.state).toBe("failed")
  expect(invalid.notices[0]?.code).toBe("internal")
  const socks = await windows("socks=127.0.0.1:1080")
  expect(socks.state).toBe("direct")
  expect(socks.notices.map((notice) => notice.code)).toContain("socks-only")
  const mixed = await windows("http=127.0.0.1:8080;socks=127.0.0.1:1080")
  expect(mixed.state).toBe("applied")
  expect(mixed.environment?.HTTP_PROXY).toBe("http://127.0.0.1:8080")
})

test("a split-tunnel PAC stays unsupported", async () => {
  const gnome = "org.gnome.system.proxy mode 'auto'\n"
  const direct = await resolveSystemProxy({
    platform: "linux",
    gnome,
    pacScript: "if (dnsDomainIs(host, '.local')) return 'DIRECT'; return 'PROXY 127.0.0.1:8080';",
  })
  expect(direct.state).toBe("direct")
  expect(direct.environment).toBeUndefined()
  expect(direct.notices.map((notice) => notice.code)).toContain("automatic-unsupported")

  const commented = await resolveSystemProxy({
    platform: "linux",
    gnome,
    pacScript: "// PROXY 127.0.0.1:8080\nreturn 'DIRECT';",
  })
  expect(commented.environment).toBeUndefined()
  expect(commented.notices.map((notice) => notice.code)).toContain("automatic-unsupported")

  const clash = await resolveSystemProxy({
    platform: "linux",
    gnome,
    pacScript: "return 'PROXY 127.0.0.1:8080; SOCKS5 127.0.0.1:1080; DIRECT';",
  })
  expect(clash.environment?.HTTP_PROXY).toBe("http://127.0.0.1:8080")
})

test("a URL literal does not hide a DIRECT branch in PAC", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    pacScript: `function FindProxyForURL(url, host) {
      if (url.indexOf("https://internal.example/") === 0) return "DIRECT";
      // PROXY unused.example:9090
      return "PROXY 127.0.0.1:8080";
    }`,
  })
  expect(result.environment).toBeUndefined()
  expect(result.notices).toContainEqual({ code: "automatic-unsupported" })
})

test("quotes inside a PAC URL literal do not hide its DIRECT branch", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    pacScript: `function FindProxyForURL(url, host) {
      if (url.indexOf("https://internal.example/don't") === 0) return "DIRECT";
      return "PROXY 127.0.0.1:8080";
    }`,
  })
  expect(result.environment).toBeUndefined()
  expect(result.notices).toContainEqual({ code: "automatic-unsupported" })
})

test("a regular expression does not hide a DIRECT branch in PAC", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    pacScript: String.raw`function FindProxyForURL(url, host) {
      if (/^https?:\/\//.test(url)) return "DIRECT";
      return "PROXY 127.0.0.1:8080";
    }`,
  })
  expect(result.state).toBe("direct")
  expect(result.environment).toBeUndefined()
  expect(result.notices).toContainEqual({ code: "automatic-unsupported" })
})

test("comments and regular expressions do not add PAC routes", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    pacScript: String.raw`function FindProxyForURL(url, host) {
      const pattern = /[\/"']*DIRECT PROXY unused.example:9090/;
      const fraction = 4 / 2; // return "DIRECT";
      /* return "PROXY unused.example:9091"; */
      return "PROXY 127.0.0.1:8080";
    }`,
  })
  expect(result.state).toBe("applied")
  expect(result.environment?.HTTPS_PROXY).toBe("http://127.0.0.1:8080")
  expect(result.notices).toEqual([])
})

test("IPv6 proxy URLs keep a single pair of brackets", () => {
  const parsed = parseProxyAddress("http://[::1]:8080")
  expect(parsed.kind).toBe("http")
  if (parsed.kind === "http") expect(parsed.url).toBe("http://[::1]:8080")
  expect(parseProxyAddress(":8080").kind).toBe("invalid")
  expect(proxyHostPort("http://[::1]:8080")).toBe("[::1]:8080")
})

test("a Chromium IPv6 answer is applied", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'none'\n",
    chromium: [{ url: "https://api.openai.com/v1/models", resolution: "PROXY [::1]:8080;DIRECT" }],
  })
  expect(result.state).toBe("applied")
  expect(result.environment?.HTTPS_PROXY).toBe("http://[::1]:8080")
})

test("an unparseable first Chromium entry is not DIRECT", async () => {
  const result = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
    chromium: [{ url: "https://api.openai.com/v1/models", resolution: "NOTAPROXY;DIRECT" }],
  })
  expect(result.state).toBe("applied")
  expect((result.environment?.NO_PROXY ?? "").split(",")).not.toContain("api.openai.com")
})

test("TLS proxies keep https and their port", async () => {
  expect(parseProxyAddress("https://proxy.test:443")).toMatchObject({ kind: "http", url: "https://proxy.test:443" })
  const chromium = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'none'\n",
    chromium: [{ url: "https://api.openai.com/v1/models", resolution: "HTTPS proxy.test:443" }],
  })
  expect(chromium.environment?.HTTPS_PROXY).toBe("https://proxy.test:443")
  const windows = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "https=proxy.test:443", bypass: "" },
  })
  expect(windows.environment?.HTTPS_PROXY).toBe("http://proxy.test:443")
  const macos = await resolveSystemProxy({
    platform: "darwin",
    macos: "<dictionary> {\n  HTTPSEnable : 1\n  HTTPSProxy : proxy.test\n  HTTPSPort : 443\n}\n",
  })
  expect(macos.environment?.HTTPS_PROXY).toBe("http://proxy.test:443")
  expect(parseProxyAddress("socks5://proxy.test")).toMatchObject({ kind: "socks", url: "http://proxy.test:1080" })
})

test("Chromium keeps the manual HTTP route", async () => {
  const result = await resolveSystemProxy({
    platform: "win32",
    windows: {
      autoDetect: false,
      autoConfigUrl: "",
      proxy: "http=http-proxy.test:8080;https=https-proxy.test:8443",
      bypass: "",
    },
    chromium: [
      { url: "http://example.test/model", resolution: "PROXY http-proxy.test:8080" },
      { url: "https://api.openai.com/v1/models", resolution: "PROXY https-proxy.test:8443" },
    ],
  })
  expect(result.environment?.HTTP_PROXY).toBe("http://http-proxy.test:8080")
  expect(result.environment?.HTTPS_PROXY).toBe("http://https-proxy.test:8443")
})

test("different proxies per provider are reported", async () => {
  const result = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
    chromium: [
      { url: "https://api.openai.com/v1/models", resolution: "PROXY 127.0.0.1:8080" },
      { url: "https://api.anthropic.com/v1/messages", resolution: "PROXY 127.0.0.1:9090" },
    ],
  })
  expect(result.environment?.HTTPS_PROXY).toBe("http://127.0.0.1:8080")
  expect(result.notices).toContainEqual({ code: "routes-merged", detail: "api.anthropic.com" })
})

test("different Chromium routes include SOCKS conflicts in either order", async () => {
  for (const [first, second, ignored] of [
    ["PROXY proxy-a.test:8080", "SOCKS5 proxy-b.test:1080", "api.anthropic.com"],
    ["SOCKS5 proxy-b.test:1080", "PROXY proxy-a.test:8080", "api.openai.com"],
    ["SOCKS5 proxy-a.test:8080", "SOCKS5 proxy-b.test:1080", "api.anthropic.com"],
  ]) {
    const result = await resolveSystemProxy({
      platform: "linux",
      gnome: "org.gnome.system.proxy mode 'auto'\n",
      chromium: [
        { url: "https://api.openai.com/v1/models", resolution: first },
        { url: "https://api.anthropic.com/v1/messages", resolution: second },
      ],
      probe: async () => "http",
    })
    expect(result.environment?.HTTPS_PROXY).toBe("http://proxy-a.test:8080")
    expect(result.notices).toContainEqual({ code: "routes-merged", detail: ignored })
  }
})

test("Chromium SOCKS answers reach the mixed-port check", async () => {
  let probed = ""
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'none'\n",
    chromium: [{ url: "https://api.openai.com/v1/models", resolution: "SOCKS5 127.0.0.1:1080" }],
    probe: async (url) => {
      probed = url
      return "http"
    },
  })
  expect(probed).toContain("127.0.0.1:1080")
  expect(result.state).toBe("applied")
  expect(result.environment?.HTTPS_PROXY).toBe("http://127.0.0.1:1080")
})

test("a manual OS proxy is not bypassed when Chromium answers DIRECT everywhere", async () => {
  const manual = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
    chromium: [{ url: "https://api.openai.com/v1/models", resolution: "DIRECT" }],
  })
  expect(manual.state).toBe("applied")
  expect(manual.environment?.HTTPS_PROXY).toBe("http://127.0.0.1:8080")
  expect((manual.environment?.NO_PROXY ?? "").split(",")).not.toContain("api.openai.com")

  const pac = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    chromium: [{ url: "https://api.openai.com/v1/models", resolution: "DIRECT" }],
  })
  expect(pac.state).toBe("direct")
  expect(pac.notices.map((notice) => notice.code)).not.toContain("automatic-unsupported")
})

test("a proxy address the runtime cannot parse is never applied", async () => {
  const result = await windows(":8080")
  expect(result.state).toBe("failed")
  expect(result.environment).toBeUndefined()
  expect(result.notices.map((notice) => notice.code)).toEqual(["internal"])
})

test("automatic windows proxy stays direct unless a manual or single PAC address exists", async () => {
  const detected = await windows("", "", { autoDetect: true })
  expect(detected.state).toBe("direct")
  expect(detected.notices).toEqual([])
  const manual = await windows("127.0.0.1:8080", "", { autoDetect: true })
  expect(manual.state).toBe("applied")
  const pac = await windows("", "", { autoConfigUrl: "http://127.0.0.1/proxy.pac" })
  expect(pac.state).toBe("direct")
  expect(pac.notices.map((notice) => notice.code)).toContain("automatic-unsupported")
  const script = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    pacScript: "function FindProxyForURL(){ return 'PROXY 127.0.0.1:10809'; }",
  })
  expect(script.environment?.HTTP_PROXY).toBe("http://127.0.0.1:10809")
  const ambiguous = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    pacScript: "return 'PROXY 127.0.0.1:1; PROXY 127.0.0.1:2';",
  })
  expect(ambiguous.state).toBe("direct")
  expect(ambiguous.notices.map((notice) => notice.code)).toContain("automatic-unsupported")
})

test("macOS scutil routes ignore scoped services and keep HTTP beside SOCKS", async () => {
  const manual = await resolveSystemProxy({
    platform: "darwin",
    macos: `<dictionary> {
  HTTPEnable : 1
  HTTPProxy : proxy.test
  HTTPPort : 8080
  HTTPSEnable : 1
  HTTPSProxy : ::1
  HTTPSPort : 8443
  __SCOPED__ : <dictionary> {
    en0 : <dictionary> {
      HTTPEnable : 1
    }
  }
  ExceptionsList : <array> {
    0 : *.example.test
    1 : localhost
  }
}
`,
  })
  expect(manual.state).toBe("applied")
  expect(manual.environment).toMatchObject({
    HTTP_PROXY: "http://proxy.test:8080",
    http_proxy: "http://proxy.test:8080",
    HTTPS_PROXY: "http://[::1]:8443",
  })
  expect(await rules(manual)).toContain(".example.test")
  const socks = await resolveSystemProxy({
    platform: "darwin",
    macos: "<dictionary> {\n  SOCKSEnable : 1\n  SOCKSProxy : 127.0.0.1\n  SOCKSPort : 1080\n}\n",
  })
  expect(socks.notices.map((notice) => notice.code)).toContain("socks-only")
  const both = await resolveSystemProxy({
    platform: "darwin",
    macos: `<dictionary> {
  HTTPEnable : 1
  HTTPProxy : proxy.test
  HTTPPort : 8080
  SOCKSEnable : 1
  SOCKSProxy : 127.0.0.1
  SOCKSPort : 1080
  HTTPRequiresPassword : 1
  ExcludeSimpleHostnames : 1
}
`,
    hostname: "mac-host",
  })
  expect(both.state).toBe("applied")
  expect(both.environment?.HTTP_PROXY).toBe("http://proxy.test:8080")
  expect(both.notices.map((notice) => notice.code)).toEqual(["approximated", "auth-required"])
  expect(await rules(both)).toContain("mac-host")
  const broken = await resolveSystemProxy({ platform: "darwin", macos: "unexpected" })
  expect(broken.state).toBe("failed")
  expect(broken.notices[0]?.code).toBe("internal")
})

test("GNOME schema defaults leave requests direct", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: `org.gnome.system.proxy autoconfig-url ''
org.gnome.system.proxy ignore-hosts ['localhost', '127.0.0.0/8', '::1']
org.gnome.system.proxy mode 'none'
org.gnome.system.proxy use-same-proxy true
org.gnome.system.proxy.ftp host ''
org.gnome.system.proxy.ftp port 0
org.gnome.system.proxy.http authentication-password ''
org.gnome.system.proxy.http authentication-user ''
org.gnome.system.proxy.http enabled false
org.gnome.system.proxy.http host ''
org.gnome.system.proxy.http port 8080
org.gnome.system.proxy.http use-authentication false
org.gnome.system.proxy.https host ''
org.gnome.system.proxy.https port 0
org.gnome.system.proxy.socks host ''
org.gnome.system.proxy.socks port 0
`,
  })
  expect(result.state).toBe("direct")
  expect(result.environment).toBeUndefined()
  expect(result.notices).toEqual([])
})

test("a disabled GNOME proxy ignores stale addresses", async () => {
  const stale = `
org.gnome.system.proxy.http host '127.0.0.1'
org.gnome.system.proxy.http port 10808
org.gnome.system.proxy.https host '127.0.0.1'
org.gnome.system.proxy.https port 10808
org.gnome.system.proxy.socks host '127.0.0.1'
org.gnome.system.proxy.socks port 10808
`
  const none = await resolveSystemProxy({
    platform: "linux",
    gnome: `org.gnome.system.proxy mode 'none'\n${stale}`,
  })
  expect(none.state).toBe("direct")
  expect(none.environment).toBeUndefined()
  expect(none.notices).toEqual([])

  const auto = await resolveSystemProxy({
    platform: "linux",
    gnome: `org.gnome.system.proxy mode 'auto'\n${stale}`,
  })
  expect(auto.state).toBe("direct")
  expect(auto.environment).toBeUndefined()
  expect(auto.notices.map((notice) => notice.code)).toEqual(["automatic-unsupported"])

  const viewed = await resolveSystemProxy({
    platform: "linux",
    gnome: `org.gnome.system.proxy mode 'none'\n${stale}`,
    chromium: async () => "DIRECT",
  })
  expect(viewed.state).toBe("direct")
  expect(viewed.environment).toBeUndefined()
  expect(viewed.notices).toEqual([])

  const garbage = await resolveSystemProxy({
    platform: "linux",
    gnome: `org.gnome.system.proxy mode 'none'
org.gnome.system.proxy.http host 'not a host'
org.gnome.system.proxy.https host 12
org.gnome.system.proxy.https port 'nope'
`,
  })
  expect(garbage.state).toBe("direct")
  expect(garbage.notices).toEqual([])
})

test("KDE manual proxy understands spaced addresses and reversed exceptions", async () => {
  const manual = await resolveSystemProxy({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "KDE" },
    kde: `[Proxy Settings]
ProxyType=1
httpProxy=http://127.0.0.1 8080
httpsProxy=proxy.internal 3128
NoProxyFor=localhost,.example.com
AuthMode=0
`,
  })
  expect(manual.environment).toMatchObject({
    HTTP_PROXY: "http://127.0.0.1:8080",
    HTTPS_PROXY: "http://proxy.internal:3128",
  })
  expect(await rules(manual)).toContain(".example.com")
  const reversed = await resolveSystemProxy({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "KDE" },
    kde: `[Proxy Settings]
ProxyType=1
httpProxy=http://127.0.0.1 8080
NoProxyFor=only.example
ReversedException=true
`,
  })
  expect(reversed.state).toBe("applied")
  expect(await rules(reversed)).not.toContain("only.example")
  expect(reversed.notices.map((notice) => notice.code)).toContain("approximated")
})

test("KDE applies manual addresses only for ProxyType=1", async () => {
  const body = `
httpProxy=http://127.0.0.1 8080
httpsProxy=proxy.internal 3128
socksProxy=127.0.0.1 1080
NoProxyFor=localhost
Proxy Config Script=http://127.0.0.1/proxy.pac
`
  for (const type of [0, 2, 3, 4]) {
    const result = await resolveSystemProxy({
      platform: "linux",
      environment: { XDG_CURRENT_DESKTOP: "KDE" },
      kde: `[Proxy Settings]\nProxyType=${type}\n${body}`,
    })
    expect(result.environment).toBeUndefined()
    expect(result.state).toBe("direct")
    const codes = result.notices.map((notice) => notice.code)
    if (type === 2 || type === 3) expect(codes).toEqual(["automatic-unsupported"])
    else expect(codes).toEqual([])
  }
  const manual = await resolveSystemProxy({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "KDE" },
    kde: `[Proxy Settings]\nProxyType=1\n${body}`,
  })
  expect(manual.state).toBe("applied")
  expect(manual.environment?.HTTP_PROXY).toBe("http://127.0.0.1:8080")
  const preset = await resolveSystemProxy({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "KDE", HTTPS_PROXY: "http://explicit.test:9" },
    kde: "[Proxy Settings]\nProxyType=4\nhttpProxy=http://127.0.0.1 8080\n",
  })
  expect(preset.state).toBe("environment")
  expect(preset.summary.http).toBe("explicit.test:9")
})

test("stale automatic configuration URLs raise no notice when disabled", async () => {
  const kde = await resolveSystemProxy({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "KDE" },
    kde: `[Proxy Settings]
ProxyType=0
Proxy Config Script=http://127.0.0.1/proxy.pac
httpProxy=http://127.0.0.1 8080
`,
  })
  expect(kde.state).toBe("direct")
  expect(kde.notices).toEqual([])

  const macos = await resolveSystemProxy({
    platform: "darwin",
    macos: `<dictionary> {
  ProxyAutoConfigEnable : 0
  ProxyAutoConfigURLString : http://127.0.0.1/proxy.pac
}
`,
  })
  expect(macos.state).toBe("direct")
  expect(macos.notices).toEqual([])
})

test("GNOME ignores use-same-proxy and falls back from HTTPS to HTTP only when HTTPS is unset", async () => {
  const split = await resolveSystemProxy({
    platform: "linux",
    gnome: `
org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy use-same-proxy true
org.gnome.system.proxy.http host 'http-proxy.test'
org.gnome.system.proxy.http port 8080
org.gnome.system.proxy.https host 'https-proxy.test'
org.gnome.system.proxy.https port 8443
`,
  })
  expect(split.environment).toMatchObject({
    HTTP_PROXY: "http://http-proxy.test:8080",
    HTTPS_PROXY: "http://https-proxy.test:8443",
  })

  const httpOnly = await resolveSystemProxy({
    platform: "linux",
    gnome: `
org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy use-same-proxy false
org.gnome.system.proxy.http host 'http-proxy.test'
org.gnome.system.proxy.http port 8080
org.gnome.system.proxy.https host ''
org.gnome.system.proxy.https port 0
`,
  })
  expect(httpOnly.environment).toMatchObject({
    HTTP_PROXY: "http://http-proxy.test:8080",
    HTTPS_PROXY: "http://http-proxy.test:8080",
  })

  const httpsOnly = await resolveSystemProxy({
    platform: "linux",
    gnome: `
org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy use-same-proxy true
org.gnome.system.proxy.http host ''
org.gnome.system.proxy.http port 0
org.gnome.system.proxy.https host 'https-proxy.test'
org.gnome.system.proxy.https port 8443
`,
  })
  expect(httpsOnly.environment?.HTTP_PROXY).toBe("")
  expect(httpsOnly.environment?.HTTPS_PROXY).toBe("http://https-proxy.test:8443")
})

test("GNOME and KDE hosts keep their port field", async () => {
  const gnome = await resolveSystemProxy({
    platform: "linux",
    gnome: `
org.gnome.system.proxy mode 'manual'
org.gnome.system.proxy.http host 'http://proxy.test'
org.gnome.system.proxy.http port 8080
org.gnome.system.proxy.https host '::1'
org.gnome.system.proxy.https port 8443
org.gnome.system.proxy.socks host 'https://socks.test'
org.gnome.system.proxy.socks port 1080
`,
  })
  expect(gnome.environment?.HTTP_PROXY).toBe("http://proxy.test:8080")
  expect(gnome.environment?.HTTPS_PROXY).toBe("http://[::1]:8443")
  expect(gnome.state).toBe("applied")

  const kde = await resolveSystemProxy({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "KDE" },
    kde: `[Proxy Settings]
ProxyType=1
httpProxy=http://proxy.test 8080
httpsProxy=::1 8443
socksProxy=https://socks.test 1080
`,
  })
  expect(kde.environment?.HTTP_PROXY).toBe("http://proxy.test:8080")
  expect(kde.environment?.HTTPS_PROXY).toBe("http://[::1]:8443")
})

test("explicit environment and the switch outrank system settings", async () => {
  const off = await resolveSystemProxy({
    platform: "win32",
    environment: { LOGINOM_AI_AGENT_SYSTEM_PROXY: "off" },
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
  })
  expect(off.state).toBe("off")
  expect(off.environment).toBeUndefined()
  const disabled = await resolveSystemProxy({
    enabled: false,
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
  })
  expect(disabled.state).toBe("off")
  const explicit = await resolveSystemProxy({
    platform: "linux",
    environment: { HTTPS_PROXY: "http://explicit.test:9", NO_PROXY: "keep.test" },
    gnome:
      "org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port 8080\n",
  })
  expect(explicit.state).toBe("environment")
  expect(explicit.environment).toBeUndefined()
  expect(explicit.summary.http).toBe("explicit.test:9")
  const socks = await resolveSystemProxy({
    environment: { ALL_PROXY: "socks5://127.0.0.1:1080" },
    gnome:
      "org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port 8080\n",
  })
  expect(socks.state).toBe("environment")
  expect(socks.notices.map((notice) => notice.code)).toEqual(["environment-socks"])
})

test("linux environment keeps both spellings and merges an existing bypass list", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    environment: { NO_PROXY: "keep.test, .already.test" },
    gnome:
      "org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port 8080\n",
  })
  expect(result.environment?.http_proxy).toBe(result.environment?.HTTP_PROXY)
  expect(result.environment?.no_proxy).toBe(result.environment?.NO_PROXY)
  expect(result.environment?.NO_PROXY?.split(",")).toEqual(
    expect.arrayContaining(["keep.test", ".already.test", "localhost", "[::1]"]),
  )
  expect(result.environment?.NODE_USE_ENV_PROXY).toBe("1")
})

test("a hung chromium adapter falls back to the OS route within its budget", async () => {
  const started = Date.now()
  const result = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
    chromium: () => new Promise(() => undefined),
    chromiumTimeoutMs: 100,
  })
  expect(result.state).toBe("applied")
  expect(result.environment?.HTTP_PROXY).toBe("http://127.0.0.1:8080")
  expect(result.summary.source).toBe("windows")
  expect(result.notices).toEqual([])
  expect(Date.now() - started).toBeLessThan(2000)
})

test("a hung chromium adapter without an OS route reports timeout", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    gnome: "org.gnome.system.proxy mode 'auto'\n",
    chromium: () => new Promise(() => undefined),
    chromiumTimeoutMs: 100,
  })
  expect(result.state).toBe("failed")
  expect(result.notices.map((notice) => notice.code)).toEqual(["timeout"])
  expect(result.environment).toBeUndefined()
})

test("direct chromium hosts are excluded and a broken adapter does not reject", async () => {
  const mixed = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
    chromium: [
      { url: "https://auth.openai.com/oauth/token", resolution: "PROXY 127.0.0.1:8080" },
      { url: "https://github.com/login", resolution: "DIRECT" },
    ],
  })
  expect(mixed.summary.source).toBe("chromium")
  expect(await rules(mixed)).toContain("github.com")
  const broken = await resolveSystemProxy({
    platform: "win32",
    windows: { autoDetect: false, autoConfigUrl: "", proxy: "127.0.0.1:8080", bypass: "" },
    chromium: async () => {
      throw new Error("resolveProxy failed")
    },
  })
  expect(broken.state).toBe("applied")
  expect(broken.environment?.HTTP_PROXY).toBe("http://127.0.0.1:8080")
  expect(broken.notices).toEqual([])
})

test("parsers accept hostile input without throwing", async () => {
  const random = mulberry32(0x5afe)
  const samples = [
    "",
    "\0",
    "<dictionary> {",
    "org.gnome.system.proxy mode",
    "[Proxy Settings]\nProxyType=nope\n",
    "*".repeat(4000),
  ]
  for (let index = 0; index < 40; index++) samples.push(randomText(random))
  for (const sample of samples) {
    const result = await resolveSystemProxy({
      platform: "linux",
      windows: sample,
      macos: sample,
      gnome: sample,
      kde: sample,
    })
    if (result.state !== "applied") continue
    for (const url of [result.environment?.HTTP_PROXY, result.environment?.HTTPS_PROXY]) {
      if (!url) continue
      expect(URL.canParse(url)).toBe(true)
      const parsed = new URL(url)
      expect(parsed.protocol === "http:" || parsed.protocol === "https:").toBe(true)
      expect(parsed.hostname).not.toBe("")
    }
  }
})

function mulberry32(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

function randomText(random: () => number) {
  const alphabet = " \n\t;:=.*[]<>'\"\\/@#%{}()-:"
  const length = Math.floor(random() * 80)
  return Array.from({ length }, () => alphabet[Math.floor(random() * alphabet.length)]).join("")
}
