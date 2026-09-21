# Отладка сценариев: ход выполнения

План: [2026-09-21-loginom-scenario-debugging](../../superpowers/plans/2026-09-21-loginom-scenario-debugging.md).

## Текущее состояние матрицы

| Случай | Статус | Клиент / чат |
| --- | --- | --- |
| Исходный ABC | CREATED_EXECUTED | `.3` / `ses_f3c001c10ffevlxP0Ek4C4Beav` |
| B65 | CREATED_EXECUTED | `.5` / `ses_f3bf4fceeffeFbJCn0QjA07n9W` |
| B02 | CREATED_EXECUTED | `.6` / `ses_f3beabb1affeTJydQ4bzcVwxc3` |
| B47 | CREATED_EXECUTED | `.5` / `ses_f3be80188ffeWXck3xXTGcEQ0i` |
| B37 | CREATED_EXECUTED | `.6` / `ses_f3bddb28dffe9rnhncERKN0Fam` |
| B27 | BLOCKED | `.5` / `ses_f3bddb28effeOkWDWMW4svtpFn` |
| B18 | BLOCKED | `.7` / `ses_f3bd81345ffea4N7Co16zrp2B5` |
| V27 | RUNNING | `.6` / `ses_f3bd0e6a1ffeUBtNOzCMf4U9QT` |
| V65, V02, V37 | NOT_STARTED | Входы и задания готовы |

RUNNING и NOT_STARTED — промежуточные состояния реестра, не зачётные исходы.
Для выполненных случаев `analytical_correctness: not_checked`.
Фактически выполнены imports.text, transform.calculator, transform.sorting,
transform.group_data, transform.join_data, transform.date_time. Остальные 8 типов ещё не зачтены.

## Исходный ABC — 2026-09-21

Прогон начат через интерфейс установленного Desktop
`/Applications/Loginom AI Agent.app`, версия `0.1.7-local.20260921.2`.
Отдельный профиль; рабочий профиль и его чаты не изменялись.
Провайдер/модель: `openai/gpt-5.6-sol`, вариант `low`.
Loginom: `7.4.2` по manifest фактического prepare.

- Чат: `ses_f3c22ad07ffeKNe97BcbzJ5ipQ`.
- Вход: `/Users/kartamyshev/Downloads/loginom-ai-sales (2).csv`, 10531 байт.
- SHA-256: `b55154fe32bf32b18146f12f1e9ef5ab135537df2210c7461d2bf229afb7711a`.
- Файл прикреплён через GUI; доставка `deliver-abc-csv-001` подтверждена
  квитанцией `SUCCEEDED`, `upload_completion_verified: true`.
- Запрошенный выход: `/user/scenario-debug-abc-baseline-20260921.lgp`;
  сохранение пока не подтверждено.
- Локальные доказательства вне Git:
  `/Users/kartamyshev/Library/Logs/loginom-scenario-debugging/20260921/`:
  `baseline-prompt.txt`, `baseline-chat.json`, `baseline-profile/`.

Статус: `BLOCKED`. Повторены F01 и F02: `node-import-abc-001` дошёл
до `configure` и получил `Requested source field is missing or ambiguous`.
Фактическое наблюдение Loginom показывает открытый мастер «Настройка форматов
импорта», шаг `text_import_format`. Модель вызвала inspect/observe/recover/resume,
затем отправила исправленный запрос к существующему узлу; восстановление
отвергнуто из-за незавершённой старой операции. После повторяющихся отказов
исследователь остановил модель кнопкой Desktop. Loginom вручную не изменялся.
Зачётного результата и покрытия узлов пока нет.
`analytical_correctness: not_checked`.

## Первое исправление (исходники, до установленной приёмки)

- Новые импорты и patches разрешают однозначные наблюдаемые CSV-метки,
  сохраняя техническую идентичность и нативный порядок полей. Неоднозначность
  не разрешается по позиции или придуманной транслитерации.
- Известная ошибка сопоставления закрывает собственный черновик мастера.
  Только подтверждённый возврат того же узла без применения/исполнения
  позволяет очистить pending configure и рекомендовать новый исправленный
  запрос к существующему узлу. Transport uncertainty не получает этого пути.
- Узкие тесты импорта, node apply, API, close и public results прошли.
  Полный runtime suite (`node --test test/*.test.mjs`, pinned Node 24.19.0)
  завершился с exit 0. Обязательные macOS source checks: 8/8 команд PASS
  (Bun 1.3.14; Product/Host/Desktop/Agent typecheck и тесты).
  Source transforms: 5045 файлов PASS; migration source tests: 2 PASS.
  Журналы: `runtime-tests.log`, `source-checks.json`, `source-checks.log`
  в локальном каталоге доказательств. Проверки выполнены на рабочем дереве
  поверх `6beba9a6043f1bba415747649ed991b4e1a633b0` до фиксации исправления.
