import { expect, test } from "bun:test"

const processDenial = process.env.EVAL_PROCESS_DENIAL_TESTS === "1" ? test : test.skip
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { agentCommand, failureKind, parseEvents, runAgent } from "../src/cli"
import { assessParallelLimits } from "../src/parallel-acceptance"
import { evalsRoot, loadConfig } from "../src/config"

const fixture = (name: string) => Bun.file(path.join(evalsRoot, "fixtures", name)).text()
const fakeCommand = () => agentCommand(loadConfig(["--dry-run"], {}))

test("runAgent masks configured credentials before live output persistence and preserves measured counters", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-output-secrets-"))
  const secrets = ["slot-a-private-canary", "slot-b-private-canary", "admin-private-canary", "dock-private-canary"]
  const release = path.join(root, "release")
  const pending = runAgent({ command: { ...fakeCommand(), cleanupSecrets: secrets, cmd: [process.execPath, "-e", `
    const secrets=${JSON.stringify(secrets)};
    const event=JSON.stringify({type:"error",error:{name:"APIError",data:{statusCode:429,message:secrets.join("|")+"capture-ready"+"x".repeat(500)}}})+"\\n";
    const cut=event.indexOf(secrets[0])+5;
    process.stdout.write(event.slice(0,cut));process.stderr.write(secrets[0].slice(0,5));await Bun.sleep(30);
    process.stdout.write(event.slice(cut));process.stderr.write(secrets[0].slice(5)+secrets.slice(1).join("|")+"capture-ready"+"x".repeat(500)+"\\n");
    while(!await Bun.file(${JSON.stringify(release)}).exists())await Bun.sleep(10);
    console.log(JSON.stringify({type:"step_finish",part:{cost:0.5,tokens:{input:11,output:7,reasoning:3}}}));
    console.log(JSON.stringify({type:"text",part:{text:secrets.join("|")}}));
  `] }, taskId: "output-secrets", model: "fake/fake-model", prompt: "diagnostic", files: [], workdir: root, timeoutMs: 5000, outDir: root })
  void pending.catch(() => {})
  try {
    const deadline = Date.now() + 3000
    while (!await Bun.file(path.join(root, "events.jsonl")).exists() || !await Bun.file(path.join(root, "stderr.txt")).exists() ||
      !(await Bun.file(path.join(root, "events.jsonl")).text()).includes("capture-ready") || !(await Bun.file(path.join(root, "stderr.txt")).text()).includes("capture-ready")) {
      if (Date.now() > deadline) throw Error("Live output did not arrive")
      await Bun.sleep(10)
    }
    const live = await Promise.all(["events.jsonl", "stderr.txt"].map(name => Bun.file(path.join(root, name)).text()))
    for (const secret of secrets) expect(live.join("\n")).not.toContain(secret)
    await Bun.write(release, "done")
    const run = await pending
    expect(run).toMatchObject({ exitCode: 0, cost: 0.5, tokens: { input: 11, output: 7, reasoning: 3 }, failureKind: "provider",
      limitEvidence: { events: [{ source: "provider", kind: "http", status: 429 }] }, processCleanup: { status: "confirmed", capture_complete: true } })
    const saved = await Promise.all(["events.jsonl", "stderr.txt", "run.json"].map(name => Bun.file(path.join(root, name)).text()))
    for (const secret of secrets) expect(JSON.stringify(run) + saved.join("\n")).not.toContain(secret)
    expect(parseEvents(saved[0]!).tokens).toEqual(run.tokens)
  } finally { await Bun.write(release, "done"); await pending; await rm(root, { recursive: true, force: true }) }
}, 10000)

