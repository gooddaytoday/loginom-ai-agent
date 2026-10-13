# Loginom Standard Node Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Стандартные поддерживаемые узлы используются по умолчанию; JavaScript допускается по явному запросу или для подтверждённого функционального пробела.

**Architecture:** Изменить канонический Product skill и его workflow. Проверять поведение реальной модели локальным CLI на текущем подключении Loginom, используя существующие аналитические задания и oracle; отдельный offline-аудит проверяет типы узлов и все сохранённые tool calls. Общий eval runner и runtime-контракты не меняются.

**Tech Stack:** Markdown, Bun 1.3.14, TypeScript, Python 3 stdlib SQLite/CSV, Loginom 7.4.2, standalone CLI и его pinned Node/Chromium.

**Spec:** [Согласованный дизайн](../specs/2026-10-13-loginom-node-selection-design.md).

## Global Constraints

- Проверочные запуски выполняются локально в текущей системе с текущим подключением Loginom.
- Выделенный стенд, новый тестовый Loginom и перенос live-проверок в контейнеры не требуются.
- Пользователь отдельно подтвердил: ошибка настройки или выполнения поддержанного стандартного узла не разрешает переход на JS.
- Канонический источник: `packages/product/skills/loginom-automation/SKILL.md` и `references/workflow.md`.
- Общий `evals/src/run.ts` остаётся со своим контрактом изоляции.
- Нельзя очищать пользовательскую историю, Loginom storage, чужие пакеты или процессы.
- Секреты не копируются в отчёт или Git.
- Тесты и `bun typecheck` запускать из соответствующего package, не из корня.
- Работа в ветке `node-javascript`. Перед изменениями проверять фактические HEAD/status и `git worktree list`; состояние других checkout не считать неизменным.
- Этот документ планирует реализацию; его создание не означает запуск реализации или live-приёмки.

Заголовок выше сохраняет шаблон writing-plans. Если названные superpowers skills
не зарегистрированы, использовать доступные collaboration workers с явным
владением файлами и review после задачи; автоматически устанавливать skills
не требуется. При разработке кода внутри `evals/` соблюдать его AGENTS и TDD.

## Файлы и ответственность

| Файл | Действие и назначение |
| --- | --- |
| `packages/product/skills/loginom-automation/SKILL.md` | Обязательное правило выбора |
| `packages/product/skills/loginom-automation/references/workflow.md` | Процедура выбора, fallback, восстановление |
| `evals/src/node-selection.ts` | Новый чистый аудит структуры и tool parts, без запуска CLI |
| `evals/test/node-selection.test.ts` | Негативные и положительные тесты аудита |
| `evals/script/audit-node-selection.ts` | Новый offline entrypoint, загрузка пакета/CSV/evidence |
| `evals/fixtures/node-selection/` | Дополнительные входы, prompts и независимые oracle |
| `evals/docs/2026-10-13-node-selection-local.md` | Команды и формат локальных доказательств |
| `docs/testing/loginom-ai-agent/reports/2026-10-13-node-selection-local.md` | Итог всех проверок и ограничения |

Существующие `task.json`, SPEC, reference и oracle аналитического корпуса не
редактировать. Никаких новых публичных параметров `dock_node_apply`, policy
блокировок runtime, копий skill или изменений judge prompt.

## Task 1: Независимый offline-аудит выбора узлов

**Files:** создать `evals/src/node-selection.ts`, `evals/test/node-selection.test.ts`,
`evals/script/audit-node-selection.ts` и локальный runbook из таблицы выше.

**Interfaces:**
- Consumes: `readNodeXml(artifactDir)` из `src/node-xml.ts`, `checkOracle(task, artifactDir)`
  из `src/oracle.ts`, `loadTasks(dir, only)` из `src/task.ts`; полный JSON snapshot
  всех parts/messages только текущей Session, её runtime-журналы, сырой stdout
  и метаданные попытки.
- Produces: `inspectSelection({ mode, nodeTypes, parts })` с полями
  `{ jsNodes, jsCalls, successfulJsCalls, failures }`; CLI-аудит пишет
  `selection-audit.json` с раздельными `policyStatus:passed|failed|incomplete`,
  `oraclePassed:true|false|null`, `calculationPassed`, `historyComplete`,
  `runtimeSettled` и причиной отказа. Код 0 — все требуемые машинные проверки,
  1 — наблюдённый провал, 2 — неполные доказательства; отдельные оси всегда
  сохраняются, даже если общий код ненулевой.
- `mode`: `standard | explicit-js | capability-gap | capability-gap-reuse | standard-recovery`.
  Проверку семантики графа/роли JS выполняет независимый reviewer отдельно.

- [ ] Зафиксировать формат `<attempt>/attempt.json` в runbook. Обязательные поля:
  `sessionID`, `cliExitCode`, `mode`, `taskID`, `model`, `variant`,
  `expectedSkillDigest`, `packagePath`, `resultPath`, `startedAt`, `finishedAt`,
  `binaryManifestSha256`, `modelStarted`, `timedOut`, `interruptSentAt`.
  Неизвестные пути отсутствующих артефактов записывать null.
  Наблюдённый `skillDigest` и `knowledge.node_types` извлекать из полного
  `dock_prepare`; сверять с metadata активации и digest всего дерева
  `loginom-automation` из `verifyBundledSkills` проверенного payload.
  `historyComplete`/`runtimeSettled` — вычисляемые выходы аудита, не поля входа.
  Для reuse дополнительно обязательны `originalAttempt` (путь к исходной
  успешной попытке), SHA её пакета/audit/review и выбранного `oracle-reuse.csv`.
  Модель/variant сверять с messages и pins, отсутствие сведений не угадывать.
  Приложить `events.jsonl`, `parts.json`, `stderr.txt`, `prompt.txt`,
  `artifact/package.lgp`, `artifact/unpacked/`, `artifact/results/*.result.csv`.

- [ ] Добавить по одному падающему тесту поведения. Начать с неудачной JS-попытки,
  отсутствующей в финальном пакете:

```ts
import { expect, test } from "bun:test"
import { inspectSelection } from "../src/node-selection"

test.each(["pending", "running", "completed", "error"])(
  "standard rejects a JavaScript call in state %s even when final graph has no JS",
  (status) => {
    const result = inspectSelection({
      mode: "standard",
      nodeTypes: ["TBGImportTextFile", "TBGExportTextFile"],
      parts: [{ id: "part-js", type: "tool", tool: "loginom_dock_node_apply",
        state: { status, input: { target: { type: "programming.javascript" } } } }],
    })
    expect(result.jsCalls).toBe(1)
    expect(result.failures).toContain("JAVASCRIPT_NOT_ALLOWED")
  },
)
```

- [ ] Из `evals/` выполнить `bun test test/node-selection.test.ts`; убедиться,
  что первый тест падает из-за отсутствующей реализации, а не окружения.

- [ ] Реализовать минимальный чистый анализ. Использовать `unknown` и guards,
  без `any` и без поиска слов JS в произвольном тексте. Базовые контракты:

