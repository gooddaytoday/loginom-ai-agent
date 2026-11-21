import { Service } from "@opencode/client/service"
import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

// Contract (U5, catalog CAT-13): Desktop finds the background service only through the registration the CLI writes
// under the same identity, `<state>/loginom-ai-agent/service-<identity>.json`, so it never adopts another product's or
// profile's `service.json` of the same version. serviceFile() reads the environment, so each case runs in a fresh process.
const version = "2.3.0-test"
const cleanup: Array<() => Promise<unknown>> = []

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((run) => run()))
})

describe("service-identity", () => {
  test.each([
    {
      env: { LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent/desktop", XDG_STATE_HOME: "/state" },
      expected: path.join("/state", "loginom-ai-agent", "service-loginom-ai-agent-desktop.json"),
    },
    {
      // An empty XDG_STATE_HOME falls back to the home directory, as the CLI's global roots do.
      env: { LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent-desktop", XDG_STATE_HOME: "" },
      expected: path.join("<home>", ".local", "state", "loginom-ai-agent", "service-loginom-ai-agent-desktop.json"),
    },
    { env: { XDG_STATE_HOME: "/state" }, expected: "" },
    { env: { LOGINOM_AI_AGENT_SERVICE_IDENTITY: "", XDG_STATE_HOME: "/state" }, expected: "" },
  ])("serviceFile() with $env", async (input) => {
    expect(await serviceFile(input.env)).toBe(input.expected)
  })

  test("finds its own service and never the service.json of another service with the same version", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-service-identity-"))
    cleanup.push(() => fs.rm(root, { recursive: true, force: true }))
    const own = await serviceFile({
      LOGINOM_AI_AGENT_SERVICE_IDENTITY: "loginom-ai-agent-desktop",
      XDG_STATE_HOME: root,
    })
    const other = fakeService(101)
    const mine = fakeService(202)
    const shared = path.join(root, "loginom-ai-agent", "service.json")
    await fs.mkdir(path.dirname(shared), { recursive: true })
    await fs.writeFile(shared, JSON.stringify(other))

    // The default registration answers with a matching version: a probe without the identity file would adopt it.
    expect((await Service.discover({ version, file: shared }))?.url).toBe(other.url)
    expect(own).toBe(path.join(root, "loginom-ai-agent", "service-loginom-ai-agent-desktop.json"))
    expect(await Service.discover({ version, file: own })).toBeUndefined()

    await fs.writeFile(own, JSON.stringify(mine))
    expect((await Service.discover({ version, file: own }))?.url).toBe(mine.url)
  })
})

async function serviceFile(env: Record<string, string>) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "desktop-service-identity-home-"))
  cleanup.push(() => fs.rm(home, { recursive: true, force: true }))
  const child = Bun.spawn(
    [
      process.execPath,
      "-e",
      'const { serviceFile } = await import("./service-identity"); console.log(serviceFile() ?? "")',
    ],
    {
      cwd: import.meta.dir,
      env: {
        PATH: process.env.PATH,
        HOME: home,
        USERPROFILE: home,
        LOGINOM_AI_AGENT_SERVICE_IDENTITY: undefined,
        XDG_STATE_HOME: undefined,
        ...env,
      },
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  return stdout.trim().replace(home, "<home>")
}

function fakeService(pid: number) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === "/api/info"
        ? Response.json({ version, pid })
        : new Response("not found", { status: 404 }),
  })
  cleanup.push(() => server.stop(true))
  return { id: `service-${pid}`, version, url: server.url.origin, pid, password: `secret-${pid}` }
}
