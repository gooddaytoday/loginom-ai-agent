import { expect, test } from "bun:test"
import path from "node:path"
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile, rm } from "node:fs/promises"
import os from "node:os"
import { spawn } from "node:child_process"
import { loadConfig, repoRoot } from "../src/config"
import { agentCommand } from "../src/cli"
import { agentConfigJson, archiveProfileHistory, assertProfileClean, assertAuth, ensureProfile, management, pruneRuntimeAttempts, recoverIfNeeded, releaseStaleWriter, resetProfile, waitProfileIdle } from "../src/profile"
import { EvalFailure } from "../src/fail"
import { writerIdentity } from "../src/process-supervisor"
import { Database } from "bun:sqlite"

test("archiveProfileHistory: история каждой попытки сохраняется вне mounts, OAuth и cli-profile остаются writable", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-profile-history-"))
  const profile = path.join(dir, "profile")
  try {
    await mkdir(path.join(profile, "data"), { recursive: true })
    await Bun.write(path.join(profile, "cli-profile.json"), "marker")
    await Bun.write(path.join(profile, "data/auth.json"), '{"openai":{"refresh":"updated-token"}}')
    for (const session of ["first", "retry"]) {
      const db = new Database(path.join(profile, "data/loginom-ai-agent.db"), { create: true })
      db.exec("CREATE TABLE session (id TEXT, model TEXT)")
      db.query("INSERT INTO session VALUES (?, ?)").run(session, "openai/model")
      db.close()
      await Bun.write(path.join(profile, "loginom/inputs/dataset.csv"), `answer-${session}`)
      await Bun.write(path.join(profile, "data/tool-output/result.txt"), "answer")
      await expect(assertProfileClean(profile)).rejects.toThrow("история")
      const archive = await archiveProfileHistory(profile, `run-task-1-${session}`)
      expect(path.dirname(archive)).not.toBe(profile)
      expect((await stat(archive)).mode & 0o077).toBe(0)
      const evidence = new Database(path.join(archive, "data/loginom-ai-agent.db"), { readonly: true })
      expect(evidence.query("SELECT id, model FROM session").get()).toEqual({ id: session, model: "openai/model" })
      evidence.close()
      expect(await Bun.file(path.join(archive, "loginom/inputs/dataset.csv")).text()).toBe(`answer-${session}`)
      await assertProfileClean(profile)
      expect(await Bun.file(path.join(profile, "data/loginom-ai-agent.db")).exists()).toBe(false)
    }
    expect(await Bun.file(path.join(profile, "cli-profile.json")).text()).toBe("marker")
    expect(await Bun.file(path.join(profile, "data/auth.json")).text()).toContain("updated-token")
    await Bun.write(path.join(profile, "data/auth.json"), '{"openai":{"refresh":"next-token"}}')
    await assertProfileClean(profile)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test.each(["loginom/recovery/operation.json", "loginom/connection/pending.json", ".writer/owner"])(
  "archiveProfileHistory: незавершённое состояние %s запрещает перенос БД", async (pending) => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "evals-profile-history-pending-"))
    const profile = path.join(dir, "profile")
    try {
      await Bun.write(path.join(profile, "data/loginom-ai-agent.db"), "unmoved")
      await Bun.write(path.join(profile, pending), "pending")
      await expect(archiveProfileHistory(profile, "blocked")).rejects.toThrow("незавершён")
      expect(await Bun.file(path.join(profile, "data/loginom-ai-agent.db")).text()).toBe("unmoved")
    } finally { await rm(dir, { recursive: true, force: true }) }
  },
)

const stateFile = async (view: object) => {
  const file = path.join(await mkdtemp(path.join(os.tmpdir(), "evals-state-")), "view.json")
  await writeFile(file, JSON.stringify(view))
  return file
}

const fakeProfile = async (env: Record<string, string> = {}) => {
  const profileDir = await mkdtemp(path.join(os.tmpdir(), "evals-profile-"))
  const config = { ...loadConfig(["--dry-run"], {}), profileDir, dock: { apiKey: "eval-dock-key", baseUrl: "https://x" } }
  const command = agentCommand(config)
  return { config, command: { ...command, env: { ...command.env, ...env } }, profileDir }
}