test("runAgent redacts encoded credential values without corrupting JSON metadata or split UTF-8", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-output-encoded-"))
  const secrets = ['"quoted-canary"', "пароль-Ω/ключ"]
  try {
    const run = await runAgent({ command: { ...fakeCommand(), cleanupSecrets: secrets, cmd: [process.execPath, "-e", `
      const secrets=${JSON.stringify(secrets)};
      const line=Buffer.from(JSON.stringify({type:"text",sessionID:"quoted-canary",part:{text:secrets.join("|")+"|"+secrets.map(encodeURIComponent).join("|")}})+"\\n");
      const cut=line.indexOf(Buffer.from(secrets[1]))+1;
      process.stdout.write(line.subarray(0,cut));await Bun.sleep(30);process.stdout.write(line.subarray(cut));
      process.stderr.write(secrets.join("|"));
      console.log(JSON.stringify({type:"step_finish",part:{cost:0.25,tokens:{input:5,output:2,reasoning:1}}}));
    `] }, taskId: "encoded-output", model: "fake/fake-model", prompt: "diagnostic", files: [], workdir: root, timeoutMs: 5000, outDir: root })
    const events = (await Bun.file(path.join(root, "events.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))
    expect(events[0].sessionID).toBe("quoted-canary")
    expect(run.sessionId).toBe("quoted-canary")
    expect(parseEvents(events.map(event => JSON.stringify(event)).join("\n")).tokens).toEqual(run.tokens)
    for (const secret of secrets) {
      expect(events[0].part.text).not.toContain(secret)
      expect(events[0].part.text).not.toContain(encodeURIComponent(secret))
      expect(await Bun.file(path.join(root, "stderr.txt")).text()).not.toContain(secret)
      expect(run.finalText).not.toContain(secret)
    }
    expect(run.processCleanup).toMatchObject({ status: "confirmed", capture_complete: true })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("runAgent flushes redacted incomplete output on cancellation and retains the measured prefix", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-output-cancel-"))
  const secret = "credential-first-line\ncredential-second-line", marker = path.join(root, "ready"), abort = new AbortController()
  const pending = runAgent({ command: { ...fakeCommand(), cleanupSecrets: [secret], cmd: [process.execPath, "-e", `
    process.on("SIGINT",()=>process.exit(130));
    console.log(JSON.stringify({type:"step_finish",part:{cost:0.5,tokens:{input:9,output:4,reasoning:2}}}));
    process.stdout.write('{"type":"text","part":{"text":'+JSON.stringify(${JSON.stringify(secret)}).slice(0,-1));
    process.stderr.write(${JSON.stringify(secret)});
    await Bun.write(${JSON.stringify(marker)},"ready");await Bun.sleep(10000);
  `] }, taskId: "cancel-output", model: "fake/fake-model", prompt: "diagnostic", files: [], workdir: root, timeoutMs: 5000, outDir: root, signal: abort.signal })
  void pending.catch(() => {})
  try {
    const deadline = Date.now() + 3000
    while (!await Bun.file(marker).exists()) {
      if (Date.now() > deadline) throw Error("Cancellation output did not arrive")
      await Bun.sleep(10)
    }
    abort.abort()
    const run = await pending
    expect(run).toMatchObject({ exitCode: 130, interrupted: true, timedOut: false, cost: 0.5, tokens: { input: 9, output: 4, reasoning: 2 },
      processCleanup: { status: "confirmed", capture_complete: true } })
    const outputs = await Promise.all(["events.jsonl", "stderr.txt", "run.json"].map(name => Bun.file(path.join(root, name)).text()))
    expect(parseEvents(outputs[0]!).tokens).toEqual(run.tokens)
    for (const value of [secret, JSON.stringify(secret).slice(1, -1)]) expect(outputs.join("\n")).not.toContain(value)
    expect(outputs[0]).toContain("[redacted]")
    expect(outputs[1]).toBe("[redacted]")
  } finally { abort.abort(); await pending; await rm(root, { recursive: true, force: true }) }
})

test("runAgent masks complete credentials before truncating diagnostics and node receipts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-output-truncated-"))
  const secrets = ["stderr-private-prefix\nstderr-private-tail", "node-secret-prefix-private-credential-value"]
  try {
    const run = await runAgent({ command: { ...fakeCommand(), cleanupSecrets: secrets, cmd: [process.execPath, "-e", `
      process.stderr.write("safe\\n".repeat(19)+${JSON.stringify(secrets[0])});
      console.log(JSON.stringify({type:"tool_use",part:{type:"tool",tool:"loginom_dock_node_apply",state:{status:"completed",output:"x".repeat(8192-19)+${JSON.stringify(secrets[1])}+"y".repeat(100)}}}));
      console.log(JSON.stringify({type:"step_finish",part:{cost:0.5,tokens:{input:9,output:4,reasoning:2}}}));
    `] }, taskId: "truncated-output", model: "fake/fake-model", prompt: "diagnostic", files: [], workdir: root, timeoutMs: 5000, outDir: root })
    expect(run.stderrHead).not.toContain("stderr-private-prefix")
    expect(run.stderrHead).toContain("[redacted]")
    expect(run.nodeReceipts[0]).not.toContain("node-secret-prefix-")
    expect(run.nodeReceipts[0]).toEndWith("…[truncated]")
    expect(run).toMatchObject({ exitCode: 0, cost: 0.5, tokens: { input: 9, output: 4, reasoning: 2 }, nodeReceiptsDropped: 0,
      processCleanup: { status: "confirmed", capture_complete: true } })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("runAgent keeps operational session, artifact and revision bindings while masking diagnostic echoes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-agent-output-bindings-"))
  const secret = "binding-fragment", session = `ses_${secret}`, packagePath = `/own/${secret}.lgp`
  try {
    const run = await runAgent({ command: { ...fakeCommand(), cleanupSecrets: [secret, "aaaaaaaa"], cmd: [process.execPath, "-e", `
      const sessionID=${JSON.stringify(session)};
      console.log(JSON.stringify({type:"tool_use",sessionID,part:{type:"tool",tool:"loginom_dock_action_run",state:{status:"completed",input:{action_key:"package.save_as"},output:JSON.stringify({package_ref:{path:${JSON.stringify(packagePath)}}})}}}));
      console.log(JSON.stringify({type:"tool_use",sessionID,part:{type:"tool",tool:"loginom_dock_prepare",state:{status:"completed",output:JSON.stringify({skillRevision:${JSON.stringify(secret)},manifest_sha256:"a".repeat(64)})}}}));
      console.log(JSON.stringify({type:"text",sessionID,part:{text:${JSON.stringify(secret)}}}));
    `] }, taskId: "output-bindings", model: "fake/fake-model", prompt: "diagnostic", files: [], workdir: root, timeoutMs: 5000, outDir: root })
    expect(run).toMatchObject({ sessionId: session, saveReceipts: [packagePath], skillRevision: secret, actionManifestSha256: "a".repeat(64),
      finalText: "[redacted]", processCleanup: { status: "confirmed", capture_complete: true } })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("parseEvents retains an explicit provider HTTP 429 without claiming complete transport coverage", () => {
  const parsed = parseEvents([
    { type: "error", error: { name: "APIError", data: { statusCode: 429, message: "provider-private-canary", responseBody: "private-response-canary" } } },
    { type: "text", part: { text: "completed after retry" } },
    { type: "step_finish", part: { cost: 0.5 } },
  ].map(event => JSON.stringify(event)).join("\n"))
  expect(parsed.limitEvidence).toEqual({ coverage: { provider: "unavailable", dock: "unavailable", judge: "unavailable" },
    events: [{ source: "provider", kind: "http", status: 429 }] })
  expect(assessParallelLimits(parsed.limitEvidence)).toMatchObject({ status: "failed", codes: expect.arrayContaining(["PROVIDER_HTTP_429"]) })
  expect(JSON.stringify(parsed.limitEvidence)).not.toContain("canary")
  expect({ cost: parsed.cost, finalText: parsed.finalText, errors: parsed.errors }).toEqual({ cost: 0.5,
    finalText: "completed after retry", errors: ["APIError"] })
})

test("parseEvents preserves a recovered session retry as a provider failure without retaining its message", () => {
  const parsed = parseEvents([
    { type: "session.status", sessionID: "own", status: { type: "busy" } },
    { type: "session.status", sessionID: "own", status: { type: "retry", attempt: 1, message: "private-canary" } },
    { type: "text", sessionID: "own", part: { text: "recovered" } },
    { type: "session.status", sessionID: "own", status: { type: "idle" } },
  ].map(event => JSON.stringify(event)).join("\n"))
  expect(parsed.limitEvidence.events).toEqual([{ source: "provider", kind: "retry" }])
  expect(assessParallelLimits(parsed.limitEvidence)).toMatchObject({ status: "failed", codes: expect.arrayContaining(["PROVIDER_RETRY"]) })
  expect(JSON.stringify(parsed.limitEvidence)).not.toContain("private-canary")
  expect(parsed.finalText).toBe("recovered")
})

test("provider coverage requires a complete main session without delegated model work", () => {
  const busy = { type: "session.status", sessionID: "own", status: { type: "busy" } }
  const idle = { type: "session.status", sessionID: "own", status: { type: "idle" } }
  const text = { type: "text", sessionID: "own", part: { text: "done" } }
  const parse = (events: unknown[]) => parseEvents(events.map(event => JSON.stringify(event)).join("\n")).limitEvidence.coverage.provider
  expect(parse([busy, text, idle])).toBe("complete")
  for (const events of [[text], [busy, text], [idle, busy], [busy, text, { ...idle, sessionID: "foreign" }],
    [busy, { type: "tool_use", sessionID: "own", part: { type: "tool", tool: "task" } }, idle]])
    expect(parse(events)).toBe("unavailable")
  expect(parseEvents([JSON.stringify(busy), "broken JSON", JSON.stringify(idle)].join("\n")).limitEvidence.coverage.provider).toBe("unavailable")
})

test("provider limit evidence keeps absent, textual and malformed observations incomplete", () => {
  for (const events of [[], [{ type: "text", part: { text: "APIError status 429" } }],
    [{ type: "error", error: { name: "CLI_TOOL_FAILED", data: { statusCode: 429 } } }],
    [{ type: "error", error: { name: "APIError", data: { statusCode: "429" } } }]]) {
    const parsed = parseEvents(events.map(event => JSON.stringify(event)).join("\n"))
    expect(parsed.limitEvidence.events).toEqual([])
    expect(assessParallelLimits(parsed.limitEvidence).status).toBe("incomplete")
  }
})

test("runAgent persists provider limit metadata from the actual supervised JSON stream", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-provider-limit-"))
  let confirmed = false
  try {
    const events = [{ type: "error", error: { name: "APIError", data: { statusCode: 429, message: "fixture-http-limit" } } },
      { type: "text", part: { text: "done" } }]
    const run = await runAgent({ command: { ...fakeCommand(), cmd: [process.execPath, "-e",
      `for(const event of ${JSON.stringify(events)})console.log(JSON.stringify(event));await Bun.sleep(100)`],
      env: { PATH: process.env.PATH ?? "", HOME: root } }, taskId: "fixture-limit", model: "fake/fake-model",
      prompt: "fixture", files: [], workdir: root, timeoutMs: 5000, outDir: root })
    confirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect({ confirmed, exitCode: run.exitCode, finalText: run.finalText }).toEqual({ confirmed: true, exitCode: 0, finalText: "done" })
    expect(run.limitEvidence.events).toEqual([{ source: "provider", kind: "http", status: 429 }])
    expect((await Bun.file(path.join(root, "run.json")).json()).limitEvidence).toEqual(run.limitEvidence)
    expect((await Bun.file(path.join(root, "events.jsonl")).text()).trim().split("\n").map(line => JSON.parse(line))).toEqual(events)
    expect(assessParallelLimits(run.limitEvidence).status).toBe("failed")
  } finally { if (confirmed) await rm(root, { recursive: true, force: true }) }
})

test("parseEvents: квитанция сохранения читается из последовательности JSON-документов", () => {
  const output = '{"output":{"package_ref":{"path":"/user/eval-run-task-1.lgp"}}}\n{"status":"ok"}\n{"trace":{"note":"literal } and \\\" quote"}}'
  const parsed = parseEvents(JSON.stringify({ type: "tool_use", part: {
    type: "tool", tool: "loginom_dock_action_run", state: {
      status: "completed", input: { action_key: "package.save_as" }, output,
    },
  } }))
  expect(parsed.saveReceipts).toEqual(["/user/eval-run-task-1.lgp"])
})

test("parseEvents: сессия, квитанция сохранения, узлы, текст, стоимость", async () => {
  const parsed = parseEvents(await fixture("fake/group-sum-qty.jsonl"))
  expect(parsed.sessionId).toBe("ses_fixture01")
  expect(parsed.saveReceipts).toEqual(["/user/fixture-group-sum-qty.lgp"])
  expect(parsed.nodeReceipts).toHaveLength(1)
  expect(parsed.nodeReceipts[0]).toContain('"row_count":2')
  expect(parsed.actionManifestSha256).toBe("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
  expect(parsed.finalText).toBe("Пакет сохранён: /user/fixture-group-sum-qty.lgp")
  expect(parsed.cost).toBeCloseTo(0.0123)
  expect(parsed.tokens).toEqual({ input: 1200, output: 300, reasoning: 0 })
  expect(parsed.errors).toEqual([])
  expect(parsed.counters).toEqual({ toolCalls: 3, loginomToolCalls: 3, toolErrors: 0, memoryToolCalls: 0 })
  expect(parsed.tools[2]).toMatchObject({ tool: "loginom_dock_action_run", status: "completed", action: "package.save_as" })
  expect(parsed.tools[1]).toMatchObject({ tool: "loginom_dock_node_apply", target: "transform.group_data" })
})

test("parseEvents: ошибочная фикстура даёт имена ошибок и счётчик toolErrors", async () => {
  const parsed = parseEvents(await fixture("fake/filter-active-rows.jsonl"))
  expect(parsed.errors).toEqual(["CLI_TOOL_FAILED"])
  expect(parsed.saveReceipts).toEqual([])
  expect(parsed.counters.toolErrors).toBe(1)
})

test("parseEvents: preflight-ошибка без sessionID", async () => {
  const parsed = parseEvents(await fixture("events/preflight-error.jsonl"))
  expect(parsed.sessionId).toBeUndefined()
  expect(parsed.errors).toEqual(["LOGINOM_RECOVERY_REQUIRED"])
})

test("failureKind: приоритет permission → recovery → cancelled → provider → tool → other", () => {
  const base = { exitCode: 1, errors: [] as string[], errorTexts: [] as string[], stderr: "" }
  expect(failureKind({ ...base, errors: ["CLI_PERMISSION_REJECTED", "CLI_TOOL_FAILED"] })).toBe("permission")
  expect(failureKind({ ...base, exitCode: 4 })).toBe("recovery")
  expect(failureKind({ ...base, exitCode: 130 })).toBe("cancelled")
  expect(failureKind({ ...base, errorTexts: ["APIError status 429 rate limit"] })).toBe("provider")
  expect(failureKind({ ...base, stderr: "ProviderAuthError: token expired" })).toBe("provider")
  expect(failureKind({ ...base, stderr: "connect ECONNRESET to dock" })).toBe("other")
  expect(failureKind({ ...base, errorTexts: ["tool status 4000ms"] })).toBe("other")
  expect(failureKind({ ...base, errors: ["CLI_TOOL_FAILED"] })).toBe("tool")
  expect(failureKind(base)).toBe("other")
})

test("agentCommand: fake-режим указывает на fixtures/fake-cli.ts и изолирует окружение", () => {
  const config = loadConfig(["--dry-run"], {})
  const command = agentCommand(config, { ...process.env, LOGINOM_AI_AGENT_LEAK: "x", PATH: process.env.PATH ?? "" })
  expect(command.cmd[0]).toBe("bun")
  expect(command.cmd[1]?.endsWith("fixtures/fake-cli.ts")).toBe(true)
  expect(command.env.LOGINOM_AI_AGENT_CLI_PROFILE).toBe(config.profileDir)
  expect(command.env.LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG).toBe("1")
  expect(command.env.LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT).toBe("1")
  expect(command.env.LOGINOM_AI_AGENT_PURE).toBe("1")
  expect(command.env.LOGINOM_AI_AGENT_LEAK).toBeUndefined()
  expect(Object.keys(command.env).filter((key) => key.startsWith("LOGINOM_AI_AGENT_")).sort()).toEqual([
    "LOGINOM_AI_AGENT_CLI_PROFILE",
    "LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT",
    "LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG",
    "LOGINOM_AI_AGENT_PURE",
  ])
})

test("agentCommand: v2 slots force HTTP-only transport despite inherited WebSocket opt-in", () => {
  const config = loadConfig(["--dry-run"], { EVAL_SLOTS_FILE: "fixture-programmatic-only" })
  const command = agentCommand(config, { LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS: "true" })
  expect(command.env.LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS).toBe("false")
  expect(agentCommand(loadConfig(["--dry-run"], {}), {}).env.LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS).toBeUndefined()
})

test("agentCommand: real slots inherit only operational environment, never unrelated credentials", () => {
  const config = loadConfig([], { EVAL_SLOTS_FILE: "private-slots.json", EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli", EVAL_AGENT_MODEL: "openai/gpt-6-luna",
    JUDGE_MODEL: "gpt-6-sol", LOGINOM_DOCK_API_KEY: "dock-private" })
  const command = agentCommand(config, { PATH: "/usr/bin:/bin", HOME: "/private/home", LANG: "C.UTF-8", TMPDIR: "/private/tmp",
    OPENAI_API_KEY: "openai-private", ANTHROPIC_API_KEY: "anthropic-private", AWS_SECRET_ACCESS_KEY: "aws-private",
    PRIVATE_UNRELATED_TOKEN: "unrelated-private", CODEX_HOME: "/private/judge", LOGINOM_PASSWORD: "slot-private" })
  expect(command.env).toMatchObject({ PATH: "/usr/bin:/bin", HOME: "/private/home", LANG: "C.UTF-8", TMPDIR: "/private/tmp" })
  expect(Object.values(command.env).join("\n")).not.toContain("-private")
  expect(command.env.CODEX_HOME).toBeUndefined()
})

test("agentCommand: real slots preserve credential-free proxy routing", () => {
  const config = loadConfig([], { EVAL_SLOTS_FILE: "private-slots.json", EVAL_CLI_MODE: "binary", EVAL_CLI_BIN: "/pinned/cli",
    EVAL_AGENT_MODEL: "openai/gpt-6-luna", JUDGE_MODEL: "gpt-6-sol", LOGINOM_DOCK_API_KEY: "dock-private" })
  const routing = { HTTP_PROXY: "http://127.0.0.1:10808", https_proxy: "http://127.0.0.1:10808",
    ALL_PROXY: "socks5://127.0.0.1:10808", NO_PROXY: "localhost,127.0.0.1", no_proxy: "localhost,127.0.0.1" }
  const command = agentCommand(config, { ...routing, HTTPS_PROXY: "http://user:proxy-private@127.0.0.1:10808",
    all_proxy: "http://127.0.0.1:10808?token=proxy-private", OPENAI_API_KEY: "openai-private" })
  expect(command.env).toMatchObject(routing)
  expect(command.env.HTTPS_PROXY).toBeUndefined()
  expect(command.env.all_proxy).toBeUndefined()
  expect(agentCommand(config, { HTTP_PROXY: "http://127.0.0.1:10808/proxy-private" }).env.HTTP_PROXY).toBeUndefined()
  expect(Object.values(command.env).join("\n")).not.toContain("-private")
})

test("agentCommand: only configured slot auth can grant the shared directory", () => {
  const config = loadConfig(["--dry-run"], { EVAL_SLOTS_FILE: "fixture-programmatic-only" })
  const inherited = { LOGINOM_AI_AGENT_SHARED_AUTH_DIR: "/untrusted/inherited" }
  expect(agentCommand({ ...config, auth: { sharedDir: "/private/shared" } }, inherited).env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR).toBe("/private/shared")
  expect(agentCommand(config, inherited).env.LOGINOM_AI_AGENT_SHARED_AUTH_DIR).toBeUndefined()
})

test("agentCommand: management children receive HTTP-only mode without inherited credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-management-http-only-"))
  try {
    const command = agentCommand({ ...loadConfig(["--dry-run"], { EVAL_SLOTS_FILE: "fixture-programmatic-only" }), profileDir: root },
      { PATH: process.env.PATH, LOGINOM_PASSWORD: "private-canary", LOGINOM_AI_AGENT_EXPERIMENTAL_WEBSOCKETS: "true" })
    const file = path.join(root, "observed.jsonl")
    const child = Bun.spawn([...command.cmd, "loginom", "status"], { cwd: command.cwd,
      env: { ...command.env, EVAL_FAKE_MANAGEMENT_ENV_FILE: file }, stdout: "ignore", stderr: "pipe" })
    const output = await Promise.all([child.exited, new Response(child.stderr).text()])
    expect(output).toEqual([0, ""])
    expect(JSON.parse((await Bun.file(file).text()).trim())).toEqual({ sub: "status", httpOnly: "false", passwordPresent: false })
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("agentCommand: из env-override выкидывает LOGINOM_/EVAL_/JUDGE_/FAKE_CODEX_ и оставляет PATH", () => {
  const command = agentCommand(loadConfig(["--dry-run"], {}), {
    ...process.env,
    LOGINOM_DOCK_API_KEY: "leak",
    EVAL_X: "leak",
    PATH: "p",
  })
  expect(command.env.LOGINOM_DOCK_API_KEY).toBeUndefined()
  expect(command.env.EVAL_X).toBeUndefined()
  expect(command.env.PATH).toBe("p")
})

test("agentCommand: source-режим запускает standalone.ts из packages/agent с bundle", () => {
  const command = agentCommand(loadConfig([], { LOGINOM_DOCK_API_KEY: "k", EVAL_AGENT_MODEL: "m/x", JUDGE_MODEL: "j" }))
  expect(command.cmd).toEqual(["bun", "run", "src/standalone.ts"])
  expect(command.cwd.endsWith(path.join("packages", "agent"))).toBe(true)
  expect(command.env.LOGINOM_AI_AGENT_CLI_BUNDLE?.endsWith(".bundle")).toBe(true)
})

test("runAgent: fake CLI — события на диске, квитанция, код 0", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const run = await runAgent({
    command: fakeCommand(),
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
  })
  expect(run.exitCode).toBe(0)
  expect(run.timedOut).toBe(false)
  expect(run.saveReceipts).toEqual(["/user/fixture-group-sum-qty.lgp"])
  expect(await Bun.file(path.join(outDir, "events.jsonl")).exists()).toBe(true)
  expect(await Bun.file(path.join(outDir, "run.json")).exists()).toBe(true)
  expect(run.durationMs).toBeGreaterThanOrEqual(0)
})

test("runAgent: события сохраняются на диск до окончания бюджета", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-live-capture-"))
  const command = fakeCommand()
  const controller = new AbortController()
  const pending = runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_HANG_AFTER_EVENTS: "1" } },
    taskId: "default", model: "fake/model", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 30_000, outDir, signal: controller.signal })
  try {
    await Bun.sleep(400)
    expect(await Bun.file(path.join(outDir, "events.jsonl")).text()).toContain("ses_fixture03")
  } finally { controller.abort(); await pending }
}, 125_000)

