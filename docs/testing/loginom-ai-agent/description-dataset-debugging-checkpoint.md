# Description + dataset: checkpoint

Обновлено 2026-09-22 (времена ниже UTC). План выполняется; цель не завершена.

## Канонические условия

10 задач в порядке старта D02,D47,D23,D45,D19,D36,D24,D48,D27,D65. Исходные description.md + dataset.csv неизменны, начальный prompt фиксирован, технические подсказки запрещены. GPT-5.6 Sol low, Loginom 7.4.2, Desktop macOS backend v1. На попытку 30 минут, отдельные профиль/чат/пакет. Аналитическая правильность not_checked; помощь человеку пока не потребовалась. Последнее поручение пользователя: пять независимых клиентов для выявления нюансов под нагрузкой (после краткого снижения до трёх). Тяжёлые source checks не совмещать с полной нагрузкой пяти клиентов.

## Установленный кандидат и история

- Baseline `.20260921.10`: 7 PASS / 3 BLOCKED (D45,D48,D65).
- `.11`: целевой D45 BLOCKED, модель задавала короткие технические budgets.
- `.12`: целевые D45/D48/D65 PASS; final12 9 PASS / 1 BLOCKED (D27, первое наблюдение нового native port).
- HEAD `8ab08274c75dc3658d3fc72954cc6ab04dd937be`: безопасная привязка нового порта; предыдущие исправления visible hit point и host-owned budgets сохранены.
- Кандидат 13: `0.1.7-local.20260922.1`, ASAR `12e483b9df3d67010cc34e440e9ff356ddc356f2be790b98a3994db6dc58f480`.
- Установка `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.1/Loginom AI Agent.app`; пользовательская установка не менялась.
- D27-target13 PASS (9 узлов), закрыт.

## Final13

Все 10 уже отправлены; повторно не запускать их в этой серии.

| Задача | Состояние |
| --- | --- |
| D02 | BLOCKED, 4 узла, поздняя маска после Done; D-F05; закрыт |
| D47 | PASS, 6 узлов, закрыт |
| D23 | PASS, 5 узлов, закрыт |
| D45 | PASS, 5 узлов, закрыт |
| D19 | PASS, 7 узлов, закрыт |
| D36 | BLOCKED, 1 узел, маска после Apply выходного поля; D-F06; закрыт |
| D24 | BLOCKED, 0 узлов; модель во всех 8 запросах неверно копировала artifact_id (8f56 вместо 8d56), корректный отказ до мутации; закрыт |
| D48 | PASS, 6 узлов, закрыт |
| D27 | PASS, 9 узлов, закрыт |
| D65 | Активен, отправлен 23:19:12.439 UTC, предел 23:49:12 UTC; исправляет собственную ошибку формулы на том же сохранённом узле по подтверждённой процедуре |

D02/D36 завершились сами, pending сохранён, cleanup=false; Stop не нажимался. D24 завершился сам, все отказы импорта до мутации, cleanup=true. Final13 уже не прошла и не может быть объявлена успешной после исправления исходников.

## Текущая доработка

Незакоммиченные D-F05/D-F06: `workspace-ui.mjs`, `node-procedure.mjs` и тесты. Маска ждётся до исходного deadline узла через private host-only `settlement_timeout_ms`. Повторных жестов нет; чужой владелец/диалог отвергаются, после маски заново проверяется граф/строка и quiet samples. Добавлены trace начала/конца ожидания. Публичный Protocol/HttpApi не менялся. Тесты покрывают маску более минуты и неизменность deadline. Финальный полный runtime прогон с `--test-concurrency=1` идёт в `runtime-tests-14-final.log` (session 96534). Предыдущие промежуточные зелёные прогоны не заменяют проверку текущих байтов.

Первый параллельный full runtime: 1 FAIL наблюдения консоли; отдельный повтор PASS. Первый general source check: 7/8 групп PASS, CLI management превысил 90 секунд. Полный повтор general source checks после финальных runtime tests ещё обязателен. Source attribution проверяет 5045 файлов; обновлять hashes после любых правок, baseHash сохранять.

Два DEBUG_ONLY повтора оригинальных запросов на изолированной копии ресурсов `.22.1` с исправленным ожиданием (до последней доработки quiet reset/trace):
- D02: shell 60869, `replay-mask-d02.log`, каталог `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-0AXFCN`.
- D36: shell 67979, `replay-mask-d36.log`, каталог `/var/folders/d0/pcsq9b9j1pvgy1vd9mp9l61w0000gn/T/loginom-port-replay-5QkKFI`.
Оба ещё работают; закрытие host/child должно быть awaited. Это не installed acceptance и не доказательство live-воспроизведения маски.

## Приватный контроллер

Корень `/Users/kartamyshev/Library/Logs/loginom-description-debugging/20260921-163359` (evidence). Там manifest, все чаты/receipts/profiles; не переносить в Git. `final13-manifest.json`, `controller-checkpoint.json`, `candidate13-install.json`. Не печатать credentials, backend headers, env.

Persistent Node REPL: `ctl` = attempt-controller-v6.mjs, `parallel13`, `slots13` (5 объектов, закрытые остаются), `final13Manifest`, `nextIndex13=10`, `candidate13`, `installed13`, `pw`, `env`, `fs`. Активен только `slots13[2]` = D65. Остальные закрыты. Poll только `slots13.filter(s=>s.backend&&!s.run.desktop_closed)`, `ctl.collectAttempt`; успешное завершение через `ctl.finishAttempt` проверяет source bytes/SHA, execution/fresh outputs, save после графа, modified=false, cleanup и awaited app.close. После изменений сохранять `parallel13.checkpoint(evidence,candidate13,final13Manifest,slots13)`.

