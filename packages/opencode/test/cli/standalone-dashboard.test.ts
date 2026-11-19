import { expect, test } from "bun:test"
import { ManagedRuntime, Schema } from "effect"
import { SessionV1 } from "@opencode-ai/core/v1/session"
import { once } from "node:events"
import { mkdir, readdir, symlink, writeFile } from "node:fs/promises"
import { join, resolve } from "node:path"
import { dashboardServer } from "@loginom-ai-agent/dashboard/web/server"
import { bindingKey } from "@loginom-ai-agent/dashboard/contract/snapshot"
import { dashboardPrompt } from "@loginom-ai-agent/dashboard/contract/prompt"
import { stageKnowledgeFixture } from "../../../loginom-host/test/fixtures/knowledge"
import { connectionStore } from "@loginom-ai-agent/loginom-host/connection/connection-store"
import { cliCredentials } from "@loginom-ai-agent/loginom-host/connection/cli-credentials"
import { profilePaths } from "@loginom-ai-agent/product/cli-profile"
import { profileEnvironment } from "../../src/cli/profile"
import { dashboardFlag } from "../../src/cli/standalone-dashboard"
import { standaloneFixture, standaloneRun, invoke } from "../fixture/standalone"
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

async function dashboardFixture() {
  const fixture = await standaloneFixture()
  const provider = ManagedRuntime.make(TestLLMServer.layer)
  const server = dashboardServer({
    shell: new Uint8Array(),
    buildsRoot: join(fixture.directory, "builds"),
    appOrigin: "http://dashboards.localhost:32769",
    mode: "normal",
    clientOrigins: [],
  })
  server.listen(0, "127.0.0.1")
  await once(server, "listening")
  const dispose = async () => {
    await provider.dispose()
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await fixture[Symbol.asyncDispose]()
  }
  try {
    await stageKnowledgeFixture(fixture.bundle)
    const knowledge = join(fixture.bundle, "runtime/src/knowledge-entry.mjs")
    const originalKnowledge = await Bun.file(knowledge).text()
    const listReply = "if (m.operation === 'list') process.send({id:m.id,result:{tools}});"
    await writeFile(knowledge, originalKnowledge.replace(listReply,
      "if (m.operation === 'list') setTimeout(() => process.send({id:m.id,result:{tools}}), 2000);"))
    await writeFile(join(fixture.bundle, "runtime/src/managed-entry.mjs"), `
      import { appendFileSync, existsSync, readFileSync } from 'node:fs';
      let reading;
      process.on('message', m => {
        appendFileSync(${JSON.stringify(join(fixture.directory, "dashboard-read.jsonl"))}, JSON.stringify({operation:m.operation,generation:m.input?.generation})+'\\n');
        if(m.operation==='start') process.send({id:m.id,result:{protocol:1,generation:m.input.generation,chat:m.input.chat,ready:true}});
        if(m.operation==='dashboardRead') {
          const mode = existsSync(${JSON.stringify(join(fixture.directory, "read-mode"))}) ? readFileSync(${JSON.stringify(join(fixture.directory, "read-mode"))}, 'utf8') : '';
          if(mode==='hold') reading=m.id;
          else process.send({id:m.id,...(mode==='denied'?{error:'DASHBOARD_ACCESS_DENIED'}:{result:null})});
        }
        if(m.operation==='dashboardVersions') process.send({id:m.id,result:[
          {name:'20261119T120000Z.json',sourceHash:'a'.repeat(64)},{name:'20261119T130000Z.json',sourceHash:'b'.repeat(64)}
        ]});
        if(m.operation==='dashboardDelete') process.send({id:m.id,result:{status:'empty'}});
        if(m.operation==='dashboardPublish') process.send({id:m.id,result:{status:'changed',latest:null}});
        if(m.operation==='interrupt') { if(reading) process.send({id:reading,error:'DASHBOARD_CANCELLED'}); process.send({id:m.id,result:true}); }
        if(m.operation==='close') process.send({id:m.id,result:{closed:true}},()=>process.exit(0));
      });
    `)
    const address = server.address()
    if (!address || typeof address === "string") throw Error("Missing dashboard address")
    const origin = `http://127.0.0.1:${address.port}`
    const binding = {
      packagePath: "/user/fixture/campaign.lgp",
      workflowGuid: "27cb94a9-f6e9-35ff-80b7-bc7d01ba6aa7",
      nodeGuid: "77c145b1-6ce3-458f-aa36-e6afdab2a930",
    }
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
    await mkdir(join(fixture.bundle, "dashboard"), { recursive: true })
    await mkdir(join(fixture.bundle, "runtime/client/node_modules"), { recursive: true })
    await symlink(resolve(import.meta.dir, "../../../dashboard/template"), join(fixture.bundle, "dashboard/template"), "dir")
    await symlink(resolve(import.meta.dir, "../../../loginom-runtime/client/node_modules/playwright-core"), join(fixture.bundle, "runtime/client/node_modules/playwright-core"), "dir")
    for (const file of ["dashboard/draft.js", "dashboard/selfcheck.mjs", "chrome"]) await writeFile(join(fixture.bundle, file), "fixture")
    const manifest = Bun.file(join(fixture.bundle, "resource-manifest.json"))
    await Bun.write(manifest, JSON.stringify({ ...await manifest.json(), node: "bin/node", browser: "chrome" }))
    const llm = await provider.runPromise(TestLLMServer)
    await writeFile(join(fixture.profile, "config/loginom-ai-agent.json"), JSON.stringify(testProviderConfig(llm.url)))
    return { fixture, provider, llm, origin, binding, knowledge, originalKnowledge, listReply, [Symbol.asyncDispose]: dispose }
  } catch (error) {
    await dispose()
    throw error
  }
}

