import { expect, test } from "bun:test"
import { resolveSystemProxy } from "../src/system-proxy"

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
    gnome: "org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port 8080\n",
  })
  expect(explicit.state).toBe("environment")
  expect(explicit.environment).toBeUndefined()
  expect(explicit.summary.http).toBe("explicit.test:9")
  const socks = await resolveSystemProxy({
    environment: { ALL_PROXY: "socks5://127.0.0.1:1080" },
    gnome: "org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port 8080\n",
  })
  expect(socks.state).toBe("environment")
  expect(socks.notices.map((notice) => notice.code)).toEqual(["environment-socks"])
})

test("linux environment keeps both spellings and merges an existing bypass list", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    environment: { NO_PROXY: "keep.test, .already.test" },
    gnome: "org.gnome.system.proxy mode 'manual'\norg.gnome.system.proxy.http host '127.0.0.1'\norg.gnome.system.proxy.http port 8080\n",
  })
  expect(result.environment?.http_proxy).toBe(result.environment?.HTTP_PROXY)
  expect(result.environment?.no_proxy).toBe(result.environment?.NO_PROXY)
  expect(result.environment?.NO_PROXY?.split(",")).toEqual(
    expect.arrayContaining(["keep.test", ".already.test", "localhost", "[::1]"]),
  )
  expect(result.environment?.NODE_USE_ENV_PROXY).toBe("1")
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
  expect(broken.notices.map((notice) => notice.code)).toContain("internal")
})

test("parsers accept hostile input without throwing", () => {
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
    expect(() =>
      resolveSystemProxy({
        platform: "linux",
        windows: sample,
        macos: sample,
        gnome: sample,
        kde: sample,
      }),
    ).not.toThrow()
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
