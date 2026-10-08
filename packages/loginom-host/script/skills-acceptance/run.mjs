import assert from "node:assert/strict"
import { spawn } from "node:child_process"
import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile, appendFile, cp, readdir } from "node:fs/promises"
import { join } from "node:path"
import { scheduler } from "node:timers/promises"
import { observeProcesses } from "./processes.mjs"
import { collectExecutionJournals } from "./journals.mjs"
import { verifySalesScenario } from "./scenario.mjs"
import { verifyImportBuild, verifyCalculatorModification, verifyImportExecution } from "./scenario-import.mjs"
import { acceptanceTurns } from "./turns.mjs"
const chunks = []
for await (const chunk of process.stdin) chunks.push(chunk)
const input = JSON.parse(Buffer.concat(chunks).toString())
const secrets = [
  input.apiKey,
  ...(input.connection?.password ? [input.connection.password] : []),
  ...(input.auth.type === "api" ? [input.auth.key] : [input.auth.access, input.auth.refresh]),
]
const testcase = input.testcase
const docsFirst = testcase.id === "scenario-after-docs"
const turns = acceptanceTurns(testcase)
const transition = turns.length > 1
const scenario = turns.some((turn) => turn.scenario)
assert.ok(["docs", "default"].includes(testcase.group) || scenario)
assert.ok(transition || (!testcase.setup && !testcase.followup), "MULTITURN_ADAPTER_REQUIRED")
const evidence = "/home/tester/evidence"
await mkdir(evidence, { mode: 0o700 })
const cli = input.installed + "/bin/loginom-ai-agent-cli"
const [providerID] = input.model.split("/")
if (testcase.connection !== "unconfigured" && testcase.id !== "default-translation") {
  const setup = spawn(cli, ["loginom", "setup", "--stdin-json", "--format", "json", "--headless"], {
    stdio: ["pipe", "pipe", "pipe"],
  })
  setup.stdin.end(
    JSON.stringify({
      apiKey: input.apiKey,
      ...(scenario ? input.connection : { password: "", url: "http://127.0.0.1:9/", username: "user" }),
    }),
  )
  let out = "",
    err = ""
  setup.stdout.on("data", (chunk) => (out += chunk))
  setup.stderr.on("data", (chunk) => (err += chunk))
  const code = await new Promise((resolve) => setup.once("exit", resolve))
  assert.ok(!secrets.some((secret) => (out + err).includes(secret)))
  await writeFile(join(evidence, "setup.json"), out)
  await writeFile(join(evidence, "setup-stderr.log"), err)
  assert.equal(code, 0)
  const view = JSON.parse(out)
  // Save confirms activation; the generation's Help catalog may still be loading.
  assert.ok(["starting", "ready"].includes(view.state))
  assert.equal(view.browser.state, scenario ? "verified" : "failed")
} else {
  // Let the public CLI create its profile marker before adding model auth.
  const initialize = spawn(
    "/usr/bin/strace",
    [
      "-f",
      "-e",
      "trace=process",
      "-o",
      join(evidence, "initialize.trace"),
      cli,
      "loginom",
      "status",
      "--format",
      "json",
    ],
    { stdio: ["ignore", "pipe", "pipe"] },
  )
  let out = "",
    err = ""
  initialize.stdout.on("data", (chunk) => (out += chunk))
  initialize.stderr.on("data", (chunk) => (err += chunk))
  const code = await new Promise((resolve) => initialize.once("exit", resolve))
  assert.ok(!secrets.some((key) => (out + err).includes(key)))
  await writeFile(join(evidence, "initialize.json"), out)
  await writeFile(join(evidence, "initialize-stderr.log"), err)
  assert.equal(code, 0)
  assert.equal(JSON.parse(out).state, "unconfigured")
  assert.ok(
    !(await readFile(join(evidence, "initialize.trace"), "utf8"))
      .split("\n")
      .some((line) => /execve\(/.test(line) && /chrome|chromium/.test(line)),
  )
}
const profile = "/home/tester/.config/com.loginom.aiagent/cli/profiles/default"
await mkdir(join(profile, "data"), { recursive: true, mode: 0o700 })
await writeFile(join(profile, "data/auth.json"), JSON.stringify({ [providerID]: input.auth }), {
  mode: 0o600,
  flag: "wx",
})
await mkdir("/home/tester/workspace", { mode: 0o700 })
await mkdir("/home/tester/input", { mode: 0o700 })
const local = "/home/tester/workspace/Сценарий.LGP",
  lgp = "/home/tester/input/Исходный сценарий.LGP",
  png = "/home/tester/input/Контекст.png"
const csv = "/home/tester/input/sales.csv"
if (scenario) await cp(input.fixtures.csv, csv)
if (testcase.input === "workspace-path") await cp(input.fixtures.lgp, local)
if (docsFirst || ["lgp-attachment", "lgp-and-png-attachments", "external-text-path"].includes(testcase.input))
  await cp(input.fixtures.lgp, lgp)
if (testcase.input === "lgp-and-png-attachments") await cp(input.fixtures.png, png)
const bindings = {
  local_lgp: local,
  unicode_lgp: lgp,
  missing_lgp: "/home/tester/workspace/Отсутствующий.LGP",
  server_package: scenario ? input.packagePath : "/user/package-docs-acceptance/not-opened/missing.lgp",
}
const bindPrompt = (text) =>
  text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    assert.ok(bindings[key], "UNKNOWN_BINDING")
    return bindings[key]
  })