```ts
export type SelectionMode = "standard" | "explicit-js" | "capability-gap" | "capability-gap-reuse" | "standard-recovery"

export function inspectSelection(input: {
  mode: SelectionMode
  nodeTypes: string[] | null
  parts: unknown[]
}): { jsNodes: number | null; jsCalls: number; successfulJsCalls: number; failures: string[] } {
  const calls = input.parts.flatMap((part) => readApply(part, input.parts))
  const failures = calls.flatMap((call) => call.failure ? [call.failure] : [])
  const jsNodes = input.nodeTypes?.filter((type) =>
    ["TBGJavaScriptEngine", "TBGCodeModelComponentEngine"].includes(type)).length ?? null
  const jsCalls = calls.filter((call) => call.nodeType === "programming.javascript").length
  const successfulJsCalls = calls.filter((call) =>
    call.nodeType === "programming.javascript" && call.succeeded).length
  const standard = input.mode === "standard" || input.mode === "standard-recovery"
  if (standard && (jsNodes || jsCalls)) failures.push("JAVASCRIPT_NOT_ALLOWED")
  if (!standard && !jsNodes) failures.push("JAVASCRIPT_NODE_REQUIRED")
  if (!standard && input.mode !== "capability-gap-reuse" && !successfulJsCalls)
    failures.push("JAVASCRIPT_EXECUTION_REQUIRED")
  return { jsNodes, jsCalls, successfulJsCalls, failures }
}
```

  Реализовать в этом же модуле `readApply(part: unknown, parts: unknown[])` с
  результатом `Array<{ nodeType?: string; succeeded: boolean; failure?: string }>`:
  не-tool и не-node_apply пропускаются;
  для `*_node_apply` необходимы id, state, известный status и `input.target.type`.
  Пустой input у pending/running означает `TOOL_INPUT_INCOMPLETE`: `state.raw`
  в текущем processor всегда пустой и не восстанавливает запрос.
  Другие отсутствующие поля означают
  `TOOL_EVIDENCE_INVALID`. `succeeded` требует terminal completed и квитанции
  `status:SUCCEEDED`, `execution.status:completed`, `cleanup_complete:true`.
  Ответ со `state:"running"` хранится completed part с
  `state.metadata.loginomPending:true`. Финальную квитанцию искать также
  среди node_wait/node_resume с тем же operation_id, Session и node identity.
  Чужая квитанция успеха или неподтверждённый running успехом не являются.
  Ошибки читать из `state.error`, успешные ответы из `state.output`.
  При `state.metadata.truncated:true` entrypoint загружает полный результат из
  сохранённого `outputPath` до чистого анализа; summary не считать JSON-квитанцией.
  Для обрезанного error part
  metadata.outputPath может отсутствовать: восстановить по полной собственной
  runtime-квитанции либо отметить неполноту. Полный ответ относится к тому же
  part/operation; не подставлять ответ другой попытки.
  Файловое чтение и нормализация полных ответов выполняются только entrypoint:
  он передаёт копию parts в чистый анализ, сохраняет ссылки на исходные evidence
  и не переписывает исходный snapshot, input, status или identity вызова.
  JS-попытки из parts сверять с `node_apply_prepared.request.target.type` в журнале.
  Контекст/output разбирать структурно; существующий `parseEvents` допустим
  только для вспомогательных метаданных, его обрезанные receipts не использовать.

- [ ] Добавлять тесты по одному с red/green: JS в другом workflow пакета;
  обычное строковое значение `JavaScript` не является вызовом; native-only PASS;
  неизвестный/пустой input не становится нулём JS; failed JS не подтверждает
  explicit override; успешный JS+пакет допускается только в разрешённых режимах.
  Проверить повреждённый JSON, противоречивые дубли part ID, отсутствие snapshot,
  completed+loginomPending→wait→SUCCEEDED и отказ принять wait другой операции,
  обрезанный output/error, exit 0 при отказе Loginom, completed с AMBIGUOUS,
  cleanup_complete:false, missing oracle (`passed:null`) и invalid XML.
  Для reuse проверить PASS без нового JS apply при доказанной исходной попытке,
  отказ без неё/при смене JS или связей, применение второго oracle вместо первого.
  Source/context receipt без apply-status должен допускаться при собственном
  подтверждённом cleanup; чужой owner и cleanup_complete:false — incomplete.
  Missing package даёт `jsNodes:null` и `calculationPassed:false`; при полной
  трассе policy может быть подтверждена отдельно. Битый существующий XML нельзя
  приравнивать к отсутствующему пакету или пустому списку типов.
  Нативный успешный пакет брать из реального analytic reference, JS engine —
  из минимального ZIP/XML fixture; не писать копию production-парсера в тестах.

- [ ] Реализовать offline entrypoint с `parseArgs` и следующей командой:

```bash
bun script/audit-node-selection.ts --tasks tasks/analytic \
  --task sales-by-category --attempt "$selection_attempt" --mode standard
```

  Он вызывает `loadTasks`, `readNodeXml`, `checkOracle`, `inspectSelection`.
  Для `capability-gap-reuse` требовать `--task tags` и `--original-attempt`
  с полными evidence первой успешной `capability-gap` попытки. Только в этом
  режиме передавать `checkOracle({ ...task, oracle: "oracle-reuse.csv" }, artifactDir)`;
  файл берётся из `task.dir`, должен существовать и совпадать с заранее pinned SHA.
  В остальных режимах используется исходный `task.oracle`; общий loader/runner
  не менять. Выбранный oracle и его SHA включать в audit, отсутствие — incomplete.
  `readNodeXml` и `checkOracle` получают именно `<attempt>/artifact`.
  `readNodeXml.invalid` — отказ, `checkOracle.passed:null` — не PASS.
  Аудит вычисляет:
  - `historyComplete`: единый Session ID в stdout/snapshot, нет дочерних сессий
    по `session.parent_id`, каждый terminal tool part stdout есть в snapshot
    с тем же ID/status/input; нет pending/running и неизвестных inputs.
  - `runtimeSettled`: для каждой admitted операции (в том числе
    `node_apply_prepared`) и каждого loginomPending/running-ответа найден последний
    результат той же операции внутри того же runtime attempt/Dock UUID по
    контракту конкретного инструмента. Для apply/delivery/save проверять
    `SUCCEEDED|FAILED|NOT_APPLIED`, `cleanup_complete:true`, отсутствие pending/active.
    Source/context read не имеют apply-outcome: проверять owner-bound receipt,
    operation/node identity и `cleanup_complete:true`; для их wait/status —
    `state:settled`, `progress.cleanup_complete:true`, `pending_phase:null` и
    отсутствие незавершённого чтения. `outcome:null` у этих read штатен.
    События `completed`, `node_checkpoint` или `state:"settled"` сами по себе
    недостаточны: completed допускает AMBIGUOUS, а синтаксический отказ
    Калькулятора не обязательно пишет node_checkpoint.
  Неизвестный формат/противоречие даёт incomplete. Терминальный отказ может
  закрывать операцию, но не делает расчёт успешным. `cliExitCode===0` необходим
  для полного расчётного успеха, но не заменяет успешных Loginom-квитанций.
  Digest/catalog/model должны быть подтверждены для оценки policy.
  Сопоставляет
  успешные JS-квитанции с GUID/типами пакета; для allowed-JS при потере identity
  требуется неполнота доказательств, а не предположение о совпадении.
  В reuse исходная успешная JS-квитанция и role review берутся из проверенной
  первой попытки. В текущей нужны неизменный вычислительный XML, полная трасса,
  новое исполнение сохранённого графа, пакет и второй CSV/oracle; новый JS apply
  не обязателен и не провоцируется. Отсутствие исходных доказательств — incomplete.
  Для recovery отдельно выводит `policyStatus` и `calculationPassed`:
  честный блокер не превращается в успешный расчёт и не скрывает ненулевой exit.
  На первом реальном JS-пакете подтвердить XML-тип; пока оба исторических имени
  считаются JS консервативно. Для explicit-js машинно требовать ровно один JS,
  native import/sorting/export, отсутствие `TBGGroupDataEngine`; для tags —
  ровно один JS и `TBGGroupDataEngine`, `TBGSortingEngine`, `TBGExportTextFile`.
  Связность/порядок и смысл JS проверяет отдельный reviewer без права менять
  skill, записывая verdict по checklist в `<attempt>/graph-review.json`.
  Не запускать модель, браузер, судью или cleanup из этого entrypoint.

