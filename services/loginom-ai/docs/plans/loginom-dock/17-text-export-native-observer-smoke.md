> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-0e8097947c64` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

# Node17: единственный native smoke остановлен, replace не отправлен

Назначение `node17:native-observer-smoke:1:18b3ac38`.
**Native smoke FAIL / incomplete. Candidate-ready=false, readiness закрыта.**
Hermes не запускался. После отказа выполнена только read-only диагностика и
закрытие собственной browser-сессии; повторного observer или replace не было.

## Фактический прогон

Run `20260913-142510-94897ed4`, session
`d244dc33-2830-4cdf-9a4b-be24b1b29b1e`, Loginom 7.4.2 Linux,
`http://logi-test-plan.bg.local/app/?testable=true`, test-2 / `/test-2`.
Новая собственная session/profile. Аккаунт подтверждён в живом AppMenu,
viewport=null и развёрнутое окно проверены. Перед браузером свободно
102,293,348,352 bytes (~95.27 GiB); после — 101,796,843,520 bytes.
Суммарные локальные данные прогона вместе с профилем — 31,436,358 bytes.
Ничего не чистилось, другие evidence/worktrees не менялись.

Отдельная подготовка baseline включала одну delivery исходного main.csv,
импорт Main (5 строк), ExportCSV и terminal reject на том же пути.
Native baseline `/test-2/Dock-export-20260913-142510-94897ed4-csv.csv`:
124 bytes, SHA-256
`9f9972ed174053d02745df8df0c3c2d44697b33f7fb6da2ce8463eb58cc5d13a`.
Локальный retained artifact сравнен побайтно с закреплённым golden CSV.
Reject завершился FAILED с cleanup_complete=true, без execution phase.
Эта подготовка не является read-only interval и не является полным goal22/3.

Затем выполнена ровно одна попытка contract2 observer:

1. Успешно прочитан закрытый граф с точными document/workflow/node/source и edge.
2. Нажата Files, наблюдён корень `/`.
3. Для наблюдённой папки test-2 выполнен один `double_click`, его жест подтверждён.
4. Следующие roots/root observations ещё показали `/`, вместо `/test-2`.
5. Adapter отказал на проверке достигнутого каталога. Итоговый журнал:
   `reject_bound → read_started → incomplete`, elapsed 765.000125 ms.

Сохранены 11 prepared/completed browser steps. Download step отсутствует;
новый файл observer не создан; `actual-dispatch.jsonl` отсутствует;
в настоящем execution journal **нет** `smoke-replace/node_apply_prepared`.
Независимая проверка этих отрицательных фактов прошла. Outer binding правильно
вернул FAILED из-за отсутствующего actual-dispatch anchor. Его FAIL не заменён
синтетической положительной квитанцией. Настройки и глобальная атомарность
по-прежнему не считаются проверенными.

## Read-only диагноз и конкретный блокер

Первый read-only snapshot/screenshot показал Files `/` с выделенной test-2.
Позднейший read-only snapshot/screenshot без дополнительных жестов показал
уже `/test-2` и нужный CSV размером 124 bytes. Значит, переход завершился
асинхронно **после** немедленной проверки adapter. Точное время завершения
перехода не измерялось; нет основания объявлять сбой или таймаут Loginom.

Блокер `OBSERVER_STORAGE_NAVIGATION_NOT_SETTLED`: observer проверяет destination
сразу после жеста, хотя жест не доказывает завершённую навигацию. Следующее
исправление должно ожидать точное новое состояние посредством ограниченных
свежих read-only observations внутри исходного <=60s deadline. Не повторять
Files/folder gesture, не расширять разрешённые product actions, не допускать
unknown owner/navigation. **Такое исправление и новый smoke в этой фазе не
проводились**: назначение требовало после отказа остановиться и передать blocker.

Дополнительно настоящий bridge выявил несовместимость уже существующего
полного byte-аудитора: `audit-text-export.py:90` требует `target.origin` у всех
operation events, а session.targetIdentity и журнал bridge содержат только
`profile_id/loginom_build/platform/browser`. Функция `export_check` завершилась
`KeyError: 'origin'`. Данные не переписывались, origin не подставлялся из запроса.
Прямая проверка actual baseline bytes/golden успешна, **полный event audit — нет**.
Нужно отдельно связать origin с реальными raw browser/preparation evidence,
сохранив owner checks, и проверить настоящий формат bridge journal. В этой фазе
эта несовместимость только диагностирована, а не скрыта нормализацией evidence.

## Подготовительные правки и проверенные границы

До единственного browser smoke были закреплены малые изменения harness:

- `b7651cb3`: operator-only one-shot smoke runner; observer binding учитывает
  issued compact workflow_ref user-v1, но полный внутренний workflow берёт из
  actual journal. Исходный wire request не меняется. Outer binding сверяет эту
  форму с расширенным node request. Совместимость проверена офлайн.
- Первый entry run `20260913-142353-cbf21e31` отказал **до createSession**:
  harness ожидал user-v1, фактическая локальная конфигурация — diagnostic.
  Создано 0 sessions, браузер/observer не запускались; pre-browser failure сохранён.
- `d49278f0`: smoke runner использует фактически настроенный профиль и читает
  его реальные ответы, без изменения shared config. Native smoke выше выполнен
  в diagnostic-профиле. User-v1 ветка проверена офлайн, а не объявлена native PASS.

Регрессии: **15 Node + 14 Python PASS**, включая 24 semantic proof negatives,
SDK allowlist/bypass/owner/source/timeout и сохранённый readiness guard.
Полная negative matrix на новом положительном native download proof не могла
быть принята: положительный proof отсутствует. Synthetic tests его не заменяют.
Runtime155 inputs и source `25249210` не менялись; runtime
`347615cbae29323d80b57488b794ecce607b5b9e0d2fbe86aa88b7460241311c`.
Все 261 harness inputs закреплены в request.json и повторно сверены после прогона.
Полный будущий goal остаётся **22 nodeops / 3 deliveries / прежние save-reopen**.

## Завершение сессии и checkpoint

Собственные Chromium/Playwright закрыты; проверка процессов по exact session ID
не нашла оставшихся процессов. Выход из Loginom через UI **не подтверждён**:
он показал «Вы действительно хотите закрыть мастер настройки?». После этого
браузер закрыт через штатный bridge.close; новый браузер ради logout не запускался.
Не утверждать сохранность/сохранение несохранённого draft либо server-side logout.

Evidence root:
`unavailable:artifact-106c7f0717f8e36d`.
Основные файлы: request.json, preparation.json, geometry.json, smoke-source.json,
smoke-original.json, smoke-reject.json, replace-body.json, observer/*.jsonl,
initial-readonly-diagnosis.json, readonly-diagnosis.json, initial-diagnosis.png,
diagnosis.png, native-audit.json, session-close.json, process-close-check.json.
Raw execution journal находится в private/dock-state/sessions/<session ID>/.
В соседнем JSON — точные pins и hashes ключевых evidence. Аудит воспроизводится
локальным `unavailable:artifact-f9a10b81981dbeb1` без UI/model.

Следующий owner — координатор: решить адресное исправление ожидания навигации
и origin-binding аудитора, затем отдельно назначить новый bounded smoke.
До реального PASS не открывать candidate readiness и не выделять Hermes слот.
Новые узлы, повторное review, main/push/VPS/plugin/routing не затрагивались.
