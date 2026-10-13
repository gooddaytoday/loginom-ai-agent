# Приоритет стандартных узлов в loginom-automation

Дата: 2026-10-13. Ветка: `node-javascript`. Исходный код: `951a0027f`.
Статус: дизайн согласован пользователем; реализация идёт, live-приёмка ещё не завершена.
Основной skill изменён в двух Product файлах. Аудит/runner прошли TDD и независимый
review; реальный baseline-пилот прошёл финальную offline-проверку без JS.
Текущая серия `20261013T142936Z-072953`: завершены baseline 18/18, oracle/calculation 18;
ABC CLI exit 0, wrapper exit 2 из-за сборщика evidence, расчёт восстановлен offline.
Candidate payload собран и проверен; sales-by-category/1 прошёл full audit/cleanup без JS,
candidate 2/25 начаты: sales/1 full PASS; ABC/1 runtime-blocked на стандартном
Соединении (input_mapping readiness timeout), JS calls0, cleanup false. Live-серия
приостановлена для diagnosis/own recovery; первая волна не чистая, повторы закрыты.
Статические контракты candidate для tags сверены с baseline и исходниками;
реальные 15 стандартных `parameter_schema` получены native Host probe candidate
без LLM (ACK/exit0) и связаны с successful sales/1 `prepare` по build/catalog/digest.
Общего variable split-to-rows не найдено; невозможность конечной композиции для
151 элемента не доказана. Приёмка tags впереди; explicit logout probe не проверен.
Адресное offline-восстановление выполнено после проверки Loginom. По точному
GUID собственного ABC-узла подтверждены серверная сессия и её автоматическое
закрытие; актуальный admin-диспетчер через Playwright MCP подтвердил отсутствие
этой сессии. Архивирован только собственный guard; status/check прошли.
Playwright MCP 0.0.83 установлен в Codex; административные вход и выход проверены.
Исходная серия остановлена после трёх baseline-попыток; её отказы и evidence
сохраняются. После самостоятельного решения по обновлённой цели исправлен
подтверждённый runtime-дефект `imports.text.date_format` по TDD (`263df9620`).
Для итоговой приёмки нужна новая сопоставимая пара с этим общим runtime и полные
18 baseline + 25 candidate; прежние попытки не смешиваются с новой серией.
Это не итоговая приёмка.
Уточнён после проверки рекомендаций от 2026-10-13 по исходникам и локальным ресурсам.

## Решение и границы

Основной skill `loginom-automation` сначала строит решение из стандартных узлов,
которые агент действительно умеет создавать и настраивать в текущем каталоге.
Узел JavaScript разрешён только по явному запросу пользователя либо для
конкретной операции, которую нельзя выразить композицией доступных стандартных
узлов и режимов. При втором основании JS выполняет только недостающую операцию.

Пользователь отдельно подтвердил: ошибка настройки или выполнения поддержанного
стандартного узла не разрешает переход на JS. Ошибку нужно диагностировать и
исправить, а при невозможности продолжения сообщить конкретный блокер.

Проверочные запуски выполняются локально в текущей системе с текущим подключением Loginom.
Выделенный стенд, новый тестовый Loginom и перенос live-проверок в контейнеры не требуются.
Это уточнение пользователя от 2026-10-13 заменяет первоначальное предложение
о выделенном стенде.

Работа ограничена двумя файлами продуктового skill, независимым аудитом
доказательств выбора узлов и локальной приёмкой на аналитических заданиях eval.
Новые узлы, runtime-запрет JavaScript, новые публичные поля API, изменение судьи,
переписывание общего eval-harness и переустановка пользовательского Desktop
не входят в это изменение.

## Подтверждённое состояние

- Канонический источник: `packages/product/skills/loginom-automation/SKILL.md`
  и `references/workflow.md`. В обоих отсутствует правило standard-first.
- Shared staging доставляет одно дерево skill в CLI и Desktop. Вторую копию
  или публикацию через Dock Skills API создавать не нужно.
- Основной текст skill загружается при активации; references не встраиваются
  в него автоматически. Поэтому обязательное правило должно находиться в
  самом `SKILL.md`, до выбора первого обработчика.
- Текущий каталог объявляет 15 стандартных типов и `programming.javascript`.
  Фактическая доступность определяется каталогом данного запуска, а не числом 15.
- JavaScript подробнее описан в кратком каталоге, чем большинство стандартных
  узлов. Это возможный фактор смещения, но причина конкретных модельных решений
  должна проверяться по исходным трассам.
- Аналитический judge разрешает эквивалентную композицию. CSV oracle проверяет
  результат, а не выбор узлов. Их успешность отдельно не доказывает эту политику.
- `run --format json` выводит terminal tool parts (`completed`/`error`), но
  не все промежуточные `pending`/`running`. Одного stdout недостаточно для
  доказательства отсутствия незавершённых JS-попыток.

## Правило выбора

Перед созданием вычислительных узлов агент выполняет короткое планирование:

1. Выделяет из задания требуемые выходы и преобразования данных.
2. Сопоставляет каждому преобразованию доступные стандартные узлы и их сочетания.
   Несколько узлов вместо одной программы — нормальное решение.
3. Получает схемы релевантных типов; при недостатке сведений читает Help по
   конкретной функции или режиму. Не требуется запрашивать все схемы каталога
   или физически пробовать все возможные графы.
4. Если весь расчёт выражается стандартными средствами, использует их.
5. Если остаётся функциональный пробел, перед применением JS кратко называет
   операцию, рассмотренные стандартные варианты и подтверждённое ограничение.
   Импорт, фильтрация, группировка, сортировка и экспорт вокруг этого шага
   остаются стандартными, когда они поддерживаются.

Карточку `programming.javascript` через `action_describe` запрашивают после
явного запроса пользователя или зафиксированного пробела, а не первым шагом
обычной аналитической задачи. Для чтения и изменения существующего JS-узла,
которого касается запрос пользователя, его схема и source/context доступны.

