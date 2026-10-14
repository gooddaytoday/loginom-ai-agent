import { expect, test } from "bun:test"
import { spawn } from "node:child_process"
import { cp, mkdir, mkdtemp, readFile, readlink, rm, stat } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { agentCommand, runAgent } from "../src/cli"
import { evalsRoot, loadConfig } from "../src/config"
import { signalProcess, superviseProcess, type ProcessIdentity } from "../src/process-supervisor"
import { archiveDiagnostics } from "../src/diagnostics"

test("supervisor releases its interrupt grace timer when the owned command exits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-interrupt-timer-"))
  let cleanupConfirmed = true
  try {
    const script = path.join(root, "supervise.ts")
    const result = path.join(root, "result.json")
    await Bun.write(script, `import { superviseProcess } from ${JSON.stringify(path.join(evalsRoot, "src/process-supervisor.ts"))}
const abort = new AbortController()
const output = new TransformStream()
const reader = output.readable.getReader()
const pending = superviseProcess({cmd:[process.execPath,"-e","console.log('ready'); await Bun.sleep(120000)"],
  cwd:${JSON.stringify(root)},env:{PATH:process.env.PATH},timeoutMs:10000,stdout:output.writable,signal:abort.signal})
await reader.read()
abort.abort()
while (!(await reader.read()).done) {}
reader.releaseLock()
const run = await pending
await Bun.write(${JSON.stringify(result)}, JSON.stringify({interrupted:run.interrupted,cleanup:run.processCleanup}))
`)
    cleanupConfirmed = false
    const run = await superviseProcess({ cmd: [process.execPath, script], cwd: root,
      env: { PATH: process.env.PATH ?? "" }, timeoutMs: 10_000 })
    cleanupConfirmed = run.processCleanup.status === "confirmed" && run.processCleanup.capture_complete
    expect(run.processCleanup.status).toBe("confirmed")
    const saved = await Bun.file(result).json()
    expect(saved.interrupted).toBe(true)
    expect(saved.cleanup.status).toBe("confirmed")
    expect(run.timedOut).toBe(false)
    expect(run.exitCode).toBe(0)
  } finally { if (cleanupConfirmed) await rm(root, { recursive: true, force: true }) }
}, 45_000)

test("supervisor streams repeated pipe exchanges and confirms process exit", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-stream-transport-"))
  const input = new TransformStream<Uint8Array, Uint8Array>()
  const output = new TransformStream<Uint8Array, Uint8Array>()
  const writer = input.writable.getWriter()
  const reader = output.readable.getReader()
  const abort = new AbortController()
  const pending = superviseProcess({
    cmd: [process.execPath, "-e", 'const {createInterface}=await import("node:readline");for await(const line of createInterface({input:process.stdin})){await Bun.sleep(50);process.stdout.write(line+"\\n")}'],
    cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: null,
    stdin: input.readable, stdout: output.writable, signal: abort.signal,
  })
  try {
    for (const line of ["first", "second", "third"]) {
      await writer.write(new TextEncoder().encode(line + "\n"))
      expect(new TextDecoder().decode((await reader.read()).value)).toBe(line + "\n")
    }
    await writer.close()
    expect((await reader.read()).done).toBe(true)
    const run = await pending
    expect(run.stdout).toBe("")
    expect(run.exitCode).toBe(0)
    expect(run.timedOut).toBe(false)
    expect(run.processCleanup).toMatchObject({ status: "confirmed", error: null, capture_complete: true, observation_mode: "continuous" })
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
  } finally { abort.abort(); await reader.cancel(); await pending; await rm(root, { recursive: true, force: true }) }
}, 10_000)

test("supervisor retains the live launcher until the terminated CLI exit receipt is observed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-exit-receipt-"))
  try {
    const run = await superviseProcess({
      cmd: [process.execPath, "-e", "process.on('SIGINT', () => {}); console.log('ready'); await Bun.sleep(120_000)"],
      cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 2_000,
    })
    expect(run.stdout).toContain("ready")
    expect(run.timedOut).toBe(true)
    expect(run.exitCode).toBe(143)
    expect(run.processCleanup).toMatchObject({ status: "confirmed", error: null, capture_complete: true })
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
  } finally { await rm(root, { recursive: true, force: true }) }
}, 45_000)

