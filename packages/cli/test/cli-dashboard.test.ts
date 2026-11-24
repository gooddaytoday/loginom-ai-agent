// Loginom AI Agent (B2.9i): `run --dashboard <id>` of the product CLI, the cases of 0.4
// `test/cli/standalone-dashboard.test.ts` (`v0.4.0:packages/opencode`, decision В-99) without its confirmations of
// publication and deletion (B2.9j). 0.4 prepared the dashboard's folder with the Host of its own process; on OpenCode 2
// the run asks the server's product plugin (`loginom.dashboard`, B2.9h) before its session and runs in that folder. Each
// run is the product CLI entry from source in a profile of its own, with a scripted model, a Host entry of the test's
// own (Node from `LOGINOM_AI_AGENT_TEST_NODE`) and a Studio on 127.0.0.1 that gives each snapshot once.
import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { dashboardPrompt } from "@loginom-ai-agent/dashboard/contract/prompt"
import { bindingKey } from "@loginom-ai-agent/dashboard/contract/snapshot"
import { Standalone } from "../src/standalone"
import { isolatedEnv } from "./fixture/environment"
import { finished, productProfile, scriptedModel, type Step } from "./fixture/product-run"

const cli = path.join(import.meta.dir, "..")
const id = "77015e88-b7dd-408f-b09d-fb67dbad931d"

describe("run --dashboard arguments", () => {
  // 0.4 «dashboard flags preserve the message and the argument boundary» and «RunCommand parses the dashboard directory
  // before the message boundary»: the run's directory is the plugin's answer, so only the snapshot ID goes on.
  test("dashboard flags preserve the message and the argument boundary", () => {
    const env: NodeJS.ProcessEnv = {}
    expect(Standalone.forward(["run", "--dashboard", id, "--", "текст"], "/w", env)).toEqual({
      args: ["run", "--", "текст"],
      directory: undefined,
    })
    expect(env).toEqual({ LOGINOM_AI_AGENT_RUN_DASHBOARD: id })
    expect(Standalone.forward(["run", "--headless", "--dashboard=" + id, "текст"], "/w", env).args).toEqual([
      "run",
      "текст",
    ])
    expect(env).toEqual({ LOGINOM_AI_AGENT_HEADLESS: "1", LOGINOM_AI_AGENT_RUN_DASHBOARD: id })
    // The run's private server keeps it; the next run without the flag drops it.
    expect(Standalone.forward(["serve", "--stdio"], "/w", env).args).toEqual(["serve", "--stdio"])
    expect(env).toEqual({ LOGINOM_AI_AGENT_HEADLESS: "1", LOGINOM_AI_AGENT_RUN_DASHBOARD: id })
    expect(Standalone.forward(["run", "--", "--dashboard", id], "/w", env).args).toEqual([
      "run",
      "--",
      "--dashboard",
      id,
    ])
    expect(env).toEqual({})
  })

  test("dashboard rejects conflicting flags, missing IDs and the TUI", () => {
    const env: NodeJS.ProcessEnv = {}
    const refused = (args: string[]) =>
      expect(() => Standalone.forward(args, "/w", env)).toThrow("CLI_ARGUMENT_INVALID: run --dashboard")
    for (const flag of ["--dir", "--attach", "--continue", "-c", "--session", "-s", "--fork", "--command"]) {
      refused(["run", "--dashboard", id, flag])
      refused(["run", flag + "=value", "--dashboard=" + id])
    }
    for (const args of [
      ["--dashboard"],
      ["--dashboard="],
      ["--dashboard", "--"],
      ["--dashboard", "--model", "test/model"],
      ["--dashboard", "--headless", id],
    ])
      refused(["run", ...args])
    refused(["--dashboard", id])
    refused(["--model", "test/model", "--dashboard=" + id])
    expect(env).toEqual({})
  })
})

