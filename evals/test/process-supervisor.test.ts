import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { cp, mkdtemp, readFile, readlink, stat } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { agentCommand, runAgent } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"
import { signalProcess, type ProcessIdentity } from "../src/process-supervisor"

test("signalProcess: PID с другим starttime не получает сигнал", async () => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { detached: true, stdio: "ignore" })
  const exited = new Promise((resolve) => child.once("exit", resolve))
  try {
    const pid = child.pid!
    const fields = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")
    const info = await stat(`/proc/${pid}/exe`)
    const identity: ProcessIdentity = { pid, starttime: "different-birth", uid: process.getuid!(), parent: Number(fields[1]),
      group: Number(fields[2]), session: Number(fields[3]), device: info.dev, inode: info.ino, executable: await readlink(`/proc/${pid}/exe`) }
    await expect(signalProcess(identity, "SIGKILL")).rejects.toThrow("identity changed")
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
  try {
    const run = await runAgent({ command: { ...command, env: { ...command.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
      EVAL_FAKE_BROWSER_PID_FILE: pidFile, EVAL_FAKE_BROWSER_DATA_DIR: "/tmp/foreign-browser-profile" } },
      taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: out,
      outDir: out, profileDir: out, timeoutMs: 30_000 })
    expect(run.processCleanup.status).toBe("failed")
    const pid = Number(await Bun.file(pidFile).text())
    expect((await Bun.$`ps -o stat= -p ${pid}`.quiet().nothrow()).text().trim()).not.toMatch(/^$|^Z/)
  } finally {
    if (await Bun.file(pidFile).exists()) {
      try { process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL") } catch {}
    }
  }
}, 20_000)

test("supervisor: потеря argv не стирает уже доказанную browser birth binding", async () => {
  const out = await mkdtemp(path.join(os.tmpdir(), "evals-browser-lifecycle-"))
  const bundle = await mkdtemp(path.join(os.tmpdir(), "evals-browser-lifecycle-bundle-"))
  await cp(Bun.which("node")!, path.join(bundle, "chrome"), { dereference: true })
  const script = path.join(bundle, "browser.mjs")
  await Bun.write(script, "process.on('SIGTERM',()=>{}); setTimeout(()=>{process.title=''},400); setInterval(()=>{},1000)")
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
  } finally {
    if (await Bun.file(pidFile).exists()) { try { process.kill(Number(await Bun.file(pidFile).text()), "SIGKILL") } catch {} }
  }
}, 20_000)