test("supervisor bounds a stalled pipe consumer after its owned process exits", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-stream-stalled-"))
  const blocked = Promise.withResolvers<void>()
  const pending = superviseProcess({
    cmd: [process.execPath, "-e", 'process.stdout.write("ready\\n"); await Bun.sleep(50)'],
    cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 1_000,
    stdout: new WritableStream<Uint8Array>({ write() { return blocked.promise } }),
  })
  try {
    const settled = await Promise.race([pending.then(() => true), Bun.sleep(2_500).then(() => false)])
    blocked.resolve()
    const run = await pending
    expect(settled).toBe(true)
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup).toMatchObject({ status: "failed", capture_complete: false, error: "Output transport deadline exceeded" })
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
  } finally { blocked.resolve(); await pending; await rm(root, { recursive: true, force: true }) }
}, 5_000)

test("trusted unit: native commands cannot request observation after exit", async () => {
  await expect(superviseProcess({ cmd: [process.execPath, "-e", "process.exit(0)"], cwd: evalsRoot,
    env: { PATH: process.env.PATH ?? "" }, timeoutMs: 1000, observationMode: "unit_after_exit" })).rejects.toThrow("Trusted unit observation requires")
  await expect(superviseProcess({ cmd: ["/installed/bin/loginom-ai-agent-cli", "run", "--model", "openai/gpt-6-sol"], cwd: evalsRoot,
    profileDir: "/private/eval-profile", sandbox: ["bwrap"], env: {}, timeoutMs: 1000,
    observationMode: "unit_after_exit" })).rejects.toThrow("Trusted unit observation requires")
  for (const boundary of [{ profileDir: "/private/eval-profile" }, { sandbox: ["bwrap"] }])
    await expect(superviseProcess({ cmd: [process.execPath, "test"], cwd: evalsRoot,
      env: {}, timeoutMs: 1000, observationMode: "unit_after_exit", ...boundary })).rejects.toThrow("Trusted unit observation requires")
})

for (const stop of ["timeout", "interrupt"] as const) test(`trusted unit: ${stop} drains an owned detached fixture with confirmed final proof`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), `evals-trusted-${stop}-`))
  const cwd = path.join(root, "evals")
  await mkdir(cwd)
  const pidFile = path.join(root, "owned.pid")
  await Bun.write(path.join(cwd, "waiting.test.ts"), `
    import {test} from 'bun:test';
    import {spawn} from 'node:child_process';
    test('waiting owned fixture',async()=>{
      const child=spawn(process.execPath,['-e',${JSON.stringify(`setTimeout(()=>process.exit(0),3_000);await Bun.write(${JSON.stringify(pidFile)},String(process.pid));`)}],{detached:true,stdio:'ignore'});
      while(!await Bun.file(${JSON.stringify(pidFile)}).exists())await Bun.sleep(5);
      await Bun.sleep(3_000);
    },5_000);
  `)
  const signal = new AbortController()
  const pending = superviseProcess({ cmd: [process.execPath, "test"], cwd, env: { PATH: process.env.PATH ?? "" },
    timeoutMs: stop === "timeout" ? 500 : 5_000, signal: signal.signal, observationMode: "unit_after_exit" })
  try {
    if (stop === "interrupt") {
      const readyDeadline = Date.now() + 2_000
      while (!await Bun.file(pidFile).exists() && Date.now() < readyDeadline) await Bun.sleep(5)
      expect(await Bun.file(pidFile).exists()).toBe(true)
      await Bun.sleep(100)
      signal.abort()
    }
    const run = await pending
    const pid = Number(await Bun.file(pidFile).text())
    expect(run.timedOut).toBe(stop === "timeout")
    expect(run.interrupted).toBe(stop === "interrupt")
    expect(run.exitCode).not.toBe(0)
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.capture_complete).toBe(true)
    expect(run.processCleanup.processes.some(process => process.pid === pid)).toBe(true)
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
    const remaining = await readFile(`/proc/${pid}/stat`, "utf8").catch(error => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
      throw error
    })
    expect(remaining === "" || remaining.split(") ")[1]!.split(" ")[0] === "Z").toBe(true)
  } finally { signal.abort(); await pending; await rm(root, { recursive: true, force: true }) }
}, 10_000)

