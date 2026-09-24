> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-9c4b3773062b` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node14: автономная приёмка 4 — 13 сентября 2026

**FAIL. Единственный разрешённый Hermes run выполнен; полная цель не принята.**
Назначение `node14:autonomous-acceptance:4:7bef361c`, слот
`node14-hermes-20260913-run4-7bef361c`, run `20260913-142944-6167eba2`.
Нового запуска модели, ручного достраивания или повторения неопределённой операции
после прогона не было. Слот освобождён: процессов собственной сессии не осталось.

## Результат

В полном восстановленном экспорте **71 calls /71 replies /10 717 events**,
ошибок сопоставления пар нет. Подготовлено20 операций node.apply:
**18 SUCCEEDED** (9 импортов,9 операций Missing Values),1 NOT_APPLIED,
1 AMBIGUOUS. Native save отсутствует. Не выполнены полные27 успешных операций
и12 финальных результатов; независимый reopen не запускался из-за отсутствия
сохранённого пакета и допуска рабочего этапа.

Все9 импортов завершились успешно, включая полностью пустые поля: прежняя
остановка на NULL-marker преодолена. `import-120-create` получил NOT_APPLIED,
после него `import-120-create-retry` завершился SUCCEEDED. Отдельная проверка
source/graph proof на полном входном evidence подтвердила3 попытки отказа;
это компонентное наблюдение, не PASS полного partition или всей цели.

На основном узле прошли создание, execute с NEW_NODE, Done, Close и повторный
execute; затем успешны «Только строка», «Точность», «Среднее не медиана», «Порог40».
Эти статусы не заменяют независимую приёмку сохранённых результатов.

Остановка: **`impute-threshold41-create`**, позиция(1050,260),
`NODE_APPLY_STOPPED: MCP error -32001: Request timed out`,
**AMBIGUOUS/effect_possible=true/cleanup_complete=false/pending_phase=target**.
Последний checkpoint уточняет этап: create и rename уже SUCCEEDED, target
`5024754e-3173-4ad7-941b-93c8e4a22874`. Pending
`impute-threshold41-create:graph:2` — **remove_link** автоматически созданной
связи «Только строка»→«Порог41». Это частичный эффект; применять к нему
разрешение no-effect placement refusal нельзя. Причина тайм-аута живой
диагностикой в этой фазе не устанавливалась.

Независимый полный аудитор завершился exit1/FAIL:
`terminal_refusal_accounting`, `incomplete_evidence` — неподтверждённая операция.
Его gate не ослаблялся, исходные события не исключались.

## Модель, диск и восстановление экспорта

Фактический usage: **openai-codex /gpt-5.6-sol**,71 API calls,
completed=true/failed=false. Reasoning low закреплён запросом, конфигурацией
и аргументами запуска. Guard installed=true, blocked_attempts=0;
существующие токены подписки не изменились, fallback отсутствует.

Launcher exit **2**, исходный attempt остаётся **FAILED_MODEL_OR_EXPORT**:
при первой выгрузке получен OperationalError, `evidence.json` не появился.
Код выхода дочернего Hermes и флаг timeout launcher до ошибки не сохранил;
они **неизвестны**, не подменены нулём/успехом. Usage completed не является
доказательством нулевого кода выхода или полной приёмки.

Во время этой фазы отдельно наблюдался ENOSPC; df показал116MiB свободного места
при100% заполнения Data. Координатор удалил только регенерируемый `.npm/_cacache`,
после чего сообщил7.9GiB free в11:58:54UTC. Самостоятельной очистки не было.
Причинная связь заполнения диска с тайм-аутом remove_link и OperationalError
не доказана; оба исходных сбоя сохранены.

После освобождения места выполнен **только экспорт существующего завершённого
run**, без модели и без UI-действий. SQLite quick_check=ok; SHA/размер DB,WAL
и исходных execution journals до/после совпали. Использован прежний frozen
export_history, который читает tool calls/replies, не читая assistant bodies,
reasoning или compressed summary bodies. Все пары сопоставлены; metadata
`export_recovery` явно отмечает восстановление и неизвестный child exit.
`attempt.json`, launcher logs и light checkpoint не изменены.

Восстановленный evidence:712 246 884 байт,
SHA `73e93c1e573abd863b09d25e087f690bf0d6bc0e5b262663f97a34ac8353999d`.
После экспорта оставалось7.3GiB. Повторная проверка процессов —0;
это не меняет исходный node cleanup=false и не доказывает откат UI-эффекта.

## Закреплённый комплект и дальнейшая работа

[Полные pins и38 квитанций](missing-values-autonomous-acceptance-4-pins-2026-09-13.json).
Приватный корень `unavailable:artifact-ca377e1eedbb73b9`.
Индекс SHA `e407c16756727df985b652dbc4a32b7d6428087e371c1bb91177e649c5604736`.

- Source7bef361cf5320e553d68fc020493717c6e50683e; исходный report/headac7ce151.
- Runtime71f73d81d758c746bd2111c93de08691c85aebddf80a411f294b8ed3f56ab4ff:
  156 inputs; source395 match. Harness256/
  abda18113fd92027a3eac6e48c26bcc982875b8262991bc808fe092e1fe3b2c1 — unchanged.
- Immutable test4.2/cadd80dfd8490f40c851475008a1ccd68d7a617dbcf6a77de25034ff8da7b2ad:
  перед моделью повторно прочитаны и сверены4/4 файла. Goal/fixtures не менялись.
- Свежие auth expiry>4200s, settings, source/runtime/harness preflight PASS;
  отдельная authorization receipt сохраняет исходный launch plan
  `launch_authorized=false` без перезаписи. Новая test-4 сессия
  `6d9e4fb7-51c2-4d6c-8404-77e063b02edd`, развёрнутое окно подтверждено same-page
  geometry receipt. Закрытые diagnostic sessions не переиспользовались.

Старые доказательства проверены после прогона: acceptance2 13/13,
acceptance3 14/14, предыдущий scoped verifier33/33 — unchanged.
В этой фазе код, тесты, runtime, candidate, main, push, VPS, общий плагин
и маршрутизация памяти не менялись. Новое ревью не запускалось.
Пользовательские `.gitignore` и `AGENTS.md` сохранены незакоммиченными.

Следующий предмет решения координатора — отдельная диагностика pending
remove_link после частично созданного «Порог41» с учётом события ENOSPC.
Ни исправление, ни следующий Hermes run текущим результатом не разрешаются.
