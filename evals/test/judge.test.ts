import { expect, test } from "bun:test"
import path from "node:path"
import { chmod, cp, mkdir, mkdtemp, readFile, rm, stat } from "node:fs/promises"
import os from "node:os"
import { fetchArtifact, parseArtifactSource } from "../src/artifact"
import { evalsRoot, loadConfig } from "../src/config"
import { EvalFailure } from "../src/fail"
import { createJudgeGate, judgeCommand, judgedFields, judgeInfo, judgeTask, prepareJudgeDir, scoreVerdict, type JudgeSettings, type Verdict } from "../src/judge"
import { aggregate } from "../src/report"
import { loadTasks } from "../src/task"
import { analyzeComparison, parseComparisonSummary } from "../src/compare-analysis"
import { comparisonSummary } from "./helpers/compare-summary"
import { probeJudgeEnvironment } from "./helpers/judge-probe"
import { writeLeaseReceipt } from "../src/lease"
import type { AttemptResult } from "../src/report"
import { supervisedProcesses, type ProcessCleanup, type ProcessIdentity } from "../src/process-supervisor"

const checklist = [
  { id: "a", text: "A", weight: 1, requiresResultFile: false, requiresRun: false, required: false },
  { id: "b", text: "B", weight: 1, requiresResultFile: false, requiresRun: false, required: false },
  { id: "c", text: "C", weight: 2, requiresResultFile: true, requiresRun: false, required: false },
]
const verdict = (passed: Record<string, boolean>): Verdict => ({
  checklist: Object.entries(passed).map(([id, ok]) => ({ id, passed: ok, evidence: "e" })),
  summary: "s",
  confidence: "high",
})

test("scoreVerdict: взвешенная сумма и порог", () => {
  const scored = scoreVerdict(checklist, verdict({ a: true, b: true, c: false }), 70)
  expect(scored).toMatchObject({ ok: true, score: 50, pass: false })
  expect(scoreVerdict(checklist, verdict({ a: true, b: false, c: true }), 70)).toMatchObject({ ok: true, score: 75, pass: true })
})

test("scoreVerdict: неверный результат экспорта не проходит даже при балле выше порога", async () => {
  const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
  const answers = Object.fromEntries(task!.checklist.map((item) => [item.id, !item.requiresResultFile]))
  expect(scoreVerdict(task!.checklist, verdict(answers), 70)).toMatchObject({ ok: true, score: 86, pass: false })
})

test("scoreVerdict: необязательные пункты не блокируют pass, если смысловые требования выполнены", async () => {
  const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
  const answers = Object.fromEntries(task!.checklist.map((item) => [item.id, !["no-extra-nodes", "honest-report"].includes(item.id)]))
  expect(scoreVerdict(task!.checklist, verdict(answers), 70)).toMatchObject({ ok: true, score: 71, pass: true })
})

test("scoreVerdict: пропуск, лишний или дублирующийся id — ошибка", () => {
  expect(scoreVerdict(checklist, verdict({ a: true, b: true }), 70)).toMatchObject({ ok: false })
  expect(scoreVerdict(checklist, verdict({ a: true, b: true, c: true, d: true }), 70)).toMatchObject({ ok: false })
  const duplicated = verdict({ a: true, b: true, c: true })
  duplicated.checklist.push({ id: "a", passed: false, evidence: "dup" })
  expect(scoreVerdict(checklist, duplicated, 70)).toMatchObject({ ok: false })
})

test("scoreVerdict: пустой чеклист — ошибка", () => {
  expect(scoreVerdict([], { checklist: [], summary: "s", confidence: "high" }, 70)).toMatchObject({ ok: false })
})

const fakeJudge = `bun ${path.join(evalsRoot, "fixtures", "fake-codex.ts")}`

test("judgeCommand: флаги codex exec и абсолютные пути", () => {
  const cmd = judgeCommand({ command: ["codex"], dir: "/tmp/j", model: "gpt-6-astra", reasoning: "high" })
  expect(cmd.slice(0, 2)).toEqual(["codex", "exec"])
  for (const flag of ["--ephemeral", "--ignore-user-config", "--skip-git-repo-check", "--json"]) expect(cmd).toContain(flag)
  expect(cmd.join(" ")).toContain("-s read-only -C /tmp/j -m gpt-6-astra -c model_reasoning_effort=high -c project_doc_max_bytes=0")
  expect(cmd.join(" ")).toContain("--output-schema /tmp/j/verdict.schema.json -o /tmp/j/verdict.json -")
})

test("judgeCommand disables hidden HTTP and stream retries for its selected provider", () => {
  const cmd = judgeCommand({ command: ["codex"], dir: "/judge", model: "gpt-6-sol", reasoning: "xhigh" })
  const config = cmd.flatMap((arg, index) => arg === "-c" ? [cmd[index + 1]] : [])
  expect(config).toContain("model_provider=evals-openai")
  expect(config).toContain("model_providers.evals-openai.requires_openai_auth=true")
  expect(config).toContain("model_providers.evals-openai.request_max_retries=0")
  expect(config).toContain("model_providers.evals-openai.stream_max_retries=0")
})