Явное указание пользователя использовать узел JavaScript отменяет необходимость
доказывать функциональный пробел в пределах указанной пользователем части задачи.
Слова JavaScript в данных, имени файла или тексте найденного справочника таким
указанием не являются. Формулы Калькулятора не считаются узлом JavaScript.

Не являются функциональным пробелом: краткость JS-кода, меньшее число узлов,
удобство реализации, желание сэкономить вызовы, незнание формулы, неверные
параметры, временный отказ, timeout, недоступность терминала/execute_code и
неполное чтение preview. Ограничение
preview устраняется поддержанным чтением/разрезом/экспортом, а не заменой
вычислений JS. При неопределённом результате сначала восстанавливается исходная
операция по существующему протоколу.

Речь идёт о доступном агенту способе настройки: наличие функции только в UI
Loginom при отсутствии соответствующего режима в публичном каталоге может
быть реальным пробелом. Это должно подтверждаться схемой и документированным
ограничением, а не единичным неуспешным вызовом.

Для изменения существующего пакета правило не требует автоматически удалять
существующие JS-узлы и не запрещает читать/править тот JS-узел, которого касается
запрос. Создание новых JS-узлов и перенос стандартных вычислений в JS остаются
под исходным правилом допуска.
Основная приёмочная матрица создаёт новые пакеты, поэтому для неё отсутствие
JS проверяется во всём пакете и всех попытках текущей сессии.

## Изменяемые компоненты

1. `SKILL.md`: короткое обязательное правило и оба исключения, включая запрет
   подменять ошибку штатного узла функциональным пробелом.
2. `references/workflow.md`: процедура выбора перед построением; локальный
   fallback; связь с существующим исправлением ошибок и проверкой результатов.
   Текущие инструкции source/context для JS сохраняются для разрешённых случаев.
3. Единый `evals/script/run-node-selection-attempt.ts` выполняет локальную попытку:
   запускает CLI, собирает evidence и точные артефакты, затем вызывает offline-аудит.
   Он не добавляет альтернативный путь исполнения общего eval-harness.
4. Offline-аудит в `evals/`: читает доступный пакет/результат, все parts и messages
   только данной Session, её runtime-журналы и CLI exit code; отдельно оценивает
   политику, расчёт и полноту доказательств. Переиспользует `readNodeXml` и `checkOracle`, но не CrossTable-only
   правила `checkNodeXml` и не отбрасывающий ошибки `readNodeEvents`.
5. План и итоговый локальный отчёт: фиксируют происхождение бинарника/skill,
   исходные задания, модель, все попытки и оставшиеся ограничения.

Первый этап не меняет `node-contracts.mjs`. Если приёмка покажет сохраняющееся
нарушение, сначала пересматривается формулировка skill по наблюдённой трассе.
После первоначального изменения допускается не больше двух таких корректировок.
Если модель при подтверждённом наличии правила в контексте продолжает нарушать
политику, работа останавливается с доказательствами для решения владельца о
runtime-описаниях. Ошибка runtime, квота, timeout или отсутствие артефакта без
нарушения политики не являются поводом править skill. Расширение изменения на
runtime оформляется отдельным решением.

### Отдельное решение: необходимое исправление date_format

Пользователь обновил цель: самостоятельно устранять блокеры и принимать разумные
решения, где его участие можно исключить. На этом основании подтверждённый дефект
`imports.text.date_format` исправляется как общая предпосылка сравнения. Runtime
уже принимал шесть форматов по публичной схеме, но направлял их в неподдерживающий
текстовый setter. Минимальная правка выбирает точный существующий native dropdown
с проверкой root/owner/input и readback; публичные схемы, узлы и cleanup-протокол
сохраняются. В scope добавлены только `text-import-procedure.mjs` и его public
регрессии в `text-import-wide.test.mjs`. Skill из-за runtime-ошибки не меняется.

TDD RED воспроизвёл исходный отказ через `configureTextImportFields`, GREEN и
проверки чужого input/совпадающего значения прошли; 144 теста текстового импорта
прошли на pinned Node. Перед модельной серией нужен отдельный детерминированный
native proof этого поля через настоящий Host, без внешней LLM.

Native proof на исправленном baseline завершился exit 0: readback `yyyy/mm/dd`
и `/`, datetime schema, две ненулевые календарные даты, подтверждённые Save,
package close и logout. Точность времени не заявляется: preview возвращает
formatted display с `datetime_display_precision`. Первый smoke с ошибочным
ожиданием `cell.value` сохранён как неуспешный; его собственная сессия закрыта
адресно после GUID/log/admin-сверки. Оба smoke не входят в модельные 43 попытки.

Исходная серия `20261013T093809Z-f5d429` сохраняется как остановленная 3/18,
candidate 0/25. Результаты не удаляются, их отказы не переименовываются в успехи.
Новая полная серия получает отдельные run ID, immutable pins и evidence.
Обе сборки выполняются последовательно из одного нового managed worktree на
общем коммите: baseline с точными двумя skill-файлами исходного payload,
candidate после восстановления этих файлов к общему HEAD. Runtime, пути сборки,
Node/Bun/Chromium, явная версия `0.1.17`, модель, inputs/oracle и review seed
совпадают. Между сборками меняются только два skill-файла; attestation честно
фиксирует dirty baseline и clean candidate. Пользовательский untracked файл
corrections не изменяется и не коммитится; обе сборки используют одинаковый
tracked source HEAD нового worktree. Стабильность снимка и inventories проверяются.

Новая пара `20261013T132356Z-0a3983` собрана на общем `6768520a0`; обе source
verification завершились exit 0. Независимая побайтовая сверка полных inventories
подтвердила одинаковые runtime, compiled CLI/Host, Node/Chromium и зависимости.
Отличаются только два skill-файла, два манифеста и два build-inputs с различным
представлением import paths при одинаковых входных inventories и выходах.
Это подтверждение сопоставимости сборок, не результат модельной приёмки.

