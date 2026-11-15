import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { settingsLiveConfig } from "../script/windows-settings-live"
import { settingsLiveLaunchOptions } from "../../desktop/test/loginom/settings-live.mjs"

test("Windows settings driver forwards the existing cloud fixture and stand settings", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settings-live-contract-"))
  try {
    const profile = join(directory, "profile")
    await mkdir(join(profile, "loginom/connection"), { recursive: true })
    await writeFile(join(profile, "loginom/connection/connection.json"), JSON.stringify({
      url: "https://stand.test/app/", username: "tester", secrets: "unreadable-private-envelope",
    }))
    const cloud = { control: "http://127.0.0.1:1234", proxy: "http://127.0.0.1:5678", cert: join(directory, "ca.pem"),
      endpoints: { site: "https://127.0.0.2:9999", primary: "https://127.0.0.2:9999/primary/mcp", reserve: "https://127.0.0.2:9999/reserve/mcp" } }
    const fixture = join(directory, "fixture.json")
    await writeFile(fixture, JSON.stringify(cloud))
    const config = await settingsLiveConfig({
      LOGINOM_AI_AGENT_TEST_DESKTOP_EXECUTABLE: "Desktop.exe",
      LOGINOM_AI_AGENT_TEST_RESOURCES: join(directory, "resources"),
      LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE: profile,
      LOGINOM_AI_AGENT_TEST_CLOUD_FIXTURE: fixture,
    })
    expect(config.command[0]).toBe(join(directory, "resources/bin/node.exe"))
    expect(config.command[1]).toEndWith("desktop/test/loginom/settings-live.mjs")
    expect(config.input).toEqual({ executable: "Desktop.exe", connection: { url: "https://stand.test/app/", username: "tester" }, cloud })
    expect(JSON.stringify(config.input)).not.toContain("unreadable-private-envelope")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test.skipIf(process.platform === "win32")("POSIX settings launch discovers fixture proxy through the login shell", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settings-live-posix-"))
  try {
    const input = { executable: "Desktop", cloud: {
      control: "http://127.0.0.1:1234", proxy: "http://127.0.0.1:5678", cert: join(directory, "ca.pem"),
    } }
    const launch = await settingsLiveLaunchOptions(input, directory, "linux", {
      PATH: process.env.PATH, HTTPS_PROXY: "http://ambient.test", http_proxy: "http://ambient.test", NO_PROXY: "ambient.test",
    })
    expect(launch.env).toMatchObject({ SHELL: join(directory, "login-shell"), NODE_EXTRA_CA_CERTS: input.cloud.cert })
    expect(launch.env).not.toHaveProperty("HTTPS_PROXY")
    expect(launch.env).not.toHaveProperty("http_proxy")
    const shell = Bun.spawn([join(directory, "login-shell")], { env: launch.env, stdout: "pipe", stderr: "pipe" })
    const output = await new Response(shell.stdout).text()
    expect(await shell.exited).toBe(0)
    expect(output.split("\0")).toEqual(expect.arrayContaining([
      `HTTPS_PROXY=${input.cloud.proxy}`, `HTTP_PROXY=${input.cloud.proxy}`, "NO_PROXY=",
    ]))
    expect(await new Response(shell.stderr).text()).toBe("")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("settings launch rejects non-loopback fixture destinations before launch", async () => {
  for (const field of ["control", "proxy"]) {
    const cloud = { control: "http://127.0.0.1:1234", proxy: "http://127.0.0.1:5678", cert: "fixture.pem", [field]: "https://external.test" }
    await expect(settingsLiveLaunchOptions({ executable: "unused", cloud }, "unused", "win32", {})).rejects.toThrow()
  }
})

test("Windows settings launch uses explicit fixture proxy and CA without a POSIX shell", async () => {
  const directory = await mkdtemp(join(tmpdir(), "settings-live-windows-"))
  try {
    const input = { executable: "Desktop.exe", cloud: {
      control: "http://127.0.0.1:1234", proxy: "http://127.0.0.1:5678", cert: join(directory, "ca.pem"),
    } }
    const launch = await settingsLiveLaunchOptions(input, directory, "win32", {
      PATH: "fixture-path", HTTP_PROXY: "http://ambient.test", https_proxy: "http://ambient.test", ALL_PROXY: "http://ambient.test",
    })
    expect(launch).toMatchObject({ executablePath: "Desktop.exe", env: {
      PATH: "fixture-path", HTTPS_PROXY: input.cloud.proxy, HTTP_PROXY: input.cloud.proxy, NO_PROXY: "",
      NODE_EXTRA_CA_CERTS: input.cloud.cert, LOGINOM_AI_AGENT_TEST_ROOT: join(directory, "profile"),
    } })
    expect(launch.env).not.toHaveProperty("SHELL")
    expect(launch.env).not.toHaveProperty("https_proxy")
    expect(launch.env).not.toHaveProperty("ALL_PROXY")
    expect(await Bun.file(join(directory, "login-shell")).exists()).toBe(false)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
