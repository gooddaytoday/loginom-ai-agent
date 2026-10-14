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
5. Для следующих matched пар после завершённой подготовки аудита: Task 5
   candidate9 после ordinary native gates и immutable pair pins; при чистом
   проходе — шесть baseline новой пары, затем ещё16candidate. Текущий протокол31
   и нормализованные сравнительные критерии заданы в разделе «Текущий протокол»;
   первоначальные43 и исторические серии не переписываются.
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
  для новой matched пары начинается после native gates и заморозки обоих payload;
  digest активации сверяется каждый раз. Сначала candidate9; при чистой волне
  baseline6, затем candidate16. Все31freshслот обязательны для текущей приёмки;
  прежний43-slot порядок сохраняется в original immutable locks как история.
- [ ] При первом доказанном нарушении policy немедленно остановить candidate:
  остальные слоты этой версии не запускать. Сохранить частичную серию со всеми
  исходами, не выдавать её за полную. Если parser не понимает evidence,
  приостановить серию, уточнить parser по фактическим данным и перепроверить
  сохранённые попытки offline; не считать неизвестность нарушением skill.
- [ ] Чистая первая волна означает: у всех девяти полные evidence и соблюдена
  политика; у шести standard и двух JS-исключений есть сохранённый пакет,
  oracle-pass, связность, settlement и exit 0; роль обоих JS проверена reviewer;
  recovery показал реальный отказ, отсутствие JS и успешное исправление.
  Только после этого и baseline6 разрешены повторы. Обычный расчётный провал без нарушения
  policy не запускает правку skill: при подтверждённом cleanup можно закончить
  первую волну для диагностики, но она не открывает вторую. Не повторять один
  неудачный слот до успеха. Причины и дальнейший scope при нечистой волне
  передаются владельцу; автоматической новой полной серии нет.
- [ ] После чистой волны и всех6baseline выполнить ещё16слотов: все шесть standard и оба
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
  из6 и18 соответственно, результаты по каждой задаче (B0..1/C0..3) и полные
  расчётные успехи. Baseline comparison описательное, repeatability старого
  skill не проверена;31 не равноценен43. Инциденты до
  первого model turn перечислить отдельно от матрицы; все начатые модельные
  попытки сохраняются в знаменателе. Это приёмка текущей системы, не isolated
  benchmark score и не доказательство статистической неухудшаемости.
  Явно различать машинную связность/lineage, сплошной oracle/policy audit и
  выборочный семантический review. Зафиксировать длительность пилота/каждой
  попытки; прогноз оставшегося времени пересчитать по наблюдениям.
- [ ] Завершить изменение только при 18/18 policy-pass основных candidate,
  доле oracle-pass C/18 не ниже B/6 и хотя бы одном полном расчётном успехе
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

Fresh baseline233119 sales-by-category/1 completed CLI0/wrapper0/cleanuptrue:
policy/oracle/calculation/history/identity/graph/export PASS, JS0; attempta01a1c0e…/
audit8a6ea80e…/Session ses_ec847ba38ffeWd3bMWkvwHlctf,327s. Model responses
получены, прежнийOAuth401 не повторился. Sales/2 также completed CLI0/wrapper0/
cleanuptrue: policy/oracle/calculation/history/identity/graph/export PASS, JS0;
Session ses_ec841c075ffe63Lv3f42lwlzZ3. Baseline completed2/18/candidate0/25;
ABC/Pareto1 сейчасactive root85644. Все18baseline обязательны доcandidatefirst9;
baseline semanticmanualreview не добавляется.


На 2026-10-14 00:27 UTC в итоговой серии `20261013T233119Z-4699a5`
завершены 3/18 baseline и 0/25 candidate. `abc-pareto-groups/1`
(Session `ses_ec83bda4cffeSynVwFH3wCzQvZ`) завершился с CLI exit 0,
wrapper exit 1, oracle и полным расчётом PASS, cleanup подтверждён.
Два JS-узла дали policy failure `JAVASCRIPT_NOT_ALLOWED`: этот исход baseline
сохранён как замер исходного skill, без повторного запуска или исключения
из denominator. SHA attempt `793a8112…`, audit `371e128f…`.
После завершения root85644 и проверки отсутствия `.writer` запущен
`monthly-demand/1` (root2256). Следующий плановый слот —
`risky-approved-claims/1`. Полная серия и приёмка ещё не завершены.


На 2026-10-14 00:35 UTC `monthly-demand/1` завершился успешно:
CLI/wrapper exit 0, oracle, полный расчёт и policy PASS, JS-узлов 0,
cleanup подтверждён. Session `ses_ec83209c8ffe7IlsZil6VEzyop`,
SHA attempt `ead66583…`, audit `0d683b46…`. Завершены 4/18 baseline,
0/25 candidate. После завершения root2256 и проверки отсутствия `.writer`
запущен `risky-approved-claims/1` (root97266); далее планируется
`campaign-roi-by-channel/1`. Итоговая приёмка остаётся незавершённой.


На 2026-10-14 00:43 UTC завершены 5/18 baseline, 0/25 candidate.
`risky-approved-claims/1` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec82a8030ffeJirBk4gJptkkLo`,
SHA attempt `0d9e0e8c…`, audit `a221aa9c…`. Наблюдённый `REQUEST_REJECTED`
из-за неподдерживаемой подписи Filter исправлен новым запросом к стандартному
Filter, который затем получил `SUCCEEDED`; это baseline evidence, а не
candidate recovery PASS. Root97266 завершён, `.writer` отсутствовал перед
запуском `campaign-roi-by-channel/1` (root29101). Следующий плановый слот —
`first-last-touch/1`; итоговая приёмка ещё не завершена.


На 2026-10-14 00:50 UTC завершены 6/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/1` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec82324e8ffe4370QyZIlzph7o`,
SHA attempt `08df55f5…`, audit `49ba77dc…`. Root29101 завершён, `.writer`
отсутствовал перед запуском `first-last-touch/1` (root82747). После него
остаются 11 предусмотренных baseline повторов: sales/3, остальные пять
сценариев/2–3. Candidate first9 разрешён только после всех 18 baseline.
Все шесть завершённых попыток дали oracle и полный расчёт PASS;
policy PASS у пяти, ABC/Pareto использовал два JS-узла. Приёмка ещё не завершена.


На 2026-10-14 00:54 UTC завершены 7/18 baseline, 0/25 candidate.
`first-last-touch/1` прошёл oracle и полный расчёт, CLI exit 0, wrapper exit 1,
cleanup подтверждён; один JS-узел дал `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec81ccd64ffeAxnGWvlWW7Q8rB`, SHA attempt `5d97c4d8…`,
audit `8ca3380d…`. Во всех семи завершённых baseline oracle/расчёт PASS;
policy PASS у пяти, JS встретился в ABC/Pareto и first/last touch.
Root82747 завершён, `.writer` отсутствовал, оставшиеся 11 слотов и их root logs
не существовали. Root17410 последовательно запускает отдельные процессы
проверенного `run-node-selection-attempt.ts`: sales/3; ABC/2; monthly/2;
claims/2; ROI/2; first-last/2; ABC/3; monthly/3; claims/3; ROI/3; first-last/3.
Каждый следующий процесс допускается только после CLI exit 0, modelStarted,
finishedAt, cleanup true, отсутствия blocker/collection failures/timeout и
wrapper exit 0 или 1. Baseline policy failure остаётся измерением; техническая
аномалия останавливает очередь для разбора. Candidate в очередь не включён.
Текущий слот — sales/3; полная серия и итоговая приёмка ещё не завершены.


На 2026-10-14 01:00 UTC завершены 8/18 baseline, 0/25 candidate.
`sales-by-category/3` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec818eb1cffeXh48iCuXH9H55q`,
SHA attempt `7fe5ccbf…`. Все три sales-прогона успешны. Root17410 продолжает
ту же последовательную очередь; текущий слот — `abc-pareto-groups/2`.
Новые результаты не переносятся из прежних серий; приёмка ещё не завершена.


На 2026-10-14 01:07 UTC завершены 9/18 baseline, 0/25 candidate.
`abc-pareto-groups/2`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, два JS-узла и policy failure `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec813c7c4ffel3RV1nTZWRsmwf`, SHA attempt `260d6b1b…`,
audit `e061eec9…`. Во всех девяти baseline oracle/расчёт PASS, policy PASS
у шести. Root17410 активен и последовательно перешёл к `monthly-demand/2`;
следующий слот — `risky-approved-claims/2`. Приёмка ещё не завершена.


На 2026-10-14 01:15 UTC завершены 10/18 baseline, 0/25 candidate.
`monthly-demand/2` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup true. Session `ses_ec80d497bffeCpBAzDR1JtjJ1u`,
SHA attempt `a76ae1f3…`. Во всех десяти baseline oracle/расчёт PASS,
policy PASS у семи. Root17410 продолжает очередь, следующий слот —
`risky-approved-claims/2`. Полная серия и приёмка ещё не завершены.


На 2026-10-14 01:23 UTC завершены 11/18 baseline, 0/25 candidate.
`risky-approved-claims/2`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec805bdc6ffeJ43aeVqcT3HBbP`,
SHA attempt `13ec8ec2…`, audit `efa96085…`.
Во всех 11 baseline oracle/расчёт PASS, policy PASS у восьми. Root17410
активен; текущий слот — `campaign-roi-by-channel/2`, далее first-last/2
и пять третьих прогонов. Итоговая приёмка ещё не завершена.


На 2026-10-14 01:30 UTC завершены 12/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/2`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7feeac4ffeTlnFgqeXYj1gOS`,
SHA attempt `335b6403…`, audit `2689a4a1…`.
Во всех 12 baseline oracle/расчёт PASS, policy PASS у девяти. Root17410
активен; текущий слот — `first-last-touch/2`, далее пять третьих прогонов.
Итоговая приёмка ещё не завершена.


На 2026-10-14 01:34 UTC завершены 13/18 baseline, 0/25 candidate.
`first-last-touch/2`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, один JS-узел и `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec7f82e21ffe0w2dxt3HwdHP5M`, SHA attempt `b0ac60e4…`,
audit `73f42f65…`. Во всех 13 baseline oracle/расчёт PASS, policy PASS
у девяти. Root17410 активен; текущий слот — `abc-pareto-groups/3`,
далее monthly/3, claims/3, ROI/3, first-last/3. Приёмка ещё не завершена.


На 2026-10-14 01:43 UTC завершены 14/18 baseline, 0/25 candidate.
`abc-pareto-groups/3`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, два JS-узла и `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec7f48e58ffeP9ePIP2eZTP9vd`, SHA attempt `817532d9…`,
audit `59dd4627…`. Все три ABC baseline прошли oracle/расчёт с двумя JS-узлами
каждый. Во всех 14 baseline oracle/расчёт PASS, policy PASS у девяти.
Root17410 активен; текущий слот — `monthly-demand/3`, далее claims/3,
ROI/3 и first-last/3. Итоговая приёмка ещё не завершена.


На 2026-10-14 01:51 UTC завершены 15/18 baseline, 0/25 candidate.
`monthly-demand/3`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7ec4d32ffe1AENYSp2CqOFv4`,
SHA attempt `5cb62388…`, audit `727c8d9e…`.
Все три monthly baseline успешны без JS. Во всех 15 baseline oracle/расчёт
PASS, policy PASS у десяти. Root17410 активен; текущий слот —
`risky-approved-claims/3`, далее ROI/3 и first-last/3. Приёмка ещё не завершена.