Новые baseline/candidate pins подготовлены и проверены независимо: 43 уникальных
слота, прежние tasks/inputs/oracle/model/reviewSeed, 72/72 audit/runner/fixture
hashes совпали. Frozen models и исторический acceptance lock скопированы побайтно;
новые manifest/pins hashes связаны отдельной квитанцией. `current-run` переключён
на новую серию, запущен её первый sales baseline. Старые три модельные попытки
остаются отдельно; ещё не выполненные gates не считаются пройденными.

Первый новый sales baseline завершился с `WIZARD_OPEN_NOT_CONFIRMED` и cleanup
unconfirmed, без Save/CSV. Он сохранён в знаменателе новой серии. После строгой
own GUID/log/admin-привязки закрыта только его сессия и архивирован собственный
guard; это восстановление не меняет исторический исход. Минимальный opening
дефект по имеющимся snapshot не доказан, runtime не меняется предположительно.
Следующая плановая попытка разрешена после подтверждённого восстановления.

### Отдельное решение: dataset output socket в overflow

Вторая новая baseline ABC повторила отказ старой ABC в output_mapping. Обе
использовали `schema_mode=declared`, native mapping и port GUID были подтверждены,
но port_context оставался unobserved, поэтому guard отклонял Close до жеста.
Offline RED через публичный workspaceUiCapability воспроизвёл сочетание скрытой
dataset-крошки и verified native port: видимая dataset и скрытая derived работают,
скрытая dataset не распознавалась. Сохранённый native DOM style/class не доступен;
именно overflow-ветку исправления ещё необходимо проверить native.

Минимальная TDD-правка `c2c898aca5` добавляет уже поддержанный dataset icon в
существующий overflow selector. Все ownership/GUID/opening/index/ancestry guards,
Close, публичные контракты и skill неизменны. Матрица 28 положительных/негативных
случаев и полные 310 workspace-ui/node-wizard-close тестов прошли; независимый
review PASS. Серия `20261013T132356Z-0a3983` остановлена 2/18, candidate 0/25,
оба провала сохранены отдельно. Own ABC-сессия адресно закрыта после GUID/log/admin
привязки, guard архивирован; другие сессии не трогали.

Новая общая пара `20261013T142936Z-072953` включает оба необходимые runtime fixes,
те же skill версии, version/resources/model/inputs/oracle/seed. После native proof
и attestation выполняется полная серия 18+25. Пять исторических попыток двух
остановленных серий не включаются в неё. Собственные ненужные build artifacts
периодически удаляются после сохранения evidence; другие агенты не затрагиваются.

Native proof обеих правок выполнен через Host на новой baseline-сборке: импорт
дат и declared JS завершились, mapping закрыт, Save/package cleanup/logout
подтверждены. Сохранённый журнал содержит DataSetOutputSocketWizard и точный
native_opening_bound_toolbar_overflow с совпадающими GUID/index/opening ID,
последующим Close/graph verification и terminal JS success. Независимый offline
review и root повторная offline verification exit 0 подтвердили 11/21, обе
календарные даты и 25 evidence/287 runtime file hashes. Исходный driver exit 1
остаётся историческим: неверное сравнение display date в discrete/continuous
полях. Импорт сохраняет display precision limitation; JS timezone unspecified.
Это native proof, не модельный eval и не проверка повторного открытия пакета.

Третья пара собрана и проверена на общем `1bfc135430`: baseline dirty только
из-за двух старых skill-файлов, candidate clean. Обе source verification exit 0;
независимая сверка полных CLI/resource inventories PASS, runtime/dependencies/
CLI/Host/Node/Chromium побайтно одинаковы. Immutable pins закрепляют прежние
tasks/model/seed, 72 hashes и 43 уникальных слота. `current-run` переключён на
`20261013T142936Z-072953`, первый sales baseline запущен; кандидат ещё не выполнялся.
Неиспользованный candidate остановленной второй серии архивирован с проверкой
всех 5725 entries, затем удалён только его собственный каталог. Baseline/browser
source и evidence сохранены; чужие артефакты не затронуты.

Первый baseline третьей серии (sales/1) завершился CLI/wrapper exit 0: no JS,
oracle/calculation/graph/export/history/identity/runtime и ordinary CLI cleanup
подтверждены. Это один из 18 baseline; candidate ещё не выполнялся, полная
приёмка не заявляется. ABC/1 той же серии завершился CLI exit 0, Save/Export и
ordinary cleanup подтверждены. Wrapper exit 2 вызван текстом `loginom_find`,
переданным в JSON-парсер квитанций. Исправление ограничивается внешним collector:
проекция `loginom_dock_*`, сохранение полной истории и строгого managed parser.
Общие runtime, payload и pins остаются прежними; новый model run не требуется.
Правка `f5eb5373e2` проверена RED → GREEN, 88 tests/206 assertions, typecheck и
independent review. Actual 68 parts дают 16 managed calls; original history
не мутируется. Historical acceptance lock неизменён; `collector-fix-lock.json`
закрепляет новый runner SHA и 71 прежний file hash. AuditVersion не менялся.
Командные проверки Task 6 завершены: current collector source/lock сверены,
evals 88 tests/typecheck/diff PASS. Bundled/staging/host checks Task 4 используются
без повтора: skill/host/dependencies неизменны; отдельного raw host-test log не
найдено, подтверждение сохранено в committed report. Runtime 310-test и native
offline evidence сверены отдельно. Это не закрывает candidate/review gates.

Exact receipt-based copyout дал пакет SHA
`dddd3fc96c6036cc74cf9096efd3a596a863b8d45e5417cc006e895d82b48e2a`
и CSV 228 bytes с ожидаемым SHA. Явная offline-проекция
`evidence/abc-collector-recovery` сохраняет исходные CLI/wrapper/blocker, восстанавливая
только receipt paths. После распаковки audit подтвердил oracle/calculation,
history/runtime/identity/graph/export identity; JS nodes/calls 2/2 и единственный
отказ `JAVASCRIPT_NOT_ALLOWED` отражают старый skill. Original attempt/history
не переписаны. Независимый read-only review подтвердил 11 исходных hashes,
21 shared evidence file, все 14 ZIP members и повторные pure audit/oracle checks.
Это baseline-замер, не приёмка candidate.

