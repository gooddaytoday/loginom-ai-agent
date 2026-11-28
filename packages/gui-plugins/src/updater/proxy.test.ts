import { expect, test } from "bun:test"
import { updateProxy } from "../update-proxy"

test.each([
  [{}, "system"],
  [{ LOGINOM_AI_AGENT_SYSTEM_PROXY: "off" }, "direct"],
  [{ LOGINOM_AI_AGENT_SYSTEM_PROXY: "off", HTTPS_PROXY: "http://proxy.example:8080" }, "fixed_servers"],
] as const)("selects updater session mode for %j", (environment, mode) => {
  expect(updateProxy(environment).config.mode).toBe(mode)
})

test("disabling system proxy for updater does not override HTTPS_PROXY", () => {
  expect(updateProxy({}, false).config.mode).toBe("direct")
  expect(updateProxy({ HTTPS_PROXY: "http://explicit.example:8080" }, false).config.mode).toBe("fixed_servers")
})

test("updater sends explicit credentials only to the matching proxy and protects loopback", () => {
  const proxy = updateProxy({
    HTTP_PROXY: "http://fallback.example:8888",
    HTTPS_PROXY: "http://name:secret@proxy.example:8080",
    NO_PROXY: "internal.example,<-loopback>",
    no_proxy: "another.example",
  })

  expect(proxy.config).toEqual({
    mode: "fixed_servers",
    proxyRules: "http=http://fallback.example:8888;https=http://proxy.example:8080",
    proxyBypassRules: "internal.example;another.example;localhost;127.0.0.1;[::1]",
  })
  const challenge = { isProxy: true, host: "proxy.example", port: 8080 }
  expect(proxy.credentials(challenge)).toMatchObject({ username: "name", password: "secret" })
  expect(proxy.credentials({ ...challenge, isProxy: false })).toBeUndefined()
  expect(proxy.credentials({ ...challenge, port: 8081 })).toBeUndefined()
  expect(proxy.credentials({ ...challenge, host: "fallback.example" })).toBeUndefined()
})
