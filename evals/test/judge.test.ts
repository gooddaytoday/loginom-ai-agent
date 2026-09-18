import { expect, test } from "bun:test"
import path from "node:path"
import { cp, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import { fetchArtifact, parseArtifactSource } from "../src/artifact"
import { evalsRoot, loadConfig } from "../src/config"
import { EvalFailure } from "../src/fail"
import { judgeCommand, judgeInfo, judgeTask, prepareJudgeDir, scoreVerdict, type JudgeSettings, type Verdict } from "../src/judge"
import { loadTasks } from "../src/task"

const checklist = [
  { id: "a", text: "A", weight: 1, requiresResultFile: false, requiresRun: false },
  { id: "b", text: "B", weight: 1, requiresResultFile: false, requiresRun: false },
  { id: "c", text: "C", weight: 2, requiresResultFile: true, requiresRun: false },
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

test("judgeInfo: версия судьи и sha256 промпта", async () => {
  const info = await judgeInfo(loadConfig(["--judge-only", "x"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge }))
  expect(info).toMatchObject({ backend: "codex", codex_version: "fake-codex 0.0.0", model: "fake", reasoning: "high" })
  expect(info.prompt_sha256).toMatch(/^[0-9a-f]{64}$/)
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

test("judgeTask: fail → 0; half → округлённая доля", async () => {
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "fail" })).toMatchObject({ ok: true, score: 0, pass: false })
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "half" })).toMatchObject({ ok: true, score: 57 })
})

test("judgeTask: постоянный отказ → error после двух попыток", async () => {
  expect(await judgeFixture({ FAKE_CODEX_EXIT: "1" })).toMatchObject({ ok: false, attempts: 2 })
  expect(await judgeFixture({ FAKE_CODEX_VERDICT: "invalid" })).toMatchObject({ ok: false, attempts: 2 })
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
