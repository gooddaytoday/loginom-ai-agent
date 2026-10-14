# Loginom Standard Node Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Стандартные поддерживаемые узлы используются по умолчанию; JavaScript допускается по явному запросу или для подтверждённого функционального пробела.

**Architecture:** Изменить канонический Product skill и его workflow. Единый локальный скрипт выполняет попытку и собирает evidence; offline-аудит проверяет пакет и все tool calls. Минимальный аудит уточняется по первой baseline-попытке. Candidate запускается волнами, с остановкой при первом нарушении политики; общий eval runner и runtime-контракты не меняются.

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
| `evals/src/node-selection-graph.ts` | Проверка data lineage на результате существующего readNodeXml |
| `evals/test/node-selection-graph.test.ts` | Реальные reference-графы и точечные нарушения связности |
| `evals/script/audit-node-selection.ts` | Новый offline entrypoint, загрузка пакета/CSV/evidence |
| `evals/script/run-node-selection-attempt.ts` | Единая команда одной локальной попытки: подготовка, CLI, evidence, аудит |
| `evals/test/fixtures/node-selection/` | Обезличенные реальные evidence и их точечные негативные варианты |
| `evals/fixtures/node-selection/` | Дополнительные входы, prompts и независимые oracle |
| `evals/docs/2026-10-13-node-selection-local.md` | Команды и формат локальных доказательств |
| `docs/testing/loginom-ai-agent/reports/2026-10-13-node-selection-local.md` | Итог всех проверок и ограничения |

Существующие `task.json`, SPEC, reference и oracle аналитического корпуса не
редактировать. Никаких новых публичных параметров `dock_node_apply`, policy
блокировок runtime, копий skill или изменений judge prompt.

## Порядок выполнения и параллельность

1. Task 1A: минимальный аудит; Task 2: fixtures; Task 3: скрипт попытки,
   закреплённый baseline payload и одна пилотная baseline-попытка.
2. Task 1B: завершить аудит на её реальных evidence и перепроверить пилот offline.
   Пилот входит в 18 baseline, отдельный модельный запуск для тестовых данных не нужен.
3. Оставшиеся 17 baseline запускать последовательно. Параллельно разрешены
   Task 4: текст skill и сборка candidate. Baseline payload к этому моменту
   автономен и неизменяем; source attestation сохранён до изменения skill.
4. Все исходники, включая audit/runner/fixtures, заморожены во время каждой
   сборки. Candidate build не пересекается с их редактированием. Проверки и live
   с общим CLI-профилем никогда не пересекаются, даже у разных payload.
   Новые evidence/pins писать в игнорируемый `evals/results/` или вне checkout;
   публикацию fixtures, runbook/report и других docs отложить до конца сборки.
5. Task 5: первая волна candidate из 9 попыток; после чистого прохода — ещё 16.
   Task 6: итоговый машинный отчёт и выборочное независимое review.

## Task 1: Минимальный аудит, затем уточнение по реальным evidence

**Files:** создать `evals/src/node-selection.ts`, `evals/test/node-selection.test.ts`,
`evals/script/audit-node-selection.ts` и локальный runbook из таблицы выше.

**Этап 1A — до пилота:** формат evidence, подсчёт JS во всех состояниях,
явное `incomplete` для неполноты и минимальный offline entrypoint. Начальные
проверки: JS в error/pending не теряется; отсутствующий input/пакет не становится
нулём; валидный native XML читается. Они опираются на проверенные контракты кода.
Остальные ветви ниже реализуются в 1B после первой baseline-попытки.

- [x] Этап 1A: минимальный аудит готов; JS не теряется при ошибках/незавершённости,
  оба XML-типа учитываются, неизвестный формат остаётся incomplete.
  До пилота полный PASS намеренно закрыт `AUDIT_NOT_FINALIZED`.
- [x] Этап 1B: окончательный аудит завершён и проверен на реальных evidence пилота.

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
- `mode`: `standard | explicit-js | capability-gap | standard-recovery`.
  Граф стандартного успеха проверяется машинно; роль JS, аномалии и выборку
  стандартных успехов проверяет независимый reviewer по Task 6.

- [x] Зафиксировать формат `<attempt>/attempt.json` в runbook. Обязательные поля:
  `sessionID`, `cliExitCode`, `mode`, `taskID`, `model`, `variant`,
  `expectedSkillDigest`, `packagePath`, `resultPath`, `startedAt`, `finishedAt`,
  `binaryManifestSha256`, `modelStarted`, `timedOut`, `interruptSentAt`.
  Неизвестные пути отсутствующих артефактов записывать null.
  Наблюдённый `skillDigest` и `knowledge.node_types` извлекать из полного
  `dock_prepare`; сверять с metadata активации и digest всего дерева
  `loginom-automation` из `verifyBundledSkills` проверенного payload.
  `historyComplete`/`runtimeSettled` — вычисляемые выходы аудита, не поля входа.
  Модель/variant сверять с messages и pins, отсутствие сведений не угадывать.
  Приложить `events.jsonl`, `parts.json`, `stderr.txt`, `prompt.txt`,
  `artifact/package.lgp`, `artifact/unpacked/`, `artifact/results/*.result.csv`.

- [x] Добавить по одному падающему тесту поведения. Начать с неудачной JS-попытки,
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

- [x] Из `evals/` выполнить `bun test test/node-selection.test.ts`; убедиться,
  что первый тест падает из-за отсутствующей реализации, а не окружения.

- [x] Реализовать минимальный чистый анализ. Использовать `unknown` и guards,
  без `any` и без поиска слов JS в произвольном тексте. Базовые контракты:

```ts
export type SelectionMode = "standard" | "explicit-js" | "capability-gap" | "standard-recovery"

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
  if (!standard && !successfulJsCalls) failures.push("JAVASCRIPT_EXECUTION_REQUIRED")
  return { jsNodes, jsCalls, successfulJsCalls, failures }
}
```

**Этап 1B — после пилота Task 3:** сохранить минимальные обезличенные реальные
parts/messages/stdout/runtime/XML в `test/fixtures/node-selection/` с указанием
source attempt и hash. Удалить секреты, заменить имена/идентификаторы согласованно,
не менять статусы, связи операций или форму квитанций. Полные оригиналы остаются
в приватном evidence. Дальнейшие red/green проверки строятся на этом материале
и точечных мутациях одного поля, а не на выдуманном формате JSON.

  Завершить в этом же модуле `readApply(part: unknown, parts: unknown[])` с
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

- [x] Добавлять тесты по одному с red/green: JS в другом workflow пакета;
  обычное строковое значение `JavaScript` не является вызовом; native-only PASS;
  неизвестный/пустой input не становится нулём JS; failed JS не подтверждает
  explicit override; успешный JS+пакет допускается только в разрешённых режимах.
  Проверить повреждённый JSON, противоречивые дубли part ID, отсутствие snapshot,
  completed+loginomPending→wait→SUCCEEDED и отказ принять wait другой операции,
  обрезанный output/error, exit 0 при отказе Loginom, completed с AMBIGUOUS,
  cleanup_complete:false, missing oracle (`passed:null`) и invalid XML.
  Source/context receipt без apply-status должен допускаться при собственном
  подтверждённом cleanup; чужой owner и cleanup_complete:false — incomplete.
  Missing package даёт `jsNodes:null` и `calculationPassed:false`; при полной
  трассе policy может быть подтверждена отдельно. Битый существующий XML нельзя
  приравнивать к отсутствующему пакету или пустому списку типов.
  Нативный успешный пакет брать из реального analytic reference, JS engine —
  из минимального ZIP/XML fixture; не писать копию production-парсера в тестах.
  Эти пункты — инварианты, не требование заранее написать по отдельному тесту
  на каждый возможный формат. Объединять однотипные мутации таблицей. Если пилот
  не показал нужную ветвь, использовать подтверждённый контракт исходников;
  первый реальный пример исключения затем добавить в fixtures. Неизвестный
  формат останавливает оценку как incomplete; исправляется parser и повторяется
  offline-аудит сохранённых evidence, без повторного модельного запуска.

- [x] Реализовать offline entrypoint с `parseArgs` и следующей командой:

```bash
bun script/audit-node-selection.ts --tasks tasks/analytic \
  --task sales-by-category --attempt "$selection_attempt" --mode standard
```

  Он вызывает `loadTasks`, `readNodeXml`, `checkOracle`, `inspectSelection`.
  Используется исходный `task.oracle`; общий loader/runner не менять.
  Выбранный oracle и его SHA включать в audit, отсутствие — incomplete.
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
    Source/context read не имеют apply-outcome: проверять owner-bound receipt
    и operation/node identity. Direct context требует `cleanup_complete:true`.
    Direct source этого поля не содержит: cleanup подтверждают собственные
    `source_discard_settled` и `source_delivery_verified` для каждого read step
    в том же runtime attempt с тем же owner. Для их wait/status —
    `state:settled`, `progress.cleanup_complete:true`, `pending_phase:null` и
    отсутствие незавершённого чтения. `outcome:null` у этих read штатен.
    Узкое исключение для вложенного `artifact.upload`: его
    `AMBIGUOUS/UPLOAD_SERVER_VERIFICATION_REQUIRED` закрывается собственным
    `artifact_delivery_completed` с `SUCCEEDED`, `cleanup_complete:true` и
    `upload_completion_verified:true` только при совпадении runtime attempt/Dock
    UUID, `upload_operation_id`, destination, bytes и SHA256. Другие AMBIGUOUS
    и несовпадающие квитанции остаются incomplete.
    События `completed`, `node_checkpoint` или `state:"settled"` сами по себе
    недостаточны: completed допускает AMBIGUOUS, а синтаксический отказ
    Калькулятора не обязательно пишет node_checkpoint.
  Неизвестный формат/противоречие даёт incomplete. Терминальный отказ может
  закрывать операцию, но не делает расчёт успешным. `cliExitCode===0` необходим
  для полного расчётного успеха, но не заменяет успешных Loginom-квитанций.
  Digest/catalog/model должны быть подтверждены для оценки policy.
  Публичный node_apply, runtime admission и terminal должны совпадать по
  document/workflow/node identity, включая существующий target.ref.
  GUID экспортёра выбранного CSV однозначно связан с XML TBGExportTextFile;
  старый CSV после удаления/замены экспортёра не подтверждает новый пакет.
  Сопоставляет
  успешные JS-квитанции с GUID/типами пакета; для allowed-JS при потере identity
  требуется неполнота доказательств, а не предположение о совпадении.
  Для recovery отдельно выводит `policyStatus` и `calculationPassed`:
  честный блокер не превращается в успешный расчёт и не скрывает ненулевой exit.
  На первом реальном JS-пакете подтвердить XML-тип; пока оба исторических имени
  считаются JS консервативно. Для explicit-js машинно требовать ровно один JS,
  native import/sorting/export, отсутствие `TBGGroupDataEngine`; для tags —
  ровно один JS и `TBGGroupDataEngine`, `TBGSortingEngine`, `TBGExportTextFile`.
  Связность проверять машинно по XML всех workflows: endpoints связей существуют,
  у каждого экспортируемого результата есть направленный путь от импорта
  приложенных данных; все data inputs предков Export имеют источник с такой
  lineage (у Join оба входа). Нет подмены результата изолированной константной
  веткой. Боковые ветви, не влияющие на Export, допустимы. Порты идентифицировать
  вместе с узлом и scope; параметрические связи не считать data path.
  Переиспользовать readNodeXml, не писать новый XML-парсер. Не требовать точного
  reference графа. Неизвестная форма ссылок/lineage — incomplete, не PASS.
  Стандартный успех закрывается машинно: полные evidence, settlement, exit 0,
  no-JS, oracle и связность. Reviewer смотрит исключения/аномалии и выборку
  успехов по Task 6; его verdict хранится в `<attempt>/graph-review.json`.
  Контракт review: `verdict:passed|failed`, reviewer, sessionID, packageSha256,
  непустые evidence (существующие относительные пути собственной попытки), notes.
  Привязка Session/SHA обязательна. Explicit-js требует
  `javascriptRole:requested-aggregation`, tags — `variable-unpack-only`,
  recovery — `recoveryObserved:true`; это результат чтения кода/трассы reviewer.
  Отсутствие обязательного review у исключения не даёт полного PASS.
  Не запускать модель, браузер, судью или cleanup из этого entrypoint.

