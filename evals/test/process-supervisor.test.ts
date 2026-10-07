import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { cp, mkdtemp, readFile, readlink, stat } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { agentCommand, runAgent } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"
import { signalProcess, type ProcessIdentity } from "../src/process-supervisor"
import { archiveDiagnostics } from "../src/diagnostics"

test("signalProcess: другая birth или executable identity не разрешает сигнал", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    const pid = child.pid!
    const fields = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")
    const info = await stat(`/proc/${pid}/exe`)
    const identity: ProcessIdentity = { pid, starttime: fields[19]!, uid: process.getuid!(), parent: Number(fields[1]),
      group: Number(fields[2]), session: Number(fields[3]), device: info.dev, inode: info.ino, executable: await readlink(`/proc/${pid}/exe`) }
    for (const changed of [{ ...identity, starttime: "different-birth" }, { ...identity, inode: identity.inode + 1 }])
      await expect(signalProcess(changed, "SIGKILL")).rejects.toThrow("identity changed")
    expect(child.exitCode).toBeNull()
    process.kill(pid, 0)
  } finally { child.kill("SIGKILL"); await exited }
})

test("supervisor: собственный detached browser закрыт, неизвестный helper остаётся и блокирует продолжение", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-proof-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-bundle-"))
  await Bun.build({ entrypoints: [path.join(evalsRoot, "fixtures/fake-browser.ts")], compile: { outfile: path.join(bundle, "chrome") } })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const pidFile = path.join(out, "browser.pid")
  const pending = runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
    EVAL_FAKE_BROWSER_PID_FILE: pidFile } }, taskId: "default", model: "fake/model", prompt: "test", files: [],
    workdir: out, outDir: out, profileDir: out, timeoutMs: 30_000 })
  await Bun.sleep(300)
  const unknown = spawn(path.join(bundle, "chrome"), ["--type=unknown-helper"], { detached: true, stdio: "ignore" })
  const exited = new Promise((resolve) => unknown.once("exit", resolve))
  try {
    const run = await pending
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup.status).toBe("failed")
    expect(run.processCleanup.error).toContain("Unexplained browser/helper")
    expect(unknown.exitCode).toBeNull()
    const pid = Number(await Bun.file(pidFile).text())
    const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
    expect(state === "" || state.startsWith("Z")).toBe(true)
  } finally { unknown.kill("SIGKILL"); await exited }
}, 20_000)

test("supervisor: происхождение без точного browser profile не разрешает сигнал браузеру", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-binding-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-binding-bundle-"))
  await Bun.build({ entrypoints: [path.join(evalsRoot, "fixtures/fake-browser.ts")], compile: { outfile: path.join(bundle, "chrome") } })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const pidFile = path.join(out, "browser.pid")
  const helperFile = path.join(out, "helper.pid")
  let run: Awaited<ReturnType<typeof runAgent>> | undefined
  try {
    run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: pidFile, EVAL_FAKE_BROWSER_DATA_DIR: "/tmp/foreign-browser-profile", EVAL_FAKE_BROWSER_HELPER_PID_FILE: helperFile, EVAL_FAKE_BROWSER_HELPER_DETACHED: "1" } },
      taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out,
      outDir: out, profileDir: out, timeoutMs: 30_000 })
    expect(run.processCleanup.status).toBe("failed")
    const pid = Number(await Bun.file(pidFile).text())
    expect((await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()).not.toMatch(/^$|^Z/)
    const helper = Number(await Bun.file(helperFile).text())
    expect(run.processCleanup.admissions?.find((entry) => entry.pid === helper)?.status).not.toBe("allowed")
    process.kill(helper, 0)
  } finally {
    for (const file of [pidFile, helperFile]) {
      if (!(await Bun.file(file).exists())) continue
      const pid = Number(await Bun.file(file).text())
      const saved = run?.processCleanup.processes.find((entry) => entry.pid === pid)
      if (saved) await signalProcess(saved, "SIGKILL")
    }
  }
}, 20_000)

