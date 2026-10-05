import { expect, test } from "bun:test"
import path from "node:path"
import { cp, mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import { fetchArtifact, parseArtifactSource } from "../src/artifact"
import { evalsRoot, loadConfig } from "../src/config"
import { EvalFailure } from "../src/fail"
import { judgeCommand, judgedFields, judgeInfo, judgeTask, prepareJudgeDir, scoreVerdict, type JudgeSettings, type Verdict } from "../src/judge"
import { aggregate } from "../src/report"
import { loadTasks } from "../src/task"

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

test("judgeInfo: версия судьи и sha256 промпта", async () => {
  const info = await judgeInfo(loadConfig(["--judge-only", "x"], { JUDGE_MODEL: "fake", EVAL_JUDGE_COMMAND: fakeJudge }))
  expect(info).toMatchObject({ backend: "codex", codex_version: "fake-codex 0.0.0", model: "fake", reasoning: "high" })
  expect(info.prompt_sha256).toMatch(/^[0-9a-f]{64}$/)
  expect(info.schema_sha256).toMatch(/^[0-9a-f]{64}$/)
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
