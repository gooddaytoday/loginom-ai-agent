import { expect, test } from "bun:test"
import { once } from "node:events"
import { cloudBuild } from "../script/cloud-build"

const endpoints = {
  site: "https://staging.loginom.test",
  primary: "https://p.loginom.test/mcp",
  reserve: "https://r.loginom.test/mcp",
}

test("cloud overrides require an explicitly selected local dev channel", () => {
  expect(() => cloudBuild({
    LOGINOM_AI_AGENT_CHANNEL: "prod",
    LOGINOM_AI_AGENT_CLOUD_BUILD: JSON.stringify(endpoints),
  })).toThrow("LOGINOM_CLOUD_BUILD_FORBIDDEN")
  expect(cloudBuild({ LOGINOM_AI_AGENT_CHANNEL: "prod" })).toBeUndefined()
})

test("dev cloud builds accept one complete HTTPS tuple and reject malformed destinations without echoing input", () => {
  expect(cloudBuild({ LOGINOM_AI_AGENT_CHANNEL: "dev", LOGINOM_AI_AGENT_CLOUD_BUILD: JSON.stringify(endpoints) })).toEqual(endpoints)
  for (const input of [
    "", "not-json", "null", "[]", '"text"',
    JSON.stringify({ ...endpoints, reserve: undefined }),
    JSON.stringify({ ...endpoints, extra: "ignored" }),
    ...["", " ", "http://localhost", "https://user:canary@example.test/mcp", "/relative", "malformed"].map((primary) => JSON.stringify({ ...endpoints, primary })),
  ]) {
    expect(() => cloudBuild({ LOGINOM_AI_AGENT_CHANNEL: "dev", LOGINOM_AI_AGENT_CLOUD_BUILD: input })).toThrow("LOGINOM_CLOUD_BUILD_INVALID")
  }
  for (const channel of [undefined, "", "latest", "beta", "prod"]) {
    expect(() => cloudBuild({ LOGINOM_AI_AGENT_CHANNEL: channel, LOGINOM_AI_AGENT_CLOUD_BUILD: "" })).toThrow("LOGINOM_CLOUD_BUILD_FORBIDDEN")
  }
})

test("every release environment rejects even an empty dev override before creating artifacts", async () => {
  const { parse } = await import("yaml")
  const workflow = parse(await Bun.file(new URL("../../../.github/workflows/release.yml", import.meta.url)).text())
  for (const job of ["verify", "build", "windows", "macos"]) {
    const guard = workflow.jobs[job].steps.find((step: { name?: string }) => step.name === "Reject cloud build override")
    expect(guard).toBeDefined()
    expect(guard.shell).toBe("bash")
    expect(workflow.jobs[job].steps.indexOf(guard)).toBe(0)
    for (const channel of ["prod", "dev"]) {
      for (const value of [undefined, "", JSON.stringify(endpoints)]) {
        const child = Bun.spawn(["/bin/bash", "-c", guard.run + '\nprintf "BUILD_REACHED"'], {
          env: {
            LOGINOM_AI_AGENT_CHANNEL: channel,
            ...(value === undefined ? {} : { LOGINOM_AI_AGENT_CLOUD_BUILD: value }),
          },
          stdout: "pipe", stderr: "pipe",
        })
        const output = await new Response(child.stdout).text()
        expect(await child.exited).toBe(value === undefined ? 0 : 1)
        expect(output.includes("BUILD_REACHED")).toBe(value === undefined)
        expect(output).not.toContain(endpoints.site)
        expect(await new Response(child.stderr).text()).toBe("")
      }
    }
  }
})

test("the actual Node builder bakes the dev tuple for short private management calls", async () => {
  const { join } = await import("node:path")
  const { environmentProxy } = await import("../../desktop/test/loginom/environment-proxy")
  const { launchNodeHost } = await import("../src/node-client")
  const fixture = await environmentProxy((req, res) => {
    res.setHeader("content-type", "application/json")
    if (req.url === "/api/auth/device/code") return void res.end(JSON.stringify({
      device_code: "DEVICE-CANARY", user_code: "TEST-CODE",
      verification_uri_complete: "https://proxy-target.test/device", expires_in: 600, interval: 60,
    }))
    res.statusCode = 404
    res.end("{}")
  })
  try {
    const output = join(fixture.directory, "host")
    const builder = Bun.spawn([process.execPath, join(import.meta.dir, "../script/build-node-host.ts"), output], {
      env: { ...process.env, LOGINOM_AI_AGENT_CHANNEL: "dev", LOGINOM_AI_AGENT_CLOUD_BUILD: JSON.stringify({
        site: "https://proxy-target.test", primary: "https://proxy-target.test/primary/mcp", reserve: "https://proxy-target.test/reserve/mcp",
      }) }, stdout: "pipe", stderr: "pipe",
    })
    expect(await builder.exited).toBe(0)
    expect(await new Response(builder.stderr).text()).toBe("")
    const host = await launchNodeHost({
      node: process.env.LOGINOM_AI_AGENT_TEST_NODE!, entry: join(output, "node-host.mjs"),
      root: join(fixture.directory, "profile"), resources: fixture.directory, headless: true,
      environment: { NODE_EXTRA_CA_CERTS: fixture.cert, HTTPS_PROXY: `http://127.0.0.1:${fixture.port(fixture.proxy)}`, NO_PROXY: "" },
    })
    try {
      expect(await host.request("connection.cloud-start", {})).toMatchObject({ cloud: { pending: { userCode: "TEST-CODE" } } })
      expect(await host.request("connection.status", {})).toMatchObject({ cloud: { connected: false, pending: { userCode: "TEST-CODE" } } })
      expect(await host.request("connection.cloud-cancel", {})).toMatchObject({ cloud: { connected: false } })
      expect(fixture.targetRequests).toEqual(["/api/auth/device/code"])
      expect(fixture.directTargetRequests).toBe(0)
    } finally {
      await host.close()
    }
    expect(await host.exited).toEqual({ code: 0, signal: null })
  } finally {
    await fixture.close()
  }
}, 30000)