- [x] Повторить `bun test test/node-selection.test.ts test/oracle.test.ts`,
  затем `bun typecheck` из `evals/`.
- [x] Повторить offline-аудит пилота окончательным аудитором и зафиксировать
  его версию. Новая версия аудита перепроверяет все уже собранные попытки;
  model/skill digest попытки при этом не меняется, данные не подменяются.
- [x] Закоммитить только новые audit/runbook файлы:
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

- [x] `explicit-js`: скопировать только вход `sales-by-category` и его oracle.
  В исходном prompt после требования средних, перед «Упорядочь» вставить фразу
  «Агрегацию по категориям выполни узлом JavaScript»; колонки/сортировку сохранить.
  В checklist нового fixture заменить `group-category` на требование агрегации
  именно JS, штатные импорт/сортировку/экспорт. Не копировать конфликтующий пункт,
  требующий GroupData, и не менять оригинальные prompt/checklist корпуса.

- [x] Создать единый `tags/data/dataset.csv` с короткими, пустыми и длинным
  списками. Генератор записывает заголовок и все строки:

```python
import csv
import sys

with open(sys.argv[1], "w", newline="", encoding="utf-8") as target:
    writer = csv.writer(target, lineterminator="\n")
    writer.writerow(["OrderID", "Tags"])
    writer.writerows([[1, "red;blue;red"], [2, "blue;;green;"], [3, "; red ;"], [4, ""]])
    writer.writerow([9, ";".join(["red"] * 150 + ["blue"])])
```

  Prompt: «Построй повторно используемый сценарий подсчёта частот меток. Поле Tags
  содержит список меток через `;`. Разверни каждую непустую метку в отдельную
  строку, обрежь пробелы по краям, сохрани повторы, пустые элементы и Null
  пропускай. Посчитай число вхождений каждой метки, отсортируй по Tag по возрастанию
  и выгрузи Tag,Occurrences. Число меток заранее неизвестно; при замене входного
  файла тем же форматом сценарий должен работать без изменения графа, выражений
  и списка полей. Не фиксируй число позиций и сами метки по примеру данных».

  Oracle: `Tag,Occurrences\nblue,3\ngreen,1\nred,153\n`.
  Повторных Session, второго oracle и XML-сравнения до/после нет.

- [x] Создать независимый `tags/oracle.py` и до модельного запуска вывести
  `tags/oracle.csv`; проверить совпадение с приведёнными выше значениями:

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

- [x] Записать в tags SPEC доказательство пробела: `calculator-parameters.mjs`
  задаёт фиксированные scalar-поля; `collapse-parameters.mjs` — фиксированные
  колонки; `union-parameters.mjs` — фиксированное число таблиц; в фактическом
  каталоге отсутствует dynamic split-to-rows/цикл/генератор. Перед live сверить
  схемы с установленным candidate. Не выдавать конечный CSV за доказательство
  невозможности любой стандартной композиции. Требование повторного использования
  без фиксированного числа позиций является частью задачи.
  Превышение 128 в основном CSV — проверка чувствительности к простому потолку,
  не доказательство невозможности нескольких стандартных узлов. Стандартный
  граф с фиксированным потолком нарушает требование задачи, но не запрет JS.
  Reviewer проверяет JS: проход по фактическим входным строкам/меткам,
  отсутствие фиксированного числа позиций, меток и готовых агрегатов. Отчёт
  не заявляет live-проверку переноса сохранённого графа на другой вход.

- [x] Создать recovery input:

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

- [x] В recovery SPEC требовать верхний `NODE_APPLY_STOPPED` с вложенным
  `error.cause.code:"WIZARD_CALCULATOR_VALIDATION_FAILED"` и собственное событие
  `node_phase_refused` с
  `receipt.verification:"calculator_syntax_rejected_draft_restored"`,
  затем тот же GUID Калькулятора с правильной формулой или явно сохранённый blocker.
  Сверять operation_id и node identity в обоих доказательствах.
  Если отказ не произошёл, записывать `recovery_unobserved`: ветка непроверена
  даже при правильном CSV, но skill из-за этого не менять. Prompt подсказывает
  исправление: этот тест не подтверждает самостоятельную диагностику модели.
  Выполнить один раз на итоговом candidate. Дополнительно аудит всех standard
  попыток фиксирует реально возникшие ошибки штатных узлов, последующие действия
  и отсутствие JS. Это бесплатное дополнительное покрытие, а не предположение,
  что ошибки обязательно возникнут, и не подмена ненаблюдённого diagnostic отказа.
- [x] Проверить загрузку всех трёх fixtures через `loadTasks`, независимые oracle,
  отсутствие answers/oracle в модельных inputs. Закоммитить:
  `test(evals): add javascript exception and recovery cases`.

## Предпосылка новой серии: исправление native date_format

Самостоятельное решение принято после обновления пользователем цели о разрешении
устранять блокеры. Исходная серия `20261013T093809Z-f5d429` остановлена на 3/18
baseline, 0/25 candidate; все её неудачи и исходные evidence сохраняются.
Skill не меняется из-за ошибки runtime. В публичных контрактах/cleanup изменений нет.

- [x] Исправить подтверждённый routing `imports.text.date_format` по TDD через
  существующий bound native dropdown; public RED воспроизводит исходный отказ,
  GREEN, foreign input и same-value проверки проходят. Коммит `263df9620`:
  только runtime procedure и `text-import-wide.test.mjs`, 144 text-import теста PASS.
- [x] Подтвердить точный формат `yyyy/mm/dd` детерминированным native Host proof
  с датами и проверенными output/readback/cleanup, без внешней LLM и без зачёта
  этого smoke в модельные 43 попытки.
  Повторный proof `date-format-native-2` завершился exit 0: readback формата и
  разделителя, datetime schema, две ненулевые даты 13–14.10.2026, Save и package
  cleanup/logout PASS. Preview сохраняет `datetime_display_precision` limitation;
  точное время не заявляется. Первый smoke провалился на ошибочной проверке
  `cell.value`, сохранён отдельно; только его own `user:17` закрыта диспетчером
  после GUID/log/admin-сверки, закрытие подтверждено журналом и свежей inventory.
- [x] Создать новый общий managed build worktree на согласованном HEAD; выполнить
  обе сборки последовательно в нём с одинаковой явной VERSION=0.1.17 и resources.
  Baseline получает только два old skill bytes, затем эти файлы восстанавливаются
  к HEAD для candidate. Проверить обе сборки против owning source, сохранить
  manifest/source/skill inventories и доказать, что runtime/dependencies совпали.
  Никаких source/docs edits во время сборки. Исходные payload/pins не переписывать.
  Выполнено на `6768520a0` в `node-selection-build`: обе source verification exit 0;
  независимая проверка обеих inventories 5725/5725 и resources 4728/4728 PASS.
  Отличаются два skill, два манифеста и два build-inputs; runtime, compiled CLI/Host,
  Node/Chromium и зависимости побайтно одинаковы. Разница build-inputs — только
  представление import paths, при одинаковых inventories/outputs.
- [ ] Закрепить новый run ID и immutable baseline/candidate pins с прежними
  tasks/inputs/oracle/model/reviewSeed; провести полные 18+25 попыток и все прежние
  gates Tasks 3–6. Старые три попытки не включать в новую сопоставимую серию;
  отразить их отдельно в итоговом отчёте.

## Предпосылка продолжения: dataset output socket в overflow

Серия `20261013T132356Z-0a3983` остановлена после двух baseline, candidate 0/25.
Sales/opening отказ сохранён отдельно, его точная причина не доказана. ABC
повторила старый отказ закрытия output mapping: native mapping verified,
но port_context unobserved. Обе ABC использовали JS `schema_mode=declared`.
Offline crossed regression подтвердил отсутствие dataset icon в overflow selector;
это необходимая общая runtime-правка, а не изменение политики выбора JS.

- [x] Исправить отсутствующий dataset output socket в существующем overflow
  selector по TDD (`c2c898aca5`). Проверки GUID/owner/opening/index/ancestry не
  менять. RED на публичном capability, GREEN на матрице 28 случаев двух типов,
  полные workspace-ui + node-wizard-close 310/310 PASS, independent review PASS.
  Изменены только одна строка runtime и существующая тестовая матрица.
- [x] Подтвердить native hidden dataset output mapping/Close, output и Save/cleanup
  через настоящий Host без LLM; убедиться, что проверена overflow-ветка.
  Сохранить ограничения и отдельно проверить даты в общем smoke, если требуется.
  Комбинированный Host smoke в `142936-072953` выполнил импорт дат, declared JS,
  output mapping/Close, Save и cleanup/logout. Строгий offline review + root verify
  exit 0 подтвердили точный DataSet+overflow marker, GUID/opening/index binding,
  два целых результата 11/21 и календарные даты 13–14.10.2026. Driver exit 1
  сохранён: он ошибочно ожидал одинаковый display у discrete import и continuous
  JS datetime. Import display precision ограничена; JS local datetime без timezone.
  Native не повторялся, persisted reopen и ordinary CLI teardown не заявляются.