test("runAgent: no_artifact закрывает наблюдённого detached потомка и сохраняет исход", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-detached-"))
  const command = fakeCommand()
  const pidFile = path.join(outDir, "child.pid")
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env,
      EVAL_FAKE_ORPHAN_PID_FILE: pidFile, EVAL_FAKE_DETACHED_CHILD: "1", EVAL_FAKE_EXIT_DELAY_MS: "600" } },
      taskId: "default", model: "fake/model", prompt: "test", files: [],
      workdir: outDir, timeoutMs: 30_000, outDir })
    const pid = Number(await Bun.file(pidFile).text())
    const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
    expect(run.exitCode).toBe(0)
    expect(run.sessionId).toBe("ses_fixture03")
    expect(run.tokens.input).toBe(400)
    expect(run.saveReceipts).toEqual([])
    expect(state === "" || state.startsWith("Z")).toBe(true)
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.processes.some((entry) => entry.pid === pid)).toBe(true)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      try { process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL") } catch {}
    }
  }
}, 15_000)

test("runAgent: передаёт reasoning variant и непустой title без модельной генерации", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-variant-"))
  const command = fakeCommand()
  const argsFile = path.join(outDir, "args.json")
  await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_ARGS_FILE: argsFile } },
    taskId: "group-sum-qty", model: "fake/model", variant: "low", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 30_000, outDir, profileDir: outDir })
  const args = await Bun.file(argsFile).json()
  expect(args.slice(args.indexOf("--variant"), args.indexOf("--variant") + 2)).toEqual(["--variant", "low"])
  expect(args.slice(args.indexOf("--title"), args.indexOf("--title") + 2)).toEqual(["--title", "eval-group-sum-qty"])
})

