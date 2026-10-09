# Текстовый импорт: подготовленный путь 58 node evals

Этот документ применяется только после отдельного старта владельцем. Подготовка
карточек не разрешает reference/product/cold, модельный smoke или provider probe.
Rich, Ben и Evaler сохраняют свои модели. Вызываемый ими Loginom AI Agent строит
reference и product на `openai/gpt-6-luna` / `high`; override model ID — `gpt-6-luna`.
Недоступная модель блокирует запуск без замены. Actual model/variant подтверждать
по assistant messages собственной архивной БД, requested config недостаточно.

Полная спецификация — `evals/docs/text-import-contract.md`; карта —
`evals/src/text-import-cases.json`. Материалы `drafts/text-import` ещё не являются
готовой коллекцией: 48 положительных кейсов не содержат reference; 10 диагностических
используют `output_mode=diagnostic` и допускают отсутствие пакета. Не создавать
фиктивный reference. Само завершение CLI не подтверждает PASS.

## Допуск и окружение

Перед каждым исполнением сверить LAB-55 и ресурсы: endpoint/container/storage,
slots, leases, profiles, ports, work/results/history, CPU/RAM/provider limits.
При конфликте выбрать собственный изолированный локальный стенд, если доступен.
Другой профиль на общем endpoint не обеспечивает изоляцию. Не освобождать чужие
leases/процессы, не переключать общий CLI, baseline pins или worker models.

CLI source pin: `5cd74d8ee5d6125692d953eb327b4d4f833c27a1`, clean manifest;
harness и skill 1.0.7 брать из exact SHA назначения. Установку CLI делать только
в отдельный prefix по штатному build/install runbook этого source SHA, без активации
default. Binary/resource hashes и реальную совместимость подтвердить при допуске.
В текущей подготовке CLI не установлен и live совместимость не заявлена.

Прямые EVAL_* назначения:

```sh
export EVAL_AGENT_MODEL=openai/gpt-6-luna
export EVAL_AGENT_VARIANT=high
export EVAL_CLI_MODE=binary
```

При переводе legacy reference.env сначала задать `MODEL=openai/gpt-6-luna`,
`VARIANT=high`; затем применить перевод из execution.md и повторно проверить
`EVAL_AGENT_MODEL`, `EVAL_AGENT_VARIANT`. Не наследовать reference модель из LAB-55.
Назначить собственные EVAL_CLI_BIN, EVAL_PROFILE_DIR, EVAL_WORKSPACE_ROOT,
EVAL_RESULTS_DIR и timeout 900000. Stand lease и sandbox обязательны.
Постоянный `EVAL_PROVIDER_PROBE_LEDGER_DIR` назначается до первого разрешённого
probe; подготовка и перенос комплекта не дают новый бюджет probe.

## Reference, evidence и cold

Автор использует `scripts/reference-attempt.ts` с `AGENT_REPO` на назначенном SHA,
не больше трёх reference-попыток на кейс. Collector после completed/confirmed
сохраняет `native-import.json`, включая реальные отказы, из собственного
архивного `execution-events.jsonl`. Оригинальные journals остаются обязательными
для offline checker; проекция отдельно от них не доказывает native observation.

Из `evals/` точного checkout:

```sh
bun script/check-node-artifacts.ts "$DRAFT" "$ATTEMPT" "$REMOTE_PACKAGE"
bun script/prepare-text-import-cold.ts "$DRAFT" "$ATTEMPT" "$NEW_COLD" "$REMOTE_PACKAGE"
node script/text-import-cold/reader.mjs --config "$PRIVATE_LOGINOM_CONFIG" --resources "$PINNED_RESOURCES" --saved "$NEW_COLD/saved.json" --expected "$NEW_COLD/expected.json" --events "$ATTEMPT/events.jsonl" --output "$NEW_COLD"
python3 script/check-text-import-cold.py "$DRAFT" "$ATTEMPT" "$NEW_COLD"
bun script/finalize-text-import.ts "$DRAFT" "$ATTEMPT" "$FINAL_COLLECTION" "$NEW_COLD"
```

Для diagnostic выполнять только warm checker и finalize без COLD аргумента.
`check_reference.py` для прежнего CrossTable не является импортным checker.
Cold reader открывает точный сохранённый пакет, читает сохранённые настройки,
поля и mapping, отменяет мастера без Apply, независимо скачивает source bytes,
выполняет сохранённый граф и читает полную таблицу, закрывает пакет/logout.
Warm проверяет историю create/apply/upload, cold — сохранённое состояние.
При refresh cold использует последний TSV; история обоих этапов остаётся обязательной.
Warm package XML проверяет граф/GUID/путь; сохранённые настройки проверяются
независимым native cold readback, а не предполагаемой схемой XML атрибутов.

Checker требует полную точную typed таблицу текущего исполнения: схема/метки/
порядок, явный NULL, канонические строки integer/datetime, точный Decimal,
ведущие нули, Unicode и переводы строк. Не использовать CSV вместо этого evidence.
Если public checkpoint не содержит полного precise output, PASS не выдаётся;
отсутствующее обязательное evidence — FAIL, неизвестный ID/check — ERROR.
Завершённый cold положительного кейса обязательный gate финализации, не product gate.
Синтетические unit fixtures не являются настоящими пакетами или live evidence.

Перед финализацией дополнительно подтвердить actual model, бюджет попыток,
CLI/product skill/action manifest, stand release и hashes по verification.md.
Helper фиксирует CODE_CHECKS_ONLY provenance и не выдаёт operational ACCEPT.
Вновь финализированный каталог не перезаписывается. Пакет переносится побайтно.
Ben сохраняет собственный расчёт до открытия авторских oracle/SPEC/reference.

После независимого допуска выполнить один fresh product run каждого кейса через
`script/run-node-evals.ts --tasks "$FINAL_COLLECTION" --only "$CASE_ID"`.
Runner задаёт skip-judge/repeat=1 и сохраняет code verdict; модели работников не меняет.
Product FAIL и качество eval ACCEPT учитывать раздельно. ERROR/неизвестная очистка
блокируют продолжение. Отчёт передавать по Evaler→Rich→Evaler→Ben→Evaler контракту.