test("management: закрывает собственный detached host и сохраняет ready", async () => {
  const context = await fakeProfile()
  const pidFile = path.join(context.profileDir, "management-child.pid")
  try {
    const result = await management({ ...context.command, env: { ...context.command.env,
      EVAL_FAKE_ORPHAN_PID_FILE: pidFile, EVAL_FAKE_DETACHED_CHILD: "1", EVAL_FAKE_EXIT_DELAY_MS: "600" } },
      ["loginom", "status", "--format", "json"])
    const pid = Number(await Bun.file(pidFile).text())
    const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
    expect(result.exitCode).toBe(0)
    expect(JSON.parse(result.stdout).state).toBe("ready")
    expect(state === "" || state.startsWith("Z")).toBe(true)
    expect(result.processCleanup.status).toBe("confirmed")
  } finally {
    if (await Bun.file(pidFile).exists()) {
      try { process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL") } catch {}
    }
  }
}, 15_000)

test("releaseStaleWriter: живой host в зарегистрированной группе сохраняет guard", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-group-"))
  await mkdir(path.join(profile, ".writer"))
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true, stdio: "ignore", env: { PATH: process.env.PATH ?? "" },
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  await Bun.write(`${profile}.process-group`, String(child.pid))
  try {
    await expect(releaseStaleWriter(profile)).rejects.toThrow("занят")
    expect(await stat(path.join(profile, ".writer"))).toBeDefined()
  } finally {
    if (child.pid) process.kill(-child.pid, "SIGKILL")
    await exited
  }
})

test("management: сохраняет отдельное процессное доказательство без private stdin", async () => {
  const context = await fakeProfile()
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-management-evidence-"))
  const command = { ...context.command, cleanupDir: out }
  const result = await management(command, ["loginom", "setup", "--stdin-json", "--format", "json"], '{"password":"private-password"}')
  const { readdir } = await import("node:fs/promises")
  const directories = await readdir(out)
  expect(directories).toHaveLength(1)
  const evidence = await Bun.file(path.join(out, directories[0]!, "cleanup.json")).text()
  expect(JSON.parse(evidence).processes.status).toBe("confirmed")
  expect(evidence).not.toContain("private-password")
  expect(evidence).not.toContain("stdin")
  expect(result.exitCode).toBe(0)
})

for (const key of ["LOGINOM_AI_AGENT_CLI_PROFILE", "LOGINOM_AI_AGENT_CLI_ROOT"]) {
  test(`releaseStaleWriter: живой env-only owner ${key} без регистрации сохраняет guard`, async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), "evals-env-owner-"))
    const alias = `${profile}-alias`
    await symlink(profile, alias)
    await mkdir(path.join(profile, ".writer"))
    const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
      detached: true, stdio: "ignore", cwd: os.tmpdir(),
      env: { PATH: process.env.PATH ?? "", [key]: alias },
    })
    const exited = new Promise((resolve) => child.once("exit", resolve))
    try {
      await expect(releaseStaleWriter(profile)).rejects.toThrow("занят")
      expect(await stat(path.join(profile, ".writer"))).toBeDefined()
      expect(child.exitCode).toBeNull()
    } finally {
      if (child.pid) process.kill(-child.pid, "SIGKILL")
      await exited
    }
  })
}

test("releaseStaleWriter: orphan node-host без профиля сохраняет guard до выяснения владельца", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-orphan-"))
  const fixture = path.join(await mkdtemp(path.join(os.tmpdir(), "evals-host-")), "node-host.mjs")
  await Bun.write(fixture, "setInterval(() => {}, 1000)")
  await mkdir(path.join(profile, ".writer"))
  const parent = Bun.spawn([process.execPath, "-e", `
    const { spawn } = require("node:child_process")
    const child = spawn(process.execPath, [${JSON.stringify(fixture)}], {
      detached: true, stdio: "ignore", env: { PATH: process.env.PATH }, cwd: ${JSON.stringify(os.tmpdir())},
    })
    console.log(child.pid)
    child.unref()
  `], { stdout: "pipe", stderr: "ignore", env: { PATH: process.env.PATH ?? "" } })
  const pid = Number((await new Response(parent.stdout).text()).trim())
  expect(await parent.exited).toBe(0)
  expect(Number.isInteger(pid) && pid > 0).toBe(true)
  try {
    await expect(releaseStaleWriter(profile)).rejects.toThrow("занят")
    expect(await stat(path.join(profile, ".writer"))).toBeDefined()
    expect(() => process.kill(pid, 0)).not.toThrow()
  } finally {
    process.kill(-pid, "SIGKILL")
  }
})