test("standalone dashboard starts from the snapshot and preserves explicit publication approval", async () => {
  const setup = await dashboardFixture()
  try {
    const { fixture, provider, llm, origin, binding, knowledge, originalKnowledge, listReply } = setup
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
    await provider.runPromise(llm.text("Создаю dashboard."))
    const result = await invoke(
      fixture,
      ["--dashboard", snapshot.id, "--headless", "--", "Покажи суммы."],
      undefined,
      undefined,
      false,
    )
    await writeFile(knowledge, originalKnowledge)
    expect(result).toMatchObject({ exit: 0 })
    const reads = (await Bun.file(join(fixture.directory, "dashboard-read.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(reads.map(item => item.operation)).toEqual(["start", "dashboardRead", "close"])
    expect(reads[0].generation).toBe(1)
    const requests = await provider.runPromise(llm.hits)
    const work = join(fixture.profile, "data/dashboards", "campaign-" + (await bindingKey(binding)).slice(0, 8), "work")
    expect(JSON.stringify(requests)).toContain(dashboardPrompt("create"))
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
      expect.objectContaining({ type: "text", text: dashboardPrompt("create"), synthetic: true }),
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
    for (const auto of [false, true]) {
      await provider.runPromise(llm.reset)
      await provider.runPromise(llm.tool("dashboard_publish", {}))
      await provider.runPromise(llm.text("Готово."))
      const response = await fetch(origin + "/dashboard/snapshots", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          binding, nodeName: "Узел", sample: { schema: [{ name: "count", type: 1 }], rows: [[42]] }, parameters: [], published: false,
        }),
      })
      const result = await invoke(fixture, ["--dashboard", (await response.json()).id, "--headless", ...(auto ? ["--auto"] : []), "--", "Опубликуй."], undefined, undefined, false)
      expect(result.exit).toBe(auto ? 0 : 1)
      const events = (await Bun.file(join(fixture.directory, "dashboard-read.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))
      expect(events.filter(item => item.operation === "dashboardPublish")).toHaveLength(auto ? 1 : 0)
      if (!auto) {
        expect(result.events).toContainEqual(expect.objectContaining({ type: "error", error: expect.objectContaining({ name: "CLI_PERMISSION_REJECTED" }) }))
        expect(result.errors).toContain("dashboard_publish")
        expect(result.errors).toContain("--auto")
        expect(result.errors).toContain("Публикация отклонена")
      }
    }
    await writeFile(join(fixture.directory, "read-mode"), "denied")
    await provider.runPromise(llm.reset)
    await provider.runPromise(llm.text("Продолжаю локальный черновик."))
    for (const local of [true, false]) {
      const response = await fetch(origin + "/dashboard/snapshots", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          binding: local ? binding : { ...binding, packagePath: "/user/fixture/denied.lgp" },
          nodeName: "Узел", sample: { schema: [], rows: [] }, parameters: [], published: false,
        }),
      })
      const result = await invoke(fixture, ["--dashboard", (await response.json()).id, "--headless", "--", "Открой."], undefined, undefined, false)
      expect(result.exit, JSON.stringify(result)).toBe(local ? 0 : 1)
      if (local) {
        expect(result.errors).toContain("Не удалось проверить публикацию")
        expect(result.events.some(event => event.type === "error")).toBe(false)
      } else {
        expect(result.errors).toContain("DASHBOARD_ACCESS_DENIED")
        expect(result.errors).toContain("Недостаточно прав")
        expect(result.errors).not.toContain("DASHBOARD_SNAPSHOT_UNAVAILABLE")
      }
    }
    await writeFile(join(fixture.directory, "read-mode"), "")
    await writeFile(knowledge, originalKnowledge.replace(listReply,
      "if (m.operation === 'list') process.send({id:m.id,error:'LOGINOM_KNOWLEDGE_UNAVAILABLE'});"))
    const savedSource = await Bun.file(join(work, "src/main.tsx")).text()
    for (const local of [true, false]) {
      await provider.runPromise(llm.reset)
      await provider.runPromise(llm.text("Продолжаю локальный черновик без подключения."))
      const response = await fetch(origin + "/dashboard/snapshots", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
          binding: local ? binding : { ...binding, packagePath: "/user/fixture/not-ready.lgp" },
          nodeName: "Узел", sample: { schema: [], rows: [] }, parameters: [], published: false,
        }),
      })
      const result = await invoke(fixture, ["--dashboard", (await response.json()).id, "--headless", "--", "Открой."], undefined, undefined, false)
      expect(result.exit, JSON.stringify(result)).toBe(local ? 0 : 1)
      if (local) {
        expect(result.errors).toContain("Не удалось проверить публикацию")
        expect(await provider.runPromise(llm.calls)).toBeGreaterThan(0)
      } else {
        expect(result.errors).toContain("LOGINOM_CONNECTION_NOT_READY")
        expect(await provider.runPromise(llm.calls)).toBe(0)
      }
      expect(await Bun.file(join(work, "src/main.tsx")).text()).toBe(savedSource)
      expect(await readdir(fixture.profile)).not.toContain(".writer")
    }
    const pendingLog = Bun.file(join(fixture.directory, "dashboard-read.jsonl"))
    const pendingOffset = (await pendingLog.text()).length
    await writeFile(knowledge, "import { appendFileSync } from 'node:fs';\n" + originalKnowledge
      .replace(listReply, `if (m.operation === 'list') appendFileSync(${JSON.stringify(pendingLog.name)}, '{"operation":"knowledgePending"}\\n');`)
      .replace("if (m.operation === 'close')", `if (m.operation === 'close') appendFileSync(${JSON.stringify(pendingLog.name)}, '{"operation":"knowledgeClose"}\\n'); if (m.operation === 'close')`))
    const host = join(fixture.bundle, "host/node-host.mjs")
    const originalHost = await Bun.file(host).text()
    await writeFile(host, originalHost + `
      {
        const { appendFileSync } = await import('node:fs');
        process.on('message', message => {
          if (message.method === 'connection.ready') appendFileSync(${JSON.stringify(pendingLog.name)}, '{"operation":"connection.ready"}\\n');
        });
      }
    `)
    await provider.runPromise(llm.reset)
    const pending = await fetch(origin + "/dashboard/snapshots", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        binding: { ...binding, packagePath: "/user/fixture/readiness-cancel.lgp" },
        nodeName: "Узел", sample: { schema: [], rows: [] }, parameters: [], published: false,
      }),
    })
    expect(pending.status).toBe(201)
    let pendingWatcher: ReturnType<typeof setInterval> | undefined
    try {
      const cancelled = await invoke(fixture, ["--dashboard", (await pending.json()).id, "--headless", "--", "Отмена."], interrupt => {
        pendingWatcher = setInterval(async () => {
          if (!(await pendingLog.text()).slice(pendingOffset).includes('"connection.ready"')) return
          clearInterval(pendingWatcher)
          interrupt()
        }, 20)
      }, undefined, false)
      expect(cancelled.exit).toBe(130)
      expect((await pendingLog.text()).slice(pendingOffset)).toContain('"knowledgePending"')
      expect((await pendingLog.text()).slice(pendingOffset)).toContain('"connection.ready"')
      expect(await provider.runPromise(llm.calls)).toBe(0)
      expect((await pendingLog.text()).slice(pendingOffset)).not.toContain('"dashboardRead"')
      expect((await pendingLog.text()).slice(pendingOffset)).toContain('"knowledgeClose"')
      expect(await readdir(fixture.profile)).not.toContain(".writer")
    } finally {
      clearInterval(pendingWatcher)
      await writeFile(knowledge, originalKnowledge)
      await writeFile(host, originalHost)
    }
    await writeFile(join(fixture.directory, "read-mode"), "hold")
    const cancelling = await fetch(origin + "/dashboard/snapshots", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        binding, nodeName: "Узел", sample: { schema: [], rows: [] }, parameters: [], published: false,
      }),
    })
    expect(cancelling.status).toBe(201)
    const log = Bun.file(join(fixture.directory, "dashboard-read.jsonl"))
    const offset = (await log.text()).length
    let watcher: ReturnType<typeof setInterval> | undefined
    try {
      const cancelled = await invoke(fixture, ["--dashboard", (await cancelling.json()).id, "--headless", "--", "Отмена."], interrupt => {
        watcher = setInterval(async () => {
          if (!(await log.text()).slice(offset).includes('"dashboardRead"')) return
          clearInterval(watcher)
          interrupt()
        }, 20)
      }, undefined, false)
      expect(cancelled.exit).toBe(130)
      expect((await log.text()).slice(offset)).toContain('"interrupt"')
      expect((await log.text()).slice(offset)).toContain('"close"')
      expect(await readdir(fixture.profile)).not.toContain(".writer")
    } finally { clearInterval(watcher) }
  } finally {
    await setup[Symbol.asyncDispose]()
  }
}, 60_000)