test("trusted unit: protected fixture ends before unit exit and final drain confirms cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-trusted-unit-"))
  const cwd = path.join(root, "evals")
  await mkdir(cwd)
  await Bun.write(path.join(cwd, "protected.test.ts"), `
    import {test,expect} from 'bun:test';
    import {spawn} from 'node:child_process';
    test('owned protected fixture',async()=>{
      const child=spawn(process.execPath,['-e',${JSON.stringify("const {dlopen}=await import('bun:ffi');const library=dlopen('libc.so.6',{prctl:{args:['i32','u64','u64','u64','u64'],returns:'i32'}});if(library.symbols.prctl(4,0,0,0,0)!==0)process.exit(2);setTimeout(()=>process.exit(0),200);")}],{stdio:'ignore'});
      expect(await new Promise(resolve=>child.once('exit',resolve))).toBe(0);
    });
  `)
  try {
    const run = await superviseProcess({ cmd: [process.execPath, "test"], cwd, env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5_000, observationMode: "unit_after_exit" })
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup.observation_mode).toBe("unit_after_exit")
    expect(run.processCleanup.capture_complete).toBe(true)
    expect(run.processCleanup.status).toBe("confirmed")
    expect(run.processCleanup.verification?.map(pass => pass.owned_remaining)).toEqual([0, 0])
  } finally { await rm(root, { recursive: true, force: true }) }
}, 10_000)