На 2026-10-14 02:03 UTC очередь root17410 остановлена на технической аномалии
`risky-approved-claims/3`: Session `ses_ec7e51480ffevfxBR9hkm10mSb`,
CLI exit 1, wrapper exit 3, cleanup false,
`SELECTION_CLEANUP_UNCONFIRMED`, SHA attempt `596780a5…`.
Начатый слот сохранён в denominator: завершены 16/18 baseline,
15 oracle/полных расчётов PASS, 10 policy PASS; ROI/3 и first-last/3 не запускались.
Экспорт реально выполнился, но чтение файла остановилось с
`NODE_APPLY_STOPPED: Export file search scroll budget exhausted`:
12 успешных прокруток достигли top12000, max_top14089, целевой файл не найден.
Полного Save нет; Package1 остался несохранённым, full calculation PASS
этого слота не заявляется. CLI649907 умер; `.writer` намеренно сохранён.
Независимая read-only проверка связала user137/init01:50:59.405Z с пятью
фактическими native GUID этой попытки; fresh admin inventory видит эту же
сессию с CreateTime01:50AM (UI точность до минуты, не soleidentity).
Root PlaywrightMCP84741/admin138 открыт для адресного recovery user137;
user132/134/136 и остальные сессии не трогались. Проверка exact receipt-owned
allowlist уже скопированных файлов идёт параллельно; source/runtime не менялись.
До подтверждённого закрытия own-сессии и адресного guard recovery следующие
модельные попытки запрещены. Исходный failed outcome не заменяется.


На 2026-10-14 02:18 UTC адресное recovery собственной user137 завершено:
strict binding `4924ba9d…`, server close02:05:01.287/.288Z,
admin138 logout02:05:57.854Z, PlaywrightMCP84741 exit0.
User132 исчез по штатному timeout1800s02:03:52.914Z; user134/136 не закрывались.
Guard review `5a9a75c7…` подтвердил exclusive admission, deadCLI/runtime,
неизменный nonce8140…; root атомарно архивировал intact `.writer` в
`.writer-recovered-node-selection-20261013T233119Z-4699a5-user137`.
Receipt `36b7203f…`, независимый final recovery `6f4b1c6e…`:
inode/bytes сохранены, исходный failed attempt `596780a5…` остаётся прежним.

После read-only плана `a0955691…` и независимого review `b1247c38…`
root перепроверил102 exact receipt-owned files и перенёс их same-device68
в `/workdir/UserStorage/user/node-selection-archive-20261014T0214Z-4699a5`.
Receipt `82953398…` и полный inverse-path map сохранены отдельно:
614→513 top-level entries фактически; target bytes/SHA/inode/mode/mtime
сохранены, исходные пути отсутствуют, остальные имена не изменились.
34 input +34 savedLGP +34 CSV уже имели проверенные локальные копии.
Текущие failed CSV/input и неизвестные файлы вне allowlist. Файлы не удалены;
перед будущим reopen/reproduction LGP и входы нужно вернуть по inverse map
на точные прежние пути. XML и raw evidence не переписывались.
Предварительный сбой служебной find-команды на embeddedNUL произошёл до
intent/mkdir/move; исправлен только delimiter эфемерной команды.
Оценка max_top11665 остаётся прогнозом до следующего ordinary наблюдения.

Source/runtime/skill/закреплённые входы не менялись: matched233119 продолжается,
пересборка18+25 не требуется. После exact recovery/absence.writer и root
postmove-check запущен root23200: только оставшиеся ROI/3 и first-last/3,
последовательно отдельными CLI с тем же gating. Независимая postmove-проверка
идёт параллельно read-only. Baseline completed16/18,15oracle/полных расчётов PASS,
10policy PASS; candidate0/25. Failed claims/3 не заменяется и не исключается.
Для следующих live-слотов каталог нужно периодически поддерживать адресным
архивированием только finished cleanup-confirmed receipt/copied artifacts;
каждый перенос требует того же exact pre/post-check и inverse map.
Итоговая приёмка ещё не завершена.


На 2026-10-14 02:26 UTC завершены 17/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/3`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7cc35e5ffeOMtGOMaIZcZ0GG`,
SHA attempt `1ffc6e9f…`, audit `d79df2c9…`.
Первый плановый ordinary export после архивирования успешно получил CSV;
sourceworker read-only извлекает actual scroll bound из его raw без extra probe.
Postmove независимый review `6e1a3ae9…` подтвердил102targets/absenceoriginalpaths,
213local evidence,10pins/locks,74source,288runtime каждого payload unchanged,
а также failed CSV/input и архив guard. Recovery и storage действия завершены;
активен только root23200 на последнем baseline `first-last-touch/3`.
Во всех17startedslots16oracle/полных расчётов PASS,11policy PASS; failedclaims3
сохранён. После последнего baseline запланирован exact incremental archive
его и ROI3 шести успешных/copied файлов в тот же own archive, с прежними
pre/postconditions и restore map. Сопоставимая серия/skill/source не меняются.
Полная приёмка ещё не завершена.


На 2026-10-14 02:33 UTC baseline итоговой matched-серии завершён:18/18startedslots,
17oracle/полных расчётов PASS,11policy PASS. Последний `first-last-touch/3`
(Session `ses_ec7c5ee43ffe21njjqq6wmkAII`) дал oracle/расчёт PASS,
CLI0/wrapper1/cleanuptrue, JS1 и `JAVASCRIPT_NOT_ALLOWED`;
SHA attempt `63eb7bdf…`, audit `241cb302…`. Root23200 завершён exit0.
В17полных baseline-аудитах JS-узлов9: ABC3×2 и first-last3×1;
failedclaims3 остаётся CLI1/wrapper3/cleanupfalse/incomplete без замены.
Фактическая baseline-хронология отличается от заданного в исходном плане
порядка Task3: sales/2 выполнен сразу после sales/1, sales/3 — перед остальными
attempt2. Это отклонение сохраняется в ledger;18уникальных слотов/аналитические
входы/model/pins/фазы и последовательное использование профиля не изменялись.
Исходное правило candidate first9 и stop-on-first-policy-violation сохраняется.

Обычный ROI3-журнал после archive подтвердил max_top11713 и успешное получение
exactCSV286B/SHA1d8460f2… после10прокруток доtop10000, затем verified workflowreturn.
Observation `1610d2a6…`; initial target DOM outside_viewport не выдаётся заhit-testPASS.
Перед candidate подготовлен read-only incremental6plan `7be74b8a…`:
ROI3+firstlast3 own inputs/savedLGP/CSV, existingarchive102→108,
freshroot519→predicted513, fullinversemap. Независимый review ещё ожидается,
перенос этих6файлов ещё не выполнен; candidate0/25, новыхпроцессовнет.
Полная приёмка остаётся незавершённой.


На 2026-10-14 02:46 UTC финальный baseline ledger `7db572d8…` независимо подтверждён:
18unique started/finished,17machine/oracle/расчёт PASS,11policy PASS,
6FAIL и1incomplete,JSnodes9/calls10/successful9;330assistant model/variant messages,
18parentless/childfree snapshots,54runtime files,74source/10inputs и оба288runtime.
Incremental6перенос послеreview `0e70093b…` завершён: receipt `f0d2a18a…`,
513root/108archive измерены; postmove review `c9135a0d…` подтверждает все108bytes/
inodes/sourceabsence/обратнуюкарту и неизменность231evidence/pins/source/runtime.

Candidate first3 запущены root56096 в закреплённом порядке
sales/1→ABC/1→monthly/1; следующий слот начинается только при CLI/wrapper0,
cleanup/modelStarted/finishedAt/policy/oracle/fullcalculation PASS, иначе очередьSTOP.
`sales-by-category/1` завершён: Session `ses_ec7b8c849ffeWvjumDgTnvsJCs`,
CLI/wrapper0,cleanuptrue,policy/oracle/расчёт PASS,JS0;
SHA attempt `28e2d1d6…`, audit `bd4b399d…`.
Candidate completed1/25 (firstwave1/9); сейчас ABC/1,Session `ses_ec7b3d89fffeuHWc7SGKou3bao`.
Read-only ранний наблюдатель использует существующий frozen `inspectSelection`
на complete own-session tool_use parts в standardcases: canonical
`target.type=programming.javascript` означает `JAVASCRIPT_NOT_ALLOWED`
независимо от completed/error и output.running; при таком доказательстве root
прерывает own supervisor черезSIGINT и не запускает оставшиеся digest slots.
Describe/Calculator formulas/source refs и произвольные aliases не выдаются за
такое доказательство; финальный полный аудит остаётся обязательным.
Новый helper/source не создавался; общий build/skill/pins unchanged.
После cleanfirst3 нужен адресный archive9ихcopiedfiles передследующимchunk3.
Полная приёмка ещё не завершена.


На 2026-10-14 03:09 UTC candidate завершил 2/25 слотов (первая волна 2/9).
`sales-by-category/1` остаётся полным PASS. `abc-pareto-groups/1`, Session
`ses_ec7b3d89fffeuHWc7SGKou3bao`, завершён CLI 1 / wrapper 3 / cleanup false /
incomplete; oracle отсутствует, полного расчёта нет. Исходный SHA attempt
`2f048e06af106c17263fcff9ce2b97b2d8ead4d0c311444e39250c9bc6d07fb2` сохранён.
JS-попыток не наблюдалось, но без сохранённого графа это не policy PASS.
Root 56096 остановился exit 1; месячный спрос в этой очереди не запускался.

Отказ `calc-share-1`: `NODE_APPLY_STOPPED` с причиной
`WIZARD_OPEN_NOT_CONFIRMED`. Последующий снимок показывает нужный Calculator
`98530181-7349-4b26-a343-e7ac5ad82974` и правильный breadcrumb, но получен новым
`readUi()` после ошибки; точное состояние провалившегося предиката отсутствует.
Конфигурация формулы ещё не начиналась. Протокол не умеет продолжить unresolved
фазу open; inspect/resume/recover/cancel не восстановили её. Причину нельзя
приписать параметрам модели или объявить доказанным общим runtime-дефектом.

Адресное recovery выполнено отдельно от failed outcome. Strict binding
`e794705a…` подтвердил собственный `user:146`, init 02:44:52.092Z и четыре native
GUID. Root через Playwright MCP закрыл только эту сессию, вышел из admin:147 и
завершил bridge 11663 exit 0. Независимый postclosure review `3800ac5c…` подтвердил
server close 03:05:10.044Z, logout 03:05:24.132Z, завершение своих процессов и
неизменность raw 16, source 74, pins 10 и обоих payload runtime 288.
Guard с nonce `0fdc8b00-5d1e-448f-9b8a-8278dc2fdc5f` перенесён целиком в
`.writer-recovered-node-selection-20261013T233119Z-4699a5-user146` после сверки
inode и bytes; receipt `4cc274c5…`. Финальный независимый postarchive review ожидается.

Решение владельца выполнения: после этого review закончить оставшиеся первые
слоты только для диагностики, в frozen порядке monthly → claims → ROI →
first-last → explicit-js → tags → recovery. Первая волна уже нечистая: повторы
2/3 закрыты, ABC/1 не заменяется, полная приёмка не достигнута. При доказанном
нарушении policy дальнейшие слоты этого digest останавливаются. Параллельно
готовится отдельный deterministic native diagnostic без LLM для exact open
predicate; до воспроизведения product/runtime/skill/pins не меняются.