test.skipIf(process.platform !== "linux")("ordinary dashboard run waits for a separate terminal choice before deleting", async () => {
  await using setup = await dashboardFixture()
  const { fixture, provider, llm, origin, binding, knowledge, originalKnowledge } = setup
  await writeFile(knowledge, originalKnowledge)
  const deleteBinding = { ...binding, packagePath: "/user/fixture/delete.lgp" }
  const deleteWork = join(fixture.profile, "data/dashboards", "delete-" + (await bindingKey(deleteBinding)).slice(0, 8), "work")
  const operations = Bun.file(join(fixture.directory, "dashboard-read.jsonl"))
  let deletions = 0
  for (const [choice, auto] of [
    ["cancel", "--auto"],
    ["eof", "--yolo"],
    ["incomplete", "--dangerously-skip-permissions"],
    ["interrupt", ""],
    ["no-tty", "--auto"],
    ["delete", ""],
    ["pipe-delete", ""],
  ] as const) {
    const success = choice === "delete" || choice === "pipe-delete"
    const human = choice === "pipe-delete"
    await provider.runPromise(llm.reset)
    await provider.runPromise(llm.tool("dashboard_delete", {}))
    const response = await fetch(origin + "/dashboard/snapshots", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        binding: deleteBinding, nodeName: "Узел\n\u001b[31m", sample: { schema: [], rows: [] }, parameters: [], published: false,
      }),
    })
    expect(response.status).toBe(201)
    const command = standaloneRun(fixture, [
      "--dashboard", (await response.json()).id, "--headless", "--title=Удаление",
      ...(choice === "delete" ? ["--file", "src/main.tsx"] : []),
      ...(auto ? [auto] : []), "--", "Удали дашборд.",
    ], undefined, false)
    const args = human ? command.argv.filter(arg => arg !== "--format=json") : command.argv
    const child = Bun.spawn(["python3", join(import.meta.dir, "standalone-dashboard-pty.py"), choice, ...args], {
      cwd: command.cwd, env: command.env, stdout: "pipe", stderr: "inherit",
    })
    const [output, code] = await Promise.all([new Response(child.stdout).json(), child.exited])
    expect(code, choice).toBe(0)
    expect(output.exit, JSON.stringify(output)).toBe(success ? 0 : choice === "interrupt" ? 130 : 1)
    if (choice === "no-tty") {
      expect(output.cwd).toBeNull()
      expect(output.stderr).toContain("требуется управляющий терминал")
    } else {
      expect(output.cwd).toBe(join(fixture.profile, "data/dashboards"))
      expect(output.stderr).toContain('Узел\\n\\u001b[31m')
      expect(output.stderr).toContain(deleteBinding.packagePath)
      expect(output.stderr).toContain("Опубликованных версий к удалению: 2")
      expect(output.stderr).toContain("Локальный черновик и неопубликованные правки будут удалены")
    }
    expect(output.stderr + output.stdout).not.toContain("ENOENT")
    if (human) {
      expect(output.stderr).toContain("Дашборд удалён")
      expect(output.stdout).toBe("")
    } else {
      const events = output.stdout.trim().split("\n").map((line: string) => JSON.parse(line))
      expect(events).toContainEqual(success ? expect.objectContaining({
        type: "tool_use",
        part: expect.objectContaining({ tool: "dashboard_delete", state: expect.objectContaining({
          status: "completed", output: expect.stringContaining("Дашборд удалён"),
        }) }),
      }) : expect.objectContaining({
        type: "error", error: expect.objectContaining({ name: choice === "interrupt" ? "CLI_CANCELLED" : "CLI_PERMISSION_REJECTED" }),
      }))
    }
    if (success) {
      deletions++
      expect(await provider.runPromise(llm.calls)).toBe(1)
    }
    expect((await operations.text()).match(/"operation":"dashboardDelete"/g) ?? []).toHaveLength(deletions)
    expect(await Bun.file(join(deleteWork, "src/main.tsx")).exists()).toBe(!success)
    expect(await readdir(fixture.profile)).not.toContain(".writer")
  }
}, 70_000)
