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
- [ ] Этап 1B: окончательный аудит завершён и проверен на реальных evidence пилота.

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

- [ ] Реализовать минимальный чистый анализ. Использовать `unknown` и guards,
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

- [ ] Добавлять тесты по одному с red/green: JS в другом workflow пакета;
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

- [ ] Реализовать offline entrypoint с `parseArgs` и следующей командой:

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
  Отсутствие обязательного review у исключения не даёт полного PASS.
  Не запускать модель, браузер, судью или cleanup из этого entrypoint.

- [ ] Повторить `bun test test/node-selection.test.ts test/oracle.test.ts`,
  затем `bun typecheck` из `evals/`.
- [ ] Повторить offline-аудит пилота окончательным аудитором и зафиксировать
  его версию. Новая версия аудита перепроверяет все уже собранные попытки;
  model/skill digest попытки при этом не меняется, данные не подменяются.
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

- [ ] Записать в tags SPEC доказательство пробела: `calculator-parameters.mjs`
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

## Task 3: Единый скрипт попытки, закреплённый baseline и пилот

**Files:** `evals/script/run-node-selection-attempt.ts`, приватное evidence под
`evals/results/node-selection-local/` и runbook. Product skill не менять до
сборки/аттестации baseline payload; полного завершения baseline для этого не нужно.

**Interfaces:** отдельные неизменяемые `baseline-pins.json` и `candidate-pins.json`,
baseline payload и 18 каталогов попыток. Одна команда wrapper запускает ровно
одну модельную попытку; цикл/scheduler/автоматические retries не добавляются.

- [ ] Реализовать wrapper с `parseArgs`: обязательные `--pins` (абсолютный путь),
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
- [ ] Последовательность внутри wrapper: проверить pins/payload и headless
  status → создать новые evidence/workspace → скопировать только inputs →
  `loadTasks`/трёхаргументный `buildAgentPrompt` → один CLI с deadline →
  подтверждённый exit/cleanup → read-only snapshot своей Session → свои
  runtime-журналы → точный receipt-based `docker cp` → `unzip` → offline-аудит.
  Запускать дочерние команды массивом argv, без shell-интерполяции имён.
  Не использовать общий `runAttempt/runAgent`: у них контракт выделенного стенда.
- [ ] Переиспользовать функции загрузки задач/prompt/unzip/audit; runner занимается
  только оркестрацией одной попытки. Унаследованный `LOGINOM_AI_AGENT_CLI_BUNDLE`
  убрать из env ребёнка, иначе он может подменить frozen resources.
  Все flags, формат snapshot, правила copy-out и supervisor описаны ниже как
  спецификация реализации wrapper — не как ручные команды каждого прогона.
- [ ] Существующий каталог попытки означает отказ до model dispatch, а не
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

- [ ] Проверить `git status --short`, ветку и HEAD. Сохранить diff/hash файлов
  skill и `git worktree list`. Убедиться, что никто не меняет исходники/ветку
  во время сборки; не полагаться на старые сведения о ветке основного checkout.
- [ ] Перед командами задать базовые переменные в Bash:

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

- [ ] Сохранить `baseline-pins.json`: SHA/tree/dirty, manifests, все skill file hashes,
  модель/variant, task prompt/input/oracle hashes, Loginom version, каталог типов,
  endpoint identity без credentials, ограничения времени. До пилота сгенерировать
  и сохранить `reviewSeed`; перенести его без изменения в candidate-pins.
  Подтвердить наличие
  `programming.javascript` в baseline: иначе ноль JS не проверяет выбор модели.
  Проверить отдельно `cfg.skills.paths`: flags ниже отключают home-discovery,
  но не этот канал. Наличие внешнего eval-skill/ответов в контексте делает серию
  несопоставимой; не менять пользовательскую конфигурацию молча.
  После изменения исходников baseline больше не сверять с текущим checkout через
  `verify-cli-candidate`: это ожидаемо даст SOURCE_MISMATCH. Проверять его
  неизменность по сохранённому attestation, manifest/inventory и skill digest.