На 2026-10-14 03:18 UTC адресное recovery ABC/1 завершено: независимый
postarchive review `bdfcd9ee…` подтвердил сохранённые inode/bytes guard,
отсутствие исходного `.writer` и неизменность failed outcome, raw, pins,
исходников, runtime и квитанций закрытия. Original ABC/1 не повторялся.

`monthly-demand/1` завершён полным PASS: Session
`ses_ec79d2db9ffe53yzDMRmbd2a4T`, CLI/wrapper 0, cleanup true, oracle/policy/
calculation PASS, JS nodes/calls 0. Машинный аудит подтвердил полную историю,
settlement, идентичность экспорта и связность сохранённого графа.
SHA attempt `a781c5f7d45e6015b202589f880974544d3aca2bd1d8747183e4ca192610cf07`,
selection-audit `3f5251f0966a645b6579cc829d004175547d3e67380860324974bc86eecfe9f4`.
Root 59629 завершён exit 0; длительность CLI около 484 секунд.
Candidate завершил 3/25 (firstwave 3/9): два полных PASS и один технический
incomplete; JS-вызовов не наблюдалось. Baseline остаётся 18/18, 17 oracle/
расчёт PASS, 11 policy PASS. Общий build/skill/pins не менялись.

Перед следующим frozen модельным слотом claims/1 профиль временно выделен
для отдельного deterministic native diagnostic ABC opening без LLM.
Подготовка и TDD идут в ignored private run directory; независимый review
проверяет trace без изменения guard/control flow. Live diagnostic ещё не
запущен. Его результат не заменяет ABC/1 и не считается acceptance.
Первая волна остаётся нечистой, повторы закрыты, полная приёмка не завершена.


На 2026-10-14 03:35 UTC separate native ABC diagnostic воспроизвёл отказ
`calc-share-1` на пятом узле после четырёх успешных стандартных операций.
Root 32456 завершён exit 3; модельных вызовов 0. Result SHA
`307e12720ae23ae2e76d554ccdb08d94a201b15cb5591fc1e738c2bb9dfdaf6d`.
Instrumented результат не считается acceptance и не заменяет candidate ABC/1.
Private helper выполнен по TDD: четыре теста, целевой typecheck и syntax PASS;
static independent review `600579b3…` подтвердил неизменный исходный guard,
4456 source hashes, один исходный browser send без дополнительных чтений.
Root сохранил reviewed binding `fc84c59b…`; изменены только ready/status,
active binding `40984ed7…`. Product, matched payload и acceptance pins unchanged.

В captured pre-catch tuple для `calc-share-1:n29` через 534 ms после начала
browser call `contextMatches=true`, `intendedWizard=true`, native GUID before/
after совпал, dialogs 0. Единственный отказавший conjunct — две busy-маски.
У первой `target_tid=MF;TF-1;WizrdMCF`, у второй target_tid/dialog_ref null;
поэтому `ownedLoading` отказал и ожидание масок не начиналось. Источник второй
маски пока не установлен: её class/parent/geometry/cache identity отсутствуют
в первой trace. Это основание для уточнения диагностики, не для blanket-ignore
или изменения product guard. Готовится отдельная private v2 trace, сохраняющая
readonly DOM ownership в том же исходном browser call; v1 files/raw не меняются.

Cleanup/logout/shutdown диагностического Host не подтверждены, own PID 794091
в close receipt завершён exit 1 / ACK false. Package1 не сохранён. Нужны strict
server binding и адресное Root recovery этой новой собственной сессии; admin
inventory получен, сессии ещё не закрыты. Next candidate claims/1 не запускался.
Candidate остаётся 3/25 (два полных PASS, один incomplete), baseline 18/18.
Firstwave нечистая, повторы закрыты, итоговая приёмка не завершена.


На 2026-10-14 03:39 UTC native diagnostic v1 полностью проверен offline:
independent live review `8aec753b…` подтвердил 3557 journal rows одной
session/runtime/actionManifest, 61 public receipts, четыре runtime journals
и все 68 raw references. Sole failed conjunct — masks.length; источник
второй маски по этим данным ещё не доказан.

Адресное recovery этой диагностики завершено: strict binding `cf3dcf03…`
подтвердил `user:150`, init 03:24:21.547Z и четыре native GUID. Root через MCP
86234 закрыл только 150, logout admin:151 и bridge exit 0. Independent
postrecovery review `3100e4ca…` подтвердил server close 03:36:37.536Z,
logout 03:36:47.698Z, завершение own PID 794091, отсутствие `.writer`,
неизменность raw 68, source 4456, acceptance source 74, pins 10 и runtime
288 каждого payload. Изменения профиля/guard не требовались.

Original diagnostic `307e1272…` сохраняет cleanup/logout/shutdown false;
recovery записано отдельно. Candidate ABC/1 `2f048e06…` остаётся failed.
Профиль свободен; следующих model slots пока нет. Приоритет — уточнить
владельца второй маски отдельной private v2 trace, сохранив v1 неизменной,
затем решить необходимость минимальной runtime-правки. Если общая правка
потребуется, прежняя matched-серия останется исключённой из итоговой приёмки,
а новая потребует всех прежних 18+25 gates. Skill по технической ошибке
не меняется; JS fallback не разрешён. Первая волна 3/9, candidate 3/25,
полная приёмка не завершена.


На 2026-10-14 03:45 UTC private mask diagnostic v2 запущен Root 26816
после independent static approval `b8c5ae24…`: семь тестов PASS, 4458 source
hashes и 79 V1 originals совпали. Дополнительно закрыты два RED→GREEN finding:
nonboolean cached value не выводится, cached foreign DOM getter не вызывается.
V2 capture выполняется в том же исходном evaluate; temporary field удаляется
до исходного guard/public snapshot. Повторных чтений/кликов/IPC не добавлено.
Пять исходных apply inputs, driver, managed entry и replay совпадают с V1.
Verification `e11dbb6e…`, reviewed binding `5c4eac75…` сохранён; Root изменил
только ready/status, active binding `9ae3a3a8…`. Каталог
`abc-wizard-mask-diagnostic` отделён от неизменного V1.
Live input доставлен, импорт выполняется. Model calls 0; no early Save,
Product/skill/payload/pins unchanged. Native diagnostic не является acceptance.
Следующие модели не запускались; candidate 3/25, firstwave 3/9 нечистая,
повторы и итоговая приёмка остаются незавершёнными.


На 2026-10-14 03:58 UTC V2 native diagnostic завершён Root 26816 exit 0,
без LLM: пять исходных apply и diagnostic-save SUCCEEDED, package_closed /
logged_out true, no discard, Host ACK/exit 0. Result
`2f2e995ca9db14ae9ed1565664c2abb5d2238de7b403c10ceb8c59a38f0ac19a`.
Independent postlive review `cc0e67c3…` подтвердил 3988 journal rows одной
session/runtime/actionManifest, 66 receipts, четыре journals и 73 raw,
4458 source / 79 V1 / 74 acceptance / 10 pins / оба runtime 288 unchanged.

Целевой Calculator в 557 ms показал единственную own wizard mask;
штатное ожидание 394 ms закончилось masks 0 и verified open в 951 ms.
Второй mask без TID из V1 не воспроизведён и не классифицирован. Это
non-reproduction, не Product fix, не acceptance и не замена failed ABC/1.
Save связан с own path `/user/ABCOpenDiag-d3f61ea4ba1e4fd4.lgp`, но
reopened/persisted_content_verified false; проверки сохранённого содержимого
и повторного открытия не заявляются. Дополнительная диагностика без нового
actualfailure сейчас не нужна; Product/skill/runtime/pins не меняются.

Диагностическая candidate firstwave продолжена в frozen порядке:
`risky-approved-claims/1` запущен Root 78243; Session
`ses_ec770db5bffeqJU4QzDZwcPh7p`, стандартный импорт выполняется, JS-вызовов
пока нет. После terminal нужен exact own archive трёх успешных/copied
candidate slots (sales/monthly/claims, девять файлов), с прежними статическими
pre/postconditions и обратной картой; во время active CLI файлы не переносятся.
Candidate completed 3/25, firstwave 3/9 нечистая, повторы закрыты;
полная приёмка не завершена.


На 2026-10-14 04:05 UTC `risky-approved-claims/1` завершён полным PASS:
Session `ses_ec770db5bffeqJU4QzDZwcPh7p`, CLI/wrapper 0, cleanup true,
oracle/policy/calculation PASS, JS nodes/calls 0. SHA attempt
`cd7cc72d40f5a703ab7f382ab90f501d3e477a9a0a3e01ddea6891f7f0d57f14`,
audit `27b07d0a59a02d6703e3237e0c043045734410c7464d5d222aeb4d528759a58f`.
Машинный audit подтвердил полную историю, runtime settlement, export identity
и связность графа. Root 78243 завершён exit 0; CLI около 381 секунды.

В observed history `filter-approved-high-1` отклонён до эффекта:
REQUEST_REJECTED / Unsupported node label (подпись содержит >), cleanup true.
Модель исправила подпись и с NEW operation ID `filter-approved-high-2`
успешно применила тот же стандартный Filter. JS fallback не использован;
это естественная ошибка настройки, отдельно от явного recovery fixture.

Candidate completed 4/25 (firstwave 4/9): три полных PASS и ABC/1 incomplete.
Baseline остаётся 18/18, 17 oracle/расчёт PASS, 11 policy PASS. Общие build,
skill и pins unchanged; повторы 2/3 закрыты, полная приёмка не достигнута.
Перед frozen next ROI/1 Root ждёт exact own archive девяти copied файлов
sales/monthly/claims с independent review; активных Root CLI/native/admin нет.
Read-only preparation6 `d8feff37…` сохранена (prior archive108/protected254);
отдельный final9plan готовится после claims terminal. Active/failed/unowned
файлы не переносятся, полная inverse map обязательна.


На 2026-10-14 04:13 UTC exact own archive трёх успешных candidate slots
sales/monthly/claims завершён. Final9 plan `8bf57641…` и independent approval
`e3393cf0…` сохранены без изменения readyForMove. Root operator 25780 повторил
проверки own receipt/local bytes, inode/mode/mtime/ctime/SHA, target absence,
idle profile и terminal CLI, protected268, prior108 и excluded6 до переноса.
Девять точных файлов перемещены `mv -n` на том же device68 в существующий own
archive; intent и полная inverse map записаны до переноса. Ничего не удалено.
Receipt `6b97846b8465655d3754d93dbc03afbd887074d679a7a2f64e8ea5b2392518b2`:
root526→517, archive108→117. New targets сохраняют bytes/SHA/inode/mode/mtime;
original paths absent; prior108, excluded6, protected268 и остальные root names
unchanged. Перед будущим reopen/reproduction обязательна точная обратная
реставрация соответствующих LGP и входов. Independent postmove ещё ожидается.

Следующий frozen candidate slot — ROI/1 после этого review. Root CLI/native/
admin отсутствуют; Product/skill/build/pins unchanged. Candidate completed4/25
(три полных PASS, ABC/1 incomplete), firstwave4/9 нечистая. Baseline18/18:
17oracle/расчёт PASS,11policy PASS. Повторы закрыты, итоговая приёмка не завершена.


На 2026-10-14 04:16 UTC independent postmove `16020b56…` подтвердил
117 archive names/bytes/SHA/device/inode/mode/mtime и отсутствие всех117
original paths; prior108 fullstats и excluded6 fullstats/SHA unchanged,
root517 измерен. Protected268/3excluded refs/141V1+V2raw/4458diagnostic source,
74acceptance source/10pins0400/обаruntime288 unchanged. Other root name equality
подтверждена Root operator; независимый review не заявляет повторное сравнение
полного before inventory, которого в receipt нет. Blockers отсутствуют.