test("releaseStaleWriter: runtime с cwd внутри профиля сохраняет guard без env", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-cwd-owner-"))
  await mkdir(path.join(profile, ".writer"))
  await mkdir(path.join(profile, "loginom", "runtime"), { recursive: true })
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true, stdio: "ignore", cwd: path.join(profile, "loginom", "runtime"), env: { PATH: process.env.PATH ?? "" },
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    await expect(releaseStaleWriter(profile)).rejects.toThrow("занят")
    expect(await stat(path.join(profile, ".writer"))).toBeDefined()
    expect(child.exitCode).toBeNull()
  } finally {
    if (child.pid) process.kill(-child.pid, "SIGKILL")
    await exited
  }
})

for (const kind of ["CLI", "Desktop"]) {
  test(`releaseStaleWriter: живой host другого профиля с parent ${kind} не мешает cleanup`, async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), "evals-other-host-"))
    const other = `${profile}-other`
    const fixture = path.join(await mkdtemp(path.join(os.tmpdir(), "evals-host-")), "node-host.mjs")
    await mkdir(other)
    await Bun.write(fixture, "setInterval(() => {}, 1000)")
    await mkdir(path.join(profile, ".writer"))
    const parent = spawn(process.execPath, ["-e", `
      const { spawn } = require("node:child_process")
      const child = spawn(process.execPath, [${JSON.stringify(fixture)}], {
        stdio: "ignore", env: { PATH: process.env.PATH }, cwd: ${JSON.stringify(os.tmpdir())},
      })
      console.log(child.pid)
      setInterval(() => {}, 1000)
    `], {
      detached: true, stdio: ["ignore", "pipe", "ignore"], cwd: os.tmpdir(),
      argv0: kind === "Desktop" ? "loginom-ai-agent" : "bun",
      env: { PATH: process.env.PATH ?? "", ...(kind === "CLI" ? { LOGINOM_AI_AGENT_CLI_ROOT: other } : {}) },
    })
    const exited = new Promise((resolve) => parent.once("exit", resolve))
    const host = Number(await new Promise<string>((resolve) => parent.stdout!.once("data", (value) => resolve(String(value)))))
    try {
      expect(await releaseStaleWriter(profile)).toBe(true)
      expect(await stat(path.join(profile, ".writer")).catch(() => undefined)).toBeUndefined()
      expect(parent.exitCode).toBeNull()
      expect(() => process.kill(host, 0)).not.toThrow()
    } finally {
      if (parent.pid) process.kill(-parent.pid, "SIGKILL")
      await exited
    }
  })
}

test("waitProfileIdle: незарегистрированный owner с профилем в argv остаётся жив", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-wait-owner-"))
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", profile], {
    detached: true, stdio: "ignore", env: { PATH: process.env.PATH ?? "" }, cwd: os.tmpdir(),
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    expect(await waitProfileIdle(profile, 100)).toBe(false)
    expect(child.exitCode).toBeNull()
    expect(() => process.kill(child.pid!, 0)).not.toThrow()
  } finally {
    child.kill("SIGKILL")
    await exited
  }
})

for (const known of [false, true]) {
  test(`releaseStaleWriter: EACCES env/cwd ${known ? "известного CLI сохраняет guard" : "постороннего процесса не мешает cleanup"}`, async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), "evals-private-process-"))
    await mkdir(path.join(profile, ".writer"))
    const child = spawn(process.execPath, ["-e", `
      const { dlopen } = await import("bun:ffi")
      const library = dlopen("libc.so.6", { prctl: { args: ["i32", "u64", "u64", "u64", "u64"], returns: "i32" } })
      if (library.symbols.prctl(4, 0, 0, 0, 0) !== 0) throw new Error("prctl failed")
      console.log("ready")
      setInterval(() => {}, 1000)
    `], {
      detached: true, stdio: ["ignore", "pipe", "ignore"], cwd: os.tmpdir(),
      argv0: known ? "loginom-ai-agent-cli" : "bun", env: { PATH: process.env.PATH ?? "" },
    })
    const exited = new Promise((resolve) => child.once("exit", resolve))
    try {
      await new Promise((resolve, reject) => { child.stdout!.once("data", resolve); child.once("error", reject) })
      const denied = await readFile(`/proc/${child.pid}/environ`).then(() => undefined, (error: NodeJS.ErrnoException) => error.code)
      expect(denied).toBe("EACCES")
      if (known) {
        await expect(releaseStaleWriter(profile)).rejects.toThrow("PID")
        expect(await stat(path.join(profile, ".writer"))).toBeDefined()
      } else {
        expect(await releaseStaleWriter(profile)).toBe(true)
        expect(await stat(path.join(profile, ".writer")).catch(() => undefined)).toBeUndefined()
      }
      expect(child.exitCode).toBeNull()
    } finally {
      child.kill("SIGKILL")
      await exited
    }
  })
}