test("supervisor: потеря argv не стирает уже доказанную browser birth binding", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-lifecycle-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-lifecycle-bundle-"))
  await cp(Bun.which("node")!, path.join(bundle, "chrome"), { dereference: true })
  const script = path.join(bundle, "browser.mjs")
  await Bun.write(script, "process.on('SIGTERM',()=>{}); setTimeout(()=>{process.title=''},40); setInterval(()=>{},1000)")
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const pidFile = path.join(out, "browser.pid")
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: pidFile, EVAL_FAKE_BROWSER_SCRIPT: script } },
      taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out,
      outDir: out, profileDir: out, timeoutMs: 30_000 })
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.sessionId).toBe("ses_fixture03")
    expect(run.processCleanup.browserBindings?.length).toBeGreaterThan(0)
    expect(run.processCleanup.polling?.map((entry) => entry.interval_ms)).toContain(100)
  } finally {
    if (await Bun.file(pidFile).exists()) { try { process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL") } catch {} }
  }
}, 20_000)

test("supervisor: helper в свежей доказанной browser session не теряется после reparent", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-session-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-session-bundle-"))
  await Bun.build({ entrypoints: [path.join(evalsRoot, "fixtures/fake-browser.ts")], compile: { outfile: path.join(bundle, "chrome") } })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const helperFile = path.join(out, "helper.pid")
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: path.join(out, "browser.pid"), EVAL_FAKE_BROWSER_HELPER_PID_FILE: helperFile } },
      taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out,
      outDir: out, profileDir: out, timeoutMs: 30_000 })
    expect(run.processCleanup.status).toBe("confirmed")
    const pid = Number(await Bun.file(helperFile).text())
    const state = (await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()
    expect(state === "" || state.startsWith("Z")).toBe(true)
  } finally {
    if (await Bun.file(helperFile).exists()) { try { process.kill(Number(await Bun.file(helperFile).text()), "SIGKILL") } catch {} }
  }
}, 20_000)