- [x] Собрать новую сопоставимую пару в собственном общем build worktree с обоими
  runtime fixes, прежними version/resources/двумя skill версиями. Закрепить новые
  pins `20261013T142936Z-072953`, подтвердить полные inventories и источник.
  Обе source verification exit 0 на `1bfc135430`; независимая сверка каждой CLI
  inventory 5725/5725 и resources 4728/4728 PASS. Runtime/dependencies/CLI/Host/
  браузер побайтно одинаковы; отличаются только два skill и четыре metadata файла.
  Immutable pins/frozen models/lock проверены: 72 hashes, 43 уникальных слота.
- [ ] Выполнить полные 18+25 и все прежние gates; пять старых попыток двух остановленных
  серий сохранить отдельно. Удалять только собственные ненужные build artifacts,
  сохраняя необходимые evidence и не затрагивая работу других агентов.

## Предпосылка продолжения: сборщик квитанций и Help

В третьей серии ABC/1 завершился CLI exit 0 со штатным cleanup, Save и экспортом.
Wrapper exit 2 (`SELECTION_COLLECTION_FAILED`) возник при разборе текста
`loginom_find`: named import из Help ошибочно попал в JSON-парсер квитанций.
Это дефект внешнего сборщика evidence; общие runtime/payload/model/inputs не меняются.

- [x] По TDD ограничить только проекцию квитанций managed `loginom_dock_*`.
  Полные parts/events/Help и shared parser сохранить; повреждённый managed JSON
  должен по-прежнему отклоняться. Проверить сохранение Save/Export, отсутствие
  мутации истории, целевые suites, typecheck и независимый review. Сохранить
  исторический acceptance lock и закрепить новые runner hashes отдельным addendum.
  `f5eb5373e2`: только runner и его тесты. RED → GREEN; четыре целевых suites
  88 tests/206 assertions PASS, typecheck/diff-check PASS. Independent review:
  4 regressions/8 assertions PASS, actual 68 parts → 16 managed calls без ошибок.
  `collector-fix-lock.json` закрепляет новый runner SHA и 71 неизменённый historical
  hash; pins и auditVersion прежние, runtime/skill/corpus не менялись.
  Independent lock review PASS: byte-equal historical lock, committed runner/test,
  прежние pins/auditVersion и все task prompt/input/oracle bindings.
- [x] Восстановить evidence той же ABC-попытки по точным Save/Export receipts:
  copyout, проверка bytes/SHA, распаковка и полный offline audit в отдельной
  явной проекции. Сохранить original attempt.json, CLI/wrapper outcomes и все
  исходные hashes. Повтор модели и новая matched-сборка для collector не нужны.
  Baseline с JS остаётся замером «до»; расчёт и политика учитываются отдельно.
  Copyout и отдельная audit-проекция проверены независимо: 11 исходных hashes,
  21 shared evidence file, все 14 ZIP members совпали. Пакет/CSV receipt binding
  и oracle/calculation/history/runtime/identity/graph/export подтверждены;
  единственный отказ — baseline JAVASCRIPT_NOT_ALLOWED (2 JS nodes/calls).
  Original CLI0/wrapper2 и collector blocker сохранены, модель не повторяли.

## Предпосылка продолжения: вложенная квитанция operation_inspect

ABC/2 завершился CLI0/Save/Export/cleanup и oracle true. После USER_RESPONSE_BUDGET
runtime явно предложил operation_inspect; его resolved/verified response содержит
полный успешный node.apply outcome, совпавший с runtime. Аудитор ошибочно читал
внешнюю оболочку как node receipt, поэтому прежний calculation false сохранён.

- [x] Поддержать наблюдённую inspection/delivery форму по TDD без ослабления
  identity/cleanup/runtime gates. `e871bf81d2` меняет только node-selection.ts и
  его тесты. RED воспроизвёл три отказа; GREEN и 106 tests/236 assertions PASS,
  final 18 regressions/30 assertions после type narrowing, typecheck/diff PASS.
  Independent review Approved: 38 negative protocol mutations, сохранены raw
  history/receipts. Неизвестная/неполная inspection и generic error отклоняются.
  `settlement-fix-lock.json` закрепляет auditVersion
  `2654bfc1c61d4d0ecc73c7a6f4fa9613b5d5244ea83a7fdb8712be2ed452e445`;
  historical locks/pins неизменны, 70 прежних hashes и два исправленных файла.
- [x] Переоценить все восемь уже начатых baseline одной финальной версией аудита
  в отдельных проекциях. Сохранить original CLI/wrapper/attempt и prior audit
  hashes, подтвердить отсутствие model rerun и неизменность входов/пакетов.
  Независимо проверить новые оценки/lock; продолжить ту же серию без пересборки
  runtime/payload и без повторного занятия прежних модельных слотов.
  Все восемь переоценены отдельно: oracle/calculation 8/8, policy 5/8, JS 5/5/5.
  Independent review PASS: 96 protected files и восемь прежних audits неизменны;
  у семи меняется только auditVersion, у ABC/2 подтверждён retained settlement.
  Original CLI/wrapper/attempt не переписаны, модель не повторялась. Новые оценки
  и `settlement-reassessment-review.json` сохранены; monthly-demand/2 выполняется.

## Предпосылка продолжения: второй вход стандартного Соединения

Candidate ABC/1 серии `20261013T142936Z-072953` остановился без JS на
`abc-join-2/input_mapping`, CLI1/wrapper3/cleanup false. Это runtime-блокер,
не основание менять policy skill или заменять начатую модельную попытку.

- [x] Установить точный механизм отказа по own runtime/public receipts и source.
  Corrected request валиден; native input1 mapping и owner verified. Все 44
  финальных polling samples имеют enabled/visible Done, но input_port_context
  unobserved и finish_wizard не разрешён. `calculator done available` — общая
  метка finishWizard; конфигурация/Execute Join ещё не достигнуты. Exact DOM
  conjunct/caption отсутствует в сохранённом trace и пока не доказан.
  Evidence `candidate/abc-pareto-groups/1/forensic/join-diagnosis.json`, SHA256
  `5bd0562275400f8cd4be775795da17807fb93a2a1dbc2204907635ddaf218b2c`.
- [x] После строгой own identity выполнить адресное server/profile recovery.
  Четыре native GUID привязали own incarnation user:67 (init18:07:44.200Z).
  Admin CreateTime сверено; закрытие18:22:08.767Z подтверждено свежим server log,
  отсутствие после refresh18:22:19.194Z и screenshots проверены независимо.
  Только own guard архивирован после SHA/mtime и no-own-process проверки;
  original attempt/history/runtime/pins hashes неизменны. Admin logout/MCP exit
  и model-free status/check0 (Help ready/browser verified) подтверждены.
  Evidence `forensic/server-session-binding.json`, `profile-recovery.json`,
  `profile-management-verification.json`. Original cleanup false не переименован.
- [x] Выполнить отдельный deterministic native diagnostic без LLM, с неизменными
  candidate resources и явно отдельным instrumented entry для fixed read-only
  NavigationPanel capture. Сохранить actual input1 caption/visibility/bounds/icon
  и подтвердить failed predicate до минимальной TDD-правки, если она нужна.
  Diagnostic не входит в модельные слоты/acceptance; исходная попытка сохраняется.
  Первый native завершился до Join из-за неверного preview assertion: exact
  integer использует value, не display_text; Save отсутствовал, cleanup blocked.
  Original result/source/raw сохранены. Private driver исправлен TDD по actual
  receipt (5 tests/typecheck/review PASS), Save перенесён до preview assertions.
  Own native user70 закрыт по GUID/log/admin binding, guard не создавался.
  Второй diagnostic в `join-native-diagnostic-2` воспроизвёл Join refusal,
  но private capture guard не допустил stopped/ambiguous context, DOM не получен.
  Оба original native failures сохранены; исправляется только diagnostic guard
  по TDD (6tests/typecheck/independent review PASS), Product/candidate не меняются.
  Own native2 user72 адресно закрыт по GUID/Save/log/admin binding. Третий native
  воспроизвёл отказ и получил DOM: crumbs7 «Присоединяемая таблица» и8 «Настройка»
  display:none/rect0, 9 crumbs, первые7 видимы. Hidden caption predicate допускает
  только generic input label; port.label пустая, input1 context unobserved.
  Native owner/GUID/input1/opening и43 failed polls связаны; это instrumented
  source diagnostic с отдельным package caption JD, не итоговая acceptance.
  Evidence `forensic/join-hidden-input-diagnosis.json`, SHA256
  `db5fc0e30f2353fb2f49578a8cc72600542220cf7e4f276327e192aa432c2e7b`,
  Navigation SHA `b6d9cfb3a1cdd5dee8e814768beade867ee7fabc9d2295a2747a309da3d4f839`.
  Own native3 user74 закрыт адресно по двум GUID/Save/log/admin binding;
  server close19:02:44.920Z и refreshed absence подтверждены независимо.
- [x] Исправить скрытые фиксированные подписи обоих известных Join-входов по TDD;
  сохранить ownership/GUID/opening/index/ancestry guards. Commit `05b645eec9`:
  «Главная таблица» допускается только для native input0, «Присоединяемая таблица»
  только для input1; обе требуют единственную Join icon. Actual Main caption и
  binding подтверждены 10 наблюдениями; скрытый Main пока проверен regression
  fixture, поэтому live proof обеих скрытых ролей остаётся следующим gate.
  Отдельные RED→GREEN, 5 focused tests/32 negative cases PASS. Полный upstream:
  3775 total, 3765 PASS, 10 SKIP (8 browser opt-in/2 Windows), 0 FAIL, exit0.
  Syntax/diff-check и независимый source review Approved. Evidence
  `join-hidden-roles-fix-verification.json` SHA256
  `0b6f02d06403fadc7e029757a68e23329088e346d7c1936736914391aef85a90`,
  review SHA `5b44bdc9eb383a6079cae069009b5159fd1b26d6cb7ea5c777a4bd94154230a4`.
  Source SHA `80d27a8b318cc1ed800331dda82285aef4a3eab907732fe29eb52e7e036904a2`.