- [ ] Повторить `bun test test/node-selection.test.ts test/oracle.test.ts`,
  затем `bun typecheck` из `evals/`.
- [ ] Закоммитить только новые audit/runbook файлы:
  `test(evals): audit standard node selection from saved evidence`.

## Task 2: Точные дополнительные сценарии и независимые oracle

**Files:** создать `evals/fixtures/node-selection/{explicit-js,tags,recovery}/`.
Не включать их автоматически в analytic benchmark: это дополнительная локальная
приёмка с отдельными режимами.

**Interfaces:** fixtures передают prompt+input модели, oracle+ожидания только
проверяющему. Offline entrypoint получает тот же Task-контракт через отдельный
`--tasks` каталог с `task.json`, `SPEC.md` и `oracle.csv`; для diagnostic fixtures
использовать `output_mode:diagnostic`, чтобы `loadTasks` не требовал чужой reference.
Успешный результат всё равно проверять CSV-oracle, а сохранение задавать явным
техническим хвостом, одинаковым внутри серии.

Каждый `task.json` содержит `id` (совпадает с каталогом), `title`, полный `prompt`,
`inputs:["data/dataset.csv"]`, `spec:"SPEC.md"`, `expected_output`,
`output_mode:"diagnostic"`, `timeout_ms:1800000`, `oracle_tolerance:0.01`,
непустой `checklist` из `{id,text}`. В checklist отдельно указать вычисления,
точные колонки/порядок/значения и допустимую роль JS. Diagnostic нужен только
для отсутствующего reference; в `buildAgentPrompt` НЕ передавать `outputMode`.

- [ ] `explicit-js`: скопировать только вход `sales-by-category` и его oracle.
  В исходном prompt после требования средних, перед «Упорядочь» вставить фразу
  «Агрегацию по категориям выполни узлом JavaScript»; колонки/сортировку сохранить.
  В checklist нового fixture заменить `group-category` на требование агрегации
  именно JS, штатные импорт/сортировку/экспорт. Не копировать конфликтующий пункт,
  требующий GroupData, и не менять оригинальные prompt/checklist корпуса.

- [ ] Создать `tags/data/dataset.csv`:

```csv
OrderID,Tags
1,red;blue;red
2,blue;;green;
3,; red ;
4,
```

  Prompt: «Построй повторно используемый сценарий подсчёта частот меток. Поле Tags
  содержит список меток через `;`. Разверни каждую непустую метку в отдельную
  строку, обрежь пробелы по краям, сохрани повторы, пустые элементы и Null
  пропускай. Посчитай число вхождений каждой метки, отсортируй по Tag по возрастанию
  и выгрузи Tag,Occurrences. Число меток заранее неизвестно; при замене входного
  файла тем же форматом сценарий должен работать без изменения графа, выражений
  и списка полей. Не фиксируй число позиций и сами метки по примеру данных».

  Oracle: `Tag,Occurrences\nblue,2\ngreen,1\nred,3\n`.
  Второй вход: OrderID=9, 150 элементов `red` и один `blue` в том же поле;
  oracle: `Tag,Occurrences\nblue,1\nred,150\n`. Генератор второго входа:

```python
import csv
import sys

with open(sys.argv[1], "w", newline="", encoding="utf-8") as target:
    writer = csv.writer(target, lineterminator="\n")
    writer.writerow(["OrderID", "Tags"])
    writer.writerow([9, ";".join(["red"] * 150 + ["blue"])])
```

- [ ] Создать независимый `tags/oracle.py` с этим расчётом и вывести оба oracle
  до модельного запуска: первый в `tags/oracle.csv`, второй в
  `tags/oracle-reuse.csv`; проверять совпадение с приведёнными выше значениями:

```python
import csv
import sys
from collections import Counter

with open(sys.argv[1], newline="", encoding="utf-8") as source:
    counts = Counter(tag.strip()
                     for row in csv.DictReader(source)
                     for tag in (row["Tags"] or "").split(";")
                     if tag.strip())
writer = csv.writer(sys.stdout, lineterminator="\n")
writer.writerow(["Tag", "Occurrences"])
writer.writerows(sorted(counts.items()))
```

- [ ] Записать в tags SPEC доказательство пробела: `calculator-parameters.mjs`
  задаёт фиксированные scalar-поля; `collapse-parameters.mjs` — фиксированные
  колонки; `union-parameters.mjs` — фиксированное число таблиц; в фактическом
  каталоге отсутствует dynamic split-to-rows/цикл/генератор. Перед live сверить
  схемы с установленным candidate. Не выдавать пару конечных CSV за доказательство
  невозможности любой стандартной композиции. Требование повторного использования
  без фиксированного числа позиций является частью задачи.
  Превышение 128 в повторном CSV — проверка чувствительности к простому потолку,
  не доказательство невозможности нескольких стандартных узлов. Стандартный
  граф с фиксированным потолком нарушает требование задачи, но не запрет JS.

- [ ] Создать recovery input:

```csv
Category,Revenue,Cost
A,100,60
A,50,35
B,80,30
B,20,8
```

  Prompt: «Подготовь Калькулятор с полем Profit, первоначально равным Revenue,
  и выполни его. Затем один раз проверь в Loginom формулу `Revenue -`, изменяя
  существующее выражение Profit без изменения связей. Эту проверку синтаксиса
  не заменяй предварительным исправлением текста. Если Loginom отклонит формулу,
  заверши расчёт прибыли как Revenue минус Cost, посчитай сумму Profit по Category,
  отсортируй по суммарной прибыли по убыванию, сохрани пакет. Выгрузи CSV только
  с колонками Category,Profit».

  Oracle: `Category,Profit\nB,62\nA,55\n`. Независимый `recovery/oracle.py`:

```python
import csv
import sys
from collections import defaultdict
from decimal import Decimal

totals = defaultdict(Decimal)
with open(sys.argv[1], newline="", encoding="utf-8") as source:
    for row in csv.DictReader(source):
        totals[row["Category"]] += Decimal(row["Revenue"]) - Decimal(row["Cost"])
writer = csv.writer(sys.stdout, lineterminator="\n")
writer.writerow(["Category", "Profit"])
writer.writerows(sorted(totals.items(), key=lambda pair: (-pair[1], pair[0])))
```

