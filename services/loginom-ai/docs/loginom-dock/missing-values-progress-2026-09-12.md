# Узел 14 — исследование и реализация

Статус: реализован черновой обработчик; идут live QA. Автономная приёмка не выполнена.
Назначение: поток 4, `codex/node-14-missing-values`, база
`0f085c5310c67820f6f6386ae16a7df768c152ca`. Hermes не запускался.

## Допуск окружения

Проверены default shell cwd/PWD и sandbox workspace в постоянном worktree.
Actor Peer из official hook state соответствует этому каталогу; адаптер памяти
отвергает несовпадение с host sandboxCwd, вызовы health/find/read прошли.
OpenViking доступен. Метаданные app read_thread ошибочно показывают `/`;
координатор уведомлён и разрешил продолжение по фактическому окружению.

Source MCP: Node 24.19.0, Playwright 1.63.0-alpha-2026-08-31,
Chromium 153.0.8010.12 (1243), adapter `node-14-source-development`.
Полный manifest, hashes и UI-подтверждения сохранены в приватном
`.dock/stream-preflight.json` (0600). Archive не активирован; отсутствие
всех глобальных hook-процессов не доказано.

Вход passwordless `test-4`, версия Loginom 7.4.2 и `/test-4` подтверждены UI.
Создан `/test-4/Node14-20260912-diagnostic.lgp` с отдельным сценарием.
Окно: 1508×949, viewport 1508×862, `viewport:null`, запуск maximized.
Первичный браузер закрыт после сохранения узла; при открытии в свежей сессии
Loginom сохранил прежнюю серверную блокировку пакета и открыл его readonly.
Для дальнейшего исследования создан отдельный редактируемый черновик;
исходный сохранённый пакет не перезаписывался.

## Первые наблюдения

Реальная палитра содержит `Предобработка>Заполнение_пропусков`.
Мастер: входное сопоставление → `DataRecoveryWizard` → выходное сопоставление
→ завершение. По умолчанию `pedOrderedSample=false`, `pedMaxNullsPercent=50`.
Страница содержит `grdColumnsSettings`, `colName`, `colDataKind`, `colUsage`,
`colMethod`. Методы и обучение ещё требуют проверки на входных данных.

Сверены закреплённые Dock-источники: Help `data/processors/preprocessing/imputation.md`,
`data/workflow/training-processors.md`, E2E
`tests/toreview/acceptance/wizards/preprocessing/data_recovery/dataRecovery_helpers.ts`.
E2E commit общей основы: `2cad5602158fd2e4836d821d644a2b8d92f571a2`.
E2E именует строковую замену «Заменять заданным значением» и использует
`trg_SetNullValue`; это пока источник для live-проверки, а не готовый handler.

Приватный fresh harness `.dock/node14-live.mjs` использует исходники этой ветки,
отдельные session/profile/artifacts, общий `createActionRuntime` и готовые
обработчики 03/05. Pins старого immutable candidate проверены загрузчиком;
совместимость 7.4.2/macOS/Chromium совпала. Это только каталог общей основы,
не candidate приёмки узла 14. Новый candidate потребуется до автономной приёмки.

## Подтверждённые наблюдения и исходники

В отдельном пакете `/test-4/Node14-20260912-source.lgp` импортированы CSV v1/v2.
В local collection `grdColumnsSettings` прочитаны все 5 полей: Index, Name,
DisplayName, DataType, DataKind, Usable, ActionNull, NullStrValue.
Непрерывные real/integer используют среднее `ActionNull=3`; дискретная строка
использует константу `ActionNull=6`. Строка меняется через `trg_SetNullValue`
и диалог «Редактирование значения замены для пропусков».
Id и Untouched явно выключены. Порог 100, ordered=false.
После повторного открытия настройки совпали, включая MISSING.

При первом обычном выполнении заполнение произошло без отдельного обучения.
После диагностической команды «Обучить узел» и последующей смены CSV обычное
выполнение пересчитало Amount: прежнее экранное 3.33 сменилось на 20.
Integer для 1, Null, 2 показал 1, 2, 2. Это предварительное наблюдение:
точность, отрицательные половины, сохранённое обучение и полная матрица ещё
не подтверждены независимым точным чтением.

Сверены также E2E dataRecovery_methods.ts и dataRecovery_misc.ts.
В E2E 5/12 (41.6%) заполняются при пороге 41, не заполняются при 40.
Живая граничная матрица остаётся обязательной.

Добавлены черновые `missing-values-{parameters,context,procedure,node,preflight,readback}.mjs`,
регистрация `preprocessing.data_recovery / impute`, типизированные поля UI,
полное чтение конфигурации и повторное использование общего execution/mapping.
Параметры требуют полного набора обработок, ordered=false и целого порога 0–100.
Строка ограничена 2048 UTF-16 единицами согласно общему UI-контракту.
8/8 focused tests параметров и observer прошли; импорт новых модулей прошёл.
Полный handler ещё не проверен в Loginom и не объявлен готовым.

