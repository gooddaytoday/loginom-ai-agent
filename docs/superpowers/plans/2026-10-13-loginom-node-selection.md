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
- Работа в ветке `node-javascript`. Проверять HEAD/status перед изменениями: ветка также открыта в основном checkout.
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
  tool parts только текущей Session, сырой stdout и метаданные попытки.
- Produces: `inspectSelection({ mode, nodeTypes, parts })` с полями
  `{ jsNodes, jsCalls, successfulJsCalls, failures }`; CLI-аудит пишет
  `selection-audit.json`, возвращает 0 только при прохождении машинных проверок.
- `mode`: `standard | explicit-js | capability-gap | standard-recovery`.
  Проверку семантики графа/роли JS выполняет независимый reviewer отдельно.

- [ ] Зафиксировать формат `<attempt>/attempt.json` в runbook. Обязательные поля:
  `sessionID`, `cliExitCode`, `mode`, `taskID`, `model`, `variant`, `skillDigest`,
  `expectedSkillDigest`, `historyComplete`, `runtimeSettled`, `packagePath`,
  `resultPath`, `startedAt`, `finishedAt`, `binaryManifestSha256`.
  `historyComplete`/`runtimeSettled` не являются утверждениями модели: они выводятся
  проверяющим из полного snapshot, согласованности журналов и terminal receipts.
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
export type SelectionMode = "standard" | "explicit-js" | "capability-gap" | "standard-recovery"

export function inspectSelection(input: {
  mode: SelectionMode
  nodeTypes: string[]
  parts: unknown[]
}): { jsNodes: number; jsCalls: number; successfulJsCalls: number; failures: string[] } {
  const calls = input.parts.flatMap((part) => readApply(part, input.parts))
  const failures = calls.flatMap((call) => call.failure ? [call.failure] : [])
  const jsNodes = input.nodeTypes.filter((type) => type === "TBGJavaScriptEngine").length
  const jsCalls = calls.filter((call) => call.nodeType === "programming.javascript").length
  const successfulJsCalls = calls.filter((call) =>
    call.nodeType === "programming.javascript" && call.succeeded).length
  const standard = input.mode === "standard" || input.mode === "standard-recovery"
  if (standard && (jsNodes || jsCalls)) failures.push("JAVASCRIPT_NOT_ALLOWED")
  if (!standard && (!jsNodes || !successfulJsCalls)) failures.push("JAVASCRIPT_EXECUTION_REQUIRED")
  return { jsNodes, jsCalls, successfulJsCalls, failures }
}
```

  Реализовать в этом же модуле `readApply(part: unknown, parts: unknown[])` с
  результатом `Array<{ nodeType?: string; succeeded: boolean; failure?: string }>`:
  не-tool и не-node_apply пропускаются;
  для `*_node_apply` необходимы id, state, известный status и `input.target.type`.
  Для pending с пустым input попытаться разобрать полный `state.raw`; неполный
  JSON означает `TOOL_INPUT_INCOMPLETE`. Другие отсутствующие поля означают
  `TOOL_EVIDENCE_INVALID`. `succeeded` требует terminal completed и квитанции
  `status:SUCCEEDED`, `execution.status:completed`, `cleanup_complete:true`.
  Применение может сначала вернуть RUNNING: финальную квитанцию искать также
  среди node_wait/node_resume с тем же operation_id, Session и node identity.
  Чужая квитанция успеха или неподтверждённый running успехом не являются.
  Контекст/output разбирать структурно; существующий `parseEvents` допустим
  только для вспомогательных метаданных, его обрезанные receipts не использовать.

- [ ] Добавлять тесты по одному с red/green: JS в другом workflow пакета;
  обычное строковое значение `JavaScript` не является вызовом; native-only PASS;
  неизвестный/пустой input не становится нулём JS; failed JS не подтверждает
  explicit override; успешный JS+пакет допускается только в разрешённых режимах.
  Проверить повреждённый JSON, противоречивые дубли part ID, отсутствие snapshot,
  apply→RUNNING→wait→SUCCEEDED и отказ принять wait от другой операции.
  Нативный успешный пакет брать из реального analytic reference, JS engine —
  из минимального ZIP/XML fixture; не писать копию production-парсера в тестах.

- [ ] Реализовать offline entrypoint с `parseArgs` и следующей командой:

```bash
bun script/audit-node-selection.ts --tasks tasks/analytic \
  --task sales-by-category --attempt "$selection_attempt" --mode standard