processDenial("runAgent: недоступный /proc постороннего процесса не мешает cleanup", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-proc-foreign-"))
  const child = spawn(process.execPath, ["-e", `
    const { dlopen } = await import('bun:ffi')
    const lib = dlopen('libc.so.6', { prctl: { args: ['i32', 'u64', 'u64', 'u64', 'u64'], returns: 'i32' } })
    lib.symbols.prctl(4, 0, 0, 0, 0)
    console.log('ready'); setInterval(() => {}, 1000)
  `], { detached: true, stdio: ["ignore", "pipe", "ignore"], cwd: os.tmpdir() })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    await new Promise((resolve) => child.stdout!.once("data", resolve))
    const run = await runAgent({ command: fakeCommand(), taskId: "default", model: "fake/model", prompt: "test",
      files: [], workdir: outDir, timeoutMs: 30_000, outDir })
    expect(run.processCleanup.status).toBe("confirmed")
    expect(child.exitCode).toBeNull()
  } finally { child.kill("SIGKILL"); await exited }
})

test("runAgent: changed writer даёт failed cleanup без потери no_artifact и telemetry", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-changed-writer-"))
  const command = fakeCommand()
  const run = await runAgent({ command: { ...command, env: { ...command.env,
    LOGINOM_AI_AGENT_CLI_PROFILE: outDir, EVAL_FAKE_CHANGED_WRITER: "1" } },
    taskId: "default", model: "fake/model", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 30_000, outDir, profileDir: outDir })
  expect(run.exitCode).toBe(0)
  expect(run.sessionId).toBe("ses_fixture03")
  expect(run.tokens.input).toBe(400)
  expect(run.processCleanup.status).toBe("failed")
  expect(run.processCleanup.error).toContain("Writer identity changed")
  expect(await Bun.file(path.join(outDir, ".writer", "owner")).text()).toBe("replacement")
  expect(await Bun.file(`${outDir}.process-group`).exists()).toBe(true)
})