describe.skipIf(process.platform !== "linux")("run --dashboard with the server's Host", () => {
  // 0.4 «standalone dashboard reports invalid arguments and missing connection without creating a project» and
  // «standalone dashboard starts from the snapshot and preserves explicit publication approval» without its publication
  // (B2.9j). An argument error is OpenCode 2's (B2.7a4): its reason on stderr, without an event.
  test("standalone dashboard starts from the snapshot in its folder with the dashboard profile", async () => {
    await using fixture = await dashboardFixture([{ text: "Создаю dashboard." }])
    const invalid = await fixture.run(["--dashboard", id, "--continue", "--format", "json", "--", "текст"])
    expect({ code: invalid.code, stdout: invalid.stdout }).toEqual({ code: 2, stdout: "" })
    expect(invalid.stderr).toStartWith("CLI_ARGUMENT_INVALID: run --dashboard")
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")

    await fs.writeFile(path.join(fixture.root, "generation"), "0")
    const unconfigured = await fixture.run(["--dashboard", id, "--format", "json", "--", "текст"])
    expect({ code: unconfigured.code, stderr: unconfigured.stderr }).toEqual({
      code: 2,
      stderr: "LOGINOM_CONFIG_REQUIRED\n",
    })
    expect(unconfigured.events).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ name: "LOGINOM_CONFIG_REQUIRED" }) }),
    ])
    expect(await fs.readdir(path.join(fixture.profile, "data"))).not.toContain("dashboards")
    expect(fixture.studio.seen).toEqual([])
    expect(fixture.llm.hits.count).toBe(0)
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")
    await fs.rm(path.join(fixture.root, "generation"))

    const args = ["--headless", "--format", "json", "--model", "test/test-model", "--"]
    const snapshot = fixture.studio.publish(binding, false)
    const asked = (await fixture.host()).length
    const created = await fixture.run(["--dashboard", snapshot.id, ...args, "Покажи суммы."])
    expect({ code: created.code, stderr: created.stderr }).toEqual({ code: 0, stderr: "" })
    expect(created.events.find((event) => event.type === "text")?.part.text).toBe("Создаю dashboard.")
    // The server's Host was asked as 0.4's CLI asked its own: the status, readiness, then the latest publication with the
    // captured origin and generation.
    expect((await fixture.host()).slice(asked).map((entry) => entry.method)).toEqual([
      "start",
      "connection.status",
      "connection.ready",
      "dashboard.read",
    ])
    expect((await fixture.host()).at(-1)?.input).toEqual({ origin: fixture.studio.origin, generation: 1, binding })
    const work = path.join(
      fixture.profile,
      "data/dashboards",
      "campaign-" + (await bindingKey(binding)).slice(0, 8),
      "work",
    )
    expect(await Bun.file(path.join(work, "snapshot.json")).exists()).toBe(true)
    // The session works in the dashboard's folder, with the dashboard's task next to the user's.
    const first = fixture.llm.requests[0]
    expect(JSON.stringify(first?.messages)).toContain("Working directory: " + work)
    expect(JSON.stringify(first?.messages)).toContain("Покажи суммы.\\n\\n" + dashboardPrompt("create"))
    // The dashboard's profile: its files and its tools, no shell, subagent, Loginom or MCP.
    const tools = (first?.tools as { function: { name: string } }[]).map((tool) => tool.function.name)
    expect(tools).toContain("dashboard_draft")
    expect(
      tools.filter((tool) => !["read", "glob", "grep", "edit", "write", "apply_patch", "skill"].includes(tool)),
    ).toEqual(tools.filter((tool) => tool.startsWith("dashboard_")))
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")

    // Studio gave the snapshot once: the same ID fails before the model.
    const hits = fixture.llm.hits.count
    const consumed = await fixture.run(["--dashboard", snapshot.id, ...args, "Ещё."])
    expect({ code: consumed.code, stderr: consumed.stderr }).toEqual({
      code: 1,
      stderr: "DASHBOARD_SNAPSHOT_UNAVAILABLE\n",
    })
    expect(consumed.events).toEqual([
      expect.objectContaining({
        type: "error",
        error: expect.objectContaining({ name: "DASHBOARD_SNAPSHOT_UNAVAILABLE" }),
      }),
    ])
    expect(fixture.llm.hits.count).toBe(hits)

    // A publication check that fails keeps the local draft open with 0.4's notice.
    await fs.writeFile(path.join(fixture.root, "read"), "DASHBOARD_ACCESS_DENIED")
    const local = await fixture.run(["--dashboard", fixture.studio.publish(binding, true).id, ...args, "Открой."])
    expect({ code: local.code, stderr: local.stderr }).toEqual({
      code: 0,
      stderr: "Не удалось проверить публикацию в Studio. Открыт сохранённый локальный черновик.\n",
    })
    expect(local.events.some((event) => event.type === "error")).toBe(false)
    expect(JSON.stringify(fixture.llm.requests.at(-1)?.messages)).toContain("Открой.\\n\\n" + dashboardPrompt("edit"))
    // A newer publication than the local draft's base, then that publication's failed build.
    const version = { name: "20261124T120000Z.json", sourceHash: "b".repeat(64) }
    await fs.writeFile(path.join(fixture.root, "read"), JSON.stringify({ version, content: "{}" }))
    const newer = await fixture.run(["--dashboard", fixture.studio.publish(binding, true).id, ...args, "Открой."])
    expect({ code: newer.code, stderr: newer.stderr }).toEqual({
      code: 0,
      stderr: `На стенде новая версия ${version.name}. Локальные исходники сохранены; перед заменой потребуется подтверждение.\n`,
    })
    fixture.studio.lookup.body = {
      key: "fixture",
      exists: true,
      hash: null,
      appOrigin: fixture.studio.origin,
      mode: "normal",
      cliButton: false,
      currentVersion: { name: "20261123T120000Z.json", sourceHash: "a".repeat(64) },
      latest: null,
      publication: { name: version.name, sourceHash: version.sourceHash, status: "failed", error: "Ошибка сборки." },
    }
    const failed = await fixture.run(["--dashboard", fixture.studio.publish(binding, true).id, ...args, "Открой."])
    expect({ code: failed.code, stderr: failed.stderr }).toEqual({
      code: 0,
      stderr: `Сборка версии ${version.name} не удалась. Текущая версия: 20261123T120000Z.json. Ошибка сборки.\n`,
    })

    // A new dashboard whose publication cannot be checked stops before the model, with the Host's code and text.
    await fs.writeFile(path.join(fixture.root, "read"), "DASHBOARD_ACCESS_DENIED")
    const answered = fixture.llm.hits.count
    const denied = await fixture.run([
      "--dashboard",
      fixture.studio.publish({ ...binding, packagePath: "/user/fixture/denied.lgp" }, false).id,
      ...args,
      "Открой.",
    ])
    expect(denied.code).toBe(1)
    expect(denied.stderr).toStartWith("DASHBOARD_ACCESS_DENIED")
    expect(denied.stderr).toContain("Недостаточно прав")
    expect(denied.events).toEqual([
      expect.objectContaining({ type: "error", error: expect.objectContaining({ name: "DASHBOARD_ACCESS_DENIED" }) }),
    ])
    expect(fixture.llm.hits.count).toBe(answered)
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")
  }, 180_000)

  // The same 0.4 test: Ctrl+C while the Host waits for readiness never reads the publication nor asks the model.
  // Strict recovery refuses before the one-time snapshot is spent, as 0.4 checked its journal first.
  test("Ctrl+C during the preparation and strict recovery stop the run before the model", async () => {
    await using fixture = await dashboardFixture([])
    await fs.writeFile(path.join(fixture.root, "ready"), "hold")
    const child = fixture.start(["--dashboard", fixture.studio.publish(binding, false).id, "--", "Отмена."])
    const held = async () =>
      (await fixture.host()).some((entry) => entry.method === "connection.ready") ? true : undefined
    await waitFor(held, 60_000)
    child.kill("SIGINT")
    const cancelled = await finished(child)
    expect({ code: cancelled.code, stderr: cancelled.stderr }).toEqual({ code: 130, stderr: "CLI_CANCELLED\n" })
    expect((await fixture.host()).map((entry) => entry.method)).not.toContain("dashboard.read")
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")
    await fs.rm(path.join(fixture.root, "ready"))

    await fs.writeFile(path.join(fixture.root, "recoveries"), "")
    const seen = fixture.studio.seen.length
    const strict = await fixture.run(["--dashboard", fixture.studio.publish(binding, false).id, "--", "Открой."], {
      LOGINOM_AI_AGENT_STRICT_RECOVERY: "1",
    })
    expect({ code: strict.code, stderr: strict.stderr }).toEqual({ code: 4, stderr: "LOGINOM_RECOVERY_REQUIRED\n" })
    expect(fixture.studio.seen.length).toBe(seen)
    expect(fixture.llm.hits.count).toBe(0)
    expect(await fs.readdir(fixture.profile)).not.toContain(".writer")
  }, 120_000)
})