- [ ] В recovery SPEC требовать верхний `NODE_APPLY_STOPPED` с вложенным
  `error.cause.code:"WIZARD_CALCULATOR_VALIDATION_FAILED"` и собственное событие
  `node_phase_refused` с
  `receipt.verification:"calculator_syntax_rejected_draft_restored"`,
  затем тот же GUID Калькулятора с правильной формулой или явно сохранённый blocker.
  Сверять operation_id и node identity в обоих доказательствах.
  Если отказ не произошёл, записывать `recovery_unobserved`: ветка непроверена
  даже при правильном CSV, но skill из-за этого не менять. Prompt подсказывает
  исправление: этот тест не подтверждает самостоятельную диагностику модели.
- [ ] Проверить загрузку всех трёх fixtures через `loadTasks`, независимые oracle,
  отсутствие answers/oracle в модельных inputs. Закоммитить:
  `test(evals): add javascript exception and recovery cases`.

## Task 3: Зафиксировать локальное окружение и baseline до изменения skill

**Files:** только приватное evidence под `evals/results/node-selection-local/`
и runbook; до завершения baseline не менять Product skill.

**Interfaces:** produces `pins.json`, baseline payload и 18 каталогов попыток.
Те же параметры и способ запуска затем потребляет candidate-серия.

- [ ] Проверить `git status --short`, ветку и HEAD. Сохранить diff/hash файлов
  skill и `git worktree list`. Убедиться, что никто не меняет исходники/ветку
  во время сборки; не полагаться на старые сведения о ветке основного checkout.
- [ ] Перед командами задать базовые переменные в Bash:

```bash
selection_repo=/home/kiselev/.codex/worktrees/4118/loginom-ai-agent
selection_run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
selection_root="$selection_repo/evals/results/node-selection-local/$selection_run_id"
selection_profile=/home/kiselev/.config/com.loginom.aiagent/cli/profiles/default
selection_cli=/home/kiselev/.local/bin/loginom-ai-agent-cli
selection_resources="/home/kiselev/.local/share/loginom-ai-agent-acceptance/node-selection-$selection_run_id"
selection_baseline="$selection_resources/baseline"
selection_candidate="$selection_resources/candidate"
umask 077
mkdir -p -- "$selection_root"
mkdir -- "$selection_resources"
```

  Повторный запуск подготовки не заменяет существующие каталоги.
- [ ] Проверить текущее подключение, без изменения настроек:

```bash
LOGINOM_AI_AGENT_CLI_PROFILE="$selection_profile" \
  "$selection_cli" loginom status --headless --format json > "$selection_root/status.json"
selection_status_exit=$?
if [ "$selection_status_exit" -ne 0 ]; then exit "$selection_status_exit"; fi
LOGINOM_AI_AGENT_CLI_PROFILE="$selection_profile" \
  "$selection_cli" loginom check --headless --format json > "$selection_root/check.json"
selection_check_exit=$?
if [ "$selection_check_exit" -ne 0 ]; then exit "$selection_check_exit"; fi
```

  Проверить также `state/failure/recoveries`: status может вернуть exit 0
  при незавершённом recovery. При 3/4 серию остановить и сохранить machine code:
  3 у run — PROFILE_BUSY, у management возможны и другие conflicts; 4 означает
  recovery/uncertainty. Если подключение не подтверждено, не сбрасывать чужую lease.
  Endpoint не заменять тестовым. Фактически найденные контейнеры
  `loginom-server-7.4.2-test`/`loginom-client-7.4.2-test` являются кандидатами для
  read-only copy-out, а не доказательством соответствия профилю. Перед каждой
  следующей попыткой повторять headless status и проверку writer/cleanup.

- [ ] Получить username/folder из публичного status, не из `cli-profile.json`
  (там только marker). Успешный JSON — сам View без обёртки:

```bash
python3 - "$selection_root/status.json" "$selection_root/status-identity.txt" <<'PY'
import json
import sys
from pathlib import Path

status = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))
if not isinstance(status, dict) or status.get("ok") is False:
    raise SystemExit("LOGINOM_STATUS_INVALID")
username, folder = status.get("username"), status.get("folder")
if (not isinstance(username, str) or not username or username in (".", "..")
        or any(c in "/\\" or ord(c) < 32 or ord(c) == 127 for c in username)
        or folder != "/" + username):
    raise SystemExit("LOGINOM_STATUS_PATH_INVALID")
if status.get("recoveries") or status.get("failure"):
    raise SystemExit("LOGINOM_STATUS_BLOCKED")
Path(sys.argv[2]).write_text(username + "\n" + folder + "\n", encoding="utf-8")
PY
selection_parse_exit=$?
if [ "$selection_parse_exit" -ne 0 ]; then exit "$selection_parse_exit"; fi
mapfile -t selection_identity < "$selection_root/status-identity.txt"
selection_username="${selection_identity[0]}"
selection_folder="${selection_identity[1]}"
```

- [ ] Зафиксировать модель и variant, которыми проверяется skill: взять текущую
  доступную модель профиля, проверить через штатные `models`, явно передавать её
  во все run. Сохранить provider/model, variant и фактические model metadata
  созданных сообщений. Не менять модель между baseline/candidate и не считать
  модель судьи моделью агента. Исходная рекомендация при доступности —
  `openai/gpt-6.1-sol` / `medium`; отсутствие доступа — причина выбрать доступную
  модель до начала обеих серий, а не заменять её посреди сравнения.

```bash
selection_model=openai/gpt-6.1-sol
selection_variant=medium
```

  Эти значения применять только после подтверждения доступности предыдущим шагом.

- [ ] Подготовить полный pinned Node с npm и постоянную копию Chromium.
  Установленный `0.1.17-prod` содержит Chromium 1243 и не содержит соседнего npm;
  он не подходит как источник сборки текущего HEAD. Проверенные 2026-10-13 пути:

```bash
selection_node=/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006/node-v24.19.0-linux-x64/bin/node
selection_browser_source=/tmp/javascript-local-e14433a98-3bp691ii/candidate/resources/loginom/browsers
selection_browsers="$selection_resources/browsers"
test -f "$(dirname "$selection_node")/../lib/node_modules/npm/bin/npm-cli.js" || exit 2
test -f "$selection_browser_source/chromium-1246/chrome-linux64/chrome" || exit 2
test ! -e "$selection_browsers" || exit 2
cp -a -- "$selection_browser_source" "$selection_browsers"
python3 - "$selection_repo/packages/product/loginom-release.json" "$selection_node" "$selection_browsers/chromium-1246/chrome-linux64/chrome" <<'PY'
import hashlib
import json
import sys
from pathlib import Path

pins = json.loads(Path(sys.argv[1]).read_text())
for source, expected in [(sys.argv[2], pins["nodeSha256"]), (sys.argv[3], pins["browserSha256"])]:
    hasher = hashlib.sha256()
    with open(source, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            hasher.update(chunk)
    digest = hasher.hexdigest()
    if digest != expected:
        raise SystemExit("BUILD_INPUT_HASH_MISMATCH")
    print(Path(source).name, digest)
PY
selection_hash_exit=$?
if [ "$selection_hash_exit" -ne 0 ]; then exit "$selection_hash_exit"; fi
```

  Подтверждённые SHA: Node
  `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`, Chromium
  `1e0652a37f41d22ca22066c40896398cb7acce71f2746028061064369b299ab9`.
  `/tmp` — проверенный доступный источник, не утверждение, что он единственный.
  Если он исчез, сборку остановить до нахождения ресурса с тем же pin.
  Node/npm/browser не скачивать и pins не менять. HOME/XDG не переопределять.