test("runAgent: timeout с отказом ownership ограничен и сохраняет уже полученную телеметрию", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-timeout-proof-"))
  const command = agentCommand(loadConfig(["--dry-run"], {}))
  const run = await runAgent({ command: { ...command, env: { ...command.env,
    LOGINOM_AI_AGENT_CLI_PROFILE: outDir, EVAL_FAKE_CHANGED_WRITER: "1", EVAL_FAKE_HANG_AFTER_EVENTS: "1" } },
    taskId: "default", model: "fake/model", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 1_000, outDir, profileDir: outDir })
  expect(run.timedOut).toBe(true)
  expect(run.sessionId).toBe("ses_fixture03")
  expect(run.tokens.input).toBe(400)
  expect(run.processCleanup.status).toBe("failed")
  expect(run.processCleanup.processes.every((entry) => {
    try { process.kill(entry.pid, 0); return false } catch { return true }
  })).toBe(true)
  expect(run.durationMs).toBeLessThan(125_000)
}, 130_000)

test("runAgent: код выхода 1 и failureKind=tool из фикстуры", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const run = await runAgent({
    command: fakeCommand(),
    taskId: "filter-active-rows",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
  })
  expect(run.exitCode).toBe(1)
  expect(run.failureKind).toBe("tool")
})