- [x] Собрать новую сопоставимую baseline/candidate пару с общей Join-правкой,
  теми же version/model/fixtures/seed и двумя skill версиями. Run192418-c71363,
  общий source05b645eec9, обе sourceverify0; независимые pair/pins review Approved,
  5725/5725 files обоих payload, runtime c9bab236… одинаков, 43 пустых unique slots.
  Actual native core независимо подтверждён: скрытые Main0/Joined1 с GUID/opening,
  Join SUCCEEDED/exact rows [1,5,15]/[1,10,15], Save и persisted3nodes/2links/noJS,
  package_closed/logged_out true, transport ACK/exit0. Review SHA256
  `0e622b9d3cea7ba935dbdaf6ad3857c42a95ea9874f2664c6ccff7d111d89422`.
  Full private driver остаётся diagnostic-stopped/exit1: extra post-Save import0
  reread отвергнут до эффекта из-за retained workflow path Package1 после rename.
  Unchanged-input reread НЕ подтверждён; raw result SHA f505d53c… сохранён.
  Это отдельная scoped attestation обязательного core, не переписывание failure.
  Новая series-admission SHA `d42bccf0c4b94ec77813955e3586a886af7ed15ce8f348ab0689868dc0ff28c0`;
  current-run переключён на192418. Старые payload/pins/model/native outcomes сохранены.
- [ ] Провести новые полные18+25 и все Tasks3–6 gates на итоговых pins. Изменённый
  runtime не позволяет переносить старые baseline исходы в новый denominator:
  прежние18 baseline/2 candidate этой серии сохранить как диагностическую серию.
  Это необходимая общая runtime-правка, не policy revision и не замена model slot.

## Предпосылка продолжения: Group/Sort от управляемого JavaScript

Серия192418-c71363 остановлена после2baseline/0candidate. Sales1 full machine
PASS/JS0; ABC1 CLI1/wrapper3/cleanupfalse, без пакета/CSV, timeoutfalse,
CLI362.070s. Import и managedJS pareto-001 SUCCEEDED (последний reconciled через
inspect после response-budget refusal). Standard group-001 остановился до
создания target: AMBIGUOUS/target, node:null, execution not_requested.
Это общая runtime-несовместимость, не capability gap и не policy revision.

- [x] Установить точный failed predicate и корректность Group request по actual
  own runtime/public evidence и immutable source. В execution-events1358/1359
  unique JS output0 verified/active/enabled/visible/point_observed, native_graph
  script/javascript icon, allowed_actions[]. Generic script deny сохраняет
  отсутствие click; grouping-preflight16–17 требует click до select/F3/parameters.
  Group параметры resolve/validate PASS. Source Sort new с обязательными keys
  неизбежно использует тот же preview (existing-target ветка отличается).
  Diagnosis SHA `70579325b07531b76ab0412f5e3a0916a8ece9e48f7e08996111c3777e7a10cd`,
  actual trace SHA `a63c069f86bb4920b08104dca3c5408199132cfb490141742937c42420c87a42`,
  design review SHA `c9e0075fd8fa66bd6a142b391c5de841d16ca4f1b0558780bc14de21de6ca2e0`.
  Upstream freshness_verified:false не заменяется наличием active порта или
  cached schema; generic JS click/F3/editor/execute запреты не снимаются.
- [x] Выполнить strict own server/profile recovery с GUID/log/admin/process/
  guard SHA+mtime binding, подтвердить status/check и сохранить original failure.
  Own user81/init19:55:47.707Z bound двумя executed GUID; close20:15:37.094Z,
  UIabsence20:15:37.234Z и остальные rows подтверждены независимо. Guard nonce
  (не SessionID/PID) SHA/mtime стабильны, own CLI4185156/no ownprofile processes
  отсутствуют; адресный archive сохранён,19 originals unchanged. Admin logout
  20:19:38.404Z/MCPexit0; status0(config starting/browserunknown), check0 actual
  Helpready/browserverified, writerabsent. Unsupported--profile operator exit2
  сохранены; correct selector envCLI_PROFILE. Review SHA
  `22e95b237b7f15a5d71ff9bceef8d99a2ea749c1d47719c8cc98a336e9ef5cab`,
  recovery `d3891697223881d7520f21b724ee0ffcffa68ab420020eb6a8d2f76c53aba579`,
  management `922d769c55ac1812eba131450ae2aadb09ae9d873e412ad56c9656916aa55f08`.
  Original model CLI1/wrapper3/cleanupfalse не изменён.
- [x] По TDD исправить только управляемый preview JS-источника для Group и new
  Sort: private owned native lease/fixed select-port→F3/fresh complete preview,
  latest successful managedJS history/execution/cleanup, owner/doc/workflow/
  nativeport0GUID guards и ACK/uncertain receipts. General public JS deny и
  Calculator/Union не расширять; public parameters/Protocol/schema/skill не менять.
  Нужны actual RED→GREEN, отрицательные случаи, runtime suites и independent review.
  Source commit `dd8d480706`: private output0 lease/fixed native port gestures,
  fresh complete schema/Close/graph restore и latest successful execution binding.
  Public JS deny/Calculator/Union/Protocol/skill unchanged. По independent RED
  добавлен FLocked guard, в том числе между prepared ACK и click/F3. Итоговый
  pinned Node24.19 upstream3820 tests/3810PASS/0FAIL/10SKIP, exit0; native ещёpending.
  Source verification SHA `a1c91ba28f775d83b90f0be0e6dc680f6d46a64813247f642c7964be18d1603a`,
  independent review `fdd3a83d6c85bce0b938b7172ab996c07015f73cdc59effd3faad178807c3897`.
- [x] По actual post-select DOM redraw исправить только private preview ticket:
  после полного owner/native/selection/DOM/hitpoint validation разрешить одну
  замену отсоединённого portElement до F3 и использовать текущий ElementHandle.
  Helper bf5dd674…/actualtuple fixture, два RED→GREEN/218relevantPASS; independent
  source review f2a80fb9…/53focusedPASS. Pinned Node24.19 full upstream3828/
  3818PASS/0FAIL/10SKIP/exit0, verification98cdb115… . Private sourceoverride7
  подтвердил оба native Group/directSort preflights, fresh outputs/Close/Save;
  source/component/schema сохранённого JS после обеих ветвей неизменны.
  Это sourcefix completion; обычная пересобранная nativeприёмка/CSV остаются
  следующей незакрытой задачей. Отдельный Export input-context blocker не
  разрешает ослаблять guards или переходить на JS.
- [x] По actual ExportSort tuple исправить распознавание скрытой подписи
  «Источник данных» только для verified prepared input port0. Сохранить native
  owner/opening, exact navigation chain/TID/icons/sensitivity/uniqueness и общий
  JS UI deny. Нужны public observation RED→GREEN на sanitized actual fixture,
  foreign/duplicate/unbound/wrong-port/wrong-caption negatives, focused/runtime
  suites и independent review. Ordinary rebuilt Export/CSV остаётся отдельным gate.
  Source1d7f27a7…: один alias для logical input0, test994249ab…/actualfixturea2f562ad…;
  RED→GREEN и15negativevariants/350focusedPASS, independent09e5c7f9… Approved.
  Pinned Node24.19 fullupstream3830tests/3820PASS/0FAIL/10SKIP/exit0,
  rootverificationc67cde34… . Эта sourcecompletion не закрывает ordinarynative
  или18+25; исходный diagnosticfailure468c4235…/cleanupfalse сохранён.