const binding = {
  packagePath: "/user/fixture/campaign.lgp",
  workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
  nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
}

// A profile whose model follows `steps`, the installation's dashboard template, and a Host entry that logs each request
// and answers by the files of the case: `generation` (1 without it), `ready` (a code it refuses readiness with, or
// `hold`), `read` (the latest publication as JSON, or a code it refuses to read it with; without it nothing is published)
// and `recoveries` (the journal keeps one).
async function dashboardFixture(steps: Step[]) {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "cli-dashboard-")))
  const project = path.join(root, "project")
  const resources = path.join(root, "resources")
  const profile = path.join(root, "profile")
  const log = path.join(root, "host.jsonl")
  const studio = studioFixture()
  const llm = scriptedModel(steps)
  const file = (name: string) => JSON.stringify(path.join(root, name))
  await fs.mkdir(project)
  await fs.mkdir(path.join(resources, "bin"), { recursive: true })
  await fs.mkdir(path.join(resources, "host"))
  await fs.mkdir(path.join(resources, "dashboard"))
  await fs.symlink(node(), path.join(resources, "bin", "node"))
  await fs.symlink(path.join(cli, "../dashboard/template"), path.join(resources, "dashboard", "template"), "dir")
  await fs.writeFile(
    path.join(resources, "host", "node-host.mjs"),
    `import { appendFileSync, existsSync, readFileSync } from "node:fs";
    const read = (name) => existsSync(name) ? readFileSync(name, "utf8") : undefined;
    process.on("disconnect", () => process.exit(0));
    process.on("message", m => {
      appendFileSync(${JSON.stringify(log)}, JSON.stringify({ method: m.method, input: m.input }) + "\\n");
      const reply = (result) => process.send({ id: m.id, result });
      const refuse = (error) => process.send({ id: m.id, error });
      const status = () => ({
        revision: 1,
        generation: Number(read(${file("generation")}) ?? 1),
        url: ${JSON.stringify(studio.origin + "/app/")},
        state: "ready",
        ...(existsSync(${file("recoveries")}) ? { recoveries: ["fixture-recovery"] } : {}),
      });
      if (m.method === "start") return reply({ protocol: 1, ready: true, pid: process.pid });
      if (m.method === "close") return process.send({ id: m.id, result: { closed: true } }, () => process.exit(0));
      if (m.method === "connection.status") return reply(status());
      if (m.method === "connection.ready") {
        const ready = read(${file("ready")});
        if (ready === "hold") return;
        return ready ? refuse(ready) : reply(status());
      }
      if (m.method === "dashboard.read") {
        const answer = read(${file("read")});
        if (!answer) return reply(null);
        return answer.startsWith("{") ? reply(JSON.parse(answer)) : refuse(answer);
      }
      refuse("LOGINOM_HOST_NOT_READY");
    });`,
  )
  await productProfile(profile, llm.url)
  const env = isolatedEnv(root, { LOGINOM_AI_AGENT_CLI_PROFILE: profile, LOGINOM_AI_AGENT_RESOURCES: resources })
  // The product CLI entry from source; the run's directory is the project's, as a shell gives it in PWD.
  const start = (args: string[], overrides: Record<string, string> = {}) =>
    Bun.spawn([process.execPath, "src/loginom-cli.ts", "run", ...args], {
      cwd: cli,
      env: { ...env, LOGINOM_AI_AGENT_CLI_ROOT: undefined, PWD: project, ...overrides },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
  return {
    root,
    project,
    profile,
    studio,
    llm,
    start,
    run: (args: string[], overrides: Record<string, string> = {}) => finished(start(args, overrides)),
    host: async () =>
      (await fs.readFile(log, "utf8").catch(() => ""))
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as { method: string; input: unknown }),
    async [Symbol.asyncDispose]() {
      llm.server.stop(true)
      studio.server.stop(true)
      await fs.rm(root, { recursive: true, force: true })
    },
  }
}