Следующий monthly-demand/1 завершился CLI/wrapper exit 0: стандартные импорт,
калькулятор, группировка, сортировка и экспорт, no JS. Сплошной oracle и полный
audit PASS, cleanup подтверждён. Это live-проверка текущего общего runtime и
runner после collector fix. Независимая сверка collector addendum/pins PASS;
risky-approved-claims/1 также прошёл full audit/CLI cleanup без JS. Ошибка
названия фильтра была отклонена до browser effect, исправлена новым operation ID
на стандартном узле и сохранена в истории. Campaign-roi-by-channel/1 также прошёл
полный audit/cleanup без JS. First-last-touch/1 завершился CLI0, oracle/calculation
и все evidence axes true, один JS node/call; wrapper1 только из-за baseline
JAVASCRIPT_NOT_ALLOWED. Первый проход всех шести baseline завершён: четыре без JS,
ABC с двумя JS и attribution с одним. Sales-by-category/2 также завершился
CLI/wrapper0, полный audit/cleanup PASS без JS. ABC/2 завершился CLI0/cleanup true,
oracle true, wrapper1: public/runtime settlement одного JS не подтверждён
(RUNTIME_APPLY_MISMATCH, TOOL_OPERATION_UNSETTLED, TOOL_RECEIPT_INCOMPLETE).
Исходный calculation false сохранён; ниже зафиксирована отдельная повторная
оценка после исправления `operation_inspect`. Collector обработал реальный Help.
candidate 0/25, полная приёмка ещё впереди.

`e871bf81d2` исправляет только аудит inspection: resolved/verified envelope,
полный bound successful node.apply outcome, cleanup/node/execution/runtime
binding и поздняя inspection после точного USER_RESPONSE_BUDGET refusal.
RED → GREEN, 106 tests, typecheck/diff и independent review PASS (38 negative
mutations). Generic error или внешний SUCCEEDED без terminal outcome не принимается.
Runtime, skill, payload и pins прежние. Новый auditVersion
`2654bfc1c61d4d0ecc73c7a6f4fa9613b5d5244ea83a7fdb8712be2ed452e445`
закреплён `settlement-fix-lock.json`; historical locks сохранены.

Все восемь baseline переоценены offline в `evidence/settlement-reassessment-e871bf81d2`:
oracle/calculation 8/8, standard policy 5/8 старого skill, JS 5 nodes/calls/successful
calls. Original attempt/outcomes/raw и предыдущие оценки побайтно сохранены;
только ABC/2 получил ранее недостающий settlement и расчётный PASS. Повтор модели
не выполнялся. Независимая сверка reassessment PASS: 96 protected files и восемь
prior audits неизменны, новые оценки и locks/pins/Session/package bindings
подтверждены. У семи изменился только auditVersion; остальные изменения только
у ABC/2 и касаются подтверждённого settlement. Начат monthly-demand/2.
Monthly-demand/2 также прошёл CLI/wrapper0 и full audit/cleanup без JS на
auditVersion `2654bfc1…`; использованы стандартные узлы, включая reform_columns.
Risky-approved-claims/2 также прошёл full audit/cleanup без JS; естественный
label refusal исправлен новым стандартным запросом и сохранён. Начат
campaign-roi-by-channel/2 прошёл full audit/cleanup без JS; начат first-last-touch/2.
Candidate по-прежнему 0/25.
First-last-touch/2 также прошёл CLI0/oracle/calculation/cleanup с одним JS;
wrapper1 только из-за baseline JS policy. Два прохода baseline завершены:
policy старого skill 8/12, JS6/6/6. Начат sales-by-category/3.
Sales-by-category/3 завершился full audit/cleanup PASS без JS: все три его
baseline успешны. Начат abc-pareto-groups/3, candidate 0/25.
ABC/3 завершился CLI0/oracle/calculation/cleanup и обе JS-операции подтверждены;
wrapper1 только из-за baseline JS policy. Все три ABC расчётно успешны, их
исторические collection/settlement assessments сохранены. Начат monthly-demand/3.
Monthly-demand/3 завершился full audit/cleanup PASS без JS: три monthly baseline
успешны. Начат risky-approved-claims/3; candidate 0/25.
Risky-approved-claims/3 завершился full audit/cleanup PASS без JS: три risky baseline
успешны. Начат campaign-roi-by-channel/3; candidate 0/25.
Campaign-roi-by-channel/3 завершился full audit/cleanup PASS без JS: три campaign
baseline успешны. Начат first-last-touch/3; candidate 0/25.
First-last-touch/3 завершился CLI0/oracle/calculation/cleanup с одним JS. Baseline
18/18 завершён: policy12/18, JS9/9/9, oracle/calculation18. Candidate0/25;
Independent machine review всех 18 PASS; candidate ещё не запускался.

Task 3: подтверждены 18 уникальных workspaces/Session/prefix и input-only файлы; independent baseline-final-review PASS.

Task 3: 18 отдельных CLI-процессов шли последовательно без пересечений; все CLI0, cleanup true и без timeout.

Task 3: у всех 18 сохранены единственная own Session, полная история и read-only snapshot; runtime identity/settlement подтверждены.

Task 3: 18 пакетов/CSV привязаны к own Save/Export receipts; SHA, exporter/execution lineage и 252 ZIP members проверены.

Task 3 завершён: 18 слотов в исходном порядке, oracle/calculation18, policy12, JS9/9/9; final audit2654bfc1 и addenda, исходные outcomes сохранены.

