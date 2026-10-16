import { expect, test } from "bun:test"
import path from "node:path"
import os from "node:os"
import { chmod, mkdir, mkdtemp, rm } from "node:fs/promises"
import { runJudgeUnit } from "../src/judge-unit"
import { judgeVersion } from "../src/judge"

test("judge unit: wrapper exit and inactive named service confirm cleanup without process ancestry", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-unit-"))
  try {
    await mkdir(path.join(root, "bin"))
    const wrapper = path.join(root, "wrapper.ts")
    const query = path.join(root, "query")
    const trace = path.join(root, "trace.json")
    await Bun.write(wrapper, `await Bun.write(process.env.JUDGE_UNIT_TRACE!, JSON.stringify({ unit: process.env.LOGINOM_EVALS_JUDGE_UNIT, timeout: process.env.LOGINOM_EVALS_JUDGE_TIMEOUT_SEC })); console.log("judged")`)
    const systemctl = path.join(root, "bin/systemctl")
    await Bun.write(systemctl, '#!/bin/sh\nprintf "%s\\n" "$@" > "$JUDGE_UNIT_QUERY"\nprintf "LoadState=loaded\\nActiveState=inactive\\nMainPID=0\\n"\n')
    await chmod(systemctl, 0o700)
    const result = await runJudgeUnit({ cmd: [process.execPath, wrapper], cwd: root, timeoutMs: 1000,
      env: { PATH: path.join(root, "bin") + ":/usr/bin:/bin", JUDGE_UNIT_TRACE: trace, JUDGE_UNIT_QUERY: query } })
    expect(result).toMatchObject({ exitCode: 0, stdout: "judged\n", cleanupConfirmed: true, timedOut: false, interrupted: false })
    expect(result.unit).toMatch(/^loginom-evals-judge-[0-9a-f-]{36}$/)
    expect(await Bun.file(trace).json()).toEqual({ unit: result.unit, timeout: "1" })
    expect((await Bun.file(query).text()).split("\n")).toContain(`${result.unit}.service`)
    for (const state of ["LoadState=loaded\nActiveState=active\nMainPID=123\n", "LoadState=loaded\nActiveState=inactive\nMainPID=123\n", ""]) {
      await Bun.write(systemctl, `#!/bin/sh\nprintf '%s' '${state}'\n`)
      const refused = await runJudgeUnit({ cmd: [process.execPath, wrapper], cwd: root, timeoutMs: 1000,
        env: { PATH: path.join(root, "bin") + ":/usr/bin:/bin", JUDGE_UNIT_TRACE: trace, JUDGE_UNIT_QUERY: query } })
      expect(refused.cleanupConfirmed).toBe(false)
      expect(refused.exitCode).toBe(0)
    }
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("judge unit: interruption waits for the bounded wrapper and never kills its chain", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-unit-abort-"))
  try {
    await mkdir(path.join(root, "bin"))
    const script = path.join(root, "wrapper.ts")
    const finished = path.join(root, "finished")
    await Bun.write(script, `console.log("started"); await Bun.sleep(100); await Bun.write(${JSON.stringify(finished)}, "finished")`)
    await Bun.write(path.join(root, "bin/systemctl"), '#!/bin/sh\nprintf "LoadState=not-found\nActiveState=inactive\nMainPID=0\n"\nexit 4\n')
    await chmod(path.join(root, "bin/systemctl"), 0o700)
    const controller = new AbortController()
    const pending = runJudgeUnit({ cmd: [process.execPath, script], cwd: root,
      env: { PATH: path.join(root, "bin") + ":/usr/bin:/bin" }, timeoutMs: 1000, signal: controller.signal })
    controller.abort()
    const result = await pending
    expect(result).toMatchObject({ exitCode: 0, interrupted: true, cleanupConfirmed: true })
    expect(await Bun.file(finished).text()).toBe("finished")
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("judge version: VPN mode uses the named service boundary", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-unit-version-"))
  try {
    await Bun.write(path.join(root, "wrapper.ts"), 'console.log(process.env.LOGINOM_EVALS_JUDGE_UNIT)')
    await Bun.write(path.join(root, "systemctl"), '#!/bin/sh\nprintf "LoadState=loaded\nActiveState=inactive\nMainPID=0\n"\n')
    await chmod(path.join(root, "systemctl"), 0o700)
    const result = await judgeVersion({ command: [process.execPath, path.join(root, "wrapper.ts")], systemd: true,
      env: { PATH: root + ":/usr/bin:/bin" } })
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toMatch(/^loginom-evals-judge-[0-9a-f-]{36}$/)
  } finally { await rm(root, { recursive: true, force: true }) }
})

test("VPN judge inherits its explicit home and operational settings without credentials", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-unit-env-"))
  try {
    await Bun.write(path.join(root, "systemctl"), '#!/bin/sh\nprintf "LoadState=not-found\\nActiveState=inactive\\nMainPID=0\\n"\nexit 4\n')
    await chmod(path.join(root, "systemctl"), 0o700)
    await Bun.write(path.join(root, "wrapper.ts"), `console.log(JSON.stringify({ home: process.env.CODEX_HOME, path: process.env.PATH,
      leaked: ["OPENAI_API_KEY", "LOGINOM_PASSWORD", "AWS_SECRET_ACCESS_KEY", "PRIVATE_UNKNOWN_TOKEN"].filter(key => process.env[key]) }))`)
    const result = await judgeVersion({ systemd: true, command: [process.execPath, path.join(root, "wrapper.ts")],
      env: { PATH: root + ":/usr/bin:/bin", CODEX_HOME: root, OPENAI_API_KEY: "provider-private", LOGINOM_PASSWORD: "slot-private",
        AWS_SECRET_ACCESS_KEY: "cloud-private", PRIVATE_UNKNOWN_TOKEN: "unknown-private" } })
    expect(result.exitCode).toBe(0)
    const observed = JSON.parse(result.stdout)
    expect(observed.home).toBe(root)
    expect(observed.path).toBe(root + ":/usr/bin:/bin")
    expect(observed.leaked).toEqual([])
  } finally { await rm(root, { recursive: true }) }
})

test("judge unit: a stalled unit lookup cannot extend the wrapper deadline", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-unit-deadline-"))
  const finished = path.join(root, "query-finished")
  try {
    await Bun.write(path.join(root, "systemctl"), `#!${process.execPath}\nawait Bun.sleep(10200); console.log("LoadState=loaded\\nActiveState=inactive\\nMainPID=0"); await Bun.write(${JSON.stringify(finished)}, "finished")`)
    await chmod(path.join(root, "systemctl"), 0o700)
    const result = await runJudgeUnit({ cmd: [process.execPath, "-e", "console.log('done')"], cwd: root,
      env: { PATH: root + ":/usr/bin:/bin" }, timeoutMs: 1 })
    expect(result.cleanupConfirmed).toBe(false)
    expect(result.cleanupError).toContain("deadline")
  } finally {
    const deadline = Date.now() + 1500
    while (!await Bun.file(finished).exists() && Date.now() < deadline) await Bun.sleep(10)
    expect(await Bun.file(finished).exists()).toBe(true)
    await rm(root, { recursive: true, force: true })
  }
})
