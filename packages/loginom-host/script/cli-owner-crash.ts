import { mkdtemp, readFile, readdir, readlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { cliCredentials } from "../src/connection/cli-credentials"
import { networkFault } from "./network-fault"
import { oracleProvider } from "./oracle-provider"

// Manual native acceptance. Default: inspect an existing package.
// active-import: create a disposable unsaved draft using the attached fixture.
if (!(["linux", "win32", "darwin"] as NodeJS.Platform[]).includes(process.platform))
  throw Error("PLATFORM_NOT_SUPPORTED")
const executable = process.env.LOGINOM_AI_AGENT_TEST_CLI_EXECUTABLE
const configPath = process.env.LOGINOM_AI_AGENT_TEST_CONFIG
const savedPath = process.argv[2]
const signal = process.argv[3] ?? "SIGKILL"
const activeImport = process.argv[4] === "active-import"
const killHost = process.argv[5] === "host"
const killBrowser = process.argv[5] === "browser"
const killRuntime = process.argv[5] === "runtime"
const disconnectNetwork = process.argv[5] === "network"
if (process.argv[5] && !killHost && !killBrowser && !killRuntime && !disconnectNetwork)
  throw Error("CRASH_TARGET_INVALID")
if ((killHost || killBrowser || killRuntime) && signal !== "SIGKILL") throw Error("HOST_CRASH_REQUIRES_SIGKILL")
if (process.argv[4] && !activeImport) throw Error("CRASH_MODE_INVALID")
if (disconnectNetwork ? signal !== "disconnect" : signal !== "SIGKILL" && signal !== "SIGINT")
  throw Error("CRASH_SIGNAL_INVALID")
if (!executable || !configPath || !savedPath) throw Error("PRIVATE_TEST_INPUTS_REQUIRED")
const config = await Bun.file(configPath).json()
const credentialProfile = process.env.LOGINOM_AI_AGENT_TEST_CREDENTIAL_PROFILE
if (credentialProfile) {
  const record = await Bun.file(join(credentialProfile, "loginom/connection/connection.json")).json()
  const secret = await cliCredentials("win32").decode(record.secrets)
  config.api_key = secret.apiKey
  config.loginom_url = record.url
  config.workflow_profile = { passwordless_login: secret.password === "", loginom_user: record.username }
}
if (config.workflow_profile?.passwordless_login !== true) throw Error("TEST_PASSWORD_UNAVAILABLE")
const directory = await mkdtemp(join(tmpdir(), "loginom-cli-owner-crash-"))
console.log(`Private crash evidence: ${directory}`)
const profile = join(directory, "profile")
const network = disconnectNetwork
  ? await networkFault(config.loginom_url, process.env.LOGINOM_AI_AGENT_TEST_RELAY_HOST)
  : undefined
const env = {
  ...process.env,
  LOGINOM_AI_AGENT_CLI_PROFILE: profile,
  LOGINOM_AI_AGENT_PURE: "1",
  LOGINOM_AI_AGENT_STRICT_RECOVERY: "1",
}
const setup = Bun.spawn([executable, "loginom", "setup", "--stdin-json", "--format", "json"], {
  env,
  stdin: new Blob([
    JSON.stringify({
      apiKey: config.api_key,
      password: "",
      username: config.workflow_profile.loginom_user,
      url: network?.url ?? config.loginom_url,
    }),
  ]),
  stdout: "pipe",
  stderr: "pipe",
})
const setupOutput = new Response(setup.stdout).text()
const setupErrors = new Response(setup.stderr).text()
if ((await setup.exited) !== 0) {
  const diagnostic = (await setupOutput) + (await setupErrors)
  if (!diagnostic.includes(config.api_key)) await Bun.write(join(directory, "setup-error.txt"), diagnostic)
  await network?.close()
  throw Error("CRASH_SETUP_FAILED")
}
if (activeImport)
  await Bun.write(
    join(directory, "sales.csv"),
    await Bun.file(
      new URL("../../desktop/test/loginom/fixtures/standalone-cli/A/sales.csv", import.meta.url),
    ).arrayBuffer(),
  )
const provider = oracleProvider({ directory, apiKey: config.api_key })
await Bun.write(join(profile, "config/loginom-ai-agent.json"), JSON.stringify(provider.config))
const child = Bun.spawn(
  [
    executable,
    "run",
    "--headless",
    "--format",
    "json",
    "--dir",
    directory,
    "--model",
    "test/test-model",
    "--dangerously-skip-permissions",
    ...(activeImport ? ["--file", join(directory, "sales.csv")] : []),
    "--",
    activeImport
      ? "Import the attached test CSV into a new unsaved draft."
      : "Open the saved package for inspection; do not change or save it.",
  ],
  { env, stdin: "ignore", stdout: "pipe", stderr: "pipe" },
)
const stdout = new Response(child.stdout).text()
const stderr = new Response(child.stderr).text()
void child.exited.then(() => provider.exited())
const watchdog = { fired: false }
const timer = setTimeout(() => {
  watchdog.fired = true
  child.kill("SIGINT")
}, 120000)
try {
  const response = (await provider.request("call", {
    name: "dock_prepare",
    arguments: {
      intent: activeImport ? "new_draft" : "open_package",
      ...(activeImport ? {} : { package_path: savedPath }),
      operation_id: "crash-prepare",
    },
  })) as { result: { content: { text: string }[] } }
  const receipt = JSON.parse(response.result.content[0].text)
  if (!receipt.prepared || (!activeImport && receipt.workspace?.package_ref?.path !== savedPath))
    throw Error("CRASH_PREPARE_FAILED")
  if (activeImport) {
    const artifact = receipt.input_artifacts?.[0]
    if (!artifact || receipt.input_artifacts.length !== 1) throw Error("CRASH_ATTACHMENT_MISSING")
    let delivery = await call("dock_artifact_deliver", {
      operation_id: "crash-deliver",
      artifact_id: artifact.artifact_id,
      upload_grant_id: artifact.upload.grant_id,
      budget_ms: 90000,
    })
    for (let attempt = 1; delivery.status === "AMBIGUOUS" && attempt <= 3; attempt++) {
      if (!delivery.output?.inspection_required) break
      delivery = await call("dock_artifact_delivery_resume", {
        operation_id: "crash-deliver",
        resume_id: `crash-deliver-resume-${attempt}`,
        budget_ms: 120000,
      })
    }
    if (delivery.status !== "SUCCEEDED" || !delivery.output.upload_completion_verified)
      throw Error("CRASH_DELIVERY_FAILED")
    const applied = await call("dock_node_apply", {
      contract_revision: "1.0.0",
      document_id: receipt.workspace.document_id,
      workflow_ref: { workflow_id: receipt.workspace.workflow_ref.workflow_id },
      operation_id: "crash-import",
      target: { kind: "new", type: "imports.text", label: "Crash import", position: { x: 240, y: 160 } },
      inputs: [],
      mappings: [],
      finish: "execute",
      mode: "delimited",
      read: { ports: [0], sample_rows: 10, require_exact_numbers: true, coverage: "sample" },
      budgets: { configure_ms: 120000, execute_ms: 60000, total_ms: 180000 },
      parameters: {
        source: { artifact_id: artifact.artifact_id, upload_operation_id: delivery.output.upload_operation_id },
        settings: {
          source: {
            source_path: artifact.upload.destination,
            encoding: "UTF-8",
            rows_to_skip: 0,
            first_line_as_title: true,
          },
          format: { delimiter: ";", decimal_separator: ".", null_marker: "", text_qualifier: '"' },
          columns: [
            { name: "Category", label: "Category", type: "string", data_kind: "Дискретный", used: true },
            { name: "amount", label: "amount", type: "integer", data_kind: "Непрерывный", used: true },
          ],
        },
      },
    })
    if (applied.state !== "running") throw Error("CRASH_OPERATION_NOT_ACTIVE")
    await Bun.write(join(directory, "active-operation.json"), JSON.stringify(applied))
    if (!(await readdir(join(profile, "loginom/recovery"))).some((name) => name.endsWith(".json")))
      throw Error("CRASH_RECOVERY_NOT_DURABLE")
  }
  const rows = await processes()
  const ids = new Set([child.pid])
  for (let depth = 0; depth < 20; depth++) rows.filter((row) => ids.has(row.parent)).forEach((row) => ids.add(row.pid))
  if (ids.size < 5) throw Error("CRASH_BROWSER_TREE_MISSING")
  const identities = new Map(rows.filter((row) => ids.has(row.pid)).map((row) => [row.pid, row.started]))
  async function killTracked(pid: number) {
    const current = (await processes()).find((row) => row.pid === pid)
    if (!current || current.started !== identities.get(pid)) throw Error("CRASH_PROCESS_IDENTITY_CHANGED")
    process.kill(pid, "SIGKILL")
  }
  if (killHost) {
    const hosts = await Promise.all(
      rows
        .filter((row) => row.parent === child.pid)
        .map(async (row) => ({
          pid: row.pid,
          command: await processCommand(row.pid),
        })),
    )
    const host = hosts.filter((row) => hasArgument(row.command, "/host/node-host.mjs"))
    if (host.length !== 1) throw Error("CRASH_HOST_IDENTITY_INVALID")
    await killTracked(host[0].pid)
    // End the scripted model response so CLI reaches its final host/cleanup check.
    // This does not send another Loginom operation or authorize replay.
    provider.finish()
  }
  if (killBrowser || killRuntime) {
    const commands = await Promise.all(
      rows
        .filter((row) => ids.has(row.pid))
        .map(async (row) => ({
          pid: row.pid,
          executable: await processExecutable(row.pid),
          command: await processCommand(row.pid),
        })),
    )
    const browsers = commands.filter(
      (row) =>
        (row.executable.endsWith("/chrome") || row.executable.endsWith("/Google Chrome for Testing")) &&
        !/(?:\s|\0)--type=/.test(row.command) &&
        !row.command.includes("/chats/readiness/") &&
        row.command.includes(join(profile, "loginom/runtime/")),
    )
    await Bun.write(
      join(directory, "browser-identities.json"),
      JSON.stringify(
        commands.map((row) => ({
          pid: row.pid,
          executable: row.executable,
          selected: browsers.some((browser) => browser.pid === row.pid),
        })),
      ),
    )
    if (browsers.length !== 1) throw Error("CRASH_BROWSER_IDENTITY_INVALID")
    const runtime = rows.find((row) => row.pid === browsers[0].pid)?.parent
    if (killRuntime) {
      const command = runtime ? await processCommand(runtime) : ""
      if (!runtime || !ids.has(runtime) || !hasArgument(command, "/src/managed-entry.mjs"))
        throw Error("CRASH_RUNTIME_IDENTITY_INVALID")
      await killTracked(runtime)
    }
    if (killBrowser) await killTracked(browsers[0].pid)
    provider.finish()
  }
  if (!killHost && !killBrowser && !killRuntime && !disconnectNetwork)
    child.kill(signal === "SIGINT" ? "SIGINT" : "SIGKILL")
  if (network) {
    network.disconnect()
    if (network.state.severedSockets === 0) throw Error("NETWORK_FAULT_NO_ACTIVE_CONNECTION")
    provider.finish()
  }
  const code = await child.exited
  const deadline = Date.now() + 30000
  while (
    Date.now() < deadline &&
    (await processes()).some(
      (row) => ids.has(row.pid) && identities.get(row.pid) === row.started && !row.state.startsWith("Z"),
    )
  )
    await Bun.sleep(250)
  const alive = (await processes()).filter(
    (row) => ids.has(row.pid) && identities.get(row.pid) === row.started && !row.state.startsWith("Z"),
  )
  const output = await stdout
  const errors = await stderr
  if (output.includes(config.api_key) || errors.includes(config.api_key)) throw Error("SECRET_IN_CRASH_OUTPUT")
  await Bun.write(join(directory, "events.jsonl"), output)
  await Bun.write(join(directory, "stderr.txt"), errors)
  const guarded = (await readdir(profile)).includes(".writer")
  const retry = Bun.spawn([executable, "loginom", "status", "--format", "json"], {
    env,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
  })
  const retryOutput = new Response(retry.stdout).text()
  const retryErrors = new Response(retry.stderr).text()
  const retryCode = await retry.exited
  const retryText = (await retryOutput) + (await retryErrors)
  if (retryText.includes(config.api_key)) throw Error("SECRET_IN_CRASH_RETRY")
  const recoveryEntries = activeImport
    ? (await readdir(join(profile, "loginom/recovery"))).filter((name) => name.endsWith(".json"))
    : []
  const retryState = retryCode === 0 ? JSON.parse(await retryOutput).state : undefined
  const result = {
    platform: process.platform,
    arch: process.arch,
    executable,
    recoveryEntries,
    retryState,
    target: killHost
      ? "host"
      : killBrowser
        ? "browser"
        : killRuntime
          ? "runtime"
          : disconnectNetwork
            ? "network"
            : "cli",
    network: network?.state,
    deadlineExceeded: watchdog.fired,
    signal,
    activeImport,
    code,
    trackedProcesses: ids.size,
    alive,
    guarded,
    retryCode,
    busy: retryText.includes("PROFILE_BUSY"),
  }
  await Bun.write(join(directory, "summary.json"), JSON.stringify(result))
  if (
    watchdog.fired ||
    alive.length ||
    (killBrowser || disconnectNetwork
      ? (disconnectNetwork && process.platform === "win32" ? ![0, 4].includes(code) : code !== 4) ||
        guarded ||
        retryCode !== 0 ||
        result.busy ||
        retryState !== "recoverable-error"
      : signal === "SIGKILL"
        ? code !== (killHost || killRuntime ? 1 : 137) || !guarded || retryCode !== 3 || !result.busy
        : code !== (activeImport ? 4 : 130) || guarded || retryCode !== 0 || result.busy) ||
    (activeImport &&
      (!recoveryEntries.length ||
        (signal === "SIGINT" && (retryState !== "recoverable-error" || !errors.includes("LOGINOM_RECOVERY_REQUIRED")))))
  )
    throw Error("CRASH_ACCEPTANCE_FAILED")
  console.log(JSON.stringify({ status: "PASS", ...result }))
} finally {
  clearTimeout(timer)
  if (child.exitCode === null) child.kill("SIGINT")
  provider.stop()
  await network?.close()
}

async function processes() {
  if (process.platform === "win32") {
    const result = Bun.spawnSync([
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,ExecutablePath,CommandLine,CreationDate | ConvertTo-Json -Compress",
    ])
    if (result.exitCode !== 0) throw Error("WINDOWS_PROCESS_SNAPSHOT_FAILED")
    const parsed = JSON.parse(result.stdout.toString())
    return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
      pid: Number(row.ProcessId),
      parent: Number(row.ParentProcessId),
      state: "R",
      started: String(row.CreationDate ?? ""),
      executable: String(row.ExecutablePath ?? ""),
      command: String(row.CommandLine ?? ""),
    }))
  }
  if (process.platform === "darwin") {
    const child = Bun.spawn(["/bin/ps", "-axo", "pid=,ppid=,stat=,lstart="], { stdout: "pipe", stderr: "pipe" })
    const output = await new Response(child.stdout).text()
    if ((await child.exited) !== 0) throw Error("CRASH_PROCESS_SNAPSHOT_FAILED")
    return output.split("\n").flatMap((line) => {
      const row = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.+?)\s*$/)
      return row
        ? [{ pid: Number(row[1]), parent: Number(row[2]), state: row[3], started: row[4], executable: "", command: "" }]
        : []
    })
  }
  return Promise.all(
    (await readdir("/proc"))
      .filter((pid) => /^\d+$/.test(pid))
      .map(async (pid) => {
        const stat = await readFile(`/proc/${pid}/stat`, "utf8").catch(() => "")
        const rest = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
        return {
          pid: Number(pid),
          parent: Number(rest[1]),
          state: rest[0],
          started: rest[19],
          executable: await readlink(`/proc/${pid}/exe`).catch(() => ""),
          command: await readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => ""),
        }
      }),
  )
}