Старая диагностическая операция reimport-v2 сохранила AMBIGUOUS после устаревших
navigation TID, захваченных сразу после SaveAs. Её успех не заявлялся; identity
guard не отключался. Исходник сменён отдельными наблюдаемыми жестами диагностики.
Пакет сохранён обычной командой, закрыт в Loginom и открыт в свежей сессии;
новая preparation вернула READY и актуальные navigation TID. Старый harness закрыт.
Свежий source harness: `.dock/node14-live-1789245846788`, session
`16b7f957-6fce-404a-9b0b-9ef3503a67f1`, source revision
`8626db6830ba276d4991041ceae371fc7fd3eada60cc5587c1918e823f639c02`.
Это приватная диагностика, не релиз и не автономная приёмка.

## Продолжение

1. Завершить живой прогон изменённого обработчика и исправить его по фактическому UI.
2. Подготовить независимый expected/auditor и выполнить всю матрицу подплана 14,
   recovery, configure-only, save/reopen и отрицательные подмены.
3. Обновить immutable candidate на сервере перед автономной приёмкой по правилам потока.
4. Закоммитить проверенный результат и остановиться перед Hermes на checkpoint
   «готов к автономной приёмке». Сейчас этот checkpoint не достигнут.

## Точка продолжения: недоступность Dock MCP

Первый сохранённый existing-node прогон `node14-preserve-reopen` прошёл source,
workflow, target, input_mapping, open и остановился AMBIGUOUS в configure:
`mapping_render_value` при links presentation условного выходного мастера.
После диагностического переключения rbTable полная native mapping проверилась.
Добавлен явный выбор таблицы в `missing-values-output.mjs`; исправление полного
handler ещё не проверено новым прогоном. Старый AMBIGUOUS не объявлен успешным.

В сессии `16b7...` был разрыв WebSocket Loginom. Штатное восстановление сначала
отказало, затем удалось; UI подтвердил начальную страницу и закрытый пакет.
Состояние последнего сохранения независимо не проверено. Новая сессия
`0da0b541-6f1b-47df-a964-789585ffdc39`, каталог `.dock/node14-live-1789246388382`,
дошла до входа test-4 с прежней проверенной геометрией. Bootstrap каталога дважды
вернул `fetch failed`; штатный `loginom_dock.read` также вернул эту ошибку,
независимый HTTPS-запрос к `https://loginom.duckdns.org/mcp` завершился SSL timeout.
Это Dock knowledge connection, не свидетельство недоступности личной памяти.
Координатор уведомлён. Непроверенный каталог вместо закреплённого не использовался.
После последних source-изменений при продолжении требуется новый harness/pin.

Текущие проверки: 16/16 focused Node tests (parameters/context/procedure/output/
readback/API), 267/267 общих API/contracts/support/workspace UI tests на предыдущем
снимке до последующих локальных уточнений, 2/2 Python auditor tests: положительный
синтетический пример и 11 отрицательных подмен. Это локальные тесты, не live acceptance.
Fixtures с отдельными ожиданиями: `tools/loginom-acceptance/fixtures/missing-values/`.
Auditor: `tools/loginom-acceptance/missing_values_contract.py`; ему требуется
отдельно собранная полная таблица, не sample из node.apply для 12/120 строк.
Интеграция сборщика live evidence, независимый reopen и приёмочный отчёт ещё нужны.

Без коммита, merge/push/release, изменения общего клиента и Hermes.
Готовность к автономной приёмке **не достигнута**. Возобновление: проверить Dock
endpoint, запустить новый собственный harness, выполнить preserve-reopen и затем
полный explicit-policy прогон, доработать по реальному UI и завершить матрицу.

## Возобновление 2026-09-13

Личная OpenViking health и Dock diagnostics прошли; сетевой блокер снят.
Worktree/ветка/HEAD/Node24.19.0 и сохранность status entries перепроверены.
Новая видимая сессия test-4, пакет `/test-4/Node14-20260912-source.lgp`,
актуальные refs, viewport:null и maximized подтверждены.

Исправлен найденный live дефект Table selector: наблюдаемый radio-контрол
`rbTable;DisplayEl` используется через set_checked вместо поиска контейнера.
В свежем harness `.dock/node14-live-1789250671537` (session
`9b227a65-a1e2-453f-8fd1-718f9d3e45d5`, source revision
`f0e3c0a61a8f479d6721092cbacc7c522687145fcafa45fdf58c36cb7110d84c`)
`node14-preserve-20260913` прошёл все фазы. Полный выход 3×5 с точными числами:
Amount 10/20/30, Count 1/2/2, Note alpha/MISSING/text-null,
Untouched 10/Null/20. Прежние AMBIGUOUS остаются диагностическими неуспехами.
Полная матрица и автономная приёмка ещё не выполнены.

Повторный импорт core обнаружил отдельный переходный дефект: после подтверждения
деактивации UI кратко оставался на графе с `locked:true`, затем открывал мастер.
Операция `node14-20260913-core-import` остановилась AMBIGUOUS в open; путь/данные
не меняла. Мастер диагностически отменён с подтверждением, свой пакет сохранён
и закрыт; старый harness закрыт. Успех исходной операции не заявлялся.

В workspace-ui ограниченное повторное наблюдение того же graph context при
изменении locked распространено на begin_wizard/confirm_wizard_deactivation.
Прочие идентификаторы должны совпадать; максимум два повтора. Тесты подтверждают
успешный переход, отказ при чужом node_id и ограничение при бесконечном переходе.
277/277 workspace-ui и missing-values tests прошли на этом коде.
Свежий harness `.dock/node14-live-1789251375999`, session
`112994f4-a61c-4d16-95fc-a647694a5be2`, source revision
`196ef7c8c45eacc77442f0c3512d2b8cac7b396fb87a8acd895381766705f5d1`;
геометрия maximized/viewport:null подтверждена. Продолжается live-матрица.

