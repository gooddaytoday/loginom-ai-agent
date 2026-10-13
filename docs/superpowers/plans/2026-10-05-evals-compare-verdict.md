# Вердикт eval compare — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Если эти skills отсутствуют в текущей сессии, не выдавать их за применённые: выполнять последовательные циклы доступным `$tdd`, с независимым review каждой завершённой задачи.

**Goal:** Реализовать пункт 1 remaining-work: три отдельных статистических verdict, non-inferiority, task-paired оценки, pass^1/pass^k и наблюдаемый guard 3/3 → 0/3.

**Architecture:** Чистый `analyzeComparison` скрывает парное сопоставление задач, покрытие, интервал и решения за одним интерфейсом. `compare` остаётся Markdown-renderer. Явная разметка рубрики и сохранённое происхождение оценки обеспечивают отдельный structural score без реконструкции старых результатов.

**Tech Stack:** Bun ≥ 1.3, TypeScript, bun:test; runtime-зависимости отсутствуют.

**Spec:** [Утверждённый контракт](../specs/2026-10-05-evals-compare-verdict-design.md), действующий [канон](../specs/2026-09-18-evals-design.md).

## Global Constraints

- Статус: утверждён пользователем 2026-10-05; Task 1–7 реализованы и проверены. Согласованы весь план, три verdict + отдельный NI, task-cluster CI + guard 3/3 → 0/3, запас 50 п.п., уровень 95%, structural schema и объём CLI.
- Код — только `evals/`; каноническая спека обновляется перед первым изменением контракта.
- `margin = 0.5`, `confidence = 0.95`; `alpha_tail = (1 − confidence) / 6`.
- Нет runtime-зависимостей, изменений product runtime, Protocol/HttpApi, установки, merge и live baseline.
- Каждый цикл: один падающий тест поведения → минимальный код → зелёный → допустимый refactor → коммит. Следующий тест только после GREEN.
- Публичные интерфейсы, реальные временные файлы; без внутренних mocks и `globalThis.*`. Живой judge не запускается.
- Все Bun-команды из `evals/`; typecheck только `bun typecheck`. Git-команды из implementation worktree.
- Существующие профили, bundle, `.env`, живые `results/` и внешние коллекции не изменять.

## Проверенная база и начало выполнения

База на 2026-10-05: основной checkout `/home/kiselev/git/loginom-ai-agent`, ветка `evals`, HEAD `2c06a30710e656984bff24a6a8cbd1645540eeed`, чистый до записи этого плана. Текущий `/home/kiselev/.codex/worktrees/9ace/loginom-ai-agent` не содержит `evals/` и не подходит как база реализации.

- [x] Перед реализацией получить полный SHA `git rev-parse 2c06a3071` и проверить актуальность `evals/AGENTS.md`, исходной задачи и канонической спеки.
- [x] Создать/повторно использовать отдельный managed worktree от проверенного SHA; ветка `compare-verdict` (две части, без `/`). Не переключать основной checkout и не переносить чужие незакоммиченные изменения.
- [x] Из `evals/` проверить Bun/dependencies; при необходимости `bun install --frozen-lockfile`. Не трогать корневой lockfile. Для fake проверок все каталоги задавать во временной области.
- [x] Обновить раздел compare в `docs/superpowers/specs/2026-09-18-evals-design.md` выбранным контрактом до кода; отметить эту spec как утверждённую только после явного согласования.
- [x] Перед RED выполнить текущие `bun test test/compare.test.ts test/report.test.ts` и `bun typecheck`.

## Карта файлов и ответственность

