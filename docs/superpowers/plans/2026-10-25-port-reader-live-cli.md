# Живая проверка чтения портов через собранный CLI

Утверждено владельцем 25.10.2026. Независимое ревью проведено до исполнения;
обязательные замечания включены. Контракт — [дизайн чтения порта](../specs/2026-10-24-port-output-reading-design.md).

## Результат и ограничения

Локальная функциональная приёмка на logi-test-plan через полный собранный CLI
с видимым Chromium. Настоящие модели проверяют поведение агента; scripted
provider через публичные инструменты той же сборки — точные значения и отказы.
Обычная сборка: 4399b19174; сравнение до перехода на порт: 9495b6965fa2a5a9bb1f4ef2680532c2996ef37e.
Искусственные сбои — отдельная диагностическая сборка с собственной идентичностью.
Не входят официальный eval benchmark, Xephyr, установка продукта, другие ОС,
push, PR и изменения обычного runtime. Локальные задачи не дают полной изоляции
benchmark и не доказывают отсутствие всех возможных ошибок.

## 1. Первый проверяемый путь

1. Собрать обе чистые редакции штатным build-cli.ts --no-archive с закреплёнными
   Bun/Node/Chromium. Проверить манифесты; пользовательскую установку не заменять.
2. Выделенные тестовые учётки/профили/каталоги/пакеты; fault-профиль отдельно.
   Секреты из приватной конфигурации, без их вывода и передачи модели.
3. Проверить stand и реальную авторизацию Luna/Sol; --no-headless и штатным
   window observer подтвердить видимость собственного окна.
4. CSV 3×4 → Import → Calculator → порт → Save → закрытие пакета → logout.
5. Успешный low-liquidity-companies на настоящей Luna — первый модельный результат.
   До него не строить остальную матрицу и fault-обвязку. При внешнем блокере
   работать только над этим путём, затем остановиться с условием возобновления.

Результат: правильные значения, полные ответы и квитанции, подтверждённый cleanup.

## 2. Модельная серия: 21 попытка

Новая сборка: 15 задач openai/gpt-6-luna/high, каждая в новой сессии/пакете:

- low-liquidity-companies — Import, настоящий Filter с двумя выходами, Sort, Export.
- zscore-anomaly-check — Calculator, Grouping, Join, Filter, промежуточные значения.
- crosstable-sliding-source-refresh — источник изменён, тот же узел/порт,
  прежние значения исчезают, новый execution без повторной настройки CrossTable.
- crosstable-multi-facts — типы, агрегаты, порядок.
- crosstable-column-cartesian — отсутствующие комбинации остаются NULL.
- crosstable-string-counts-null — NULL, пустая строка, целые счётчики.
- Draft analytic-csv-types-identifiers — CP1251, кириллица, decimal comma,
  civil datetime, ведущие нули, типы/виды данных.
- Draft analytic-csv-multiline-values — CRLF, кавычки, Unicode, NULL/blank/zero.
- Настоящая Linear Regression, оба выхода, независимая неперерождённая выборка
  с ненулевыми остатками, коэффициенты и предсказания.
- Настоящий k-means, seed и параметры фиксированы, оба выхода, разбиение
  с учётом перестановки номеров, центры/расстояния.
- REST: ответчик доступен серверу Loginom, 200/503, оба выхода, счётчик запросов;
  чтение не повторяет HTTP (явное reexecute учитывать отдельно).
- JavaScript: sample/full, сохранность кода/настроек, две различимые колонки
  и исключённая между ними, проверка физического порядка.
- port-value-fidelity: Int64, real, числовой JSON-текст, NULL, длинный текст.
- port-preview-claims: partial/full refusal; агент проверяет весь результат
  отдельным агрегатом/чтением, не утверждает о непрочитанных строках.
- port-check-and-correct: первый read ошибочного Round(Amount/7,2), исправление
  того же Calculator на Amount/7, свежий read до финального вывода.

