# Analytics expansion — Implementation Plan

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking. Начинать реализацию только по отдельной команде владельца; коммит и push также требуют отдельной команды.

**Goal:** разобрать 50 аналитических задач и завершить кампанию проверенным подмножеством: K принятых пар × 2 формы = 2K новых evals, остальные пары явно отложены с причиной и условием возврата. Для принятых пар обязательны проверенные Loginom reference/CSV/oracle, калибровка и измерения; прежние 65 кейсов сохраняются. Владелец 28.10.2026 разрешил итог меньше 100 evals.

**Architecture:** адаптировать существующий `loginom-eval-case` и проверку calibration corpus; использовать две self-contained коллекции и действующий harness. После полного P01 сначала разбирать рискованные механизмы, затем группы исходного каталога по пять; отложенные пары не блокируют независимые задачи. Готовые Authoring и Benchmark переиспользуются по актуальным handoff; измерения только последовательно в принятом режиме N=1.

**Tech Stack:** текущие Bun/TypeScript и Python 3, штатные CSV/oracle/calibration интерфейсы, установленный Loginom AI Agent CLI и Loginom из принятого Authoring. Новых runtime-зависимостей, registry, очереди или shared storage нет.

**Текущие правила процесса:** [operating-rules 01.11](2026-11-01-analytics-expansion-operating-rules.md) заменяют прежние избыточные процедурные условия; содержательные критерии дизайна и карточек сохранены.

**Spec:** [согласованный дизайн](../specs/2026-10-28-analytics-expansion-design.md), [канонические карточки](../specs/2026-10-28-analytics-expansion-pairs.md), [решения review](2026-10-28-analytics-expansion-review-fixes.md). Процесс хранится в дизайне, смысл/состав/статус пары — в карточке; этот документ задаёт действия и очередность исполнения.

## Global Constraints

- Исходный каталог содержит 50 пар, до 100 evals. В runnable-набор входят только принятые пары целиком D/B; обязательны сценарий Loginom и один итоговый CSV в обеих формах. Deferred не считается PASS, FAIL измеряемой модели или готовым eval.
- Detailed/business имеют одинаковые входы, общий контракт, oracle и rubric; бизнес-форма самостоятельно выбирает способ решения.
- Не заменять JavaScript специальный узел, который агент ещё не умеет настраивать; подтверждённо неподдержанный режим — в backlog.
- Смешанные данные: открытые реальные снимки и искусственные граничные случаи с честным происхождением; существующие 65 кейсов не менять.
- Адаптируется существующий `evals/skills/loginom-eval-case`; второй skill, runner, scorer или универсальный validator не создаются.
- Для будущего авторинга использовать `MODEL=openai/gpt-6-sol`, `VARIANT=xhigh` из существующего OpenAI-каталога настроек. Выбор зафиксирован до P21 attempt2 в private `analytics-expansion/authoring-model-fallback.json`: прежний `gpt-6.1-sol-fast` получил provider400/model_not_found в attempt1. Доступ к inference нового pin проверяется самой разрешённой попыткой, отдельного модельного probe нет. Старый provenance, бюджеты и pins измерений/judge сохраняются.
- Соблюдать [evals/AGENTS.md](../../../evals/AGENTS.md) и [runbook](../../testing/loginom-ai-agent/parallel-evals.md). Команды ниже выполняются из `evals/`, если не указано иначе. Будущие изменения кода — по TDD, по одному тесту и изменению.
- Владелец 28.10.2026 разрешил реализацию, авторские CLI-сессии, browser cold rerun, калибровку и одну измерительную попытку каждой новой формы. Повторное согласование этих запусков не требуется. Только последовательное исполнение, `parallel=1`; N=2, повторный setup/OAuth, старый карантин и перенос private патчей в общий код исключены.
- Исключение владельца29.10.2026: разрешён один новый headless OpenAI login только существующего Benchmark PRIVATE_ACCOUNT для устранения401/token_expired; процедура — [отдельный план](2026-10-29-benchmark-openai-renewal.md). Setup/auth copy/pins change и повтор P27B не разрешены.
- Коммит и push — только по отдельной команде владельца; завершение шага не разрешает их автоматически.
- Владелец отдельно разрешил минимальное исправление product recovery, подтверждённую cleanup Authoring и самостоятельное устранение блокеров с возобновлением работы. Это не разрешает обход guard, слепой acknowledgement, изменение Benchmark pins или удаление чужих ресурсов; исправление проходит воспроизводящую проверку и независимое review.

## Review Focus

1. Чужой manifest в общем corpus не ломает выбранную коллекцию, но неизвестный явный `--only` отклоняется — тест 0.2.
2. Расхождение 0.005 при tolerance=0.001 не принимается; semicolon CSV не превращается в одну колонку — тесты 0.2.
3. Подготовка двух входов не раскрывает oracle/SPEC/reference и путь черновика; перенос метаданных не ломает сбор/финализацию — проверка 0.3 и P01.
4. Правильное решение B не проваливается из-за скрытого определения, NULL или порядка — проверки общего контракта P01, ранние пары и независимое решение B при выпуске группы.
5. Старый CSV, перенастройка при rerun и запись серверной памяти не выдаются за чистое исполнение/сравнение — D1 на P01 и проверка памяти перед/во время/после первой серии по дизайну.

---

## Файлы, среды и границы

В шаге 0 меняются только перечисленные ниже файлы skill/checker/test. Для каждой формы пары создаются `task.json`, `SPEC.md`, `acceptance.json`, `oracle.py`, `oracle.csv`, `reference.lgp`, `provenance.json`, `data/*`; в `evals/calibration/<task.id>/` — `cases.json` и CSV содержательных мутаций. README каждой новой коллекции описывает только её запуск; смысл/статусы карточек туда не копируются.

Черновики живут вне runnable-коллекций до наличия reference/SPEC: [loadTasks](../../../evals/src/task.ts) требует эти файлы уже при загрузке `task.json`. Готовые формы размещаются в `evals/tasks/analytic-detailed/<slug>-detailed/` и `evals/tasks/analytic-business/<slug>-business/`. Manifests обеих форм остаются в общем `evals/calibration`, с разными task ID и точными source hashes.