Следующие действия: завершить final13 и debug, проверить новый код/attribution/diff, обновить отчёт, закоммитить чистые входы; собрать отдельный кандидат `.20260922.2` (внутренний 14), проверить DMG/ZIP/offline/подпись/ASAR, установить в отдельную папку; выполнить целевые D02/D36 и затем НОВУЮ полную final14 в пять клиентов. Не готовить повторно существующие профили. При новом необходимом исправлении снова сохранить непрошедшую серию и повторить final на следующем кандидате.

Pinned Bun `/Users/kartamyshev/.cache/loginom-macos-build/tools/bun-darwin-aarch64/bun`, Node `/Users/kartamyshev/.cache/loginom-macos-build/tools/node-v24.19.0-darwin-arm64/bin/node`, browsers `/Users/kartamyshev/.cache/loginom-macos-build/browsers`. Build NODE_SOURCE — полный путь к бинарнику, не каталогу. Проверки package-local. Final audit `python3 <evidence>/audit-final.py final13` (исторический максимум 5), затем аналогично новой серии. В финале обновить results/план/бизнес-реестр/canonical Linux checkpoint, закрыть свои приложения, зафиксировать документацию. F03/F07 recovery, точная причина F12, compaction не заявлять без доказательств.

Обновление 23:31 UTC: оба DEBUG_ONLY завершены (exit 0), включая save и awaited host/child close. Полный runtime текущих байтов: 2287 PASS / 2 SKIP / 0 FAIL; source attribution 5045 PASS. Идёт повтор общих macOS source checks: shell 14757, source-checks-14-recheck.{log,json}. D65 всё ещё активен, 4 выполненных узла. До commit/build проверить результат общих проверок и завершить final13.

Обновление 23:34 UTC: final13 завершена 7 PASS / 3 BLOCKED. D65 PASS (5 узлов), все Desktop и DEBUG_ONLY процессы закрыты. Общие source checks повторены успешно: 8/8 групп, включая CLI management. Текущие исходники прошли 2287 runtime tests, 2 SKIP, attribution 5045. Далее commit, build/install `.20260922.2`, целевые D02/D36, новая final14 в пять клиентов. Активных клиентов нет; старые slots13 не использовать для новых задач.

## Текущая остановка первого запуска кандидата 14 (23:41 UTC)

Исправление закоммичено: `5a144cd7c1d8cea269a52be59fa5a1d340d27b3d`. Собран и установлен `0.1.7-local.20260922.2`, ASAR `5a6b4a572eed65a15a0126c093e1854b031f372db688e997cc80f05f22ac9a71`. Build report, DMG/ZIP static (4446 ресурсов), offline smoke, codesign и совпадение установленного ASAR PASS. Каталог сборки `/Users/kartamyshev/.cache/loginom-macos-build/description-20260922-2`; установка `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.2/Loginom AI Agent.app`. Первый вызов сборки отказал до создания каталога из-за неверных имён переменных окружения; исправленный вызов использовал LOGINOM_AI_AGENT_CHANNEL/NODE_SOURCE/BROWSER_SOURCE (полные префиксы LOGINOM_AI_AGENT_).

Целевой D02-target14-a01 подготовлен, но prompt НЕ отправлен. D36-target14 ещё не подготовлен. Первый запуск Electron истёк через 45 секунд и был закрыт самим launcher. Повторный запуск PID 16791 остаётся жив, `appTarget14.windows().length===0`; `firstWindow` истёк. SecurityAgent запущен (PID 16740), но его диалог не прочитан: CUA getApp(com.apple.SecurityAgent) отказал по safety policy. Не обходить отказ через другой UI/CLI драйвер и не писать секреты в журнал/проект. Пользователь разрешил работу без повторных согласований и предоставил секрет для системного диалога; ограничение исходит от инструмента, не от отсутствия пользовательского разрешения.

Node REPL: `candidate14`, `installed14`, `target14Manifest` (один run D02), `targets14=[]`, **appTarget14** (живое ElectronApplication), `pageTarget14` не получен. При продолжении сначала проверить существующий appTarget14/windows, не запускать второй процесс с тем же профилем. Если появилось окно, получить firstWindow, настроить через ctl.configureUI, добавить в targets14, дождаться ready, отправить через ctl.submitUI. Затем создать D36-target14 и после успешных целевых — новую final14 из 10 свежих попыток в пять клиентов. Приватный controller-checkpoint указывает startup_no_window; target14-manifest сохранён. Никакая попытка на новом кандидате пока не засчитана.

Это первое зафиксированное ожидание внешнего системного подтверждения. Цель не завершена. Все исходные/предыдущие/диагностические клиенты закрыты; оставлен только новый тестовый клиент на первом запуске.

Уточнение диагностики: read-only sample собственного PID 16791 подтвердил ожидание SecItemCopyMatching / SecKeychainItemCopyContent / SecurityServer decrypt. Связка ключей — подтверждённая точка блокировки запуска; содержимое системного диалога по-прежнему не прочитано. Требуется ручное подтверждение системного запроса, поскольку CUA отказал в доступе к SecurityAgent. Секрет не записывался в файлы проекта/диагностики.
