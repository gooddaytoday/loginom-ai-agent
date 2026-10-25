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

Test-only scripted provider возвращает 405 для non-POST до разбора JSON. Это устраняет
наблюдавшийся сбой вспомогательного контроллера при GET; POST/SSE сохранён и проверен.
Обычные CLI payload не меняются; точный источник случайного GET не установлен.

## Checkpoint

- Оба чистых CLI payload собраны/проверены из закреплённых выше коммитов; обычный runtime не менялся.
- Private artifacts/evidence: /tmp/loginom-port-live-20261025-gxg7qus9/; user назначен владельцем, credentials вне git.
- Device OAuth завершён; models --refresh дал запрошенные Luna/Sol, обе реально ответили OK через candidate CLI.
- Normal CLI main-path839b2bb7: точные3×4, Save/nativeclose/logout/discardfalse/ACK/exit0/guard/window/process — PASS.
- c8d50e99: старый checker упал до Save; nativeclose Package1 не доказан, профиль quarantined; все user sessions не закрывать.
- eafaa4c9: startup bridge отказал до prepare; следующие pinned catalog/startup probes PASS, первопричина не доказана.
- Luna lowliq1d12ceba: все35×5 значений/схема/порядок/freshness и честность PASS; Export downloadFAIL на12scroll переполненного /user, отказ сохранён.
- Собственная export-папка подтверждена nativeUI (только parent..), logout/browserclose; новая попытка после исправления окружения, старый Export не повторялся.
- Luna lowliqa3b9fc4e: port35×5 + native CSV1508bytes + cleanup PASS; независимое ревью подтверждено.
- Model controller gate проверяет nativeclose/logout/ACK/visible/свои процессы до authcopy; self-check/review PASS; checker отверг0rows с ложным read_limit.
- Cold Import16cols+source/format/Filter<1/topology5nodes4links подтверждены; после nativeactivation сохранённые Sort/Reform выполнены без перенастройки/Save/ExportExecute, обеASCkeys/exclusions/ExportUTF8comma/path сохранены.
- Coldcb9743ce: независимый DataSource.Columns подтвердил физическую перестановку Reform после activation при autosync=true; nativeclose/logout/discardfalse/browserclose PASS. Baselinecolde4c53eda подтвердил ту же перестановку при том же запросе; это существовало до нового reader. Устойчивый explicit order исторически проверялся с autosync=false; непосредственная причина не доказана.
- Cold0d3b21bd cleanupBLOCKED: адресно закрыта одна PendingDisconnect session с exact ownpath; отсутствие/nativeadminlogout/browserclose подтверждены. Старый Package1 не трогали.
- Baseline Luna lowliqf888bd65: все35×5 + nativeCSV1508bytes с тем же hash + cleanup PASS; candidate647779ms/baseline993830ms, один функциональный прогон с одинаковым requested sample_rows=100/strict/port0, не статистическая оценка.
- Первый functional gate принят независимым ревью; cold order PARTIAL не запрещает проверять остальные границы. Zscore setupf5f3dc5c отказал до модели; separate knowledge/browser probes READY/closeACK. Candidate91376509: независимый пересчёт500rows/доставленныеcells/CSV/cleanup PASS547408ms; безJoin/Filter — coveragegap. Baselinec62f14cc: все161доставленнаяcells/CSV/cleanup PASS867405ms, тоже безJoin/Filter. Candidate slidingbe052d9f завершён/cleanuptrue; independentcheck идёт, baselinecfad0d4d запущен.
- Baselinecold31a98fe8: все5типов/16Importfields/source/format/Filter/Sort/Reform/Export независимо сверены; Cancel/nativeclose/logout без discard. Collector71553f13 ошибочно возвращал object в ready; Boolean-предикат исправлен, старый FAIL сохранён.
- Fidelity00d5385a: raw45cells PASS, reread после Save безопасно отказал из-за старого breadcrumb (тот же код вbaseline). Fidelityfbe5b334 доSave: raw45cells/Int64/realbits/−0/JSONredaction/20kdoubleLF/0,1,100 и101доExecute PASS; publicImport0rows/read1001из9, максимумMCP НЕ проверен. ProductCLI0/cleanupPASS; outerproviderGET вызвалauxiliary1, минимальный POSTguard+GET/POSTtests3PASS; источникGET неизвестен.
- Отдельный diagnosticpayload собран с4file77linepatch; manifest/stagedhooks/environment/selfchecks подтверждены. Изолированная faultучётка создана/readbackPASS, adminlogout/refs/window/processPASS; Faultlive/TZlive ещё не запускались.
