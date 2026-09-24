> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-0b7b41878868` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node14: единственный раунд исправлений review 1

Команда: `node14:fix:1:cecb30012ae81ea3bf5268c0a9c952f41cfc8d2a:N14-R1+N14-R2`.
Ветка: `codex/node-14-missing-values`.
Исходное review: `23cb6dd2f946c33763e271dea8db6090fad11d0d`.
Code SHA: **`a63586fe096f4fd7f17f346c391834d3e34bdaa4`**.

Оба findings перепроверены в живом Loginom и исправлены. Новый полный review
не проводился. Автономная приёмка Node14 по-прежнему не завершена.

| Finding | Результат раунда | Проверка |
| --- | --- | --- |
| N14-R1 / P2 | Закрыт в source | Реальные Done и Execute проходят опубликованную строгую job schema; 14/14 отрицательных подмен отклонены |
| N14-R2 / P1 | Закрыт в source | Реальная terminal failure → FAILED/cleanup:true, inspect resolved, повтор и resume без жестов; после восстановления CSV новый явный запуск успешен в том же runtime |

## N14-R1: строгий результат Missing Values

В новом исходном сеансе Done завершился SUCCEEDED, но SDK Ajv отверг его
readback. Доказательства до правки:
`unavailable:artifact-ac7bbde44e7867af` (сводка проверки),
`baseline-done-checkpoint.json` (полный результат из durable node_checkpoint)
и исходный `execution-events.jsonl`.

Добавлена отдельная строгая ветвь `missing_values` в `node-result-schema.mjs`.
Проверяются точная структура, режим, пять receipt IDs, поля, допустимые сочетания
метода/типа/вида данных, порог 0–100, отключённые переменные и quality, input/output
mapping и признак отсутствия доказательства сохранения пакета. Отдельно учтён
реальный `RandSeedEdit;edtRandSeed`: строка не длиннее 32 символов и отключённая
переменная. Произвольный object в union не добавлялся.

Фактические Done/Execute возвращены через `startNodeApply`/`waitNodeApply`.
Их полные job objects проверены по `outputSchema`, опубликованной у
`dock_node_wait`, официальным SDK Ajv. Сохранены `fix-done-job.json`,
`fix-execute-job.json`, `success-summary.json`.
Восемь структурных подмен владельца/метода/порога/seed отклонены схемой;
шесть подмен владельца, метода и порога в исходных фазовых квитанциях отклонены
readback verifier. Схема сама по себе не доказывает равенство двух корректно
оформленных GUID; эту связь проверяет verifier. `fix-negative-readbacks.json`:
**14/14** отказов. User-v1 сохраняет свою отдельную схему.

## N14-R2: подтверждённый отказ исполнения

До исправления повторно воспроизведён отказ собственного CSV
`/test-4/node14-20260913-reordered1.csv`: execution
`1789265962000-me2nwatnn3j:187:1`, native `terminal:failed`, публичный
AMBIGUOUS/pending execute/cleanup:false. Точная причина в native ErrorDetails:
`Файл "/test-4/node14-20260913-reordered1.csv" не найден`.
Доказательства: каталог `unavailable:artifact-a790db30c2a49e7d`,
`execution-failure-result.json`, `execution-failure-inspected.json`,
`native-errors.json`, `restore-source.json`.

Общий verifier теперь принимает только полную историю того же prepared node,
root, group и record, native terminal failed с `can_cancel:false`, `error:true`
и непустой причиной. Отказ upstream не выдаётся за выполнение целевого child.
Перед закрытием собственной консоли та же квитанция проверяется повторно;
после закрытия проверяются отсутствие консоли и возврат в свой сценарий.
При потере ответа очистки, чужой группе, неполной истории или неизвестном
исходе остаётся неопределённость. Автоматического Execute нет.

`node.apply` сохраняет FAILED checkpoint, execution identity и bounded native
причину. Выход остаётся `not_refreshed`, `ports:[]`; ранее принятые настройки
не откатываются. Поля failed execution отражены в публичной схеме и TypeScript.
Явный resume завершённого failed job возвращает прежнюю квитанцию, не создавая
новой попытки. Для новой попытки после исправления входа нужен отдельный явный
запрос; он не считается восстановлением прежнего pending.

После исправления тот же fault дал execution
`1789266556651-oj65yz2tw6:187:4`, root `187`, group `4`, record `804`:
**FAILED, failure_verified:true, cleanup:true**, исходная причина сохранена.
Inspect: **resolved / cleanup_confirmed:true**. Повтор и явный resume вернули
неизменный job; число подготовленных действий **177→177**.
Публичный failed job прошёл строгую схему.

CSV восстановлен через собственное файловое хранилище. В том же runtime новый
явный `node14-fix-after-restored-source` завершился SUCCEEDED с execution
`1789266556651-oj65yz2tw6:187:5`. Прежняя FAILED-квитанция неизменна.
Независимо прочитаны все 3×5 значений до fault и после восстановления:
схема/тип/значения/Null совпали; первый результат отдельно сравнен с frozen
`reordered` expected и константой `NEW_NODE` (**15/15 ячеек**).
Повторное чтение байтов CSV не заявляется.

## Оставшийся блокер: lost-reply recovery

Отдельная настоящая инъекция потеряла ответ после успешного `finish_wizard`,
внутренняя операция `node14-fix-lost-reply:n7`. Результат AMBIGUOUS,
`pending_phase:input_mapping`, execution not_requested. Inspect оставил pending
и `recovery_options:[]`; resume отказан:
`Resume requires the original inspected node checkpoint without an unresolved phase`.
Повтор без действий **319→319** доказан, восстановления нет.

Точная недостающая часть — reconciliation завершения input mapping и дальнейшее
продолжение оригинальной node.apply по проверенной фазовой квитанции.
`executor.mjs` сейчас восстанавливает только workflow/target и повторно выдаёт
готовый checkpoint. Не добавлялся общий механизм для неподтверждённых wizard
эффектов. Это отдельный блокер последующей диагностики/приёмки, разрешённый
координатором к точной фиксации в этом раунде; безопасная остановка не названа PASS
recovery. Исходный pending не сбрасывался и не переносился в новый runtime.

## Проверки и pins

Итоговые live evidence: **`unavailable:artifact-b8790f17db36e6fc`**.
Session `74bfc6b5-9a9b-488a-8a59-5fdc7c56bc51`, Loginom **7.4.2**,
аккаунт **test-4**, пакет `/test-4/Node14-20260913-final.lgp`.
Окно 1508×949, viewport null, фактическая область 1508×862.
Runtime pin **`53473c2ac1f4dcfef339115303d1b8cda6757e101c5cf6ffadacacad42afba51`**;
155 файлов повторно проверены по source manifest после прогонов:
`fix-pin-verified.json`. Исходный baseline pin —
`71ad8762badfc799c4f6939f2bbe4e94a00ae3a7c9d87cfb47c118282b889054`.
Catalog manifest и SHA не менялись; точные значения в `catalog-pins.json`.

- Клиент: **1426 PASS, 1 SKIP, 0 FAIL**;
  `unavailable:artifact-f756837d021df656`. Первая полная попытка получила девять
  отказов sandbox (loopback EPERM/зависимые shutdown timeouts); её лог сохранён.
  Повтор прошёл с разрешёнными изолированными тестовыми сокетами.
- Python `test_missing_values_contract.py`: **3 PASS**.
- Добавлены проверки строгой job schema и receipt binding, чужой/неполной/
  нетерминальной failure, неопределённой очистки и ошибки записи journal,
  отсутствия чтения выхода, неизменности повторного результата и resume.
- Полный вывод 3×5 сравнен независимо до fault и после восстановления.
  Файлы `fix-full-comparison.json`, `fix-after-restored-comparison.json`.
- `git diff --check`: PASS. Повторный полный review не проводился.

## Ограничения и передача

Финальный диагностический пакет открыт как **только чтение**. Это не помешало
проверке локальных настроек/исполнения; сохранение в этом раунде не выполнялось.
Исходный CSV восстановлен, собственный пакет закрыт без сохранения; старые
evidence сохранены. Закрытие диагностического браузера не названо recovery.

Native `package.save_checkpoint` для `/test-4`, собственный immutable candidate
и финальный Hermes остаются отдельным допуском координатора. Старый ручной Save As
и предыдущий новый-browser reopen не заменяют эту приёмку. Hermes, stage/publish,
push/merge/deploy и обновление общего клиента не выполнялись. Общие runtime,
другие ветки и memory routing/hooks/cursors не менялись. `.gitignore` и `AGENTS.md`
оставлены с исходными пользовательскими изменениями.