Frozen следующий `campaign-roi-by-channel/1` запущен Root32921; Session
`ses_ec7615900ffeSpJbGwjzNPDotz`, стандартный импорт выполняется, JS-вызовов
пока нет. Source/build/skill/pins неизменны, инструментация private diagnostics
в этот model run не добавляется. Candidate completed4/25; первая волна4/9
остаётся нечистой, повторы закрыты, полная приёмка не завершена.


На 2026-10-14 04:22 UTC `campaign-roi-by-channel/1` завершён полным PASS:
Session `ses_ec7615900ffeSpJbGwjzNPDotz`, CLI/wrapper0, cleanuptrue,
oracle/policy/calculation PASS, JS nodes/calls0. SHA attempt
`1e37171e0efe0098f234b900f200df544cc4fdc169cbee0631f8ad15c20d637d`,
audit `4dd8c7e07a3896e4f8fabe557c0326feec01f11e0b943b6b6e9d3acc5e0e1488`.
History completeness, settlement, export identity и graph completeness PASS;
Root32921 exit0, CLI около378секунд. Обычный model run не содержит private
инструментацию. Product/skill/build/pins unchanged.

Следующий frozen standard `first-last-touch/1` запущен Root4970.
Candidate completed5/25 (four full PASS и original ABC/1 incomplete),
firstwave5/9 нечистая. Baseline18/18,17oracle/расчёт PASS,11policy PASS.
JS-вызовов в candidate standard пока не наблюдалось; это не policyPASS
несохранённого ABC/1. Повторы закрыты, полная приёмка не завершена.


На 2026-10-14 04:43 UTC candidate `first-last-touch/1` завершён технически
неполно: Session `ses_ec75aae26ffel7visXjzm5Wf31`, CLI exit1 / wrapper3,
cleanup false, attempt SHA
`284f23435c2cc4bfbfb4ecaceffb60970d1409715702fd7a66633976d8cd119b`.
Save, CSV и oracle отсутствуют; observed JS0 не является policy PASS.
Семь стандартных узлов выполнены успешно: Import, Calculator, два Group,
Join, Reform Columns (подготовка имени канала) и Sort. Ранее в progress
Reform Columns ошибочно назван Calculator; здесь сохранён фактический тип.

При Export3 native input0 имеет bbox (1164,780,15,24), нижняя граница own
canvas794, viewport800, scrollTop0/max82. После Link штатный cleanup
восстанавливает прежний scrollTop. Native GUID/роль/владелец проходят проверку,
но все девять hit points не принадлежат целевому PortCell; rightclick
не выполняется. Два covering div имеют role=presentation; точные владельцы
не установлены. Внутренний отказ NOT_APPLIED/effect false/cleanup true
не отменяет уже созданные Export и Link: внешняя операция AMBIGUOUS.
Это ошибка видимости поддерживаемого стандартного узла, не capability gap
и не основание для JS fallback. Патч для неповторившейся второй маски ABC
не выбран; V1/V2 evidence сохраняется как диагностика.

Строгая привязка собственных семи native GUID и latest server init04:22:10.525Z
подтвердила user:158; binding SHA
`f59e17748719e8d91affb42ca73a72074440f77e1690b1b8a2b87aab36a177c7`.
Закрыта только user:158 в04:40:31.099Z, admin:159 logout04:40:41.218Z,
две refresh подтвердили отсутствие собственной сессии, MCP69805 exit0.
После independent archive admission `df46f231…` guard перемещён intact
atomic rename в `.writer-recovered-node-selection-20261013T233119Z-4699a5-user158`;
receipt `ba16e90049a306a9aae2cf10a0d501478f8089574aaf11ae3089e59c564fe3b5`.
Original attempt не переписан и не повышен до PASS. Финальная независимая
проверка сохранности recovery boundary ожидается; Product/tests ещё неизменны.

Решение: непосредственно перед input0 mapping стандартного exports.text,
после Link, при доказанном выходе порта за нижний край viewport выполнить одну bounded
прокрутку собственной canvas через существующий guarded scroll.
Использовать свежий видимый non-script graph anchor с тем же container_ref,
не obscured port. Затем fresh observe должен подтвердить прежние document,
workflow, Export и canvas. Исходный openInputPort(0), native ownership,
роль и все девять hit checks остаются обязательными; если порт всё ещё
перекрыт, stale, masked/locked или диапазон недостаточен, клика нет.
Не добавляются public tools, JS grants, alias, обход guard или общий layout.

Серия233119 остановлена после18baseline и6candidate: baseline17oracle/расчёт PASS,
11policy PASS,6FAIL,1incomplete; candidate4full PASS и2technical incomplete,
firstwave6/9 нечистая. Явные JS/tags/recovery и повторы этой сборки не запускаются.
Необходимая правка общего runtime требует новой immutable matched пары и
полных18baseline+25candidate на новой сборке. Старые попытки сохраняются
исключёнными из итоговой приёмки; их нельзя заменять, переносить или повторно
считать. Политика skill и критерии приёмки unchanged; задача не завершена.

План устранения Export input0 clipping (следующее продолжение):

- [x] Подтвердить final independent recovery158: original attempt/raw/history,
  source74, pins10 и оба runtime288 unchanged; guard source absent, archive
  inode/bytes сохранены, собственные процессы terminal.
- [x] По TDD исправить только
  `packages/loginom-runtime/client/lib/text-export-node.mjs` и focused tests
  для реального post-Link clipped input0. Первый RED воспроизводит отказ,
  GREEN делает одну own bounded scroll перед неизменным openInputPort.
  Регрессии покрывают видимый порт без scroll, stale/foreign anchor,
  иной document/workflow/node/container, mask/lock, отсутствие scroll range,
  сохраняющееся перекрытие и запрет scroll через script-node anchor.
  Использовать actual failed evidence и существующие test fixtures; тестировать
  factory path, не копию алгоритма. Исходный node-port-open guard не менять.
  Обязательный RED воспроизводит actual clipping на прежнем factory; новый
  guard также вводится через RED→GREEN. Уже действующие negative guards
  или visible no-scroll могут сразу быть GREEN; искусственно ломать их не нужно.
- [x] Завершить independent source review и checks. Из каталога
  `packages/loginom-runtime/client` выполнить pinned Node24.19 focused tests
  (новый `test/text-export-input-reveal.test.mjs`, existing text-export,
  node-port-open, workspace-ui) и полный `node --test test/*.test.mjs`;
  сохранить command/log/summary. Исправления review также RED→GREEN.
- [x] После source commit собрать новую matched baseline/candidate пару;
  зафиксировать новые source/runtime/pins при прежних baseline74/candidateff18
  skill и frozen модели. Обычным native runtime без LLM/instrumentation
  доказать clipped Export input0: одна scroll действительно выполнена,
  mapping/Save/CSV/cleanup проходят; заново проверить соответствующие
  JS downstream; Join roles и catalog-gap проверить через source dependency
  reuse для неизменных handlers плюс fresh16cards prepare (ограничения и
  исторический explicitLogoutfalse сохранены). Private ABC trace не входит
  в acceptance runtime.
- [ ] На новом matched runtime выполнить все6baseline и25candidate через
  существующий one-attempt runner. Candidate первая волна9 должна быть чистой
  до повторов; first policy violation останавливает серию. Сохранить full
  history, graph/oracle/runtime audit, recovery и обязательные manual reviews.
  Порядок новой серии: необходимые native gates/pins, candidate9 (ABC/firstlast
  первыми), clean gate, baseline6, candidate16; все процессы последовательно.
  Candidate workload/deadlines/gates неизменны. Baseline сокращён prospectively
  до first model по пользовательской оптимизации31; ограничения comparison явны.

Каждое отмеченное выполнение отдельного пункта сохраняется отдельным
описательным коммитом, как требует пользователь. Пока новые пункты открыты.


На 2026-10-14 04:50 UTC final independent recovery158 review PASS:
`a82224430bbc21ee95d92bf9fd3ed6b0b4e324d336006057e732ef82e6b2279b`.
Source .writer absent; архив сохраняет nonce/owner bytes/device/inodes7628891/7628892,
mode и mtime; directory ctime ожидаемо изменён rename. Fresh server log
подтверждает собственные closure158/logout159 без новых incarnations; own CLI/
chat/profile/currentpayload managed processes absent. Original attempt284f…
и raw16 (145parts/39messages), source74, pins10×0400, runtime288×2 и working288
unchanged. Операционное восстановление завершено отдельно от failed scenario;
CLI1/wrapper3/cleanupfalse/incomplete остаются исходным результатом.
Можно начать TDD исправление input0 clipping; общая приёмка остаётся открытой.


На 2026-10-14 04:53 UTC независимый review продолжения Export clipping
подтвердил scope, actual factory seam, сохранность guarded scroll/native GUID/
девяти hit checks и новую matched18+25. Блокеров нет. Уточнение плана принято:
existing negative guards могут сразу проходить, обязательный RED — actual
post-Link clipped input0 на старом factory; новые behavior/guards вводятся TDD.
Product implementation ведётся отдельно, source review/checks/live ещё впереди.

Подготовка сборки read-only: Bun1.3.14 revision0d9b296af, Node24.19 SHA
bc17c508… и Chromium1246 SHA1e0652a3… совпали с pins. Нужны clean detached
checkout нового общего commit, baseline verify до восстановления двух старых
skill-файлов, затем clean candidate build/verify, новые фактические closures
и ordinary native gates. Старые payload/current-run/profile не менялись.
Историческая series-stop SHA
`2dce56a9a7fe0f80179399be3aa9615067dfccc8ab6fb3813a74da25e9a921d7`
независимо сверена:24original attempt hashes/24unique Sessions,18baseline+
6candidate,4candidate selection-audit complete PASS,2incomplete,19unstarted.


На 2026-10-14 04:59 UTC для следующей matched пары уточнён prospective
порядок: independent pair review + все ordinary native gates + immutable pins,
затем candidate9; при чистом gate — baseline18, затем candidate16.
Runtime/runner/audit менять для перестановки не требуется: audit каждого
слота читает pinned task/attempt/mode и не зависит от baseline receipts.
Это execution order; full acceptance по-прежнему требует все43freshslots,
18standard policy PASS, oracle не хуже нового baseline, все исключения/
recovery/manual reviews. Сравнительный PASS до завершения обеих фаз запрещён.

Новый effective acceptance lock до первой модели обязан закрепить этот
executionSchedule. При ранней остановке сохранить каждый started slot и
явно отметить unstarted; старые outcomes0, никаких замещающих повторов.
Один общий профиль, уникальные пути/новые Sessions, sequential processes
сохраняются. Нагрузка/storage остаются факторами локальной серии при любом
порядке. Исторический baseline-before-first9 серии233119 не переписывается;
этот prospective порядок заменяет его только для следующих matched пар.

Независимый Product WIP review выявил привязку fresh retry к прежним canvas/
anchor до scroll. Actual UI_EPOCH_CHANGED RED подтвердил ненужную scroll,
когда порт стал visible; минимальный GREEN связывает fresh context/owner/
viewport/port/anchor в существующем perform identity. Shared perform,
native port ownership/hit guards unchanged; final freeze/negative suite/
approval ещё ожидаются. Trigger ограничен наблюдавшимся выходом порта
за нижнюю границу viewport (804>800), не всеми видами clipping canvas.