test("judgeInfo: версия судьи и sha256 промпта", async () => {
  const info = await judgeInfo(loadConfig(["--judge-only", "x"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge }))
  expect(info).toMatchObject({ backend: "codex", codex_version: "fake-codex 0.0.0", model: "fake", reasoning: "high" })
  expect(info.prompt_sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(info.schema_sha256).toMatch(/^[0-9a-f]{64}$/)
})

test("judgeInfo: version probe drains its child before returning metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-version-child-"))
  const pidFile = path.join(root, "child.pid")
  const pending = judgeInfo(loadConfig(["--judge-only", "x"], { JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `${fakeJudge} --child-pid-file ${pidFile}` }))
  const state = async () => {
    if (!await Bun.file(pidFile).exists()) return undefined
    const raw = await readFile(`/proc/${(await Bun.file(pidFile).text()).trim()}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return raw ? raw.slice(raw.lastIndexOf(")") + 2).split(" ") : undefined
  }
  try {
    for (let wait = 0; wait < 500 && !await Bun.file(pidFile).exists(); wait++) await Bun.sleep(10)
    const birth = (await state())![19]
    expect((await pending).codex_version).toBe("fake-codex 0.0.0")
    const current = await state()
    expect(!current || current[19] !== birth || ["Z", "X"].includes(current[0]!)).toBe(true)
  } finally {
    await pending
    // The unqualified version path leaves this self-expiring fixture alive; never signal by PID alone.
    for (let wait = 0; wait < 1200; wait++) {
      const current = await state()
      if (!current || ["Z", "X"].includes(current[0]!)) break
      await Bun.sleep(10)
    }
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)

test("judgeInfo: abort during a version probe drains its child and refuses metadata", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-version-abort-"))
  const pidFile = path.join(root, "child.pid")
  const abort = new AbortController()
  const pending = judgeInfo(loadConfig(["--judge-only", "x"], { JUDGE_MODEL: "fake",
    EVAL_JUDGE_COMMAND: `${fakeJudge} --child-pid-file ${pidFile}` }), abort.signal)
  const state = async () => {
    if (!await Bun.file(pidFile).exists()) return undefined
    const raw = await readFile(`/proc/${(await Bun.file(pidFile).text()).trim()}/stat`, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return raw ? raw.slice(raw.lastIndexOf(")") + 2).split(" ") : undefined
  }
  try {
    for (let wait = 0; wait < 500 && !await Bun.file(pidFile).exists(); wait++) await Bun.sleep(10)
    expect(await Bun.file(pidFile).exists()).toBe(true)
    const birth = (await state())![19]
    abort.abort()
    await expect(pending).rejects.toThrow("JUDGE_VERSION_UNCONFIRMED")
    const current = await state()
    expect(!current || current[19] !== birth || ["Z", "X"].includes(current[0]!)).toBe(true)
  } finally {
    abort.abort()
    await pending.catch(() => {})
    for (let wait = 0; wait < 1200; wait++) {
      const current = await state()
      if (!current || ["Z", "X"].includes(current[0]!)) break
      await Bun.sleep(10)
    }
    await rm(root, { recursive: true, force: true })
  }
}, 20_000)

test("judgeInfo: --version не наследует секреты harness и сохраняет обычное окружение", async () => {
  const probe = await probeJudgeEnvironment("info")
  expect(probe.version).toBe("fake-codex 0.0.0")
  expect(probe.environment).toEqual({
    LOGINOM_SECRET_PROBE: null,
    EVAL_SECRET_PROBE: null,
    JUDGE_SECRET_PROBE: null,
    FAKE_CODEX_SECRET_PROBE: null,
    PATH: "/judge-probe-preserved-path",
    PROBE_ALLOWED_ENV: "ordinary-value",
  })
})

test("judgeInfo: --version применяет явный judge.env после фильтрации", async () => {
  const env = {
    LOGINOM_SECRET_PROBE: "explicit-judge-value",
    EVAL_SECRET_PROBE: "explicit-judge-value",
    JUDGE_SECRET_PROBE: "explicit-judge-value",
    FAKE_CODEX_SECRET_PROBE: "explicit-judge-value",
    PATH: "/judge-probe-overridden-path",
    PROBE_ALLOWED_ENV: "overridden-value",
  }
  const probe = await probeJudgeEnvironment("info", env)
  expect(probe.version).toBe("fake-codex 0.0.0")
  expect(probe.environment).toEqual(env)
})

const fixtureArtifact = async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-artifact-"))
  const artifact = await fetchArtifact({
    source: parseArtifactSource(`dir:${path.join(evalsRoot, "fixtures", "storage")}`, { container: "c", storageDir: "/s" }),
    username: "user",
    receipts: ["/user/fixture-group-sum-qty.lgp"],
    instructed: "x.lgp",
    resultPrefix: "fixture-group-sum-qty",
    since: Date.now(),
    outDir,
  })
  return artifact!
}

test("prepareJudgeDir: все материалы, эталон распакован, заглушки без run", async () => {
  const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
  const artifact = await fixtureArtifact()
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-"))
  await prepareJudgeDir({ task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "промпт", dir, checklist: task!.checklist })
  for (const file of ["PROMPT.md", "TASK.md", "SPEC.md", "checklist.json", "expected-output.md", "agent-final-message.md", "tools-summary.md", "node-readbacks.md", "verdict.schema.json"])
    expect(await Bun.file(path.join(dir, file)).exists()).toBe(true)
  expect((await Array.fromAsync(new Bun.Glob("Unit_*/Unit.xml").scan(path.join(dir, "reference")))).length).toBeGreaterThan(0)
  expect((await Array.fromAsync(new Bun.Glob("unpacked/Unit_*/Unit.xml").scan(path.join(dir, "artifact")))).length).toBeGreaterThan(0)
  expect(await Bun.file(path.join(dir, "artifact", "results", "fixture-group-sum-qty.result.csv")).exists()).toBe(true)
  expect(await Bun.file(path.join(dir, "agent-final-message.md")).text()).toBe("недоступно: калибровка")
  expect(await Bun.file(path.join(dir, "TASK.md")).text()).toBe("промпт")
  const checklist = await Bun.file(path.join(dir, "checklist.json")).json()
  expect(checklist[0]).toEqual({ id: "import-csv", text: task!.checklist[0]!.text })
})

const settings = (env: Record<string, string> = {}): JudgeSettings => ({
  command: ["bun", path.join(evalsRoot, "fixtures", "fake-codex.ts")],
  model: "fake",
  reasoning: "high",
  timeoutMs: 30_000,
  passThreshold: 70,
  env,
})

async function gateFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "evals-judge-gate-"))
  const artifact = await fixtureArtifact()
  const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
  const trace = path.join(root, "intervals.jsonl")
  const records = async () => await Bun.file(trace).exists()
    ? (await Bun.file(trace).text()).trim().split("\n").map(line => JSON.parse(line) as { kind: "start" | "end"; pid: number; dir: string; at: string }) : []
  return {
    root, records,
    input(id: string, env: Record<string, string> = {}, signal?: AbortSignal) {
      return { task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "p", outDir: path.join(root, id, "judge"),
        judge: settings({ FAKE_CODEX_GATE_LOG: trace, FAKE_CODEX_DELAY_MS: "200", ...env }), signal }
    },
    async started(id: string) {
      const deadline = Date.now() + 5_000
      while (Date.now() < deadline) {
        const row = (await records()).find(row => row.kind === "start" && row.dir === path.join(root, id, "judge"))
        if (row) return row
        await Bun.sleep(5)
      }
      throw Error("fake-codex did not start")
    },
    async close() { await rm(root, { recursive: true, force: true }); await rm(path.dirname(artifact.unpackedDir), { recursive: true, force: true }) },
  }
}

test("judgeTask resumes only the remaining invoke and persists its absolute budget before starting", async () => {
  const fixture = await gateFixture()
  const file = path.join(fixture.root, "result.json")
  try {
    await writeLeaseReceipt(file, { judge_attempts: 1 })
    const input = fixture.input("resumed", { FAKE_CODEX_EXIT: "9" })
    const result = await judgeTask({ ...input, judgeAttemptsUsed: 1, saveJudgeFields: async (fields: Partial<AttemptResult>) => {
      expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(0)
      await writeLeaseReceipt(file, { ...await Bun.file(file).json(), ...fields })
    } })
    expect(result).toMatchObject({ ok: false, attempts: 2 })
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(1)
    expect(await Bun.file(file).json()).toMatchObject({ judge_attempts: 2 })
    expect(await Bun.file(path.join(fixture.root, "resumed/judge-processes-2/process-cleanup.json")).exists()).toBe(true)
    const exhausted = await judgeTask({ ...input, judgeAttemptsUsed: 2 })
    expect(exhausted).toMatchObject({ ok: false, attempts: 2 })
    expect(exhausted.ok ? "" : exhausted.error).toContain("budget exhausted")
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(1)
  } finally { await fixture.close() }
})

test("judgeTask: supervisor drains the judge's child before returning a verdict", async () => {
  const fixture = await gateFixture()
  const pidFile = path.join(fixture.root, "judge-child.pid")
  const active = async () => {
    if (!await Bun.file(pidFile).exists()) return false
    const raw = await Bun.file(`/proc/${(await Bun.file(pidFile).text()).trim()}/stat`).text().catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return raw !== "" && !["Z", "X"].includes(raw.slice(raw.lastIndexOf(")") + 2).split(" ")[0]!)
  }
  try {
    const input = fixture.input("owned-child")
    const result = await judgeTask({ ...input, judge: { ...input.judge,
      command: [...input.judge.command, "--child-pid-file", pidFile] } })
    expect(result).toMatchObject({ ok: true, attempts: 1 })
    expect(await active()).toBe(false)
    const proof = await Bun.file(path.join(fixture.root, "owned-child/judge-processes-1/process-cleanup.json")).json()
    expect(proof.status).toBe("confirmed")
    const pid = Number(await Bun.file(pidFile).text())
    expect(proof.processes.some((entry: { pid: number }) => entry.pid === pid)).toBe(true)
  } finally {
    const deadline = Date.now() + 15_000
    while (await active()) {
      if (Date.now() > deadline) throw Error("Fixture child did not finish")
      await Bun.sleep(25)
    }
    await fixture.close()
  }
}, 20_000)

async function ordinaryExecFixture(lifetime = 1_200, late = false) {
  const fixture = await gateFixture()
  const file = (name: string) => path.join(fixture.root, name)
  const wait = async (check: () => Promise<unknown> | unknown, timeout = 5_000) => {
    const deadline = Date.now() + timeout
    while (!await check()) {
      if (Date.now() >= deadline) throw Error("Ordinary exec fixture did not settle")
      await Bun.sleep(10)
    }
  }
  if (late) await Bun.write(file("late-child.mjs"), `
    import { readFileSync, writeFileSync } from "node:fs";
    const root = ${JSON.stringify(fixture.root)};
    process.on("SIGTERM", () => {});
    writeFileSync(root + "/late-image", JSON.stringify({ pid: process.pid,
      starttime: readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ")[19] }));
    await Bun.sleep(3_000);
    writeFileSync(root + "/late-end", String(Date.now()));
  `)
  await Bun.write(file("after-exec.mjs"), `
    import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
    import { readlinkSync } from "node:fs";
    const root = ${JSON.stringify(fixture.root)};
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => appendFileSync(root + "/signals", signal + "\\n"));
    const fields = readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ");
    const exe = statSync("/proc/self/exe");
    writeFileSync(root + "/image", JSON.stringify({ pid: process.pid, starttime: fields[19], uid: process.getuid(),
      group: Number(fields[2]), session: Number(fields[3]), executable: readlinkSync("/proc/self/exe"), device: exe.dev, inode: exe.ino }));
    while (!await Bun.file(root + "/finish-cli").exists()) await Bun.sleep(10);
    if (${late}) {
      while (!await Bun.file(root + "/spawn-late").exists()) await Bun.sleep(10);
      Bun.spawn([process.execPath, root + "/late-child.mjs"], { stdin: "ignore", stdout: "ignore", stderr: "ignore" }).unref();
    }
    await Bun.sleep(${lifetime});
    writeFileSync(root + "/natural-end", String(Date.now()));
  `)
  await Bun.write(file("wrapper.mjs"), `
    import { spawn } from "node:child_process";
    const root = ${JSON.stringify(fixture.root)};
    spawn("/bin/bash", ["-c", 'printf "%s" "$$" > "$1/pid"; while [[ ! -f "$1/exec" ]]; do sleep 0.05; done; exec "$2" "$1/after-exec.mjs"', "fixture", root, process.execPath],
      { detached: true, stdio: "ignore" });
    while (!await Bun.file(root + "/finish-cli").exists()) await Bun.sleep(10);
    const fake = Bun.spawn([process.execPath, ${JSON.stringify(path.join(evalsRoot, "fixtures/fake-codex.ts"))}, ...Bun.argv.slice(2)],
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    process.exit(await fake.exited);
  `)
  const input = fixture.input("ordinary-exec")
  const pending = judgeTask({ ...input, judge: { ...input.judge, command: [process.execPath, file("wrapper.mjs")] } })
  const active = async (pid: number) => {
    const raw = await Bun.file(`/proc/${pid}/stat`).text().catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return raw !== "" && !["Z", "X"].includes(raw.split(") ")[1]!.split(" ")[0]!)
  }
  await wait(() => Bun.file(file("pid")).exists())
  const pid = Number(await Bun.file(file("pid")).text())
  const scope = () => supervisedProcesses().scopes.find(scope => scope.owner.id === input.outDir)
  await wait(() => scope()?.processes?.some(entry => entry.pid === pid))
  const before = scope()!.processes!.find(entry => entry.pid === pid)!
  const launcher = scope()!.launcher
  await Bun.write(file("exec"), "1")
  await wait(() => Bun.file(file("image")).exists())
  const after = await Bun.file(file("image")).json() as ProcessIdentity
  expect(after).toMatchObject({ pid: before.pid, starttime: before.starttime, uid: before.uid, group: before.group, session: before.session })
  expect([after.device, after.inode]).not.toEqual([before.device, before.inode])
  await wait(() => scope()?.status === "unavailable")
  return { ...fixture, file, wait, pending, pid, before, after, launcher, active,
    proof: async () => await Bun.file(path.join(fixture.root, "ordinary-exec/judge-processes-1/process-cleanup.json")).json() as ProcessCleanup,
    async close() {
      await Bun.write(file("finish-cli"), "1")
      await Bun.write(file("spawn-late"), "1")
      await pending
      await wait(async () => !await active(pid), 75_000)
      if (await Bun.file(file("late-image")).exists()) {
        const child = await Bun.file(file("late-image")).json() as { pid: number }
        await wait(async () => !await active(child.pid), 10_000)
      }
      await fixture.close()
    } }
}

test("ordinary exec: natural exit confirms judge verdict", async () => {
  const fixture = await ordinaryExecFixture()
  try {
    await Bun.write(fixture.file("finish-cli"), "1")
    expect(await fixture.pending).toMatchObject({ ok: true, attempts: 1 })
    const proof = await fixture.proof()
    expect(proof.status).toBe("confirmed")
    expect(await Bun.file(fixture.file("natural-end")).exists()).toBe(true)
    expect(await Bun.file(fixture.file("signals")).exists()).toBe(false)
    expect(await fixture.active(fixture.pid)).toBe(false)
    expect(proof.processes).toContainEqual(fixture.before)
    expect(proof.admissions).toContainEqual({ pid: fixture.pid, starttime: fixture.before.starttime, status: "refused" })
    expect(proof.verification?.every(pass => pass.owned_remaining === 0)).toBe(true)
    expect(proof.executableTransitions).toContainEqual({ original: fixture.before, current: expect.objectContaining(fixture.after), observed_at: expect.any(String) })
    expect(proof.pre_shutdown_verification).toHaveLength(2)
    expect(Date.parse(proof.pre_shutdown_verification![1]!.observed_at) - Date.parse(proof.pre_shutdown_verification![0]!.observed_at)).toBeGreaterThanOrEqual(100)
    expect(Date.parse(proof.lifetime!.finished_at!)).toBeGreaterThanOrEqual(Number(await Bun.file(fixture.file("natural-end")).text()) + 100)
  } finally { await fixture.close() }
}, 20_000)

test("ordinary exec: live changed image reaches deadline without signal", async () => {
  const fixture = await ordinaryExecFixture(65_000)
  try {
    const started = Date.now()
    await Bun.write(fixture.file("finish-cli"), "1")
    expect(await fixture.pending).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 1 })
    expect(Date.now() - started).toBeGreaterThanOrEqual(59_000)
    const proof = await fixture.proof()
    expect(proof.status).toBe("failed")
    expect(await fixture.active(fixture.pid)).toBe(true)
    expect((await stat(`/proc/${fixture.pid}/exe`)).ino).toBe(fixture.after.inode)
    expect((await Bun.file(`/proc/${fixture.pid}/stat`).text()).split(") ")[1]!.split(" ")[19]).toBe(fixture.after.starttime)
    expect(await Bun.file(fixture.file("signals")).exists()).toBe(false)
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(1)
    await fixture.wait(async () => !await fixture.active(fixture.pid), 10_000)
    expect(await Bun.file(fixture.file("natural-end")).exists()).toBe(true)
  } finally { await fixture.close() }
}, 90_000)

test("ordinary exec: late descendant adoption prevents early proof", async () => {
  const fixture = await ordinaryExecFixture(1_200, true)
  let settled = false
  const pending = fixture.pending.then(result => { settled = true; return result })
  try {
    await Bun.write(fixture.file("finish-cli"), "1")
    await fixture.wait(async () => !await fixture.active(fixture.before.parent))
    await Bun.write(fixture.file("spawn-late"), "1")
    await fixture.wait(() => Bun.file(fixture.file("late-image")).exists())
    const child = await Bun.file(fixture.file("late-image")).json() as Pick<ProcessIdentity, "pid" | "starttime">
    await fixture.wait(async () => !await fixture.active(fixture.pid))
    expect(await fixture.active(child.pid)).toBe(true)
    expect(Number((await Bun.file(`/proc/${child.pid}/stat`).text()).split(") ")[1]!.split(" ")[1])).toBe(fixture.launcher.pid)
    await Bun.sleep(150)
    expect(settled).toBe(false)
    expect(await fixture.active(fixture.launcher.pid)).toBe(true)
    expect(await pending).toMatchObject({ ok: true, attempts: 1 })
    const proof = await fixture.proof()
    expect(proof.origins).toContainEqual(expect.objectContaining({ pid: child.pid, starttime: child.starttime,
      via: "parent", parent_pid: fixture.pid, parent_starttime: fixture.before.starttime }))
    expect(proof.status).toBe("confirmed")
    expect(await Bun.file(fixture.file("signals")).exists()).toBe(false)
    expect(await fixture.active(child.pid)).toBe(false)
    const ended = Number(await Bun.file(fixture.file("late-end")).text())
    expect(Date.parse(proof.pre_shutdown_verification![0]!.observed_at)).toBeGreaterThanOrEqual(ended)
    expect(Date.parse(proof.lifetime!.finished_at!)).toBeGreaterThanOrEqual(ended + 100)
  } finally { await fixture.close() }
}, 20_000)

test("ordinary exec: selected CLI executable change remains fatal after natural exit", async () => {
  const fixture = await gateFixture()
  const file = (name: string) => path.join(fixture.root, name)
  const wait = async (check: () => Promise<unknown> | unknown) => {
    const deadline = Date.now() + 5_000
    while (!await check()) {
      if (Date.now() >= deadline) throw Error("Selected CLI fixture did not settle")
      await Bun.sleep(10)
    }
  }
  const active = async () => {
    if (!await Bun.file(file("selected.pid")).exists()) return false
    const raw = await Bun.file(`/proc/${(await Bun.file(file("selected.pid")).text()).trim()}/stat`).text().catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return raw !== "" && !["Z", "X"].includes(raw.split(") ")[1]!.split(" ")[0]!)
  }
  await Bun.write(file("selected-after-exec.mjs"), `
    import { appendFileSync, writeFileSync } from "node:fs";
    const root = ${JSON.stringify(fixture.root)};
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => appendFileSync(root + "/selected-signals", signal + "\\n"));
    const fake = Bun.spawn([process.execPath, ${JSON.stringify(path.join(evalsRoot, "fixtures/fake-codex.ts"))}, ...Bun.argv.slice(2)],
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    await fake.exited;
    await Bun.sleep(600);
    writeFileSync(root + "/selected-natural-end", "1");
  `)
  const input = fixture.input("selected-cli-exec")
  const pending = judgeTask({ ...input, judge: { ...input.judge, command: ["/bin/bash", "-c",
    'root=$1; runtime=$2; shift 2; printf "%s" "$$" > "$root/selected.pid"; while [[ ! -f "$root/selected-exec" ]]; do sleep 0.05; done; exec "$runtime" "$root/selected-after-exec.mjs" "$@"',
    "fixture", fixture.root, process.execPath] } })
  const scope = () => supervisedProcesses().scopes.find(scope => scope.owner.id === input.outDir)
  try {
    await wait(() => Bun.file(file("selected.pid")).exists())
    const pid = Number(await Bun.file(file("selected.pid")).text())
    await wait(() => scope()?.processes?.some(entry => entry.pid === pid))
    await Bun.write(file("selected-exec"), "1")
    await wait(() => scope()?.status === "unavailable")
    await wait(async () => !await active())
    expect(await Bun.file(file("selected-natural-end")).exists()).toBe(true)
    const result = await pending
    const proof = await Bun.file(path.join(fixture.root, "selected-cli-exec/judge-processes-1/process-cleanup.json")).json() as ProcessCleanup
    // Readiness and the selected CLI identity arrive in one authentic receipt.
    // Its admitted executable can never enter the ordinary-descendant exception.
    expect(proof.origins?.find(entry => entry.pid === pid)?.via).toBe("cli")
    expect(proof.launcher?.cli_pid).toBe(pid)
    expect(proof.executableTransitions?.some(entry => entry.original.pid === pid) ?? false).toBe(false)
    expect(proof.error).toContain("Process identity changed")
    expect(result).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 1 })
    expect(proof.status).toBe("failed")
    expect(await Bun.file(file("selected-signals")).exists()).toBe(false)
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(1)
  } finally {
    await Bun.write(file("selected-exec"), "1")
    await pending
    await wait(async () => !await active())
    await fixture.close()
  }
}, 90_000)

test("ordinary exec: known browser helper stays fatal after adoption and natural exit", async () => {
  const fixture = await gateFixture()
  const file = (name: string) => path.join(fixture.root, name)
  const wait = async (check: () => Promise<unknown> | unknown) => {
    const deadline = Date.now() + 5_000
    while (!await check()) {
      if (Date.now() >= deadline) throw Error("Known helper fixture did not settle")
      await Bun.sleep(10)
    }
  }
  const active = async (pidFile: string) => {
    if (!await Bun.file(file(pidFile)).exists()) return false
    const raw = await Bun.file(`/proc/${(await Bun.file(file(pidFile)).text()).trim()}/stat`).text().catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return ""
      throw error
    })
    return raw !== "" && !["Z", "X"].includes(raw.split(") ")[1]!.split(" ")[0]!)
  }
  // A real executable basename establishes the native role before the helper
  // is admitted; no process.title timing or actual browser is involved.
  await cp(process.execPath, file("chrome"))
  await Bun.write(file("helper-after-exec.mjs"), `
    import { appendFileSync, readFileSync, statSync, writeFileSync } from "node:fs";
    const root = ${JSON.stringify(fixture.root)};
    for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => appendFileSync(root + "/helper-signals", signal + "\\n"));
    const fields = readFileSync("/proc/self/stat", "utf8").split(") ")[1].split(" ");
    const exe = statSync("/proc/self/exe");
    writeFileSync(root + "/helper-image", JSON.stringify({ pid: process.pid, starttime: fields[19], uid: process.getuid(),
      group: Number(fields[2]), session: Number(fields[3]), device: exe.dev, inode: exe.ino }));
    await Bun.sleep(1_200);
    writeFileSync(root + "/helper-natural-end", "1");
  `)
  await Bun.write(file("native-parent.mjs"), `
    import { spawn } from "node:child_process";
    const root = ${JSON.stringify(fixture.root)};
    await Bun.write(root + "/native.pid", String(process.pid));
    spawn("/bin/bash", ["-c", 'printf "%s" "$$" > "$1/helper.pid"; while [[ ! -f "$1/helper-exec" ]]; do sleep 0.05; done; exec "$2" "$1/helper-after-exec.mjs"',
      "fixture", root, ${JSON.stringify(process.execPath)}], { detached: true, stdio: "ignore" }).unref();
    while (!await Bun.file(root + "/parent-end").exists()) await Bun.sleep(10);
    process.exit(0);
  `)
  await Bun.write(file("native-wrapper.mjs"), `
    import { spawn } from "node:child_process";
    const root = ${JSON.stringify(fixture.root)};
    spawn(root + "/chrome", [root + "/native-parent.mjs"], { stdio: "ignore" }).unref();
    while (!await Bun.file(root + "/finish-cli").exists()) await Bun.sleep(10);
    const fake = Bun.spawn([process.execPath, ${JSON.stringify(path.join(evalsRoot, "fixtures/fake-codex.ts"))}, ...Bun.argv.slice(2)],
      { stdin: "inherit", stdout: "inherit", stderr: "inherit" });
    process.exit(await fake.exited);
  `)
  const input = fixture.input("known-browser-helper")
  const pending = judgeTask({ ...input, judge: { ...input.judge, command: [process.execPath, file("native-wrapper.mjs")] } })
  const scope = () => supervisedProcesses().scopes.find(scope => scope.owner.id === input.outDir)
  try {
    await wait(() => Bun.file(file("helper.pid")).exists())
    const pid = Number(await Bun.file(file("helper.pid")).text())
    const native = Number(await Bun.file(file("native.pid")).text())
    await wait(() => scope()?.processes?.some(entry => entry.pid === pid && entry.parent === native))
    const before = scope()!.processes!.find(entry => entry.pid === pid)!
    const parent = scope()!.processes!.find(entry => entry.pid === native)!
    expect(path.basename(parent.executable)).toBe("chrome")
    await Bun.write(file("parent-end"), "1")
    await wait(async () => !await active("native.pid"))
    expect(Number((await Bun.file(`/proc/${pid}/stat`).text()).split(") ")[1]!.split(" ")[1])).toBe(scope()!.launcher.pid)
    await Bun.write(file("helper-exec"), "1")
    await wait(() => Bun.file(file("helper-image")).exists())
    const after = await Bun.file(file("helper-image")).json() as ProcessIdentity
    expect(after).toMatchObject({ pid: before.pid, starttime: before.starttime, uid: before.uid, group: before.group, session: before.session })
    expect([after.device, after.inode]).not.toEqual([before.device, before.inode])
    await wait(() => scope()?.status === "unavailable")
    await Bun.write(file("finish-cli"), "1")
    const result = await pending
    const proof = await Bun.file(path.join(fixture.root, "known-browser-helper/judge-processes-1/process-cleanup.json")).json() as ProcessCleanup
    expect(proof.origins).toContainEqual(expect.objectContaining({ pid, starttime: before.starttime, via: "parent", parent_pid: native, parent_starttime: parent.starttime }))
    expect(await Bun.file(file("helper-natural-end")).exists()).toBe(true)
    expect(result).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 1 })
    expect(proof.status).toBe("failed")
    expect(await Bun.file(file("helper-signals")).exists()).toBe(false)
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(1)
  } finally {
    for (const marker of ["parent-end", "helper-exec", "finish-cli"]) await Bun.write(file(marker), "1")
    await pending
    await wait(async () => !await active("helper.pid") && !await active("native.pid"))
    await fixture.close()
  }
}, 90_000)

test("judgeTask: unconfirmed process evidence refuses verdict and retry", async () => {
  const fixture = await gateFixture()
  try {
    await mkdir(path.join(fixture.root, "failed-proof/judge-processes-1/process-cleanup.json"), { recursive: true, mode: 0o700 })
    const result = await judgeTask(fixture.input("failed-proof"))
    expect(result).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 1 })
    expect(result.ok ? "" : result.error).toContain("Process evidence persistence failed")
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(1)
  } finally { await fixture.close() }
})

test("judgeTask: cleanup uncertainty during the second invocation remains in the outcome", async () => {
  const fixture = await gateFixture()
  try {
    await mkdir(path.join(fixture.root, "failed-second/judge-processes-2/process-cleanup.json"), { recursive: true, mode: 0o700 })
    const result = await judgeTask(fixture.input("failed-second", { FAKE_CODEX_EXIT: "9" }))
    expect(result).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 2 })
  } finally { await fixture.close() }
})

test("judge gate: unknown cleanup blocks waiting and future invocations without spawning children", async () => {
  const fixture = await gateFixture()
  const gate = createJudgeGate()
  try {
    await mkdir(path.join(fixture.root, "a/judge-processes-1/process-cleanup.json"), { recursive: true, mode: 0o700 })
    const [a, b] = await Promise.all([gate(fixture.input("a")), gate(fixture.input("b"))])
    expect(a).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 1 })
    expect(b).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 0 })
    expect(await gate(fixture.input("c"))).toMatchObject({ ok: false, cleanupUnconfirmed: true, attempts: 0 })
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(1)
  } finally { await fixture.close() }
})

test("judge gate: a secondary log failure preserves proven quality and later invocations", async () => {
  const fixture = await gateFixture()
  const gate = createJudgeGate()
  try {
    await mkdir(path.join(fixture.root, "a/judge-events-1.jsonl"), { recursive: true, mode: 0o700 })
    const a = await gate(fixture.input("a"))
    expect(a).toMatchObject({ ok: true, attempts: 1 })
    expect(await gate(fixture.input("b"))).toMatchObject({ ok: true, attempts: 1 })
    expect((await fixture.records()).filter(row => row.kind === "start")).toHaveLength(2)
  } finally { await fixture.close() }
})

test("judge gate: actual fake-codex intervals do not overlap", async () => {
  const fixture = await gateFixture()
  const gate = createJudgeGate()
  try {
    const [a, b] = await Promise.all([gate(fixture.input("a")), gate(fixture.input("b"))])
    expect(a).toMatchObject({ ok: true, attempts: 1 })
    expect(b).toMatchObject({ ok: true, attempts: 1 })
    const rows = await fixture.records()
    expect(rows.map(row => [path.basename(path.dirname(row.dir)), row.kind])).toEqual([["a", "start"], ["a", "end"], ["b", "start"], ["b", "end"]])
    expect(BigInt(rows[2]!.at)).toBeGreaterThanOrEqual(BigInt(rows[1]!.at))
  } finally { await fixture.close() }
})

test("judge gate: abort during waiting skips the child and preserves the queue predecessor", async () => {
  const fixture = await gateFixture()
  const gate = createJudgeGate()
  const abort = new AbortController()
  let aSettled = false
  const a = gate(fixture.input("a", { FAKE_CODEX_DELAY_MS: "1000" })).finally(() => { aSettled = true })
  const b = gate(fixture.input("b", {}, abort.signal))
  const pending = [a, b]
  try {
    await fixture.started("a")
    abort.abort()
    expect(await b).toEqual({ ok: false, error: "interrupted before judge", attempts: 0 })
    expect(aSettled).toBe(false)
    expect(await Bun.file(path.join(fixture.root, "b/judge/TASK.md")).exists()).toBe(false)
    const c = gate(fixture.input("c"))
    pending.push(c)
    expect(await a).toMatchObject({ ok: true })
    expect(await c).toMatchObject({ ok: true })
    expect((await fixture.records()).map(row => [path.basename(path.dirname(row.dir)), row.kind]))
      .toEqual([["a", "start"], ["a", "end"], ["c", "start"], ["c", "end"]])
  } finally { abort.abort(); await Promise.allSettled(pending); await fixture.close() }
})

test("judge gate: the entire internal retry precedes the next actual child", async () => {
  const fixture = await gateFixture()
  const gate = createJudgeGate()
  try {
    const [a, b] = await Promise.all([gate(fixture.input("a", { FAKE_CODEX_FLAKY_MARKER: path.join(fixture.root, "flaky") })), gate(fixture.input("b"))])
    expect(a).toMatchObject({ ok: true, attempts: 2 })
    expect(b).toMatchObject({ ok: true, attempts: 1 })
    const rows = await fixture.records()
    expect(rows.map(row => [path.basename(path.dirname(row.dir)), row.kind]))
      .toEqual([["a", "start"], ["a", "end"], ["a", "start"], ["a", "end"], ["b", "start"], ["b", "end"]])
    expect(BigInt(rows[4]!.at)).toBeGreaterThanOrEqual(BigInt(rows[3]!.at))
  } finally { await fixture.close() }
})

test("judge gate: a preparation exception releases the next judge", async () => {
  const fixture = await gateFixture()
  const gate = createJudgeGate()
  const input = fixture.input("a")
  try {
    await cp(input.task.dir, path.join(fixture.root, "bad-task"), { recursive: true })
    await cp(path.join(evalsRoot, "fixtures/storage/not-a-package.lgp"), path.join(fixture.root, "bad-task", input.task.reference))
    const [a, b] = await Promise.allSettled([gate({ ...input, task: { ...input.task, dir: path.join(fixture.root, "bad-task") } }), gate(fixture.input("b"))])
    expect(a).toMatchObject({ status: "rejected", reason: expect.any(EvalFailure) })
    expect(b).toMatchObject({ status: "fulfilled", value: { ok: true, attempts: 1 } })
    expect((await fixture.records()).map(row => [path.basename(path.dirname(row.dir)), row.kind])).toEqual([["b", "start"], ["b", "end"]])
  } finally { await fixture.close() }
})

for (const stop of ["error", "timeout", "abort"] as const) test(`judge gate: ${stop} drains A before releasing B`, async () => {
  const fixture = await gateFixture()
  const gate = createJudgeGate()
  const abort = new AbortController()
  const input = fixture.input("a", { FAKE_CODEX_DELAY_MS: stop === "error" ? "200" : "5000", ...(stop === "error" ? { FAKE_CODEX_EXIT: "9" } : {}) }, abort.signal)
  let finishedAt = 0
  const a = gate({ ...input, judge: { ...input.judge, timeoutMs: stop === "timeout" ? 500 : 30_000 } }).finally(() => { finishedAt = Date.now() })
  const b = gate(fixture.input("b"))
  try {
    if (stop === "abort") { await fixture.started("a"); abort.abort() }
    const [first, second] = await Promise.all([a, b])
    expect(first).toMatchObject({ ok: false, attempts: stop === "abort" ? 1 : 2 })
    expect(second).toMatchObject({ ok: true, attempts: 1 })
    const rows = await fixture.records()
    const owned = rows.filter(row => row.kind === "start" && row.dir === path.join(fixture.root, "a/judge"))
    expect(owned).toHaveLength(stop === "abort" ? 1 : 2)
    expect(await Promise.all(owned.map(row => Bun.file(`/proc/${row.pid}/stat`).exists()))).toEqual(owned.map(() => false))
    expect(Number(rows.find(row => row.kind === "start" && row.dir === path.join(fixture.root, "b/judge"))!.at)).toBeGreaterThanOrEqual(finishedAt)
  } finally { abort.abort(); await Promise.allSettled([a, b]); await fixture.close() }
})

test("judge gate: actual child uses judge CODEX_HOME without inherited model or admin environment", async () => {
  const fixture = await gateFixture()
  const probe = path.join(fixture.root, "environment.json")
  const wrapper = path.join(fixture.root, "probe.ts")
  await Bun.write(wrapper, `await Bun.write(${JSON.stringify(probe)},JSON.stringify(Object.fromEntries(["LOGINOM_AI_AGENT_SHARED_AUTH_DIR","LOGINOM_DOCK_API_KEY","LOGINOM_AI_AGENT_CLI_PROFILE","EVAL_ADMIN_CREDENTIALS_FILE","CODEX_HOME"].map(key=>[key,process.env[key]??null]))));await import(${JSON.stringify(path.join(evalsRoot, "fixtures/fake-codex.ts"))});`)
  const input = fixture.input("probe")
  const configured = { ...input, judge: { ...input.judge, command: [process.execPath, wrapper],
    env: { ...input.judge.env, CODEX_HOME: path.join(fixture.root, "judge-codex") }, timeoutMs: 2_000 } }
  const child = Bun.spawn([process.execPath, "-e", `import {createJudgeGate} from ${JSON.stringify(path.join(evalsRoot, "src/judge.ts"))};console.log(JSON.stringify(await createJudgeGate()(${JSON.stringify(configured)})));`], {
    env: { ...process.env, LOGINOM_AI_AGENT_SHARED_AUTH_DIR: "model-auth-canary", LOGINOM_DOCK_API_KEY: "dock-canary",
      LOGINOM_AI_AGENT_CLI_PROFILE: "agent-profile-canary", EVAL_ADMIN_CREDENTIALS_FILE: "admin-canary", CODEX_HOME: "desktop-home-canary" },
    stdout: "pipe", stderr: "pipe",
  })
  try {
    const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
    expect(code).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({ ok: true, attempts: 1 })
    expect(await Bun.file(probe).json()).toEqual({ LOGINOM_AI_AGENT_SHARED_AUTH_DIR: null, LOGINOM_DOCK_API_KEY: null,
      LOGINOM_AI_AGENT_CLI_PROFILE: null, EVAL_ADMIN_CREDENTIALS_FILE: null, CODEX_HOME: path.join(fixture.root, "judge-codex") })
    expect(stdout + stderr).not.toContain("canary")
  } finally { child.kill(); await child.exited; await fixture.close() }
})

const judgeFixture = async (env: Record<string, string> = {}) => {
  const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
  const artifact = await fixtureArtifact()
  const outDir = path.join(await mkdtemp(path.join(os.tmpdir(), "evals-judge-")), "judge")
  return judgeTask({ task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "p", outDir, judge: settings(env) })
}

test("judgeTask: эталон без Unit.xml — EvalFailure с id задачи", async () => {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "evals-bad-ref-"))
  const outDir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-"))
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(tmpDir, "group-sum-qty"), { recursive: true })
    await cp(path.join(evalsRoot, "fixtures", "storage", "not-a-package.lgp"), path.join(tmpDir, "group-sum-qty", "reference.lgp"))
    const [task] = await loadTasks(tmpDir)
    const artifact = await fixtureArtifact()
    const rejected = await judgeTask({
      task: task!,
      artifactDir: path.dirname(artifact.unpackedDir),
      prompt: "p",
      outDir,
      judge: settings(),
    }).then(
      () => undefined,
      (error: unknown) => error,
    )
    expect(rejected).toBeInstanceOf(EvalFailure)
    expect((rejected as EvalFailure).message).toContain(task!.id)
  } finally {
    await rm(tmpDir, { recursive: true, force: true })
    await rm(outDir, { recursive: true, force: true })
  }
})

test("judgeTask: pass → score 100, одна попытка, verdict.json на диске", async () => {
  const judged = await judgeFixture()
  expect(judged).toMatchObject({ ok: true, score: 100, pass: true, attempts: 1 })
})

test("judgeTask: oracle отклоняет неверный CSV даже при score 100 от судьи", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-oracle-"))
  const artifact = await fixtureArtifact()
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    await Bun.write(path.join(dir, "group-sum-qty", "oracle.csv"), "Item,Qty\nA,15\nB,25\n")
    const [task] = await loadTasks(dir)
    await Bun.write(path.join(path.dirname(artifact.unpackedDir), "results", "fixture-group-sum-qty.result.csv"), "Item,Qty\nA,16\nB,25\n")
    const judged = await judgeTask({
      task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "p", outDir: path.join(dir, "judge"), judge: settings(),
      run: { finalText: "готово", tools: [], nodeReceipts: [], nodeReceiptsDropped: 0 },
    })
    expect(judged).toMatchObject({ ok: true, score: 100, pass: false, oracle_pass: false })
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(path.dirname(artifact.unpackedDir), { recursive: true, force: true })
  }
})

test("judgeTask: верный oracle проходит, калибровка без run не требует CSV", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-oracle-"))
  const artifact = await fixtureArtifact()
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    await Bun.write(path.join(dir, "group-sum-qty", "oracle.csv"), "Item,Qty\nA,15\nB,25\n")
    await Bun.write(path.join(path.dirname(artifact.unpackedDir), "results", "fixture-group-sum-qty.result.csv"), "Item,Qty\nA,15\nB,25\n")
    const [task] = await loadTasks(dir)
    const input = { task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "p", outDir: path.join(dir, "judge"), judge: settings() }
    expect(await judgeTask({ ...input, run: { finalText: "готово", tools: [], nodeReceipts: [], nodeReceiptsDropped: 0 } })).toMatchObject({ pass: true, oracle_pass: true })
    await rm(path.join(path.dirname(artifact.unpackedDir), "results"), { recursive: true, force: true })
    expect(await judgeTask(input)).toMatchObject({ pass: true, oracle_pass: null })
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(path.dirname(artifact.unpackedDir), { recursive: true, force: true })
  }
})

test("judgeTask: верный сохранённый CSV не компенсирует ошибочную обязательную настройку графа", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-required-"))
  const artifact = await fixtureArtifact()
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    const file = path.join(dir, "group-sum-qty", "task.json")
    const raw = await Bun.file(file).json()
    raw.checklist.find((item: { id: string }) => item.id === "group-sum").required = true
    await Bun.write(file, JSON.stringify(raw))
    await Bun.write(path.join(dir, "group-sum-qty", "oracle.csv"), "Item,Qty\nA,15\nB,25\n")
    await Bun.write(path.join(path.dirname(artifact.unpackedDir), "results", "fixture-group-sum-qty.result.csv"), "Item,Qty\nA,15\nB,25\n")
    const [task] = await loadTasks(dir)
    const answer = path.join(dir, "answer.json")
    await Bun.write(answer, JSON.stringify(verdict(Object.fromEntries(task!.checklist.map((item) => [item.id, item.id !== "group-sum"])))))
    expect(await judgeTask({
      task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "p", outDir: path.join(dir, "judge"),
      judge: settings({ FAKE_CODEX_VERDICT: `file:${answer}` }),
      run: { finalText: "готово", tools: [], nodeReceipts: [], nodeReceiptsDropped: 0 },
    })).toMatchObject({ ok: true, score: 86, oracle_pass: true, pass: false })
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(path.dirname(artifact.unpackedDir), { recursive: true, force: true })
  }
})

test("judgeTask: fail → 0; half → округлённая доля", async () => {
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "fail" })).toMatchObject({ ok: true, score: 0, pass: false })
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "half" })).toMatchObject({ ok: true, score: 57 })
})

test("judgeTask: постоянный отказ → error после двух попыток", async () => {
  expect(await judgeFixture({ FAKE_CODEX_EXIT: "1" })).toMatchObject({ ok: false, attempts: 2 })
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "invalid" })).toMatchObject({ ok: false, attempts: 2 })
})

test("judgeTask: доказанный провал oracle учитывается в pass_rate даже при отказе судьи", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "evals-judge-oracle-error-"))
  const artifact = await fixtureArtifact()
  try {
    await cp(path.join(evalsRoot, "tasks", "group-sum-qty"), path.join(dir, "group-sum-qty"), { recursive: true })
    await Bun.write(path.join(dir, "group-sum-qty", "oracle.csv"), "Item,Qty\nA,15\nB,25\n")
    const [task] = await loadTasks(dir)
    const input = {
      task: task!, artifactDir: path.dirname(artifact.unpackedDir), prompt: "p", outDir: path.join(dir, "judge"),
      run: { finalText: "готово", tools: [], nodeReceipts: [], nodeReceiptsDropped: 0 },
    }
    const result = path.join(input.artifactDir, "results", "fixture-group-sum-qty.result.csv")
    await Bun.write(result, "Item,Qty\nA,15\nB,25\n")
    const correct = judgedFields(await judgeTask({ ...input, judge: settings() }))
    expect(correct).toMatchObject({ pass: true, oracle_pass: true, score: 100 })
    await Bun.write(result, "Item,Qty\nA,16\nB,25\n")
    const incorrect = judgedFields(await judgeTask({ ...input, judge: settings({ FAKE_CODEX_EXIT: "1" }) }))
    expect(incorrect).toMatchObject({ pass: false, oracle_pass: false, score: null, judge_status: "error", judge_attempts: 2 })
    const attempt = {
      task_id: task!.id, attempt: 1, status: "completed" as const, exit_code: 0,
      timed_out: false, interrupted: false, failure_kind: null,
      duration_ms: 1000, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0 },
      counters: { toolCalls: 0, loginomToolCalls: 0, toolErrors: 0, memoryToolCalls: 0 },
      package_path: artifact.packagePath, artifact_origin: artifact.origin, artifact_ambiguous: [], cleanup_error: null,
      action_manifest_sha256: null, session_id: null, profile_recovered: false, errors: [], harness_error: null, stderr_head: null,
    }
    expect(aggregate([{ ...attempt, ...correct }, { ...attempt, ...incorrect, attempt: 2 }], false)).toMatchObject({
      pass_rate: 0.5, pass_evaluated_count: 2, mean_score: 100, scored_count: 1, judge_error_count: 1,
    })
    await Bun.write(result, "Item,Qty\nA,15\nB,25\n")
    expect(judgedFields(await judgeTask({ ...input, judge: settings({ FAKE_CODEX_EXIT: "1" }) }))).toMatchObject({
      pass: null, oracle_pass: true, score: null, judge_status: "error",
    })
    const [withoutOracle] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
    expect(judgedFields(await judgeTask({ ...input, task: withoutOracle!, judge: settings({ FAKE_CODEX_EXIT: "1" }) }))).toMatchObject({
      pass: null, oracle_pass: null, score: null, judge_status: "error",
    })
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(path.dirname(artifact.unpackedDir), { recursive: true, force: true })
  }
})

test("judgeTask: judge.env проходит в процесс, EVAL_* из process.env — нет", async () => {
  const previousProbe = process.env.EVAL_SECRET_PROBE
  const previousEcho = process.env.FAKE_CODEX_ECHO
  process.env.EVAL_SECRET_PROBE = "leak"
  process.env.FAKE_CODEX_ECHO = "should-not-inherit"
  try {
    const passed = await judgeFixture({ FAKE_CODEX_ECHO: "from-judge", FAKE_CODEX_VERDICT: "pass" })
    expect(passed).toMatchObject({ ok: true })
    if (passed.ok) expect(passed.verdict.summary).toContain("from-judge")
    const inherited = await judgeFixture()
    expect(inherited).toMatchObject({ ok: true })
    if (inherited.ok) {
      expect(inherited.verdict.summary).not.toContain("leak")
      expect(inherited.verdict.summary).not.toContain("should-not-inherit")
    }
  } finally {
    if (previousProbe === undefined) delete process.env.EVAL_SECRET_PROBE
    else process.env.EVAL_SECRET_PROBE = previousProbe
    if (previousEcho === undefined) delete process.env.FAKE_CODEX_ECHO
    else process.env.FAKE_CODEX_ECHO = previousEcho
  }
})

test("judgeTask: первый отказ, второй успех → ok, attempts 2", async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), "evals-flaky-"))
  const marker = path.join(parent, "marker")
  const outDir = path.join(parent, "judge")
  try {
    const [task] = await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"])
    const artifact = await fixtureArtifact()
    expect(
      await judgeTask({
        task: task!,
        artifactDir: path.dirname(artifact.unpackedDir),
        prompt: "p",
        outDir,
        judge: settings({ FAKE_CODEX_FLAKY_MARKER: marker }),
      }),
    ).toMatchObject({ ok: true, score: 100, attempts: 2 })
    expect(await Bun.file(path.join(parent, "judge-events-1.jsonl")).exists()).toBe(true)
    expect(await Bun.file(path.join(parent, "judge-events-2.jsonl")).exists()).toBe(true)
  } finally {
    await rm(parent, { recursive: true, force: true })
  }
})

test("scoreVerdict: провал результата не снижает структурный score", () => {
  const rubric = checklist.map((item) => ({ ...item, axis: item.id === "c" ? "result" as const : "structure" as const }))
  expect(scoreVerdict(rubric, verdict({ a: true, b: true, c: false }), 70)).toMatchObject({
    ok: true, score: 50, pass: false, structural_score: 100,
  })
})

test("judgedFields: переносит отдельный structural_score, ошибка не равна нулю", async () => {
  expect(judgedFields(await judgeFixture()).structural_score).toBe(100)
  expect(judgedFields({ ok: false, error: "test", attempts: 0 }).structural_score).toBeNull()
})

test("scoreVerdict: structural weights не округляются и требуют полной разметки", () => {
 const rubric = checklist.map((item) => ({ ...item, axis: "structure" as const, weight: item.id === "a" ? 1 : 1 }))
 expect(scoreVerdict(rubric, verdict({a:true,b:false,c:false}),70)).toMatchObject({structural_score: 100/3})
 expect(scoreVerdict(checklist, verdict({a:true,b:true,c:true}),70)).toMatchObject({structural_score:null})
 expect(scoreVerdict(checklist.map((item) => ({...item,axis:"result" as const})), verdict({a:true,b:true,c:true}),70)).toMatchObject({structural_score:null})
 const partial = rubric.map((item,index) => index === 0 ? {...item,axis:undefined} : item)
 expect(scoreVerdict(partial, verdict({a:true,b:true,c:true}),70)).toMatchObject({structural_score:null})
})


test("scoreVerdict: дробные веса полного успеха остаются сравнимы после JSON", async () => {
  const task = (await loadTasks(path.join(evalsRoot, "tasks"), ["group-sum-qty"]))[0]!
  const rubric = task.checklist.map((item) => ({ ...item, weight: 0.53 }))
  const scored = scoreVerdict(rubric, verdict(Object.fromEntries(rubric.map((item) => [item.id, true]))), 70)
  if (!scored.ok) throw new Error(scored.error)
  const run = comparisonSummary([{ successes: 3, attempts: 3 }])
  run.tasks[0]!.attempts.forEach((attempt) => { attempt.structural_score = scored.structural_score })
  const saved = parseComparisonSummary(JSON.parse(JSON.stringify(run)))
  expect(analyzeComparison(saved, saved).axes.structure.observed).toEqual({ a: 1, b: 1, drop: 0 })
  expect(scored.structural_score).toBe(100)
})

test("judgeTask: VPN verdict requires terminal named unit and unconfirmed cleanup prevents retry", async () => {
  const fixture = await gateFixture()
  try {
    const query = path.join(fixture.root, "queried")
    const systemctl = path.join(fixture.root, "systemctl")
    for (const state of ["inactive", "active"]) {
      await Bun.write(systemctl, `#!/bin/sh\nprintf '%s\n' "$@" > '${query}'\nprintf 'LoadState=loaded\nActiveState=${state}\nMainPID=0\n'\n`)
      await chmod(systemctl, 0o700)
      const input = fixture.input(state, { PATH: fixture.root + ":" + process.env.PATH! })
      input.judge = { ...input.judge, systemd: true, command: [process.execPath, path.join(evalsRoot, "fixtures/fake-codex.ts")] }
      const result = await judgeTask(input)
      expect(result).toMatchObject(state === "inactive" ? { ok: true, pass: true, attempts: 1 }
        : { ok: false, cleanupUnconfirmed: true, attempts: 1 })
      expect(await Bun.file(query).text()).toContain("loginom-evals-judge-")
    }
  } finally { await fixture.close() }
})