- Создать `evals/src/compare-analysis.ts`: единственный публичный вход статистического анализа и его exported types.
- Изменить `evals/src/compare.ts`: rendering и CLI аргументы/чтение/запись отчёта.
- Изменить `evals/src/task.ts`, `evals/src/judge.ts`: axis validation, hash, structural score.
- Изменить `evals/src/report.ts`, `evals/src/run.ts`, `evals/src/rejudge.ts`: snapshot, score и evaluation lineage; прежние aggregate метрики сохраняются.
- Создать `evals/src/evaluation.ts`: повторно используемый fingerprint полного контракта оценки для run/rejudge/compare; не помещать эту границу в renderer.
- Разметить `evals/tasks/{group-sum-qty,calc-data-double,filter-active-rows}/task.json`.
- Создать `evals/test/helpers/compare-summary.ts`, `evals/test/compare-analysis.test.ts`, `evals/test/compare-cli.test.ts`.
- Дополнить `evals/test/{compare,task,judge,run,rejudge,calibrate,report}.test.ts` по owning interface, не одним большим test harness.
- Создать `evals/script/check-compare-noise.ts`: отдельная воспроизводимая проверка выбранной статистики, не production dependency.
- Обновить `evals/README.md`, каноническую спеку, этот checkpoint и только статус пункта 1 remaining-work по реально выполненным проверкам.

## Task 1: Task-paired анализ — tracer bullet

**Files:** создать analysis module, его test и общий test fixture.
**Consumes:** существующие `RunSummary`, `AttemptResult`, `aggregate`, `aggregateTask` из `src/report.ts`.
**Produces:** `analyzeComparison(a,b,options?)`, `ComparePolicy`, `ComparisonAnalysis` с полями из spec. На первом GREEN достаточно корректного completion observed и unavailable остальных неподдержанных результатов; не создавать фиктивный verdict.

Test fixture ниже целиком помещается в `test/helpers/compare-summary.ts`. Это входные данные через действующие aggregate API, без копирования production-формул:

```ts
import { aggregate, aggregateTask, type AttemptResult, type RunSummary } from "../../src/report"

export function comparisonSummary(counts: { successes: number; attempts: number }[], repeat = 3): RunSummary {
  const tasks = counts.map((count, index) => {
    const id = `task-${index}`
    const attempts = Array.from({ length: count.attempts }, (_, number): AttemptResult => ({
      task_id: id, attempt: number + 1,
      status: number < count.successes ? "completed" : "no_artifact",
      exit_code: 0, timed_out: false, interrupted: false, failure_kind: null,
      score: number < count.successes ? 100 : 0,
      pass: number < count.successes, oracle_pass: number < count.successes,
      judge_status: number < count.successes ? "scored" : "no_artifact",
      judge_attempts: 1, judge_confidence: "high", judge_summary: null, checklist: null,
      duration_ms: 1, cost: 0,
      tokens: { input: 0, output: 0, reasoning: 0 },
      counters: { toolCalls: 0, loginomToolCalls: 0, toolErrors: 0, memoryToolCalls: 0 },
      package_path: null, artifact_origin: null, artifact_ambiguous: [], cleanup_error: null,
      action_manifest_sha256: null, session_id: null, profile_recovered: false,
      errors: [], harness_error: null, stderr_head: null,
    }))
    return { id, attempts, metrics: aggregateTask(attempts, false) }
  })
  return {
    run_id: "fixture", label: null, started_at: "", finished_at: "", interrupted: false,
    interrupted_cleanup: null, stopped_reason: null,
    agent: { cli_mode: "source", git_sha: "source-a", dirty: false, model: "fake/model", variant: "medium" },
    judge: { backend: "codex", codex_version: "fake", model: "fake", reasoning: "medium", prompt_sha256: "prompt", schema_sha256: "schema" },
    dock: { skill_revision: "skill", action_manifest_sha256: ["manifest"] },
    loginom: { image_digest: "image", container: null, storage_dir: null },
    agent_inputs_hash: "inputs", rubric_hash: "rubric", task_ids: tasks.map((task) => task.id),
    config: { repeat, timeout_ms: 1000, task_timeout_ms: Object.fromEntries(tasks.map((task) => [task.id, 1000])), judge_timeout_ms: 1000, pass_threshold: 70, keep_storage: false },
    metrics: aggregate(tasks.flatMap((task) => task.attempts), false), tasks, storage_leftovers: [],
  }
}
```

- [x] RED: создать один тест:

```ts
import { expect, test } from "bun:test"
import { analyzeComparison } from "../src/compare-analysis"
import { comparisonSummary } from "./helpers/compare-summary"

test("analysis: задачи имеют равный вес при разных числах попыток", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }, { successes: 0, attempts: 1 }])
  const b = comparisonSummary([{ successes: 0, attempts: 3 }, { successes: 1, attempts: 1 }])
  expect(analyzeComparison(a, b).axes.completion.observed).toEqual({ a: 0.5, b: 0.5, drop: 0 })
})
```

- [x] Запустить `bun test test/compare-analysis.test.ts -t 'задачи имеют равный вес'`; увидеть RED из-за отсутствующей возможности, не из-за fixture/type/import ошибки.
- [x] GREEN: сопоставить ID и посчитать неокруглённые rates; среднее по задачам, не `metrics.total`. Вернуть `observed` по объявленному контракту.
- [x] Запустить тот же тест до PASS. Затем отдельными RED→GREEN циклами проверить: порядок задач; exclusion infra/harness/interrupted; пустую задачу; разные task sets; дубликаты/некорректные values; неизвестные identity; смену source commit.
- [x] Полный focused `bun test test/compare-analysis.test.ts test/compare.test.ts test/report.test.ts`, `bun typecheck`; refactor только после GREEN, затем `feat(evals): add task-paired comparison analysis`.

## Task 2: pass^1, pass^k и локальный guard

**Files:** analysis и его tests.
**Consumes:** measured task groups из Task 1; `pass` как boolean/null.
**Produces:** `reliability.{k,a,b,reasons}`, `tasks[].regressions`. Значения nullable; общая выборка задач не сокращается молча.

- [x] RED одного отличающего поведения:

```ts
test("analysis: pass^3 означает все три успеха, а не хотя бы один", () => {
  const run = comparisonSummary([{ successes: 2, attempts: 3 }])
  expect(analyzeComparison(run, run).reliability.a.pass1).toBeCloseTo(2 / 3, 12)
  expect(analyzeComparison(run, run).reliability.a.passk).toBe(0)
})
```

- [x] `bun test test/compare-analysis.test.ts -t 'pass\^3 означает'` → RED.
- [x] GREEN: при n≥k считать произведение `(c-j)/(n-j)`, с ранним нулём для c<k. Не считать factorial, `pass@k` или `(c/n)^k`.
- [x] Повторить тест до PASS; затем отдельные циклы для 3/6,k=3 → 0.05, 3/3 → 1, общего k при разных repeats, n<k → null, неизвестного pass и покрытия.
- [x] Следующий RED guard:

```ts
test("analysis: стабильная задача 3/3 → 0/3 получает наблюдаемый guard", () => {
  const a = comparisonSummary([{ successes: 3, attempts: 3 }])
  const b = comparisonSummary([{ successes: 0, attempts: 3 }])
  expect(analyzeComparison(a, b).tasks[0]?.regressions).toContain("completion")
})
```

- [x] RED → минимальный GREEN: guard только repeat=3, полные три измеренных результата и сравнимость; добавить отдельные следующие тесты неизвестной/исключённой попытки, oracle/pass guard, reverse без evidence «лучше».
- [x] Focused tests/typecheck, независимый review и `feat(evals): report reliable pass metrics and task regressions`.

## Task 3: Консервативный CI, три verdict и NI

**Files:** analysis, tests; канонический statistical contract уже принят в начале.
**Consumes:** task drops в `[−1,1]`, policy.
**Produces:** `axes.*.{interval,verdict,non_inferiority,reasons}`.

- [x] RED одного малого неизменного набора:

```ts
test("analysis: одинаковые 5×3 не доказывают направление или non-inferiority", () => {
  const run = comparisonSummary(Array.from({ length: 5 }, () => ({ successes: 3, attempts: 3 })))
  expect(analyzeComparison(run, run).axes.completion).toMatchObject({
    interval: { lower: -1, upper: 1 }, verdict: "indistinguishable", non_inferiority: "inconclusive",
  })
})
```

- [x] Запуск точного теста → RED; GREEN формула из spec:

```ts
const halfWidth = Math.sqrt(2 * Math.log(6 / (1 - confidence)) / taskCount)
const lower = Math.max(-1, drop - halfWidth)
const upper = Math.min(1, drop + halfWidth)
const verdict = lower > margin ? "worse" : upper < -margin ? "better" : "indistinguishable"
const nonInferiority = upper <= margin ? "confirmed" : lower > margin ? "rejected" : "inconclusive"
```

- [x] После PASS отдельными циклами: 39 задач полного падения → worse; разворот → better; 25 → indistinguishable; равенство границы margin не worse и NI confirmed; нулевая дисперсия не схлопывает CI; unavailable не трактуется как indistinguishable; неверные policy значения → `EvalFailure` exit 2.
- [x] Пример следующего самостоятельного теста направления:

```ts
test("analysis: достаточный набор доказывает падение сверх запаса", () => {
  const a = comparisonSummary(Array.from({ length: 39 }, () => ({ successes: 3, attempts: 3 })))
  const b = comparisonSummary(Array.from({ length: 39 }, () => ({ successes: 0, attempts: 3 })))
  expect(analyzeComparison(a, b).axes.completion.verdict).toBe("worse")
  expect(analyzeComparison(b, a).axes.completion.verdict).toBe("better")
})
```

- [x] Oracle/structure подключать к той же формуле только после Task 5. Пока выдавать unavailable с причиной отсутствующих snapshot/score, не подменять полным score.
- [x] Focused tests/typecheck; review интервала/знака/границ/alpha budget; `feat(evals): add conservative comparison verdicts`.

## Task 4: Размеченная рубрика и чистый structural score

**Files:** task.ts, judge.ts, три task.json; task.test.ts, judge.test.ts, calibrate.test.ts.
**Consumes:** `loadTasks`, `rubricHash`, `agentInputsHash`, `scoreVerdict(checklist,verdict,threshold)`.
**Produces:** optional `ChecklistItem.axis`; в успешном результате scoreVerdict новый `structural_score: number|null` без округления. `judgedFields` переносит его в попытку.

- [x] RED в task.test.ts: временно скопировать core-задачу через существующие `cp/mkdtemp`; вручную поставить одному пункту `axis="structure"`; `loadTasks` должен вернуть axis. GREEN только validation/retention axis.
- [x] Следующие циклы: неизвестное значение отклоняется; отсутствие сохраняется отсутствием; axis изменяет rubric hash, inputs hash не меняется; старый hash неразмеченной fixture совпадает со снятым перед изменением значением.
- [x] RED scorer, используя существующие `checklist` и `verdict` из judge.test.ts:

```ts
test("scoreVerdict: провал результата не снижает структурный score", () => {
  const rubric = checklist.map((item) => ({ ...item, axis: item.id === "c" ? "result" as const : "structure" as const }))
  expect(scoreVerdict(rubric, verdict({ a: true, b: true, c: false }), 70)).toMatchObject({
    ok: true, score: 50, pass: false, structural_score: 100,
  })
})
```

- [x] `bun test test/judge.test.ts -t 'провал результата не снижает'` → RED; GREEN отдельная weighted sum только `axis==='structure'` после прежней проверки exact checklist IDs.
- [x] Следующие отдельные циклы: weighted structure 1/3→100/3 без округления; unclassified/нет structure → null; неверный verdict → прежняя ошибка; oracle=false при structure=100 сохраняет composite pass=false.
- [x] Разметить все пункты трёх core tasks как в spec. Для этого не писать отдельный scorer с ID allow-list. Не менять внешний набор.
- [x] `bun test test/task.test.ts test/judge.test.ts test/calibrate.test.ts`, typecheck; review не меняет прежние full score/pass/calibration; `feat(evals): separate structural checklist scoring`.

## Task 5: Snapshot, реальный run и judge-only lineage