Explicit core2 импорт на pin 196ef7c8 прошёл полностью: прежний deactivation race
не повторился. Следующий impute остановился AMBIGUOUS в configure: role-less
`trg_SetNullValue` не попадал в typed UI inventory. Прямая диагностика подтвердила
кнопку и вторую особенность: открытие constant prompt завершает cell editing,
сохраняя cached method context. Диалог отменён, мастер отменён с подтверждением;
пакет сохранён/закрыт, исходная неуспешная операция не переигрывалась.

Добавлена привязка constant trigger к активному редактору/реальному cached record;
после открытия prompt сверяется сохранённый method context того же поля.
После prompt не выполняется лишний Tab по закрытой ячейке. Тесты проверили
чужой record/grid, неактивный редактор, другой метод/поле, подмену владельца
диалога и пустую константу. 279/279 общих/focused tests плюс 5/5 procedure tests
с последним дополнительным сценарием прошли; git diff --check прошёл.

Свежий harness `.dock/node14-live-1789251869149`, session
`8fb4a7cd-6575-4376-ab53-562b331cfdbd`, source revision
`440239e7c2d2bc6a4de9aa93f8e2787443a70e656b12899396488be339b4d757`.
Сохранённый источник теперь core2 (4 строки); строковая константа до новой
проверки остаётся MISSING. Ни readiness, ни полный live audit пока не заявлены.

На pin 440239e7 trigger открыл constant prompt, но общий драйвер ещё отклонял
этот portal. Допуск добавлен по точному заголовку, трём контролам одного диалога,
проверенному native context выбранного строкового constant-поля. MessageBox не
имеет корневого data-tid: используется его наблюдённый ref; принадлежность
контролов находится в signature.dialog_ref. Чтение native missing-values теперь
происходит до проверки допуска, как у другого поддержанного modal editor.
Read-only диагностика текущего реального окна новым кодом прошла. 63/63
node-procedure + missing-values-procedure tests прошли, включая отрицательные
подмены заголовка/поля/метода/контрола/signature. Старый мастер штатно отменён,
пакет сохранён/закрыт, harness закрыт; неуспех не переименован в успех.

Следующий свежий harness `.dock/node14-live-1789252182267`, session
`af08cb98-dd21-4129-9778-3c69e6fc71ac`, source revision
`8c2ed16ce4ac17f74673cb63ae0371fc4ec331775870ebf3e3e24ff0dfbcc833`.
Проверка изменения константы продолжается. В успешном core2 import независимо
прочитаны исходные 4×5: Note alpha/Null/empty/text-null, Amount 2.5/Null/7.5/Null;
исходные пустые строки не превратились в Null.

На pin 8c2ed16c explicit constant полностью прошёл: core Amount 2.5/5/7.5/5,
Count 1/2/2/2, Note alpha/ЗАПОЛНЕНО/empty/text-null, Untouched 0/Null/10/20.
Независимое повторное чтение всей таблицы 4×5 совпало с отдельным expected,
число Null по полям [0,0,0,0,1]. Затем empty constant при пороге 25 прошёл:
Amount и Count сохранили по два Null, Note заполнился пустой строкой;
отдельное полное чтение подтвердило [0,2,2,0,1].

Precision CSV импортирован/исполнен через полный handler. Среднее Float
1.055555550555555 прочитано с 17 значащими цифрами; Integer -1.5 дал -2.
Это закреплено в expected.json перед повторным запуском. Первое независимое
полное чтение прошло audit_missing_values_run.py со source_verified:true;
повторный node.apply также SUCCEEDED с теми же значениями, его отдельное чтение
и аудит ещё выполняются. Python contract tests прошли: положительный synthetic
case и 13 отрицательных подмен, включая другой source owner/path.

Новый CLI audit_missing_values_run.py связывает объявленный CSV digest,
server-verified upload, наблюдённые source/format/schema импорта, его исполнение,
запрос узла и независимую полную таблицу. Reopen/persistence по-прежнему отдельный
обязательный этап, не выводится из этих результатов. Ещё нужны граничные случаи,
all-null/empty, new-node, recovery/configure-only и окончательное save/reopen.

Precision-repeat прошёл отдельный полный audit со source_verified:true.
New-node запрос остановился до создания: общий Preview schema не содержит
DataKind (проверено в реальном FColumnInfosStore — только Name/DisplayName/DataType).
Это неполнота preflight, а не несовместимый реальный Amount. Выходной мастер
источника DataSetOutputSocketWizard показал настоящие DataKind 1/2.

В исходном openPort обнаружен hover race: locator trial вызывает перекрывающую
SVG-копию порта. Изменён только первый right-click: нативная привязка порта,
реальная видимая точка и затем строгая проверка владельца контекстного меню.
Чужое перекрытие отклоняется до жеста. 17/17 port-open tests прошли. Прямая
диагностика новым кодом успешно открыла нужный порт и подтвердила его GUID.
Сессия Loginom затем оборвалась; штатное восстановление прошло. Мастер отменён
с подтверждением, источник снова показывал активный выход, параметры не менялись.