test("releaseStaleWriter: снимает .writer без процессов, без .writer возвращает false", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-"))
  expect(await releaseStaleWriter(profile)).toBe(false)
  await mkdir(path.join(profile, ".writer"))
  await writeFile(path.join(profile, ".writer", "nonce"), "x")
  expect(await releaseStaleWriter(profile)).toBe(true)
  expect(await stat(path.join(profile, ".writer")).catch(() => undefined)).toBeUndefined()
})

test("releaseStaleWriter: receipt не разрешает удалять заменённый owner", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-receipt-"))
  await mkdir(path.join(profile, ".writer"))
  await Bun.write(path.join(profile, ".writer", "owner"), "observed")
  const receipt = await writerIdentity(profile)
  await Bun.write(path.join(profile, ".writer", "owner"), "foreign")
  await expect(releaseStaleWriter(profile, receipt)).rejects.toThrow("identity changed")
  expect(await Bun.file(path.join(profile, ".writer", "owner")).text()).toBe("foreign")
})

test("releaseStaleWriter: symlink профиля сохраняет guard живой canonical группы", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evals-writer-alias-"))
  const profile = path.join(directory, "profile")
  const alias = path.join(directory, "alias")
  await Bun.write(path.join(profile, ".writer/owner"), "observed")
  await symlink(profile, alias)
  const child = spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], {
    detached: true, stdio: "ignore", env: { PATH: process.env.PATH ?? "" }, cwd: os.tmpdir(),
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  await Bun.write(`${profile}.process-group`, String(child.pid))
  try {
    await expect(releaseStaleWriter(alias, await writerIdentity(profile))).rejects.toThrow("занят процессами")
    expect(await Bun.file(path.join(profile, ".writer/owner")).text()).toBe("observed")
    expect(await Bun.file(`${profile}.process-group`).text()).toBe(String(child.pid))
    process.kill(child.pid!, 0)
  } finally { child.kill("SIGKILL"); await exited }
})

test("releaseStaleWriter: путь с regex-метасимволами снимает .writer", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-a+b(c)-"))
  await mkdir(path.join(profile, ".writer"))
  await writeFile(path.join(profile, ".writer", "nonce"), "x")
  expect(await releaseStaleWriter(profile)).toBe(true)
  expect(await stat(path.join(profile, ".writer")).catch(() => undefined)).toBeUndefined()
})

test("agentConfigJson: разрешает loginom_* и описывает OpenAI-compatible провайдер", () => {
  const base = loadConfig(["--dry-run"], {})
  expect(agentConfigJson(base)).toEqual({ permission: { "loginom_*": "allow" } })
  const withProvider = { ...base, agent: { ...base.agent, provider: { id: "xiaomi", baseUrl: "https://api", apiKey: "k", modelId: "mimo" } } }
  const json = agentConfigJson(withProvider) as { provider: Record<string, { options: { apiKey: string; baseURL: string }; models: Record<string, unknown> }> }
  expect(json.provider.xiaomi?.options).toEqual({ apiKey: "k", baseURL: "https://api" })
  expect(Object.keys(json.provider.xiaomi?.models ?? {})).toEqual(["mimo"])
})

test("ensureProfile: unconfigured при существующем cli-profile.json запускает setup", async () => {
  const file = await stateFile({ state: "unconfigured", hasApiKey: false })
  const { config, command, profileDir } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  await Bun.write(path.join(profileDir, "cli-profile.json"), JSON.stringify({ leftover: true }))
  const before = await Bun.file(path.join(profileDir, "cli-profile.json")).text()
  expect((await ensureProfile(config, command)).fresh).toBe(true)
  expect(await Bun.file(path.join(profileDir, "setup-called")).exists()).toBe(true)
  expect(await Bun.file(path.join(profileDir, "cli-profile.json")).text()).not.toBe(before)
  expect((await Bun.file(file).json()).state).toBe("ready")
  const written = await Bun.file(path.join(profileDir, "config", "loginom-ai-agent.json")).json()
  expect(written.permission).toEqual({ "loginom_*": "allow" })
})