**Files:** evaluation.ts, report.ts, run.ts, rejudge.ts; tests run/rejudge/report/compare-analysis.
**Consumes:** `Task`, result Task 4, `rubricHash(tasks)`.
**Produces:** `RunSummary.tasks[].rubric_snapshot` и `AttemptResult.structural_score/evaluation_contract_hash` из spec; все реальные и synthetic branches согласованы. `evaluationContractHash(input: { rubric_hash: string; judge: RunSummary["judge"]; pass_threshold: number }): string` — sync SHA256 canonical JSON с version=1 и judge fields из spec; input property names/порядок фиксированы.

- [x] RED через `main` в run.test.ts: dry-run создаёт сохранённый snapshot и known oracle applicability, но structural остаётся null при skip-judge. Пример core assertion:

```ts
const result = await main(["--dry-run", "--repeat", "1"], {
  EVAL_RESULTS_DIR: path.join(directory, "results"),
  EVAL_PROFILE_DIR: path.join(directory, "profile"),
  EVAL_WORKSPACE_ROOT: path.join(directory, "workspace"),
})
const saved = await Bun.file(path.join(result.runDir!, "summary.json")).json() as RunSummary
expect(saved.tasks.find((task) => task.id === "group-sum-qty")?.rubric_snapshot?.version).toBe(1)
expect(saved.tasks.flatMap((task) => task.attempts).every((attempt) => attempt.structural_score === null)).toBe(true)
```

Создать `directory` существующими `mkdtemp(path.join(os.tmpdir(), "evals-compare-run-"))` и удалить в finally; импортировать уже используемые main/path/os/RunSummary. Ни одного default results/profile пути в новом тесте.

- [x] Запуск одного теста → RED; GREEN сохранить snapshot из Task и initial null. Хеш рубрики, judge identity и pass threshold фиксировать до измерений и использовать одни и те же значения для evaluationContractHash, stamping и summary.
- [x] Следующие циклы через fixture judge: completed scored, no-artifact=0 при пригодной рубрике, error/infra/skip=null; score и oracle независимы. Явно использовать `EVAL_CLI_MODE=fake`, `EVAL_ARTIFACT_SOURCE=dir:...`, `EVAL_JUDGE_COMMAND=.../fake-codex.ts` в изолированном env.
- [x] RED через `main --judge-only`: сохранить одну прежнюю попытку, изменить rubric, пересудить другую. Новая оценка получает новый hash, сохранённая — прежний. Compare новой summary с полной новой summary блокирует неполную oracle/structure/reliability ось; completion сохраняется. GREEN менять только реально переоценённые branches и записать новый фактический `config.pass_threshold` вместе с judge identity.
- [x] Следующий отдельный RED: rubric_hash не меняется, judge model/prompt/schema меняется; сохранённая старая попытка не принимается за новую. Ещё один RED: тот же rubric/judge, новый threshold; summary хранит effective threshold, только переоценённая попытка получает его fingerprint.
- [x] Конкретный trigger сохранения старого результата: во временной fixture-run удалить у одной ранее scored попытки `unpacked/Unit_*/Unit.xml`, оставив соседнюю пригодной для пересудейства. Старую попытку должен сохранить реальный rejudge path, не mock.
- [x] Следующие циклы: no-artifact synthetic оценка получает current provenance; excluded/Ctrl+C попытка не получает чужую рубрику; legacy snapshot отсутствует → unavailable; oracle N/A отличается от error; сохранённый `pass=false` со старым hash не считается новой оценкой.
- [x] Подключить oracle/structure к analysis. Все applicable measured значения и их provenance должны быть известны; иначе описательные значения с reasons, без CI/verdict. Не читать task.json в compare.
- [x] Обновить общий `comparisonSummary` fixture под свежий контракт: добавить каждому task полный `rubric_snapshot` с одним пунктом `axis: "structure"`, weight=1, всеми flags=false, `oracle_applicable: true`, `oracle_tolerance: 0.01`; каждой попытке `evaluation_contract_hash`, вычисленный публичным `evaluationContractHash` по итоговому fixture summary, и structural_score=100/0 по исходному успеху. Для legacy/provenance tests удалять/менять эти поля явно. Это поддержка публичного serialized input, не обход gate и не восстановление исторических данных в production.
- [x] `bun test test/run.test.ts test/rejudge.test.ts test/report.test.ts test/compare-analysis.test.ts`, typecheck; review полноты branches; `feat(evals): preserve comparison evaluation provenance`.