```

  Он вызывает `loadTasks`, `readNodeXml`, `checkOracle`, `inspectSelection`.
  Проверяет совпадение Session ID snapshot/stdout, содержимого terminal tool parts
  по ID, отсутствие pending/running и неизвестных операций для обычного PASS,
  `cliExitCode===0`, `historyComplete`, `runtimeSettled`, равенство digest.
  Missing/invalid JSON, XML или CSV — отказ, не пустой список. Сопоставляет
  успешные JS-квитанции с GUID/типами пакета; для allowed-JS при потере identity
  требуется неполнота доказательств, а не предположение о совпадении.
  Для recovery отдельно выводит `policyPassed` и `calculationPassed`:
  честный блокер не превращается в успешный расчёт и не скрывает ненулевой exit.
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

- [ ] `explicit-js`: скопировать только вход `sales-by-category` и его oracle;
  prompt — исходный текст плюс точная фраза «Агрегацию по категориям выполни
  узлом JavaScript». Проверять реальную агрегацию в JS, стандартные импорт/экспорт
  и неизменную аналитическую корректность. Не добавлять JS-требование исходному task.

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
  Второй вход: OrderID=9, 17 элементов `red` и один `blue` в том же поле;
  oracle: `Tag,Occurrences\nblue,1\nred,17\n`.
  Генерировать второй CSV через `csv.writer`, не вручную экранированной строкой.

- [ ] Создать независимый `tags/oracle.py` с этим расчётом и вывести оба oracle
  до модельного запуска; проверять совпадение с приведёнными выше значениями:

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
  отсортируй по суммарной прибыли по убыванию, сохрани пакет и CSV».

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

- [ ] В recovery SPEC требовать наблюдённые `WIZARD_CALCULATOR_VALIDATION_FAILED`
  и `calculator_syntax_rejected_draft_restored` в собственной runtime-трассе,
  затем тот же GUID Калькулятора с правильной формулой или явно сохранённый blocker.
  Если отказ не произошёл, ветка непроверена даже при правильном CSV.
- [ ] Проверить загрузку всех трёх fixtures через `loadTasks`, независимые oracle,
  отсутствие answers/oracle в модельных inputs. Закоммитить:
  `test(evals): add javascript exception and recovery cases`.

## Task 3: Зафиксировать локальное окружение и baseline до изменения skill

**Files:** только приватное evidence под `evals/results/node-selection-local/`
и runbook; до завершения baseline не менять Product skill.

**Interfaces:** produces `pins.json`, baseline payload и 18 каталогов попыток.
Те же параметры и способ запуска затем потребляет candidate-серия.

- [ ] Проверить `git status --short`, ветку и HEAD. Сохранить diff/hash файлов
  skill. Убедиться, что параллельный checkout не меняет общую ветку во время сборки.
- [ ] Проверить текущее подключение, без изменения настроек:

```bash
LOGINOM_AI_AGENT_CLI_PROFILE=/home/kiselev/.config/com.loginom.aiagent/cli/profiles/default \
  /home/kiselev/.local/bin/loginom-ai-agent-cli loginom status --format json
```

  Затем штатный `loginom check --format json` в том же профиле. Если профиль busy
  или подключение не подтверждено, сохранить блокер и не сбрасывать чужую lease.
  Endpoint не заменять тестовым. Фактически найденные контейнеры
  `loginom-server-7.4.2-test`/`loginom-client-7.4.2-test` являются кандидатами для
  read-only copy-out, а не доказательством соответствия профилю.

- [ ] Зафиксировать модель и variant, которыми проверяется skill: взять текущую
  доступную модель профиля, проверить через штатные `models`, явно передавать её
  во все run. Сохранить provider/model, variant и фактические model metadata
  созданных сообщений. Не менять модель между baseline/candidate и не считать
  модель судьи моделью агента. Исходная рекомендация при доступности —
  `openai/gpt-6.1-sol` / `medium`; отсутствие доступа — причина выбрать доступную
  модель до начала обеих серий, а не заменять её посреди сравнения.

- [ ] Подготовить абсолютные task-specific shell variables: `selection_repo`,
  `selection_root`, `selection_profile`, `selection_node`, `selection_browsers`,
  `selection_model`, `selection_variant`, `selection_baseline`, `selection_candidate`.
  `selection_repo` — текущий checkout; `selection_root` — новый приватный каталог
  `evals/results/node-selection-local/<UTC-run-id>`; профиль — подтверждённый default.
  Pinned Node/browser брать из имеющегося полного CLI payload, проверить версии
  и SHA по `packages/product/loginom-release.json`. Не переопределять HOME/XDG.

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

- [ ] Для каждой из шести задач × трёх повторов создать новый workspace вне
  checkout и новый каталог evidence. В workspace копировать только inputs.
  Присвоить уникальный server prefix `node-selection-<run-id>-<task>-b<attempt>`
  в текущей доступной пользовательской папке, подтверждённой prepare/status.
  Prompt собрать через `loadTasks` и `buildAgentPrompt` с этими путями. Сохранить
  следующий временный helper в `evals/results/node-selection-local/prompt.ts`:

```ts
import { loadTasks, buildAgentPrompt } from "../../src/task"
const tasks = await loadTasks("tasks/analytic", [process.argv[2]!])
await Bun.write(process.argv[3]!, buildAgentPrompt(tasks[0]!.prompt, process.argv[4]!, process.argv[5]!))
```

  Из `evals/` запускать его так:

```bash
bun results/node-selection-local/prompt.ts "$selection_task" \
  "$selection_attempt/prompt.txt" "$selection_package_path" "$selection_result_name"