test("ensureProfile: ready с hasApiKey не вызывает setup и пишет config", async () => {
  const { config, command, profileDir } = await fakeProfile({
    EVAL_FAKE_STATE_FILE: await stateFile({ state: "ready", hasApiKey: true }),
  })
  expect((await ensureProfile(config, command)).fresh).toBe(false)
  expect(await Bun.file(path.join(profileDir, "setup-called")).exists()).toBe(false)
  expect(await Bun.file(path.join(profileDir, "config", "loginom-ai-agent.json")).exists()).toBe(true)
})

test("ensureProfile: source без cache/models.json засевает каталог из product snapshot", async () => {
  const { config, command, profileDir } = await fakeProfile({
    EVAL_FAKE_STATE_FILE: await stateFile({ state: "ready", hasApiKey: true }),
  })
  const source = { ...config, agent: { ...config.agent, cliMode: "source" as const } }
  await ensureProfile(source, command)
  const seeded = await Bun.file(path.join(profileDir, "cache", "models.json")).json()
  const product = await Bun.file(path.join(repoRoot, "packages", "product", "models.json")).json()
  expect(seeded).toEqual(product)
  expect("xiaomi-token-plan-sgp" in seeded).toBe(true)
})

test("ensureProfile: fake не засевает cache/models.json", async () => {
  const { config, command, profileDir } = await fakeProfile({
    EVAL_FAKE_STATE_FILE: await stateFile({ state: "ready", hasApiKey: true }),
  })
  await ensureProfile(config, command)
  expect(await Bun.file(path.join(profileDir, "cache", "models.json")).exists()).toBe(false)
})

test("recoverIfNeeded: unconfigured — EvalFailure с подсказкой reset-profile", async () => {
  const { command } = await fakeProfile({
    EVAL_FAKE_STATE_FILE: await stateFile({ state: "unconfigured", hasApiKey: false }),
  })
  await expect(recoverIfNeeded(command, 1)).rejects.toThrow("--reset-profile")
  await expect(recoverIfNeeded(command, 1)).rejects.toThrow("LOGINOM_DOCK_API_KEY")
})

test("assertAuth: без auth.json — EvalFailure с командой providers login; с записью провайдера — ок", async () => {
  const { config, command, profileDir } = await fakeProfile()
  const openai = { ...config, agent: { ...config.agent, model: "openai/gpt-5.6-sol" } }
  await expect(assertAuth(openai, command)).rejects.toThrow("providers login")
  await mkdir(path.join(profileDir, "data"), { recursive: true })
  await writeFile(path.join(profileDir, "data", "auth.json"), JSON.stringify({ openai: { type: "oauth" } }))
  await assertAuth(openai, command)
  const viaProvider = { ...config, agent: { ...config.agent, model: "xiaomi/mimo", provider: { id: "xiaomi", baseUrl: "u", apiKey: "k", modelId: "mimo" } } }
  await assertAuth(viaProvider, command)
})

test("recoverIfNeeded: непустые recoveries → acknowledge → ready", async () => {
  const file = await stateFile({ state: "ready", recoveries: ["op-1"] })
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  const result = await recoverIfNeeded(command, 1)
  expect(result.recovered).toBe(true)
  expect(result.view.state).toBe("ready")
  expect((await Bun.file(file).json()).recoveries).toEqual([])
})

test("recoverIfNeeded: ready без recoveries — ничего не делает", async () => {
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: await stateFile({ state: "ready" }) })
  expect((await recoverIfNeeded(command, 1)).recovered).toBe(false)
})

test("recoverIfNeeded: recoverable-error — EvalFailure с состоянием", async () => {
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: await stateFile({ state: "recoverable-error", failure: "LOGIN_FAILED" }) })
  await expect(recoverIfNeeded(command, 1)).rejects.toThrow("state=recoverable-error")
})

test("recoverIfNeeded: starting ожидается до ready", async () => {
  const file = await stateFile({ state: "starting" })
  const { command } = await fakeProfile({ EVAL_FAKE_STATE_FILE: file })
  setTimeout(() => void writeFile(file, JSON.stringify({ state: "ready" })), 1_500)
  expect((await recoverIfNeeded(command, 1)).view.state).toBe("ready")
}, 15_000)