- [x] Собрать новую matched baseline/candidate пару с этой общей runtime-правкой,
  прежними version/model/fixtures/seed/двумя skill версиями. Native без LLM
  подтвердить JS→Group и JS→newSort→Export, сохранённый пакет/выход/cleanup,
  generic JS gestures remain denied и обе hidden Join роли на новой сборке.
  Итоговая пара233119 source41101/runtimebf2fd06b… independently pair130d7d7f…/
  pins791829db… Approved. OrdinaryJS507286da…/reviewc2376fff… PASS:
  Group/directSort/CSV/5nodes4links/fullJSpreserved/genericdeny/cleanup/logout/ACK0.
  OrdinaryJoin8cc5a138…/review7c59cfeb… PASS: оба native input-role opening/context,
  freshoracle/3nodes2linksnoJS/Save/cleanup/logout/ACK0. Historical rawhiddenDOM
  supporting evidence указан отдельно; новый rawcapture/standalone reread не
  заявляются. Fresh actual15schemas+16prepare samebuild verified f958175b…/
  aec86a27… . Seriesadmission411b35ae…/current-run233119, модельных попыток пока0.
  Новая пара203142 static/pins Approved, модели ещё0. Первый privateJoin exit1
  до import0: extra initial emptySave вернул workflow_continuations:[], поэтому
  shortworkflowId остался stalePackage1. Actualpackageclose/logout/ACKexit0
  подтверждены, diagnosis4b39b1d9…; originalexit1 сохранён. Отдельный минимальный
  corefixture использует прежний Save послеcompletedimports, не делает emptySave
  и standalone stale postSave rereads. ExactfreshJoinoutput projections проверяют
  исходныеvalues; обаhiddenroles/output/Save/cleanup gates не меняются.
  Первый privateJS downstream тоже stoppedexit1 до Group/Sort: actualroots32/92
  с nextcursor, fixture преждевременно искалuniqueGraphroot. Import/JS/Save/
  beforefullXML и actualclose/logout/ACKexit0 verified; originalb274cbb2… preserved,
  independentstop3fea73a4… . Separateproof-2 actual021TDD roots pagination fix
  Approved0da15709…; runtime/pins unchanged, native branches ещёpending.
  Joinproof-2 actualcorePASS/independent2bbc5532… (обаhiddenroles/freshoutput/
  inputprojections/Save/3nodes2linksnoJS/close/logout/ACKexit0, no standalone reread).
  JSproof-2 fullypaged, но intentionalgenericclick stopped с sanitizedHostIPC
  LOGINOM_RUNTIME_FAILED. Originalexit1 сохранён, stopreviewe2cebed0…/clearcleanup.
  Источники опровергли первоначальную validator-диагностику: user profile удаляет
  dock_ui_action из catalog; Unknown Dock tool (-32602) возникает до uiAct.
  Instrumentedproof-3 также exit1 до branches: wrapper ожидал -32603. Исходный
  failure/ownclose/logout/HostACKexit0 сохранён. Privateproof-4 возвращается к
  обычному managed-entry: actual catalog без genericUI, live JS actions[] и
  отдельный actual pure guard check на live snapshot, без фиктивной UI receipt.
  Group/directSort выполняются штатными node calls; Product/runtime/pins unchanged.
  JSbranches stillpending.
  Privateproof-4 дошёл до realGroup preflight: import/JS/Save succeeded, mouse.click
  вернулся с ACK; subsequentinspect AMBIGUOUS/Managed preview native port changed
  до F3/Groupcreation, Sortnever. Exactcompoundconjunct unknown; originalexit3/
  cleanupfalse/HostACKfalse preserved. Ownuser90 строгоbound по initialization/
  nativeGUID, адресноclosed/admin2freshabsence/logout/MCPexit0; writerabsent.
  Privateproof-5 instrumenteddiagnostic only: boundedpredicate tuple в одном
  exactgeneratedthrowmessage, исходный guard/controlflow сохраняется. По actual
  tuple установить причину перед surgicalTDDfix; не ослаблять ownership по догадке.
  Independentownrecovery f81ff164… подтвердил exactserver closure/noReinit,
  сохранностьraw/source/others; originalcleanupfalse неизменён.
  Instrumentedproof-5 root56624exit3 изолировалconjunct: sameElement=false,
  oldElementConnected=false/current=true при прежних nativeShape/Port/Data/Cell
  и selected=[ownPort.FCell]. Result e2c41540…/originalcleanupfalse preserved,
  не acceptancePASS. SourceTDDfix должен обновить privateDOMticket после полного
  postselect owner/native/selection/hitpoint validation и F3currentelement;
  преджестовые/foreign/connected swap guards сохраняются. Перед новой дорогой
  matchedсборкой проверить candidate source в отдельном явно private nativeproof.
  SourceDOMfix frozen bf5dd674… (helper/test/actualtuplefixture only), два RED→GREEN,
  218relevantPASS, verification17e58845…; independent source review и privateproof6
  ещёpending. Fullupstream после чистого privateprobe перед sourcecommit/build.
  Proof5ownrecovery2e649a27… independentlyclosed/noReinit/adminlogout/payload+raw
  unchanged; originalcleanupfalse не повышается до PASS.
  SourceDOMreview f2a80fb9… Approved; privateproof6 Group+Save SUCCEEDED после
  actualF3preview. Originalexit1 на private EXACT_INTEGER_REQUIRED: GroupSUM
  Totaltype real/binary64 values17/21 и decimal1.7E+01/2.1E+01, precisionverified.
  Ownclose/logout/ACKexit0 verified; Sortnever. Separateproof7 TDD actual028
  limitedexact realcell assertion, producer/Sort integerguards/source unchanged.
  Полная private CSV/XML-проверка остаётся обязательной. Upstream sourcefix
  выполняется после обоих native preview переходов; отдельный Export blocker
  не изменяет проверяемый preview source и не закрывает finalgate.
  Privateproof7 подтвердил ОБА Group/directSort+Save (A17/B21; B21/A11/A6),
  source/component/schema после обоих сохранились. Fullupstream DOMfix passed,
  но firstexport-group AMBIGUOUS/input_mapping: preparedInputPort context
  unobserved, Done enabled без finish_wizard. Request/schema/mapping valid;
  exact hidden native caption/visibility/icon predicate UNKNOWN. Source DOMfix
  закрыт отдельно, oldexit3/cleanupfalse preserved. Ownuser95 адресноclosed/
  admin2freshabsence/logout/MCPexit0, postreviewpending. Следующий boundedreadonly
  private capture должен изолировать Export predicate перед sourcefix; не строить
  гипотетическое разрешение hidden controls. Pair/model admission всё ещёblocked.
  Recovery/sourcecomponent independentlycf1fbfc8… confirmed; originalcleanupfalse
  remains. Следующий proof8 минимален: Import→Group→Export с тем же Group source/
  schema/labels/breadcrumb width, readonly preparedInputPort/navigation tuple.
- [ ] Провести новые полные18+25 и Tasks3–6 на итоговых pins. Исходные2baseline
  серии192418 и native full-driver failure остаются диагностическими и не
  включаются в новый denominator. Policy revision limit прежний; не заменять
  начатые model slots и не менять skill из-за runtime failure.

## Task 3: Единый скрипт попытки, закреплённый baseline и пилот

**Files:** `evals/script/run-node-selection-attempt.ts`, приватное evidence под
`evals/results/node-selection-local/` и runbook. Product skill не менять до
сборки/аттестации baseline payload; полного завершения baseline для этого не нужно.

**Interfaces:** отдельные неизменяемые `baseline-pins.json` и `candidate-pins.json`,
baseline payload и 18 каталогов попыток. Одна команда wrapper запускает ровно
одну модельную попытку; цикл/scheduler/автоматические retries не добавляются.

- [x] Реализовать wrapper с `parseArgs`: обязательные `--pins` (абсолютный путь),
  `--task` (ID из pins), `--attempt` (плановый номер). Запуск из `evals/`:

```bash
bun script/run-node-selection-attempt.ts --pins "$selection_root/baseline-pins.json" \
  --task sales-by-category --attempt 1
```

  Pins содержат `runID`, `phase`, `resultsRoot`, `workspaceRoot`, абсолютные
  `payload`, `profile`, manifest SHA/skill digest, model/variant, deadline 1800
  и grace 90 секунд, публичные url/username/folder, подтверждённый container ID
  и storageDir. `tasks` закрепляет для каждого ID каталог, режим, разрешённые
  номера попыток, SHA prompt/inputs/oracle. Candidate допускает recovery только
  с номером 1. Все пути, prefix, packagePath/resultName выводятся из pins+task+номер;
  пользователь не передаёт их вручную на каждой попытке. Секретов в pins нет.
- [x] Последовательность внутри wrapper: проверить pins/payload и headless
  status → создать новые evidence/workspace → скопировать только inputs →
  `loadTasks`/трёхаргументный `buildAgentPrompt` → один CLI с deadline →
  подтверждённый exit/cleanup → read-only snapshot своей Session → свои
  runtime-журналы → точный receipt-based `docker cp` → `unzip` → offline-аудит.
  Запускать дочерние команды массивом argv, без shell-интерполяции имён.
  Не использовать общий `runAttempt/runAgent`: у них контракт выделенного стенда.
- [x] Переиспользовать функции загрузки задач/prompt/unzip/audit; runner занимается
  только оркестрацией одной попытки. Унаследованный `LOGINOM_AI_AGENT_CLI_BUNDLE`
  убрать из env ребёнка, иначе он может подменить frozen resources.
  Все flags, формат snapshot, правила copy-out и supervisor описаны ниже как
  спецификация реализации wrapper — не как ручные команды каждого прогона.
- [x] Существующий каталог попытки означает отказ до model dispatch, а не
  перезапись/повтор. Сохранять `attempt.json` также при неудаче, с отдельными
  `modelStarted`, CLI exit/null, blocker, policy/oracle/calculation/review statuses.
  Коды wrapper: 0 — машинные проверки прошли, 1 — измеренный провал, 2 —
  неверные inputs или incomplete, 3 — блокер серии, 130 — отмена пользователем.
  Это не CLI exit и не итог semantic review. Отказ preflight до запуска CLI
  писать в новый `resultsRoot/incidents/<task>/<attempt>/<timestamp-uuid>/`
  вместе с pins hash, reason и `modelStarted:false`; каталог модельного слота
  ещё не создан. Если CLI уже стартовал, но отсутствие model dispatch и полный
  exit/cleanup подтверждены, завершённый собственный каталог перенести в такой
  новый incidents path без перезаписи. Слот остаётся свободным для явного
  повторного вызова той же команды, оригинальные квитанции сохранены.
  Неизвестность dispatch/exit/cleanup не даёт права освобождать слот.
  После model dispatch повторный запуск слота запрещён; для проверки сохранённых
  evidence запускать только offline entrypoint. Никаких cleanup/recovery чужого
  профиля, второго SIGINT или скрытого нового model run.
- [x] Перед пилотом проверить детерминированное построение собственных путей,
  отказ повторного каталога и mapping exit/status на временном файловом наборе;
  жизненный цикл CLI/SQLite/copy-out проверяется самим пилотом, без отдельной
  выдуманной копии runtime и без дополнительного аналитического прогона.

- [x] Проверить `git status --short`, ветку и HEAD. Сохранить diff/hash файлов
  skill и `git worktree list`. Убедиться, что никто не меняет исходники/ветку
  во время сборки; не полагаться на старые сведения о ветке основного checkout.
- [x] Сохранить базовые пути и пины серии в приватном `environment.json`.
  Ниже Bash-эквивалент для команд сборки; wrapper получает значения из pins:

```bash
selection_repo=/home/kiselev/.codex/worktrees/4118/loginom-ai-agent
selection_run_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
selection_root="$selection_repo/evals/results/node-selection-local/$selection_run_id"
selection_profile=/home/kiselev/.config/com.loginom.aiagent/cli/profiles/analytic-evals
selection_cli=/home/kiselev/.local/bin/loginom-ai-agent-cli
selection_resources="/home/kiselev/.local/share/loginom-ai-agent-acceptance/node-selection-$selection_run_id"
selection_baseline="$selection_resources/baseline"
selection_candidate="$selection_resources/candidate"
umask 077
mkdir -p -- "$selection_root"
mkdir -- "$selection_resources"
```

  Повторный запуск подготовки не заменяет существующие каталоги.
  Для этой реализации выбран уже существующий локальный профиль `analytic-evals`:
  его headless status/check подтвердили `http://localhost/app/`, user, /user.
  На localhost:80 опубликован существующий client; его Apache ProxyPass ведёт
  к `loginom-server-7.4.2-test:8080/ws/` в той же Docker network, а /user существует
  в UserStorage этого server. Настройки профиля не изменялись. Профиль default
  указывает на публичный app.loginom.ai и не соответствует локальному copy-out.
- [x] Проверить текущее подключение, без изменения настроек:

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

- [x] Получить username/folder из публичного status, не из `cli-profile.json`
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

- [x] Зафиксировать модель и variant, которыми проверяется skill: взять указанную
  пользователем модель, проверить через штатные `models`, явно передавать её
  во все run. Сохранить provider/model, variant и фактические model metadata
  созданных сообщений. Не менять модель между baseline/candidate и не считать
  модель судьи моделью агента. Пользователь для реализации выбрал gpt-6-sol,
  medium, fast. Alias `openai/gpt-6-sol-fast` сохраняет API model gpt-6-sol и
  запрашивает serviceTier=priority. Публичный каталог фиксируется по SHA в
  `frozen-models.json` и передаётся обеим сериям через MODELS_PATH. Недоступность
  выбранной модели — блокер; замена без указания пользователя не допускается.

```bash
selection_model=openai/gpt-6-sol-fast
selection_variant=medium
```

  Эти значения применять только после подтверждения доступности предыдущим шагом.

- [x] Подготовить полный pinned Node с npm и постоянную копию Chromium.
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

