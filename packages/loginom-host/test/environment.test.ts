import { expect, test } from "bun:test"
import { runtimeEnvironment } from "../src/supervisor"

test("runtime inherits proxy routes and Linux system settings without provider credentials", () => {
  const env = runtimeEnvironment(
    {
      HTTP_PROXY: "http://127.0.0.1:10808",
      HTTPS_PROXY: "http://127.0.0.1:10808",
      NO_PROXY: "localhost,.internal",
      NODE_USE_ENV_PROXY: "1",
      NODE_EXTRA_CA_CERTS: "/test/private-ca.pem",
      NODE_USE_SYSTEM_CA: "1",
      DBUS_SESSION_BUS_ADDRESS: "unix:path=/run/user/1000/bus",
      XDG_CONFIG_HOME: "/test/config",
      OPENAI_API_KEY: "private-key",
      LOGINOM_AI_AGENT_SERVER_PASSWORD: "private-password",
    },
    "linux",
  )
  expect(env.HTTP_PROXY).toBe("http://127.0.0.1:10808")
  expect(env.HTTPS_PROXY).toBe(env.HTTP_PROXY)
  expect(env.NO_PROXY).toBe("localhost,.internal")
  expect(env.NODE_USE_ENV_PROXY).toBe("1")
  expect(env.NODE_EXTRA_CA_CERTS).toBe("/test/private-ca.pem")
  expect(env.NODE_USE_SYSTEM_CA).toBe("1")
  expect(env.DBUS_SESSION_BUS_ADDRESS).toBe("unix:path=/run/user/1000/bus")
  expect(env.XDG_CONFIG_HOME).toBe("/test/config")
  expect(env.OPENAI_API_KEY).toBeUndefined()
  expect(env.LOGINOM_AI_AGENT_SERVER_PASSWORD).toBeUndefined()
  expect(
    runtimeEnvironment({ DBUS_SESSION_BUS_ADDRESS: "private-linux-bus" }, "darwin").DBUS_SESSION_BUS_ADDRESS,
  ).toBeUndefined()
})

test("Windows environment keeps mixed-case OS/proxy keys with one canonical spelling", () => {
  const env = runtimeEnvironment(
    {
      SystemRoot: "C:\\Windows",
      SystemDrive: "C:",
      UserProfile: "C:\\Users\\fixture",
      ProgramData: "C:\\ProgramData",
      AppData: "C:\\Users\\fixture\\AppData\\Roaming",
      LocalAppData: "C:\\Users\\fixture\\AppData\\Local",
      Temp: "C:\\Temp",
      https_proxy: "http://proxy.test:8080",
      HTTPS_PROXY: "http://preferred.test:8080",
      node_extra_ca_certs: "C:\\certs\\test.pem",
      OpenAI_Api_Key: "must-not-inherit",
      Path: "untrusted-tools",
      DISPLAY: ":0",
    },
    "win32",
  )
  expect(env).toEqual({
    SYSTEMROOT: "C:\\Windows",
    SYSTEMDRIVE: "C:",
    USERPROFILE: "C:\\Users\\fixture",
    PROGRAMDATA: "C:\\ProgramData",
    APPDATA: "C:\\Users\\fixture\\AppData\\Roaming",
    LOCALAPPDATA: "C:\\Users\\fixture\\AppData\\Local",
    TEMP: "C:\\Temp",
    HTTPS_PROXY: "http://preferred.test:8080",
    NODE_EXTRA_CA_CERTS: "C:\\certs\\test.pem",
  })
  expect(runtimeEnvironment({ SystemRoot: "mixed", SYSTEMROOT: "exact" }, "linux")).toEqual({ SYSTEMROOT: "exact" })
})

test("explicit lowercase proxy, CA and bypass keys survive without OS or model settings", () => {
  expect(
    runtimeEnvironment({
      http_proxy: "http://proxy.test:8080",
      https_proxy: "http://tls-proxy.test:8080",
      all_proxy: "http://fallback.test:8080",
      no_proxy: "127.0.0.1,.internal",
      SSL_CERT_FILE: "/fixture/system.pem",
      SSL_CERT_DIR: "/fixture/certs",
      NODE_OPTIONS: "--untrusted",
      ANTHROPIC_API_KEY: "fixture-provider",
      LOGINOM_AI_AGENT_SYSTEM_PROXY: "on",
    }),
  ).toEqual({
    http_proxy: "http://proxy.test:8080",
    https_proxy: "http://tls-proxy.test:8080",
    all_proxy: "http://fallback.test:8080",
    no_proxy: "127.0.0.1,.internal",
    SSL_CERT_FILE: "/fixture/system.pem",
    SSL_CERT_DIR: "/fixture/certs",
  })
})