На 2026-10-14 05:04 UTC TDD исправление Export lower-viewport input0
завершено: Product изменён только в text-export-node.mjs (+24строки), SHA
`1e5772e763f81b67ac374722389b65ad7bbf97a835388d51b1630086cef44956`.
Новый actual factory test SHA
`e4190d32047d6ad64276c6d6e99288600e4cde08ab1c99d2bd1e31a2114561a0`.
RED original source: Port has no observed interaction point. GREEN проходит
через настоящий serialized observer/guarded scroll/native opener, проверяет
ровно один ui_scroll_applied с exact owner/from0/to82 и verified input wizard.
Отдельный actual UI_EPOCH_CHANGED RED закрыт pre-gesture identity binding
fresh node/context/owner/viewport/port/anchor; shared perform не менялся.
17/17 focused PASS, две syntax checks и diffcheck0; verification SHA
`f86a556646355c40ba3f911907ed3f19d7d0305be2d66f9fe4677844ccddb0e5`.

Independent final source review Approved-source, SHA
`96f0bf54ef3aa22817b38d4cea9f1dfee503338c74e5391b820c72b08fa8ef67`:
отдельные pinned Node17/17PASS/0SKIP, hashes до/после совпали, actual journal/
четыре line hashes и10author evidence проверены; observer/channel/opener/
context/shared fixture byteequalHEAD. Initial lock не допускает scroll;
если lock появился уже после scroll-prepared, безопасная own scroll может
завершиться, но fresh readiness запрещает даже начало открытия порта.
Общий Node suite и связанные модули, ordinary new-payload proof и модели
этим verdict не заменяются. Root related checks active; остальные stages открыты.


На 2026-10-14 05:08 UTC appropriate checks исходного commit
`a8db3e0f4cdde78399f6f81114e936fa16980920` завершены Root:
related focused378/378PASS/0SKIP и pinned Node24.19 fullupstream3847tests/
3837PASS/0FAIL/10SKIP/0cancelled/0todo, exit0. Cwd client; module/test hashes
до/после совпали. Full TAP command/log/result сохранены; related spec reporter
counts взяты из исходного полного log отдельной supplemental summary,
original result не переписывался. Общая root-checks-verification SHA
`a24d9902389d8e1d2adb370f4af89d2580f758eb10438b3422d532757c552f2a`.
Source review и checks закрыты отдельно от ordinary native/model acceptance.

Новая matched пара `20261014T050544Z-2085d7` собирается из того же commit
в собственном clean detached checkout; baseline74/candidateff18 skill,
модель/variant/tasks/seed/18+25 unchanged. Effective lock должен закрепить
новый prospective schedule candidate9→clean gate→baseline18→candidate16.
Пока нет активного Root model/native/admin процесса и current-run не переключён.
Private clipped Export proof проходит отдельный static review: нужны точный
saved XML noJS gate и canonical own scroll completed/trace; эти fixes не
меняют Product/runtime. Новые immutable bindings и live ещё не допущены.


На 2026-10-14 05:15 UTC новая matched пара050544 frozen без model/native calls.
Source `a8db3e0f4cdde78399f6f81114e936fa16980920`, own clean detached checkout;
baseline build/verify0 до restore двух старых skill-файлов, candidate build/
verify0 после restore. Runtime обеих фаз
`7982512e1949b23bc019305d22bf8fbfd54c4c3dc0258258497134e904e640f3`,
288files; относительно233119 изменён только text-export-node.mjs.
Full buildsource14701files, paired inventory5726: CLI/deps/browser equal,
различаются только2skill-файла и3metadata с original-specifier normalization.

Immutable0400 pins: baseline
`fb31e4f286a3fec4afa4a0896e34e40b98233fa789a321f6f2bead5740278adf`,
candidate
`dd65ee0a1e4a1e187925ebd16c94ec87d633b4abe239f5afb5e107869185ff67`;
effective lock
`afc1c7d94b5df4760d4efce3e5bf92b8d0640dfd89ec2102bdba2c470a485378`,
provenance
`f478535935cbf5c5c2174244d0eba393758465382b4f0abc8c1366d54585d8cb`.
Все10 operational inputs0400, historical72+2/audit2654 unchanged,
15defs/43unique18+25 без reservation. Lock закрепляет native/pair/pins→
candidate9→clean gate→baseline18→candidate16, comparative PASS только
после обеих фаз. Старые outcomes0; current-run остаётся historical233119.

Independent pair/pins review начат отдельно от автора сборок. Private reader
fixes и ordinary bound native gates ещё впереди; stage сборки+live не закрыт.
Полная модельная приёмка ещё не начата на этой паре; цель остаётся активной.


На 2026-10-14 05:24 UTC independent static pair/matrix/pins review PASS:
pair `2c103f2b9113e84d4e642dd5f9548b80a1537c1c77059d4a6af3818e1b5b5d65`,
matrix `b364ed2c364d83d091ec595f212e616ad8ba6a8e3970055c9ad3c798077b1773`,
pins `28b0d108f0ae2443871e310ec5de03a38630c0202d730adb631bed1acc6dcd0d`.
Обе5726-entry manifest,288runtime и14701source фактически сверены;
отличаются только2skill+3metadata. Payload/task/model/variant/seed unchanged.

Обнаруженные семь prompt hash mismatch относились к FOUR-arg diagnostic
buildAgentPrompt в metadata; actual runner использует THREE-arg. Сохранены
initial frozen matrix/lock/provenance и mismatch evidence, отдельно создана
corrected matrix SHA
`f6f1171a516b7895dc4ac308af875080ce92a9f09a3eccb3f8d0af03003c1774`;
независимо подтверждены43/43 actual prompt hashes (36 прежних unchanged).
Эффективный lock теперь только acceptance-lock-corrected.json:
`5be90328908ea793e4b75bb61adcaf54975e24ba85bab1729f611c32013a1875`.
Corrected provenance `cfb90d433652186f14a7b65f3dc0f3e6d027bd19d2ba337a980a3d978fb1ae24`;
metadata amendment `e854b2091cb15a9ceddf7ea6b3d603ae4d632e910e0dd5fccd1c3d4564640642`.
Оригинальные pins/payload/исходники/задачи/runner не менялись; это metadata
correction до первой модели, не новый runtime/pair и не перенос исходов.

Все ordinary proof для нового runtime prepared ready:false. Clipped Export
reader findings закрыты private TDD (9tests/38expect/typecheck0); independent
bound approval ожидается. JS/Join/schema подготовлены другим автором,
25tests/3typecheck0; их independently принимает другой reviewer, чтобы автор
не принимал собственный proof. Model/native live0, current-run historical233119;
полная приёмка и stage сборки+live остаются открытыми.


На 2026-10-14 05:29 UTC все bound ordinary proof получили independent static
approval: clipped Export `1b7c80af6d886273ed1da31b84689e5e049d86dd1ab0a333c2d75d58dd80a61b`;
JS `6145511ebcf611b03fb691229b8377895d4df32b6c1ecd752d70a65010b6860f`;
Join `1bb87b801a6b07a10fefe3f2ec5c5f185e4bb189ef37b150dd50c28b51be9eb6`;
schema `339d5242f782543d488ba9959f096d76da187ffff0d148a66d9b27ec05a2e92e`.
Approvals подтверждают static bindings/checks, не свежие native результаты.

Root запустил clipped Export первым, Root25228 active. Exact container0c72…
running, writer absent, run dir absent проверены перед допуском. Reviewed binding
`5b498da175e98e9e23b31e2e1cb02138b138f0d43f559f7f27001d512e28e692`
сохранена0400/byteequal; активированы только ready/status, active SHA
`973307358d75a95a7aef1e0e3cdbfc7872192c9b1d0b57f9da0aa98f404ab2a8`,
exclusive admission
`70ecc163420614cf53f8bc6b56302d4edbb32e0a2218eec50666dd2069874018`.
Первый preserve отказался O_EXCL, потому что reviewed copy уже существовала;
до повторного допуска подтверждены её exact bytes/mode, никакой overwrite
или дополнительный native запуск не происходил.

Own ordinary prepare и input delivery прошли; Import1 SUCCEEDED/cleanuptrue,
Calculator выполняется. Actual7standard prefix, Export3position900,640 и
no early Save сохраняются. Clipping/scroll/CSV/graph/финальный cleanup ещё
не подтверждены. Другие native/CLI/admin/модели не запускаются одновременно;
model slots0, current-run ещё historical233119. Цель и stages live/18+25 открыты.


На 2026-10-14 05:43 UTC original ordinary8node clipped proof Root25228
завершён exit3 до Export: GroupLast group-last-1 AMBIGUOUS/open/
WIZARD_OPEN_NOT_CONFIRMED/cleanupfalse; Import/Calc/GroupFirst SUCCEEDED.
Result SHA `6c7f7f93dca97432393f9ff9c7ab18f4a776836d0433c658a24c0430371c8d7f`.
NoSave/CSV/clipping, model0; runtime1029384 ACKfalse/exit1.
Raw1367: один own begin_wizard click ACK133ms, native waits140/192/259ms,
guard отказ564ms; before1365 exact own Group/unlocked/point observed/masks0.
Error output уже grouping с ownGUID/masks0, но catch перечитывает UI:
predicate-time cause неизвестна, secondmask не утверждается.
Read-only diagnosis SHA `a32a6d6d2af19c34ad07dd732e74c5f6e2a17307578ba2e6172a19965ed2634b`;
Product/общий runtime по этому неизвестному отказу не меняются.

Strict3successfulGUID/6serverevents связали только user:160 latestinit05:27:39.471Z,
binding `7a7c62478cf06abfab25e79e1f7621eadbfb5829ae853132f1b6ae3aba3c8895`.
Root soleadmin закрыл160 в05:37:51.045Z после exactfreshrow/confirmation;
двеrefresh подтвердили отсутствие160, admin161logout05:38:13.017Z.
Bridge59539/browser closed/exit0, guard отсутствовал; профиль/история не менялись.
Independent final recovery SHA
`6db3bae9b1fcde4ee77566b2378c4f9171de98d8dc8e96db5bc985c12ebbc4ee`:
raw35/source4452/fixtures9/protected15/effective10inputs0400/runtime288×2
unchanged, own processes absent, new160init отсутствует. Original failed
остался failed; recovery не подтверждает исправление Экспорта.

Следующий diagnostic scope — новый private ordinary Import→Sort→Export,
tiny27B/independent27B oracle, same Export position900,640,3nodes2links/noJS/
noGroup/noearlySave. Сохраняются verifyRevealEvidence, ordinary entry и
строгий cleanup; actual clipping обязателен, иначе NOT_REPRODUCED.
Это изоляция Exportfix от неизвестного Group отказа, не упрощение модельных
сценариев/18+25 acceptance. Новый private binder/graph проходит TDD и review;
старый8node proof immutable, runtime/pair/pins unchanged.

После recovery Root49772 запустил approved ordinary JS downstream отдельно.
Reviewed binding6e668b33… preserved; ready/status active SHA
`6c4c132dc9b2a1ef988629c476608225b4cebb2dc19cc145a5813c584ceb4296`,
admission
`aa1786cadade63c231efabe819476c9b8af0c70e87f8c49875df50618eb4246a`.
Другой Host/CLI/admin не активен. Новые native результаты ещё ожидаются;
model slots0, current-run historical233119, цель и live/model stages открыты.