- Полноценный повтор в новой установленной сборке ещё не выполнен.

## Точка продолжения

Исходный ABC на `.3` и B65 на `.5` завершились CREATED_EXECUTED.
B02 и B47 завершились; B37 выполняется на `.6`, B27 на `.5`. Профили и REPL
сессии принадлежат только этому прогону. Последний source commit `99f65a0e4`; кандидат `.7` установлен для следующих случаев.
Диагностическое восстановление импорта `.5` и ранний отказ Unicode-name `.6`
подтверждены. Остальные случаи матрицы не запущены; полный аудит не завершён.


## Первый кандидат

Commit `6dc261bd2f30e9626ba478705b5ea65e780b4c37`, версия
`0.1.7-local.20260921.3`, канал prod, macOS arm64.
Сборка по штатному runbook завершилась PASS: DMG/ZIP, статическая проверка
4446 ресурсов и автономный artifact smoke. Это не живая приёмка сценария.

- Артефакты: `/Users/kartamyshev/.cache/loginom-macos-build/scenario-20260921-1/`.
- `build-report.json`, `release-manifest.json`, `static-dmg.json`,
  `static-zip.json`, `offline-smoke.json`, `SHA256SUMS` находятся рядом.
- Установлен из readonly DMG в
  `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.3/Loginom AI Agent.app`.
  `codesign --verify --deep --strict` PASS. Пользовательская установка
  `/Applications/Loginom AI Agent.app` не заменялась.
- Отдельный профиль: `candidate-1-profile/` в локальном каталоге доказательств.
  Первый запуск ожидает системного доступа Keychain. Computer Use запретил
  управление SecurityAgent; обход не применялся, пользователю отправлен запрос.
  Первая попытка запуска истекла через 120 секунд; повторная ожидает разрешения.

## Второй набор исходных исправлений

Не входит в установленный первый кандидат; живая приёмка остаётся pending.

| ID | Изменение и границы |
| --- | --- |
| F04 | Сообщение native step и ограниченная причина с кодом сохраняются, включая ранее не перечисленные коды Loginom. Неизвестный эффект не считается исправленным. |
| F05 | Подтверждённый отказ с cleanup и известная ошибка исполнения предлагают исправленный запрос к тому же existing node с новым operation ID. |
| F08 | Отвергнутый resume сохраняет исходный outcome, node, ошибку и unsettled; worker rejection больше не стирает checkpoint. Воспроизведено до правки. |
| F09 | acquire/catalog/admission не скрываются: модель получает этап и безопасный код ошибки; ложное сообщение о доступности инструментов исключено. Ошибка каталога не запускает admission. Занятый чат и recovery различаются. |
| F10 | Лимит обычного preview считается в UTF-8 байтах. Кириллический пример превышал 50 KiB до правки, после — сохраняет целые строки, status/error/next_step и укладывается в лимит. Native exact-table не урезается; его большие ответы и общая backend truncation требуют отдельного аудита. |

F03 (ошибка чтения после исполнения), F06 (допустимость Unicode technical names)
и F07 (возобновление после deadline) требуют живых воспроизведений.
Не отмечены исправленными. Общий аудит 14 драйверов и UI-пути не завершён.

Проверки второго набора: полный runtime suite — exit 0 (`runtime-tests-2.log`);
прицельные SessionTools/LoginomResult — 6 PASS; HostPort/Transport — 8 PASS;
Agent и Host typecheck PASS. Повтор полного macOS source-check pipeline —
8/8 команд PASS (`source-checks-2.json`, `source-checks-2.log`).
Source transforms — 5045 PASS, `git diff --check` — PASS.
Второй кандидат `0.1.7-local.20260921.4` собран из `7b53008c0`: DMG/ZIP,
4446 ресурсов и offline smoke PASS. Установлен из readonly DMG в
`/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.4/Loginom AI Agent.app`;
codesign PASS. Артефакты: `scenario-20260921-2` рядом с первым кандидатом.
Живая автономная приёмка не выполнена.

## Производные входы

Подготовлены [scenario-cases](scenario-cases/manifest.json), по отдельному ТЗ,
описанию преобразования и hashes файлов:

- V65: 200 строк, 13 русских заголовков; значения совпали с B65.
- V02: 510 строк; очищены region у ID 1–5 и добавлены точные копии ID 1–10
  после очистки; в CSV 10 пустых region с учётом копий.