Добавлены DataSetOutputSocketWizard в общие наблюдатели mapping и отмена
отдельного output-port wizard по его точной квитанции. New-node preflight
missing values теперь читает тип/вид из этого мастера, отменяет draft и проверяет
восстановление активности источника до создания target. Пока не live-verified.
45/45 mapping/port-open/wizard-close tests прошли; broad затронутые suites запущены.
Свой пакет с precision сохранён и закрыт. После последних runtime правок нужен
свежий harness/pin, preserve existing для активного источника и new-node повтор.
Готовность к автономной приёмке по-прежнему не достигнута.

383/383 затронутых Node tests прошли на новой source-kind реализации.
Свежий harness `.dock/node14-live-1789253968904`, session
`b985d6f7-0d5f-491c-bbed-6eaf1f5f25f4`, source revision
`044ca48ccddbdef54c3600d4ba782484ab9f8b75c0d1dfa5f2800f8a1bf9cb0a`.
Maximized/viewport:null подтверждены, собственный test-4 package открыт.
Preserve existing прошёл с precision данными; новый узел проверяется запросом
`node14-20260913-new2`. Прежний `new` был NOT_APPLIED до создания, не переигрывался.

`new2` остановился AMBIGUOUS на подтверждении отмены source output-port wizard:
реальный breadcrumb использует `bg-vendor-icon-datasetoutputsocketdef`, которого
не было в whitelist output_data_icon. Target ещё не создавался. Диалог отмены
подтверждён отдельно после проверки вопроса, источник восстановлен, свой пакет
сохранён/закрыт. Добавлен наблюдённый icon; 3/3 точечных теста прошли.

Свежая сессия `.dock/node14-live-1789254535902`,
`85b46bc9-a972-46b8-b5d3-1ac4a635ee6d`, pin
`465fb90324712072010990f7d3cb9ecb61558865f8b569c382976c13c6b50cbd`.
Maximized/viewport:null и test-4 подтверждены; preserve существующего узла
SUCCEEDED с precision таблицей (execution `1789254560426-zjjrudxcgnd:181:1`).
Новый запрос `node14-20260913-new3` выполняется; готовность ещё не заявляется.

`new3` подтвердил отмену мастера и тот же GUID порта, но остановился до target:
активный выход после отмены стал неактивным. Это подтверждено DOM SVG
`output_table_inactive.svg`; прежнее предположение о восстановлении активности
неверно. Preflight теперь допускает исходно неактивный порт, фиксирует before/after
и подтверждает только отмену настроек/владельца. Не запускает источник скрыто.
Отказ по несовместимой схеме после открытия мастера возвращает FAILED с возможным
эффектом, неизменными настройками и завершённой очисткой (как существующий reform
preflight), а не ложный NOT_APPLIED без эффектов. 50/50 node-apply tests прошли,
включая чистый отказ и сохранение неопределённости при неполной квитанции.

Свежий harness `.dock/node14-live-1789254818664`, session
`e2b18f9d-e8d5-4381-bade-531f28f33a8b`, pin
`343624e094bcfee51cc2744058b331b310f989dbc5da1b2efe35e26b538d4cd6`.
Свой test-4 пакет открыт с проверенными viewport:null/maximized. Запрос new4
проверяется без предварительного выполнения источника.

`new4` завершил source preflight: полные типы/виды верны, настройки отменены,
тот же порт, inactive→inactive. До создания target получен NOT_APPLIED: общий
adapter ошибочно искал новый preprocessing компонент в «Трансформация».
Реальный enabled DOM находится в «Предобработка», совпадает с inventory.
Добавлена palette_group в локальные карточки и использована в проверке/drag.
Unit tests проверяют три группы и отказ disabled-компонента. Executor сохраняет
неопределённость, если более ранний preflight изменил активность, а позже target
отказал: такой случай не может стать effect_possible:false. Тест этого отказа
прошёл.

Текущий fresh harness `.dock/node14-live-1789255043530`, session
`217c5b57-0e61-4146-928c-1c303e207920`, pin
`404d331c7ada6ea9eafb868c97e7812ff59946aac4fc80a3b880e25235b6efd8`.
Независимый полный UI collector перенесён из приватного скрипта в
`tools/loginom-acceptance/collect_missing_values_table.mjs` для воспроизводимости
review; wrapper остался в .dock. Синтаксис проверен; новое полное чтение впереди.

`new5` нашёл правильную группу, но drag остановился NOT_APPLIED до эффекта:
строка палитры имеет y=1016.5 при innerHeight=862. Ненулевая DOM-ширина
не доказывает доступность точки. Добавлен штатный scrollIntoViewIfNeeded exact
строки после допуска компонента и проверка реального hit-test перед drag.
4/4 palette tests прошли; полный набор затронутых suites запущен заново.
Свой пакет сохранён/закрыт без созданного target. Следующий запрос new6 использует
свежий harness после изменения runtime.