test("runAgent: после exit 1 завершает дочерний host без пути профиля в argv", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-orphan-"))
  const command = fakeCommand()
  const pidFile = path.join(outDir, "child.pid")
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_ORPHAN_PID_FILE: pidFile } },
      taskId: "filter-active-rows", model: "fake/model", prompt: "test", files: [],
      workdir: outDir, timeoutMs: 30_000, outDir })
    const pid = Number(await Bun.file(pidFile).text())
    const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
    expect(run.exitCode).toBe(1)
    expect(state === "" || state.startsWith("Z")).toBe(true)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      const pid = Number(await Bun.file(pidFile).text())
      try { process.kill(pid, "SIGKILL") } catch {}
    }
  }
}, 15_000)

test("runAgent: регистрирует активную группу профиля и снимает запись после cleanup", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-group-record-"))
  const command = fakeCommand()
  const marker = `${outDir}.process-group`
  const running = runAgent({ command: { ...command, env: { ...command.env,
    LOGINOM_AI_AGENT_CLI_PROFILE: outDir, EVAL_FAKE_SLEEP_MS: "300" } },
    taskId: "group-sum-qty", model: "fake/model", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 30_000, outDir, profileDir: outDir })
  try {
    for (let index = 0; index < 10 && !(await Bun.file(marker).exists()); index++) await Bun.sleep(10)
    expect(await Bun.file(marker).exists()).toBe(true)
  } finally { await running }
  expect(await Bun.file(marker).exists()).toBe(false)
})