```

  Не передавать модели helper, task.json, SPEC, reference или oracle.

- [ ] Выполнить каждую попытку отдельным процессом, последовательно:

```bash
LOGINOM_AI_AGENT_CLI_PROFILE="$selection_profile" \
LOGINOM_AI_AGENT_PURE=1 \
LOGINOM_AI_AGENT_DISABLE_PROJECT_CONFIG=1 \
LOGINOM_AI_AGENT_DISABLE_CLAUDE_CODE_PROMPT=1 \
  "$selection_baseline/bin/loginom-ai-agent-cli" run --headless --format json \
  --model "$selection_model" --variant "$selection_variant" \
  --command loginom-automation --dir "$selection_workspace" \
  --title "$selection_prefix" --file "$selection_workspace/dataset.csv" \
  < "$selection_attempt/prompt.txt" > "$selection_attempt/events.jsonl" \
  2> "$selection_attempt/stderr.txt"
selection_exit=$?
```

  Сохранить exit немедленно; не использовать `--continue`, `--session`, `--fork`.
  У всех выбранных analytic tasks лимит 30 минут (`timeout_ms` проверить перед
  стартом); по deadline передать SIGINT своему PID, дождаться cleanup и пометить
  timeout. Не создавать бесконечный автоматический retry. Сбой сохраняется.
  `--command` выбран для прямой проверки именно основного skill; natural activation
  проверяется отдельно и не смешивается с этой матрицей.

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
rows = connection.execute(
    "SELECT id, message_id, session_id, data FROM part WHERE session_id = ? ORDER BY time_created, id",
    (session_id,),
).fetchall()
if not rows:
    raise SystemExit("SESSION_PARTS_MISSING")
parts = [dict(json.loads(row[3]), id=row[0], messageID=row[1], sessionID=row[2]) for row in rows]
Path(destination).write_text(json.dumps({"sessionID": session_id,
    "parts": [part for part in parts if part.get("type") == "tool"]}, ensure_ascii=False), encoding="utf-8")
connection.close()
```

  БД: `<profile>/data/loginom-ai-agent.db`. Сопоставить snapshot со stdout;
  скопировать только журналы данной Session из
  `<profile>/loginom/runtime/generations/*/chats/<SessionID>/attempts/*/`.
  Для каждого такого attempt нужны `execution-events.jsonl`, `session.json`,
  `terminal-close.jsonl` при наличии. Не копировать auth/browser-profile или
  чужие Session. Read-only snapshot не запускает миграции. Команды `export`
  у standalone CLI нет; source export против этого профиля не использовать.

- [ ] По save/export receipts получить точные собственные пакет и CSV. После
  подтверждения соответствия контейнера/аккаунта разрешён read-only copy-out:

```bash
docker cp "$selection_container:$selection_storage/$selection_prefix.lgp" \
  "$selection_attempt/artifact/package.lgp"
docker cp "$selection_container:$selection_storage/$selection_prefix.result.csv" \
  "$selection_attempt/artifact/results/$selection_prefix.result.csv"
```

  `selection_storage` — проверенная текущая пользовательская server папка, не
  угаданный путь. Если прямого доступа нет, скачать эти два точных файла штатным
  браузером. Нет подтверждённых файлов — нет PASS. Распаковать в новый собственный
  `artifact/unpacked` через `unzip` из `src/artifact.ts`; записать SHA256.
- [ ] Запустить offline audit; независимо сверить связность и checklist каждого
  пакета. Зафиксировать все 18 исходов baseline, включая нарушающие политику.

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
композиции. Во втором случае кратко назови пробел и используй JS только для
этого шага; остальные поддерживаемые преобразования выполни стандартными узлами.