На pin `2527be50b085f353eb4619b7764b5762e857f593abc426f32a8deca3b369013b`
(harness `.dock/node14-live-1789255218897`, session
`339d6bf9-7789-4d0e-a216-64102f7b1653`) new6 создал/подключил target
`ba871909-932a-426e-bf96-b51b6217d701`, затем остановился AMBIGUOUS/configure:
после выбора среднего combo.value=3, но record.ActionNull ещё 4 (медиана).
Нативный список подтвердил enum3=среднее, enum4=медиана. Диагностический Tab
завершил редактор и позднее обновил record в 3. До закрытия редактора проверять
сохранённый метод было ошибкой. Procedure теперь коммитит изменённый метод и
ожидает его в store; при новой constant снова открывает только ячейку для prompt.
6/6 procedure tests прошли. 506/506 expanded Node tests прошли до этой последней
правки; повторный targeted тест покрывает отложенный commit нового mean.

Loginom оборвал WebSocket во время диагностики; стандартное восстановление
подтверждено. Draft new6 отменён с подтверждением. Сам созданный/подключённый узел
сохранится как диагностическое незавершённое evidence; его успех не заявляется.
Следующий полный new запрос new7 использует отдельные имя/позицию и свежий pin.

MEMORY_ACCESS_CHECK по отдельному разрешению координатора выполнен: scoped
find/read общей записи fourth_stream_added.md прошли; штатный offline doctor
подтвердил workspace-derived Peer
`-Users-kartamyshev-Git-loginom-dock--worktrees-node-14-missing-values`.
Ошибочно набранный actor URI с точкой в -.worktrees был отклонён; область не
расширялась. Настройки/записи памяти не менялись. Однократный отчёт координатору
отправлен; это не завершение этапа разработки.

Следующий fresh harness `.dock/node14-live-1789255759035`, session
`9d5b7a95-1d07-4f95-ab56-b12682f2c565`, pin
`4d216be2c5ca9119d6e1643a5dc8e51ea2598dfd35067c9de1c4f6685688f714`.
New7 создал/подключил `31072ad6-909e-4099-be52-d5a1401c2616`, но Tab не завершил
редактор за 15 секунд. Исправление только ожиданием оказалось недостаточным.
Прямой Enter на принадлежащем Amount редакторе закрыл его, record.ActionNull=3
подтвердил среднее. Procedure переведён на Enter для method commit (threshold
по-прежнему обычный Tab). 6/6 targeted tests прошли. New7 draft отменён с
подтверждением; созданный узел остаётся диагностическим частичным результатом.

Подготовлен отдельный skew.csv/expected: 0,0,9,Null → 3, чтобы среднее отличалось
от медианы и выбранные поля содержали реальные нули. Полный live-прогон впереди.

New8 полный PASS на harness `.dock/node14-live-1789256039749`, session
`4a859f38-aba7-4b8a-9a38-2097008eee2b`, pin
`81716075174eedbb137b19b1ed893dcb0dd0a16186779e4ca4019fad557d7c07`.
Создан/подключён target `65e2fa00-1daf-40d2-a061-ed6fb753bef5`; настройка, выполнение
`1789256068300-o4rso30lpn:206:1`, штатный sample и независимое полное чтение 3×5
прошли. Отдельное сравнение подтвердило precision mean/Integer -2/NEW_NODE/Null.
Источник был сохранённым precision предыдущей диагностики: новый source_verified
audit этим не заявлен. Повтор new8 вернул буквально тот же outcome; счётчик
подготовленных действий остался 108→108, нового узла/запуска нет.

Полный клиентский набор: 1416 tests, 1406 PASS, 9 отказов среды, 1 SKIP. Все
9 отказов связаны с sandbox local socket EPERM (archive/clipboard/shutdown);
повтор четырёх затронутых файлов с доступом к изолированным локальным сокетам
прошёл 14/14. Продуктовых падений в этом наборе не осталось.

Skew CSV импортирован и исходный Missing Values выполнен, execution
`1789256068300-o4rso30lpn:206:6`; read остановился AMBIGUOUS после open_node_views.
Квитанция содержит ровно один click, 80 surface_pending samples за 4.24s; затем
реальный UI показал нужные Visualizers. Inspect сохранил pending/read, повторных
жестов/запуска не делал. В общий bounded wait добавлен запас до 200 samples при
неизменном общем deadline 15s; foreign identity не допускается в это ожидание.
Targeted lifecycle test с 90 pending reads и существующими отказами прошёл.
К исходному графу вернулись по точной навигации; далее свежая сессия/skew2.

Локальный candidate каталог синхронизирован: node.add revision4, selector
component.preprocessing.data_recovery, версия 2026.09.13-node14.1-candidate.
Provenance bg/selectors.ts:470–474 проверен на закреплённом 2cad560...; stable
coverage ID component.preprocessing.DataRecovery явно связан в плане с runtime
preprocessing.data_recovery/impute. 21/21 catalog tests прошли. Каталог не
публиковался, production/current и shared client не менялись; live harness всё
ещё использовал прежний изолированно закреплённый base candidate.

Fresh harness `.dock/node14-live-1789256602857`, session
`ddec01dd-2572-4121-8c7b-6c32001bca5e`, pin
`c88556f8a07214f16bc29f74a4e154779c75f88d34baab925c70efa9c34d57b3`.
Skew2 полный 4×5 и независимый audit PASS/source_verified:true: среднее3,
нули, пустая строка/текст null, строковая константа SKEW подтверждены.
Boundary-40 полный 12×5 и audit PASS/source_verified:true: пять Null остались
в каждом выбранном поле. Boundary-41 выполнился, но read остановился до add-click:
ViewerAddCard частично ниже окна (y801,h144 при innerHeight862). Observer нашёл
видимую точку y831.5, а действие ошибочно проверяло центр карточки y873.