Candidate ABC/1 остановился на стандартном Join/input1: request и native mapping
валидны, но input_port_context unobserved не разрешает finish_wizard. Кнопка Done
enabled/visible во всех 44 финальных polls; конкретный breadcrumb DOM conjunct
не сохранён. Это не подтверждённый capability gap и не повод менять skill.
Для причины готовится отдельный native diagnostic без LLM с fixed read-only
NavigationPanel capture; immutable candidate и original model slot не меняются.
Own user:67 закрыт адресно по четырём GUID/server/admin binding; fresh log и
refresh absence подтверждены. Exact guard архивирован после SHA/mtime/proc
проверки; status/check0. Это recovery, original cleanup false сохранён.

Это перезапуск сравнения из-за необходимой общей runtime-правки, а не повтор
неудачного модельного слота. Ограничение двух последующих policy-исправлений skill
и все расчётные/политические критерии остаются прежними.

## Локальная приёмка

Используется локальный CLI и уже настроенный Loginom endpoint. Для baseline
и candidate собираются отдельные проверяемые payload из одинаковых исходников
продукта/runtime с функциональным различием только в skill; пользовательский
Desktop не заменяется. Завершение offline audit после pilot меняет проверяющие
файлы вне payload и отражается в отдельном source attestation. Текущий
CLI-профиль используется последовательно, с новыми Session и уникальными
именами пакетов/CSV. Нельзя очищать пользовательскую историю, Loginom storage,
чужие пакеты или процессы. Секреты не копируются в отчёт или Git.

Новый CLI-кандидат запускается по абсолютному пути. До серии проверяются его
manifest, staged skill и наблюдённый digest активации. Запуск старого установленного
бинарника без новой версии skill не считается приёмкой изменения.
Сборке нужны полный pinned Node с npm и Chromium текущего release pin; ресурсы
старого установленного CLI не подходят автоматически. Локальные исходники
проверяются по SHA, временный Chromium копируется в постоянный собственный
каталог до начала серии. Те же ресурсы используются обеими сборками и staging-тестами.

До первого модельного запуска собирается baseline payload и фиксируются его
manifest, hashes и digest skill. Все 18 baseline используют этот неизменный
payload. При сборке baseline выполняются сверка с исходниками и source attestation;
после изменения skill проверяется целостность frozen payload, а не его совпадение
с текущим checkout. Baseline и candidate сохраняют отдельные pins.
SHA manifest в pins связывает серию с его metadata source SHA/tree/dirty;
полный skill inventory с hashes сохраняется рядом. Базовые пути/resources/model
сохраняются в приватном environment.json; pins начатой серии не переписываются.
После фиксации baseline правка skill и сборка candidate могут выполняться
параллельно следующим baseline-попыткам. Запись candidate-исходников не должна
совпадать по времени с их сборкой; стабильность снимка сборки проверяется.
Во время сборки новые evidence пишутся только в игнорируемый `evals/results/`
или вне checkout; публикация fixtures и документации ждёт завершения сборки.
Модельные CLI-процессы с текущим профилем всегда выполняются строго последовательно.

Общий `evals/src/run.ts` остаётся со своим контрактом изоляции. Здесь используются
его задания, входные CSV, oracle и независимые offline-проверки; локальная серия
не объявляется изолированным benchmark и не смешивается с его статистикой.
Оцениваемая Session получает только prompt и inputs; reference/oracle/spec
остаются у проверяющего. Запуск выполняется из собственного рабочего каталога
вне репозитория. Кроме PURE и отключения project config/Claude prompt, отключаются
external skills и Claude Code skills: иначе домашние eval-skills попадут в контекст.
Отдельные `skills.paths` в конфигурации также проверяются: указанные флаги не
гарантируют их отключения. Основная серия использует `--command loginom-automation`;
Desktop и обычная активация skill этой приёмкой не проверяются.

Management status/check выполняются с `--headless`. PROFILE_BUSY (код 3 для run),
recovery required (4) и неподтверждённый cleanup останавливают серию; у management
код 3 также может означать другой конфликт — учитывать машинный код ошибки.
Чужой writer не
удаляется. Код 130 означает отмену; timeout указывается только при записанном
дедлайне и отправленном SIGINT своему CLI PID. Бюджет host.close — 90 секунд,
он не гарантирует общий срок выхода всего CLI. При превышении локального срока
ожидания сохраняется блокер; второй сигнал автоматически не посылается.
Локальный supervisor отдельно фиксирует deadline, PID, отправку единственного
SIGINT и подтверждённый exit; его код блокера не подменяет код ещё работающего CLI.

### Порядок запуска и основная матрица

Сначала готовятся минимальный аудит и единый runner, затем один pilot baseline
на `sales-by-category`. Pilot входит в 18 baseline и не является дополнительным
прогоном. Его реальные, очищенные от секретов evidence используются как fixtures
для завершения аудита. После этого pilot проверяется повторно offline без нового
обращения к модели. Необходимые полнота истории и settlement не заменяются
синтетическими флагами ради раннего старта серии. Критерии фиксируются до pilot;
реальные fixtures уточняют чтение существующих контрактов, а не меняют критерии
по результату. Финальные runner и audit фиксируются до оставшихся baseline и
сборки candidate.

Каждая строка запускается трижды с frozen baseline payload и трижды с candidate,
в новых Session. Всего 18 baseline + 18 основных candidate попыток.

| Eval ID | Покрытие стандартных возможностей | Строк результата |
| --- | --- | ---: |
| `sales-by-category` | Группировка, count/sum/avg, сортировка | 5 |
| `abc-pareto-groups` | Сортировка, CumulativeSum/Stat, IF, группировка | 3 |
| `monthly-demand` | Извлечение месяца, группировка, сортировка | 12 |
| `risky-approved-claims` | Логический фильтр, группировка | 4 |
| `campaign-roi-by-channel` | Группировка и ROI из сумм | 5 |
| `first-last-touch` | Калькулятор, две группировки, слияние | 5 |

