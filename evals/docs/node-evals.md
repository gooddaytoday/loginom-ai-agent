# Кросс-таблица: code-only eval

LAB-16 содержит ровно три кейса: `crosstable-fixed-sum`, `crosstable-sliding-average`, `crosstable-reconfigure`. Каждый получает только prompt и `data/sales.csv` и сам создаёт импорт. Oracle, SPEC и `reference.lgp` остаются у проверяющего. Общий task-контракт и harness не изменены.

Из `evals/`, с назначенным приватным role env, выполнить:

```sh
bun install --frozen-lockfile
bun test
bun typecheck
with-env <role/eval.env> bun script/run-node-evals.ts --tasks ./tasks/node-evals --label lab-16-ben
```

`with-env` — подготовленный task-local loader из role runtime.md. Для отдельного кейса добавить `--only crosstable-fixed-sum` (аналогично остальные ID). Runner всегда передаёт `--skip-judge` и `--repeat 1`, запрещает calibrate/judge-only/dry-run/keep-storage/reset-profile. Env и profiles не включать в репозиторий или evidence. Использовать отдельные Ben checkout/profile/WORK_ROOT/results; авторизацию не импортировать и writer автора не снимать.

Тестируемая модель берётся из `EVAL_AGENT_MODEL/EVAL_AGENT_VARIANT`; здесь назначена `openai/gpt-6-sol/default`. Builder отдельно `openai/gpt-6.1-sol/xhigh`, подтверждён по БД каждой reference session. Rich/Ben — `gpt-6.1-sol/xhigh`. LLM-судьи, калибровки и порогов нет. Повтор качества ради PASS запрещён; штатный infra retry harness сохраняется.

## Кодовый verdict

Generic `summary.json` при skip-judge имеет null pass/score/oracle_pass. Единственный кодовый verdict — `code-verdict.json`; читаемый отчёт — `code-report.md`. Generic summary не переписывается. Локальные файлы: `<runDir>/<id>/1/events.jsonl`, `artifact/package.lgp`, `artifact/unpacked/Unit_*/Unit.xml`, `artifact/results/*.result.csv`, `cleanup.json`.

Приоритет: ERROR/2 для final infra_error/harness_error/interrupted, неполного набора, исключения валидатора, неизвестного required ID, cleanup_error, неподтверждённого process/profile/storage cleanup. FAIL/1 для failed/timeout/no_artifact либо недостающего/неверного обязательного доказательства. PASS/0 только для completed, подтверждённого cleanup и всех required checks. Итог infra retry оценивается отдельно от сохранённого первоначального сбоя.

`input` проверяет неизменённые bytes/SHA256 CSV, native upload и импорт с верными типами. `crosstable` — настоящий TBGCrossTabEngine, ровно один, фиксированные/скользящие категории, роли и единственный агрегат. `graph` — настоящие data ports от импорта через CrossTable к экспорту; competing inputs и посторонние обработчики запрещены, TBGSortingEngine допустим. `export` — настройки CSV, свежая native выгрузка с фактическим hash и успешное сохранение пакета после чтения/экспорта. `result` вызывает штатный checkOracle с tolerance=0, сравнивая колонки по именам и строки по порядку. `sequence` для reconfigure проверяет полные sum/read → same-node avg/read с новым execution ID и конечный XML avg. Полный sample с sample_complete=true и точными числами допустим; частичный sample — FAIL. Pending apply связывается с terminal wait/resume по operation_id; повтор одного tool-part ID не создаёт стадию.

Python3/stdlib читает native ZIP/XML без извлечения путей и сравнивает XML с реально собранным unpacked. Bun и Python3 нужны для локального валидатора. Неверный пакет — FAIL; сбой процесса инспектора — ERROR.

## Независимая приёмка Ben

Сначала сохранить свой воспроизводимый расчёт по prompt/CSV, до открытия author oracle/results. Затем проверить точный frozen SHA из READY_FOR_BEN в detached checkout. Author evidence — вложение этой же карточки с внешним SHA256 и внутренним manifest; runtime-local путь не является доставкой.

Проверки sensitivity без модели/судьи:

```sh
bun test test/node-evals.test.ts test/node-xml.test.ts test/node-evidence.test.ts test/node-sequence.test.ts test/node-runner.test.ts
```

Проверка каждого reference evidence (каталог `reference/<id>` из архива содержит events и artifact) использует тот же валидатор:

```sh
bun script/check-node-artifacts.ts ./tasks/node-evals/crosstable-fixed-sum <evidence>/reference/crosstable-fixed-sum /user/node-evals-crosstable-fixed-sum-3.lgp
bun script/check-node-artifacts.ts ./tasks/node-evals/crosstable-sliding-average <evidence>/reference/crosstable-sliding-average /user/node-evals-crosstable-sliding-average-2.lgp
bun script/check-node-artifacts.ts ./tasks/node-evals/crosstable-reconfigure <evidence>/reference/crosstable-reconfigure /user/node-evals-crosstable-reconfigure-1.lgp
```

`reference.lgp` каждого кейса совпадает с artifact/package.lgp в evidence по SHA256. Provenance содержит modelConfirmed, реальные input bytes, CLI check, cold rerun и finalize gates. Для независимого холодного выполнения открыть сохранённый reference через Playwright MCP в своём контексте Loginom, предварительно убедиться, что input FileName доступен и соответствует dataset; выполнить весь граф, проверить вновь созданный CSV со своим расчётом. Не менять shared author reference, его input или чужой writer. Если путь/стенд недоступен, указать конкретный BLOCKED; не засчитывать static XML вместо выполнения.

В одном live вызове runner Ben выполнит по одной попытке каждого кейса и сохранит свой runDir. Повторно прочитать его кодовый verdict можно без новых модельных попыток:

```sh
bun script/check-node-run.ts <runDir> crosstable-fixed-sum,crosstable-reconfigure,crosstable-sliding-average
```

Вернуть VERDICT_BEN качества eval (ACCEPT/REJECT/BLOCKED), SHA, собственный расчёт, команды и product PASS/FAIL/ERROR с подтверждённым cleanup. Product FAIL допустим при ACCEPT качества измерения. Handoff и возврат остаются в LAB-16; status in_review ставит Rich после ACCEPT, done — человек.