- [ ] Из `packages/loginom-host` собрать baseline в новый каталог:

```bash
LOGINOM_AI_AGENT_CHANNEL=prod \
LOGINOM_AI_AGENT_NODE_SOURCE="$selection_node" \
LOGINOM_AI_AGENT_BROWSER_SOURCE="$selection_browsers" \
  bun script/build-cli.ts "$selection_baseline" --no-archive
bun script/verify-cli-candidate.ts "$selection_baseline" "$selection_repo"
```

  Требуется pinned Bun `1.3.14` revision `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`.
  Сборщик проверяет версии/manifest. Не править установленный resources tree на месте.
  При невозможности сборки записать блокер; старый installed CLI не подменяет baseline
  текущей ветки, особенно если в нём отсутствует JavaScript.

- [ ] Сохранить `pins.json`: SHA/tree/dirty, manifests, все skill file hashes,
  модель/variant, task prompt/input/oracle hashes, Loginom version, каталог типов,
  endpoint identity без credentials, ограничения времени. Подтвердить наличие
  `programming.javascript` в baseline: иначе ноль JS не проверяет выбор модели.
  Проверить отдельно `cfg.skills.paths`: flags ниже отключают home-discovery,
  но не этот канал. Наличие внешнего eval-skill/ответов в контексте делает серию
  несопоставимой; не менять пользовательскую конфигурацию молча.

- [ ] Для каждой из шести задач × трёх повторов создать новый workspace вне
  checkout и новый каталог evidence. В workspace копировать только inputs.
  Присвоить уникальный server prefix `node-selection-<run-id>-<task>-b<attempt>`
  в текущей доступной пользовательской папке, подтверждённой prepare/status.
  В первой попытке значения задать так; затем перебрать шесть ID из spec и номера
  1..3 без замены неудачных модельных попыток:

```bash
selection_tasks=tasks/analytic
selection_task=sales-by-category
selection_phase=baseline
selection_attempt_no=1
selection_task_directory="$selection_repo/evals/$selection_tasks/$selection_task"
selection_prefix="node-selection-$selection_run_id-$selection_task-$selection_phase-$selection_attempt_no"
selection_attempt="$selection_root/$selection_phase/$selection_task/$selection_attempt_no"
selection_workspace="$(mktemp -d /home/kiselev/.cache/node-selection-inputs.XXXXXXXX)"
selection_package_path="$selection_folder/$selection_prefix.lgp"
selection_result_name="$selection_prefix.result.csv"
test ! -e "$selection_attempt" || exit 2
mkdir -p -- "$selection_attempt/artifact/results"
cp -- "$selection_task_directory/data/dataset.csv" "$selection_workspace/dataset.csv"
```

  Для fixtures `selection_tasks=fixtures/node-selection`; каждый из этих inputs
  тоже расположен в `data/dataset.csv`. Для расширения списка входов повторять
  `task.inputs → basename` штатного runner, не прикладывать весь каталог задачи.
  Prompt собрать через `loadTasks` и `buildAgentPrompt` с этими путями. Сохранить
  следующий временный helper в `evals/results/node-selection-local/prompt.ts`:

```ts
import { loadTasks, buildAgentPrompt } from "../../src/task"
const tasks = await loadTasks(process.argv[2]!, [process.argv[3]!])
await Bun.write(process.argv[4]!, buildAgentPrompt(tasks[0]!.prompt, process.argv[5]!, process.argv[6]!))
```

  Из `evals/` запускать его так:

```bash
bun results/node-selection-local/prompt.ts "$selection_tasks" "$selection_task" \
  "$selection_attempt/prompt.txt" "$selection_package_path" "$selection_result_name"
```

  Три аргумента `buildAgentPrompt` сохраняют обычный хвост даже для diagnostic
  fixtures; четвёртый `outputMode` сюда не передаётся. Не передавать модели
  helper, task.json, SPEC, reference или oracle.

- [ ] Выполнить каждую попытку отдельным процессом, последовательно.
  Python-supervisor владеет PID CLI и реализует deadline независимо от
  ожидающего агента. Сам блок запускать через exec с выдачей управления не реже
  60 секунд, чтобы получать прогресс и сообщения пользователя:

```bash
LOGINOM_AI_AGENT_CLI_PROFILE="$selection_profile" \
LOGINOM_AI_AGENT_PURE=1 \
LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1 \
LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1 \
LOGINOM_AI_AGENT_DISABLE_EXTERNAL_SKILLS=1 \
LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_SKILLS=1 \
  python3 - "$selection_baseline/bin/loginom-ai-agent-cli" "$selection_workspace" \
  "$selection_model" "$selection_variant" "$selection_attempt" "$selection_prefix" <<'PY'
import json
import signal
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

binary, workspace, model, variant, directory, title = sys.argv[1:]
attempt = Path(directory)
supervision = {"timeoutSeconds": 1800, "timedOut": False, "interruptSentAt": None,
               "startedAt": datetime.now(timezone.utc).isoformat()}
with (attempt / "prompt.txt").open("rb") as prompt, \
        (attempt / "events.jsonl").open("wb") as output, \
        (attempt / "stderr.txt").open("wb") as errors:
    process = subprocess.Popen([binary, "run", "--headless", "--format", "json",
        "--model", model, "--variant", variant, "--command", "loginom-automation",
        "--dir", workspace, "--title", title, "--file", str(Path(workspace) / "dataset.csv")],
        stdin=prompt, stdout=output, stderr=errors)
    (attempt / "cli.pid").write_text(str(process.pid) + "\n")
    (attempt / "supervision.json").write_text(json.dumps(supervision))
    try:
        code = process.wait(timeout=1800)
    except subprocess.TimeoutExpired:
        supervision.update(timedOut=True, interruptSentAt=datetime.now(timezone.utc).isoformat())
        (attempt / "supervision.json").write_text(json.dumps(supervision))
        process.send_signal(signal.SIGINT)
        try:
            code = process.wait(timeout=90)
        except subprocess.TimeoutExpired:
            supervision["blocker"] = "CLI_EXIT_UNCONFIRMED"
            (attempt / "supervision.json").write_text(json.dumps(supervision))
            raise SystemExit(4)
    code = code if code >= 0 else 128 - code
    supervision["finishedAt"] = datetime.now(timezone.utc).isoformat()
    (attempt / "supervision.json").write_text(json.dumps(supervision))
    (attempt / "cli-exit-code.txt").write_text(str(code) + "\n")
    raise SystemExit(code)
PY
selection_supervisor_exit=$?
```

  `selection_supervisor_exit` не подменяет CLI exit при `CLI_EXIT_UNCONFIRMED`:
  у ещё работающего CLI файла exit нет; серия блокируется, повторный сигнал
  не посылается. `supervision.json` переносится в метаданные попытки; он фиксирует
  реальный deadline, а `cli.pid` — PID собственного CLI, не supervisor.
  Не использовать `--continue`, `--session`, `--fork`.
  У всех выбранных analytic tasks лимит 30 минут (`timeout_ms` проверить перед
  стартом). При достижении deadline записать timedOut/interruptSentAt и послать
  один SIGINT непосредственно своему CLI, а не оболочке; это делает supervisor
  выше, вручную дублировать сигнал нельзя.
  Ждать подтверждённого завершения; учитывать 90 секунд host.close после начала
  cleanup, а не считать их гарантией общего срока выхода. Если ожидание выхода
  после сигнала превысило 90 секунд, сохранить блокер, не запускать следующий
  процесс и не посылать второй сигнал автоматически; завершение остаётся непроверенным.
  Код 130 без собственного зарегистрированного deadline — отмена, не timeout.
  Остаточный writer или LOGINOM_HOST_CLEANUP_FAILED блокирует серию.
  `--command` выбран для прямой проверки основного skill; обычная активация и
  Desktop остаются непроверенными, отдельная серия для них не добавляется.
  Флаг EXTERNAL_SKILLS уже отключает обе домашние директории; второй skills-флаг
  оставлен для явности. PURE сам по себе skills не отключает.

  Слоты матрицы — шесть задач × три реально начатые модельные попытки.
  PROFILE_BUSY/preflight/quota до первого model turn — отдельный инцидент запуска,
  не ноль JS и не слот. После начала модели любой failure остаётся в знаменателе;
  без подтверждённого rule/digest/catalog policy непроверена. Не делать
  выборочных замен или автоматических retries ради улучшения доли успехов.