- V27: 181 строка до 2025-07-01 и 184 начиная с этой даты; конкатенация
  воспроизводит исходные строки без потерь и перестановок.
- V37: 500 исходных строк; отдельное задание на длинную таблицу касаний.

Исходный `analitic-tasks` не изменялся; `result.txt` не использовался.

## Живая диагностика повторной настройки (DEBUG_ONLY)

Прямой runtime-прогон на установленном `.3` подтвердил отказ неизвестной
колонки, закрытие собственного черновика, cleanup=true и рекомендацию нового
запроса к тому же узлу. Исправленный запрос достиг следующей ошибки:
`WIZARD_SOURCE_VALIDATION_FAILED: Имя файла не может быть пустым`.
Это не автономная приёмка модели и не CREATED_EXECUTED.

Причина: existing patch читает прежнюю схему до применения источника;
после отмены первоначального мастера путь пуст. Добавлен путь полной
первоначальной настройки существующего узла с пустым наблюдаемым источником.
Требуются все параметры и совпадение пути с verified upload. Частичный patch
или другой путь отвергаются до мутаций. Два регрессионных теста прошли;
вся группа source replacement: 10 PASS. Живой повтор этой правки pending.
Локальный журнал: `import-recovery-live-2.log`; подробные ответы находятся
в указанном в нём private acceptance evidence каталоге.

Повтор полного runtime suite после этой правки: exit 0 (`runtime-tests-3.log`);
source transforms: 5045 PASS; `git diff --check`: PASS.

## Третий кандидат и подтверждение восстановления

`d8a537ac3d7b64afa0b9bec6d6cc575a08d13f03`, `0.1.7-local.20260921.5`:
штатная сборка DMG/ZIP, статическая проверка 4446 ресурсов, offline smoke PASS.
Установлен из readonly DMG, codesign PASS. Каталог артефактов:
`/Users/kartamyshev/.cache/loginom-macos-build/scenario-20260921-3`.
Установка: `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.5/Loginom AI Agent.app`.
SHA256 app.asar: `4a83e641fd82fd373ccdc2c040d452aa946ce469ee3bb16482e861f94b9cb4f2`.

DEBUG_ONLY live regression: PASS (`import-recovery-live-3.log`).
Неверная колонка → FAILED с подтверждённым закрытием собственного мастера →
новый operation ID и тот же node → SUCCEEDED, execution completed,
наблюдаемый выход из двух строк → package.save_checkpoint SUCCEEDED.
Node `ad8f7792-da20-4a7c-9fdf-8ee86acb9ec3`, document
`1789994885116-a5hfud4m3jv`. Приватные доказательства:
`/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-import-recovery-live-JcBvNB/summary.json`.
Это прямой runtime-проверочный запрос; автономный сценарий им не заменяется.

## Исходный ABC: CREATED_EXECUTED

Кандидат `.3`, commit `6dc261bd2f30e9626ba478705b5ea65e780b4c37`,
app.asar SHA256 `daa5c917be44c10af3f70957a2a09e450d1192953a78bed3fecf92fc9bfa9e02`.
Настройки прежние: OpenAI / GPT-5.6 Sol / low; Loginom 7.4.2.
Чат `ses_f3c001c10ffevlxP0Ek4C4Beav`, исходный русский CSV доставлен и сверён.
Задание и файл отправлены через GUI. Ручных изменений Loginom не было.

Созданы и выполнены 8 связанных узлов: импорт, три калькулятора, сортировка,
две группировки и слияние. Дополнительно существующий калькулятор успешно
исправлен новым запросом: модель увидела NULL, прочла справку и исправила
аргумент CumulativeSum самостоятельно. Превью финальной сводки содержит
3 строки; подробный выход — 200 строк. Ошибочные timeout_ms=120000 и
конкурирующий apply были отвергнуты; модель сама продолжила корректно.

Сохранение `/user/scenario-debug-abc-candidate1-20260921.lgp` подтверждено
SUCCEEDED, cleanup=true, save_completed=true, modified=false.
`analytical_correctness: not_checked`; cold reopen не выполнялся и не требуется.
Доказательства: `candidate-1-chat.json`, `candidate-1-metadata.json`,
`candidate-1-prompt.txt`, `candidate-1-final.png` в локальном каталоге журналов.
Это исходный случай, не замена B65 с 13 полями.

B65 запущен через GUI кандидата `.5`, GPT-5.6 Sol / low, чат
`ses_f3bf4fceeffeFbJCn0QjA07n9W`. Профиль `candidate-3-fresh-profile`:
проверка и сохранение подключения через штатную форму успешны. Копия
шифрованного record в прежнем тестовом `candidate-3-profile` не читалась;
этот незапущенный профиль сохранён для диагностики, рабочий профиль не менялся.

