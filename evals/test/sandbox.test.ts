import { expect, test } from "bun:test"
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { spawn } from "node:child_process"
import { sandboxCommand, debuggerEndpoints } from "../src/sandbox"
import { evalsRoot } from "../src/config"
import { superviseProcess } from "../src/process-supervisor"

test("sandboxCommand: Python читает только входы и writable-профиль, внешние ответы недоступны", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-sandbox-"))
  try {
    const installation = path.join(dir, "installation")
    const profile = path.join(dir, "profile")
    const workspace = path.join(dir, "workspace")
    await Promise.all([mkdir(path.join(installation, "bin"), { recursive: true }), mkdir(profile), mkdir(workspace)])
    await cp("/usr/bin/python3", path.join(installation, "bin", "cli"), { dereference: true })
    await Bun.write(path.join(installation, "cli-manifest.json"), "{}")
    await Bun.write(path.join(workspace, "dataset.csv"), "category,value\nA,10\n")
    await Bun.write(path.join(profile, "cli-profile.json"), "{}")
    const hidden = [path.join(dir, "oracle.csv"), path.join(evalsRoot, "tasks/analytic/sales-by-category/reference.lgp"),
      path.join(evalsRoot, "tasks/analytic/sales-by-category/task.json"), path.join(evalsRoot, "calibration"),
      path.join(path.dirname(evalsRoot), ".git"), `/proc/${process.pid}/root`, "/run", "/var/run/docker.sock"]
    await Bun.write(hidden[0]!, "answer\n10\n")
    const script = "import json,os,pathlib,sys; p=pathlib.Path(sys.argv[1]); " +
      "p.write_text('refreshed'); pathlib.Path('result.csv').write_text(pathlib.Path('dataset.csv').read_text()); " +
      "print(json.dumps({'hidden':[os.path.exists(x) for x in sys.argv[2:]],'refresh':p.read_text(),'home':os.environ['HOME'],'leak':os.getenv('ANSWER')}))"
    const command = await sandboxCommand({ cmd: [path.join(installation, "bin/cli"), "-c", script, path.join(profile, "cli-profile.json"), ...hidden],
      profileDir: profile, workdir: workspace, env: { ...process.env, ANSWER: "10", NODE_OPTIONS: "--inspect=0" } })
    const proc = spawn(command.cmd[0]!, command.cmd.slice(1), { cwd: command.cwd, env: command.env, stdio: ["ignore", "pipe", "pipe", "pipe"] })
    let stdout = "", stderr = ""
    proc.stdout!.on("data", (data) => { stdout += data.toString() })
    proc.stderr!.on("data", (data) => { stderr += data.toString() })
    const code = await new Promise<number | null>((resolve) => proc.once("exit", resolve))
    expect(stderr).toBe("")
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toEqual({ hidden: hidden.map(() => false), refresh: "refreshed", home: "/home/eval", leak: null })
    expect(await Bun.file(path.join(workspace, "result.csv")).text()).toBe("category,value\nA,10\n")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("superviseProcess: сбой mount обёртки отличается от exit 1 изолированного CLI", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-sandbox-status-"))
  try {
    await Promise.all([mkdir(path.join(dir, "installation/bin"), { recursive: true }), mkdir(path.join(dir, "profile")), mkdir(path.join(dir, "workspace"))])
    await cp("/usr/bin/python3", path.join(dir, "installation/bin/cli"), { dereference: true })
    await Bun.write(path.join(dir, "installation/cli-manifest.json"), "{}")
    const cmd = [path.join(dir, "installation/bin/cli"), "-c", "import sys; sys.exit(1)"]
    const boundary = await sandboxCommand({ cmd, profileDir: path.join(dir, "profile"), workdir: path.join(dir, "workspace"), env: {} })
    const failedMount = [...boundary.cmd]
    failedMount.splice(failedMount.indexOf("--"), 0, "--ro-bind", path.join(dir, "missing"), "/missing")
    const run = await superviseProcess({ cmd, cwd: boundary.cwd, env: boundary.env, sandbox: failedMount, timeoutMs: 5_000 })
    expect(run.exitCode).toBe(1)
    expect(run.sandboxError).toBe("SANDBOX_EXECUTION_FAILED")
    const cli = await superviseProcess({ cmd, cwd: boundary.cwd, env: boundary.env, sandbox: boundary.cmd, timeoutMs: 5_000 })
    expect(cli.exitCode).toBe(1)
    expect(cli.sandboxError).toBeNull()
    expect(cli.processCleanup.status).toBe("confirmed")
    expect(cli.processCleanup.selectedCli?.executable).toBe(cmd[0]!)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}, 15_000)

test.each(["abort", "timeout"])("superviseProcess: %s даёт CLI выполнить cleanup до завершения bwrap", async (trigger) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-sandbox-signal-"))
  try {
    await Promise.all([mkdir(path.join(dir, "installation/bin"), { recursive: true }), mkdir(path.join(dir, "profile")), mkdir(path.join(dir, "workspace"))])
    await cp("/usr/bin/python3", path.join(dir, "installation/bin/cli"), { dereference: true })
    await Bun.write(path.join(dir, "installation/cli-manifest.json"), "{}")
    const script = "import signal,time,pathlib,sys\n" +
      "def cleanup(signum, frame):\n pathlib.Path('cleaned').write_text('done'); sys.exit(0)\n" +
      "signal.signal(signal.SIGINT, cleanup)\nsignal.signal(signal.SIGTERM, cleanup)\npathlib.Path('ready').write_text('ready')\ntime.sleep(60)\n"
    const cmd = [path.join(dir, "installation/bin/cli"), "-c", script]
    const boundary = await sandboxCommand({ cmd, profileDir: path.join(dir, "profile"), workdir: path.join(dir, "workspace"), env: {} })
    const controller = new AbortController()
    const pending = superviseProcess({ cmd, cwd: boundary.cwd, env: boundary.env, sandbox: boundary.cmd, timeoutMs: 2_000, signal: controller.signal })
    const deadline = Date.now() + 5_000
    while (!await Bun.file(path.join(dir, "workspace/ready")).exists() && Date.now() < deadline) await Bun.sleep(20)
    if (trigger === "abort") controller.abort()
    const run = await pending
    expect(run.interrupted).toBe(trigger === "abort")
    expect(run.timedOut).toBe(trigger === "timeout")
    expect(await Bun.file(path.join(dir, "workspace/cleaned")).exists()).toBe(true)
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.launcher?.cli_pid).not.toBeNull()
    expect(run.sandboxError).toBeNull()
  } finally { await rm(dir, { recursive: true, force: true }) }
}, 20_000)

test("debuggerEndpoints: находит Node inspector на случайном порту --inspect=0", async () => {
  const proc = spawn("/usr/bin/node", ["--inspect=0", "-e", "setInterval(() => {}, 1000)"], { stdio: ["ignore", "ignore", "pipe"] })
  try {
    const port = await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Inspector startup timeout")), 5_000)
      proc.once("error", reject)
      let text = ""
      proc.stderr!.on("data", (data: Buffer) => {
        text += data.toString()
        const match = text.match(/ws:\/\/127\.0\.0\.1:(\d+)\//)
        if (match) { clearTimeout(timer); resolve(Number(match[1])) }
      })
    })
    expect(await debuggerEndpoints()).toContain(`http://127.0.0.1:${port}`)
  } finally {
    const stopped = new Promise<void>((resolve) => proc.once("exit", () => resolve()))
    proc.kill("SIGTERM")
    await stopped
  }
}, 10_000)