CrossTable native full сохранить и дополнить ordinary read; full не заменяет
проверку нового reader. Draft-задачи не называть готовыми evals. Эталоны скрыты
от задания/вложений; проверяющий код вне рабочей папки модели.

Три последние задачи повторить openai/gpt-6-sol/xhigh. На старой сборке Luna/high:
low-liquidity, zscore, sliding-source-refresh. Пары рядом по времени, одинаковые
входы/параметры. Сравнить результат, Table-действия, read/total time и токены;
один повтор не является статистическим замером скорости.
Zscore — 60 минут; остальные — 30. Ошибки сохранять; не повторять до PASS.
Повтор после исправления — отдельная попытка.

## 3. Детерминированные проверки обычной сборки

Существующий scripted provider управляет публичными инструментами CLI;
не вызывать исходный reader вместо поставленного продукта.

- Int64 min/max и 2^53±1 только Text Import CSV; сравнение decimal/BigInt.
- Real: ±0, 1/7, 0.1+0.2, 17 digits, 5e-324, MAX; Object.is с decimal для −0.
- JSON-строки: 9007199254740993, 1e400, −0, малые числа/точные дроби,
  секреты рядом и без них; остальные числовые токены сохраняются.
- Строки: 4999/5000/5001, 16383/16384/16385/20000, emoji, NBSP, CRLF,
  кавычки, реальная конечная …, несколько длинных ячеек в строке, Variant string.
  Для >16384 старый reader не эталон; fixture или независимый полный ValueText.
- ±Infinity, доступные Variant number/bool/Date/unknown, strict true/false:
  limitations/unverified либо refusal без успешного partial. NaN сначала
  независимо подтвердить на сервере; NULL вместо NaN не считать проверкой NaN.
- 0/1/99/100/101 строка; sample_rows 0/1/100, 101 отклоняется; 10000 cells
  и превышение на колонку; 512 KiB −1/exact/+1, первая строка не помещается.
- Реальный MCP 46000 bytes, escaping, плотная −0 выборка; максимальный whole-row
  prefix рассчитывается из фикстуры и реального envelope, не hardcode 23 rows.
- Разные outputs и [1,0], независимые schema/GUID, source refresh, stale operation,
  foreign binding, inactive output.
- Сохранённый чистый пакет: dirty=false непосредственно до/после read и reread.

Даты: 44 случая существующей матрицы, 7 зон, отрицательные OADate, 0–99/9999 годы,
переходы T−1ms/T/T+delta−1ms/T+delta. До decoder независимо подтвердить исходный
native serial/frame. Normal artifact — фактическая зона; диагностическая сборка
передаёт TZ, новый браузер на зону с фиксацией resolved zone. Недоступные точные
серверные случаи пометить непроверенными live; offline доказательства отдельно.

## 4. Минимальная диагностика и оракулы

Повторно использовать CLI transport/provider/window observer, без нового runner,
зависимостей и framework. Обычный runtime не меняется. Полные toolparts брать из
events.jsonl, raw reader outcome — исходный execution journal до публичного
сокращения. Не использовать nodeReceipts, split("\\n\\n")[0] или повторно
нормализованный diagnostics JSON как точный эталон. Длинная контрольная строка
с двойным переводом строки должна подтвердить полноту захвата.

Checker negative controls на копиях: единица Int64, один real, последний символ,
NULL→0, schema reorder, stale execution, уменьшенный sample с ложным read_limit.
Все подмены должны обнаруживаться. Модель проверяется только по реально
доставленному ей ответу, а не по скрытому полному journal.

Отдельный diagnostic artifact, фиксированные точки:
1. Смена собственного cache object после начала read с восстановлением до cleanup.
2. Ошибка одного AsString при уже начатых соседних обращениях; всё settle до dispose.
3. Ошибка после фактического dispose; cleanup false и запрет повторного использования.

Проверить output0 и Filter output1 после успешного output0. На отмеченных стадиях
отмена/исходный deadline с ограниченной задержкой: без autorun, ложного partial
success и cleanup_complete. Логировать только стадии/счётчики/settled/disposed;
proxy, cache cookies, session/auth не передавать в host/отчёт.