let sessionID, built
for (const [turnIndex, turn] of turns.entries()) {
  const evidence = transition ? "/home/tester/evidence/turn-" + (turnIndex + 1) : "/home/tester/evidence"
  if (transition) await mkdir(evidence, { mode: 0o700 })
  const scenario = turn.scenario
  const priorFiles = new Set(await readdir("/home/tester/workspace", { recursive: true }))
  const originalPath = scenario ? csv : turn.input === "workspace-path" ? local : lgp
  const original = await readFile(originalPath).then(
    (bytes) => createHash("sha256").update(bytes).digest("hex"),
    () => undefined,
  )
  const prompt = bindPrompt(turn.prompt)
  const attachments =
    turn.input === "csv-attachment"
      ? [csv]
      : turn.input === "lgp-attachment"
        ? [lgp]
        : turn.input === "lgp-and-png-attachments"
          ? [lgp, png]
          : []
  const args = [
    cli,
    "run",
    "--dir",
    "/home/tester/workspace",
    "--format",
    "json",
    "--model",
    input.model,
    ...(input.variant !== "default" ? ["--variant", input.variant] : []),
    ...(input.headless ? ["--headless"] : ["--no-headless"]),
    ...(scenario ? ["--auto"] : []),
    ...(sessionID ? ["--session", sessionID] : []),
    ...(attachments.length ? ["--file", ...attachments] : []),
    "--",
    prompt,
  ]
  const observer = observeProcesses()
  const run = spawn("/usr/bin/strace", ["-f", "-e", "trace=process", "-o", join(evidence, "process.trace"), ...args], {
    cwd: "/home/tester/workspace",
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      LOGINOM_AI_AGENT_PURE: "1",
      LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1",
      ...(input.modelsPath ? { LOGINOM_AI_AGENT_MODELS_PATH: input.modelsPath } : {}),
      LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
      LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify({ model: input.model, enabled_providers: [providerID] }),
    },
  })
  const events = []
  let writes = Promise.resolve(),
    interrupted = false
  run.stdout.on("data", (chunk) => {
    events.push(chunk)
    writes = writes.then(() => appendFile(join(evidence, "events.jsonl"), chunk))
  })
  run.stderr.on("data", (chunk) => {
    writes = writes.then(() => appendFile(join(evidence, "stderr.log"), chunk))
  })
  const timeoutMs = scenario ? 1200000 : 480000
  const timer = setTimeout(() => {
    interrupted = true
    run.kill("SIGINT")
  }, timeoutMs)
  const started = Date.now()
  const exit = await new Promise((resolve) => run.once("exit", (code, signal) => resolve({ code, signal })))
  clearTimeout(timer)
  await writes
  const processEvidence = await observer.close()
  await writeFile(join(evidence, "processes.json"), JSON.stringify(processEvidence, null, 2))
  await collectExecutionJournals(profile, evidence, secrets)
  const raw = Buffer.concat(events).toString()
  assert.ok(!secrets.some((secret) => raw.includes(secret)))
  const parsed = raw.trim().split("\n").filter(Boolean).map(JSON.parse)
  const tools = [...new Map(parsed.filter((e) => e.type === "tool_use").map((e) => [e.part.id, e.part])).values()]
  const trace = await readFile(join(evidence, "process.trace"), "utf8")
  const browserExecs = trace.split("\n").filter((line) => /execve\(/.test(line) && /chrome|chromium/.test(line))
  const files = await readdir("/home/tester/workspace", { recursive: true })
  const reports = files.filter((file) => !priorFiles.has(file) && /lgp_report\.(pdf|docx|md)$/.test(file))
  const result = {
    ...exit,
    interrupted,
    timeoutMs,
    model: input.model,
    variant: input.variant,
    headless: input.headless,
    case: testcase.id,
    prompt: turn.prompt,
    wallMs: Date.now() - started,
    originalSha256: original,
    afterSha256: await readFile(originalPath).then(
      (bytes) => createHash("sha256").update(bytes).digest("hex"),
      () => undefined,
    ),
    tools: tools.map((t) => ({
      partID: t.id,
      callID: t.callID,
      name: t.tool,
      status: t.state.status,
      input: t.state.input,
      metadata: t.state.metadata,
      error: t.state.error,
    })),
    text: parsed
      .filter((e) => e.type === "text")
      .map((e) => e.part.text)
      .join("\n"),
    browserExecs,
    reports,
    ...(scenario || transition ? { packagePath: input.packagePath } : {}),
    ...(built ? { builtNodes: built.builtNodes } : {}),
    ...(built && !scenario ? { createdPackageSha256: original } : {}),
  }
  await writeFile(join(evidence, "result.json"), JSON.stringify(result, null, 2))
  await cp("/home/tester/workspace", join(evidence, "workspace"), { recursive: true })
  if (scenario) {
    const csvSha256 = createHash("sha256")
      .update(await readFile(input.fixtures.csv))
      .digest("hex")
    assert.equal(
      createHash("sha256")
        .update(await readFile(csv))
        .digest("hex"),
      csvSha256,
    )
    const verify =
      turn.verification === "import"
        ? verifyImportBuild
        : turn.verification === "calculator"
          ? verifyCalculatorModification
          : turn.verification === "execution"
            ? verifyImportExecution
            : verifySalesScenario
    Object.assign(
      result,
      verify(tools, {
        skills: input.skills,
        csvSha256,
        packagePath: input.packagePath,
        sourceNode: built?.builtNodes.source,
      }),
    )
  }
  await writeFile(join(evidence, "result.json"), JSON.stringify(result, null, 2))
  if (transition) {
    await writeFile("/home/tester/evidence/result.json", JSON.stringify(result, null, 2))
    await cp("/home/tester/workspace", "/home/tester/evidence/workspace", { recursive: true })
  }
  console.log(
    JSON.stringify({ code: exit.code, interrupted, reports, browserExecs: browserExecs.length, wallMs: result.wallMs }),
  )
  assert.equal(processEvidence.remaining.length, 0, "OWNED_PROCESS_SURVIVED")
  const positive = ["pdf", "docx", "md"].includes(turn.expected.result)
  assert.ok(
    exit.code === 0 || (!positive && exit.code === 1 && tools.some((t) => t.state.status === "error")),
    "CLI_EXIT_CONTRACT",
  )
  assert.equal(interrupted, false)
  assert.ok(scenario ? browserExecs.length > 0 : browserExecs.length === 0)
  assert.equal(result.afterSha256, original)
  if (!scenario)
    assert.ok(!tools.some((t) => t.tool.startsWith("loginom_dock_") && t.tool !== "loginom_dock_diagnostics"))
  if (turn.expected.profile === "package-docs")
    assert.ok(
      tools.some(
        (t) =>
          t.tool === "skill" &&
          t.state.metadata?.activation?.profile === "package-docs" &&
          t.state.metadata.activation.digest === input.skills.find((s) => s.name === "package-docs").digest,
      ),
    )
  if (turn.expected.profile === "default") assert.ok(!tools.some((t) => t.state.metadata?.activation))
  if (["pdf", "docx", "md"].includes(turn.expected.result)) {
    assert.equal(reports.length, 1)
    assert.ok(reports[0].endsWith("." + turn.expected.result))
    assert.ok(
      tools.some(
        (t) => t.tool === "package_docs_run" && t.state.input.operation === "emit" && t.state.status === "completed",
      ),
    )
    assert.ok(tools.some((t) => t.tool === "loginom_read" && t.state.status === "completed"))
  } else assert.equal(reports.length, 0)
  // Final request semantics, like report facts/layout, require manual review of result.text.
  if (testcase.id === "default-unconfigured-arithmetic") assert.equal(result.text.trim(), "102")
  if (testcase.id === "default-translation") assert.match(result.text, /documentation.{0,12}ready/i)
  if (transition) {
    const ids = [...new Set(parsed.map((event) => event.sessionID).filter(Boolean))]
    assert.equal(ids.length, 1, "CLI_SESSION_NOT_VERIFIED")
    if (sessionID) assert.equal(ids[0], sessionID, "CLI_SESSION_CHANGED")
    sessionID = ids[0]
    if (turnIndex === 0 && scenario) {
      built = result
      if (turns[1].input !== "lgp-attachment") continue
      console.log(
        JSON.stringify({
          event: "saved-package-input-required",
          packagePath: input.packagePath,
          attempt: input.attempt,
        }),
      )
      const deadline = Date.now() + 60000
      let bytes
      while (Date.now() < deadline && !bytes) {
        bytes = await readFile(lgp).catch(() => undefined)
        if (!bytes) await scheduler.wait(200)
      }
      assert.ok(bytes, "CREATED_PACKAGE_TRANSFER_TIMEOUT")
      await writeFile(
        "/home/tester/evidence/created-package.json",
        JSON.stringify(
          { packagePath: input.packagePath, sha256: createHash("sha256").update(bytes).digest("hex"), sessionID },
          null,
          2,
        ),
      )
    } else {
      await writeFile("/home/tester/evidence/result.json", JSON.stringify({ ...result, sessionID }, null, 2))
      await cp("/home/tester/workspace", "/home/tester/evidence/workspace", { recursive: true })
    }
  }
}