## F06: нативная нормализация имён воспроизведена

DEBUG_ONLY `.5`: заданы technical names `Товар` и `Выручка`. Редактор
принял их, но при переходе к output_mapping Loginom 7.4.2 выдал native source
names `Tovar` и `Vyruchka` с прежними русскими labels. Runtime остановился
на `Configured source differs from the native mapping schema` до исполнения.
То есть расширять ASCII-ограничения следующих обработчиков наугад нельзя:
запрошенная техническая идентичность уже не сохраняется самим Loginom.
Журнал: `unicode-live.log`, private evidence `loginom-unicode-import-live-kMFoML`.

Контракт импорта согласован с остальными обработчиками: name — ASCII technical
identifier, source_name — исходная Unicode-метка или наблюдаемое техническое
имя, label — свободная русская подпись. Ошибка возникает до создания/открытия
узла и объясняет исправление; автоматическая транслитерация не добавлялась.
Регрессионный тест сначала упал, затем прошёл после правки; 94 теста импорта
и node API PASS (`unicode-source-tests.log`). Установленная проверка этой
валидации пока pending; исправление не входит в `.5`.

Полный runtime suite после F06: exit 0 (`runtime-tests-4.log`); source
transforms: 5045 PASS; `git diff --check`: PASS.

## Кандидат `.6`: F06 установленная регрессия PASS

Commit `65b0ebf4f`, версия `0.1.7-local.20260921.6`; штатная сборка, статические
DMG/ZIP проверки (4446 ресурсов), offline smoke и codesign PASS.
Артефакты: `/Users/kartamyshev/.cache/loginom-macos-build/scenario-20260921-4`.
Установка: `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.6/Loginom AI Agent.app`.
SHA256 app.asar `2b1701d16344dd649c26981ebecc9f3f73139bfb99d4942e55abf554f177021d`.

DEBUG_ONLY `unicode-rejection-live.log`: невалидное техническое имя вернуло
NOT_APPLIED, effect_possible=false, cleanup=true, без node. Новый исправленный
запрос к тому же доставленному файлу: SUCCEEDED, execution completed,
выход 2 строки, сохранение пакета SUCCEEDED. Русские исходные заголовки и
labels не менялись. Копия receipts/summary: `unicode-rejection-success/`
в локальном каталоге доказательств. Исходный сбой и безопасное исправление
подтверждены живыми наблюдениями, не только тестами.

Результат исходного ABC на `.3` сохраняется для узкого исправления `.6`:
успешные импорты использовали ASCII technical names, новый отказ не меняет
их путь. Остальные изменения `.4/.5` касаются диагностики и ошибочных веток;
они дополнительно проверяются последующими автономными случаями.

## B65: CREATED_EXECUTED

Кандидат `.5`, GPT-5.6 Sol / low, Loginom 7.4.2, чат
`ses_f3bf4fceeffeFbJCn0QjA07n9W`. Входной task.md и исходный CSV с 13 полями
переданы через GUI. Все 5 узлов выполнились: импорт, сортировка, калькулятор,
группировка, итоговый калькулятор KPI. Подробный выход 200 строк, сводка 3 строки.
Сохранён `/user/scenario-debug-B65-candidate5-20260921.lgp`; save_completed и
cleanup подтверждены. Никаких ручных исправлений; неверное timeout_ms модель
исправила сама. `analytical_correctness: not_checked`.
Доказательства `B65-candidate5-{chat,metadata,prompt,final}` в локальном каталоге
(расширения .json/.txt/.png). В metadata сохранены все запросы/узлы/связи и выходы.

B47 запущен на `.5`, чат `ses_f3be80188ffeWXck3xXTGcEQ0i`;
B02 на `.6`, чат `ses_f3beabb1affeTJydQ4bzcVwxc3`. Отдельные профили,
одинаковые provider/model/variant, неизменённые исходные задания.

## F10: сохранение управляющей части при backend truncation

Реальный Truncate service воспроизводит потерю всей длинной JSON-строки
с Unicode-таблицей, включая execution ID. Backend теперь при превышении
лимита оставляет отдельный control summary: status/error/node/execution/next_step
и явный признак data_delivery=omitted_by_backend_size_limit. Полный JSON
записан прежним truncation service без изменений; exact_table не обрезается
и не представляется полным в сокращённом ответе модели. Ошибка остаётся ошибкой.