Источник: `evals/tasks/analytic/<id>/`. Эталонные `.lgp` этих шести кейсов
проверены чтением XML и не содержат `TBGJavaScriptEngine`. Приведённые маршруты
помогают проверяющему, но не дописываются в prompt модели и не требуют точного
совпадения числа узлов или GUID с эталоном.

Prompt каждого задания сохраняется; разрешён одинаковый технический хвост
`buildAgentPrompt` для уникальных выходных путей. Модель, variant, лимит,
inputs и формат запуска одинаковы между сериями. Неудачные попытки сохраняются;
исправленная версия skill получает новый digest и отдельную candidate-серию.
Для реализации пользователь выбрал gpt-6-sol, medium, fast: CLI alias
`openai/gpt-6-sol-fast` запрашивает priority для API model gpt-6-sol.
Публичный каталог модели фиксируется по SHA и передаётся обеим сериям через
MODELS_PATH. Фактический tier не предполагается по alias; модель не заменяется
без указания пользователя.

Первая волна candidate включает по одному запуску каждой из шести стандартных
задач, один `explicit-js`, один `capability-gap` и единственный targeted
`standard-recovery`: всего 9. Это первые попытки итоговой серии, а не отдельная
добавка. При первом подтверждённом нарушении политики дальнейшие candidate
останавливаются. Повторы запускаются только после полного прохождения первой
волны: у всех 9 попыток полные evidence и подтверждённая политика; у 6 стандартных
и 2 JS-попыток успешны пакет, oracle и машинная проверка графа; роли двух JS
подтверждены review; в recovery наблюдались реальный отказ, отсутствие JS и
успешное стандартное исправление. Честный recovery-блокер подтверждает только
политику, не открывает повторы и не считается чистым прохождением первой волны.
При другом провале можно закончить первую волну для диагностики, если runtime
settled и профиль освобождён, но повторы запрещены. Такой провал не разрешает
править skill или выборочно заменять модельную попытку.

### Исключения и восстановление

Статическая сверка собранного candidate выполнена: пять файлов контрактов
побайтно совпадают с baseline и исходниками; проверены экспорты 16 типов узлов
и схемы Калькулятора, Свёртки и Объединения. Генератор, цикл и dynamic
split-to-rows в них не объявлены. Evidence:
`evals/results/node-selection-local/20261013T093809Z-f5d429/candidate-gap-attestation.json`,
SHA256 `0d2bdcdb35e8c5d8af595cc19cb34424998a368c163dd7f094bd22935a01c0aa`.
Это поддерживает обоснование tags для общего требования произвольной длины,
но не доказывает невозможность всех мыслимых стандартных композиций.
До tags live остаётся сверить `prepare.knowledge.node_types` и релевантные
`action_describe.parameter_schema` именно в candidate Session; статическая
сверка не заменяет проверку доступности обработчиков или модельную приёмку.

- **Явный JS:** парный вариант `sales-by-category` с единственным добавлением
  «Агрегацию по категориям выполни узлом JavaScript». Исходный oracle сохраняется.
  JS обязан действительно выполнить указанную агрегацию; импорт, сортировка и экспорт
  остаются штатными. Три candidate-попытки.
- **Функциональный пробел:** CSV с полем `tags`, содержащим списки произвольной
  длины через `;`. Требуется разворачивать элементы в строки, trim, пропускать
  пустые элементы, сохранять повторения и считать частоты по тегу. Основной input
  включает четыре строки `red;blue;red`, `blue;;green;`, `; red ;`, пустое поле
  и пятую строку со 150 метками red и одной blue. Независимый oracle:
  blue — 3, green — 1, red — 153.
  Разная длина списков и review кода проверяют общий алгоритм без hardcode.
  Проверяющий до модельного запуска подтверждает по текущим схемам отсутствие
  стандартного variable-row expansion: Калькулятор создаёт фиксированные поля,
  Свёртка работает с фиксированным списком колонок, остальные доступные типы
  не предоставляют split-to-rows. Если live-каталог это опровергает, JS не
  разрешается и покрытие fallback остаётся незавершённым; нельзя объявлять
  ошибку узла новым доказательством пробела. JS разворачивает строки, а
  Группировка/Сортировка/Экспорт выполняются стандартными узлами. Три попытки
  на одном усиленном input, без второй Session, второго oracle и XML-diff между
  запусками. Более 128 элементов проверяют простой фиксированный потолок,
  но не доказывают невозможность стандартной композиции: 128 — лимит одного
  набора полей/узла, а не всего графа. Повторное исполнение сохранённого графа
  после холодного открытия и смены входных данных этой приёмкой не проверяется.
- **Ошибка стандартного узла:** отдельный диагностический запрос с намеренно
  ошибочной формулой Калькулятора и последующим исправлением. Нужны реальная
  квитанция ошибки и последующее стандартное исправление либо честный блокер;
  без наблюдённой ошибки исход `recovery_unobserved`, ветка считается непроверенной
  и skill по этой причине не меняется. Одна candidate-попытка. CSV явно ограничен
  колонками Category,Profit. Prompt подсказывает исправление, поэтому этот тест
  проверяет отсутствие JS после наблюдённого отказа, а не самостоятельную диагностику.
  Блокер может подтвердить соблюдение политики, но не успешное выполнение расчёта.
  Естественные ошибки во всех остальных candidate также проверяются обычным
  аудитом: они не разрешают JS. Их появление заранее не обещается; наблюдённое
  покрытие фиксируется отдельно и не превращает `recovery_unobserved` targeted
  попытки в успешную диагностическую проверку.

### Доказательства и критерии

Для каждой попытки сохраняются Session ID, CLI exit code, полные `events.jsonl`,
все parts и messages данной Session из локальной БД после завершения, финальный ответ,
digest skill, актуальный каталог, manifests и хэши входов/пакета/результата.
Чтение БД выполняется read-only, только по выданному Session ID; неизвестная
схема БД или отсутствующая история означают неполноту доказательств. Snapshot
БД содержит все сохранённые вызовы и их текущие состояния, а не историю всех
переходов каждого вызова. Он сопоставляется со stdout и runtime-квитанциями;
противоречия не разрешается трактовать как отсутствие JS.