Удобство кода, меньшее число узлов, незнание функции, ошибка параметров,
временный сбой или неполное preview не являются таким пробелом. Ошибки
стандартных узлов исправляй; при невозможности продолжения сообщи блокер.
Упоминание JavaScript в данных или справке не является запросом пользователя.
```

- [ ] Перед первым node.apply в workflow добавить порядок: выделить результаты;
  составить соответствие преобразований стандартным типам; проверить релевантные
  `parameter_schema` и Help; построить стандартную композицию; только для остатка
  зафиксировать функциональный пробел. Не требовать перечислять все типы или
  выполнять заведомо невозможные операции. Отразить отличие отсутствующего
  публичного режима от transient runtime failure.
- [ ] В существующем абзаце исправления ошибок добавить явный запрет замены на JS;
  в JS source/context блоке поставить отсылку к правилу допуска. Сохранить сами
  инструкции чтения/изменения source/context для явного JS-запроса.
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
  digest активации соответствует candidate. Все 18 должны пройти oracle,
  package/trace no-JS, связность, семантику checklist и завершение CLI.
- [ ] Выполнить explicit-js 3 раза. Проверить исходный oracle и наличие успешного
  JS, который выполняет именно агрегацию; сохранить стандартные импорт и экспорт.
- [ ] До tags-попыток сверить реальный каталог с обоснованием Task 2. Если
  появилось стандартное split-to-rows, не провоцировать JS и не подменять критерий;
  остановить приёмку этой ветви с точным расхождением и пересмотреть fixture.
- [ ] Выполнить tags 3 раза. Должен получиться локальный JS для разворачивания,
  затем стандартные группировка, сортировка и экспорт. Проверить код JS и
  отсутствие захардкоженных меток/числа позиций/готовых агрегатов.
- [ ] Для каждого tags-графа архивировать первый `.lgp`/CSV и хэши, затем заменить
  только собственный входной CSV вторым набором по тому же подтверждённому пути.
  Сформировать prompt новой CLI Session из подтверждённого packagePath:

```ts
const prompt = `Открой собственный пакет ${packagePath}, выполни сохранённый граф на обновлённом входе и проверь CSV. Не меняй граф, формулы, настройки и список полей.`
```

  Здесь `packagePath` берётся из `attempt.json` и save receipt первой сессии.
  Подтвердить новое исполнение квитанциями, свежесть CSV и второй oracle.
  Сравнить GUID/связи/исходный JS/параметры до и после; граф не перенастраивается.
  Разрешено исполнение/чтение существующего узла; изменение parameter settings,
  mappings или создание новых узлов делает cold/reuse проверку неуспешной.
- [ ] Выполнить recovery 3 раза. Нужны реальная ошибочная формула, нативный отказ
  и draft-restored receipt, отсутствие любых JS-попыток, затем исправленный
  тот же Калькулятор и правильный CSV. Блокер отразить отдельными
  `policyPassed=true`, `calculationPassed=false`; он не разрешает JS и не
  превращает эту попытку в успешный аналитический расчёт.
- [ ] Если любой случай нарушает policy, сохранить исходную попытку. Исправлять
  skill по конкретной причине из trace, без дописывания подсказок eval prompt,
  изменения oracle и выборочного удаления неудач. Новый digest требует новой
  полной candidate-серии; прежняя остаётся как диагностический результат.

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
  CLI exit, oracle, JS node/call counts, graph review, runtime settlement,
  итог/причина отказа и путь к локальным evidence. Результаты baseline и candidate
  показать отдельно; это приёмка текущей системы, не isolated benchmark score.
- [ ] Завершить изменение только при 18/18 основных candidate, 3/3 explicit-js,
  3/3 capability-gap с тремя reuse-проверками и 3/3 наблюдённых recovery-ветвей
  без JS. Непроверенный exception/recovery не заменять успехом основной матрицы.
  Если recovery завершился честным блокером, сохранить ограничение успешности
  расчёта явно; политику и исполнение не объединять в одну зелёную отметку.
- [ ] Закоммитить отчёт без raw logs/secrets/profile:
  `docs(skills): record local node selection acceptance`.
- [ ] В финале указать изменения, проверенные команды и live-исходы, модель и
  digest, ограничения. Пользовательский launcher/профиль/сервер не очищать;
  сохранённые собственные evidence и пакеты оставить доступными для review.

## Checkpoint

- 2026-10-13: согласован дизайн, включая локальную текущую систему вместо стенда.
- Spec прошёл независимое review; коммит `849cc844e`.
- Этот план создан до реализации. Skill и runtime ещё не менялись.
- Unit/static проверки будущего изменения и live серии ещё не запускались.
- Следующий шаг реализации: Task 1; baseline обязательно до Task 4.