Checkpoint 2026-10-14 06:03 UTC — pair050544, model slots0.
Ordinary JS downstream Root49772 завершён exit0: Group A17/B21,
direct Sort B21/A11/A6, native CSV27B и saved5nodes4links/source/schema/socket
проверены. Own package closed без discard, Logout/HostACKtrue/exit0.
Result SHA `c33451733c68f2cd52e2c8bd2d3f7a94e6d8f18f7c1dc7b4574dc6b0dd230d93`;
independent live review `4a25b1108464fe429d2ee77b96ce6360d556e2e9d06fd8f950f21efd7260766b`.
Это PASS отдельного native gate, не model acceptance/18+25.

Minimal ordinary Import→Sort→Export Root40322 завершён exit3:
Import/Sort SUCCEEDED, Export input_mapping AMBIGUOUS/cleanupfalse,
noSave/CSV/Logout/ACK. Result `4e90c98213335b3582dacbf3f199820fd3701ddbd2f040ec2c7231d399ee3877`
сохранён failed. Raw740 input bottom804/viewport800;741–742 один own scroll
0→82;744/746 same owner/ref/identity, input bottom722 внутри viewport.
Masks/dialogs0, но covering `<u>` без установленных owner/class/ancestors;
все9 native hits отказали до меню/клика. Вертикальное clipping устранено,
full mapping/CSV gate NOTPASS. Report clippingReproduced=false осталось
initial default: evidence reader не вызван после отказа, это не отсутствие
clipping в raw. Read-only diagnosis
`1c791af08cd3e754d3c1b423e4632e967bfa83db804d65a6802b811797a70eaa`.
Неизвестный U не основание для ослабления native guard или Product patch.

Strict native/server GUID binding связал только user:163 latest init05:50:57.982Z,
SHA `a9048d46a9473bb04d0b37ffb2437424d69bc69770cd91599e1a03643a7c7943`.
Root SDK7158 закрыл exactfresh163 после exact confirmation; отсутствие
подтверждено двумя refresh06:02:29.022/29.789Z. Own admin164 Logout06:02:50.254Z,
login visible; browser closed/bridgeexit0. Guard отсутствовал, originals/profile
не менялись. Независимый final recovery/read-back ещё ожидается.

Следующий private diagnostic собирает ограниченные DOM/parent/cache data-values
того же9hit evaluate только own Export input0; getters/новые browsercalls/clicks/
изменение predicate запрещены. TDD и independent static review до live,
no acceptance credit. Join/schema static approved, fresh live ещё не выполнены.
Runtime/payload/effective corrected pins unchanged; current-run historical233119.
Stages fresh native/build acceptance и18+25 остаются открыты.


На 2026-10-14 06:08 UTC independent recovery163 PASS:
`f9f5b2ee23889b8ef38628dc24445a285726f75e789554f0c12294e72ad9d386`.
Server closure16306:02:28.203Z/admin164Logout06:02:50.246Z/noReinit;
raw22/source4453/fixtures15/protected68/effective10/runtime288×2 unchanged,
own processes absent/.writer absent. Original failed4e90… не upgraded.

Root79801 запустил approved ordinary Join. Reviewed binding6a0062fd…f3302
preserved0400; only ready/status activation
`5246b5963751898d04971e500ed2aa43411fe07e2a3d46d3adbb52e06ff1574c`,
admission `18c5ae1a96fc9481cb6236bbc609b2a7b774a5f0ad696313cee481ad99c80538`.
Fresh4452source/5fixtures/85protected и own idle проверены. Первоначальный
read-only process filter оказался шире own scope и отказал до mutations;
повторная проверка scoped к этой серии, чужие процессы не затрагивались.
Join outcome pending; no other Host/CLI/admin/model. Model slots0/stages open.


Checkpoint 2026-10-14 06:14 UTC — fresh Join PASS/independent PASS.
Root79801 exit0/result `5892db63337e7091aa7526f01b9ea47360d05c1a6e4b5df0508a64e07cf8ceac`;
independent live `f3f3bd07bbc10d1a08526d4b4a54ef4f078bfe6840e607841b086d4b83544caa`.
Actual role0/role1 native GUID/ACK→wizard observations, exact integer rows
[1,5,15]/[1,10,15], both import projections и saved3nodes2rolelinks/noJS.
Own package `/user/JDbbe947d8.lgp` closed без discard, Logout/HostACKtrue/exit0,
PID1094100 absent. No standalone input reread/fresh hiddenDOM/model claim.
1315ownjournal rows; raw36/source4452/fixtures5/protected85/effective10/runtime288×2
unchanged. Это отдельный native gate, общая acceptance всё ещё открыта.

Root9855 schema probe exit0/result
`aa497d0c89338cc50437ff990a4066ff3a4338748d68f7463287dfe24620798a`:
15standard schemas получены, ACKtrue/exit0/noSignal. Explicit Logout false,
prepare/node/package/UI calls отсутствуют; actual16prepare проверен отдельным
JS downstream. Independent schema live review pending. External admission
`3673bd6ec208f5d2715bbb18939a4a35dab51b9ad39a81fa4d983fb0753f87b8`;
readyFalse metadata-only не менялась. Gap scope ограничен known15/API/case,
не универсальной математической невозможностью любого стандартного графа.

Private U capture `native-export-port-cover-diagnostic` prepared/frozen:
binding `979ee5bb4463687e11ee252d173b2e09526c2b8c0564d1b2034c73e0a2755d46`
readyfalse0400, verification
`110656399c41f97d5f971858bff8881e43841e5df62d35dcb6faf5f1bfbd9ed0`.
Author7Node+11Bun65assert/typecheck/syntax0;4456source20fixtures70protected.
Exact frame only, same9hit predicate/point/click/browsercall count; inverse
byteequal test, bounded marker extracted before unchanged error slice500.
Getter/oversize data fail to unknown/truncated, guard remains refusal.
Independent static review pending; no live/Product/payload/profile change.
Models0, clipped Export/full native stage/18+25 remain open.


На 2026-10-14 06:17 UTC private U static review Approved:
`9e8283114fecbee2de0d0ed84077694544bc37200923e53a8334737c4907b83e`.
Independent7Node PASS/actualstorage-receipt wrappers preserved; four insertion
inverse equals canonical frame, same9hits/no gestures/no additional browsercalls,
4456source/20fixtures/70protected/5effective unchanged. Bounds12000 JSON characters,
128char strings; no full raw stack byteidentity claim. U remains unknown.

Root81562 soleHost private diagnostic active. Reviewed979ee5… binding preserved0400,
only ready/status active SHA
`07724764ce8456390c71f7f917d36197ccd4c7075de0e85ffba5b13c6f5c7407`,
admission `3e5f277585e40e67ec271fce7df5baed8c433a0cddcf950100f0fe0cee18dcbb`.
Fresh source/fixtures/protected verified, .writer absent/run absent, own prior
schema PID1103452 absent/ACKexit0. Explicit schema Logout остаётся false.
No simultaneous Host/admin/CLI/model. Instrumented diagnostic excluded from
native/model acceptance; Product/payload/pins unchanged. Fresh result pending,
model slots0, Export/fullnative/18+25 open.


Checkpoint 2026-10-14 06:28 UTC — known tooltip cover, no acceptance upgrade.
Schema independent live PASS
`e74936500f1f2d006b5800441ffc523c873e286d975ff3da09c8dadb105cf5dc`:
15public schemas/16freshJSprepare cards/31cachekeys independently reconstructed;
source5/fixtures4/protected22/effective10/runtime288×2/raw22 unchanged.
Distinct probe/prepare sessions, same build/runtime/skill; Logoutfalse preserved.
Known bounds: Calculator/Collapse128 per node, Union14additional/15total,
fields1000. General variable-unpack gap limited to known15 contracts;
finite151 composition/universal impossibility not excluded or claimed.

Private U diagnostic Root81562 exit3/result
`2aac86b9bd1bd93fba14ebcb336290e668f1b2160160f59836d48b5bdde32814`.
Raw760: nine inViewport points hit one U; fourth ancestor tooltip-2760/ttip/
x-tip; port connected/sameModel/samePortDom/nativeGUID/input1 confirmed.
Scroll0→82/780→698 succeeded, nativeopen NOT_APPLIED/effectfalse beforemenu;
wholeExport AMBIGUOUS/cleanupfalse, noSave/CSV. Reportclippingfalse remains
default before verifier. Tooltip owner/trigger/lifetime unknown, cachefoundfalse
is not absent native ownership. Source scroll only sets guarded scrollTop;
it does not move mouse, so hover on scroll-anchor is not established.
Diagnosis `83fc9f9ad2014fd7b143b61ae76e6b4fec936de032c1a975b4a2145767b32c89`;
independent live-stop
`619dbead9daf11ae6683d511ffc25131db7a136a59a63d1385b5996cd95bb99e`.
Raw/source/pins intact; instrumented result excluded from acceptance.

Strict own167 binding `a0b179b8d63f4ca50d161b1525db3d6ececf74fbbb88885b3fbb8e7bb5dde030`
confirmed latestinit06:17:02.249Z plus Import/Sort GUID4serverrows.
Root soleadmin closed167; twoUIabsence checks06:22:26.359/27.123Z,
neighbor166 untouched, admin168logout06:22:50.363Z/bridge81629exit0.
Independent final recovery
`988ae4d4d793487d642ed75c0719f480761711de6e7a629387bd6b25bcdc354b`:
serverclose16706:22:25.537Z/admin168logout06:22:50.356Z/noReinit,
raw23/source4456/fixtures20/protected70/effective10/runtime288×2 unchanged,
ownPID1111256 absent/.writerabsent. Original failed remains failed.

Prospective surgical design: only after successful own reveal and fresh
same-owner read, if input0 still has no point, perform ONE existing guarded
click of exact own Export LABEL, then fresh read/rebind and unchanged native
openInputPort0/9hits. Actual label point1208,645/bbox1167,637,82,16 is visible
outside tooltip y686..800, non_script/click allowed. BODY-first selection helper
is unsuitable here: its computed center1208,710 is covered. No tooltip mutation,
owner assertion, new hover API or guard waiver. Existing target/signature/
pre-gesture epoch checks remain required; after valid selection fresh native
GUID/doc/workflow/graph identity replaces obsolete DOM refs/epoch. If label
or port remains covered, owner changes, wizard/mask/lock appears, or no exact
label exists, refusal remains. Visible port/no own reveal means no label click.
This is own selection with no link/mapping edit; actual disappearance and final
Save/CSV/graph/cleanup still need proof. Independent design review pending;
Product/payload unchanged, Root idle/model0. Any Product change requires a new
matched pair and all native gates/full18+25; current050544 no model slots run.

Следующие отдельные пункты завершать и коммитить по одному:
- [x] После independent design review реализовать scoped own Export LABEL click
  через TDD в text-export-node.mjs. Actual tooltip/label geometry, один click
  после own reveal, fresh native rebind, persistent cover/foreign/stale/locked/
  masked/no-label negatives; visible/no-reveal без click. 9hit guard не менять.
- [x] Завершить independent source review и pinned Node focused/full checks
  новой правки, включая прежние reveal/port/workspace guards. После source commit
  применять уже открытые задачи нового matched build/native gates и полных18+25;
  никакой результат050544 не переносится на изменённый runtime.