Собственные runtime-журналы находятся в
`<profile>/loginom/runtime/generations/*/chats/<sha256(SessionID)>/attempts/*/`.
`session.json.sessionId` и `execution-events.jsonl.session_id` — UUID Dock,
а не ID Session агента. Не смешивать разные attempts/UUID при сверке операций.

Аудит выводит `policyStatus:passed|failed|incomplete` отдельно от
`oraclePassed:true|false|null` и `calculationPassed`.
Он вычисляет `historyComplete` и `runtimeSettled`, не принимает их входными
флагами. Проверяются единая Session, отсутствие дочерних сессий, соответствие
terminal stdout parts полному snapshot, отсутствие неизвестных inputs и
незавершённых вызовов. Пустой `state.raw` не восстанавливает input. Ответ running
может храниться как completed с `state.metadata.loginomPending:true`; его закрытие
подтверждается последующим результатом той же операции. Само событие completed
не закрывает uncertainty: settlement проверяется по контракту инструмента.
Для node_apply публичный запрос, runtime admission и terminal связываются по
document/workflow/node identity, включая существующий target.ref; совпадения
одного operation_id и типа узла недостаточно.
Для apply/delivery/save последний результат должен иметь
`SUCCEEDED | FAILED | NOT_APPLIED`, `cleanup_complete:true`, без оставшихся
pending/active работ. Source/context read используют собственный owner-bound
receipt с operation/node identity. Direct context имеет `cleanup_complete:true`;
direct source не содержит этого поля, поэтому cleanup подтверждается парой
`source_discard_settled` и `source_delivery_verified` для каждого read step
в том же runtime attempt с тем же owner. Их wait/status имеют
`state:settled`, `progress.cleanup_complete:true`, `pending_phase:null`.
Для таких read `outcome:null` штатен, apply-status от них не требуется.
Вложенный `artifact.upload` с `AMBIGUOUS/UPLOAD_SERVER_VERIFICATION_REQUIRED`
может быть закрыт собственной внешней квитанцией `artifact_delivery_completed`:
`SUCCEEDED`, `cleanup_complete:true`, `upload_completion_verified:true`, тот же
runtime attempt/Dock UUID и точное совпадение `upload_operation_id`, destination,
bytes и SHA256. Это подтверждённый формат пилота; остальные AMBIGUOUS и
несовпадение квитанций означают incomplete.

Ошибку читать из `state.error`, успешный ответ — из `state.output`. Для обрезанного
успешного ответа нужен полный файл из `state.metadata.outputPath`. У обрезанной
ошибки такого поля может не быть: использовать полную сохранённую runtime-квитанцию
или отметить неполноту. Summary не заменяет полный ответ. Квитанция FAILED
может подтвердить settlement, но не успех расчёта; CLI exit 0 тоже не доказывает
успех Loginom-вызовов.

Ожидаемый digest — digest всего `loginom-automation`, полученный
`verifyBundledSkills` в payload; наблюдаемый — `dock_prepare.skillRevision`
и metadata активации. Каталог берётся из `knowledge.node_types`, фактическая
модель/variant — из messages и конфигурации запуска.

Пакет и CSV берутся по точным подтверждённым путям, а не по «последнему файлу».
Способ получения файлов в этой серии — read-only `docker cp` из подтверждённого
server container/UserStorage текущего аккаунта. В продукте нет автоматического
скачивания сохранённого `.lgp`; запасной browser-download этап не планируется.
При отсутствии copy-out это блокер проверки; сообщение модели не заменяет файл.

Политика и расчёт оцениваются раздельно:

1. **Политика — жёсткое условие 18/18:** правило и JS присутствовали в контексте,
   полный audit не обнаружил ни одной JS-попытки. Считать все `node_apply`
   независимо от статуса и сверять с `node_apply_prepared.request.target.type`.
   При наличии пакета проверить все workflows на оба XML-типа:
   `TBGJavaScriptEngine` и исторический `TBGCodeModelComponentEngine`.
   Фактический тип подтвердить первым реальным JS-пакетом. Неполнота даёт
   `policyStatus:incomplete`, а не ноль JS. При отсутствии пакета полный trace
   может подтвердить только выбор узлов; XML-проверка остаётся недоступной.
2. **Расчёт — не хуже baseline:** число oracle-pass в 18 candidate не меньше,
   чем в 18 baseline, при одинаковых задачах/модели/лимитах. Показать также
   результаты 0..3 по каждой задаче. Для содержательной приёмки необходим хотя
   бы один candidate package+oracle+graph успех по каждой из шести задач:
   сравнение 0/18→0/18 или исчезновение покрытия целой задачи не является успехом.
3. **Успешный расчёт отдельной попытки:** CLI exit 0, settlement, собственный
   сохранённый пакет, ровно один CSV, `checkOracle.passed===true`, valid XML и
   однозначное соответствие GUID экспортёра из успешной квитанции узлу
   `TBGExportTextFile` сохранённого XML, а также
   машинно подтверждённая связность от импорта приложенных данных к каждому
   экспортируемому результату. Все data inputs предков Export должны иметь
   источник с lineage от этого импорта, включая оба входа Join. Боковые ветви
   вне предков Export допустимы; подмена результата изолированной константной
   веткой не допускается. Порты различаются по scope, узлу и GUID;
   параметрическая связь не является путём данных. Проверка использует
   существующий readNodeXml без нового XML-парсера. Неизвестная форма
   ссылок или output lineage означает incomplete. Для стандартной candidate
   попытки также машинно подтверждается отсутствие JS. `passed:null`, invalid
   XML, отсутствующий артефакт, неподтверждённая квитанция не считаются успешным
   расчётом. Смысл графа дополнительно проверяется ограниченным review ниже;
   полное ручное review каждого стандартного успеха не требуется.