test("supervisor: double-fork helper с новым SID имеет доказанный launcher origin", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-session-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-session-bundle-"))
  await Bun.build({ entrypoints: [path.join(evalsRoot, "fixtures/fake-browser.ts")], compile: { outfile: path.join(bundle, "chrome") } })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const helperFile = path.join(out, "helper.pid")
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: path.join(out, "browser.pid"), EVAL_FAKE_BROWSER_HELPER_PID_FILE: helperFile, EVAL_FAKE_BROWSER_HELPER_DETACHED: "1" } },
      taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out,
      outDir: out, profileDir: out, timeoutMs: 30_000 })
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.verification).toHaveLength(2)
    expect(run.processCleanup.verification?.map((pass) => pass.owned_remaining)).toEqual([0, 0])
    expect(run.processCleanup.origins?.some((entry) => entry.pid === run.processCleanup.launcher?.cli_pid && entry.via === "cli")).toBe(true)
    expect(run.processCleanup.origins?.map((entry) => entry.via)).not.toContain("live_session")
    expect(run.processCleanup.origins?.some((entry) => entry.via === "subreaper")).toBe(true)
    const pid = Number(await Bun.file(helperFile).text())
    expect(run.processCleanup.admissions?.find((entry) => entry.pid === pid)?.status).toBe("allowed")
    const saved = run.processCleanup.processes.find((entry) => entry.pid === pid)!
    expect(saved.starttime).toBeTruthy()
    const raw = await readFile(`/proc/${pid}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    const fields = raw?.slice(raw.lastIndexOf(")") + 2).split(" ")
    expect(!fields || fields[19] !== saved.starttime || ["Z", "X"].includes(fields[0]!)).toBe(true)
  } finally {
    if (await Bun.file(helperFile).exists()) { try { process.kill(Number(await Bun.file(helperFile).text()), "SIGKILL") } catch {} }
  }
}, 20_000)


test("supervisor: новый противоречащий profile после binding запрещает сигнал", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-rebinding-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-rebinding-bundle-"))
  await cp(Bun.which("node")!, path.join(bundle, "chrome"), { dereference: true })
  const script = path.join(bundle, "browser.mjs")
  await Bun.write(script, "process.on('SIGTERM',()=>{}); setTimeout(()=>{process.title=process.execPath+' --user-data-dir=/tmp/foreign-profile --remote-debugging-pipe'},300); setInterval(()=>{},1000)")
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const pidFile = path.join(out, "browser.pid")
  let run: Awaited<ReturnType<typeof runAgent>> | undefined
  try {
    run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: pidFile, EVAL_FAKE_BROWSER_SCRIPT: script } }, taskId: "default", model: "fake/model",
      prompt: "test", files: [], workdir: out, outDir: out, profileDir: out, timeoutMs: 30_000 })
    const pid = Number(await Bun.file(pidFile).text())
    expect(run.processCleanup.browserBindings?.length).toBeGreaterThan(0)
    expect(run.processCleanup.status).toBe("failed")
    expect(run.processCleanup.admissions?.find((entry) => entry.pid === pid)?.status).toBe("refused")
    process.kill(pid, 0)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      const pid = Number(await Bun.file(pidFile).text())
      const saved = run?.processCleanup.processes.find((entry) => entry.pid === pid)
      if (saved) await signalProcess(saved, "SIGKILL")
    }
  }
}, 20_000)


test("supervisor: новый чужой Chromium с другим profile остаётся живым", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-foreign-browser-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-foreign-browser-bundle-"))
  await Bun.build({ entrypoints: [path.join(evalsRoot, "fixtures/fake-browser.ts")], compile: { outfile: path.join(bundle, "chrome") } })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const pending = runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
    EVAL_FAKE_BROWSER_PID_FILE: path.join(out, "browser.pid") } }, taskId: "default", model: "fake/model", prompt: "test",
    files: [], workdir: out, outDir: out, profileDir: out, timeoutMs: 30_000 })
  await Bun.sleep(300)
  const foreign = spawn(path.join(bundle, "chrome"), ["--user-data-dir=/tmp/other-browser-profile"], { detached: true, stdio: "ignore" })
  const exited = new Promise((resolve) => foreign.once("exit", resolve))
  try {
    const run = await pending
    expect(run.processCleanup.status).toBe("confirmed")
    expect(foreign.exitCode).toBeNull()
    process.kill(foreign.pid!, 0)
  } finally { foreign.kill("SIGKILL"); await exited }
}, 20_000)

test("supervisor: неизвестный потомок браузера вне bundle остаётся живым и запрещает переход", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-external-helper-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-external-helper-bundle-"))
  await cp(Bun.which("node")!, path.join(bundle, "chrome"), { dereference: true })
  const script = path.join(bundle, "browser.mjs")
  await Bun.write(script, `import { spawn } from 'node:child_process'; import { writeFile } from 'node:fs/promises';
    const child=spawn(${JSON.stringify(process.execPath)},['-e',"process.on('SIGTERM',()=>{});setInterval(()=>{},1000)"],{stdio:'ignore'});
    await writeFile(process.env.EVAL_FAKE_BROWSER_HELPER_PID_FILE,String(child.pid));
    process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`)
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const helperFile = path.join(out, "helper.pid")
  let run: Awaited<ReturnType<typeof runAgent>> | undefined
  try {
    run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: path.join(out, "browser.pid"), EVAL_FAKE_BROWSER_SCRIPT: script,
      EVAL_FAKE_BROWSER_HELPER_PID_FILE: helperFile } }, taskId: "default", model: "fake/model", prompt: "test", files: [],
      workdir: out, outDir: out, profileDir: out, timeoutMs: 30_000 })
    const pid = Number(await Bun.file(helperFile).text())
    expect(run.processCleanup.status).toBe("failed")
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup.admissions?.find((entry) => entry.pid === pid)?.status).toBe("refused")
    process.kill(pid, 0)
  } finally {
    if (await Bun.file(helperFile).exists()) {
      const pid = Number(await Bun.file(helperFile).text())
      const saved = run?.processCleanup.processes.find((entry) => entry.pid === pid)
      if (saved) await signalProcess(saved, "SIGKILL")
    }
  }
}, 20_000)

test("supervisor: validation browser требует точного нового каталога и сохраняет binding после удаления temp продуктом", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-validation-browser-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-validation-bundle-"))
  await Bun.build({ entrypoints: [path.join(evalsRoot, "fixtures/fake-browser.ts")], compile: { outfile: path.join(bundle, "chrome") } })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  const pidFile = path.join(out, "browser.pid")
  let run: Awaited<ReturnType<typeof runAgent>> | undefined
  try {
    run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: pidFile, EVAL_FAKE_VALIDATION: "1" } }, taskId: "default", model: "fake/model",
      prompt: "test", files: [], workdir: out, outDir: out, profileDir: out, timeoutMs: 30_000 })
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.browserBindings).toHaveLength(1)
    expect(run.processCleanup.runtimeDirectories).toHaveLength(1)
    const archive = await archiveDiagnostics(out, run.processCleanup.runtimeDirectories, path.join(out, "archive"))
    expect(archive.files).toEqual([])
    expect(archive.runtime_directories[0]).toContain("loginom/validation/")
    expect(archive.removed_validation_directories).toEqual(archive.runtime_directories)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      const pid = Number(await Bun.file(pidFile).text())
      const saved = run?.processCleanup.processes.find((entry) => entry.pid === pid)
      if (saved) await signalProcess(saved, "SIGKILL")
    }
  }
}, 20_000)

test("supervisor: неизвестный adopted helper вне bundle не получает сигнал после потери parent chain", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-adopted-helper-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-adopted-bundle-"))
  await cp(Bun.which("node")!, path.join(bundle, "chrome"), { dereference: true })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const helper = path.join(out, "helper.ts")
  const pidFile = path.join(out, "helper.pid")
  await Bun.write(helper, `process.on('SIGINT',()=>{}); process.on('SIGTERM',()=>{});
    await Bun.write(${JSON.stringify(pidFile)},String(process.pid)); setInterval(()=>{},1000)`)
  const script = path.join(bundle, "browser.mjs")
  await Bun.write(script, `import {spawn} from 'node:child_process';
    process.on('SIGTERM',()=>{}); setInterval(()=>{},1000);
    setTimeout(()=>spawn('/bin/sh',['-c',${JSON.stringify(`'${process.execPath}' '${helper}' --type=unknown-helper &`)}],{stdio:'ignore'}),600)`)
  const command = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: out })
  let run: Awaited<ReturnType<typeof runAgent>> | undefined
  try {
    run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_SCRIPT: script, EVAL_FAKE_BROWSER_PID_FILE: path.join(out, "browser.pid") } },
      taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out,
      outDir: out, profileDir: out, timeoutMs: 30_000 })
    const pid = Number(await Bun.file(pidFile).text())
    expect(run.processCleanup.origins?.find((entry) => entry.pid === pid)?.via).toBe("subreaper")
    expect(run.processCleanup.status).toBe("failed")
    expect(run.exitCode).toBe(0)
    expect(run.sessionId).toBe("ses_fixture03")
    expect(run.processCleanup.admissions?.find((entry) => entry.pid === pid)?.status).not.toBe("allowed")
    process.kill(pid, 0)
    expect(await Bun.file(`${out}.process-group`).exists()).toBe(true)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      const pid = Number(await Bun.file(pidFile).text())
      const identity = run?.processCleanup.processes.find((entry) => entry.pid === pid)
      if (identity) await signalProcess(identity, "SIGKILL")
    }
  }
}, 20_000)
