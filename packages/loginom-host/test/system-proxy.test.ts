import { expect, test } from "bun:test"
import { resolveSystemProxy } from "../src/system-proxy"

const incidentBypass =
  "localhost;*.local;*.loginom.ru;*vk.com;192.168.*;10.200.*;10.1.3.*;*qwen.ai;*deepseek.com;*yandex.net;*github.com;google.com;*loginom.dev;*.ru;*yastatic.net;*altlinux.org;<local>"

test("incident Windows proxy override is applied without throwing", async () => {
  const result = await resolveSystemProxy({
    platform: "win32",
    environment: { COMPUTERNAME: "WORKSTATION" },
    windows: {
      autoDetect: false,
      autoConfigUrl: "",
      proxy: "127.0.0.1:9697",
      bypass: incidentBypass,
    },
  })

  expect(result.state).toBe("applied")
  expect(result.environment?.HTTP_PROXY).toBe("http://127.0.0.1:9697")
  expect(result.environment?.HTTPS_PROXY).toBe("http://127.0.0.1:9697")
  expect(result.environment?.http_proxy).toBeUndefined()
  expect(result.environment?.NODE_USE_ENV_PROXY).toBe("1")
  expect(result.summary.http).toBe("127.0.0.1:9697")
  expect(result.summary.https).toBe("127.0.0.1:9697")
  const rules = (result.environment?.NO_PROXY ?? "").split(",")
  for (const rule of [
    "localhost",
    ".local",
    ".loginom.ru",
    "vk.com",
    ".vk.com",
    "qwen.ai",
    ".qwen.ai",
    "google.com",
    ".ru",
    "workstation",
    "127.0.0.1",
    "::1",
    "[::1]",
  ])
    expect(rules).toContain(rule)
  expect(rules.some((rule) => rule.includes("192.168") || rule.includes("10.200") || rule.includes("10.1.3"))).toBe(
    false,
  )
  expect(result.summary.skipped).toEqual(["192.168.*", "10.200.*", "10.1.3.*"])
  expect(result.notices.map((notice) => notice.code)).toEqual(["rules-skipped", "approximated"])
})

test("chromium supplies the proxy when the operating system has no manual route", async () => {
  const result = await resolveSystemProxy({
    platform: "linux",
    environment: { XDG_CURRENT_DESKTOP: "GNOME" },
    read: async () => ({}),
    chromium: [{ url: "https://auth.openai.com/oauth/token", resolution: "PROXY 127.0.0.1:7890" }],
  })
  expect(result.state).toBe("applied")
  expect(result.environment?.HTTP_PROXY).toBe("http://127.0.0.1:7890")
  expect(result.summary.source).toBe("chromium")
})