Для native viewer_card теперь используется свежая наблюдённая точка с повторным
hit-test. Для полностью скрытых add/enter карточек разрешён scroll по видимой
карточке того же точного порта/панели, с проверкой продвижения scrollTop.
Добавлены тесты частичного обрезания, прокрутки add+enter, чужой панели/порта
и непродвигающейся прокрутки; targeted suites прошли. Source runtime изменился,
поэтому следующие boundary2-41/42 выполняются в свежей сессии. Ранее read41
не переигрывался вслепую; возвращён собственный сценарий.

Координатор принял зависимость каталога /test-4 и отдельно назначит серверную
подготовку. Публикация/сборка/установка сейчас не разрешены. Точный локальный
состав и требуемый root отражены в missing-values-candidate-request-2026-09-13.md;
повторный запрос этого же блокера не отправляется.

Fresh harness `.dock/node14-live-1789257444202`, session
`856b06cb-f116-42ad-9190-71eeb945accb`, pin
`0d087883e7b775b1bd1a0bc1eb3c2af26e33a0baece968f043d1dc7143ad1d73`.
Boundary2-41 и boundary2-42: оба независимых аудита PASS, source_verified:true,
полные 12×5. Пять Null заполнились при обоих порогах; с ранее проверенным
порогом40 это подтверждает наблюдённую границу данной версии. Исправление
точки карточки/прокрутки прошло реальные открытия новых Table; сохранение
этими аудитами не подтверждается. Текущие профильные JS tests: 295/295 PASS,
Python contract: 2/2 PASS (включая отрицательные подмены). Большой набор120,
all-null и оставшаяся lifecycle/persistence матрица ещё проверяются.

Large1: import и Missing Values завершились, стандартный sample корректен;
полный аудит не завершён. Независимый reader остановился на row30 из-за гонки
wheel/read: повторное UI-чтение подтвердило строку31 без нового выполнения.
Reader теперь повторно наблюдает уже видимую строку без повторного wheel и
сохраняет checkpoint форматирования перед полным обходом. Первый failed Table
остался отдельным диагностическим визуализатором с точным форматом; восстановление
его исходного формата не подтверждено. Повтор full-read с новым diagnostic ID
остановился при создании 23-й Table из-за scan budget, не из-за данных: скрытые
BrowseView содержали 5990 элементов плюс global guards. Реальный UI подтвердил
точные BrowseView roots с x-hidden-offsets и y=-9929. Scoped scanner пропускает
внутренности таких неактивных Table, сохраняя общий лимит6000. Targeted тест
30 скрытых таблиц/6600 cached controls прошёл. Пакет сохранён и закрыт; следующий
large2 — в fresh source harness. All-null ещё не запускался.
Auditor дополнительно проверяет тип/вид/метки processing и полной схемы;
15 отрицательных подмен отклонены. Повтор boundary2-41 с усиленным auditor PASS.

Fresh harness `.dock/node14-live-1789258530114`, session
`1ed97093-9ab4-447c-aaee-86155ffedac5`, pin
`7113e52f0261705955cd8e8042f4166649697bbc969cf646fb6842158079628a`.
Large2 прошёл import/execute/sample и создание 25-й Table без scan-limit;
полный reader дошёл до row65, где реальные ячейки имели суффикс96 при
data-recordindex65 и том же native recordid2458. Исправлен общий
node-table-context: после строгой привязки record/row/view ячейка выбирается
по точному header prefix и единственному native test-id внутри этой строки,
а не по предполагаемому номеру в suffix. Cache/DOM value, тип и видимость
по-прежнему проверяются. 37/37 table-context tests прошли, включая recycled
суффиксы, чужую строку, дубли и несовпадение cache/DOM. Предыдущий scanner/output
набор277/277 PASS. Large2 checkpoint позволил восстановить исходный формат
полной таблицы и подтвердить возврат в граф без повторного исполнения.
Полный120 аудит ещё не завершён; следующий large3 требует fresh runtime.

Harness `.dock/node14-live-1789258970325`, session
`ed843f44-ff5d-4b40-b001-d7a369562d79`, pin
`f5f4d6ac2c71c63ee2e8aa1b4b1fd87e69f9b4dc1fc10b20659e529c66709b15`.
Large3 диагностически пробовал import execute без чтения source sample. Импорт
завершился, но следующий MissingValues begin_wizard исчерпал bounded surface
wait и остановился AMBIGUOUS/open. Позднее прямое наблюдение увидело свой мастер,
а readPreparedNodeContext подтвердил тот же node/document/workflow. Конфигурация
не применялась, повторного begin не было. Черновик отменён/подтверждён; пакет
сохранён/закрыт, remote/browser завершены. Это ограничение ожидания зафиксировано,
не замаскировано успехом. Diagnostic import возвращён к прежнему source sample;
следующий large4 в новой сессии, общий deadline не расширялся.