test("resetProfile: удаляет каталог профиля", async () => {
  const { config, profileDir } = await fakeProfile()
  await resetProfile(config)
  expect(await stat(profileDir).catch(() => undefined)).toBeUndefined()
})

test("pruneRuntimeAttempts: адресный pruning оставляет историю для отдельного закрытого архива", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-prune-"))
  const chat = path.join(profile, "loginom", "runtime", "generations", "1", "chats", "chat")
  const readiness = path.join(profile, "loginom", "runtime", "generations", "1", "chats", "readiness")
  const retained = [
    path.join(profile, "data", "auth.json"),
    path.join(profile, "data", "loginom-ai-agent.db"),
    path.join(profile, "loginom", "connection", "connection.json"),
    path.join(profile, "loginom", "inputs", "input.json"),
    path.join(profile, "loginom", "recovery", "README"),
    path.join(chat, "marker"),
  ]
  for (const directory of [chat, readiness]) {
    await mkdir(path.join(directory, "attempts", "attempt", "browser-profile"), { recursive: true })
    await Bun.write(path.join(directory, "attempts", "attempt", "browser-profile", "cache"), "diagnostic")
  }
  for (const file of retained) {
    await mkdir(path.dirname(file), { recursive: true })
    await Bun.write(file, "retain")
  }
  expect(await pruneRuntimeAttempts(profile)).toBe(2)
  expect(await stat(path.join(chat, "attempts")).catch(() => undefined)).toBeUndefined()
  expect(await stat(path.join(readiness, "attempts")).catch(() => undefined)).toBeUndefined()
  for (const file of retained) expect(await Bun.file(file).text()).toBe("retain")
})

test("pruneRuntimeAttempts: адресная очистка не удаляет неархивированный старый runtime", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-targeted-prune-"))
  const parent = path.join(profile, "loginom/runtime/generations/1/chats/chat/attempts")
  const owned = path.join(parent, "owned")
  const old = path.join(parent, "old")
  await Bun.write(path.join(owned, "execution-events.jsonl"), "archived")
  await Bun.write(path.join(old, "execution-events.jsonl"), "unarchived")
  expect(await pruneRuntimeAttempts(profile, [owned])).toBe(1)
  expect(await Bun.file(path.join(owned, "execution-events.jsonl")).exists()).toBe(false)
  expect(await Bun.file(path.join(old, "execution-events.jsonl")).text()).toBe("unarchived")
})

test("pruneRuntimeAttempts: pending recovery сохраняет attempts для расследования", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-prune-"))
  const attempt = path.join(profile, "loginom", "runtime", "generations", "1", "chats", "chat", "attempts", "attempt")
  await mkdir(attempt, { recursive: true })
  await mkdir(path.join(profile, "loginom", "recovery"), { recursive: true })
  await Bun.write(path.join(profile, "loginom", "recovery", "operation.json"), JSON.stringify({ id: "operation" }))
  await Bun.write(path.join(attempt, "execution-events.jsonl"), "evidence")
  await expect(pruneRuntimeAttempts(profile)).rejects.toThrow("pending recovery")
  expect(await Bun.file(path.join(attempt, "execution-events.jsonl")).text()).toBe("evidence")
})

test("pruneRuntimeAttempts: pending connection сохраняет readiness attempts", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-prune-"))
  const attempt = path.join(profile, "loginom", "runtime", "generations", "1", "chats", "readiness", "attempts", "attempt")
  await mkdir(attempt, { recursive: true })
  await mkdir(path.join(profile, "loginom", "connection"), { recursive: true })
  await Bun.write(path.join(profile, "loginom", "connection", "pending.json"), JSON.stringify({ generation: 1 }))
  await Bun.write(path.join(attempt, "browser-profile"), "evidence")
  await expect(pruneRuntimeAttempts(profile)).rejects.toThrow("pending connection")
  expect(await Bun.file(path.join(attempt, "browser-profile")).text()).toBe("evidence")
})