// Studio gives each snapshot once and answers a publication's lookup with `lookup.body` when there is one; `seen` lists
// the paths it was asked.
function studioFixture() {
  const snapshots = new Map<string, unknown>()
  const seen: string[] = []
  const lookup = { body: undefined as unknown }
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) => {
      const url = new URL(request.url)
      seen.push(url.pathname)
      if (url.pathname === "/dashboard/lookup" && lookup.body) return Response.json(lookup.body)
      const id = url.pathname.match(/^\/dashboard\/snapshots\/(.+)$/)?.[1]
      const found = id ? snapshots.get(id) : undefined
      if (!id || !found) return new Response(null, { status: 404 })
      snapshots.delete(id)
      return Response.json(found)
    },
  })
  return {
    server,
    seen,
    lookup,
    origin: server.url.origin,
    publish(binding: { packagePath: string; workflowGuid: string; nodeGuid: string }, published: boolean) {
      const snapshot = {
        id: crypto.randomUUID(),
        created: "2026-11-24T00:00:00.000Z",
        binding,
        nodeName: "Узел",
        sample: { schema: [{ name: "count", type: 1 }], rows: [[42]] },
        parameters: [],
        published,
      }
      snapshots.set(snapshot.id, snapshot)
      return snapshot
    },
  }
}

function node() {
  const value = process.env.LOGINOM_AI_AGENT_TEST_NODE
  if (!value) throw new Error("Set LOGINOM_AI_AGENT_TEST_NODE to the pinned Node binary")
  return value
}

async function waitFor<T>(check: () => Promise<T | undefined>, timeout: number): Promise<T> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const value = await check()
    if (value !== undefined) return value
    await Bun.sleep(100)
  }
  throw new Error("Timed out waiting for condition")
}