На 2026-10-14 06:31 UTC independent design review Approved:
`73fc70b052396effa7ba096db837e55c0bec73591160b168af0e17a68c87d3c7`.
Label branch обоснован actual758 и existing checkedHandle/epoch guard.
До click удерживать exact label/port/owner fingerprint; после него fresh native
GUID rebind, без старого DOM ref/epoch. Один click — максимум один физический
жест; существующие no-effect pre-gesture refresh допускаются. Эффективность
очистки tooltip ещё не доказана. Shared BODY-first helper не используется;
unknown tooltip owner/trigger не переопределяется.

050544 остановлен ДО model admission: `series-stop.json`
SHA `362d5569ab85f295bb0f22effbd74271765194b389b83211951036d4acd01138`.
Models0, no candidate/baseline attempts; остановка обусловлена required common
runtime fix, не заявленным policy violation. Source1e577… был неизменён при stop,
все own Host/admin закрыты/.writerabsent, raw/payload/pins preserved. Старые
JS/Join/schema native PASS не переносятся на новый runtime. Новый source commit
требует новой matched пары, всех ordinary native gates и полного18+25.

Worker реализует approved LABEL branch через TDD, только text-export-node.mjs
и focused test; raw/oldfixtures/pins/docs не меняет. Root owns canonical docs,
checks/commits; independent source review до commit/live. Stage TDD label
и его review/checks пока открыты, model acceptance не начиналась.


Уточнение LABEL guard scope 2026-10-14 06:38 UTC: наблюдавшийся lock в fresh
read до label запрещает click. Если native FLocked изменится уже ПОСЛЕ
node_step_prepared admission, прежний shared checkedHandle может допустить
одну безопасную own-label selection; следующая fresh проверка обязана отказать
ДО input/menu/mapping. Это та же temporal граница, что у разрешённого own scroll;
selection не меняет данные/links. Zero selection после такой race не заявляется.
Shared guard/API не изменяются ради расширения scope. Author tests фиксируют
этот реальный инвариант и negatives; final source freeze/review пока pending.

Skill_policy source review дважды не начался из-за selected-model capacity;
Product independent review передан verify_audit_corrections (не автор правки).
Это не model eval slots и не quota outcome попытки. Никакого live/LLM eval нет.
Next-pair подготовка `08c944c76e85cff7e22bec70e1e675f29c0d800552b27a9d50ad9497d4dae563`:
existing build/verify pipeline, baseline verify до restore2skills; новая initial
matrix сразу actual3arg, прежний schedule9→clean→18→16. Build checkout не менялся,
сборки/новые payload не стартовали; требуется новый чистый source commit.


LABEL TDD source завершён 2026-10-14 06:45 UTC: только16lines в
text-export-node.mjs и actual factory/native-protocol tests. Product SHA
`d6543f396964351173bdf38532cad5f9db33e449162d61a310beb56228d8dbfd`;
test SHA `0e60290d16510a388c90fa8206e54af93048eb08b2598a06a46c23843315f076`.
Author vertical RED exactno-point→GREEN one ownlabel→nativeinputwizard,
34focusedPASS/0skip/syntax0/diffcheck0, verification
`2b3187e16a7a3766bcbe2e6e3169d600acf3d8c5c09fa8082a871bec4f2ef320`.
Covered/missing/duplicate/foreign/script/disabled label, persistent port cover,
owner drift, target fingerprint, fresh DOMref replacement and both lock
boundaries tested. Visible/no own reveal does not add label click.

Independent source review Approved
`4352deffe2020a845499cbe6286d2cccd457302b829f9763f9a1449121524465`:
34independentPASS,5sharedguards/38originals/actualjournalrefs unchanged,
no shared observer/channel/port/API/catalog/JSgrant changes. Root expanded
focused395/395PASS/0skip, started06:41:53.598Z→06:44:35.874Z, receipt
`3992aa1004a3aa01cb9917a13000cbac89e203683f5731a184dd961b409e298f`,
command6a684653…/log6a93185f…, source hashes unchanged. Wrapper syntax error
before first execution created no artifacts/tests; corrected command ran once.
Full runtime suite pending; review/checks checkbox remains open. New build
and actual ordinary tooltip disappearance/mapping/CSV/Save/cleanup remain
required, all43models fresh on final pair. No live/acceptance upgrade yet.


LABEL source commit `c5930ed6899fa3963d60022636927c7a4840c062` и required
review/checks завершены 2026-10-14 06:52 UTC. Independent source Approved4352de…,
root focused395/395PASS/0skip; root full3864tests/3854PASS/10SKIP/0FAIL/
0cancel/0todo, tool21437 terminalexit0. Full06:47:09.658Z→06:50:13.048Z,
command `1641aa86385433db90079a042ec90f1fd3ea854ccd5d7a0247a98573a7b851cb`,
log `f357b337e15d3db2e99c1610d8aad1f630b7e1f0a3d97fd5f46faf08ca69ed06`,
result `953bf855ebe1bfb2a6a33b25c0698837cb6f236e701681af425a9f80f48e7677`.
Source d6543f…/test0e6029… unchanged before/after, pinnedNode24.19/bc17….
Overall check/readback `9d7884fb6a678ccb958cfcf542e3c2c068c7ad488714d13db97bf7e28d94e87b`.
10SKIP остаются ограничением offline suite; actual ordinary/live ещё обязательны.

Новая matched серия `20261014T064745Z-367f4b` подготовлена параллельно полным
checks в собственном clean detached checkout c593…; profile/server не трогались.
Baseline build/verify0, verify06:50:40.517Z ДО restore06:50:40.577Z;
candidate build/verify0, verify06:50:52.745Z, checkoutclean. Initial build
preparation missing parent вызвал ENOENT до компиляции/payload создания;
command/log сохранены отдельно, создан только собственный payloadRoot,
повтор того же source snapshot прошёл. Native/model slots0, initial metadata
сразу actual3args; full inventory/pins/static review pending. Ни один outcome
050544 не переносится. Новый ordinary clipped Export с label action и остальные
native gates, затем candidate9→clean→baseline18→candidate16/full43 открыты.
## Текущий протокол проверки — 31 запуск (2026-10-14)

Это изменение принято до первой модельной попытки серии `20261014T064745Z-367f4b`.
Фактическое состояние: source `c5930ed689`, review/checks `17d4c19e30`; focused395/395,
full3854PASS/10SKIP/0FAIL; оба build/source verify0. Независимо проверены14701source,
61symlink и5726files каждого payload; общий runtime `21fcca85…`, различия только
2skill+3metadata. Новые model Session/слоты0, native run/results0 на момент решения.
Исторические43-slot locks и начатые прежние серии сохраняются без пересчёта.

Выбран **baseline6 + candidate25 =31**: одна baseline-попытка для каждой из шести
standard задач; candidate сохраняет18standard (6×3),3explicit-JS,3tags и1recovery.
Сначала ordinary Import→Sort→Export на итоговой сборке с actual clipping, одним
own scroll, допустимым guarded label click, native input0/mapping, точным CSV,
Save/graph/own Logout/ACKexit0. Unit PASS этого gate не заменяет. Новый JS downstream
с Export тоже проверяется. Join и15schema подтверждены в050544; повтор их live
не нужен при byte-identical relevant dependencies. Это carried regression confidence,
а не новый064745 native/model PASS; fresh minimal prepare сверяет текущие16cards.

Порядок первой девятки: ABC/Pareto → первое/последнее касание → sales → monthly →
claims → ROI → explicit-JS → tags → recovery. Затем полный clean gate всех9,
baseline6, остальные candidate16. Нечистая волна не открывает повторы; policy
violation останавливает digest. Начатые timeout/error/quota/incomplete остаются
в знаменателе, не заменяются удачными retries. Одинаковы итоговые runtime, модель
`openai/gpt-6-sol-fast`/medium, requestedpriority (actualtier неизвестен), параметры,
входы/oracle; между версиями меняется только skill. Новые optimized inputs
создаются отдельно0400; исходные frozen files не переписываются.

Приёмка candidate не сокращается:18/18standard policy, ≥1fullcalc по каждой задаче,
3/3explicit-JS,3/3tags, наблюдённый1/1recovery, первый9clean, прежние lineage/oracle/
history/settlement иmanual reviews (все6JS, recovery, провалы/аномалии,3seeded successes).
Сравнительный oracle gate нормализуется: C_standard/18 ≥ B_standard/6 (C≥3B).
Показываются отдельно B:0..1 и C:0..3 по каждой задаче. Это описательное сравнение
при одинаковых условиях; baseline1 не оценивает повторяемость старого skill и
не равноценен43-запускам. Candidate имеет прежнее функциональное покрытие и3повтора,
а надёжность baseline-сравнения слабее. Старые данные на другом runtime только история.

Успешные standard candidate продолжаются thin sequential driver поверх существующего
single runner: oracle/graph/policy/history/settlement/CLIexit0 + exact own bound
package close/Logout/noDiscard, Host/resource close ACK/exit и свободный профиль.
Отсутствие .writer само по себе недостаточно. Для baseline JS — наблюдение старой
версии, не ложный policy PASS; его расчёт/история/завершение проверяются машиной.
Неопределённый cleanup, живой процесс, unknown receipt, failure или blocker запрещают
следующий запуск. JS/recovery требуют review; closed artifact review и финальный
отчёт выполняются параллельно следующему разрешённому CLI. Loginom/CLI-процессы
этого профиля остаются последовательными. Все допуски перед следующим процессом
синхронны; глубокий review закрытых immutable artifacts не блокирует обычный успех.

Экономия:12модельных процессов (28% от43), примерно1ч25мин при указанной средней
7мин5с на процесс; фактическая длительность зависит от новых запусков. Максимум
окон исполнения уменьшается21,5→15,5ч при прежнем deadline30мин; это не обещание
wall-clock срока. Повторных full/focused проверок неизменного runtime нет.


Checkpoint 2026-10-14 07:44 UTC — итоговый Export live gate подтверждён.
Новая серия `20261014T064745Z-367f4b`, runtime `21fcca85…`, Product source
`c5930ed689`: ordinary Import→Sort→Export без LLM действительно воспроизвёл
clipping (bottom804 при viewport800). Один own scroll0→82 и один guarded own
label click открыли native input0; mapping подтверждён. CSV27bytes точно равен
oracle; сохранённый пакет содержит3native nodes/2directed links/noJS. Root
Tool29560 terminalexit0; exact own package closed, logouttrue/noDiscard,
HostACKtrue/exit0/noSignal/noError, PID отсутствует и .writer отсутствует.
Результат `native-export-input-reveal-minimal-proof/run/result.json`
SHA `9d69a60568a661204720fb2ba91605dda89499f54b3543926ea9627707e715cf`;
независимое чтение948journal rows/CSV/LGP/receipts/закрытия —
`native-export-input-reveal-minimal-proof/independent-live-review.json`
SHA `1f437200b0fee528863a700dea49118adb45fa725c972ebdbe16454a8c0f6e62`.
Две ошибки подготовки offline parser-входа исправлены без повторного native
прогона; исходные run evidence не изменялись. Девять отдельных hit points не
эмитируются: unchanged ordinary guard/open прошёл; tooltip owner не заявляется.

Независимая проверка optimized31 завершена до моделей0:
`optimization-independent-review.json`
SHA `43d2662aa7b7c4f070895ee449869f807a6fc49b43f714898f5a5e88c10a40e0`.
Actual3args/31unique identities/9→6→16, все сохранённые prompts/paths совпадают;
семь новых optimized files0400, исходные43metadata сохранены. Candidate меняет
только firstWave order, baseline только attempts=[1]; resource/model/input/oracle
прежние. Нового model admission ещё нет. Fresh ordinary JS downstream запущен
один раз после Root source review4455source/36fixtures/20protected files;
его результат и independent auto-next review ещё ожидаются. Join/schema outcomes
050544 остаются историческими и дают confidence только для byte-identical
зависимостей; не засчитываются как fresh outcome064745.