test("pruneRuntimeAttempts: не удаляет чужие attempts через симлинк runtime generations", async () => {
  const { symlink } = await import("node:fs/promises")
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-prune-"))
  const foreign = await mkdtemp(path.join(os.tmpdir(), "evals-foreign-runtime-"))
  const evidence = path.join(foreign, "1", "chats", "chat", "attempts", "attempt", "evidence")
  await mkdir(path.dirname(evidence), { recursive: true })
  await Bun.write(evidence, "foreign")
  await mkdir(path.join(profile, "loginom", "runtime"), { recursive: true })
  await symlink(foreign, path.join(profile, "loginom", "runtime", "generations"))
  expect(await pruneRuntimeAttempts(profile)).toBe(0)
  expect(await Bun.file(evidence).text()).toBe("foreign")
})

test("pruneRuntimeAttempts: живая группа без .writer сохраняет runtime attempts", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-prune-"))
  const evidence = path.join(profile, "loginom", "runtime", "generations", "1", "chats", "chat", "attempts", "attempt", "evidence")
  await mkdir(path.dirname(evidence), { recursive: true })
  await Bun.write(evidence, "active")
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" })
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()))
  await Bun.write(`${profile}.process-group`, String(child.pid))
  try {
    await expect(pruneRuntimeAttempts(profile)).rejects.toThrow("занят процессами")
    expect(await Bun.file(evidence).text()).toBe("active")
  } finally {
    if (child.pid) process.kill(-child.pid, "SIGKILL")
    await exited
  }
})

test("pruneRuntimeAttempts: не следует симлинку самого runtime каталога", async () => {
  const { symlink } = await import("node:fs/promises")
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-profile-prune-"))
  const foreign = await mkdtemp(path.join(os.tmpdir(), "evals-foreign-runtime-"))
  const evidence = path.join(foreign, "generations", "1", "chats", "chat", "attempts", "attempt", "evidence")
  await mkdir(path.dirname(evidence), { recursive: true })
  await Bun.write(evidence, "foreign")
  await mkdir(path.join(profile, "loginom"), { recursive: true })
  await symlink(foreign, path.join(profile, "loginom", "runtime"))
  expect(await pruneRuntimeAttempts(profile)).toBe(0)
  expect(await Bun.file(evidence).text()).toBe("foreign")
})


test("management: timeout подтверждает завершение launcher и detached потомка", async () => {
  const context = await fakeProfile()
  const pidFile = path.join(context.profileDir, "timeout-child.pid")
  const result = await management({ ...context.command, env: { ...context.command.env,
    EVAL_FAKE_ORPHAN_PID_FILE: pidFile, EVAL_FAKE_DETACHED_CHILD: "1", EVAL_FAKE_EXIT_DELAY_MS: "2000" } },
    ["loginom", "status", "--format", "json"], undefined, 500)
  expect(result.timedOut).toBe(true)
  expect(result.processCleanup.status).toBe("confirmed")
  expect(result.processCleanup.verification?.map((pass) => pass.owned_remaining)).toEqual([0, 0])
  const pid = Number(await Bun.file(pidFile).text())
  const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
  expect(state === "" || state.startsWith("Z")).toBe(true)
})


test("waitProfileIdle: повторно проверяет короткое окно после ухода временного owner", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-idle-transition-"))
  const child = spawn(process.execPath, ["-e", "console.log('ready'); setTimeout(() => process.exit(0), 200)"], {
    env: { PATH: process.env.PATH ?? "", LOGINOM_AI_AGENT_CLI_PROFILE: profile }, stdio: ["ignore", "pipe", "ignore"],
  })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    await new Promise((resolve) => child.stdout!.once("data", resolve))
    expect(await waitProfileIdle(profile, 1000)).toBe(true)
  } finally { child.kill("SIGKILL"); await exited }
})


test("releaseStaleWriter: guard без owner не признаётся отсутствующим", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-incomplete-"))
  await mkdir(path.join(profile, ".writer"))
  await expect(releaseStaleWriter(profile, null)).rejects.toThrow("Writer owner unavailable")
  expect((await stat(path.join(profile, ".writer"))).isDirectory()).toBe(true)
})


test("writerIdentity: symlink owner не читает конфигурацию в process proof", async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), "evals-writer-link-"))
  await mkdir(path.join(profile, ".writer"))
  const authorization = path.join(profile, "auth.json")
  await Bun.write(authorization, "private-authorization-token")
  await symlink(authorization, path.join(profile, ".writer/owner"))
  await expect(writerIdentity(profile)).rejects.toThrow("Writer owner")
})