test("trusted unit: protected leftover fails strict drain and is never signaled as unknown", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-trusted-leftover-"))
  const cwd = path.join(root, "evals")
  await mkdir(cwd)
  const pidFile = path.join(root, "owned.pid")
  await Bun.write(path.join(cwd, "protected.test.ts"), `
    import {test,expect} from 'bun:test';
    import {spawn} from 'node:child_process';
    test('owned protected leftover',async()=>{
      const child=spawn(process.execPath,['-e',${JSON.stringify(`const {dlopen}=await import('bun:ffi');const library=dlopen('libc.so.6',{prctl:{args:['i32','u64','u64','u64','u64'],returns:'i32'}});if(library.symbols.prctl(4,0,0,0,0)!==0)process.exit(2);await Bun.write(${JSON.stringify(pidFile)},String(process.pid));setTimeout(()=>process.exit(0),3_000);`)}],{detached:true,stdio:'ignore'});
      child.unref();
      while(!await Bun.file(${JSON.stringify(pidFile)}).exists())await Bun.sleep(5);
      expect(child.exitCode).toBeNull();
    });
  `)
  try {
    const run = await superviseProcess({ cmd: [process.execPath, "test"], cwd, env: { PATH: process.env.PATH ?? "" },
      timeoutMs: 5_000, observationMode: "unit_after_exit" })
    expect(run.exitCode).toBe(0)
    expect(run.processCleanup.observation_mode).toBe("unit_after_exit")
    expect(run.processCleanup.status).toBe("failed")
    expect(run.processCleanup.error).toContain("Cannot inspect process identity")
    const pid = Number(await Bun.file(pidFile).text())
    expect((await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")[0]).not.toBe("Z")
    process.kill(pid, 0)
    // The fixture expires itself; its unreadable identity never authorizes a kill.
    await Bun.sleep(3_100)
  } finally { await rm(root, { recursive: true, force: true }) }
}, 10_000)

test("signalProcess: краткий запрет чтения собственного /proc пережидается без ослабления identity", async () => {
  const child = spawn(process.execPath, ["-e", `
    const {dlopen}=await import('bun:ffi');
    const library=dlopen('libc.so.6',{prctl:{args:['i32','u64','u64','u64','u64'],returns:'i32'}});
    process.on('SIGUSR1',()=>{
      if(library.symbols.prctl(4,0,0,0,0)!==0)process.exit(2);
      process.stdout.write('closed\\n');
      setTimeout(()=>{library.symbols.prctl(4,1,0,0,0);},30);
    });
    setInterval(()=>{},1000);process.stdout.write('ready\\n');
  `], { detached: true, stdio: ["ignore", "pipe", "ignore"] })
  const exited = new Promise(resolve => child.once("exit", resolve))
  try {
    await new Promise<void>(resolve => child.stdout!.on("data", data => { if (data.toString().includes("ready")) resolve() }))
    const pid = child.pid!
    const fields = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")
    const info = await stat(`/proc/${pid}/exe`)
    const identity: ProcessIdentity = { pid, starttime: fields[19]!, uid: process.getuid!(), parent: Number(fields[1]),
      group: Number(fields[2]), session: Number(fields[3]), device: info.dev, inode: info.ino, executable: await readlink(`/proc/${pid}/exe`) }
    const closed = new Promise<void>(resolve => child.stdout!.on("data", data => { if (data.toString().includes("closed")) resolve() }))
    child.kill("SIGUSR1")
    await closed
    expect(await signalProcess(identity, "SIGTERM")).toBe(true)
    await exited
  } finally { child.kill("SIGKILL"); await exited }
}, 5_000)

test("signalProcess: постоянный запрет чтения собственного /proc остаётся отказом и не посылает сигнал", async () => {
  const child = spawn(process.execPath, ["-e", `
    const {dlopen}=await import('bun:ffi');
    const library=dlopen('libc.so.6',{prctl:{args:['i32','u64','u64','u64','u64'],returns:'i32'}});
    process.on('SIGUSR1',()=>{
      if(library.symbols.prctl(4,0,0,0,0)!==0)process.exit(2);
      process.stdout.write('closed\\n');
    });
    setInterval(()=>{},1000);process.stdout.write('ready\\n');
  `], { detached: true, stdio: ["ignore", "pipe", "ignore"] })
  const exited = new Promise(resolve => child.once("exit", resolve))
  try {
    await new Promise<void>(resolve => child.stdout!.on("data", data => { if (data.toString().includes("ready")) resolve() }))
    const pid = child.pid!
    const fields = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")
    const info = await stat(`/proc/${pid}/exe`)
    const identity: ProcessIdentity = { pid, starttime: fields[19]!, uid: process.getuid!(), parent: Number(fields[1]),
      group: Number(fields[2]), session: Number(fields[3]), device: info.dev, inode: info.ino, executable: await readlink(`/proc/${pid}/exe`) }
    const closed = new Promise<void>(resolve => child.stdout!.on("data", data => { if (data.toString().includes("closed")) resolve() }))
    child.kill("SIGUSR1")
    await closed
    await expect(signalProcess(identity, "SIGTERM")).rejects.toThrow(/Cannot inspect process identity PID \d+: (EACCES|EPERM)/)
    expect(child.exitCode).toBeNull()
    process.kill(pid, 0)
  } finally { child.kill("SIGKILL"); await exited }
}, 5_000)

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

test("a refused child of a proven peer quarantines its owner without blocking A cleanup", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-peer-refused-child-"))
  const bundle = path.join(root, "bundle"), a = path.join(root, "a"), b = path.join(root, "b")
  await Promise.all([mkdir(bundle), mkdir(a), mkdir(b)])
  await cp(Bun.which("node")!, path.join(bundle, "chrome"), { dereference: true })
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const script = path.join(root, "browser.mjs"), trigger = path.join(root, "trigger"), pidFile = path.join(root, "bad.pid")
  await Bun.write(script, `import {spawn} from "node:child_process";import {access,writeFile} from "node:fs/promises";
setInterval(()=>{},1000);
if(process.argv.some(arg=>arg.startsWith(${JSON.stringify("--user-data-dir=" + b + path.sep)}))){
  while(!await access(${JSON.stringify(trigger)}).then(()=>true,()=>false)) await new Promise(resolve=>setTimeout(resolve,10));
  const child=spawn(process.execPath,[${JSON.stringify(script)},"--type=helper",${JSON.stringify("--user-data-dir=" + path.join(root, "outside"))}],{stdio:"ignore",env:process.env});
  await writeFile(${JSON.stringify(pidFile)},String(child.pid));
}`)
  const abort = new AbortController()
  const commandA = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: a })
  const commandB = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: b })
  const pendingA = runAgent({ command: { ...commandA, env: { ...commandA.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
    EVAL_FAKE_BROWSER_PID_FILE: path.join(a, "browser.pid"), EVAL_FAKE_BROWSER_SCRIPT: script, EVAL_FAKE_EXIT_DELAY_MS: "1500" } },
    taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: a, outDir: a, profileDir: a, timeoutMs: 30_000 })
  const pendingB = runAgent({ command: { ...commandB, env: { ...commandB.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
    EVAL_FAKE_BROWSER_PID_FILE: path.join(b, "browser.pid"), EVAL_FAKE_BROWSER_SCRIPT: script, EVAL_FAKE_EXIT_DELAY_MS: "20000" } },
    taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: b, outDir: b, profileDir: b, timeoutMs: 30_000, signal: abort.signal })
  let child: ProcessIdentity | undefined
  let settled = false
  try {
    const deadline = Date.now() + 5000
    while (!await Bun.file(path.join(a, "browser.pid")).exists() || !await Bun.file(path.join(b, "browser.pid")).exists()) {
      if (Date.now() > deadline) throw Error("Peer browsers did not start")
      await Bun.sleep(10)
    }
    await Bun.write(trigger, "create refused peer child")
    while (!await Bun.file(pidFile).exists()) {
      if (Date.now() > deadline) throw Error("Refused child did not start")
      await Bun.sleep(10)
    }
    const pid = Number(await Bun.file(pidFile).text())
    const fields = (await readFile(`/proc/${pid}/stat`, "utf8")).split(") ").at(-1)!.split(" ")
    const executable = await stat(`/proc/${pid}/exe`)
    child = { pid, starttime: fields[19]!, uid: (await stat(`/proc/${pid}`)).uid, parent: Number(fields[1]), group: Number(fields[2]), session: Number(fields[3]),
      executable: await readlink(`/proc/${pid}/exe`), device: executable.dev, inode: executable.ino }
    const finishedA = await pendingA
    expect(finishedA.processCleanup).toMatchObject({ status: "confirmed", error: null, unknownProcesses: [] })
    expect(finishedA.processCleanup.processes.some(process => process.pid === pid)).toBe(false)
    expect((await readFile(`/proc/${pid}/stat`, "utf8")).split(") ").at(-1)!.split(" ")[19]).toBe(child.starttime)
    await signalProcess(child, "SIGKILL")
    abort.abort()
    const finishedB = await pendingB
    expect(finishedB.processCleanup.status).toBe("failed")
    expect(finishedB.processCleanup.error).toContain("Browser binding differs")
    settled = finishedA.processCleanup.capture_complete && finishedB.processCleanup.capture_complete &&
      finishedB.processCleanup.verification?.every(pass => pass.owned_remaining === 0) === true
  } finally {
    try { if (child) await signalProcess(child, "SIGKILL") }
    finally {
      abort.abort()
      await Promise.all([pendingA, pendingB])
      if (settled) await rm(root, { recursive: true, force: true })
    }
  }
}, 40_000)