Оценка: 2–3 временных controller/checker файла, 300–500 строк; diagnostic patch
3–4 файла, 60–120 строк. Fixture generation вне checkout. Документация — план
и краткий итог; checkpoint ≤20 строк. git diff --stat отдельно для диагностики
и документации; при превышении оценки вдвое пересмотреть конструкцию.

## 5. Приёмка и завершение

PASS: независимые правильные значения/schema или ожидаемый отказ; свежий receipt
до вывода; нет утверждений о невидимых строках; ordinary read без Table/format;
cleanup и исходный контекст подтверждены. Native full/Table-эталоны отдельно.
После Save открыть пакет в новой сессии и проверить сохранённые настройки.
Cold audit сначала штатно активирует сохранённые аналитические узлы для получения
входных схем (без повторного Export), затем собирает полные исходные наблюдения
штатными native readers;
оператор отдельно сверяет значения и смысл отображаемых подписей с настройками
задачи и выполненных операций. Это сохраняет независимость от нового reader.
Нормальное завершение: package_closed=true, logged_out=true, своих Chromium нет.
Потеря транспорта/exit процесса не доказывают cleanup: профиль изолировать,
чистить только установленные ресурсы своей попытки, без чужих пакетов/сеансов.

Итог: модельные результаты, normal deterministic, diagnostic faults и ограничения
раздельно. Сохранять каждую попытку и не заменять неудачи успешным повтором.

После восстановления прерванные прогоны не повторяются автоматически: сначала
короткий последовательный main path, затем новые изолированные попытки. Завершение Xorg
подтверждено журналом ОС; его первопричина не установлена.

Одноразовые контроллеры занимают около 1025 строк, включая 233 строки повторно
использованных transport/cold tools. После проверки объёма оставлены прямые
ветки в одном существующем контроллере; новый runner, зависимости и общая
система телеметрии не добавляются. Верхняя оценка объёма превышена вдвое:
после пересмотра оставлены только две прямые ветки публичного продолжения
(один resume до upload и один same-node Import после отмены черновика),
проверяющий код выбирает ID фактически завершённой операции. Старые неудачные
попытки не заменяются. Отдельный механизм повторов не вводится. Ожидание контроллера не должно обрывать
штатные 600 секунд настройки; оно продлено до 720 секунд, без изменения runtime deadline.

Test-only scripted provider возвращает 405 для non-POST до разбора JSON. Это устраняет
наблюдавшийся сбой вспомогательного контроллера при GET; POST/SSE сохранён и проверен.
Обычные CLI payload не меняются; точный источник случайного GET не установлен.

В диагностике 12 восстанавливаемых сбоев выполняются на одном подготовленном Filter,
с новой операцией чтения и доказанным освобождением после каждого случая. Это убирает
около 48 минут повторной настройки. Отдельный payload `diagnostic-fixed` выбирает
только заранее разрешённый случай по точному ID операции при приватном sentinel;
публичный контракт и обычные payload не меняются. Шесть dispose-сбоев требуют
отдельных CLI-сессий: ожидается подтверждённый отказ release и удержание gate;
успешное освобождение считается ошибкой, native cleanup не объявляется. Изменение прошло независимое
ревью; пропущенная стадия отмены/deadline означает NOT_EXERCISED, а не PASS.

Dirty проверяется существующим idempotent Save: повтор точного ID и параметров
возвращает исходную квитанцию без Save-жеста, а bridge отдельно читает свежий
`IsPackageModified`. Вокруг двух чтений сохраняются три таких снимка и проверяется
отсутствие новых Save. Это доказывает false до и после полного публичного чтения,
а не непрерывную неизменность внутри RPC. Путь и контроллер прошли независимое ревью.

Для wide-cell фикстур сохраняется native вид «Непрерывный» у целых полей:
это убирает 100 ненужных правок UI, не меняя CSV, типы, строки и проверяемые лимиты.