Использовать готовую среду из [раздела дизайна](../specs/2026-10-28-analytics-expansion-design.md#уже-подготовленное-окружение). Принятие Authoring позволяет собирать reference; оно не подтверждает готовность Benchmark или разрешение на запуск судьи. Перечитать актуальный handoff инфраструктурного чата перед первой измерительной попыткой; не переносить локальные патчи другого checkout без отдельной задачи. Не копировать исторические пути `PRIVATE_ARCHIVE` из runbook.

Переменные команд — абсолютные пути оператора: `AGENT_REPO` — этот checkout, `LOGINOM_EVAL_CASE_ENV` — существующий несекретный файл настроек skill, `DRAFT` — черновик конкретной формы, `ATTEMPT` — путь, напечатанный `run_attempt.sh`, `COLLECTION` — конкретная коллекция, `SCENARIO_URL` — реальная ссылка принятого пакета. Перед использованием установить их из актуального handoff и аргументов кейса, а не из примеров другого компьютера. Секреты не печатать и не включать в Git.

## Откладывание пары и завершение кампании

1. Бюджет авторинга — первая и до двух исправляющих CLI-попыток, по 1800 s, суммарно на пару. Повтор/продолжение исправляет конкретный обнаруженный дефект; новый номер, форма D/B, перенос или новый ход не обнуляют историю и бюджет. Если новой проверяемой гипотезы нет, отложить раньше, не расходуя все попытки обязательно. Проверки не повторять без изменившихся условий или конкретного дефекта.
2. При исчерпании бюджета или отсутствии доступного исправления сохранить обе формы как `deferred` вне принятых runnable-коллекций. В существующей карточке указать этап, фактическую причину, использованные попытки, private evidence и конкретное условие возврата. Уже подтверждённые данные/oracle/reference сохраняются; новый реестр, очередь или retry-runner не создаются. Неразобранная карточка не становится deferred только ради завершения.
3. Различать ошибку автора, reference/rerun/oracle/calibration, подтверждённо неподдержанный режим и общую неисправность среды. Неудача автора не доказывает unsupported и не разрешает упростить задачу/ослабить проверки. Только подтверждённая нехватка возможности связывается с backlog; зависимые карточки могут ссылаться на то же конкретное свидетельство без повторения заведомо заблокированного пути.
4. Перед переходом к следующей live-задаче подтвердить завершение собственной операции и пригодность общей среды штатным recovery/cleanup. Неизвестный эффект, живой executor или удерживаемый профиль блокируют использование этой среды, а не превращаются в skip. Пользователь разрешил необходимый product recovery fix; новый запуск поверх блокировки запрещён.
5. При пригодной среде продолжать следующую независимую пару в порядке плана. Ранний рискованный механизм нужен только зависимым задачам; неполная группа не блокирует следующую. Foreign negative P01 закрывается первой другой принятой задачей отдельно внутри каждой коллекции, не обязательно P50. Все проверки принятого подмножества, включая независимое blind B для каждой непустой группы, сохраняются.
6. Возврат к deferred — только после конкретного изменения условия продолжения и при оставшемся бюджете. Конец первого прохода сам по себе не запускает второй круг. Исчерпанный бюджет не увеличивается автоматически. FAIL измеряемой модели на корректном eval сохраняется в принятом наборе; модельные измерения ради улучшения оценки не повторяются.
7. Кампания завершена, когда все 50 карточек имеют итог «принята» либо `deferred`, у принятых пар закрыты все обязательные проверки и по одному измерению D/B, подготовлены отчёт и независимое итоговое review. Отчёт перечисляет принятое подмножество, отложенные пары/причины/условия возврата и утраченное покрытие; качество модели относится только к измеренному подмножеству. Deferred не требует удерживать Goal незавершённым после выполнения этих условий. Общий неснятый recovery/cleanup-блокер и незавершённые проверки не объявляются успешным завершением.

Это изменение порядка и допустимого объёма результата по решению владельца, без ослабления приёмки отдельного eval. Изменения затрагивают план, согласованный дизайн, карточки и инструкции существующего skill: ориентир 5 файлов, 80–160 изменённых строк, без нового кода. Проверка — согласованность условий завершения/зависимостей, отсутствие изменений прежних задач, `git diff --check` и scoped независимое review. Исправление product recovery имеет отдельный узкий план и проверки; оно не смешивается с этой правкой процесса.

## Шаг 0. Адаптировать skill и проверку корпуса

**Зависимости:** принятие этого плана и команда на реализацию; готовый Authoring уже существует. Setup/OAuth/smoke не повторяются.

**Изменить:**

- `evals/skills/loginom-eval-case/SKILL.md`;
- `evals/skills/loginom-eval-case/references/case-contract.md`, `environment.md`, `verification.md`;
- `evals/skills/loginom-eval-case/scripts/settings.py`, `run_attempt.sh`, `collect_artifacts.py`, `finalize_case.py`, `validate_collection.ts`;
- `evals/script/check-calibration-corpus.py` и существующий `evals/test/near-miss.test.ts`.

**Проверить использование, удалить при отсутствии оставшихся callers:** `evals/skills/loginom-eval-case/scripts/import_codex_auth.py`. Его вызов в обязательном setup удалить в любом случае; существующий вход готового профиля сохраняется. `prepare_attempt.ts`, `settings.ts`, `compare_csv.ts`, `check_reference.py`, `summarize_attempt.ts` — существующие интерфейсы для переиспользования; менять их только при воспроизводимой несовместимости первой пары.

**Интерфейсы:** сохранить `settings.py:load(*extra)`, аргументы `run_attempt.sh <case_dir> <attempt_no> [hint_file]`, `collect_artifacts.py <attempt> [--park|--rerun]`, `finalize_case.py <case_dir> <attempt> --scenario-url <url>` и CLI checker `--tasks/--only/--corpus`. Указатель на черновик — соседний `<attempt>.case`, не файл внутри `--dir=<attempt>`. Нового API не требуется.

### 0.1. Устранить зависимости старого workflow

- [x] В документах skill и `settings.py:BASE` убрать `VALIDATION_REPO` и обязательный `agent-validation`. Источник — явный case/collection/пакет; `AGENT_REPO` остаётся для импорта функций действующего harness. Проверка: `rg -n 'agent-validation|VALIDATION_REPO' skills/loginom-eval-case` не находит рабочих ссылок; исторические отчёты вне skill не переписываются.
- [x] Перенести общий D/B-контракт, предметную rubric, native-границы, внешний reference и выбранный D1 из дизайна в соответствующие инструкции skill посредством ссылок и необходимых локальных действий. Убрать обязательное сужение задачи при неудаче автора и >50 строках; предупреждение `validate_collection.ts` должно говорить о размере текста для judge, без требования сократить корректную задачу.
- [x] В `run_attempt.sh` писать `<attempt>.case`; сборщик и финализатор читают этот путь. Удалить только guard чужого `$AGENT_REPO/evals/.profile/agent/.writer`; проверку собственного `$PROFILE/.writer` сохранить. Не удалять locks, не запускать `prune_runtime.ts` и не менять очистку других слотов.
- [x] В `environment.md` связать несекретные настройки существующего skill с готовым Authoring: CLI, PROFILE, URLPRIVATE_STORAGE WORK_ROOT, timeout, MODEL/VARIANT. Модель, вариант и скорость авторинга взять из Global Constraints этого плана. Если файла skill-env ещё нет, заполнить его по handoff; не создавать повторные авторизации. `import_codex_auth.py` не запускать. Проверенная инфраструктурная модель не заменяет выбранную владельцем модель авторинга и не задаёт модель измерения.

### 0.2. TDD существующего checker — по одному случаю

Каждый пункт выполняется как RED → минимальная правка → GREEN командой `bun test test/near-miss.test.ts`. Использовать существующие temp-directory паттерны этого файла; тесты запускают настоящий Python checker, а не копируют его логику. Временные test inputs не являются новыми eval fixtures.

- [x] Добавить тест `calibration checker selects manifests from the requested collection`: в общем corpus две задачи из разных коллекций; `--tasks` одной пересчитывает только её. Отдельное утверждение: неизвестный `--only` даёт ненулевой exit. Затем выбирать manifests по task ID выбранных task.json, проверяя соответствие имени каталога ID; явно запрошенные отсутствующие задачи не пропускать.
- [x] Добавить тест `calibration checker uses task oracle tolerance`: `oracle_tolerance=0.001`, отклонение `0.005` отвергается, `0.0005` принимается. Удалить дублирующую `.01` CSV-сверку: независимый `run_recipe(task, recipe)` остаётся Python, сравнение вызывает существующий `skills/loginom-eval-case/scripts/compare_csv.ts <agent_repo> <oracle> <result> <tolerance>`. Проверять JSON `passed`, а не только exit оболочки; malformed output/процесс с ошибкой не считаются PASS.
- [x] Добавить тест `calibration checker reproduces semicolon mutations`: oracle с `;`, сортировочная и column-мутация воспроизводятся побайтно. В `run_recipe` читать/писать его фактический разделитель через стандартный `csv` (поддерживаемые oracle-разделители `,` и `;`), сохранив формат старых comma recipes. Новый parser не писать.
- [x] Сузить существующий тест `analytic corpus covers all 35 tasks and all 114 applicable defects` на manifests прежней `tasks/analytic`, сохранив её 35/114 и распределение видов. Убрать глобальное требование 35/114 из общего режима Python checker: исторический результат проверяется тестом и запуском на старой коллекции, а новые коллекции имеют свой размер. Не создавать список-реестр и не ослаблять existing tests stale hashes, XML topology, `expected_failed` и `expected_oracle_pass`.

Точные утверждения для этих тестов (переменные — полученные exit/output и содержимое файлов, без нового helper API):

```typescript
expect(selectedExit).toBe(0)
expect(selectedOutput).toContain("1 tasks, 1 cases")
expect(unknownOnlyExit).not.toBe(0)
expect(delta005Exit).not.toBe(0) // baseline oracle отличается на 0.005 при tolerance=0.001
expect(delta0005Exit).toBe(0)   // baseline отличается на 0.0005 при том же tolerance
expect(semicolonExit).toBe(0)   // checker требует точного совпадения recipes с сохранёнными CSV
expect(semicolonOutput).toContain("1 tasks, 2 cases")
expect(files).toHaveLength(35)
expect(counts).toEqual({ sort: 35, aggregate: 35, threshold: 6, filter: 3, column: 35 })
```

### 0.3. Проверить offline-путь до первого authoring

- [x] Выполнить из `evals/`:

```bash
bun run test
bun typecheck
python3 script/check-calibration-corpus.py --tasks tasks/analytic
bash -n skills/loginom-eval-case/scripts/run_attempt.sh
```

Использовать штатный package script `test`: он задаёт `--isolate --timeout 30000`; прямой `bun test` использует 5 s и обрывает существующие проверки с намеренным ожиданием >10 s. Это исправление команды проверки, не изменение тестовых ожиданий.

Ожидание: тесты/typecheck проходят; checker печатает `35 tasks, 114 cases`, прежние CSV/source hashes воспроизводятся. Изменённые Python-файлы проверить `compile(source, filename, 'exec')` без запуска `main` и без записи `__pycache__`. Эти команды не запускают модель, judge или Loginom.

- [x] Подготовить одноразовый каталог вне runnable-коллекций: `case/data/a.csv`, `case/data/b.csv`, минимальный `task.json` с этими `inputs` и prompt, называющим оба файла; рядом закрытые sentinel `oracle.csv`, `SPEC.md`, `reference.lgp`. Пустой `attempt` создать отдельно. Реальный интерфейс из `evals/`:

```bash
bun skills/loginom-eval-case/scripts/prepare_attempt.ts \
  "$AGENT_REPO" "$PREP_CASE" "$PREP_ATTEMPT" \
  PRIVATE_STORAGE prepare-contract.result.csv
cmp "$PREP_CASE/data/a.csv" "$PREP_ATTEMPT/a.csv"
cmp "$PREP_CASE/data/b.csv" "$PREP_ATTEMPT/b.csv"
```

`PREP_CASE/PREP_ATTEMPT` — пути только этого временного примера; `PRIVATE_STORAGE` здесь лишь текст в prompt, сетевого обращения нет. Проверить ровно `a.csv`, `b.csv`, `prompt.txt`, `files.txt` внутри attempt; закрытые sentinel и `case` отсутствуют; имена inputs/выходов в prompt верны. Повторить подготовку с одинаковыми basename из двух подкаталогов — ожидается отказ до копирования. Удалять можно только этот одноразовый каталог.
- [x] Независимо просмотреть перенос метаданных и guard. Сбор/финализация `<attempt>.case` окончательно проверяются настоящим P01 в шаге 1; эту часть offline-подготовка не доказывает.

**Завершение:** старый корпус воспроизводится, новые коллекции/допуски/разделитель покрыты тестами, подготовка двух входов не раскрывает закрытые материалы, skill не зависит от старого repo. Реальное принятие reference ещё не заявляется. Ориентир: 11–13 изменённых/удалённых файлов, 250–450 строк с тестами и документацией; уточнить по `git diff --stat` до первого live.

## Шаг 1. P01 — первый полный путь

**Зависимость:** шаг 0. **Карточка:** P01 в [каталоге](../specs/2026-10-28-analytics-expansion-pairs.md#p01-дебиторская-задолженность-с-частичными-платежами).

**Создать после принятия черновиков:**

- `evals/tasks/analytic-detailed/receivables-payments-credits-detailed/{task.json,SPEC.md,acceptance.json,oracle.py,oracle.csv,reference.lgp,provenance.json,data/*}`;
- `evals/tasks/analytic-business/receivables-payments-credits-business/` с тем же набором файлов;
- `evals/calibration/receivables-payments-credits-{detailed,business}/{cases.json,<mutation>.csv}`.

**Интерфейсы:** `prepare_attempt.ts` и `buildAgentPrompt` — передача prompt/inputs; `check_reference.py`/`compareCsv` — фактический пакет и полный CSV; `loadTasks` — будущая коллекция; `prepareCalibrationCases` — manifests по разным task ID. Источник форматов — существующий `specialization-applications` и контракт skill; его предметные данные не копировать.

- [x] Подготовить одинаковые invoices/payments/credit_notes обеих форм и независимый `oracle.py`. Включить частичные проведённые операции, несколько платежей и кредит-нот одного счёта, непринятые статусы, отсутствие факта и переплату по карточке. До Loginom независимо вычислить oracle и неверный ответ при join сырых фактов/inner join; подтвердить отличие сильнее выбранного допуска. Численный результат не заимствовать из reference.
- [x] Собрать два prompt из общего контракта, данных и схемы карточки. Добавить алгоритм только D. Использовать предметную rubric дизайна, полный CSV в result-пункте, один `requires_run`. `acceptance.json` проверяет пригодность reference, а не запрещает эквивалентные графы оцениваемого агента. Общий reference допустим с честным происхождением, но не выдаётся за два независимых прогона.
- [x] После отдельного согласования авторинга запустить в готовом Authoring, с настроенным `LOGINOM_EVAL_CASE_ENV` и абсолютным `DRAFT` (команды из `evals/`):

```bash
bash skills/loginom-eval-case/scripts/run_attempt.sh "$DRAFT" 1
cat "$ATTEMPT/exit-code"
bun skills/loginom-eval-case/scripts/summarize_attempt.ts "$ATTEMPT"
python3 skills/loginom-eval-case/scripts/collect_artifacts.py "$ATTEMPT"
python3 skills/loginom-eval-case/scripts/check_reference.py "$DRAFT" "$ATTEMPT"
```

Путь `ATTEMPT` взять из вывода запуска. Shell exit `run_attempt.sh` не равен успеху CLI: проверить сохранённый `exit-code`, `modelConfirmed`, совпадение входов и `check.json:pass`. Убедиться, что соседний `<attempt>.case` читается авторскими скриптами, внутри `--dir` его нет. Профиль и историю Authoring сохранить. Неудача модели обрабатывается по правилу авторинга дизайна, без упрощения P01.

- [x] Выполнить D1 по [канонической процедуре](../specs/2026-10-28-analytics-expansion-design.md#cold-rerun-принятого-reference). До/после повторного чтения серверного LGP сравнить его SHA256; не хэшировать дважды одну локальную копию вместо фактического файла. Использовать прежние входы/пути, не редактировать XML отдельно от BIN. Команды сбора:

```bash
python3 skills/loginom-eval-case/scripts/collect_artifacts.py "$ATTEMPT" --park
# Здесь браузерное холодное открытие и исполнение; при недоступности — UI владельца.
python3 skills/loginom-eval-case/scripts/collect_artifacts.py "$ATTEMPT" --rerun
python3 skills/loginom-eval-case/scripts/check_reference.py "$DRAFT" "$ATTEMPT" --rerun
python3 skills/loginom-eval-case/scripts/finalize_case.py "$DRAFT" "$ATTEMPT" --scenario-url "$SCENARIO_URL"
```

Принимать только новый полный CSV и `check-rerun.json:pass`; сверить все узлы/ветви. Внешний готовый reference проверяется явным `check_reference.py <case> <package.lgp> <result.csv>` и получает честный provenance вне CLI-финализатора; фиктивные modelConfirmed/session/attempt не записываются.

- [x] Оформить SPEC по фактическому пакету, поместить принятые формы в свои каталоги, проверить `cmp` входов и oracle. Подготовить XML/CSV near-miss в существующих видах; предметный пункт в `expected_failed`, отдельный `expected_oracle_pass`, source hashes для каждой формы. Проверить независимые recipes без judge:

```bash
bun skills/loginom-eval-case/scripts/validate_collection.ts "$AGENT_REPO/evals/tasks/analytic-detailed"
bun skills/loginom-eval-case/scripts/validate_collection.ts "$AGENT_REPO/evals/tasks/analytic-business"
python3 script/check-calibration-corpus.py --tasks tasks/analytic-detailed --only receivables-payments-credits-detailed
python3 script/check-calibration-corpus.py --tasks tasks/analytic-business --only receivables-payments-credits-business
```

- [x] Провести positive/near-miss обеих форм с разрешённым judge. После исправления пропущенного требования денежного формата калибровки D/B повторены и приняты:

```bash
JUDGE_MODEL=gpt-6-sol JUDGE_REASONING=xhigh bun run src/run.ts --calibrate --tasks tasks/analytic-detailed --only receivables-payments-credits-detailed
JUDGE_MODEL=gpt-6-sol JUDGE_REASONING=xhigh bun run src/run.ts --calibrate --tasks tasks/analytic-business --only receivables-payments-credits-business
```

Ожидание: positive ≥90, oracle=true, все содержательные near-miss соответствуют `expected_failed`/`expected_oracle_pass`. Для одного ID штатный calibrate пропускает foreign negative; отметить это в карточке P01 до второй принятой задачи. После первой другой принятой пары повторить калибровку по **двум различным задачам внутри каждой коллекции**, ожидая foreign negative ≤40; D/B одной пары не использовать друг против друга. Пропуск foreign negative не становится достаточной итоговой приёмкой кампании.

- [x] В готовом отдельном Benchmark выполнены разрешённые владельцем независимые D/B попытки штатным harness. Настройки binary CLI, private slots/judge/budget взяты из актуального handoff; команды формы:

```bash
bun run src/run.ts --parallel 1 --tasks tasks/analytic-detailed --only receivables-payments-credits-detailed --repeat 1 --label analytics-p01-detailed
bun run src/run.ts --parallel 1 --tasks tasks/analytic-business --only receivables-payments-credits-business --repeat 1 --label analytics-p01-business
```

Не направлять эти команды на Authoring. Условие памяти проверяется по дизайну. При инфраструктурном сбое сохранить evidence и обозначить ограничение; неверный ответ агента также сохранить как измеренный результат, не менять задачу ради PASS.

**Завершение:** одна пара с полным reference/rerun/oracle, калибровкой и двумя независимыми измерениями. Если Benchmark или согласование измерения ещё ожидаются, отметить это в карточке; шаг 1 остаётся незавершённым. Массовая сборка ждёт завершения сквозного пути. Дефект метаданных/guard закрыт реальным сбором и финализацией. Ориентир: 24–34 новых файлов, 700–1600 текстовых строк плюс два LGP.

## Шаг 2. Подтвердить рискованные механизмы реальными парами

**Зависимость:** сквозной P01. **Файлы/интерфейсы:** те же форматы и команды шага 1, task ID берутся из slug соответствующей карточки; отдельные probe-fixtures/runner не создаются.

- [x] Последовательно подготовить P50 (Excel), P27 (дубликаты), P42 (stddev/pivot), P44 (регрессия/defaults), P46 (кластеризация), P22 (календарные границы), P05 (NULL). На каждой получить reference, новый CSV, браузерный rerun и независимую проверку; калибровка вызывается через `--calibrate --tasks <коллекция> --only <различные ID>` только с согласия на judge.
- [x] На P50 проверить лист Operations вместо Legend и валютную семантику либо явно отложить пару. Закрыть foreign negative P01 с первой другой принятой задачей: при принятой P50 — IDs `receivables-payments-credits-detailed,workbook-break-even-currency-detailed` и соответствующая business-пара; при deferred P50 использовать следующую принятую пару, отдельно для D/B.
- [x] На P27 проверить фактическую маркировку противоречий; на P42 — выборочный stddev; на P44 — Enter, intercept и отсутствие нормализации по реально принятому пакету, без предположения, что проверяемый default handler сам выставляет. Независимый численный oracle модели выбрать из уже доступных проверенных средств авторского окружения и зафиксировать версию в provenance; отсутствие подходящего средства решить до принятия модельной пары, не подменять экспортом Loginom.
- [x] На P46 применить уже заданные в карточке optimum/seed/сортировку; не добавлять прогон с перестановкой входных строк. Условия различимости остальных ловушек берутся из общего правила дизайна, без новых критериев для P36/P40/P42/P44.
- [x] При первой сборке P16 и P20 проверить начало дня, P21 — составной часовой ключ; выполнять их по тому же пути, не считать успех P22 доказательством этих операций. Принятые здесь пары позже только включаются в выпуск своей группы, не строятся повторно ради порядка разделов.

Подтверждённые reference/native/cold/oracle и итоговые исходы перечислены в соответствующих канонических карточках; P50 deferred, foreign negative P01 закрыт с другой принятой парой. Новых прогонов ради закрытия этих checkbox не выполнялось.

**Завершение:** каждая ранняя пара принята с доказательствами либо имеет deferred по правилам выше. Ошибка автора/окружения не считается недоступностью узла. Независимые задачи могут продолжаться до приёмки отложенного механизма. Ранние результаты переиспользуются в группах G01–G03. Объём каждой дополнительной пары: 20–34 файла, 500–1800 текстовых строк плюс LGP; суммарно шаг 2 оценивается по фактически принятым карточкам, без двойного счёта в группах.

## Шаг 3. Закрепить окончательный состав 50

- [x] После ранних native-проб сверены текущие 50 карточек с [демо/wiki/блогом](../specs/2026-10-28-analytics-expansion-loginom-sources.md), полным каталогом [LB](../specs/2026-10-28-analytics-expansion-blog-candidates.md) и [backlog](../specs/2026-10-28-analytics-expansion-backlog.md). Готовые пакеты используются только по процессу дизайна; число материалов не превращается в число runnable evals.
- [x] P34 сопоставлен с R01/R02 по покрытию, native-пути, данным и независимому oracle. R02 выбран на P34/G08: slug `probability-brier-reliability`, обе формы, общий контракт, источники и причина замены обновлены. Исходный `category-transition-probabilities` вытеснен при отборе с authoring=0; утрачена условная нормировка полной матрицы миграций. R01/R03/R06 и остальной резерв не добавляют 51-ю пару; R02 reference и приёмка выполняются в G08.
- [x] Для реальных источников P21/P41 подтверждены права, фактические headers/типы и происхождение технических полей до gold: P21 — официальный UTC trips/NLOD 2.0 и производный календарь; P41 — UCI 440×8/CC BY 4.0, технический C001…C440, денежные единицы без установленной валюты, без новых наблюдений. Полный freeze P41 и последующих срезов выполняется в своих группах до численных oracle; source preflight не означает native admission.

**Завершение:** канонический каталог содержит ровно 50 задач с текущими статусами/причинами. Изменение состава отражается в порядке выпуска ниже, но статусы туда не копируются. Ориентир: 1–3 документа, 20–100 строк; изменение данных/reference заменённой пары считается в её группе.

## Выпуск групп: общий проверяемый результат

Для каждой группы выполнить оставшуюся работу по процедуре шага 1; уже принятые пробы повторно не запускать при неизменных данных/условиях. Группа разобрана, когда все её пары приняты либо явно deferred; пустое принятое подмножество не называется выпуском. Для принятого подмножества обязательны:

- у каждой принятой пары готовы обе self-contained формы, reference, свежий rerun, независимый oracle и честный provenance;
- positive/foreign negative/near-miss прошли по текущему контракту и manifests; независимый checker пересчитал cases с фактическим tolerance;
- каждый файл `data/` и `oracle.csv` двух форм побайтно совпадает через `cmp`, наборы относительных имён одинаковы;
- `diff` извлечённых `task.json:prompt` показывает только разные постановки цели и раскрытие способа; обязательные общие определения/схемы одинаковы. Общий validator для этого не писать;
- независимый проверяющий решает одну принятую пару каждой непустой группы по B и входам, не читая D/reference/oracle до получения ответа, затем сверяет полный CSV;
- результат каждой пары и причина незавершённости записаны только в карточке; прежние 65 задач не изменены. Фактические live-исходы могут быть FAIL агента — это не причина отбраковывать корректный eval.

**Команды после наличия выбранных cases:** `validate_collection.ts <collection>`, `check-calibration-corpus.py --tasks <collection> --only <принятые ID>`, затем разрешённый `src/run.ts --calibrate --tasks <collection> --only <принятые ID>` отдельно для D/B. Для foreign negative нужны минимум две различные задачи; при необходимости включить уже принятую задачу предыдущей группы. IDs берутся из slug карточек с суффиксом формы. `cmp`, извлечение prompt и review выполняются обычными разовыми командами; новых реестров/валидаторов нет.

Очередность ниже содержит каждый P-ID ровно один раз. Это порядок разбора, а не второй источник статусов или постановок. Каждая группа даёт до 10 новых evals; ранние пробы учитываются в указанной группе один раз. Ссылки на предыдущую группу означают её разбор с учётом deferred, не обязательную приёмку всех пяти пар; содержательная зависимость остаётся только у задач, которым нужен заблокированный механизм.

| Шаг / группа | Пары | Зависимость и акцент проверки |
|---|---|---|
| 4 / G01 | P01, P50, P27, P42, P44 | Шаги 0–3; принять уже выполненные пробы, закрыть foreign negative P01 и измерить фактическую стоимость первой группы |
| 5 / G02 | P46, P22, P05, P16, P20 | G01; общий seed, включительные границы, NULL и начало дня |
| 6 / G03 | P21, P02, P18, P41, P03 | G02; часовой ключ, знаковое отклонение/число ошибок, регистрация, строковый ID реального среза |
| 7 / G04 | P04, P06, P07, P08, P09 | G03; независимые финансовые потоки и полные реестры |
| 8 / G05 | P10, P11, P12, P13, P14 | G04; зерно, distinct, доли и распределение без размножения сумм |
| 9 / G06 | P15, P17, P19, P23, P24 | G05; полнота оснований и календарных наблюдений |
| 10 / G07 | P25, P26, P28, P29, P30 | G06; границы состояний, дубликаты, словари и неизвестные значения |
| 11 / G08 | P31, P32, P33, P34, P35 | G07; единицы, пропуски, разворот и выбранный в шаге 3 вариант P34 |
| 12 / G09 | P36, P37, P38, P39, P40 | G08; независимые веса/основания и описательные разложения |
| 13 / G10 | P43, P45, P47, P48, P49 | G09; оставшиеся модели, рецептура и локализованные входы |

- [x] **Шаг 4 / G01:** все5 карточек разобраны: приняты P01/P27/P42/P44 (8 форм), P50 deferred3/3 с доказательствами/условием возврата. Reference/cold/oracle/calibration/one D+B и независимые actualreviews проверены; FAIL измеряемой модели/provider/resources сохранены. Фактические затраты и пробелы покрытия — SDD/g01-cost-reassessment.md, без экстраполяции полного каталога.
- [x] **Шаг 5 / G02:** общий результат подтверждён; операции даты и NULL проверены на соответствующих первых парах.
- [x] **Шаг 6 / G03:** приняты все5пар/10форм; reference/cold/oracle/standardcalibration56/56/blindB и sole D/B измерения с finalactualreviews закрыты. Границы P02/P18 и технический ID P41 совпадают в двух формах; model/format/resourceFAIL сохранены отдельно (SDD/g03-measured-outcomes.md).
- [x] **Шаг 7 / G04:** все5 карточек разобраны: P06–P09 приняты(8форм), P04 deferred3/3. Reference/cold/independentoracle/ONLY-B/calibration48verdict49calls/eightsole measurements/fullQA и freshactualreviews закрыты; whole-group SPEC+QUALITY APPROVE/rootFULLREAD (SDD/g04-measured-outcomes-actual-review.md). Полные реестры сохранены; officialPASS/fullcontract/format/RAMFAIL и UNKNOWN различены, повторов нет (SDD/g04-measured-outcomes.md).
- [x] **Шаг 8 / G05:** все5карточек разобраны: P11–P14accepted/8evals, P10deferred3of3. Reference/cold/oracle/public/ONLY-B/calibration48/eightsole/fullQA/cleanup/archive/fullmemory и independentindividual+wholegroupSPECQUALITY32APPROVE/rootFULLREADd91426 CLOSED. Model/format/noartifact/onlyRAMFAIL и descriptive-only ограничения сохранены (SDD/g05-measured-outcomes.md).
- [x] **Шаг 9 / G06:** P15/P17/P19/P23/P24 приняты целиком. P19D и P24B сохранены; разрешённые оставшиеся формы выполнены без повторов. Актуальные original outcomes, ограничения pins и whole-pair reviews — в карточках и итоговом отчёте.
- [x] **Шаг 10 / G07:** P25/P26/P28/P29/P30 приняты; sole D/B outcomes и whole-pair reviews закрыты. P29 обе interrupted/NULL, P30D фактический timeout900000 вместо1800000 сохранён; FAIL/NULL не исключали пригодные evals, повторов нет.
- [x] **Шаг 11 / G08:** P31 принята; P32–P35 deferred по текущему CP knowledge admission отказу P32D. P32B spent interrupted/NULL сохранена, D0/1; остальные D/B0. Native/cold/calibration и применимый accepted P31 blind-B сохранены; owning G08 intent содержит новые ordinary исходы, cleanup/releases и actual reviews.
- [x] **Шаг 12 / G09:** P36/P37/P39 deferred по тому же task-independent CP admission; native/cold/calibration36 и blind-B component сохранены. P38/P40 native NOT_PASS, used2/3/rem1; для P38 остаётся strict A3 condition, для P40 текущий общий pre-bridge Authoring hold после reviewed P45A2. Неизменные task-ID повторы не выполняются.
- [x] **Шаг 13 / G10:** P43A2 закрыла genuine native/full12CSV/cold/public/corpus/prepare/calibration с actual reviews, но sole D/B блокирует текущий CP admission; accepted G10 subset пуст, сохранённый P48 blind-B не выдан за приёмку P43. P45A2 native NOT_PASS/used2/rem1 после собственного management PASS; original cleanup и failure review CLOSED, общий pre-case hold применим к P47/P48/P49 FIRST A0/rem3. Причины/бюджеты/возврат — в карточках; unsupported/global memory outage не заявлены.

P41: уточнённый объём24–28files/5000–6200textlines плюс два LGP; основную часть составляют обязательные full440row raw/gold/nearCSV в двух self-contained формах. Полнота и source сохранены, новый loader/storage не вводится; independent root finalization-plan review APPROVE.

**Объём выпуска:** ориентир 100–170 новых файлов и 2500–9000 текстовых строк на пять пар плюс LGP; зависит от числа входов, длины oracle и near-miss. Данные/reference ранних шагов входят в эти числа, не прибавляются второй раз. Первая группа уточняет оценку следующих; превышение двойного уточнённого объёма требует пересмотра подхода до продолжения.

## Шаг 14. Итоговое ревью

- [x] Проверить 50 основ slug в карточках и одинаковое принятое подмножество K runnable task ID в каждой коллекции; остальные 50−K пар явно deferred и отсутствуют в принятом наборе. Проверить совпадение входов/oracle каждой принятой пары, полный результат, действительность source hashes и отсутствие неподдержанных JS-обходов. Состав/статусы сверять с карточками, без отдельного registry.
- [x] Текущий accepted-only состав K33/66 и legacy65: preservation52 (приватный архив; не опубликован) закрыта; шесть текущих проверок (приватный архив; не опубликован) PASS. Current physical parity (приватный архив; не опубликован) PASS/root FULLREAD; прежние native/cold/measurement proofs переиспользованы.
- [x] Текущее итоговое независимое ревью (приватный архив; не опубликован): **SPEC+QUALITY APPROVE, mandatory0/optional0**, root FULLREAD27b8e2/adopted. Проверены все50 dispositions и66 accepted outcomes, текущие holds/бюджеты/состав/checks; прежние stage/whole-pair proofs сохранены.

**Завершение:** 2K новых runnable evals из K принятых пар, 65 прежних сохранены, у всех новых reference и калибровки проверены; все остальные исходные пары перечислены как deferred с доказательствами и условиями возврата. Незакрытые ограничения измерений отражены отдельно. Ориентир: 1–3 документа отчёта/инструкций, 50–150 строк плюс только обоснованные исправления владельцев файлов.

## Шаг 15. Сопоставимые серии и передача

- [x] Для каждой принятой пары выполнить уже разрешённые по одной измерительной попытке D/B с принятыми pins и бюджетом Benchmark/judge, `parallel=1`; повторное согласие не требуется. Порядок D/B чередовать между сериями. Authoring не используется как Benchmark; измерительный FAIL сохраняется и не исключает пару.
- [x] Выполнить условие серверной памяти из [дизайна](../specs/2026-10-28-analytics-expansion-design.md#сравнение-формулировок), включая журналы во время серии и финальную сверку. Недоступность полного read-back или неизвестный capture — ограничение сопоставимости, не скрытый PASS.
- [x] Сохранены исходные отчёты каждой D/B попытки и парная таблица: обе прошли / только D / только B / обе не прошли. Агрегат K33 (приватный архив; не опубликован) связывает66original outcomes; итоговый отчёт раскрывает NULL, FAIL, version/timeout/memory/resource ограничения и потерянное покрытие всех17 deferred. Отдельный P32B NULL вне accepted subset не добавлен к66.

**Завершение:** воспроизводимый отчёт с фактическими pins и ограничениями, все 50 карточек разобраны, принятое подмножество проверено и обязательные замечания итогового review закрыты. Кампания и Goal могут завершиться при K<50; deferred остаются дальнейшей работой, а не скрытым выполнением исходной сотни. Повторные серии, merge, release, commit/push и следующая очередь — отдельные решения владельца. Ориентир: один краткий отчёт, 80–180 строк.

## Риски, исключения и принятие плана

Главные риски: фактическая установленная версия отличается от прочитанных исходников; численный oracle или конкретный native-режим не подтверждён; серверная память доступна из обеих форм; публичный пакет не даёт права на распространение данных. Риски проверяются на первом соответствующем пути, а не новым слоем инфраструктуры. Неудача оцениваемой модели сохраняется как результат; авторский reference и измерения не смешиваются.

Исключено: разработка новых узлов/execution-only API, новый источник памяти/validator/controller, дублирование инфраструктурного setup, операции с чужими ресурсами и карантином, изменения старых 65 кейсов, ослабление допусков, произвольные скрытые задачи или новый JS-алгоритм вместо узла. Дополнительные условия для отдельных статистических ловушек и перестановка строк k-means не являются требованиями этого плана.

## Возобновление 04.11.2026 после изменения доступности памяти

Продолжается этот план: проверить изменившиеся зависимости и выполнить всю доступную оставшуюся работу по P15/P19/P24/P25/P26/P28–P40/P43/P45/P47–P49. Исходные K24, подготовительные proofs и частичные измерения сохраняются; прежнее закрытие с deferred не завершает новое поручение.

1. Установить terminal исходы прежних operations и актуальное освобождение профилей; восстановить только нужные bytes/modes из private manifests. Результат — отсутствие неизвестного владельца и сохранённые бюджеты.
2. Выполнить обычный допуск ближайшей подготовленной P15 на основном pin после полной применимой memory-процедуры. Результат — реальный measurement либо конкретный текущий premodel blocker с cleanup; не повторять одинаковый отказ для каждого ID. P19 допускает только B на exact original runtime; P24 — только D на сопоставимом с B pin.
3. Проверить восстановление существующего Authoring admission для P40/P43 и FIRST A1 P45/P47/P48/P49; P38 A3 требует отдельной различающей причины после A2. После успеха закрыть зависимые native/cold/oracle/public/calibration/blind-B/measurement этапы. Результат каждой пары — принятая пара либо доказанный текущий deferred.
4. Обновить карточки и отчёт всех50, выделив только новые результаты этого возобновления; проверить accepted-only runnable состав и сохранность65, получить итоговое независимое SPEC+QUALITY review.

Новых механизмов и общего плана нет. Команды/pins — прежние handoff и owning evidence; root остаётся единственным live controller, parallel1. P04/P10/P50 exhausted3/3; setup/OAuth, повтор завершённых measurements, commit/push/merge/release и automation исключены. Объём определяется прежними оценками групп; при только диагностическом исходе ожидаются3существующих документа/около60–120строк и private evidence. Независимый review ближайшего measurement этапа (приватный архив; не опубликован) сохраняется приватно; он не заменяет actual admission.

Владелец затем предоставил новый Dock token и разрешил применить его и продолжить цель. Обновить только private credential source и `apiKey` существующих Benchmark PRIVATE_ACCOUNT/Authoring через штатный CLI stdin; остальные поля сохраняются, исторические generations неизменны. Этот credential update не является повторным развёртыванием среды/OAuth. После собственных cleanup получить full-memory на прежней identity и продолжить обычные разрешённые этапы без отдельного дублирующего verify. Независимый API-key-only review APPROVE; runtime/model/judge/data/rubric pins и накопленные бюджеты не меняются, PRIVATE_ACCOUNT не используется.

Диагностика общей prepare-границы выполнена прежней одноразовой P32 inspector-процедурой. Actual review (приватный архив; не опубликован) принимает ограниченный вывод: текущий MCP initialize получил connect-timeout, затем существующий retry довёл bridge/catalog до READY. Это не baseline fix или native PASS. Несвоевременный detach оставил original shutdown FAIL (ACKtrue/actualSIGKILL); последующие own resource-close/settled/scoped-zero/frozen checks закрыли ресурсы для продолжения. Этот Authoring capture не повторяется; следующий основной путь использует прежние pins. Ошибка имени timeout env у P30D сохранена в actual evidence: фактически900000, terminal20.127s без timeout; owning config исправлен правильными существующими ключами для последующих запусков, budget не обнулён.

После P31D/B ordinary prepare снова HOST_REQUEST_FAILED. Переиспользованное P32 SDK route comparison на точном CP дало оба PASS с client.close/actual exit0: correction не различена, proxy/pins сохранены, ветка диагностики STOP (actual review (приватный архив; не опубликован)). Подготовленные P32–P37/P39 ждут различающей причины полного CP startup либо относящейся коррекции; одинаковые admissions по новым task ID не запускать. Доступный независимый основной путь — P43 A2 на прежнем Authoring по принятому native plan/source: его прежний generation/catalog refusal устранён, наблюдался полный Authoring startup READY, а новый CP отказ не переносится автоматически на другую поставку. P43 A2 завершена: genuine OLS/full12CSV, original Runtime+Knowledge ACK/actualexit0 и native SPEC+QUALITY APPROVE. Один browser cold RunAll дал fresh fullCSV PASS, серверные LGP/raw неизменны, NoSave/logout/tabclose/settled подтверждены; public/corpus/checker и doc-source delta review APPROVE, current prepare8 закрыт. Четыре socket retry statuses внутри A2 сохранены, новым dispatch не являются. P38 A3 сохраняет отдельное более строгое условие возврата.


Первый CP filesystem/env capture завершился дефектом диагностической капсулы; исходный результат сохранён. После source-backed восстановления обычного mkdir перед fork отдельный bounded capture дал полный managed-start READY: наблюдён SDK cause UND_ERR_CONNECT_TIMEOUT, затем существующий startup retry успешен; RPC/actual target/route не захвачены. Inspector своевременно detached, original ACK и actual exit0, own archive/settled/clean подтверждены. Actual review (приватный архив; не опубликован) APPROVE допускает одну обычную P32 admission с прежними pins и процедурой памяти; CLI admission/native PASS и общая причина прошлых отказов этим не доказаны. Диагностика закрыта без новых capture. Последующая P32B дала interrupted/NULL после provider socket retry (B1/1), а P32D остановилась до модели с LOGINOM_KNOWLEDGE_UNAVAILABLE (D0/1). Их original outcomes/cleanup/штатные releases/full memory7equal и actual reviews сохранены в G08; D admission review (приватный архив; не опубликован) обосновывает текущий общий CP Hold для остальных измерений. Это не глобальная недоступность HTTP-памяти и не запрет независимого Authoring.

## Исполнение и checkpoint

- База кампании `3cc295878ea63e17ce0f0a3b123bb607b7f90af1`, analytics-expansion; исходные изменения сохранены.
- Итоговый accepted subset K33/66;17 current deferred:8 CP,6 Authoring,3 exhausted; все50 dispositions закрыты.
- Из23возвращённых принято9пар; новые17measurements=14numeric+3NULL, включая непринятую P32B; saved формы не повторялись.
- Четыре Authoring попытки: P43A2 native PASS, P40A2/P45A1/P45A2 native NOT_PASS; бюджеты не сброшены.
- Новый Dock token применён приватно; final memory574809 complete/healthy/all7equal, старый epoch остаётся ограничением.
- P32B B1/1=NULL; D premodel Knowledge failure/D0/1; actual reviews, original cleanup и normal releases CLOSED.
- CP HOLD P32–P37/P39/P43 по current task-independent Help admission, leaf UNKNOWN; SDK/inspector больше не повторять.
- P45A2 после own admission PASS:4 pre-case prepare errors, used2/rem1,4Runtime+Knowledge ACK/actualexit0, settled/review CLOSED.
- Authoring HOLD P40/P45/P47/P48/P49; у P38 отдельный strict A3 HOLD; у P04/P10/P50 exhausted3/3.
- P43 native/fullCSV/cold/calibration24qualified APPROVE; original capacity NULL и история36logical/37calls сохранены.
- Public exact33D+33B: временные P32/P43 52files сохранены приватно bytes+modes,8dirs убраны по manifest.
- Current six local validator/corpus checks PASS; первые3 operator ENOENT сохранены, исправлен только missing settings env.
- Legacy65 preservation PASS переиспользуется; accepted33 source/outcome proofs сохранены без новых model/oracle runs.
- Final selection parity PASS; итоговое SPEC+QUALITY APPROVE/root27b8e2, обязательных замечаний0; Goal завершён.