- [ ] После выхода CLI получить Session ID из полного JSON stdout; требовать
  единственную верхнеуровневую Session попытки. Снять read-only snapshot БД:

```python
import json
import sqlite3
import sys
from pathlib import Path

database, session_id, destination = sys.argv[1:]
connection = sqlite3.connect(Path(database).resolve().as_uri() + "?mode=ro", uri=True)
connection.execute("PRAGMA query_only=ON")
connection.execute("BEGIN")
session = connection.execute("SELECT id, parent_id FROM session WHERE id = ?", (session_id,)).fetchone()
if not session:
    raise SystemExit("SESSION_MISSING")
children = connection.execute("SELECT id FROM session WHERE parent_id = ?", (session_id,)).fetchall()
messages = connection.execute(
    "SELECT id, session_id, data FROM message WHERE session_id = ? ORDER BY time_created, id",
    (session_id,),
).fetchall()
rows = connection.execute(
    "SELECT id, message_id, session_id, data FROM part WHERE session_id = ? ORDER BY time_created, id",
    (session_id,),
).fetchall()
if not rows:
    raise SystemExit("SESSION_PARTS_MISSING")
parts = [dict(json.loads(row[3]), id=row[0], messageID=row[1], sessionID=row[2]) for row in rows]
Path(destination).write_text(json.dumps({"sessionID": session_id,
    "parentID": session[1], "childSessionIDs": [row[0] for row in children],
    "messages": [dict(json.loads(row[2]), id=row[0], sessionID=row[1]) for row in messages],
    "parts": parts}, ensure_ascii=False), encoding="utf-8")
connection.close()
```

  БД: `<profile>/data/loginom-ai-agent.db`. Сопоставить snapshot со stdout;
  скопировать только журналы данной Session из
  `<profile>/loginom/runtime/generations/*/chats/<sha256(SessionID)>/attempts/*/`.
  Для каждого такого attempt нужны `execution-events.jsonl`, `session.json`,
  `terminal-close.jsonl` при наличии. Не копировать auth/browser-profile или
  чужие Session. Read-only snapshot не запускает миграции. Команды `export`
  у standalone CLI нет; source export против этого профиля не использовать.
  SHA вычисляется по строке agent Session ID. `session.json.sessionId` и
  `execution-events.jsonl.session_id` — внутренний Dock UUID; сопоставлять по
  каталогу, не сравнивать с agent ID. После подтверждённого prepare отсутствие
  соответствующего runtime-каталога — неполнота. Snapshot сохраняет все parts
  и messages, чтобы проверить финальный ответ, фактическую модель и variant.

- [ ] По save/export receipts получить точные собственные пакет и CSV. После
  подтверждения соответствия контейнера/аккаунта разрешён read-only copy-out:

  `selection_container=loginom-server-7.4.2-test` — обнаруженный кандидат.
  Сопоставить его с публичным status.url и текущим аккаунтом, проверить
  `/workdir/UserStorage`; client-контейнер не содержит этого хранилища.
  После подтверждения задать `selection_storage="/workdir/UserStorage/$selection_username"`.
  По успешным save/export receipts определить `selection_package_name` и
  `selection_csv_name`: это фактические относительные имена под `/$selection_username/`,
  принадлежащие данной попытке и её уникальному prefix, без `..`/абсолютного пути.
  Единственное исключение — пакет `capability-gap-reuse`: его путь должен точно
  совпадать с подтверждённым `packagePath` из `--original-attempt`; текущая
  квитанция подтверждает повторное сохранение именно этого пакета. Новый prefix
  обязателен для reuse CSV/evidence, но переименовывать исходный пакет не нужно.
  Не угадывать их только по prefix. Если экспорт ещё running или квитанция
  неоднозначна, не выбирать «самый свежий файл».

```bash
docker cp "$selection_container:$selection_storage/$selection_package_name" \
  "$selection_attempt/artifact/package.lgp"
docker cp "$selection_container:$selection_storage/$selection_csv_name" \
  "$selection_attempt/artifact/results/$(basename "$selection_csv_name")"
```

  `selection_storage` — проверенная текущая пользовательская server папка, не
  угаданный путь. Нет docker copy-out — блокер проверки файлов. Автоматическое
  скачивание сохранённого `.lgp` в данном workflow отсутствует; запасной browser
  сценарий не добавляется. Это не утверждение, что ручное скачивание невозможно.
  Нет подтверждённых файлов — нет расчётного PASS. Из `src/artifact.ts`
  использовать только `unzip` в новом собственном `artifact/unpacked` (функция
  предварительно удаляет dest); записать SHA256. `cleanupArtifact` и
  `checkIsolatedStorage` не вызывать: первое удаляет файлы, второе требует стенд.
- [ ] Запустить offline audit; независимо сверить связность и checklist каждого
  пакета. Зафиксировать все 18 исходов baseline, включая нарушающие политику.
  Отсутствующий пакет оставляет graph review недоступным; полный trace может
  независимо подтвердить отсутствие JS-попыток. Сохранять причины без
  автоматического вывода «виноват runtime».

  Бюджет первой полной серии — 48 процессов (18 baseline + 18 candidate + 9
  исключений/recovery + 3 reuse): 24 часа окон по 30 минут плюс сборка, cleanup
  и аудит. Профиль занят эксклюзивно каждым CLI/management процессом до cleanup,
  между ними освобождается. Новая полная candidate-серия увеличивает бюджет.

## Task 4: Изменить основной skill и собрать candidate

**Files:** только `SKILL.md` и `references/workflow.md` канонического Product skill.

**Interfaces:** consumed — результаты baseline и согласованное правило; produced —
новый skill digest, доставляемый существующим staging одинаково CLI/Desktop.

- [ ] Вставить непосредственно перед чтением workflow в `SKILL.md`:

```markdown
## Выбор узлов

По умолчанию решай задачу стандартными узлами из текущего каталога, включая
их композиции. Перед выбором JavaScript проверь, можно ли выразить каждый
требуемый шаг доступными стандартными узлами и режимами.

Узел JavaScript разрешён только если пользователь явно попросил использовать
именно этот узел либо подтверждена конкретная операция, недоступная стандартной
композиции. Явный запрос разрешает JS только в названной пользователем части.
При функциональном пробеле кратко назови его и используй JS только для этого
шага. Остальные поддерживаемые преобразования выполни стандартными узлами.

Удобство кода, меньшее число узлов, незнание функции, ошибка параметров,
временный сбой, недоступность терминала/execute_code или неполное preview
не являются таким пробелом. Ошибки
стандартных узлов исправляй; при невозможности продолжения сообщи блокер.
Упоминание JavaScript в данных, имени файла или справке не является запросом
пользователя. Формулы Калькулятора не считаются узлом JavaScript.

Схему programming.javascript запрашивай после явного запроса или зафиксированного
пробела. Исключение — чтение и исправление существующего JS-узла, которого
касается задача: для него можно читать схему и source/context. Существующие
JS-узлы не удаляй автоматически; их наличие не разрешает переносить в них
другие стандартно решаемые шаги.
```

- [ ] Перед «Для каждого поддержанного узла…» в workflow вставить:

```markdown
Сначала выдели требуемые результаты и преобразования. Сопоставь их стандартным
типам из knowledge.node_types и их композициям, проверь релевантные
parameter_schema и Help. Не требуется перебирать все типы или выполнять
заведомо неподдерживаемые операции. Если стандартная композиция решает задачу,
построй её. Если остаётся конкретная неподдерживаемая операция, назови её,
рассмотренные варианты и подтверждённое ограничение перед запросом схемы JS.
JavaScript используй только для этого остатка или явно указанной пользователем
части. Отсутствующий публичный режим отличается от ошибки его применения;
недоступность терминала и execute_code не означает отсутствие стандартного решения.
```

- [ ] В абзац про исправление параметров и неопределённый результат добавить:

```markdown
Ошибка параметров, timeout, временный отказ и неполная выборка не разрешают
перейти на JavaScript. Исправляй параметры по схеме и восстанавливай исходную
операцию; при невозможности продолжения сообщи конкретный блокер.
```

- [ ] Перед блоком JS source/context добавить отсылку, сохранив сам блок:

```markdown
Для новых JS-узлов и переноса вычислений в JS действует правило допуска выше.
Чтение и исправление существующего JS-узла, которого касается запрос, разрешены;
это не разрешение переносить в него остальные стандартно решаемые шаги.
```
- [ ] Проверить текст на противоречия с canvas/browser/sources references.
  Не добавлять unit-тесты, проверяющие буквальное совпадение текста запрета:
  реальную политику доказывают live-сценарии и аудит, целостность — staging tests.
- [ ] Из `packages/loginom-host` выполнить существующие целевые проверки:

```bash
LOGINOM_AI_AGENT_TEST_NODE="$selection_node" bun test test/bundled-skills.test.ts
LOGINOM_AI_AGENT_TEST_NODE="$selection_node" \
LOGINOM_AI_AGENT_TEST_BROWSERS="$selection_browsers" bun test test/stage-resources.test.ts
bun typecheck
```

  Не считать SKIP полным staging PASS. `git diff --check` обязателен.
- [ ] Закоммитить два файла: `fix(skills): prefer standard Loginom nodes over javascript`.
- [ ] Тем же build command из Task 3 собрать новый `selection_candidate`, проверить
  `verify-cli-candidate.ts`, manifest, resource inventory и skill digest.
  Сравнить с baseline: изменение policy находится в двух Product файлах, runtime,
  Node/Chromium, каталог, модель и inputs одинаковы. Различия build metadata
  отразить отдельно. Не заменить системный launcher.

## Task 5: Candidate live и три ветви исключений

**Files:** только новые каталоги evidence и итоговый отчёт; fixes по наблюдению
возвращаются в Task 4 и создают новый candidate digest.

**Interfaces:** baseline pins + candidate payload → 18 основных попыток,
9 дополнительных, доказательства повторного выполнения трёх tags-графов.

- [ ] Повторить Task 3 тем же способом для всех шести задач × трёх повторов,
  поменяв только binary path и уникальный prefix `c<attempt>`. Убедиться, что
  digest активации соответствует candidate. Требовать `policyStatus:passed`
  во всех 18: полные доказательства, JS доступен, ни одной JS-попытки.
  Число oracle-pass должно быть не меньше baseline при одинаковом знаменателе
  18; показать также исходы 0..3 по каждой задаче. Дополнительно нужен хотя бы
  один полный расчётный успех (пакет, oracle, граф/checklist, settlement,
  CLI exit 0) по каждой из шести задач. Нельзя принять 0/18 → 0/18 либо
  потерю покрытия целой задачи. Отсутствие пакета не отменяет trace-аудит
  политики, но оставляет XML/graph review и расчётный успех неподтверждёнными.
- [ ] Выполнить explicit-js 3 раза. Проверить исходный oracle и наличие успешного
  JS, который выполняет именно агрегацию; сохранить стандартные импорт,
  сортировку и экспорт. Машинные условия дополнить независимым review роли JS.
- [ ] До tags-попыток сверить реальный каталог с обоснованием Task 2. Если
  появилось стандартное split-to-rows, не провоцировать JS и не подменять критерий;
  остановить приёмку этой ветви с точным расхождением и пересмотреть fixture.
- [ ] Выполнить tags 3 раза. Должен получиться локальный JS для разворачивания,
  затем стандартные группировка, сортировка и экспорт. Проверить код JS и
  отсутствие захардкоженных меток/числа позиций/готовых агрегатов.
- [ ] Для каждого tags-графа архивировать первый `.lgp`/CSV и хэши. Создать
  отдельную reuse-попытку с новым workspace, приложить второй CSV обычным CLI
  способом; не перезаписывать прежнее серверное вложение. Новое имя вложения
  привязано к новому сообщению, а загрузка использует `overwrite:"reject"`.
  Перед созданием reuse evidence сохранить `selection_original_attempt="$selection_attempt"`;
  затем задать `selection_phase=tags-reuse`, новый `selection_attempt` и остальные
  переменные попытки по Task 3. Сформировать prompt новой CLI Session из
  подтверждённого packagePath:

```ts
const prompt = `Открой собственный пакет ${packagePath}. У существующего импорта замени только источник на приложенный dataset.csv; у существующего экспорта замени только имя CSV на ${reuseResultName}. Выполни граф, сохрани пакет по ${packagePath} и выгрузи результат. Сохрани GUID узлов, связи, список полей, формулы и JS-код, настройки группировки и сортировки. Другие параметры не меняй, новые узлы не создавай.`
```

  Здесь `packagePath` берётся из `attempt.json` и save receipt первой сессии.
  `reuseResultName` — уникальное `<prefix>-reuse.result.csv` этой reuse-попытки.
  В отдельном `artifact/results/` сохраняется ровно один CSV повторного прогона;
  не смешивать его с первым результатом. Получить заново сохранённый пакет
  только по receipt, подтвердить новое исполнение, свежесть CSV и второй oracle.
  Сравнить нормализованный XML до/после: разрешены только значения источника
  существующего импорта и назначения существующего экспорта, а также служебные
  метаданные сохранения, если их семантика подтверждена при разборе формата.
  GUID/связи/исходный JS/схемы полей/вычислительные параметры должны совпасть.
  Любое иное изменение делает reuse неуспешным; неизвестные различия нельзя
  автоматически игнорировать. Это проверка повторного применения вычислительного
  графа на новом вложении, а не байтовой идентичности пакетов.
  Для этой попытки из `evals/` применять отдельный режим:

```bash
bun script/audit-node-selection.ts --tasks fixtures/node-selection --task tags \
  --mode capability-gap-reuse --attempt "$selection_attempt" \
  --original-attempt "$selection_original_attempt"
```

  Аудитор выбирает `tags/oracle-reuse.csv`, а доказательство роли/успешного
  применения JS наследует из проверенной первой попытки; новый JS apply не нужен.
- [ ] Выполнить recovery 3 раза. Нужны реальная ошибочная формула, нативный отказ
  с `NODE_APPLY_STOPPED` / `error.cause.code:WIZARD_CALCULATOR_VALIDATION_FAILED`
  и `node_phase_refused.receipt.verification:calculator_syntax_rejected_draft_restored`
  для того же узла/операции. Требовать отсутствие любых JS-попыток, затем
  исправленный тот же Калькулятор и правильный CSV Category,Profit. Честный
  блокер при полных доказательствах отразить отдельными `policyStatus:passed`,
  `calculationPassed:false`; он не разрешает JS и не превращает попытку в
  успешный расчёт. Если отказ не наблюдался, исход `recovery_unobserved`:
  ветка непроверена, skill по этой причине не меняется. Prompt подсказывает
  исправление; самостоятельную диагностику этот fixture не доказывает.
- [ ] Если любой случай нарушает policy, сохранить исходную попытку. Исправлять
  skill по конкретной причине из trace, без дописывания подсказок eval prompt,
  изменения oracle и выборочного удаления неудач. Новый digest требует новой
  полной candidate-серии; прежняя остаётся как диагностический результат.
  После первоначального изменения допустимы не больше двух корректировок.
  Если нарушение сохраняется при подтверждённом правиле в контексте, остановить
  итерации и передать владельцу доказательства для отдельного решения о
  runtime-описаниях узлов. Runtime/квота/timeout/нет артефакта без нарушения
  политики не служат поводом менять skill; причину устанавливать по evidence.

## Task 6: Финальная проверка и отчёт

**Files:** итоговый отчёт, runbook, краткий checkpoint в конце этого плана.

- [ ] Из `evals/` выполнить целевые тесты аудита и `bun typecheck`; повторять
  только если после Task 1 менялся код проверки. После текстовых правок skill
  выполнить целевые проверки bundled skills/staging и `git diff --check`.
- [ ] Передать независимому reviewer оба skill-файла, spec, manifests и все
  результаты. Проверить, что audit не теряет failed/pending calls, ноль JS не
  объясняется отсутствием JS в каталоге, исключение не распространилось на всю
  задачу, а сохранённые графы вычисляют результат из предоставленных данных.
- [ ] Отчёт должен перечислять каждую попытку: case/номер/Session/digest,
  CLI exit, oracle, JS node/call counts, graph review, history completeness,
  runtime settlement, policyStatus, calculationPassed, итог/причина отказа и
  путь к локальным evidence. Показать отдельно baseline/candidate oracle-pass
  из 18, результаты по каждой задаче и полные расчётные успехи. Инциденты до
  первого model turn перечислить отдельно от матрицы; все начатые модельные
  попытки сохраняются в знаменателе. Это приёмка текущей системы, не isolated
  benchmark score и не доказательство статистической неухудшаемости.
- [ ] Завершить изменение только при 18/18 policy-pass основных candidate,
  числе oracle-pass не ниже baseline и хотя бы одном полном расчётном успехе
  по каждой из шести задач; дополнительно обязательны 3/3 explicit-js,
  3/3 capability-gap с тремя reuse-проверками и 3/3 наблюдённых recovery-ветвей
  без JS. Непроверенный exception/recovery не заменять успехом основной матрицы.
  Если recovery завершился честным блокером, сохранить ограничение успешности
  расчёта явно; политику и исполнение не объединять в одну зелёную отметку.
- [ ] Закоммитить отчёт без raw logs/secrets/profile:
  `docs(skills): record local node selection acceptance`.
- [ ] В финале указать изменения, проверенные команды и live-исходы, модель и
  digest, ограничения, включая CLI с принудительной активацией `--command`:
  Desktop и обычная активация не проверены. Пользовательский launcher/профиль/сервер не очищать;
  сохранённые собственные evidence и пакеты оставить доступными для review.

## Сверка рекомендаций от 2026-10-13

Все восемь разделов документа `2026-10-13-loginom-node-selection-corrections.md`
проверены по исходникам и доступной локальной системе. Подтверждённые правки
внесены в этот план и spec. Существенные уточнения к рекомендациям:

- Исторический `analytic10-61-medium` содержит 5/10 завершённых задач и 6/10
  oracle-pass; отчёт LAB-55 подтверждает 40/144 без артефакта. Это подтверждает
  необходимость отдельных метрик, но не устанавливает runtime причиной каждого
  провала. К сравнению долей добавлен минимум одного полного успеха на задачу.
- Node/npm и Chromium проверены по release SHA. Найденный Chromium в `/tmp` —
  подтверждённый источник, а не доказательство отсутствия других локальных копий.
  Постоянная копия будет создана при реализации Task 3.
- Код 130 означает отмену; timeout требует записи собственного дедлайна/SIGINT.
  90 секунд — бюджет `host.close`, а не гарантированный срок завершения CLI.
  Профиль занят на время каждого процесса/cleanup; 24 часа не включают накладные
  расходы. Для management-команд код 3 не всегда означает PROFILE_BUSY.
- `session.json` использует `sessionId`, execution journal — `session_id`;
  оба содержат Dock UUID. Одного терминального события недостаточно для
  settlement: проверяются статус, cleanup, pending и соответствие операции.
  Обрезанная ошибка может не иметь `outputPath`; summary не заменяет квитанцию.
- 151 метка повышает чувствительность tags-проверки, но лимит 128 полей одного
  узла не доказывает невозможность стандартной композиции. Основание JS —
  подтверждённое отсутствие требуемой операции в текущих схемах и Help.
- Reuse разрешает смену источника импорта/назначения экспорта; сравнение XML
  проверяет сохранение вычислений. Чтение/исправление существующего JS допускает
  describe до нового обоснования, если запрос касается именно этого узла.

## Checkpoint

- 2026-10-13: согласован дизайн, включая локальную текущую систему вместо стенда.
- Spec прошёл независимое review; коммит `849cc844e`.
- Этот план создан до реализации. Skill и runtime ещё не менялись.
- 2026-10-13: рекомендации перепроверены; план и spec синхронно уточнены.
- Повторное независимое review выявило и устранило несогласованность read
  receipts и reuse-аудита; добавлены отдельный oracle и supervisor дедлайна.
- Проверены 13 Bash и 7 Python фрагментов на синтаксис, оба tags oracle и recovery
  oracle на временных CSV, status parser на допустимых/ошибочных данных,
  snapshot на временной SQLite БД; `git diff --check` прошёл.
- Unit/static проверки будущего изменения и live серии ещё не запускались.
- Следующий шаг реализации: Task 1; baseline обязательно до Task 4.