## Task 6: Markdown и настоящий CLI compare

**Files:** compare.ts, compare.test.ts, новый compare-cli.test.ts, README.
**Consumes:** `ComparisonAnalysis`; `compare(a,b,options?)` сохраняет return string.
**Produces:** читабельный отчёт и CLI `compare <a> <b> [--margin 0.5] [--confidence 0.95] [--k 3]`.

- [x] RED публичного renderer:

```ts
test("compare: показывает неразличимость малого набора и параметры решения", () => {
  const run = comparisonSummary(Array.from({ length: 5 }, () => ({ successes: 3, attempts: 3 })))
  const text = compare(run, run)
  expect(text).toContain("неразличимо")
  expect(text).toContain("pass^1")
  expect(text).toContain("pass^3")
  expect(text).toContain("Hoeffding")
})
```

- [x] Запуск одного renderer test → RED; GREEN вызвать analysis и отобразить contract. Прежний тест отсутствия вычисления verdict обновить этим поведением; сохранить его проверку, что произвольная сырая дельта не объявляет improvement.
- [x] В существующем `compare.test.ts` default `summary` helper снабдить известными variant, judge schema и task limits; legacy tests должны явно убирать нужное поле. Не ослаблять анализ ради старых fixtures, где два неизвестных значения раньше считались равными.
- [x] Следующие циклы: guards по task ID с пометкой «наблюдаемый»; три отдельные оси; NI confirmed/rejected/inconclusive; coverage/mismatches/unknown; mean_score справочный; экранирование free text в Markdown.
- [x] RED CLI subprocess: записать два fixture summary во временный results root, запустить Bun executable `src/compare.ts`, передать `EVAL_RESULTS_DIR`; проверить stdout, report file и byte-identical исходные summary. GREEN использовать env results override только как путь; никакой profile/preflight/judge загрузки для compare.
- [x] Следующие отдельные CLI циклы: неверные значения/дубликаты/unknown flags/лишние аргументы/битый summary → exit 2; регресс, неполнота и несравнимость → отчёт exit 0. Предусмотреть проверку формы входного JSON на использованной границе; не оставлять слепой cast.
- [x] `bun test test/compare.test.ts test/compare-cli.test.ts test/compare-analysis.test.ts`; typecheck; `feat(evals): expose comparison verdicts in reports`.

## Task 7: Проверка noise floor, регрессии и документация

**Files:** script/check-compare-noise.ts, README, обе спеки/этот checkpoint/remaining-work пункт 1.
**Consumes:** публичный analysis; test fixture перенести в script нельзя — генерировать независимые simulation input summaries по тому же serialized public contract.
**Produces:** воспроизводимые результаты отдельной валидации, точная область доказанности.

- [x] Добавить script с фиксированным seed `20261005`, 20 000 сравнениями на сценарий и отдельным счётчиком inferential verdict/NI/observed guards; output во временный файл, не live results. Псевдослучайный генератор локальный, без переопределения Math.random.

Локальный RNG и входной bounded cluster (для dependent case одна draw повторяется трижды; для independent — новая draw на каждую попытку):

```ts
let state = 20261005
const random = () => {
  state = (Math.imul(1664525, state) + 1013904223) >>> 0
  return state / 4294967296
}
const observations = (probability: number, dependent: boolean) => {
  const shared = random() < probability
  return Array.from({ length: 3 }, () => dependent ? shared : random() < probability)
}
```