test("runAgent: занятая process registration запрещает dispatch CLI", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-registration-"))
  const command = fakeCommand()
  const args = path.join(out, "called.json")
  await Bun.write(`${out}.process-group`, "foreign-marker")
  await expect(runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_ARGS_FILE: args } },
    taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out,
    outDir: out, profileDir: out, timeoutMs: 30_000 })).rejects.toThrow("Registration unavailable")
  expect(await Bun.file(args).exists()).toBe(false)
  expect(await Bun.file(`${out}.process-group`).text()).toBe("foreign-marker")
})

test("runAgent: symlink профиля не обходит canonical process registration", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-registration-alias-"))
  const profile = path.join(directory, "profile")
  const alias = path.join(directory, "alias")
  await mkdir(profile)
  await symlink(profile, alias)
  await Bun.write(`${profile}.process-group`, "foreign-marker")
  const command = fakeCommand()
  const args = path.join(directory, "called.json")
  await expect(runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_ARGS_FILE: args } },
    taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: directory,
    outDir: directory, profileDir: alias, timeoutMs: 30_000 })).rejects.toThrow("Registration unavailable")
  expect(await Bun.file(args).exists()).toBe(false)
  expect(await Bun.file(`${profile}.process-group`).text()).toBe("foreign-marker")
  expect(await Bun.file(`${alias}.process-group`).exists()).toBe(false)
})

test("runAgent: таймаут останавливает процесс и помечает timedOut", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const command = fakeCommand()
  const run = await runAgent({
    command: { ...command, env: { ...command.env, EVAL_FAKE_SLEEP_MS: "10000" } },
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 300,
    outDir,
  })
  expect(run.timedOut).toBe(true)
  expect(run.durationMs).toBeLessThan(5_000)
}, 15_000)

test("runAgent: уже отменённый AbortSignal не спавнит агента", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const command = fakeCommand()
  const controller = new AbortController()
  controller.abort()
  const run = await runAgent({
    command: { ...command, env: { ...command.env, EVAL_FAKE_SLEEP_MS: "10000" } },
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
    signal: controller.signal,
  })
  expect(run.interrupted).toBe(true)
  expect(run.durationMs).toBeLessThan(2_000)
}, 15_000)

test("runAgent: abort через AbortSignal помечает interrupted", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-run-"))
  const command = fakeCommand()
  const controller = new AbortController()
  setTimeout(() => controller.abort(), 200)
  const run = await runAgent({
    command: { ...command, env: { ...command.env, EVAL_FAKE_SLEEP_MS: "10000" } },
    taskId: "group-sum-qty",
    model: "fake/fake-model",
    prompt: "test",
    files: [],
    workdir: outDir,
    timeoutMs: 30_000,
    outDir,
    signal: controller.signal,
  })
  expect(run.interrupted).toBe(true)
  expect(run.timedOut).toBe(false)
}, 15_000)