Harness `.dock/node14-live-1789259227193`, session
`d01336df-1759-4bdb-8bc5-90da8922a3f3`, тот же pin f5f4d6...
Large4 прошёл import/execute/sample и полный обход до row93. Реальный UI
показал одинаковый test-id suffix124 в строках93 и100 с разными native record
identities. Общий reader теперь требует единственность ячейки внутри строго
связанной native row, не глобальную уникальность recycled test-id; привязки
recordid/data-recordindex/data-boundview и cache/DOM сохраняются. 38/38 tests
прошли, включая одинаковые test-id в разных строках, дубли в одной строке
и подмену native record. Large4 формат восстановлен и возврат в граф подтверждён.
До этой последней правки полный client suite: 1420 tests, 1419 PASS, 1 SKIP,
0 failures (с разрешёнными изолированными local sockets). Следующий large5
с новым runtime должен завершить полный120 аудит. Python auditor: 18 отрицательных
подмен отклонены; добавлены type/kind/label проверки, отдельный graph collector
и fixture reordered с одинаковыми Amount/Note labels (live ещё не запускался).

Текущий fresh harness `.dock/node14-live-1789259644441`, session
`a3702bab-7698-43db-a3e2-f40b428ef4f3`, pin
`71ad8762badfc799c4f6939f2bbe4e94a00ae3a7c9d87cfb47c118282b889054`.
Large5 полный reader прочитал все120 native row indices0–119. На момент этой
записи завершается восстановление формата/аудит; PASS ещё не заявлен.
Остальные подготовленные прямые этапы: all-null5 в текущей серии,
empty1/omitted1 (`.dock/node14-empty-and-omitted.mjs`), done/close/preserve
(`node14-lifecycle.mjs`), reordered1 с graph audit (`node14-reordered.mjs`),
new9 с полным source+graph audit (`node14-new9.mjs`), live preflight negatives
(`node14-preflight-negatives.mjs`), controlled lost reply (`node14-lost-reply.mjs`).
Эти подготовленные scripts не являются пройденными проверками. Lost-reply
заменяет ctx.runtime на отдельный runtime с одной потерей ответа после реального
finish; после pending нельзя возвращаться к старому runtime для новых операций.

Large5 независимый audit **PASS/source_verified:true**, полный120×5,
порог0%, один Null в каждом выбранном поле заполнился (Amount10/Count2/NoteZERO).
Остальные119 строк сохранены. Формат восстановлен, возврат в граф подтверждён.
Это вместе с boundary40/41/42 фиксирует проверенную семантику долей1/120 и5/12;
сохранение пакета данным аудитом не заявляется. All-null5 выполняется далее.

All-null5 **PASS/source_verified:true**, полный3×5. При100% полностью пустые
Amount, Count и Note остались Null, включая Note с заданной строкой ALL_NULL;
необрабатываемый Untouched также Null. Expected был зафиксирован до запуска
по ограничению Help и подтверждён реальным UI/независимым аудитом.
Далее выполняются empty1 и omitted1.

## Продолжение после перезапуска и переноса памяти 20260913.3

Команда node14-development-resume-shared-memory-20260913.3 получена один раз.
Зарегистрированный OpenViking health healthy; find limit2/read_contentfalse
и точный read fourth_stream_added.md в общем main root с actor успешны.
Разовый отчёт координатору отправлен. Настройки/курсор/scope не менялись;
проектные знания сохраняет официальный capture/extraction, не remember.

Прежний PTY81474 недоступен, процессов harness/браузера старого профиля нет.
Проверены новый сеанс и затем сохранённый собственный browser-profile
a3702bab...: оба пришли на начало, старый профиль потребовал login test-4;
восстановления прежнего открытого пакета/таблицы нет. Omitted1 public SUCCEEDED,
execution1789259688635-6oz7r6r2o2i:216:18, cleanuptrue сохранён; независимый
full-read оборвался после step19 при остановке приложения. Завершённый full
audит omitted1 не заявляется. Потеря серверного/UI сеанса — конкретная причина
нового omitted2 из сохранённого пакета; прежний operation ID не переигрывается.
Empty1 full audit PASS подтверждён на диске. Текущий клиентский набор1420 PASS,
1 SKIP, 0 FAIL. Продолжение: harness .dock/node14-live-1789261570730,
session5ee7a2cb-1565-4721-b4e2-a326e99aea72, runtime71ad8762...; использует
тот же собственный старый browser-profile после проверки отсутствия процессов.

Omitted2 остановлен на download verification: дочерний браузерный MCP завершился,
Not connected; сам harness остался жив. Import/node.apply не запускались,
неподтверждённая загрузка не принята и не использована. Свежий обычный профиль
с обезличенным stderr/connection журналом прошёл omitted3 без повторного разрыва.
Harness `.dock/node14-live-1789261946921`, session
`a811a8ee-db1a-4134-afdd-5a9e6bf7e40f`, runtime71ad8762...
**Omitted3 PASS/source_verified:true**, полный3×5: только Note заполнен ONLY_NOTE,
Amount/Count Null сохранены, Untouched Null сохранён, precision исходных чисел
и типы/виды/метки подтверждены. Начата последовательная lifecycle/reordered/new9/
negative-preflight серия; подготовленные scripts пока не означают PASS этих этапов.

Lifecycle в текущем сеансе PASS: done применил настройки без выполнения,
close отменил черновик без выполнения, повторные вызовы не добавили действий
(266→266 и284→284). Preserve{} выполнил сохранённую DONE_VALUE policy;
полный3×5/source_verified audit PASS, отменённая DISCARDED не применилась.

