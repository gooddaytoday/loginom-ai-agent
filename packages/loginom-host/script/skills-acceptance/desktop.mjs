import assert from "node:assert/strict"
import { createRequire } from "node:module"
import { createHash } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, mkdtemp, readFile, writeFile, readdir, cp, rm, chmod } from "node:fs/promises"
import { join, basename, relative } from "node:path"
import { pathToFileURL } from "node:url"
import { setTimeout } from "node:timers/promises"
import { promisify } from "node:util"
import { observeProcesses } from "./processes.mjs"
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
const executable = join(input.artifact, "loginom-ai-agent-linux-x86_64.AppImage")
const require = createRequire(join(input.resources, "runtime/client/package.json"))
const { _electron } = require("playwright-core")
const providerID = input.model.slice(0, input.model.indexOf("/"))
const modelID = input.model.slice(input.model.indexOf("/") + 1)
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex")
const failures = []

for (const testcase of input.cases) {
  const docsFirst = testcase.id === "scenario-after-docs"
  const turns = acceptanceTurns(testcase)
  const transition = turns.length > 1
  const scenario = turns.some((turn) => turn.scenario)
  await mkdir(join(input.output, testcase.id), { mode: 0o700 })
  for (let attempt = 1; attempt <= input.repeat; attempt++) {
    const evidence = join(input.output, testcase.id, "attempt-" + attempt)
    await mkdir(evidence, { mode: 0o700 })
    const root = await mkdtemp("/tmp/loginom-live-gui-")
    const temporary = await mkdtemp("/tmp/la-")
    const home = join(root, "home"),
      workspace = join(root, "workspace"),
      profile = join(root, "profile")
    const filesRoot = join(root, "input")
    await Promise.all([home, workspace, filesRoot].map((path) => mkdir(path, { mode: 0o700 })))
    const local = join(workspace, "Сценарий.LGP"),
      external = join(filesRoot, "Исходный сценарий.LGP")
    const png = join(filesRoot, "Контекст.png"),
      csv = join(filesRoot, "sales.csv")
    if (scenario) await cp(input.fixtures.csv, csv)
    if (testcase.input === "workspace-path") await cp(input.fixtures.lgp, local)
    if (docsFirst || ["lgp-attachment", "lgp-and-png-attachments", "external-text-path"].includes(testcase.input))
      await cp(input.fixtures.lgp, external)
    if (testcase.input === "lgp-and-png-attachments") await cp(input.fixtures.png, png)
    const bindings = {
      local_lgp: local,
      unicode_lgp: external,
      missing_lgp: join(workspace, "Отсутствующий.LGP"),
      server_package: scenario
        ? `/${input.connection.username}/skills-acceptance-${sha(input.output).slice(0, 12)}-${testcase.id}-${attempt}.lgp`
        : "/user/package-docs-acceptance/" + basename(root) + "/missing.lgp",
    }
    const bindPrompt = (text) =>
      text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
        assert.ok(bindings[key], "UNKNOWN_BINDING")
        return bindings[key]
      })
    const trace = join(evidence, "process.trace")
    const wrapper = join(root, "electron")
    const quote = (value) => "'" + value.replaceAll("'", "'\\''") + "'"
    await writeFile(
      wrapper,
      `#!/bin/sh\nexec /usr/bin/strace -f -ttt -e trace=process -o ${quote(trace)} ${quote(executable)} "$@"\n`,
    )
    await chmod(wrapper, 0o700)
    await save("roots.json", { root, temporary, home, workspace, profile, filesRoot, bindings })
    const observer = observeProcesses()
    let application, result, call, sessionID
    const permissions = []
    try {
      application = await _electron.launch({
        executablePath: wrapper,
        args: [],
        chromiumSandbox: true,
        cwd: workspace,
        timeout: 120000,
        env: {
          ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("LOGINOM_AI_AGENT_"))),
          APPIMAGE_EXTRACT_AND_RUN: "1",
          HOME: home,
          XDG_CONFIG_HOME: join(home, "config"),
          XDG_DATA_HOME: join(home, "data"),
          XDG_CACHE_HOME: join(home, "cache"),
          TMPDIR: temporary,
          TMP: temporary,
          TEMP: temporary,
          LOGINOM_AI_AGENT_TEST_ONBOARDING: "1",
          LOGINOM_AI_AGENT_TEST_ROOT: profile,
          ...(input.headless ? { LOGINOM_AI_AGENT_TEST_HEADLESS: "1" } : {}),
          LOGINOM_AI_AGENT_PURE: "1",
          LOGINOM_AI_AGENT_DISABLE_MODELS_FETCH: "1",
          ...(input.modelsPath ? { LOGINOM_AI_AGENT_MODELS_PATH: input.modelsPath } : {}),
          LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG: "1",
          LOGINOM_AI_AGENT_CONFIG_CONTENT: JSON.stringify({ model: input.model, enabled_providers: [providerID] }),
        },
      })
      const page = await application.firstWindow()
      const form = page.locator('[data-component="settings-loginom"]')
      await form.waitFor({ timeout: 120000 })
      if (testcase.connection !== "unconfigured" && testcase.id !== "default-translation") {
        const saved = await page.evaluate(
          async (connection) => {
            const current = await window.api.loginom.read()
            const validation = await window.api.loginom.check({
              revision: current.revision,
              url: connection.url,
              username: connection.username,
              apiKey: { operation: "replace", value: connection.apiKey },
              password: connection.password
                ? { operation: "replace", value: connection.password }
                : { operation: "empty" },
            })
            await window.api.loginom.save({ revision: current.revision, validationId: validation.validationId })
            const deadline = Date.now() + 120000
            while (Date.now() < deadline) {
              const view = await window.api.loginom.status()
              if (view.state === "ready") return view
              if (view.failure) throw Error(view.failure)
              await new Promise((resolve) => setTimeout(resolve, 200))
            }
            throw Error("HELP_READY_TIMEOUT")
          },
          {
            apiKey: input.apiKey,
            ...(scenario ? input.connection : { url: "http://127.0.0.1:9/", username: "user", password: "" }),
          },
        )
        assert.equal(saved.state, "ready")
        assert.equal(saved.hasPassword, scenario ? Boolean(input.connection.password) : false)
        assert.equal(saved.browser.state, scenario ? "verified" : "failed")
        await save("connection-status.json", saved)
      } else assert.equal((await page.evaluate(() => window.api.loginom.read())).state, "unconfigured")
      await form.locator('[data-component="icon-button"][data-icon="close"]').click()
      await form.waitFor({ state: "hidden", timeout: 30000 })
      const backend = await page.evaluate(() => window.api.awaitInitialization())
      call = async (path, method = "GET", body) => {
        const response = await fetch(`${backend.url}${path}?directory=${encodeURIComponent(workspace)}`, {
          method,
          headers: {
            "content-type": "application/json",
            authorization: `Basic ${Buffer.from(`${backend.username}:${backend.password}`).toString("base64")}`,
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(20000),
        })
        if (!response.ok) throw Error(`HTTP_${response.status}_${method}_${path}`)
        const text = await response.text()
        return text ? JSON.parse(text) : undefined
      }
      await call("/auth/" + providerID, "PUT", input.auth)
      sessionID = (await call("/session", "POST", { title: testcase.id + " " + attempt })).id
      if (testcase.input === "external-text-path") {
        // The permission must be visible in the same session before approving it in the GUI.
        const route = "/" + Buffer.from(workspace).toString("base64url") + "/session/" + sessionID
        await page.evaluate(async (route) => {
          const id = await window.api.getWindowID()
          localStorage.setItem(`loginom-ai-agent.desktop.window.${id}.last-active-url`, route)
        }, route)
        const agentsReady = page.waitForResponse(
          (response) => {
            const url = new URL(response.url())
            return response.request().method() === "GET" && ["/agent", "/api/agent"].includes(url.pathname)
          },
          { timeout: 60000 },
        )
        const [agentResponse] = await Promise.all([agentsReady, page.reload()])
        assert.ok(agentResponse.ok(), "GUI_AGENT_CATALOG_FAILED")
        await agentResponse.finished()
        if (await form.isVisible()) {
          await form.locator('[data-component="icon-button"][data-icon="close"]').click()
          await form.waitFor({ state: "hidden", timeout: 30000 })
        }
        await page.locator('[data-component="prompt-input"][contenteditable="true"]').waitFor({ timeout: 60000 })
        await save("permission-view.json", { route, sessionID })
      }
      let built
      for (const [turnIndex, turn] of turns.entries()) {
        const scenario = turn.scenario
        const prompt = bindPrompt(turn.prompt)
        const priorMessages = new Set((await call(`/session/${sessionID}/message`)).map((message) => message.info.id))
        const priorFiles = new Set(await readdir(workspace))
        const originalPath = scenario ? csv : turn.input === "workspace-path" ? local : external
        const originalSha = await readFile(originalPath).then(sha, () => undefined)
        const files =
          turn.input === "lgp-attachment"
            ? [external]
            : turn.input === "lgp-and-png-attachments"
              ? [external, png]
              : turn.input === "csv-attachment"
                ? [csv]
                : []
        const csvUrl =
          turn.input === "csv-attachment"
            ? `data:text/plain;base64,${(await readFile(csv)).toString("base64")}`
            : undefined
        const parts = [
          { type: "text", text: prompt },
          ...files.map((path) => ({
            type: "file",
            filename: path.endsWith(".csv") ? path : basename(path),
            mime: path.endsWith(".png")
              ? "image/png"
              : path.endsWith(".csv")
                ? "text/plain"
                : "application/x-loginom-package",
            // Native Desktop uploads preserve original bytes; file: denotes a path reference.
            url: path.endsWith(".csv") ? csvUrl : pathToFileURL(path).href,
          })),
        ]
        const timeoutMs = scenario ? 1200000 : 480000
        const started = Date.now()
        await save("submission.json", { sessionID, model: input.model, variant: input.variant, prompt, parts, started })
        // Keep HTTP requests short and retain each projected snapshot while tools await permission.
        await call(`/session/${sessionID}/prompt_async`, "POST", {
          agent: "build",
          model: { providerID, modelID },
          ...(input.variant !== "default" ? { variant: input.variant } : {}),
          parts,
        })
        let messages, answer, idleCompletedID
        while (Date.now() - started < timeoutMs) {
          const [current, status, pending] = await Promise.all([
            call(`/session/${sessionID}/message`),
            call("/session/status"),
            call("/permission"),
          ])
          messages = current
          await save("messages.json", messages)
          await save("session-status.json", status[sessionID] ?? { type: "idle" })
          for (const request of pending.filter((request) => request.sessionID === sessionID)) {
            const approve =
              testcase.input === "external-text-path" &&
              request.metadata?.filepath === external &&
              request.patterns.length === 1 &&
              ((request.permission === "external_directory" && request.patterns[0] === join(filesRoot, "*")) ||
                (request.permission === "read" && request.patterns[0] === relative(workspace, external)))
            const decision = {
              request,
              reply: approve ? "once" : "reject",
              via: approve ? "GUI" : "HTTP",
              acknowledged: false,
            }
            permissions.push(decision)
            await save("permissions.json", permissions)
            if (approve) {
              const dock = page.locator('[data-component="dock-prompt"][data-kind="permission"]')
              await dock.waitFor({ timeout: 30000 })
              await page.screenshot({ path: join(evidence, `permission-${permissions.length}.png`) })
              await dock.getByRole("button", { name: /^(Allow once|Разрешить один раз)$/ }).click()
            } else await call(`/permission/${request.id}/reply`, "POST", { reply: "reject" })
            decision.acknowledged = true
            await save("permissions.json", permissions)
          }
          const latest = messages.filter((message) => message.info.role === "assistant").at(-1)
          const idleCompleted =
            (!status[sessionID] || status[sessionID].type === "idle") &&
            latest &&
            !priorMessages.has(latest.info.id) &&
            (latest.info.error || latest.info.time.completed) &&
            !messages
              .flatMap((message) => message.parts)
              .some((part) => part.type === "tool" && ["pending", "running"].includes(part.state.status))
          if (idleCompleted && idleCompletedID === latest.info.id) {
            answer = latest
            break
          }
          idleCompletedID = idleCompleted ? latest.info.id : undefined
          await setTimeout(1000)
        }
        assert.ok(answer, "MODEL_COMPLETION_TIMEOUT")
        const tools = messages
          .filter((message) => !priorMessages.has(message.info.id))
          .flatMap((message) => message.parts)
          .filter((part) => part.type === "tool")
        const reports = (await readdir(workspace)).filter(
          (file) => !priorFiles.has(file) && /lgp_report(?:-\d+)?\.(pdf|docx|md)$/.test(file),
        )
        const execs = (await readFile(trace, "utf8"))
          .split("\n")
          .filter(
            (line) =>
              Number(line.trim().split(/\s+/)[1]) * 1000 >= started &&
              /execve\(/.test(line) &&
              /chromium-\d+\/|chrome-linux64\/chrome/.test(line),
          )
        result = {
          status: "MECHANICS_PASS_MANUAL_REVIEW_REQUIRED",
          case: testcase.id,
          attempt,
          interface: "native AppImage backend HTTP",
          model: input.model,
          variant: input.variant,
          headless: input.headless,
          sessionID,
          prompt,
          wallMs: Date.now() - started,
          timeoutMs,
          ...(scenario || transition ? { packagePath: bindings.server_package } : {}),
          ...(built ? { builtNodes: built.builtNodes } : {}),
          ...(built && !scenario ? { createdPackageSha256: originalSha } : {}),
          modelError: answer.info.error,
          tools: tools.map((part) => ({
            id: part.id,
            name: part.tool,
            status: part.state.status,
            input: part.state.input,
            metadata: part.state.metadata,
            error: part.state.error,
          })),
          text: answer.parts
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n"),
          reports,
          browserExecs: execs,
          permissions,
          inputShaBefore: originalSha,
          inputShaAfter: await readFile(originalPath).then(sha, () => undefined),
        }
        await save("result.json", result)
        assert.ok(!answer.info.error, "MODEL_ERROR")
        assert.ok(
          scenario ? (turnIndex === 0 || docsFirst ? execs.length > 0 : true) : execs.length === 0,
          "EXPECTED_BROWSER_EXEC_SCOPE",
        )
        if (scenario) {
          const csvSha256 = sha(await readFile(input.fixtures.csv))
          assert.equal(originalSha, csvSha256)
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
              packagePath: bindings.server_package,
              sourceNode: built?.builtNodes.source,
            }),
          )
          await save("result.json", result)
        }
        assert.ok(result.text.trim(), "NO_FINAL_ANSWER_AFTER_TERMINAL_TURN")
        assert.equal(result.inputShaAfter, originalSha)
        if (!scenario)
          assert.ok(
            !tools.some((part) => part.tool.startsWith("loginom_dock_") && part.tool !== "loginom_dock_diagnostics"),
          )
        if (turn.expected.profile === "package-docs")
          assert.ok(
            tools.some(
              (part) =>
                part.tool === "skill" &&
                part.state.metadata?.activation?.profile === "package-docs" &&
                part.state.metadata.activation.digest ===
                  input.skills.find((skill) => skill.name === "package-docs").digest,
            ),
          )
        if (turn.expected.profile === "default") assert.ok(!tools.some((part) => part.state.metadata?.activation))
        const format = turn.input === "external-text-path" ? "pdf" : turn.expected.result
        if (["pdf", "docx", "md"].includes(format)) {
          if (testcase.input === "external-text-path") {
            assert.ok(
              permissions.some((row) => row.request.permission === "external_directory"),
              "NO_EXTERNAL_PERMISSION",
            )
            assert.ok(
              permissions.every((row) => row.reply === "once" && row.acknowledged),
              "UNEXPECTED_EXTERNAL_PERMISSION",
            )
          } else assert.equal(permissions.length, 0, "UNEXPECTED_PERMISSION_FOR_ADMITTED_ATTACHMENT")
          assert.equal(reports.length, 1)
          assert.ok(reports[0].endsWith("." + format))
          assert.ok(
            tools.some(
              (part) =>
                part.tool === "package_docs_run" &&
                part.state.input.operation === "emit" &&
                part.state.status === "completed",
            ),
          )
          assert.ok(tools.some((part) => part.tool === "loginom_read" && part.state.status === "completed"))
        } else assert.equal(reports.length, 0)
        if (testcase.id === "default-unconfigured-arithmetic") assert.equal(result.text.trim(), "102")
        if (testcase.id === "default-translation") assert.match(result.text, /documentation.{0,12}ready/i)
        if (transition) {
          await mkdir(join(evidence, "turn-" + (turnIndex + 1)), { mode: 0o700 })
          await save("turn-" + (turnIndex + 1) + "/result.json", result)
          await save("turn-" + (turnIndex + 1) + "/messages.json", messages)
          if (turnIndex === 0 && scenario) {
            built = result
            if (turns[1].input !== "lgp-attachment") continue
            // The path is owned by this output/case/attempt, never supplied by the model.
            await promisify(execFile)(
              "docker",
              ["cp", input.packageContainer + ":/workdir/UserStorage" + bindings.server_package, external],
              { timeout: 30000 },
            )
            await save("created-package.json", {
              packagePath: bindings.server_package,
              sha256: sha(await readFile(external)),
              sessionID,
            })
          }
        }
      }
    } catch (error) {
      failures.push(testcase.id + ":" + attempt)
      if (result) {
        result.status = "MECHANICS_FAIL"
        result.failure = error.message
        await save("result.json", result)
      }
      await save("failure.json", { message: error.message, resultAvailable: Boolean(result), sessionID })
      if (sessionID && call) await call(`/session/${sessionID}/abort`, "POST").catch(() => {})
    } finally {
      await cp(workspace, join(evidence, "workspace"), { recursive: true })
      if (application) await application.close()
      const processes = await observer.close()
      await save("processes.json", processes)
      assert.equal(processes.remaining.length, 0, "OWNED_PROCESS_SURVIVED")
      assert.ok(!processes.processes.some((row) => row.command.split(" ").includes("--no-sandbox")))
      await rm(root, { recursive: true, force: true })
      await rm(temporary, { recursive: true, force: true })
      await save("cleanup.json", { rootRemoved: true, temporaryRemoved: true, remaining: 0 })
    }
    console.log(
      JSON.stringify({
        case: testcase.id,
        attempt,
        failed: failures.includes(testcase.id + ":" + attempt),
        reports: result?.reports,
        browserExecs: result?.browserExecs.length,
        manualReviewRequired: true,
      }),
    )

    async function save(name, value) {
      const text = JSON.stringify(value, null, 2)
      assert.ok(!secrets.some((secret) => text.includes(secret)), "SECRET_IN_RESULT")
      await writeFile(join(evidence, name), text)
    }
  }
}
await writeFile(join(input.output, "summary.json"), JSON.stringify({ failures, manualReviewRequired: true }, null, 2))
if (failures.length) process.exitCode = 1