Checkpoint 2026-10-14 07:51 UTC — последовательный auto-next готов.
Добавлены только `evals/script/run-node-selection-series.ts` и
`evals/test/node-selection-series.test.ts`; Runtime и single-attempt runner не
менялись. Driver исполняет фиксированные9→6→16, пишет dispatch до однократного
вызова runner, не повторяет начатый слот при re-entry. Следующий standard допускают
authoritative audit и exact own saved-package cleanup/resource/terminal/Host
close, временная привязка, отсутствие собственных PID и .writer. Неизвестный
receipt, ошибка или нарушение блокируют продолжение; JS/recovery/anomalies
останавливаются для review закрытых артефактов. Baseline JS учитывается как
policy failure старого skill, а не как PASS. Отдельный final review остаётся.
Независимый review выявил проверку auditor source только при старте; исправление
RED→GREEN добавило small evaluator closure в проверку перед каждым следующим
слотом. Новый payload/build и повтор full runtime checks не нужны.
Author119/119PASS/285expect, typecheck0; peer повторил только найденный regression
(1PASS). Final script SHA `5002026ee66b27083e6851fb419bc2ea5c4b9d047de289a07b92199e162ac9e4`,
test SHA `7b52c22f3ba5572ee3166ed03143d8f5b846c1e0d7e832aa5db9daa3b835c5f4`.
Author `series-driver-development/verification-review-fix.json` SHA
`3577ff3f7756d90ad9c37a1b3ccd15936974534aa2e3e447d8d02d258b12412d`;
peer `series-auto-next-proof/independent-review.json` SHA
`ed066c06ab2f4e687f890cb876918d84c64286e4d4079e26444c8d2b7e8b2738`.
Host receipt не содержит chatID: attribution требует эксклюзивного профиля,
единственной новой квитанции и её времени внутри собственной попытки.
Модельная серия пока не начиналась; activation — только через новый immutable
ready:true lock, не изменяющий исходные ready:false optimized/43-slot файлы.

- [x] Реализовать и независимо проверить thin sequential auto-next поверх
  существующего runner: 9→6→16, exact own closure, policy-stop, review pauses,
  source seals перед dispatch и запрет повторного запуска начатого слота.


Checkpoint 2026-10-14 07:54 UTC — matched runtime gates завершены,31-slot admission frozen.
Fresh ordinary JS→Group/Sort→Export прошёл на `21fcca85…`: Group A17/B21,
Sort B21/A11/A6, exactCSV27bytes, сохранены5nodes/4links. Исходный JS component,
code/declaredschema/socket равны до/после; native managed previews для двух
ветвей подтверждены. Публичные generic UI/raw browser tools отсутствуют;
pure validator на actual own captured port отказал, live UI receipt не заявляется.
Root43066terminalexit0; exact own package закрыт, logouttrue/noDiscard,
HostACKexit0/nosignal/noerror/PIDgone/.writerabsent. Result SHA
`61c80c0bafbc18e89db5ce04d73acf5bfa418b116333c6e00ae2aa2766b207a6`;
Root independent2195journal rows/full LGP parser/CSV/receipts/close review
`native-js-downstream-proof/independent-live-review.json` SHA
`be5e5edf1b856b4ae345fbad3404205f83a3332ab6ed4686a94dfa200ef85090`.
Два fresh prepare имеют текущие16cards/build7.4.2/digest; их knowledge совпадает
с историческим. Durable Join/schema dependency review SHA
`7528b629ab4bea52686204df7fff7e649f7ff4a856b9f5d09f163f0089303c33`:
из4397runtime files изменён только text-export;23конкретные shared/Join/schema
зависимости byte-equal. Исторические15fullschemas/Join outcomes не переносятся;
probe explicitLogoutfalse не повышается доtrue.

Новый `acceptance-lock-effective.json` mode0400/readytrue, SHA
`0770362667497e888718e996ed74a0d5c580ddca3dc4f230823f51749d921d06`,
создан до моделей0. Он связывает исходный optimized lock, immutable pins/matrix,
общий runtime source pin,74evaluator/task source files (включая новый script/test),
11gate/review receipts. Product sourcec593 и evaluator commit6c7cdb0bea разделены;
никакого payload rebuild из-за нового evaluator. Первые9 идут ABC/firstlast
первыми, baseline6 только после clean9, затем candidate16. Все исходные43/optimized
readyfalse artifacts сохранены; новое правило не применяется к старым попыткам.
На момент seal live acceptance model slots ещё0; итоговая приёмка31 и manual
reviews остаются открытыми. Первый planned ABC проверит actual auto-next lifecycle.


Checkpoint 2026-10-14 08:24 UTC — первая planned model попытка закрыта отказом.
Effective31 protocol SHA `07703626…` закреплён до first dispatch; ABC/1
`ses_ec697939effeRuzLucKmyqYLaK` исполнялся07:55:03.983→08:02:41.533UTC.
Модель/variant — frozen `openai/gpt-6-sol-fast`/medium. Five standard native
operations SUCCEEDED. Первый Join request.validate отказал из-за отсутствия
case_sensitive; corrected Join SUCCEEDED. Следующий Calculator abc-class-01
(node87755053…) вернул AMBIGUOUS/open/WIZARD_OPEN_NOT_CONFIRMED до execution.
CLI1/wrapper3, normal cleanupfalse; Save/package/CSV/oracle/audit/closure отсутствуют.
JS apply calls0, saved JS nodes неизвестны; policyincomplete, не PASS. Вызовы
inspect/resume/recover/cancel не подтвердили завершение исходной операции.
Runner автоматически halt, не допустил второго слота и не заменил failed attempt.
Planned31=6+25, started1 technicalfailure1, fullcalc successes0, notstarted30.
Immutable `series-stop.json` SHA
`e4876b16a02cd65f80af91321534290907b8ede3c0691f93739bb92fd30b5dc4`.

Own recovery завершён отдельно от model outcome. Пять точных native GUID в
server app.log связали user:172/latestInit07:55:19.648; fresh dispatcher row и
exact confirmation закрыли только её (server08:15:58.735). Два refresh подтвердили
absence, соседняя user:171 осталась. Own admin:173 logout08:18:20.440 подтверждён
server log и видимой login form; Playwright MCP page закрыта. CLI1293811 и
Host1294389 отсутствуют. Только собственный .writer с nonce586f6bb7… и исходными
inode7629293/7643038 архивирован в `.writer-recovered-node-selection-20261014T064745Z-367f4b-user172`.
История/evidence/pins/payload сохранены; discarded only own unsaved failed draft,
normal cleanupfalse исходного attempt не повышен доtrue. Recovery `final.json`
SHA `7919a2bc178521873b872cebea5309d69f1bf4d8a07f561d535bd99288f59c0f`;
post-recovery CLI status/check0, Helpready/Browserverified/.writerabsent, modelCalls0.

Независимый closed readback SHA `7ce3f6f2…`; forensic diagnosis SHA
`d2970bd91e5602e51f2a00e979cafafa83ac1e6f30b153070823ec13b2c61488`.
Доказан один адресованный begin_wizard click и native waits; catch workspace-ui
4162–4167 заменяет отказавший frame новым readUi. Поздний frame уже соответствует
own wizard, masks/dialogs0, поэтому конкретный false conjunct/foreign mask/задержка
не доказаны; stable/flaky неизвестно. Full/focused PASS и short Export/JS gates
не отменяются и без нового изменения не повторяются. Сопоставимого baseline
для новой серии0; сравнительный вывод ещё невозможен. Ожидаемая экономия85мин
относится к плановым12процессам, не включает непредвиденную диагностику/отказы.
Если подтверждённая правка меняет final runtime, нужна новая prospectively frozen
matched пара и31fresh slots; этот started failure остаётся историческим.

- [ ] До нового model dispatch сохранить actual prethrow Calculator frame:
  existing predicate booleans, bounded masks/dialogs/intended owner/native identity
  и original operation IDs, отдельно от catch reread; без нового gesture/ослабления
  guard. Только по доказанной причине — narrow TDD fix и соответствующие checks/
  ordinary native gate. Failed ABC/1 не повторять и не переписывать его критерии.


## Диагностика actual prethrow Calculator frame (2026-10-14 08:32 UTC)

Новый scope — только сохранение недостающего доказательства. Остановленная
серия064745/ABC1 и все immutable inputs остаются неизменными. Общая цель и
условия31-slot приёмки не сокращаются. Пользователь делегировал самостоятельное
решение блокеров; отдельного model retry/изменения Product сейчас нет.

Выбран private instrumented native запуск без LLM: оригинальный16735bytes CSV,
пять успешных standard requests (Import→Sort→Calculator и Group→Join), те же
метки/параметры/автоматическое размещение. Runtime воспроизведения — pinned
candidate21fcca85…; новые owner/doc/GUID берутся из собственных receipts, source
references переназначаются явно. Затем ровно исходный abc-class-01 Calculator
request; исходные runtime deadlines, clicks и guards сохраняются.

Private managed entry сохраняет неизменный resource verifier, createSession,
createBridge и close lifecycle. На существующем browser transport преобразует
ТОЛЬКО канонический serialized workspace-ui act frame для begin_wizard этого
целевого operation ID. Hash/точные unique anchors обязательны. Перед исходным
throw сохраняет уже прочитанные значения contextMatches/intendedWizard/
deactivationPending/ownedLoading, bounded masks/dialogs, intended owner/path,
prepared/current native identity/TID и epoch. Никакого нового readUi, browser call,
ожидания, жеста, DOM/CSS/native mutation или переопределения результата.
Capture failure остаётся отдельным diagnostic unknown, не меняет исходный отказ.
Поздний catch readUi хранится отдельно; маркер private и acceptanceEligiblefalse
явны в bindings/result. Frozen Product/payload/source файлы не патчатся.

Тест через реальный workspaceUiCapability/serialized browser fixture сначала
показывает, что прежний код теряет refused frame при позднем чтении; затем private
rewrite сохраняет его при том же AMBIGUOUS/code/click count. Отдельные negatives:
foreign/non-target frame не переписывать, anchor/hash drift отказ, success не
создаёт fake refusal, late snapshot не подменяет prethrow, bounded/unknown capture.
Не угадывать Product correction до actual capture.

Private artifacts: новый каталог `evals/results/node-selection-local/20261014T064745Z-367f4b/native-calculator-open-diagnostic`;
entry/rewrite/test/driver/bindings и private fixture projection. Author использует
TDD, source review независимый. Root один запускает `--run` после ready bindings,
idle profile/process checks. Никаких parallel CLI/Loginom attempts текущего профиля.
Отсутствие воспроизведения записывается как такой исход, не как fixed/PASS.
Unsaved state до целевого opening сохраняется; early Save меняет исходную модель
и не вводится. Если native close не подтверждён, Root адресно связывает и закрывает
только собственную server session, сохраняя evidence; чужие сессии не трогает.

Альтернатива Product diagnostic изменила бы final runtime/сборки ещё до причины;
она отложена. По actual frame — узкая доказанная TDD правка при необходимости,
её focused/full checks и ordinary live regression; затем новая matched31 series
с prospectively frozen protocol. Старый started failure в новую серию не входит.