test("Desktop main receives the same validated build literal", async () => {
  const { join } = await import("node:path")
  const child = Bun.spawn([process.execPath, "-e", `
    import config from ${JSON.stringify(join(import.meta.dir, "../../desktop/electron.vite.config.ts"))};
    const literal = config.main.define["import.meta.env.LOGINOM_AI_AGENT_CLOUD_BUILD"];
    if (literal !== process.env.LOGINOM_AI_AGENT_CLOUD_BUILD) process.exit(1);
  `], {
    cwd: join(import.meta.dir, "../../desktop"),
    env: { ...process.env, LOGINOM_AI_AGENT_CHANNEL: "dev", LOGINOM_AI_AGENT_CLOUD_BUILD: JSON.stringify(endpoints) },
    stdout: "pipe", stderr: "pipe",
  })
  expect(await new Response(child.stderr).text()).toBe("")
  expect(await child.exited).toBe(0)
})

test("all build entrypoints reject release overrides before prerequisites or output creation", async () => {
  const { join } = await import("node:path")
  for (const script of ["../script/build-node-host.ts", "../script/build-cli.ts", "../../desktop/scripts/bundle-loginom.ts", "../../desktop/scripts/prebuild.ts"]) {
    const child = Bun.spawn([process.execPath, join(import.meta.dir, script)], {
      env: { PATH: "", TMPDIR: process.env.TMPDIR, TMP: process.env.TMP, TEMP: process.env.TEMP,
        LOGINOM_AI_AGENT_CHANNEL: "prod", LOGINOM_AI_AGENT_CLOUD_BUILD: JSON.stringify(endpoints) },
      stdout: "pipe", stderr: "pipe",
    })
    const errors = await new Response(child.stderr).text()
    expect(await child.exited).not.toBe(0)
    expect(errors).toContain("LOGINOM_CLOUD_BUILD_FORBIDDEN")
    expect(errors).not.toContain(endpoints.site)
  }
})

test("a compiled release ignores runtime endpoint variables and cannot send credentials to their collector", async () => {
  const { fork } = await import("node:child_process")
  const { createServer } = await import("node:http")
  const { mkdtemp, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { transport } = await import("../src/transport")
  const directory = await mkdtemp(join(tmpdir(), "release-cloud-boundary-"))
  const authorities: string[] = []
  let collected = 0
  const collector = createServer((_request, response) => { collected++; response.end("{}"); })
  const proxy = createServer()
  proxy.on("connect", (request, socket) => {
    authorities.push(request.url!)
    socket.end("HTTP/1.1 502 Refused\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
  })
  collector.listen(0, "127.0.0.1")
  proxy.listen(0, "127.0.0.1")
  await Promise.all([once(collector, "listening"), once(proxy, "listening")])
  const port = (server: typeof proxy) => (server.address() as import("node:net").AddressInfo).port
  const destination = `http://127.0.0.1:${port(collector)}`
  try {
    // A separate builder avoids Bun test loader/build cache interference.
    const builder = Bun.spawn([process.execPath, join(import.meta.dir, "../script/build-node-host.ts"), directory], {
      env: { ...process.env, LOGINOM_AI_AGENT_CHANNEL: "prod", LOGINOM_AI_AGENT_CLOUD_BUILD: undefined },
      stdout: "pipe", stderr: "pipe",
    })
    expect(await builder.exited).toBe(0)
    expect(await new Response(builder.stderr).text()).toBe("")
    const entry = join(directory, "node-host.mjs")
    const child = fork(entry, [], {
      execPath: process.env.LOGINOM_AI_AGENT_TEST_NODE!, execArgv: ["--use-system-ca"],
      env: { HTTPS_PROXY: `http://127.0.0.1:${port(proxy)}`, NO_PROXY: "",
        LOGINOM_AI_AGENT_CLOUD_BUILD: JSON.stringify({ site: destination, primary: destination, reserve: destination }),
        LOGINOM_AI_AGENT_KNOWLEDGE_ENDPOINT: destination },
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    })
    const exited = once(child, "exit")
    const output: Buffer[] = []
    child.stdout!.on("data", (value) => output.push(value))
    child.stderr!.on("data", (value) => output.push(value))
    const client = transport({ postMessage: (value) => child.send(value as object),
      on: (_event, listener) => child.on("message", (data) => listener({ data })), start() {} })
    try {
      await client.request("start", { protocol: 1, root: join(directory, "profile"), resources: directory, headless: true })
      await expect(client.request("connection.cloud-start", {})).rejects.toThrow("LOGINOM_CLOUD_UNAVAILABLE")
      expect(authorities).toEqual(["loginom.ai:443"])
      expect(collected).toBe(0)
    } finally {
      await client.request("close", {})
      expect(await exited).toEqual([0, null])
      client.close()
    }
    expect(Buffer.concat(output).toString()).toBe("")
  } finally {
    proxy.closeAllConnections(); proxy.close()
    collector.closeAllConnections(); collector.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 30000)