- [x] Из `packages/loginom-host` собрать baseline в новый каталог:

```bash
LOGINOM_AI_AGENT_CHANNEL=prod \
LOGINOM_AI_AGENT_NODE_SOURCE="$selection_node" \
LOGINOM_AI_AGENT_BROWSER_SOURCE="$selection_browsers" \
  bun script/build-cli.ts "$selection_baseline" --no-archive
bun script/verify-cli-candidate.ts "$selection_baseline" "$selection_repo"
```

  Требуется pinned Bun `1.3.14` revision `0d9b296af33f2b851fcbf4df3e9ec89751734ba4`.
  Сборщик проверяет версии/manifest. Сохранить успешный source attestation и
  inventory до изменения skill. Во время build не редактировать tracked или
  nonignored untracked файлы: source snapshot проверяется до/после сборки.
  Не править установленный resources tree на месте.
  При невозможности сборки записать блокер; старый installed CLI не подменяет baseline
  текущей ветки, особенно если в нём отсутствует JavaScript.

- [x] Сохранить `baseline-pins.json`, закрепляющий SHA manifest с source SHA/tree/dirty
  внутри metadata. Рядом сохранить полный skill inventory/file hashes и каталог
  типов с Loginom version. Pins также закрепляют модель/variant,
  task prompt/input/oracle hashes, endpoint identity без credentials и ограничения
  времени. До пилота сгенерировать
  и сохранить `reviewSeed`; перенести его без изменения в candidate-pins.
  Подтвердить наличие
  `programming.javascript` в baseline: иначе ноль JS не проверяет выбор модели.
  Проверить отдельно `cfg.skills.paths`: flags ниже отключают home-discovery,
  но не этот канал. Наличие внешнего eval-skill/ответов в контексте делает серию
  несопоставимой; не менять пользовательскую конфигурацию молча.
  После изменения исходников baseline больше не сверять с текущим checkout через
  `verify-cli-candidate`: это ожидаемо даст SOURCE_MISMATCH. Проверять его
  неизменность по сохранённому attestation, manifest/inventory и skill digest.
  Новые immutable pins готовы в run `20261013T132356Z-0a3983`; независимая проверка
  72/72 source hashes, 43 уникальных слотов и обоих payload PASS. Все task/model/seed
  поля сохранены, новые пути/manifest SHA привязаны отдельно. Фактический baseline
  Host prepare подтвердил build 7.4.2 и 16 типов, включая `programming.javascript`.
  Тот же изолированный профиль/config и CLI не подключают внешний skill или Codex MCP;
  административный Playwright работает отдельно от оценочных процессов.

**Внутренние шаги wrapper.** Далее приведены готовые фрагменты и точные правила
для реализации одного файла. При выполнении серии оператор вызывает только
`run-node-selection-attempt.ts --pins … --task … --attempt …`; вспомогательные
shell/Python фрагменты не выполняются им вручную для каждой попытки.

- [x] Для каждой из шести задач × трёх повторов создать новый workspace вне
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
  Prompt собрать внутри wrapper через `loadTasks` и `buildAgentPrompt` с этими
  путями; отдельный временный helper не создавать:

```ts
import { loadTasks, buildAgentPrompt } from "../src/task"

export async function writeAttemptPrompt(tasksDirectory: string, taskID: string,
  promptPath: string, packagePath: string, resultName: string) {
  const tasks = await loadTasks(tasksDirectory, [taskID])
  await Bun.write(promptPath, buildAgentPrompt(tasks[0]!.prompt, packagePath, resultName))
}
```

  Три аргумента `buildAgentPrompt` сохраняют обычный хвост даже для diagnostic
  fixtures; четвёртый `outputMode` сюда не передаётся. Не передавать модели
  helper, task.json, SPEC, reference или oracle.

- [x] Выполнить каждую попытку отдельным процессом, последовательно.
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
LOGINOM_AI_AGENT_MODELS_PATH="$selection_root/frozen-models.json" \
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

- [x] После выхода CLI получить Session ID из полного JSON stdout; требовать
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

- [x] По save/export receipts получить точные собственные пакет и CSV. После
  подтверждения соответствия контейнера/аккаунта разрешён read-only copy-out:

  `selection_container=loginom-server-7.4.2-test` — обнаруженный кандидат.
  Сопоставить его с публичным status.url и текущим аккаунтом, проверить
  `/workdir/UserStorage`; client-контейнер не содержит этого хранилища.
  После подтверждения задать `selection_storage="/workdir/UserStorage/$selection_username"`.
  По успешным save/export receipts определить `selection_package_name` и
  `selection_csv_name`: это фактические относительные имена под `/$selection_username/`,
  принадлежащие данной попытке и её уникальному prefix, без `..`/абсолютного пути.
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
- [x] Сначала запустить только `sales-by-category`, baseline attempt 1, через
  wrapper. Сохранить полный evidence даже при incomplete; завершить Task 1B
  на его фактическом формате и повторить только offline-аудит. Пилот остаётся
  первым из 18 baseline даже при расчётном провале. Если model dispatch не
  произошёл, это отдельный preflight incident; если потерян trace после dispatch,
  не заменять модельную попытку удобным повтором.
- [x] После завершения аудита зафиксировать его версию, runner и task/oracle
  hashes. Выполнить оставшиеся 17 baseline в порядке: остальные пять задач
  с номером 1, затем все шесть с номером 2, затем все с номером 3. Baseline
  не останавливать из-за JS: это измеряемое старое поведение. Busy/uncertainty
  и неизвестный формат evidence приостанавливают серию как раньше.
  Baseline закрывается машинным аудитом без ручного semantic review. Сохранить
  все исходы и причины, не приписывать отсутствие артефакта автоматически runtime.
- [x] Параллельно оставшимся baseline разрешить Task 4 с отдельным ownership
  двух skill-файлов. Во время candidate build никто не меняет исходники, runner,
  audit или fixtures. Изолированный payload baseline продолжает работать;
  candidate live/check ждут освобождения общего профиля и завершения baseline.

  Первая полная серия — 43 модельных CLI run: 18 baseline + 18 standard candidate
  + 3 explicit-js + 3 tags + 1 recovery. Верхняя сумма окон по 30 минут —
  21,5 часа плюс сборка/cleanup/audit; это не прогноз фактического времени.
  Первая candidate-волна — 9 run, до 4,5 часа окон; оценку «около часа» можно
  подтвердить только измеренными временами. Ранняя остановка экономит остаток
  неудачной версии, но не сокращает полную приёмку итоговой версии.

## Task 4: Изменить основной skill и собрать candidate

**Files:** только `SKILL.md` и `references/workflow.md` канонического Product skill.

**Interfaces:** consumed — закреплённый baseline payload/pins и согласованное правило;
полного baseline ждать не требуется. Produced —
новый skill digest, доставляемый существующим staging одинаково CLI/Desktop.

- [x] Вставить непосредственно перед чтением workflow в `SKILL.md`:

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

- [x] Перед «Для каждого поддержанного узла…» в workflow вставить:

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

- [x] В абзац про исправление параметров и неопределённый результат добавить:

```markdown
Ошибка параметров, timeout, временный отказ и неполная выборка не разрешают
перейти на JavaScript. При неопределённом результате сначала восстанови исходную
операцию. При подтверждённом отказе исправь запрос по схеме и следуй next_step;
при невозможности продолжения сообщи конкретный блокер.
```

- [x] Перед блоком JS source/context добавить отсылку, сохранив сам блок:

```markdown
Для новых JS-узлов и переноса вычислений в JS действует правило допуска выше.
Чтение и исправление существующего JS-узла, которого касается запрос, разрешены;
это не разрешение переносить в него остальные стандартно решаемые шаги.
```
- [x] Проверить текст на противоречия с canvas/browser/sources references.
  Не добавлять unit-тесты, проверяющие буквальное совпадение текста запрета:
  реальную политику доказывают live-сценарии и аудит, целостность — staging tests.
- [x] Из `packages/loginom-host` выполнить существующие целевые проверки:

```bash
LOGINOM_AI_AGENT_TEST_NODE="$selection_node" bun test test/bundled-skills.test.ts
LOGINOM_AI_AGENT_TEST_NODE="$selection_node" \
LOGINOM_AI_AGENT_TEST_BROWSERS="$selection_browsers" bun test test/stage-resources.test.ts
bun typecheck
```

  Не считать SKIP полным staging PASS. `git diff --check` обязателен.
- [x] Закоммитить два файла: `fix(skills): prefer standard Loginom nodes over javascript`.
- [x] Тем же build command из Task 3 собрать новый `selection_candidate`, проверить
  `verify-cli-candidate.ts`, manifest, resource inventory и skill digest.
  Сравнить с baseline: изменение policy находится в двух Product файлах, runtime,
  Node/Chromium, каталог, модель и inputs одинаковы. Различия build metadata
  отразить отдельно. Сохранить отдельный `candidate-pins.json`; baseline-pins
  не перезаписывать. Не заменить системный launcher. Build идёт параллельно
  baseline live только при замороженных исходниках и не использует его CLI-профиль.

## Task 5: Candidate сначала по одному случаю, затем повторы

**Files:** только новые каталоги evidence и итоговый отчёт; fixes по наблюдению
возвращаются в Task 4 и создают новый candidate digest.

**Interfaces:** baseline pins + candidate payload → 25 попыток одной версии skill:
18 standard, 3 explicit-js, 3 tags, 1 recovery. Первые 9 входят в эти числа.

- [x] В `candidate-pins.json` закрепить порядок и перенести `reviewSeed`,
  сохранённый до baseline pilot. Порядок первой волны: шесть standard из таблицы spec,
  затем explicit-js, tags, recovery; у всех номер 1. В каждом слоте одна команда:

```bash
bun script/run-node-selection-attempt.ts --pins "$selection_root/candidate-pins.json" \
  --task sales-by-category --attempt 1
```

  Меняются только task ID/номер; пути и режим берутся из pins. Candidate run
  начинается после завершения baseline; digest активации сверяется каждый раз.
- [ ] При первом доказанном нарушении policy немедленно остановить candidate:
  остальные слоты этой версии не запускать. Сохранить частичную серию со всеми
  исходами, не выдавать её за полную. Если parser не понимает evidence,
  приостановить серию, уточнить parser по фактическим данным и перепроверить
  сохранённые попытки offline; не считать неизвестность нарушением skill.