4. **Причины провала сохраняются отдельно:** неверный запрос модели, runtime,
   модель/квота, timeout, доступ к артефакту и неполные доказательства. Отсутствие
   `.lgp` само по себе не устанавливает, что виноват runtime. Ни одна такая
   причина без нарушения политики не запускает корректировку skill.

До первого model turn отказ инфраструктуры не занимает один из 18 слотов:
серию приостанавливают, incident записывают отдельно и после устранения допускают
повтор того же запланированного слота. Wrapper сохраняет такие отказы в новом
`incidents/` каталоге, без перезаписи квитанций и резервирования модельного слота.
После старта CLI отсутствие dispatch и exit/cleanup должны быть подтверждены,
иначе освобождать слот нельзя. Уже начавшаяся модельная
попытка, включая отказ модели или квоту после dispatch, остаётся в знаменателе;
её нельзя выборочно заменить успешной. Если rule/digest/catalog не подтверждены,
политика непроверена. При снижении успешности или неполном покрытии приёмка
не завершена; причины и решение о дальнейшем scope передаются владельцу.

Отдельная политика аудита различает `standard`, `explicit-js`, `capability-gap`
и `standard-recovery`. Для разрешённого JS проверяется наличие успешного
применения, соответствие узлу в пакете, роль JS и оставшаяся стандартная цепочка.
Проверка роли и обоснования проводится по коду узла и трассе, а не по названию.
Машинные условия explicit-js: ровно один JS, штатные импорт/сортировка/экспорт,
нет GroupData; tags: ровно один JS и штатные GroupData/Sorting/Export после него.
Смысл кода и checklist проверяет отдельный reviewer без права менять skill.
Его `graph-review.json` содержит verdict (`passed|failed`), reviewer, sessionID,
packageSha256, непустые evidence (существующие относительные пути попытки) и notes
с основанием verdict. Session/SHA совпадают с проверенными evidence; explicit-js
требует `javascriptRole:requested-aggregation`, tags — `variable-unpack-only`,
recovery — `recoveryObserved:true`. Без обязательного review раздельные машинные
статусы доступны, но общий PASS исключения не подтверждён.
Обязательное содержательное review охватывает все 6 JS-попыток, единственный
targeted recovery, все candidate-аномалии и 3 случайно выбранных стандартных
candidate-успеха. Seed фиксируется до pilot, выборка воспроизводима и не меняется
ради удобного результата. При обнаружении дефекта выборочное review расширяется
на затронутые задачи или общий механизм; полный ручной обзор всех попыток не
включается автоматически. Baseline служит машинным замером, без отдельного
семантического ручного review всех 18 графов. Это ограничение отражается в отчёте.
Recovery доказывается одновременно вложенным
`error.cause.code:WIZARD_CALCULATOR_VALIDATION_FAILED` при `NODE_APPLY_STOPPED`
и `node_phase_refused.receipt.verification` со значением
`calculator_syntax_rejected_draft_restored` для того же узла/операции.

Baseline может нарушать политику — это измеряемое исходное поведение.
Случайный успех, только CSV-pass и только judge-pass не заменяют эту приёмку.
Три повторения не доказывают универсальную гарантию поведения модели или
статистическую неухудшаемость; это критерий данной локальной серии.

Для завершения всей приёмки также обязательны 3/3 успешных `explicit-js` с
исходным oracle и подтверждённой ролью JS; 3/3 `capability-gap` с независимым
oracle на едином усиленном input и локальным JS; 1/1 targeted `standard-recovery`
с наблюдённой ошибкой, отсутствием JS и успешным стандартным исправлением.
При невозможности исправления остаётся явно отмеченный recovery-блокер. Он
подтверждает только политику, оставляет успешность расчёта непроверенной и
сохраняется в итоговых ограничениях; он не удовлетворяет порогу первой волны и
не разрешает запуск оставшихся повторов. `recovery_unobserved` не является PASS
и оставляет targeted diagnostic coverage незавершённым. Наблюдённые естественные
ошибки отмечаются отдельно. Непроверенное исключение или не возникшая
targeted диагностическая ошибка не позволяют объявить всю приёмку завершённой.

Полная первоначальная серия — 43 модельных запуска: 18 baseline и 25 candidate
(18 стандартных, 3 explicit-JS, 3 tags, 1 recovery). Pilot входит в 18 baseline,
первая волна из 9 входит в 25 candidate. Корректировки skill требуют отдельной
серии и не входят в эти 43. По 30 минут на запуск это максимум 21,5 часа окон
исполнения плюс сборка, cleanup и аудит; первая волна candidate — максимум
4,5 часа окон. Оценка «около часа» данными не подтверждена. Это сумма окон,
а не обещание срока: 90 секунд graceful ожидания после SIGINT — граница для
фиксации блокера, а не гарантия выхода CLI. CLI-профиль эксклюзивно занят каждым
процессом до подтверждённого cleanup и exit, между процессами освобождается.

LLM judge не является обязательным новым зависимым компонентом локальной серии:
структура и смысл сверяются с существующим checklist при review доказательств.
Если используется штатный судья, его версия и ещё не завершённая калибровка
указываются отдельно; prompt судьи и рубрики не изменяются.

## Завершение и контрольная точка

План реализации: `docs/superpowers/plans/2026-10-13-loginom-node-selection.md`.
Итоговый отчёт реализации: `docs/testing/loginom-ai-agent/reports/2026-10-13-node-selection-local.md`.
В отчёте отдельно фиксируются изменения skill, unit/static проверки, все local
live попытки, подтверждение исключений, доступ к физическим артефактам и блокеры.
Отдельно указаны сокращённое покрытие recovery до одного targeted прогона,
отсутствие cold reuse после смены входа, выборочный семантический review
стандартных успехов и отсутствие ручного семантического review baseline.
На этапе дизайна выполнены исследование исходников/аналитических эталонов,
независимое review и проверка примеров команд, oracle и snapshot из плана
на временных данных. Skill/runtime не изменены; сборки и live-серии ещё не запускались.
