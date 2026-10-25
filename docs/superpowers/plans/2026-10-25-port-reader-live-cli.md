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

В `/user` наблюдалось 685 файлов: проверка новой загрузки после 27 прокруток
отказала с `DOWNLOAD_CONTEXT_CHANGED` до скачивания. Закрытые jobs не возобновляются.
Для оставшихся управляемых обычных проверок используется существующая собственная
тестовая учётная запись и новый профиль; подключение выбирается только контроллером.
Обычные/диагностические результаты различаются по payload, не по имени учётки.
Модельные и парные сравнения сохраняют исходного пользователя. Новый account, ACL
или глобальная настройка не добавляются; проверка секретов учитывает ключ и пароль.
Переиспользование учётки прошло независимое ревью.

## Checkpoint

- Private artifacts/evidence: /tmp/loginom-port-live-20261025-gxg7qus9/; clean candidate4399/baseline9495 и отдельные diagnostic/diagnostic-fixed verified. Ordinary runtime не менялся; credentials вне git.
- Device OAuth/models refresh и Luna/high, Sol/xhigh compiled smoke PASS. После Xorg09:49:38Z новый mainpatheec4b9dc exact3×4/Save/nativeclose/logout/ACK/window/PIDs PASS; первопричина X-сбоя неизвестна.
- Interrupted densebfbca8db/seedSol92db50d8/multifacts7ab6486c/cartesian10242f6a quarantined с raw/audit; nativecleanup неизвестен. Старые Package1/user sessions не закрывать без точной принадлежности.
- Luna lowliqa3b9fc4e и baselinef888bd65: все35×5/CSV1508bytes одногоhash/cleanup PASS. Candidate647779ms/baseline993830ms — один functional pair, не benchmark. Ранняя1d12ceba exportFAIL сохранена.
- Cold lowliq обеих сборок: Import16fields/source/format/Filter/Sort/Reform/Export PASS; physical order переставляется после activation при autosync=true в обеих сборках, существующее отличие. OwnPendingDisconnect user:7514 адресно закрыта поexactpath; неизвестные сессии не трогали.
- Zscore candidate91376509/baselinec62f14cc: независимые500rows/доставленныеcells/CSV45bytes/cleanup PASS; графы без Join/Filter, coveragegap. Candidate547408ms/baseline867405ms descriptive only. Initialcandidatef5f3setupFAIL сохранён.
- Sliding candidatebe052d9f: initialnativefull+ordinary/updatedordinary6cells/CSV24bytes/cleanup PASS; updatednativefull/cold не проверены. Baselinecfad0d4d prepareFAIL/CALL_UNCERTAIN, guard retained:105s host короче120/125s browser, исходнаяUI-причина неизвестна.
- Multifactscc1setupFAILgeneric; exactknowledgeprobe3bdaf2f9READY/ACK. Multifacts2a17108f MODELFAIL: выдуманныйskillpath/external_directory→permissionreject, nativeprepareсоздалdraft, Save/cleanupнеподтверждены. Не повторятьдоPASS.
- Cartesianf8483eea: analytics/60ordinarycells/CSV50bytes/cleanup PASS; nativefull отказал на Sort ancestry, агент честно сообщил. Stringcounts40b0fed5:35ordinary+28nativefullcells/Int64bytes/CSV83bytes/cleanup PASS; blank отсутствует, cold не проверен.
- CP1251 candidate84fceb3c values15/15/cleanupPASS; metadataDateНепрерывный vsdraftSPECДискретныйFAIL, readerточен. Multiline2618bc62 values15/15/cleanupPASS, такоежеdraftDatekindFAIL. JoinFiltera97945ca остановлен доExecute: Importdelimiter input UI_REFERENCE_OBSCURED, draft discarded/settings unchanged, nativepackagecleanup не доказан.
- Fidelity00d5385a raw45cells PASS; reread послеSave отказал настаромbreadcrumb (код такойжеbaseline). Fidelityfbe5b334 raw45/Int64/realbits/−0/JSONredaction/20kdoubleLF/0,1,100/101доExecute PASS; public0/1из9, MCPmax отдельноdense. ProductCLI0/cleanupPASS; outerproviderGETaux1 исправлен минимальнымPOSTguard,3testsPASS.
- Dense5b62053e raw100×10/public21/44292bytes,next46096/maxprefix21/6negative/cleanupPASS; independent review confirms serializer bytes4399. Actual Import+Calc validators coherent false-read_limit0rows отвергают именно requestedcoverage; Filteractuale4f3d067 позитив+обаcoherent4copyzero-rowfalse-limit отклоненыименноrequestedcoverage;rawunchanged.
- Seeds Luna dcc1bccc и Sol fdf56b52 wrong10rows/Save/cleanupPASS; rendered prepared-task.json для отдельных modelcorrection попыток. Dates5ef5ffe4 two nativeOADate bytes доordinary PASS, cleanupPASS; auxposthocparser save-adviceFAIL исправляется без повторногоCLI.
- Diagnostic4file77linepatch/151focused/actualserialized scope PASS; ownfaultaccount/admincleanupPASS. Earlyd1ef16f7SaveдоidentityFAILED/guard; correctedImport→Save→Filter c6b45eff cache0 expectedfault/restored/allsettled/all7dispose/recovery/normalcleanupPASS.
- Diagnostic-fixed payload verified, operation selector/deadline scope testsPASS; fault-matrix141LOC selfcheck18+72negative+4held+24temporalMissPASS/reviewPASS. c03bd34e12cache/AsString plain/cancel/deadline×ports PASS/allsettled/released_after_proof/normalcleanup/PIDs[]. Disposeотдельнонепроверен. Boundary12 offlinecases+5negativePASS; rows-0ccab6eb0 preuploadWorkspaceChanged; rows-042262697 uploadAMBIGUOUS/downloadEpochChanged(685files/27scroll), обеquarantined; normaldirtyвisolatedаккаунтеlive. ReviewboundedcontinuationPASS; JoinFiltere4f3d067 Import/Filter[1,0]/Join/reread/Save/nativecleanup/PIDs[] PASS. Offline44/7TZ currentdecoderPASS/maxloopbody1. LinearRegression5f1e8a9b иKmeans8a92c705 CLI0/cleanupPASS, independent audit ожидает; RESTf1da5af8 initial200/503/2GET/cleanupPASS;repeatread[1,0]admissionFAIL(RESTreceiptIDsнесовместимыgenericretainedMappingSchemas,sourcebugестьbaseline),independentauditидёт. JSdae2ae05 CLI0/cleanupPASS,auditожидает. FidelityLunalive. Очередь: остальные модели/границы/18faults/датыTZ/dirty/freshness/Variant/cold.