- [ ] Чистая первая волна означает: у всех девяти полные evidence и соблюдена
  политика; у шести standard и двух JS-исключений есть сохранённый пакет,
  oracle-pass, связность, settlement и exit 0; роль обоих JS проверена reviewer;
  recovery показал реальный отказ, отсутствие JS и успешное исправление.
  Только после этого разрешены повторы. Обычный расчётный провал без нарушения
  policy не запускает правку skill: при подтверждённом cleanup можно закончить
  первую волну для диагностики, но она не открывает вторую. Не повторять один
  неудачный слот до успеха. Причины и дальнейший scope при нечистой волне
  передаются владельцу; автоматической новой полной серии нет.
- [ ] После чистой волны выполнить ещё 16 слотов: все шесть standard и оба
  JS-исключения с номером 2, затем те же с номером 3. Recovery не повторять.
  Первые девять не сбрасывать. Любая начавшаяся модельная попытка, включая
  timeout/отказ/квоту, остаётся в своей серии и знаменателе; retry допускается
  лишь при подтверждённом отсутствии model dispatch, с отдельным incident.
- [ ] Во всех трёх explicit-js требовать исходный oracle и ровно один успешный
  JS для агрегации, стандартные импорт/сортировку/экспорт и review роли JS.
- [x] До tags-попыток сверить реальный каталог с обоснованием Task 2. Если
  появилось стандартное split-to-rows, не провоцировать JS и не подменять критерий;
  остановить приёмку этой ветви с точным расхождением и пересмотреть fixture.
  Статическая часть сверки candidate завершена: пять файлов контрактов совпали
  с baseline и исходниками, проверены экспорты 16 типов и релевантные схемы.
  Evidence: `candidate-gap-attestation.json` в текущем private run,
  SHA256 `6a6f18270dfcdadc532ecc50c201bbfceaf4cc4af4394e387839ea13f8a0fe8e`.
  Actual candidate проверка завершена: successful prepare sales/1 (Loginom 7.4.2,
  16 типов) связан через digest/catalog/build/runtime pins с native Host probe
  15 стандартных `action_describe.parameter_schema` той же immutable сборки.
  Разные browser Session указаны явно; raw receipts, 5725 CLI/4728 resource
  entries и cache keys проверены. Evidence `actual-candidate-gap-attestation.json`,
  SHA256 `0384b22c01366bf6d50f11171bae54927d7979a204b159d76ad83e27a7b85d50`.
  Общего variable split-to-rows в известных схемах/handlers нет; пределы 128/15
  относятся к отдельным узлам и не доказывают невозможность фиксированной
  композиции для 151 элемента. Tags oracle/роль JS/reuse ещё не проверены;
  probe ACK/exit0 не подтверждает explicit Loginom logout.
- [ ] Выполнить tags 3 раза. Должен получиться локальный JS для разворачивания,
  затем стандартные группировка, сортировка и экспорт. Проверить код JS и
  отсутствие захардкоженных меток/числа позиций/готовых агрегатов.
- [ ] Выполнить recovery один раз в первой волне. Нужны ошибочная формула и отказ
  с `NODE_APPLY_STOPPED` / `error.cause.code:WIZARD_CALCULATOR_VALIDATION_FAILED`
  и `node_phase_refused.receipt.verification:calculator_syntax_rejected_draft_restored`
  для того же узла/операции. Требовать отсутствие любых JS-попыток, затем
  исправленный тот же Калькулятор и правильный CSV Category,Profit. Честный
  блокер при полных доказательствах отразить отдельными `policyStatus:passed`,
  `calculationPassed:false`; он не разрешает JS и не превращает попытку в
  успешный расчёт или чистую первую волну. Если отказ не наблюдался, исход `recovery_unobserved`:
  ветка непроверена, skill по этой причине не меняется. Prompt подсказывает
  исправление; самостоятельную диагностику этот fixture не доказывает.
  Естественные ошибки стандартных узлов в остальных 18 candidate аудируются
  по полному trace с привязкой к операции и последующими действиями. Они не
  требуют дополнительных run и не гарантируются заранее; отсутствие JS после
  них показывать как отдельное наблюдённое покрытие.
- [ ] Если любой случай нарушает policy, сохранить исходную попытку. Исправлять
  skill по конкретной причине из trace, без дописывания подсказок eval prompt,
  изменения oracle и выборочного удаления неудач. Новый digest требует новой
  candidate-серии с первой волны; для приёмки нужен полный набор итогового digest,
  прежняя остаётся как диагностический результат. Переиспользовать baseline,
  если pins продукта/runtime/модели/задач/окружения не изменились.
  После первоначального изменения допустимы не больше двух корректировок.
  Если нарушение сохраняется при подтверждённом правиле в контексте, остановить
  итерации и передать владельцу доказательства для отдельного решения о
  runtime-описаниях узлов. Runtime/квота/timeout/нет артефакта без нарушения
  политики не служат поводом менять skill; причину устанавливать по evidence.

## Task 6: Финальная проверка и отчёт

**Files:** итоговый отчёт, runbook, краткий checkpoint в конце этого плана.

- [x] Из `evals/` выполнить целевые тесты аудита и `bun typecheck`; повторять
  только если после Task 1 менялся код проверки. После текстовых правок skill
  выполнить целевые проверки bundled skills/staging и `git diff --check`.
  Актуальный collector `f5eb5373e2`: 88 tests/206 assertions, typecheck/diff PASS,
  независимое source/lock review PASS. Прежние bundled 9/9, staging 13/13 без SKIP
  и host typecheck документированы ещё `53e471ddf4`; skill/host/dependencies с тех
  пор не менялись, source hashes сверены с candidate. Raw host-test log не найден;
  используется зафиксированный результат Task 4, а не заявляется новый запуск.
  Runtime 310 tests и build/native offline evidence отдельно сверены с source.
  Этот пункт не закрывает live candidate и содержательный review.
  После нового audit fix `e871bf81d2` проверки обновлены: 106 tests/236 assertions,
  final 18 regressions/30 assertions, typecheck/diff и independent review PASS.
- [ ] Независимый reviewer проверяет два skill-файла, контракт аудита и выборку:
  все 6 JS-попыток, одну recovery, все candidate-провалы/аномалии и три случайных
  успешных standard. Это 7 exception/recovery, а не 9 JS-попыток. Baseline
  проверяется только машинно; ручной семантический разбор для него не требуется.
  Выборку standard сформировать из всех расчётно успешных candidate по заранее
  pinned seed: сортировка по SHA256(JSON.stringify([reviewSeed, taskID, attemptNo])),
  первые три. Выбранные попытки не заменять удобными.
  Reviewer не правит skill; проверяет вычисление из входов и checklist. Если
  обнаружен дефект, приёмка блокируется и review расширяется на тот же тип
  аномалии/задачи. Не запускать автоматически новые модели для его сокрытия.
- [ ] Отчёт должен перечислять каждую попытку: case/номер/Session/digest,
  CLI exit, oracle, JS node/call counts, graph review, history completeness,
  runtime settlement, policyStatus, calculationPassed, итог/причина отказа и
  путь к локальным evidence. Показать отдельно baseline/candidate oracle-pass
  из 18, результаты по каждой задаче и полные расчётные успехи. Инциденты до
  первого model turn перечислить отдельно от матрицы; все начатые модельные
  попытки сохраняются в знаменателе. Это приёмка текущей системы, не isolated
  benchmark score и не доказательство статистической неухудшаемости.
  Явно различать машинную связность/lineage, сплошной oracle/policy audit и
  выборочный семантический review. Зафиксировать длительность пилота/каждой
  попытки; прогноз оставшегося времени пересчитать по наблюдениям.
- [ ] Завершить изменение только при 18/18 policy-pass основных candidate,
  числе oracle-pass не ниже baseline и хотя бы одном полном расчётном успехе
  по каждой из шести задач; дополнительно обязательны 3/3 explicit-js,
  3/3 capability-gap и 1/1 наблюдённый recovery без JS с правильным исправлением,
  чистая первая волна и обязательный review. Честный recovery-блокер подтверждает
  только политику, но не открывает повторы и не закрывает всю приёмку.
  Неполная серия, отсутствующий exception/recovery или выявленная review-аномалия
  не заменяются успехом остальных проверок.
- [ ] Закоммитить отчёт без raw logs/secrets/profile:
  `docs(skills): record local node selection acceptance`.
- [ ] В финале указать изменения, проверенные команды и live-исходы, модель и
  digest, ограничения, включая CLI с принудительной активацией `--command`:
  Desktop, обычная активация и повторное применение tags-графа на новом входе
  не проверены; recovery покрывает один наблюдённый отказ. Пользовательский launcher/профиль/сервер не очищать;
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
  Постоянная копия создана и SHA проверен при реализации Task 3.
- Код 130 означает отмену; timeout требует записи собственного дедлайна/SIGINT.
  90 секунд — бюджет `host.close`, а не гарантированный срок завершения CLI.
  Профиль занят на время каждого процесса/cleanup; бюджет окон не включает накладные
  расходы. Для management-команд код 3 не всегда означает PROFILE_BUSY.
- `session.json` использует `sessionId`, execution journal — `session_id`;
  оба содержат Dock UUID. Одного терминального события недостаточно для
  settlement: проверяются статус, cleanup, pending и соответствие операции.
  Обрезанная ошибка может не иметь `outputPath`; summary не заменяет квитанцию.
- 151 метка повышает чувствительность tags-проверки, но лимит 128 полей одного
  узла не доказывает невозможность стандартной композиции. Основание JS —
  подтверждённое отсутствие требуемой операции в текущих схемах и Help.
- Reuse-проверка из первоначальной редакции снята последующим решением
  пользователя об ускорении. Чтение/исправление существующего JS допускает
  describe до нового обоснования, если запрос касается именно этого узла.

## Checkpoint