Каждый observations cluster сериализовать как три настоящих AttemptResult с
status completed/no_artifact и известными boolean pass/oracle; aggregates
получать из `aggregate/aggregateTask`. В summary использовать полные known
identity поля, explicit rubric snapshot и fingerprint Task 5. Решение и bounds
получать только из `analyzeComparison`; никакой второй реализации verdict в
script. Истинный drop задаётся вероятностями сценария, а не observed rates.
- [x] Сценарии T=5,25,39,100: unchanged p=.2,.5,.8; внутри задачи независимые повторы и полностью зависимые повторы; неодинаковые probabilities разных задач; направленная деградация. Между task groups генерация независимая, A/B зависимости задаются в сценарии.
- [x] Проверить false inferential worse/better для unchanged не выше 5% с заявленной Monte Carlo погрешностью; false NI только когда истинное падение > margin. Guard частоту публиковать отдельно, не считать её statistical 95% error. Проверить крайние deterministic fixtures и границы из Tasks 2–3.
- [x] Эта симуляция не заменяет доказательство assumptions и не оправдывает изменение margin под результаты. Если эксперимент противоречит bound/контракту, остановить приёмку и устранить ошибку алгоритма/симуляции до GREEN.
- [x] Из implementation `evals/` выполнить последовательно:

```sh
bun test
bun typecheck
bun run script/check-compare-noise.ts
```

- [x] Из implementation worktree выполнить `git diff --check`; независимый read-only review statistical contract, coverage, lineage, CLI isolation и scope. Исправление замечаний — следующий отдельный RED→GREEN цикл при изменении поведения.
- [x] README показывает реальное ограничение 5/25/39 задач, exchangeability для pass^k и необходимость новой рубрики/baseline после axis. Не объявлять новый baseline выполненным.
- [x] В remaining-work пункте 1 разделить implementation verified на fixtures и ещё не выполненный live baseline. Не менять статусы остальных задач.
- [x] `docs(evals): document comparison verdict validation`; записать SHA, числа тестов и точные команды после их выполнения.

## Checkpoint планирования — 2026-10-05

- [x] Цель `/goal` — планирование; подготовка и согласование плана завершены.
- [x] Прочитаны исходная задача, канон, owning AGENTS, public compare/report/task/judge/run/rejudge interfaces.
- [x] Пользователь подтвердил verdict+NI и conservative task-cluster вариант.
- [x] Исследование двумя независимыми explorer: statistical assumptions и реальные данные/lineage.
- [x] Текущие `bun test test/compare.test.ts test/report.test.ts`: **31 pass, 0 fail, 91 assertions**.
- [x] Текущий `bun typecheck` из основного `evals/`: exit 0.
- [x] Формулы/численные границы сверены с первичными источниками и независимым вычислением.
- [x] Независимый spec review: Approved после исправления полного evaluation lineage; открытых блокирующих замечаний нет.
- [x] Пользователь согласовал полный план, margin=0.5/confidence=0.95, structural schema и объём CLI 2026-10-05 ответом «Да, утверждаем».
- [x] Реализация Task 1–7 завершена; фактическая приёмка ниже.

Следующая точка реализации: создать worktree от проверенной базы, обновить
канонический контракт и начать только первый tracer test. Согласование этого
плана получено; повторно запрашивать его не нужно. Проверки новых verdict,
full suite, simulation и live Loginom в ходе планирования не выполнялись.
Goal планирования завершается после проверки записи утверждения и документов.

## Исторический checkpoint — начало реализации 2026-10-05

Worktree: `/home/kiselev/.codex/worktrees/compare-verdict/loginom-ai-agent`.
Ветка: `compare-verdict`; база `f40cc50572a669b8e31759fa6359334c4293aaec`
(документационный потомок проверенной продуктовой базы `2c06a3071`).
Основной checkout и живые eval-ресурсы не изменяются.
Перед RED: 31 focused tests pass, dev-зависимости установлены из evals/bun.lock.
Task 1 начата; остальные задачи ожидают её завершения.

## Checkpoint реализации — завершены Task 1–6

Ветка `compare-verdict`, отдельный managed worktree; production код только `evals/`.
Task 1–6 выполнены последовательными RED→GREEN циклами с отдельными коммитами.
Независимый итоговый read-only review кода и скрипта симуляции: no findings;
все прежние замечания устранены отдельными тестами. Последний production SHA
`042975124` (strict judge_status JSON validation).