test("parseEvents: записывает ревизию skill из квитанции сессии", () => {
  const parsed = parseEvents(JSON.stringify({ type: "tool_use", part: {
    type: "tool", tool: "loginom_dock_prepare", state: { status: "completed",
      output: '{"prepared":true,"skillRevision":"session-revision"}\n{"status":"ok"}' },
  } }))
  expect(parsed.skillRevision).toBe("session-revision")
})

test("runAgent: завершившийся CLI не становится timeout во время cleanup host", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-cleanup-budget-"))
  const command = fakeCommand()
  const run = await runAgent({ command: { ...command, env: { ...command.env,
    EVAL_FAKE_ORPHAN_PID_FILE: path.join(outDir, "child.pid"), EVAL_FAKE_CHILD_DELAY_MS: "800" } },
    taskId: "group-sum-qty", model: "fake/model", prompt: "test", files: [],
    workdir: outDir, timeoutMs: 500, outDir })
  expect(run.exitCode).toBe(0)
  expect(run.timedOut).toBe(false)
})


test("runAgent: отказ записи process evidence сохраняет измеренный исход и guard", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-proof-write-"))
  await mkdir(path.join(out, "process-cleanup.json"))
  const command = fakeCommand()
  const run = await runAgent({ command, taskId: "default", model: "fake/model", prompt: "test", files: [],
    workdir: out, outDir: out, profileDir: out, timeoutMs: 10_000 })
  expect(run.exitCode).toBe(0)
  expect(run.sessionId).toBe("ses_fixture03")
  expect(run.processCleanup.status).toBe("failed")
  expect(await Bun.file(`${out}.process-group`).exists()).toBe(true)
  expect((await Bun.file(path.join(out, "run.json")).json()).sessionId).toBe(run.sessionId)
})


processDenial("runAgent: полностью прочитанная чужая ancestry не мешает cleanup при закрытом exe", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-proc-denied-"))
  const command = fakeCommand()
  const pending = runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_EXIT_DELAY_MS: "700" } },
    taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out, outDir: out, timeoutMs: 10_000 })
  await Bun.sleep(150)
  const child = spawn(process.execPath, ["-e", `
    process.title = 'chrome-private'
    const { dlopen, ptr } = await import('bun:ffi')
    const lib = dlopen('libc.so.6', { prctl: { args: ['i32', 'u64', 'u64', 'u64', 'u64'], returns: 'i32' } })
    const name = Buffer.from('chrome-private\\0')
    lib.symbols.prctl(15, BigInt(ptr(name)), 0, 0, 0)
    lib.symbols.prctl(4, 0, 0, 0, 0)
    console.log('ready'); setInterval(() => {}, 1000)
  `], { detached: true, stdio: ["ignore", "pipe", "ignore"], cwd: os.tmpdir() })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    await new Promise((resolve) => child.stdout!.once("data", resolve))
    const run = await pending
    expect(run.exitCode).toBe(0)
    expect(run.sessionId).toBe("ses_fixture03")
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.error).toBeNull()
    expect(child.exitCode).toBeNull()
  } finally { child.kill("SIGKILL"); await exited; await rm(out, { recursive: true }) }
})

test("runAgent: отказ записи run evidence сохраняет измеренный исход", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-proof-write-"))
  await mkdir(path.join(out, "run.json"))
  const command = fakeCommand()
  const run = await runAgent({ command, taskId: "default", model: "fake/model", prompt: "test", files: [],
    workdir: out, outDir: out, profileDir: out, timeoutMs: 10_000 })
  expect(run.exitCode).toBe(0)
  expect(run.sessionId).toBe("ses_fixture03")
  expect(run.processCleanup.status).toBe("failed")
})

test("runAgent: launcher жив до завершения helper, игнорирующего мягкие сигналы", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-launcher-order-"))
  const command = fakeCommand()
  const pidFile = path.join(out, "helper.pid")
  const pending = runAgent({ command: { ...command, env: { ...command.env,
    EVAL_FAKE_ORPHAN_PID_FILE: pidFile, EVAL_FAKE_DETACHED_CHILD: "1", EVAL_FAKE_CHILD_DELAY_MS: "20000",
    EVAL_FAKE_EXIT_DELAY_MS: "100" } }, taskId: "default", model: "fake/model", prompt: "test", files: [],
    workdir: out, outDir: out, profileDir: out, timeoutMs: 2000 })
  let observed = 0
  for (const _ of Array.from({ length: 80 })) {
    await Bun.sleep(100)
    if (!(await Bun.file(pidFile).exists())) continue
    const pid = Number(await Bun.file(pidFile).text())
    const fields = await Bun.file(`/proc/${pid}/stat`).text().catch(() => "")
    if (!fields || /^[ZX] /.test(fields.slice(fields.lastIndexOf(")") + 2))) break
    const launcher = Number(await Bun.file(`${out}.process-group`).text())
    process.kill(launcher, 0)
    observed++
  }
  const run = await pending
  expect(observed).toBeGreaterThan(10)
  expect(run.timedOut).toBe(false)
  expect(run.exitCode).toBe(0)
  expect(run.processCleanup.status).toBe("confirmed")
  expect(run.processCleanup.verification).toHaveLength(2)
  expect(run.processCleanup.verification?.every((pass) => pass.owned_remaining === 0)).toBe(true)
}, 15_000)