В `/user` наблюдалось 685 файлов: проверка новой загрузки после 27 прокруток
отказала с `DOWNLOAD_CONTEXT_CHANGED` до скачивания. Закрытые jobs не возобновляются.
Для оставшихся управляемых обычных проверок используется существующая собственная
тестовая учётная запись и новый профиль; подключение выбирается только контроллером.
Обычные/диагностические результаты различаются по payload, не по имени учётки.
Модельные и парные сравнения сохраняют исходного пользователя. Новый account, ACL
или глобальная настройка не добавляются; проверка секретов учитывает ключ и пароль.
Переиспользование учётки прошло независимое ревью.

## Checkpoint

- Выполнение продолжается. Подробные проверенные результаты и ограничения: [живой отчёт](../../testing/loginom-ai-agent/port-output-live-2026-10-25.md).
- Private artifacts/evidence: /tmp/loginom-port-live-20261025-gxg7qus9/; frozen ordinary payload verified, runtime/установка не менялись, секреты вне Git.
- После Xorg-сбоя mainpatheec4b9dc exact3×4/Save/nativeclose/logout/ACK/window/PIDs PASS; первопричина Xorg не установлена, interrupted profiles quarantined.
- 18 назначенных model attempts завершены с раздельными PASS/FAIL/gaps; Sol preview d5a9b0af выполняется, две correction-задачи ещё не запускались. Seeds Luna dcc1bccc/Sol fdf56b52 prepared-task.json готовы.
- Lowliq обе версии и zscore обе версии: значения/CSV/cleanup PASS; cold пока только lowliq. REST reread admission несовместим с собственными receipt IDs уже в baseline. Multi-facts model permission FAIL; остальные gaps см. отчёт.
- Fidelity Luna/Sol/controlled PASS; dense5b62053e max whole-row MCP prefix21/44292bytes,next46096/cleanup PASS; Import+Calc+обаFilter actual validators отвергают coherent false-read_limit.
- JoinFiltere4f3d067 [1,0]/Join/reread/Save/cleanup PASS; dirtyab2a5879 false до/после2reads и SaveReplay без новых Save PASS; rows1 0c4e80d1 PASS.
- Rows0 header-only три сбоя доreader; VariantIS c6d3f889 deliveryDISCOVERY_FILE_NOT_FOUND. Каждая попытка сохранена; пустой результат проверяется отдельным Filter без совпадений, не повтором upload доPASS.
- Default Date5ef5ffe4 two native serials→ordinary PASS/cleanupPASS (aux parser failure записан отдельно). Offline44/7TZ+extra9999 PASS; Date46 live controller reviewed/selfchecks PASS, зоны ещё не запущены.
- Diagnostic-fixed c03bd34e12cache/AsString plain/cancel/deadline×ports PASS/allsettled/recovery/cleanup. Dispose0 5b565b1d expectedfault/heldgate, nativecleanupBLOCKED. Dispose1bb8cc22f prepareFAILED; новый eb3a4f66 после адресной own-idle очистки выполняется.
- Own fault account: 9 PendingDisconnect sessions адресно закрыты stockhelper; первый admin helper завершил native close, но Node не поддержал Bun observer (aux failure). Повтор Bun15b2d553 подтвердил0оставшихся/adminlogout/windowclose; исходныеBLOCKED не менялись, shareduser не затронут.
- Оставшаяся controlled очередь: dispose, emptyFilter/10boundaries, VariantRB/DS, Date7TZ/native admission, nonfinite witness, foreign receipt admission, cold settings. Nativeforeignbinding/inactive guard недостижимы детерминированно текущим public API; не засчитывать другие отказы вместо них.
- Private controllers: main-path.ts временно у resume_fault_controller (nonfinite adapter), cold-settings.mjs у diagnose_boundary_interrupt (readonly persisted settings); root review доlive, обычный runtime не менять.
- Завершение: независимые raw audits/21model attempts, раздельный final report и gaps, diff--check/relative links/clean frozen worktrees. Без push/PR/install.
