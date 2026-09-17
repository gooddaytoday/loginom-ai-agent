import { expect, test } from "bun:test"
import { runtimeEnvironment } from "../src/supervisor"

test("runtime inherits proxy routes and Linux system settings without provider credentials", () => {
  const env = runtimeEnvironment(
    {
      HTTP_PROXY: "http://127.0.0.1:10808",
      HTTPS_PROXY: "http://127.0.0.1:10808",
      NO_PROXY: "localhost,.internal",
      NODE_USE_ENV_PROXY: "1",
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
  expect(env.DBUS_SESSION_BUS_ADDRESS).toBe("unix:path=/run/user/1000/bus")
  expect(env.XDG_CONFIG_HOME).toBe("/test/config")
  expect(env.OPENAI_API_KEY).toBeUndefined()
  expect(env.LOGINOM_AI_AGENT_SERVER_PASSWORD).toBeUndefined()
  expect(
    runtimeEnvironment({ DBUS_SESSION_BUS_ADDRESS: "private-linux-bus" }, "darwin").DBUS_SESSION_BUS_ADDRESS,
  ).toBeUndefined()
})
