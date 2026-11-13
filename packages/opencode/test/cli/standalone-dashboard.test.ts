import { expect, test } from "bun:test"
import { ManagedRuntime, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { once } from "node:events"
import { cp, mkdir, readdir, symlink, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { dashboardServer } from "@loginom-ai-agent/dashboard/web/server"
import { bindingKey } from "@loginom-ai-agent/dashboard/contract/snapshot"
import { dashboardPrompt } from "@loginom-ai-agent/dashboard/contract/prompt"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { profilePaths } from "@loginom-ai-agent/product/cli-profile"
import { profileEnvironment } from "../../src/cli/profile"
import { dashboardFlag } from "../../src/cli/standalone-dashboard"
import { standaloneFixture, invoke } from "../fixture/standalone"
import { TestLLMServer } from "../lib/llm-server"
import { testProviderConfig } from "../lib/test-provider"

test("dashboard flags preserve the message and the argument boundary", () => {
  const id = "77015e88-b7dd-408f-b09d-fb67dbad931d"
  expect(dashboardFlag(["--dashboard", id, "--", "текст"], "run")).toEqual({ id, rest: ["--", "текст"] })
  expect(dashboardFlag(["--dashboard=" + id, "текст"], "run")).toEqual({ id, rest: ["текст"] })
  expect(dashboardFlag(["текст"], "run")).toBeUndefined()
  expect(dashboardFlag(["--", "--dashboard", id], "run")).toBeUndefined()
})

test("dashboard rejects conflicting flags, missing IDs and the TUI", () => {
  const id = "77015e88-b7dd-408f-b09d-fb67dbad931d"
  for (const flag of ["--dir", "--attach", "--continue", "-c", "--session", "-s", "--fork", "--command"]) {
    expect(dashboardFlag(["--dashboard", id, flag], "run")).toBe("invalid")
    expect(dashboardFlag([flag + "=value", "--dashboard=" + id], "run")).toBe("invalid")
  }
  for (const args of [
    ["--dashboard"],
    ["--dashboard="],
    ["--dashboard", "--"],
    ["--dashboard", "--model", "test/model"],
  ]) {
    expect(dashboardFlag(args, "run")).toBe("invalid")
  }
  expect(dashboardFlag(["--dashboard", id], "tui")).toBe("invalid")
})

test("RunCommand parses the dashboard directory before the message boundary", async () => {
  const { default: yargs } = await import("yargs")
  const { RunCommand } = await import("../../src/cli/cmd/run")
  const dashboard = dashboardFlag(["run", "--dashboard", "77015e88-b7dd-408f-b09d-fb67dbad931d", "--", "текст"], "run")
  if (!dashboard || dashboard === "invalid") throw Error("Expected dashboard arguments")
  const work = "/test-user/profile/data/dashboards/campaign-12345678/work"
  const argv = await yargs()
    .parserConfiguration({ "populate--": true })
    .command({ ...RunCommand, handler: () => {} })
    .exitProcess(false)
    .strict()
    .parseAsync(["--dir", work, ...dashboard.rest])
  expect(argv.dir).toBe(work)
  expect(argv["--"]).toEqual(["текст"])
})

test("standalone dashboard reports invalid arguments and missing connection without creating a project", async () => {
  await using fixture = await standaloneFixture()
  const id = "77015e88-b7dd-408f-b09d-fb67dbad931d"
  const invalid = await invoke(fixture, ["--dashboard", id, "--continue", "--", "текст"], undefined, undefined, false)
  expect(invalid).toMatchObject({
    exit: 2,
    errors: "CLI_ARGUMENT_INVALID\n",
    events: [{ type: "error", error: { name: "CLI_ARGUMENT_INVALID" } }],
  })
  const unconfigured = await invoke(fixture, ["--dashboard", id, "--", "текст"], undefined, undefined, false)
  expect(unconfigured).toMatchObject({
    exit: 2,
    errors: "LOGINOM_CONFIG_REQUIRED\n",
    events: [{ type: "error", error: { name: "LOGINOM_CONFIG_REQUIRED" } }],
  })
  expect(await readdir(join(fixture.profile, "data"))).not.toContain("dashboards")
  expect(await readdir(fixture.profile)).not.toContain(".writer")
}, 30_000)

test("standalone dashboard does not accept a headless option as its missing snapshot ID", async () => {
  await using fixture = await standaloneFixture()
  const result = await invoke(
    fixture,
    ["--dashboard", "--headless", "77015e88-b7dd-408f-b09d-fb67dbad931d", "--", "текст"],
    undefined,
    undefined,
    false,
  )
  expect(result).toMatchObject({
    exit: 2,
    errors: "CLI_ARGUMENT_INVALID\n",
    events: [{ type: "error", error: { name: "CLI_ARGUMENT_INVALID" } }],
  })
  expect(await readdir(fixture.profile)).not.toContain(".writer")
}, 30_000)

test("standalone dashboard starts from the snapshot in its restricted work directory", async () => {
  await using fixture = await standaloneFixture()
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  const server = dashboardServer({
    buildsRoot: join(fixture.directory, "builds"),
    appOrigin: "http://dashboards.localhost:32769",
    mode: "normal",
    clientOrigins: [],
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  try {
    await mkdir(join(fixture.bundle, "runtime/src"), { recursive: true })
    await symlink(
      resolve(import.meta.dir, "../../../loginom-runtime/src/knowledge-entry.mjs"),
      join(fixture.bundle, "runtime/src/knowledge-entry.mjs"),
    )
    const address = server.address()
    if (!address || typeof address === "string") throw Error("Missing dashboard address")
    const origin = `http://127.0.0.1:${address.port}`
    const binding = {
      packagePath: "/user/fixture/campaign.lgp",
      workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
      nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
    }
    const response = await fetch(origin + "/dashboard/snapshots", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        binding,
        nodeName: "Узел",
        sample: { schema: [{ name: "count", type: 1 }], rows: [[42]] },
        parameters: [],
        published: false,
      }),
    })
    expect(response.status).toBe(201)
    const snapshot = await response.json()
    const store = connectionStore(join(fixture.profile, "loginom/connection"), cliCredentials("linux"))
    await store.stage({
      generation: 1,
      revision: 1,
      apiKey: "UNIT-NONSECRET",
      password: "PRIVATE-NONSECRET",
      username: "user",
      url: origin + "/app/",
    })
    await store.activate(1)
    await cp(
      resolve(import.meta.dir, "../../../dashboard/template/src"),
      join(fixture.bundle, "dashboard/template/src"),
      { recursive: true },
    )
    const llm = await provider.runPromise(TestLLMServer)
    await provider.runPromise(llm.text("Создаю dashboard."))
    await writeFile(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify(testProviderConfig(llm.url)))
    const result = await invoke(
      fixture,
      ["--dashboard", snapshot.id, "--headless", "--", "Покажи суммы."],
      undefined,
      undefined,
      false,
    )
    expect(result).toMatchObject({ exit: 0 })
    const requests = await provider.runPromise(llm.hits)
    const work = join(fixture.profile, "data/dashboards", "campaign-" + (await bindingKey(binding)).slice(0, 8), "work")
    expect(JSON.stringify(requests)).toContain(dashboardPrompt("create", true))
    expect(JSON.stringify(requests)).toContain("Working directory: " + work)
    expect(requests.some((hit) => JSON.stringify(hit.body.tools ?? []).includes('"name":"bash"'))).toBe(false)
    expect(requests.some((hit) => JSON.stringify(hit.body.tools ?? []).includes('"name":"dashboard_draft"'))).toBe(true)
    expect(result.events.find((event) => event.type === "text")?.part.text).toBe("Создаю dashboard.")
    const exported = Bun.spawn(
      [process.execPath, "run", resolve(import.meta.dir, "../../src/index.ts"), "export", result.events[0].sessionID],
      {
        cwd: work,
        env: {
          ...profileEnvironment(profilePaths(fixture.profile), process.env),
          LOGINOM_AI_AGENT_CHANNEL: fixture.channel,
        },
        stdin: "ignore",
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [output, errors, exit] = await Promise.all([
      new Response(exported.stdout).text(),
      new Response(exported.stderr).text(),
      exported.exited,
    ])
    expect({ exit, errors }).toMatchObject({ exit: 0 })
    const transcript = Schema.decodeUnknownSync(
      Schema.Struct({ info: Schema.Struct({ directory: Schema.String }), messages: Schema.Array(SessionV1.WithParts) }),
    )(JSON.parse(output))
    expect(transcript.info.directory).toBe(work)
    const parts = transcript.messages
      .filter((message) => message.info.role === "user")
      .flatMap((message) => message.parts)
    expect(parts.filter((part) => part.type === "text" && !part.synthetic)).toMatchObject([
      { text: expect.stringContaining("Покажи суммы.") },
    ])
    expect(parts).toContainEqual(
      expect.objectContaining({ type: "text", text: dashboardPrompt("create", true), synthetic: true }),
    )
    expect(await readdir(fixture.profile)).not.toContain(".writer")
    expect((await fetch(origin + "/dashboard/snapshots/" + snapshot.id)).status).toBe(404)
    const calls = await provider.runPromise(llm.calls)
    const consumed = await invoke(fixture, ["--dashboard", snapshot.id, "--", "Повтори."], undefined, undefined, false)
    expect(consumed).toMatchObject({
      exit: 1,
      errors: "DASHBOARD_SNAPSHOT_UNAVAILABLE\n",
      events: [{ type: "error", error: { name: "DASHBOARD_SNAPSHOT_UNAVAILABLE" } }],
    })
    expect(await provider.runPromise(llm.calls)).toBe(calls)
    expect(await readdir(fixture.profile)).not.toContain(".writer")
  } finally {
    await provider.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
}, 30_000)