**Внутренние шаги wrapper.** Далее приведены готовые фрагменты и точные правила
для реализации одного файла. При выполнении серии оператор вызывает только
`run-node-selection-attempt.ts --pins … --task … --attempt …`; вспомогательные
shell/Python фрагменты не выполняются им вручную для каждой попытки.

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
- [ ] Сначала запустить только `sales-by-category`, baseline attempt 1, через
  wrapper. Сохранить полный evidence даже при incomplete; завершить Task 1B
  на его фактическом формате и повторить только offline-аудит. Пилот остаётся
  первым из 18 baseline даже при расчётном провале. Если model dispatch не
  произошёл, это отдельный preflight incident; если потерян trace после dispatch,
  не заменять модельную попытку удобным повтором.
- [ ] После завершения аудита зафиксировать его версию, runner и task/oracle
  hashes. Выполнить оставшиеся 17 baseline в порядке: остальные пять задач
  с номером 1, затем все шесть с номером 2, затем все с номером 3. Baseline
  не останавливать из-за JS: это измеряемое старое поведение. Busy/uncertainty
  и неизвестный формат evidence приостанавливают серию как раньше.
  Baseline закрывается машинным аудитом без ручного semantic review. Сохранить
  все исходы и причины, не приписывать отсутствие артефакта автоматически runtime.
- [ ] Параллельно оставшимся baseline разрешить Task 4 с отдельным ownership
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
- [ ] Из `packages/loginom-host` выполнить существующие целевые проверки:

```bash
LOGINOM_AI_AGENT_TEST_NODE="$selection_node" bun test test/bundled-skills.test.ts
LOGINOM_AI_AGENT_TEST_NODE="$selection_node" \
LOGINOM_AI_AGENT_TEST_BROWSERS="$selection_browsers" bun test test/stage-resources.test.ts
bun typecheck
```

  Не считать SKIP полным staging PASS. `git diff --check` обязателен.
- [x] Закоммитить два файла: `fix(skills): prefer standard Loginom nodes over javascript`.
- [ ] Тем же build command из Task 3 собрать новый `selection_candidate`, проверить
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

- [ ] В `candidate-pins.json` закрепить порядок и перенести `reviewSeed`,
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
- [ ] До tags-попыток сверить реальный каталог с обоснованием Task 2. Если
  появилось стандартное split-to-rows, не провоцировать JS и не подменять критерий;
  остановить приёмку этой ветви с точным расхождением и пересмотреть fixture.
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

- [ ] Из `evals/` выполнить целевые тесты аудита и `bun typecheck`; повторять
  только если после Task 1 менялся код проверки. После текстовых правок skill
  выполнить целевые проверки bundled skills/staging и `git diff --check`.
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
- Этап 1A выполнен; полный audit до 1B не сертифицирует PASS.
- Fixtures реализованы TDD: `81c4a14e7`, `2de55ec10`, `3de3526f9`.
- Collector реализован TDD: `7ef876bf0`, `a50c93c25`; независимое review проведено.
- Skill изменён только в двух Product файлах: `fdb90ca1e`; staging 13/13 без SKIP.
- Модель закреплена: openai/gpt-6-sol-fast, medium, requested priority; каталог SHA в pins.
- Текущий run: `20261013T093809Z-f5d429`, private evidence под evals/results.
- Используется существующий local профиль analytic-evals; status/check и Docker routing подтверждены.
- Node/npm/Chromium совпали с release pins; Chromium сохранён в постоянном собственном каталоге.
- Baseline собран/проверен до изменения skill, source attestation и pins сохранены.
- Первый pre-dispatch OAuth 401 сохранён как incident; авторизация по коду завершилась exit 0.
- Пилот sales-by-category/1: CLI exit 0, oracle PASS, артефакты сохранены; полный audit 1B ещё идёт.
- Следующий шаг: завершить audit/graph TDD и offline-пилот; затем 17 baseline и candidate build.