Проверено: Task 4 — 45 pass/145 assertions; Task 5 — 80 pass/338 assertions;
Task 6 — 50 pass/181 assertions перед последними review-fixes, которые проверены
своими focused тестами. Typecheck на этих checkpoint: exit 0.
Task 7 завершена; фактические результаты следующего checkpoint заменяют
прежний статус ожидающей приёмки.

## Финальный checkpoint — Task 1–7 завершены

Проверено 2026-10-05 в отдельной ветке `compare-verdict`: `bun test` —
**285 pass, 0 fail, 1222 assertions, 19 файлов**; `bun typecheck` — exit 0.
`bun run script/check-compare-noise.ts` — exit 0: seed `20261005`,
44 сценария × 20 000 = **880 000 сравнений**. Ложных inferential worse/better
и ложных подтверждений NI при истинном падении > 0.5 не наблюдалось.
Односторонняя 95% Monte Carlo верхняя граница для нулевого счётчика —
**0.01498% на сценарий**; совместная MC-гарантия по сценариям не заявляется.
Частота observed guard при неизменных вероятностях составила
**0.00–100.00% сравнений** и учитывается отдельно.
В симуляции группы задач независимы, повторы независимы или полностью зависимы;
A/B независимы либо полностью спарены. Три оси полностью коррелированы.
Это проверка выбранных сценариев, а не доказательство всех возможных зависимостей.
Независимый read-only review кода и скрипта: открытых замечаний нет.
Новый live baseline после разметки рубрики не запускался.

Точные команды выполнены последовательно из implementation `evals/`:

```sh
bun test
bun typecheck
bun run script/check-compare-noise.ts > /tmp/evals-compare-noise.json
```

Production HEAD: `04297512496cbf8ffff9310389bcca7e2fc04d5f`.
SHA noise-validation-коммита: `2ad60efa335e25a3ced6ab28c049eb6713dedd30`; SHA документационного
коммита доступен в git log (коммит не может содержать свой собственный SHA).
Канон обновлён до первого изменения поведения; последовательные RED→GREEN
циклы и независимые reviews каждой задачи завершены. Финальный `git diff --check` — exit 0. Scope audit — PASS: изменены только
evals и согласованные документы (25 файлов); lockfiles не менялись.
Независимое read-only review пяти итоговых документов: no findings; числа
симуляции сверены с сохранённым JSON. Remaining-work вне пункта 1 побайтно совпадает с базой. Основной checkout, live results, profile, bundle и
внешние коллекции не изменялись. Runtime-код и зависимости вне evals не менялись.
Live baseline, установка, merge и push не выполнялись.


## Исправления после review — 2026-10-05

Оба подтверждённых замечания закрыты отдельными RED→GREEN циклами:

- `52a2c634a`: пять structural-пунктов с весом 0.53 и полным успехом больше
  не дают 100.00000000000001. Scorer ограничивает численное превышение 100;
  дробные промежуточные оценки не округляются. Новый тест проходит через
  scoreVerdict → сериализацию JSON → parseComparisonSummary → analyzeComparison.
- `32a331c5b`: пустая строковая `label`, которую принимает loadConfig/run,
  допустима в parser compare. Новый тест настоящего CLI проверяет exit 0,
  отчёт и побайтную неизменность входных summary.

Оба новых теста сначала дали RED именно на найденных дефектах.
После исправлений проверено из implementation `evals/`:

```sh
bun test test/judge.test.ts test/calibrate.test.ts test/rejudge.test.ts test/report.test.ts test/compare-analysis.test.ts test/compare.test.ts test/compare-cli.test.ts
bun typecheck
```

**110 pass, 0 fail, 404 assertions, 7 файлов**; typecheck — exit 0.
Первый запуск расширенной проверки в sandbox получил EROFS при создании
fixture-results в отдельном worktree. Повтор с доступом на запись прошёл;
это ограничение среды, код и assertions для обхода ошибки не менялись.
`git diff --check` — exit 0. Основной checkout чистый.
Полный suite и Monte Carlo повторно не запускались: изменения ограничены
численной границей scorer и строковой меткой, статистическое правило не менялось.
Live judge/baseline, установка, merge и push не выполнялись.