Reordered1 audit отклонил данные (graph_verified:true, source_verified:false).
UI readback существующего text-import сохранил старый порядок определений
Id/Amount/Count/Note/Untouched при новом порядке CSV; перестановка columns
в запросе не означает перестановку определений существующего импорта.
Фактические значения также не соответствовали fixture. Это не PASS Node14
и не основание менять expected под ошибочный источник. Подготовлен отдельный
новый импорт f6b59238-84e2-4e59-9a8f-c865e89d3893 из той же проверенной загрузки;
его live readback подтвердил Note/Untouched/Count/Id/Amount и метки Same у
Note/Amount. Далее new9 проверяет этот источник. Старые диагностические узлы
и evidence сохранены; обработчик импорта вне Node14 не изменён.

New9 **PASS/source_verified:true/graph_verified:true**, полный3×5 reordered:
новый узел добавлен и соединён с отдельным импортом, методы привязаны по именам
при одинаковой метке Same. Повтор operation ID не добавил действий958→958.
Семь подмен скопированных live evidence (среднее, метка узла, связь, SHA источника,
GUID источника, порядок исходных колонок, метод) отклонены независимым CLI.
Отчёты new9-summary.json и new9-negative-audits.json в текущем harness-dir.

Negative-preflight: Id/mean (дискретное число) и ForeignField отклонены FAILED,
cleanup_complete:true; множество7 native GUID графа неизменно. effect_possible:true
честно отражает возможную деактивацию источника при чтении порта; target не создан.

Отдельный inspector сохранённых настроек откалиброван на live UI: прежде открытия
нужно выделить точный source node; первый timeout был без мутаций. Второй заход
прочитал все5 определений, source/format и отменил черновик с active:false.
UI хранит локализованные названия разделителей; reopen-auditor сверяет именно их
с заранее известными fixture-настройками. Это пока калибровка, не persistence PASS.

Реальная ошибка выполнения: собственный CSV временно переименован в
`/test-4/node14-20260913-reordered1.csv.node14-held` через файловое хранилище.
Новый Missing existing/preserve{} запустил группу226:19; UI показал
«Файл /test-4/node14-20260913-reordered1.csv не найден». Public outcome
AMBIGUOUS/pending execute/cleanupfalse/outputnot_refreshed (успех не выдан).
Readonly inspection той же native группы подтвердил terminal failed;
файл восстановлен под исходным именем, отсутствие held подтверждено в UI,
панель процессов закрыта вручную. Evidence execution-failure-result.json,
execution-failure-inspected.json, restore-file.json. Штатная квитанция не
умеет автоматически завершать этот общий отказ как FAILED/cleanuptrue;
это ограничение существующего общего execution lifecycle, не PASS recovery.
Новый node.apply в этом pending runtime не запускается; собственный пакет
сохраняется/закрывается перед отдельным новым сеансом проверки сохранения.

Исходный package остался read-only после прежнего разрыва сеанса. Команда Save
не применялась при несовпадении заголовка; вместо неё штатный Save As сохранил
отдельный `/test-4/Node14-20260913-final.lgp`. Диалог test-4, новое имя и заголовок
пакета проверены; исходный файл не перезаписан. Свой новый package закрыт, прежний
harness завершён. Сохранение не приравнивается к native package.save_checkpoint.

Свежий harness `.dock/node14-live-1789263912227`, session
`f28cfabe-8bb7-4bc5-888a-121a272e8458`, runtime71ad8762..., viewportnull1508×862.
Копия открыта с новым document1789263948645-kxbdqu6izx8,7 native GUID сохранены.
Initial independent inspect остановился без мутаций на workflow_unbound:
в новом preparation нужен readonly graph-adapter.observe для привязки cached
workflow, прежде чем пользоваться prepared source inspector. Добавлено в
инструмент аудита; handler/runtime не менялись. Reopen2 проверяется далее.

Reopen2 **PASS/persistence_verified:true**: сохранённые настройки источника и
Missing прочитаны без переписывания, source inactive→active при выполнении
target как зависимости, новый document/execution, прежние GUID/связь, полный3×5
NEW_NODE/negative precision подтверждены. Использован manual-save-as.json для
точного перехода original path→final copy. Байты источника повторно не скачивались;
source_integrity_scope:prior_verified_upload, source_bytes_reverified:false.
Восемь дополнительных подмен реальных reopened evidence отклонены.

Первая fault-инъекция lost-reply не сработала: результат ui.act находится внутри
node.apply.transport.output.value. Обычная операция прошла, replay224→224;
это НЕ проверка потери ответа. Исправлен исключительно диагностический wrapper,
новый lost-reply2 теряет ответ после реально завершённого finish_wizard из
наблюдённого transport envelope. Результат второго опыта ещё проверяется.

Lost-reply2: реальный finish_wizard n7 выполнен; ответ потерян в transport wrapper.
Public AMBIGUOUS/pending input_mapping, execution:not_requested; inspect pending,
тот же operation ID вернул дословно прежний outcome без жестов226→226. UI уже
на графе, мастер закрыт. Это PASS безопасного отсутствия повторного действия,
не заявление автоматического продолжения. После проверки свой final package
закрыт с «Не сохранять»: диагностические изменения после reopening отброшены,
а ранее сохранённая и независимо проверенная копия сохранена. Remote/runtime/
браузер закрыты. Итоговая точка передачи — missing-values-development-report-2026-09-13.md.