for (const delay of [0, 2800]) test(`parallel supervisors preserve a sibling's reparented browser heartbeat (helper delay ${delay})`, async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-parallel-browser-"))
  const bundle = path.join(root, "bundle")
  const a = path.join(root, "a"), b = path.join(root, "b")
  await Promise.all([mkdir(bundle), mkdir(a), mkdir(b)])
  await cp(Bun.which("node")!, path.join(bundle, "chrome"), { dereference: true })
  const script = path.join(root, "browser.mjs")
  await cp(path.join(evalsRoot, "fixtures/fake-browser.ts"), script)
  await Bun.write(path.join(bundle, "resource-manifest.json"), JSON.stringify({ browser: "chrome" }))
  const abort = new AbortController()
  const commandA = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: a })
  const pendingA = runAgent({ command: { ...commandA, env: { ...commandA.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
    EVAL_FAKE_BROWSER_PID_FILE: path.join(a, "browser.pid"), EVAL_FAKE_BROWSER_SCRIPT: script, EVAL_FAKE_EXIT_DELAY_MS: "1500",
    EVAL_FAKE_EXIT_MARKER: path.join(a, "exit-marker.json") } },
    taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: a, outDir: a, profileDir: a, timeoutMs: 30_000 })
  for (let wait = 0; wait < 200 && !await Bun.file(path.join(a, "browser.pid")).exists(); wait++) await Bun.sleep(10)
  await Bun.sleep(250)
  const commandB = agentCommand({ ...loadConfig(["--dry-run"], {}), profileDir: b })
  const heartbeat = path.join(b, "heartbeat")
  const pendingB = runAgent({ command: { ...commandB, env: { ...commandB.env, EVAL_FAKE_BROWSER_BUNDLE: bundle,
    EVAL_FAKE_BROWSER_PID_FILE: path.join(b, "browser.pid"), EVAL_FAKE_BROWSER_HELPER_PID_FILE: path.join(b, "helper.pid"),
    EVAL_FAKE_BROWSER_SCRIPT: script, EVAL_FAKE_BROWSER_CLEAR_TITLE: "1", EVAL_FAKE_BROWSER_HEARTBEAT: heartbeat,
    EVAL_FAKE_BROWSER_HELPER_DELAY_MS: String(delay), EVAL_FAKE_EXIT_DELAY_MS: "20000" } },
    taskId: "default", model: "fake/model", prompt: "test", files: [], workdir: b, outDir: b, profileDir: b,
    timeoutMs: 30_000, signal: abort.signal })
  try {
    for (let wait = 0; wait < 500 && !await Bun.file(heartbeat).exists(); wait++) await Bun.sleep(10)
    const before = await Bun.file(heartbeat).text()
    const helper = Number(await Bun.file(path.join(b, "helper.pid")).text())
    const birth = (await readFile(`/proc/${helper}/stat`, "utf8")).split(") ")[1]!.split(" ")[19]
    const finishedA = await pendingA
    if (delay) {
      const ended = await Bun.file(path.join(a, "exit-marker.json")).json()
      const created = (await stat(path.join(b, "helper.pid"))).mtimeMs
      expect(created).toBeGreaterThan(ended.at)
      expect(created).toBeLessThan(Date.parse(finishedA.processCleanup.verification![0]!.observed_at))
    }
    expect(finishedA.processCleanup).toMatchObject({ status: "confirmed", error: null, unknownProcesses: [] })
    expect(finishedA.processCleanup.processes.some(entry => entry.pid === helper)).toBe(false)
    expect(await Bun.file(heartbeat).text()).not.toBe(before)
    const current = (await readFile(`/proc/${helper}/stat`, "utf8")).split(") ")[1]!.split(" ")
    expect(current[19]).toBe(birth)
    expect(["Z", "X"]).not.toContain(current[0])
    expect((await readFile(`/proc/${helper}/cmdline`, "utf8")).replaceAll("\0", "")).toBe("")
    expect(finishedA.processCleanup.peerProcesses?.find(entry => entry.process.pid === helper)).toMatchObject({
      process: { starttime: birth }, owner: { kind: "slot", id: b } })
    abort.abort()
    const finishedB = await pendingB
    expect(finishedB.processCleanup).toMatchObject({ status: "confirmed", error: null, unknownProcesses: [] })
    expect(finishedB.processCleanup.processes.find(entry => entry.pid === helper)?.starttime).toBe(birth)
    expect(finishedB.processCleanup.origins?.find(entry => entry.pid === helper)?.via).toBe("subreaper")
    await rm(root, { recursive: true })
  } finally { abort.abort(); await Promise.all([pendingA, pendingB]) }
}, 40_000)