- 2026-10-13: реализация по согласованным spec/plan, ветка `node-javascript`.
- Этап 1B завершён; независимый review закрыл export/context binding дефекты.
- Fixtures реализованы TDD: `81c4a14e7`, `2de55ec10`, `3de3526f9`.
- Collector реализован TDD; cleanup guard `d73fa9def`, независимое review проведено.
- Skill изменён только в двух Product файлах: `fdb90ca1e`; staging 13/13 без SKIP.
- Модель закреплена: openai/gpt-6-sol-fast, medium, requested priority; каталог SHA в pins.
- Серия132356 stopped2/18, candidate0: sales/opening и ABC/outputmapping сохранены; ownuser21/24 закрыты, guards архивированы.
- Используется существующий local профиль analytic-evals; status/check и Docker routing подтверждены.
- Node/npm/Chromium совпали с release pins; Chromium сохранён в постоянном собственном каталоге.
- Baseline собран/проверен до изменения skill, source attestation и pins сохранены.
- Первый pre-dispatch OAuth 401 сохранён как incident; авторизация по коду завершилась exit 0.
- Пилот sales-by-category/1: CLI exit 0; native offline audit PASS, включая oracle/history/runtime/graph.
- Актуальный auditVersion: `2654bfc1c61d4d0ecc73c7a6f4fa9613b5d5244ea83a7fdb8712be2ed452e445`; старые оценки сохранены.
- Historical lock: 95 tests/219 assertions, 72 файла; collector f5eb5373e2: 88/206 PASS, новый addendum и independent review PASS.
- Baseline ABC/1 и monthly/1: CLI exit 1, cleanup unconfirmed; оба модельных слота сохраняются.
- Candidate собран/verify PASS; digest `ff18dc5f2b4da3d7b6c66d0419d48aae7590b2a07e0d2e50f7a01cd9f3f34261`.
- Candidate pins: first wave 9/всего 25; статические tags-контракты сверены, actual prepare ещё нет.
- Playwright MCP 0.0.83 установлен в Codex; admin login/inventory/logout проверены, own ABC session закрыта сервером.
- Только own .writer архивирован после GUID/log/admin-сверки; status/check PASS, история/evidence сохранены.
- Серия142936-072953: baseline18/18, oracle/calculation18, policy12/18 старого skill, JS9/9/9; independent machine review18 PASS (baseline-final-review.json); candidate2/25 начаты: sales1 PASS JS0, ABC1 runtime-blocked join/input_mapping, cleanupfalse, callsJS0. Серияpaused, diagnosis/ownrecovery; повторызакрыты.

- Новая пара192418-c71363 собрана/verify0 из общего05b645eec9; immutablepins43слота и effectiveaudit2654… закреплены. Независимый pair/pins review и nativebothhiddenroles proof pending; model0/current-run ещё historical142936. Новыйdescribeprobe15схем ACK/exit0, actualprepare/gapbinding pending.
- Новая192418-c71363 допущена к новой полной18+25: paired/pins/nativecore Approved; fullprivate driverexit1 сохранён (extra stale retained reread). Новая actualgapattestation c485ce08… completed, tags/model ещёpending; historical18+2 не переносятся.
- Серия192418 baseline1/18 complete: sales1 CLI0/wrapper0/cleanuptrue/oracle+calculation+allmachineaxesPASS/JS0, CLI337.121s. ABC1 следующийactive; candidate0/25. Actualbaselineprepare16/7.4.2/JSapplyavailable bound (a81a317b…).
- Серия192418 stopped2baseline/0candidate: sales1PASS; ABC1CLI1/wrapper3/cleanupfalse group-target genericJSsourceclickdeny. Exactactualpredicateconfirmed; JS→Group/newSort privateTDDintegrationongoing, noGeneralJSallow/policyrevision. Ownuser81closed20:15:37.094Z/adminabsenceverified; guardarchived/status0/checkpending.
- Group/Sort blocker ownrecovery завершён: user81closed/guardarchived/status0/check0/adminlogout+MCP0; independentrecovery22e95b…PASS, original19files unchanged. CodeTDDpreviewintegration ongoing; baseline/candidate slots остановлены.
- Пара203142 source dd8d480706/pair+pins Approved, native Join core PASS. JSproof3 exit1 до downstream сохранён; stopreview f28a8ebf… исправляет прежнюю validator-гипотезу: actualusercatalog не предоставляет UI tool. Ordinary privateproof4 awaiting independent review/live; model0, current-run192418 stopped.


## Checkpoint: private artifact delivery и обязательная Sort-ветвь

Proof8 остановился до Import/Group/Export: original result45f825bc…/exit3/
cleanupfalse сохранён. CSV prepared/upload/checkpoint совпадают (27bytes/
SHA c5235fe2…); private navigation shim ошибочно требует standalone frame
у artifact download wrapper. Offline pinned generator воспроизводит
PINNED_WORKSPACE_CODE_MISMATCH до browser send; непосредственно записан
BROWSER_CALL_UNCERTAIN. Это не доказательство Product Export regression.
Proof9 сохраняет обязательные JS→Group и прямой JS→Sort→ExportSort,
full JS before/after, afterproducer read и CSV/5nodes4links. Дополнительный
ExportGroup для этого gate не требуется; его прежний failure остаётся аномалией.
Independent proof9 review8e2d847c… Approved, preview-only override byteequal7,
60source/32fixtures/104protected match; ошибочного navigation shim здесь нет.
Обе private fixtures diagnostic/nonacceptance; обычная rebuilt проверка обязательна.
Independent delivery review7030b977… подтвердил private shim failure; source
правка не нужна. Strict ownership user97 не установлена, сессия сохранена;
ownadmin98 logout/MCPexit0 подтверждены. Это не recoveryPASS: originalfalse
остаётся. Root proof9 запущен отдельно после fresh no.writer/deadoldruntime/
60+32hash checks/newstate+chat+browser; independent review разрешает эту
изоляцию без изменения user97. Model calls по паре203142 остаются0.
Условная новая matched пара225648-cc76ca собирается параллельно на общем
committed source3a33edcae8; текущий stopped pointer192418 не меняется.

Proof9 original0547cd7e…/root7470exit3: Group/directSort/Save прошли,
обязательный ExportSort AMBIGUOUS/input_mapping до CSV. Cleanup/logout/ACKfalse
сохранены. LastSave036 readback f4313494… подтвердил полное равенство JS
component/source/declaredschema после обеих ветвей; это не CSV/finalgate.
Теперь Export blocker воспроизведён на обязательной ветви; нужен bounded readonly
capture точного native predicate перед surgical TDD fix. Product guards/skill
не менять по предположениям. Пара225648 source3a33/runtimef262e52c… собрана/
bothverify0, но остаётся условной: commonruntime fix потребует следующую пару
и полные18+25. Ownproof9 recovery independently48163591… подтверждён:
строго bound user99 closed/admin100logout/MCPexit0, unknownuser97 сохранён.
44raw/60source/4397runtime unchanged; full savedJS before/after равен.
Pair225648 independent43b494ad…/pins3b56a9b3… Approved после mode0400 freeze,
0models/0outcomes. Static Product/primaryaudit783c7650… Approved; runner/graph
в этом review имеют self-review limitation и проверяются отдельно.
Proof10 readonly capture дополнен exact rawcrumbset/effective labels/полным
predicate и bounded projection; verification4957c301…/review9f466a29… Approved,
62source/37fixtures/132historical hashes match,19tests/typecheck/syntax PASS.
Root81926 live запущен после ready/status-only activation72c602c4…;
моделей0, guards/source/pins unchanged. Это diagnosis, не ordinary acceptance.


Proof10 original468c4235…/root81926exit3 изолировал exact caption conjunct:
final export-sort:n5 имеет verified own native input logical0/native_index1;
unique/bounded/chain/icons=true, exact=false. Hidden crumb7 raw «Источник данных»
получил effectiveLabel пустую/hiddenCaption=false, а crumb8 «Настройка» распознан.
Old workspaceUI80d27… принимает длинную «Входной источник данных», но не actual
короткую подпись. Surgical TDD fix ограничен этой подписью verified prepared port0;
owner/native/chain/icons/sensitivity/uniqueness и publicJSdeny сохраняются.
Rootownuser101 строго bound41b9b3a8… и адресноclosed/admin102logout/MCPexit0;
originalcleanupfalse сохранён. Неизвестный user97 завершил сам сервер по timeout
23:19:16Z; root его не закрывал и ownership не утверждает. LastSave036 readback
7f377888… подтвердил full savedJScomponent/source/schema equal после Group/Sort.
Sourcefix ещё не завершён; commonruntime change потребует новой matched пары и18+25.

Source Export caption fix завершён: workspaceUI1d7f27a7… содержит один alias
для verified logical input0; actualfixturea2f562ad…/test994249ab… дали RED→GREEN
и15negativevariants.350focusedPASS/verificationa8fc54e1…, independent09e5c7f9…
Approved. Root pinnedNode24.19 fullupstream3830tests/3820PASS/0FAIL/10SKIP/exit0,
verificationc67cde34…; три source hashes проверены повторно после suite.
Proof10 recovery independentlyf85a02cf… подтверждён,1993raw/4729resources unchanged,
full savedJScomponent equal; currentworkspaceUI изменён только намеренной правкой,
old80d27immutable цел. Ordinary rebuilt nativeExport/CSV и новая matched18+25
по-прежнему обязательны. Sourcefix не меняет skill/policy/Protocol/publicJSdeny.


Новая matched пара233119-4699a5 source41101ae0b2/runtimebf2fd06b… собрана/
bothverify0 и independently Approved pair130d7d7f…/pins791829db… . Pins6944fa22…/
8ceb74b8…/locke2776d98…/provenancefd1ec5a5… frozen0400;72+2/model/seed/tasks/
43slots unchanged,0models/0oldoutcome transfers. OrdinaryJS root72815exit0,
result507286da…: оба native Group/directSort, ExportSortCSV/5nodes4links,
fullsavedJSsource/component/schema unchanged, publicgenericJSdeny и actual
packageclose/logout/shutdown confirmed. Независимый live review ещёpending.
OrdinaryJoin root22971 running после e6d39d2a… preflight; newrawhiddenDOM capture
не заявляется — проверяются nativeopening ACK/preparedrole context/граф/oracle.
Freshschema probe67472exit0/15standard schemas,0c2166c3… result; actualprepare16
изordinaryJS связан в gap prerequisitef958175b… разныхSession той же immutable
сборки. ProbeexplicitLogout=false сохранён, не подменяется ACK; gapreviewpending.
Current-run192418 остаётся stopped доordinarygates; полные18+25 не запускались.

Все ordinarynative prerequisites завершены независимо: Join root22971exit0/
result8cc5a138…/review7c59cfeb… подтверждает оба native roleopening/context,
fresh[[1,5,15],[1,10,15]], saved3nodes2linksnoJS, actual ownclose/logout/ACKexit0.
Standalone postSaveinputreread/newrawhiddenDOM capture не заявлены; прошлое
hiddenDOM evidence только supporting. JSgate independentlyc2376fff… PASS.
Fresh gap prerequisite independentlyaec86a27… Approved на actual15schemas+
16prepare/31cachekeys той же immutable233119; probeexplicitLogout=false остаётся.
Rootseriesadmission411b35ae… активировал current-run233119, oldpointer сохранён
0400. Новый denominator18baseline+25candidate/first9+16repeats, старые outcomes
не переносились; все прежние policy/math/review gates и предел2коррекций сохраняются.
Ordinary source/build/native prerequisite закрыт отдельно; полные43 ещёне выполнены.