async function processCommand(pid: number) {
  if (process.platform === "win32") return (await processes()).find((row) => row.pid === pid)?.command ?? ""
  if (process.platform === "linux") return readFile(`/proc/${pid}/cmdline`, "utf8").catch(() => "")
  const child = Bun.spawn(["/bin/ps", "-ww", "-p", String(pid), "-o", "command="], { stdout: "pipe", stderr: "ignore" })
  const output = await new Response(child.stdout).text()
  return (await child.exited) === 0 ? output.trim() : ""
}

async function processExecutable(pid: number) {
  if (process.platform === "linux") return readlink(`/proc/${pid}/exe`).catch(() => "")
  const child = Bun.spawn(["/bin/ps", "-ww", "-p", String(pid), "-o", "comm="], { stdout: "pipe", stderr: "ignore" })
  const output = await new Response(child.stdout).text()
  return (await child.exited) === 0 ? output.trim() : ""
}

function hasArgument(command: string, suffix: string) {
  if (process.platform === "linux") return command.split("\0").some((arg) => arg.endsWith(suffix))
  const position = command.indexOf(suffix)
  return (
    position !== -1 && (position + suffix.length === command.length || /\s/.test(command[position + suffix.length]))
  )
}

async function call(name: string, args: Record<string, unknown>) {
  const response = (await provider.request("call", { name, arguments: args })) as {
    result: { content: { text: string }[] }
  }
  const body = JSON.parse(response.result.content[0].text)
  if (JSON.stringify(body).includes(config.api_key)) throw Error("SECRET_IN_CRASH_RECEIPT")
  await Bun.write(join(directory, name + ".json"), JSON.stringify(body))
  return body
}