test("parallel observation evidence records delayed starts separately from scan duration", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-observation-delay-"))
  const ready = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
  const runs = ready.map(signal => superviseProcess({ cmd: [process.execPath, "-e", "console.log('ready'); await Bun.sleep(1000)"],
    cwd: root, env: { PATH: process.env.PATH ?? "" }, timeoutMs: 3_000,
    stdout: new WritableStream<Uint8Array>({ write(chunk) { if (new TextDecoder().decode(chunk).includes("ready")) signal.resolve() } }) }))
  try {
    await Promise.all(ready.map(signal => signal.promise))
    await Bun.sleep(150)
    const until = performance.now() + 400
    // Stall the real controller event loop while both native children are live.
    while (performance.now() < until) {}
    for (const run of await Promise.all(runs)) {
      expect(run.processCleanup.status).toBe("confirmed")
      expect(run.processCleanup.observations?.max_start_delay_ms).toBeGreaterThanOrEqual(100)
      expect(run.processCleanup.observations?.max_gap_ms).toBeGreaterThanOrEqual(300)
    }
  } finally { await Promise.all(runs); await rm(root, { recursive: true }) }
}, 10_000)

test("parallel registry does not publish a fresh peer claim for an unreadable live process", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-peer-unreadable-"))
  const a = path.join(root, "a"), b = path.join(root, "b")
  await Promise.all([mkdir(a), mkdir(b)])
  const heartbeat = path.join(b, "heartbeat")
  const ready = Promise.withResolvers<number>()
  const pendingA = superviseProcess({ cmd: [process.execPath, "-e", "await Bun.sleep(1200)"], cwd: a,
    env: { PATH: process.env.PATH ?? "" }, outDir: a, timeoutMs: 5_000, owner: { kind: "slot", id: "a" } })
  const pendingB = superviseProcess({ cmd: [process.execPath, "-e", `
    const {dlopen}=await import('bun:ffi');
    const library=dlopen('libc.so.6',{prctl:{args:['i32','u64','u64','u64','u64'],returns:'i32'}});
    await Bun.write(${JSON.stringify(heartbeat)},String(Date.now()));
    const timer=setInterval(()=>{void Bun.write(${JSON.stringify(heartbeat)},String(Date.now()))},50);
    await Bun.sleep(500);
    if(library.symbols.prctl(4,0,0,0,0)!==0)process.exit(2);
    console.log(process.pid);
    await Bun.sleep(2500);
    clearInterval(timer);
  `], cwd: b, env: { PATH: process.env.PATH ?? "" }, outDir: b, timeoutMs: 5_000, owner: { kind: "slot", id: "b" },
    stdout: new WritableStream<Uint8Array>({ write(chunk) { ready.resolve(Number(new TextDecoder().decode(chunk).trim())) } }) })
  try {
    const pid = await Promise.race([ready.promise, pendingB.then(() => { throw Error("Protected peer ended before readiness") })])
    const before = await Bun.file(heartbeat).text()
    const run = await pendingA
    expect(run.processCleanup.status).toBe("failed")
    expect(run.processCleanup.error).toContain("Cannot inspect process identity")
    expect(run.processCleanup.peerProcesses?.some(entry => entry.process.pid === pid)).toBe(false)
    expect(run.processCleanup.processes.some(entry => entry.pid === pid)).toBe(false)
    expect(await Bun.file(heartbeat).text()).not.toBe(before)
    expect((await readFile(`/proc/${pid}/stat`, "utf8")).split(") ")[1]!.split(" ")[0]).not.toBe("Z")
    const finishedB = await pendingB
    expect(finishedB.exitCode).toBe(0)
    expect(finishedB.processCleanup.status).toBe("failed")
  } finally { await Promise.all([pendingA, pendingB]); await rm(root, { recursive: true }) }
}, 10_000)

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


test("supervisor: unmanaged Chromium with an outside profile stays unknown and alive", async () => {
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
    expect(run.processCleanup.status).toBe("failed")
    expect(run.processCleanup.error).toContain("Unexplained browser/helper")
    expect(run.processCleanup.unknownProcesses?.some(entry => entry.pid === foreign.pid)).toBe(true)
    expect(run.processCleanup.processes.some(entry => entry.pid === foreign.pid)).toBe(false)
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