Регрессии с AMBIGUOUS и SUCCEEDED: проверены сохранение control fields,
отсутствие ложного табличного результата и побайтовое сохранение исходного
ответа. 9 session tests PASS; Agent typecheck PASS. Установленный автономный
случай с превышением лимита ещё не выполнен; это source-level проверка.
Автоматический доступ модели ко всему локальному файлу этим изменением
не добавляется. Compaction и необычно большие control fields остаются
границами отдельного аудита, а не заявляются полностью проверенными.

Повтор macOS source pipeline после F10: 8/8 команд PASS
(`source-checks-3.json`, `source-checks-3.log`). Эти проверки не являются
заявлением об установленной приёмке новой ветки truncation.

## B02 и B47: CREATED_EXECUTED

B02 (`.6`) создал и выполнил 8 узлов, включая transform.date_time.
Наблюдались выходы: импорт/даты 500 строк, категории 5, регионы 4,
категория×регион 20, месячная группировка 17. Пакет
`/user/scenario-debug-B02-candidate6-20260921.lgp` сохранён с подтверждённым
save_completed и cleanup. B47 (`.5`) создал и выполнил 6 узлов;
`/user/scenario-debug-B47-candidate5-20260921.lgp` сохранён аналогично.

Оба прошли без ручных изменений; единственные отклонённые запросы —
timeout_ms сверх 60000, затем модель использовала допустимое ожидание.
Provider/model/variant неизменны; analytical_correctness: not_checked.
Проверяемые receipts, запросы, граф и выходы сохранены в
`B02-candidate6-metadata.json` и `B47-candidate5-metadata.json`, рядом
полные чаты, стартовые задания и финальные снимки клиента.
Неиспользованные filter_data и другие типы этим не засчитываются.

## Кандидат `.7`

Commit `99f65a0e4`, версия `0.1.7-local.20260921.7` включает backend summary F10.
Первая сборка остановилась на cli-source-snapshot без прогресса несколько
минут (журнал `build-5.log`); отдельное чтение 12182 исходных файлов прошло
за 1.13 секунды. Завершены только собственные два build-процесса, результаты
этой попытки не использовались для приёмки. Причина зависания не установлена.

Повтор в `/Users/kartamyshev/.cache/loginom-macos-build/scenario-20260921-5-retry`
прошёл: полный build, static DMG/ZIP 4446 ресурсов и offline smoke PASS.
Установлен из readonly DMG в
`/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260921.7/Loginom AI Agent.app`.
При запуске следующих случаев не переносить на `.7` непроверенные ветки:
ранее зачтённые короткие результаты не входили в изменённую ветку truncation;
новая ветка подтверждена source tests, живая проверка oversized exact-table pending.

Для установленного `.7` codesign PASS; SHA256 app.asar
`dfd2fc7a336b69e13bc7c1b661aed0c0056aa8d477080b5079cd626ab862b2da`.

## B37 завершён; B18 и B27 — новые препятствия

B37: 7 узлов (imports.text, transform.group_data, transform.sorting),
пакет `/user/scenario-debug-B37-candidate6-20260921.lgp` сохранён с
подтверждённым завершением. Модель сама исправила отклонённые конкурентные
запросы, продолжив их последовательно. Доказательства: `B37-candidate6-*`
в приватном каталоге серии; числовая правильность не проверялась.

B18 (`.7`) остановился на импорте: F11 — Enter для подтверждения метки
`category` получил строгое `NOT_APPLIED / preconditions / UI_EPOCH_CHANGED`,
`effect_possible:false`, `cleanup_complete:true`. Исходный редактор и введённое
значение остались наблюдаемыми. Прямой `channel.act` не использовал существующее
ограниченное обновление ссылок через `channel.perform`; configure стал pending,
resume не смог продолжить. Исправление связывает подтверждение с владельцем,
колонкой, типом, исходным и введённым значением; после доказанного отказа до
жеста допустимо новое наблюдение с новой ссылкой. Не разрешает повтор неизвестного
жеста или изменение другого редактора. Узкие проверки: 104 PASS. Установленный
повтор ещё не выполнен.

B27 (`.5`) выполнил несколько ветвей, но следующий узел группировки остановился
на target: `Visible port identity is not rendered`. Последующие inspect/resume
получили timeout, сохранение заблокировано незавершённой операцией. Причина
исследуется; результаты не засчитаны. Чаты: `B18-candidate7-chat.json`,
`B27-candidate5-chat.json`.

Проверки F11: runtime 2275 PASS / 2 SKIP; узкие graph regressions 47 PASS;
macOS source checks 8/8 PASS (`source-checks-4.json`). Диагностика F12 дополнена
наблюдаемыми node/port ID и признаками наличия элемента; проверка графа не ослаблена.
