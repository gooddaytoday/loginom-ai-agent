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
Первый native diagnostic остановился до Join из-за operator preview assertion
(display_text вместо exact_integer value), Save не состоялся. Original failure
сохранён. После TDD-проверки actual receipt и Save-before-assertions исправлен
только private driver (5 tests/review PASS); own native user70 адресно закрыт,
второй diagnostic выполнен в новом каталоге без LLM и без изменения candidate.
Он воспроизвёл Join input_mapping refusal, но private capture guard ошибочно
отклонил чтение unresolved terminal context (LOGINOM_DIAGNOSTIC_BUSY). DOM cause
остаётся недоказанной; готовится узкая TDD-правка только diagnostic guard.
Оба исходных native failures сохранены, original model slot не повторяется.
Fixed read-only capture guard исправлен TDD (6tests/review PASS), own page/URL
и fixedargs сохраняются. Native2 user72 адресно закрыт по GUID/Save/log/admin
binding. Третий native воспроизвёл отказ и captured DOM: скрытые crumbs7
«Присоединяемая таблица» и8 «Настройка» не проходят generic hidden-caption guard;
43 polls связаны с own input1/GUID/opening. Source-причина подтверждена,
минимальная TDD-правка runtime проходит проверки. Own native3 user74 закрыт
адресно, raw failures сохранены. После общей runtime-правки обязательны новая
matched пара и полные18+25 на ней: прежние исходы в новый denominator не переносятся.

Source fix `05b645eec9` допускает только точные известные Join captions с
native input0/input1 и единственной Join icon; identity/opening/ancestry guards
сохранены. Main caption/binding подтверждены реальными наблюдениями, hidden Main
геометрия пока regression fixture. 5 focused tests/32 negatives и полный upstream
3765 PASS/10 SKIP/0 FAIL, syntax/diff-check и независимый review PASS. Новый run
`20261013T192418Z-c71363` готовит общий runtime и отдельные skill версии; до
модельных слотов нужны успешные live обе скрытые роли, Join output, Save/cleanup.

Новые payload/pins192418 допущены: общий source05b645eec9, обе sourceverify0,
старые skills/datasets/model/seed неизменны, independent pair/pins Approved.
Native canonical core подтверждён независимо: реальные hidden Main0/Joined1,
SUCCEEDED Join/exact rows, Save/persisted graph и package_closed/logged_out true,
transport ACK/exit0. Full private driver exit1/diagnostic-stopped сохранён:
дополнительный reread импорта использовал retained Package1 после Save rename;
effectfalse/cleanuptrue, inputsUnchanged не проверено. Этот дополнительный отказ
не повышен в успех и не служит основанием менять skill/runtime данной пары.
Обязательный core отдельно аттестован в live-independent-review SHA0e622b9d… .
Actual prepare новой candidate16types связан с describe15schemas/cache/handlers;
gap attestation c485ce08… поддерживает known-standard capability gap, а не
невозможность произвольной композиции151элемента. Model acceptance ещёpending.
Текущий run192418 требует полный новый denominator18+25.

Baseline192418 остановлена после2слотов: sales1 machinePASS/CLI0/cleanuptrue/JS0,
ABC1 CLI1/wrapper3/cleanupfalse, standardGroup target ещё не создан после
успешного managedJS. Actual runtime: native script source output0 active/visible/
enabled/pointbound, но generic JS deny даёт actions[]; Group требуетclick/F3.
Request validate/resolve PASS. New Sort с обязательными keys имеет тот же путь;
это мешает обязательным JS→Group и JS→newSort сценариям, не capability gap.
Исправляется только private owned temporary-preview для этих двух consumers:
latest successful managedJS execution/cleanup, nativeowner/doc/workflow/port0GUID,
fixedgestures/ACK/rebind/fresh complete schema. Cached mapping/active port не
заменяют свежесть (actual freshness_verified:false). Public JS click/F3/editor/
execute deny и Calculator/Union остаются; skill не меняется из-за runtime.
Own user81 закрыт по GUID/log/admin binding; guard адресно архивирован после
nonce SHA/mtime/no-own-process checks. Status0/check0, Helpready/browserverified,
adminlogout/MCPexit0 подтверждены. Independent recovery22e95b…PASS,19 originals
unchanged; исходные CLI1/wrapper3/cleanupfalse сохранены.
Private Group/newSort preflight исправлен в `dd8d480706`: latest owned successful
JS execution допускает только fixed output0 preview; fresh complete schema,
Close/graph restoration, prepared/completed ACK и native FLocked guard обязательны.
Общий publicJS deny и соседниеhandlers побайтно сохранены. Actual RED→GREEN и
independent review Approved, Node24.19 upstream3810PASS/0FAIL/10SKIP/exit0.
Verification SHA `a1c91ba28f775d83b90f0be0e6dc680f6d46a64813247f642c7964be18d1603a`,
review `fdd3a83d6c85bce0b938b7172ab996c07015f73cdc59effd3faad178807c3897`.
Native port selection==[port.FCell] пока fixture-only: новая matched пара203142,
actual JS→Group/directJS→newSort и обе Join hiddenroles, затем полные18+25 pending.
Исходные2baseline192418 сохраняются отдельно; предыдущие18 также не переносятся.

Новая matched пара203142 статически Approved: sourcedd8d480706, baseline dirty
только2oldskills/candidate clean, обаbuild/verify0, runtime47b871…/288 equal.
Manifest baselinec04abca3…/candidate77f51a21…, pins9cb0c002…/6f34460b…,
effective locke6eedea2… . Independent5726/4729inventory/hash/modes/source-tree
PASS, разница2skills+3metadata;43unique slots18+25 и unchanged72+2/audit2654/
model/seed/tasks. Native/catalog/schema/model gates pending; current-run192418
ещё не переключён. Приватный Join fixture делает initial ownSave до imports,
laterreplace; это диагностическая поправка после observed stale navigation,
не изменение public node-read API. Его actual newlive покаpending.

Actual203142 initial emptySave succeeded с workflow_continuations:[], а import0
NOT_APPLIED/effectfalse/cleanuptrue до nodecreation из-за stalePackage1 path.
Этот privatefixture exit1 сохранён, package_closed/logged_out/HostACKexit0 реально
подтверждены. Следующий отдельный corefixture использует прежний Save после
completedimports и оба actualhiddenroles/freshJoinoutput/Save/cleanup; standalone
postSave source reread не требуется и не заявляется. Сохранность численных inputs
проверяет exact freshJoinprojection. Pair/pins/runtime не меняются, это не modelslot.

Первый privateJS downstream203142 выполнил import/JS/Save/beforefullXML, затем
остановился до Group/Sort из-за непрочитанной roots pagination (actual32/92 с
next_cursor). Originalexit1/b274cbb2… сохранён, actualclose/logout/ACKexit0 verified.
Отдельный private proof-2 по TDD читает все roots pages до выбора Graph ref;
sameobservationID/revision/bounded16, затем отдельные details pages. Static review
Approved0da15709…; actual managed preview/native selection по-прежнемуpending.

NewJoin core203142/proof-2 actualPASS/independentreview2bbc5532…:
обаhiddenroles/fresh exact2rows/inputprojections/Save/3node2linknoJSpackage/
cleanup/logout/ACKexit0; standaloneInputReread=false. JSproof-2 исправилpaging,
но stoppedexit1 до downstream на intentionally forbidden genericUI call:
normalHost IPC скрывает текст под LOGINOM_RUNTIME_FAILED; stopreview e2cebed0…
подтверждаетclearcleanup/noeffects. Первоначальное объяснение через UI validator
опровергнуто проверкой реального user-profile routing: bridge удаляет
dock_ui_action из catalog и отклоняет вызов как Unknown Dock tool (-32602) до
uiAct/validateUiAction. Instrumentedproof-3 также exit1 до downstream; его узкий
wrapper ожидал другой код (-32603), исходные результаты сохранены. Own package
closed/logged_out и Host ACKexit0 подтверждены. Privateproof-4 использует обычный
managed-entry: actual catalog подтверждает отсутствие genericUI tool, live JS
port — allowed_actions:[], actual pure guard на live snapshot проверяется отдельно
и не объявляется live UI receipt. Главные native Group/directSort проверки идут
штатными node calls. Product/runtime/pins неизменны; JSGroup/Sort gate ещёpending.

Privateproof-4 впервые дошёл до реального Group preflight: import/managedJS/
save-producer SUCCEEDED, затем select ACK подтвердил возврат mouse.click.
Следующий inspect остановился с Managed preview native port changed до F3 и
создания Group; Sort не вызван. Originalexit3/cleanupfalse/HostACKfalse сохраняются.
Конкретное условие составного guard по этому сообщению неизвестно. Собственная
server incarnation user:90 установлена по initialization21:39:48.808Z и двум
nativeGUID; Root адресно закрыл её, дважды проверил отсутствие и вышел из admin.
Privateproof-5 собирается только для диагностики: exact generated browser code
получает bounded tuple в error.message того же guard, без изменения predicate/
жестов/control flow и без дополнительного browser call. Он instrumented, не
является приёмкой immutable runtime; Product/runtime/pins пока не меняются.
Ownrecovery независимо подтверждён f81ff164…: точный user90 closed21:44:11.150Z,
admin91 closed21:44:42.264Z, нет повторного init/чужих session closures; оригинальный
cleanupfalse сохранён, исходные30raw/source evidence и5runtime files неизменны.

Instrumentedproof-5 установил точный conjunct по actual tuple: после возврата
click selected=[ownPort.FCell], type/subtype1/nativeIndex0/portIndex0,
sameShape/Port/Data/Cell=true; sameElement=false, oldElementConnected=false,
currentElementConnected=true. Исходный guard отклоняет заменённый DOM-элемент,
хотя native identity остаётся прежней. Originalexit3/cleanupfalse/ACKfalse сохранён;
это диагностическое наблюдение, не приёмочный PASS. Surgical source TDD fix
должен разрешить только подтверждённую post-select замену отсоединённого DOM
при прежних native/owner/selection checks и адресовать F3 текущему verified port.
До жеста/при foreign selection/native changes/connected old swap отказ остаётся.
Source correction frozen bf5dd674…: только helper/targettest/actualtuple fixture,
два RED→GREEN/218relevant tests PASS; source review/privatecandidate nativeprobe
ещёpending. Final upstream и matchedbuild следуют после чистого privateprobe.
Proof5ownrecovery independently2e649a27…: exactuser92close/noReinit/adminlogout/
37raw+56sourceClosure+4397immutableRuntime entries unchanged. Разрешённая текущая
sourceправка отмечена отдельно; исходныйcleanupfalse сохраняется.
Source review Approved f2a80fb9…/53focused independentPASS. Privatecandidate
proof6 actual Group SUCCEEDED и Save SUCCEEDED; остановка EXACT_INTEGER_REQUIRED
относится к fixture reader: Total имеет native type real, binary64 values17/21,
decimal1.7E+01/2.1E+01 с verified precision. Sort ещёне вызван. Originalexit1 и
реальные packageclose/logout/HostACKexit0 сохранены. Separateprivateproof7 должен
по actual028 исправить только Group real-number assertion; не менять sourcefix,
числа/oracle и целочисленные producer/Sort проверки. Finalnativegate pending.

Privateproof7 подтвердил оба actual native sourceoverride preflights через
existing verifier: Group A17/B21, прямой Sort B21/A11/A6, freshschema/F3/Close/
graphrestore/Save. LastSave037 readback сохраняет полный JS component/source/
declaredschema. Source DOMfix завершён: independent f2a80fb9… и full upstream
3828tests/3818PASS/0FAIL/10SKIP/exit0, root verification98cdb115… . Это не final
ordinary rebuilt gate: first export-group остановился в input_mapping, Done
enabled, но finish_wizard недоступен из-за unobserved input_port_context.
Публичный запрос/схема/opening/mapping корректны; точный native predicate ещё
неизвестен и требует bounded readonly capture. Originalexit3/cleanupfalse
сохраняются. Sourcefix не ослабляет общий JS UI guard или Export ownership.
Independent recovery cf1fbfc8… подтверждает закрытие ownuser95/admin96 и полное
равенство JS component before/afterSort; CSV/finalgate не подтверждены. Следующая
минимальная diagnosticfixture Import→Group→Export сохраняет actual Group source/
schema/labels/breadcrumb ширину; bounded readonly preparedInputPort/navigation
capture нужен до нового guardfix. Non-reproduction не считается основанием для
Product changes.

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


## Checkpoint: private artifact delivery и обязательная Sort-ветвь

Proof8 остановился до Import/Group/Export: original result45f825bc…/exit3/
cleanupfalse сохранён. CSV prepared/upload/checkpoint совпадают (27bytes/
SHA c5235fe2…); private navigation shim ошибочно требует standalone frame
у artifact download wrapper. Offline pinned generator воспроизводит
PINNED_WORKSPACE_CODE_MISMATCH до browser send; непосредственно записан
BROWSER_CALL_UNCERTAIN. Это не доказательство Product Export regression.
Proof9 сохраняет обязательные JS→Group и прямой JS→Sort→ExportSort,
full JS before/after, afterproducer read и CSV/5nodes4links. Дополнительный
ExportGroup для этого gate не требуется; его прежний failure остаётся аномалией.
Independent proof9 review8e2d847c… Approved, preview-only override byteequal7,
60source/32fixtures/104protected match; ошибочного navigation shim здесь нет.
Обе private fixtures diagnostic/nonacceptance; обычная rebuilt проверка обязательна.
Independent delivery review7030b977… подтвердил private shim failure; source
правка не нужна. Strict ownership user97 не установлена, сессия сохранена;
ownadmin98 logout/MCPexit0 подтверждены. Это не recoveryPASS: originalfalse
остаётся. Root proof9 запущен отдельно после fresh no.writer/deadoldruntime/
60+32hash checks/newstate+chat+browser; independent review разрешает эту
изоляцию без изменения user97. Model calls по паре203142 остаются0.
Условная новая matched пара225648-cc76ca собирается параллельно на общем
committed source3a33edcae8; текущий stopped pointer192418 не меняется.

Proof9 original0547cd7e…/root7470exit3: Group/directSort/Save прошли,
обязательный ExportSort AMBIGUOUS/input_mapping до CSV. Cleanup/logout/ACKfalse
сохранены. LastSave036 readback f4313494… подтвердил полное равенство JS
component/source/declaredschema после обеих ветвей; это не CSV/finalgate.
Теперь Export blocker воспроизведён на обязательной ветви; нужен bounded readonly
capture точного native predicate перед surgical TDD fix. Product guards/skill
не менять по предположениям. Пара225648 source3a33/runtimef262e52c… собрана/
bothverify0, но остаётся условной: commonruntime fix потребует следующую пару
и полные18+25. Ownproof9 recovery independently48163591… подтверждён:
строго bound user99 closed/admin100logout/MCPexit0, unknownuser97 сохранён.
44raw/60source/4397runtime unchanged; full savedJS before/after равен.
Pair225648 independent43b494ad…/pins3b56a9b3… Approved после mode0400 freeze,
0models/0outcomes. Static Product/primaryaudit783c7650… Approved; runner/graph
в этом review имеют self-review limitation и проверяются отдельно.
Proof10 readonly capture дополнен exact rawcrumbset/effective labels/полным
predicate и bounded projection; verification4957c301…/review9f466a29… Approved,
62source/37fixtures/132historical hashes match,19tests/typecheck/syntax PASS.
Root81926 live запущен после ready/status-only activation72c602c4…;
моделей0, guards/source/pins unchanged. Это diagnosis, не ordinary acceptance.


Proof10 original468c4235…/root81926exit3 изолировал exact caption conjunct:
final export-sort:n5 имеет verified own native input logical0/native_index1;
unique/bounded/chain/icons=true, exact=false. Hidden crumb7 raw «Источник данных»
получил effectiveLabel пустую/hiddenCaption=false, а crumb8 «Настройка» распознан.
Old workspaceUI80d27… принимает длинную «Входной источник данных», но не actual
короткую подпись. Surgical TDD fix ограничен этой подписью verified prepared port0;
owner/native/chain/icons/sensitivity/uniqueness и publicJSdeny сохраняются.
Rootownuser101 строго bound41b9b3a8… и адресноclosed/admin102logout/MCPexit0;
originalcleanupfalse сохранён. Неизвестный user97 завершил сам сервер по timeout
23:19:16Z; root его не закрывал и ownership не утверждает. LastSave036 readback
7f377888… подтвердил full savedJScomponent/source/schema equal после Group/Sort.
Sourcefix ещё не завершён; commonruntime change потребует новой matched пары и18+25.

Source Export caption fix завершён: workspaceUI1d7f27a7… содержит один alias
для verified logical input0; actualfixturea2f562ad…/test994249ab… дали RED→GREEN
и15negativevariants.350focusedPASS/verificationa8fc54e1…, independent09e5c7f9…
Approved. Root pinnedNode24.19 fullupstream3830tests/3820PASS/0FAIL/10SKIP/exit0,
verificationc67cde34…; три source hashes проверены повторно после suite.
Proof10 recovery independentlyf85a02cf… подтверждён,1993raw/4729resources unchanged,
full savedJScomponent equal; currentworkspaceUI изменён только намеренной правкой,
old80d27immutable цел. Ordinary rebuilt nativeExport/CSV и новая matched18+25
по-прежнему обязательны. Sourcefix не меняет skill/policy/Protocol/publicJSdeny.


Новая matched пара233119-4699a5 source41101ae0b2/runtimebf2fd06b… собрана/
bothverify0 и independently Approved pair130d7d7f…/pins791829db… . Pins6944fa22…/
8ceb74b8…/locke2776d98…/provenancefd1ec5a5… frozen0400;72+2/model/seed/tasks/
43slots unchanged,0models/0oldoutcome transfers. OrdinaryJS root72815exit0,
result507286da…: оба native Group/directSort, ExportSortCSV/5nodes4links,
fullsavedJSsource/component/schema unchanged, publicgenericJSdeny и actual
packageclose/logout/shutdown confirmed. Независимый live review ещёpending.
OrdinaryJoin root22971 running после e6d39d2a… preflight; newrawhiddenDOM capture
не заявляется — проверяются nativeopening ACK/preparedrole context/граф/oracle.
Freshschema probe67472exit0/15standard schemas,0c2166c3… result; actualprepare16
изordinaryJS связан в gap prerequisitef958175b… разныхSession той же immutable
сборки. ProbeexplicitLogout=false сохранён, не подменяется ACK; gapreviewpending.
Current-run192418 остаётся stopped доordinarygates; полные18+25 не запускались.

Все ordinarynative prerequisites завершены независимо: Join root22971exit0/
result8cc5a138…/review7c59cfeb… подтверждает оба native roleopening/context,
fresh[[1,5,15],[1,10,15]], saved3nodes2linksnoJS, actual ownclose/logout/ACKexit0.
Standalone postSaveinputreread/newrawhiddenDOM capture не заявлены; прошлое
hiddenDOM evidence только supporting. JSgate independentlyc2376fff… PASS.
Fresh gap prerequisite independentlyaec86a27… Approved на actual15schemas+
16prepare/31cachekeys той же immutable233119; probeexplicitLogout=false остаётся.
Rootseriesadmission411b35ae… активировал current-run233119, oldpointer сохранён
0400. Новый denominator18baseline+25candidate/first9+16repeats, старые outcomes
не переносились; все прежние policy/math/review gates и предел2коррекций сохраняются.
Ordinary source/build/native prerequisite закрыт отдельно; полные43 ещёне выполнены.

Fresh baseline233119 sales-by-category/1 completed CLI0/wrapper0/cleanuptrue:
policy/oracle/calculation/history/identity/graph/export PASS, JS0; attempta01a1c0e…/
audit8a6ea80e…/Session ses_ec847ba38ffeWd3bMWkvwHlctf,327s. Model responses
получены, прежнийOAuth401 не повторился. Sales/2 также completed CLI0/wrapper0/
cleanuptrue: policy/oracle/calculation/history/identity/graph/export PASS, JS0;
Session ses_ec841c075ffe63Lv3f42lwlzZ3. Baseline completed2/18/candidate0/25;
ABC/Pareto1 сейчасactive root85644. Все18baseline обязательны доcandidatefirst9;
baseline semanticmanualreview не добавляется.


На 2026-10-14 00:27 UTC в итоговой серии `20261013T233119Z-4699a5`
завершены 3/18 baseline и 0/25 candidate. `abc-pareto-groups/1`
(Session `ses_ec83bda4cffeSynVwFH3wCzQvZ`) завершился с CLI exit 0,
wrapper exit 1, oracle и полным расчётом PASS, cleanup подтверждён.
Два JS-узла дали policy failure `JAVASCRIPT_NOT_ALLOWED`: этот исход baseline
сохранён как замер исходного skill, без повторного запуска или исключения
из denominator. SHA attempt `793a8112…`, audit `371e128f…`.
После завершения root85644 и проверки отсутствия `.writer` запущен
`monthly-demand/1` (root2256). Следующий плановый слот —
`risky-approved-claims/1`. Полная серия и приёмка ещё не завершены.


На 2026-10-14 00:35 UTC `monthly-demand/1` завершился успешно:
CLI/wrapper exit 0, oracle, полный расчёт и policy PASS, JS-узлов 0,
cleanup подтверждён. Session `ses_ec83209c8ffe7IlsZil6VEzyop`,
SHA attempt `ead66583…`, audit `0d683b46…`. Завершены 4/18 baseline,
0/25 candidate. После завершения root2256 и проверки отсутствия `.writer`
запущен `risky-approved-claims/1` (root97266); далее планируется
`campaign-roi-by-channel/1`. Итоговая приёмка остаётся незавершённой.


На 2026-10-14 00:43 UTC завершены 5/18 baseline, 0/25 candidate.
`risky-approved-claims/1` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec82a8030ffeJirBk4gJptkkLo`,
SHA attempt `0d9e0e8c…`, audit `a221aa9c…`. Наблюдённый `REQUEST_REJECTED`
из-за неподдерживаемой подписи Filter исправлен новым запросом к стандартному
Filter, который затем получил `SUCCEEDED`; это baseline evidence, а не
candidate recovery PASS. Root97266 завершён, `.writer` отсутствовал перед
запуском `campaign-roi-by-channel/1` (root29101). Следующий плановый слот —
`first-last-touch/1`; итоговая приёмка ещё не завершена.


На 2026-10-14 00:50 UTC завершены 6/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/1` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec82324e8ffe4370QyZIlzph7o`,
SHA attempt `08df55f5…`, audit `49ba77dc…`. Root29101 завершён, `.writer`
отсутствовал перед запуском `first-last-touch/1` (root82747). После него
остаются 11 предусмотренных baseline повторов: sales/3, остальные пять
сценариев/2–3. Candidate first9 разрешён только после всех 18 baseline.
Все шесть завершённых попыток дали oracle и полный расчёт PASS;
policy PASS у пяти, ABC/Pareto использовал два JS-узла. Приёмка ещё не завершена.


На 2026-10-14 00:54 UTC завершены 7/18 baseline, 0/25 candidate.
`first-last-touch/1` прошёл oracle и полный расчёт, CLI exit 0, wrapper exit 1,
cleanup подтверждён; один JS-узел дал `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec81ccd64ffeAxnGWvlWW7Q8rB`, SHA attempt `5d97c4d8…`,
audit `8ca3380d…`. Во всех семи завершённых baseline oracle/расчёт PASS;
policy PASS у пяти, JS встретился в ABC/Pareto и first/last touch.
Root82747 завершён, `.writer` отсутствовал, оставшиеся 11 слотов и их root logs
не существовали. Root17410 последовательно запускает отдельные процессы
проверенного `run-node-selection-attempt.ts`: sales/3; ABC/2; monthly/2;
claims/2; ROI/2; first-last/2; ABC/3; monthly/3; claims/3; ROI/3; first-last/3.
Каждый следующий процесс допускается только после CLI exit 0, modelStarted,
finishedAt, cleanup true, отсутствия blocker/collection failures/timeout и
wrapper exit 0 или 1. Baseline policy failure остаётся измерением; техническая
аномалия останавливает очередь для разбора. Candidate в очередь не включён.
Текущий слот — sales/3; полная серия и итоговая приёмка ещё не завершены.


На 2026-10-14 01:00 UTC завершены 8/18 baseline, 0/25 candidate.
`sales-by-category/3` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup подтверждён. Session `ses_ec818eb1cffeXh48iCuXH9H55q`,
SHA attempt `7fe5ccbf…`. Все три sales-прогона успешны. Root17410 продолжает
ту же последовательную очередь; текущий слот — `abc-pareto-groups/2`.
Новые результаты не переносятся из прежних серий; приёмка ещё не завершена.


На 2026-10-14 01:07 UTC завершены 9/18 baseline, 0/25 candidate.
`abc-pareto-groups/2`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, два JS-узла и policy failure `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec813c7c4ffel3RV1nTZWRsmwf`, SHA attempt `260d6b1b…`,
audit `e061eec9…`. Во всех девяти baseline oracle/расчёт PASS, policy PASS
у шести. Root17410 активен и последовательно перешёл к `monthly-demand/2`;
следующий слот — `risky-approved-claims/2`. Приёмка ещё не завершена.


На 2026-10-14 01:15 UTC завершены 10/18 baseline, 0/25 candidate.
`monthly-demand/2` прошёл oracle, полный расчёт и policy, JS-узлов 0;
CLI/wrapper exit 0, cleanup true. Session `ses_ec80d497bffeCpBAzDR1JtjJ1u`,
SHA attempt `a76ae1f3…`. Во всех десяти baseline oracle/расчёт PASS,
policy PASS у семи. Root17410 продолжает очередь, следующий слот —
`risky-approved-claims/2`. Полная серия и приёмка ещё не завершены.


На 2026-10-14 01:23 UTC завершены 11/18 baseline, 0/25 candidate.
`risky-approved-claims/2`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec805bdc6ffeJ43aeVqcT3HBbP`,
SHA attempt `13ec8ec2…`, audit `efa96085…`.
Во всех 11 baseline oracle/расчёт PASS, policy PASS у восьми. Root17410
активен; текущий слот — `campaign-roi-by-channel/2`, далее first-last/2
и пять третьих прогонов. Итоговая приёмка ещё не завершена.


На 2026-10-14 01:30 UTC завершены 12/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/2`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7feeac4ffeTlnFgqeXYj1gOS`,
SHA attempt `335b6403…`, audit `2689a4a1…`.
Во всех 12 baseline oracle/расчёт PASS, policy PASS у девяти. Root17410
активен; текущий слот — `first-last-touch/2`, далее пять третьих прогонов.
Итоговая приёмка ещё не завершена.


На 2026-10-14 01:34 UTC завершены 13/18 baseline, 0/25 candidate.
`first-last-touch/2`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, один JS-узел и `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec7f82e21ffe0w2dxt3HwdHP5M`, SHA attempt `b0ac60e4…`,
audit `73f42f65…`. Во всех 13 baseline oracle/расчёт PASS, policy PASS
у девяти. Root17410 активен; текущий слот — `abc-pareto-groups/3`,
далее monthly/3, claims/3, ROI/3, first-last/3. Приёмка ещё не завершена.


На 2026-10-14 01:43 UTC завершены 14/18 baseline, 0/25 candidate.
`abc-pareto-groups/3`: oracle/полный расчёт PASS, CLI exit 0, wrapper exit 1,
cleanup true, два JS-узла и `JAVASCRIPT_NOT_ALLOWED`.
Session `ses_ec7f48e58ffeP9ePIP2eZTP9vd`, SHA attempt `817532d9…`,
audit `59dd4627…`. Все три ABC baseline прошли oracle/расчёт с двумя JS-узлами
каждый. Во всех 14 baseline oracle/расчёт PASS, policy PASS у девяти.
Root17410 активен; текущий слот — `monthly-demand/3`, далее claims/3,
ROI/3 и first-last/3. Итоговая приёмка ещё не завершена.


На 2026-10-14 01:51 UTC завершены 15/18 baseline, 0/25 candidate.
`monthly-demand/3`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7ec4d32ffe1AENYSp2CqOFv4`,
SHA attempt `5cb62388…`, audit `727c8d9e…`.
Все три monthly baseline успешны без JS. Во всех 15 baseline oracle/расчёт
PASS, policy PASS у десяти. Root17410 активен; текущий слот —
`risky-approved-claims/3`, далее ROI/3 и first-last/3. Приёмка ещё не завершена.


На 2026-10-14 02:03 UTC очередь root17410 остановлена на технической аномалии
`risky-approved-claims/3`: Session `ses_ec7e51480ffevfxBR9hkm10mSb`,
CLI exit 1, wrapper exit 3, cleanup false,
`SELECTION_CLEANUP_UNCONFIRMED`, SHA attempt `596780a5…`.
Начатый слот сохранён в denominator: завершены 16/18 baseline,
15 oracle/полных расчётов PASS, 10 policy PASS; ROI/3 и first-last/3 не запускались.
Экспорт реально выполнился, но чтение файла остановилось с
`NODE_APPLY_STOPPED: Export file search scroll budget exhausted`:
12 успешных прокруток достигли top12000, max_top14089, целевой файл не найден.
Полного Save нет; Package1 остался несохранённым, full calculation PASS
этого слота не заявляется. CLI649907 умер; `.writer` намеренно сохранён.
Независимая read-only проверка связала user137/init01:50:59.405Z с пятью
фактическими native GUID этой попытки; fresh admin inventory видит эту же
сессию с CreateTime01:50AM (UI точность до минуты, не soleidentity).
Root PlaywrightMCP84741/admin138 открыт для адресного recovery user137;
user132/134/136 и остальные сессии не трогались. Проверка exact receipt-owned
allowlist уже скопированных файлов идёт параллельно; source/runtime не менялись.
До подтверждённого закрытия own-сессии и адресного guard recovery следующие
модельные попытки запрещены. Исходный failed outcome не заменяется.


На 2026-10-14 02:18 UTC адресное recovery собственной user137 завершено:
strict binding `4924ba9d…`, server close02:05:01.287/.288Z,
admin138 logout02:05:57.854Z, PlaywrightMCP84741 exit0.
User132 исчез по штатному timeout1800s02:03:52.914Z; user134/136 не закрывались.
Guard review `5a9a75c7…` подтвердил exclusive admission, deadCLI/runtime,
неизменный nonce8140…; root атомарно архивировал intact `.writer` в
`.writer-recovered-node-selection-20261013T233119Z-4699a5-user137`.
Receipt `36b7203f…`, независимый final recovery `6f4b1c6e…`:
inode/bytes сохранены, исходный failed attempt `596780a5…` остаётся прежним.

После read-only плана `a0955691…` и независимого review `b1247c38…`
root перепроверил102 exact receipt-owned files и перенёс их same-device68
в `/workdir/UserStorage/user/node-selection-archive-20261014T0214Z-4699a5`.
Receipt `82953398…` и полный inverse-path map сохранены отдельно:
614→513 top-level entries фактически; target bytes/SHA/inode/mode/mtime
сохранены, исходные пути отсутствуют, остальные имена не изменились.
34 input +34 savedLGP +34 CSV уже имели проверенные локальные копии.
Текущие failed CSV/input и неизвестные файлы вне allowlist. Файлы не удалены;
перед будущим reopen/reproduction LGP и входы нужно вернуть по inverse map
на точные прежние пути. XML и raw evidence не переписывались.
Предварительный сбой служебной find-команды на embeddedNUL произошёл до
intent/mkdir/move; исправлен только delimiter эфемерной команды.
Оценка max_top11665 остаётся прогнозом до следующего ordinary наблюдения.

Source/runtime/skill/закреплённые входы не менялись: matched233119 продолжается,
пересборка18+25 не требуется. После exact recovery/absence.writer и root
postmove-check запущен root23200: только оставшиеся ROI/3 и first-last/3,
последовательно отдельными CLI с тем же gating. Независимая postmove-проверка
идёт параллельно read-only. Baseline completed16/18,15oracle/полных расчётов PASS,
10policy PASS; candidate0/25. Failed claims/3 не заменяется и не исключается.
Для следующих live-слотов каталог нужно периодически поддерживать адресным
архивированием только finished cleanup-confirmed receipt/copied artifacts;
каждый перенос требует того же exact pre/post-check и inverse map.
Итоговая приёмка ещё не завершена.


На 2026-10-14 02:26 UTC завершены 17/18 baseline, 0/25 candidate.
`campaign-roi-by-channel/3`: oracle/полный расчёт/policy PASS, JS-узлов 0,
CLI/wrapper exit 0, cleanup true. Session `ses_ec7cc35e5ffeOMtGOMaIZcZ0GG`,
SHA attempt `1ffc6e9f…`, audit `d79df2c9…`.
Первый плановый ordinary export после архивирования успешно получил CSV;
sourceworker read-only извлекает actual scroll bound из его raw без extra probe.
Postmove независимый review `6e1a3ae9…` подтвердил102targets/absenceoriginalpaths,
213local evidence,10pins/locks,74source,288runtime каждого payload unchanged,
а также failed CSV/input и архив guard. Recovery и storage действия завершены;
активен только root23200 на последнем baseline `first-last-touch/3`.
Во всех17startedslots16oracle/полных расчётов PASS,11policy PASS; failedclaims3
сохранён. После последнего baseline запланирован exact incremental archive
его и ROI3 шести успешных/copied файлов в тот же own archive, с прежними
pre/postconditions и restore map. Сопоставимая серия/skill/source не меняются.
Полная приёмка ещё не завершена.


На 2026-10-14 02:33 UTC baseline итоговой matched-серии завершён:18/18startedslots,
17oracle/полных расчётов PASS,11policy PASS. Последний `first-last-touch/3`
(Session `ses_ec7c5ee43ffe21njjqq6wmkAII`) дал oracle/расчёт PASS,
CLI0/wrapper1/cleanuptrue, JS1 и `JAVASCRIPT_NOT_ALLOWED`;
SHA attempt `63eb7bdf…`, audit `241cb302…`. Root23200 завершён exit0.
В17полных baseline-аудитах JS-узлов9: ABC3×2 и first-last3×1;
failedclaims3 остаётся CLI1/wrapper3/cleanupfalse/incomplete без замены.
Фактическая baseline-хронология отличается от заданного в исходном плане
порядка Task3: sales/2 выполнен сразу после sales/1, sales/3 — перед остальными
attempt2. Это отклонение сохраняется в ledger;18уникальных слотов/аналитические
входы/model/pins/фазы и последовательное использование профиля не изменялись.
Исходное правило candidate first9 и stop-on-first-policy-violation сохраняется.

Обычный ROI3-журнал после archive подтвердил max_top11713 и успешное получение
exactCSV286B/SHA1d8460f2… после10прокруток доtop10000, затем verified workflowreturn.
Observation `1610d2a6…`; initial target DOM outside_viewport не выдаётся заhit-testPASS.
Перед candidate подготовлен read-only incremental6plan `7be74b8a…`:
ROI3+firstlast3 own inputs/savedLGP/CSV, existingarchive102→108,
freshroot519→predicted513, fullinversemap. Независимый review ещё ожидается,
перенос этих6файлов ещё не выполнен; candidate0/25, новыхпроцессовнет.
Полная приёмка остаётся незавершённой.


На 2026-10-14 02:46 UTC финальный baseline ledger `7db572d8…` независимо подтверждён:
18unique started/finished,17machine/oracle/расчёт PASS,11policy PASS,
6FAIL и1incomplete,JSnodes9/calls10/successful9;330assistant model/variant messages,
18parentless/childfree snapshots,54runtime files,74source/10inputs и оба288runtime.
Incremental6перенос послеreview `0e70093b…` завершён: receipt `f0d2a18a…`,
513root/108archive измерены; postmove review `c9135a0d…` подтверждает все108bytes/
inodes/sourceabsence/обратнуюкарту и неизменность231evidence/pins/source/runtime.

Candidate first3 запущены root56096 в закреплённом порядке
sales/1→ABC/1→monthly/1; следующий слот начинается только при CLI/wrapper0,
cleanup/modelStarted/finishedAt/policy/oracle/fullcalculation PASS, иначе очередьSTOP.
`sales-by-category/1` завершён: Session `ses_ec7b8c849ffeWvjumDgTnvsJCs`,
CLI/wrapper0,cleanuptrue,policy/oracle/расчёт PASS,JS0;
SHA attempt `28e2d1d6…`, audit `bd4b399d…`.
Candidate completed1/25 (firstwave1/9); сейчас ABC/1,Session `ses_ec7b3d89fffeuHWc7SGKou3bao`.
Read-only ранний наблюдатель использует существующий frozen `inspectSelection`
на complete own-session tool_use parts в standardcases: canonical
`target.type=programming.javascript` означает `JAVASCRIPT_NOT_ALLOWED`
независимо от completed/error и output.running; при таком доказательстве root
прерывает own supervisor черезSIGINT и не запускает оставшиеся digest slots.
Describe/Calculator formulas/source refs и произвольные aliases не выдаются за
такое доказательство; финальный полный аудит остаётся обязательным.
Новый helper/source не создавался; общий build/skill/pins unchanged.
После cleanfirst3 нужен адресный archive9ихcopiedfiles передследующимchunk3.
Полная приёмка ещё не завершена.


На 2026-10-14 03:09 UTC candidate завершил 2/25 слотов (первая волна 2/9).
`sales-by-category/1` остаётся полным PASS. `abc-pareto-groups/1`, Session
`ses_ec7b3d89fffeuHWc7SGKou3bao`, завершён CLI 1 / wrapper 3 / cleanup false /
incomplete; oracle отсутствует, полного расчёта нет. Исходный SHA attempt
`2f048e06af106c17263fcff9ce2b97b2d8ead4d0c311444e39250c9bc6d07fb2` сохранён.
JS-попыток не наблюдалось, но без сохранённого графа это не policy PASS.
Root 56096 остановился exit 1; месячный спрос в этой очереди не запускался.

Отказ `calc-share-1`: `NODE_APPLY_STOPPED` с причиной
`WIZARD_OPEN_NOT_CONFIRMED`. Последующий снимок показывает нужный Calculator
`98530181-7349-4b26-a343-e7ac5ad82974` и правильный breadcrumb, но получен новым
`readUi()` после ошибки; точное состояние провалившегося предиката отсутствует.
Конфигурация формулы ещё не начиналась. Протокол не умеет продолжить unresolved
фазу open; inspect/resume/recover/cancel не восстановили её. Причину нельзя
приписать параметрам модели или объявить доказанным общим runtime-дефектом.

Адресное recovery выполнено отдельно от failed outcome. Strict binding
`e794705a…` подтвердил собственный `user:146`, init 02:44:52.092Z и четыре native
GUID. Root через Playwright MCP закрыл только эту сессию, вышел из admin:147 и
завершил bridge 11663 exit 0. Независимый postclosure review `3800ac5c…` подтвердил
server close 03:05:10.044Z, logout 03:05:24.132Z, завершение своих процессов и
неизменность raw 16, source 74, pins 10 и обоих payload runtime 288.
Guard с nonce `0fdc8b00-5d1e-448f-9b8a-8278dc2fdc5f` перенесён целиком в
`.writer-recovered-node-selection-20261013T233119Z-4699a5-user146` после сверки
inode и bytes; receipt `4cc274c5…`. Финальный независимый postarchive review ожидается.

Решение владельца выполнения: после этого review закончить оставшиеся первые
слоты только для диагностики, в frozen порядке monthly → claims → ROI →
first-last → explicit-js → tags → recovery. Первая волна уже нечистая: повторы
2/3 закрыты, ABC/1 не заменяется, полная приёмка не достигнута. При доказанном
нарушении policy дальнейшие слоты этого digest останавливаются. Параллельно
готовится отдельный deterministic native diagnostic без LLM для exact open
predicate; до воспроизведения product/runtime/skill/pins не меняются.


На 2026-10-14 03:18 UTC адресное recovery ABC/1 завершено: независимый
postarchive review `bdfcd9ee…` подтвердил сохранённые inode/bytes guard,
отсутствие исходного `.writer` и неизменность failed outcome, raw, pins,
исходников, runtime и квитанций закрытия. Original ABC/1 не повторялся.

`monthly-demand/1` завершён полным PASS: Session
`ses_ec79d2db9ffe53yzDMRmbd2a4T`, CLI/wrapper 0, cleanup true, oracle/policy/
calculation PASS, JS nodes/calls 0. Машинный аудит подтвердил полную историю,
settlement, идентичность экспорта и связность сохранённого графа.
SHA attempt `a781c5f7d45e6015b202589f880974544d3aca2bd1d8747183e4ca192610cf07`,
selection-audit `3f5251f0966a645b6579cc829d004175547d3e67380860324974bc86eecfe9f4`.
Root 59629 завершён exit 0; длительность CLI около 484 секунд.
Candidate завершил 3/25 (firstwave 3/9): два полных PASS и один технический
incomplete; JS-вызовов не наблюдалось. Baseline остаётся 18/18, 17 oracle/
расчёт PASS, 11 policy PASS. Общий build/skill/pins не менялись.

Перед следующим frozen модельным слотом claims/1 профиль временно выделен
для отдельного deterministic native diagnostic ABC opening без LLM.
Подготовка и TDD идут в ignored private run directory; независимый review
проверяет trace без изменения guard/control flow. Live diagnostic ещё не
запущен. Его результат не заменяет ABC/1 и не считается acceptance.
Первая волна остаётся нечистой, повторы закрыты, полная приёмка не завершена.


На 2026-10-14 03:35 UTC separate native ABC diagnostic воспроизвёл отказ
`calc-share-1` на пятом узле после четырёх успешных стандартных операций.
Root 32456 завершён exit 3; модельных вызовов 0. Result SHA
`307e12720ae23ae2e76d554ccdb08d94a201b15cb5591fc1e738c2bb9dfdaf6d`.
Instrumented результат не считается acceptance и не заменяет candidate ABC/1.
Private helper выполнен по TDD: четыре теста, целевой typecheck и syntax PASS;
static independent review `600579b3…` подтвердил неизменный исходный guard,
4456 source hashes, один исходный browser send без дополнительных чтений.
Root сохранил reviewed binding `fc84c59b…`; изменены только ready/status,
active binding `40984ed7…`. Product, matched payload и acceptance pins unchanged.

В captured pre-catch tuple для `calc-share-1:n29` через 534 ms после начала
browser call `contextMatches=true`, `intendedWizard=true`, native GUID before/
after совпал, dialogs 0. Единственный отказавший conjunct — две busy-маски.
У первой `target_tid=MF;TF-1;WizrdMCF`, у второй target_tid/dialog_ref null;
поэтому `ownedLoading` отказал и ожидание масок не начиналось. Источник второй
маски пока не установлен: её class/parent/geometry/cache identity отсутствуют
в первой trace. Это основание для уточнения диагностики, не для blanket-ignore
или изменения product guard. Готовится отдельная private v2 trace, сохраняющая
readonly DOM ownership в том же исходном browser call; v1 files/raw не меняются.

Cleanup/logout/shutdown диагностического Host не подтверждены, own PID 794091
в close receipt завершён exit 1 / ACK false. Package1 не сохранён. Нужны strict
server binding и адресное Root recovery этой новой собственной сессии; admin
inventory получен, сессии ещё не закрыты. Next candidate claims/1 не запускался.
Candidate остаётся 3/25 (два полных PASS, один incomplete), baseline 18/18.
Firstwave нечистая, повторы закрыты, итоговая приёмка не завершена.


На 2026-10-14 03:39 UTC native diagnostic v1 полностью проверен offline:
independent live review `8aec753b…` подтвердил 3557 journal rows одной
session/runtime/actionManifest, 61 public receipts, четыре runtime journals
и все 68 raw references. Sole failed conjunct — masks.length; источник
второй маски по этим данным ещё не доказан.

Адресное recovery этой диагностики завершено: strict binding `cf3dcf03…`
подтвердил `user:150`, init 03:24:21.547Z и четыре native GUID. Root через MCP
86234 закрыл только 150, logout admin:151 и bridge exit 0. Independent
postrecovery review `3100e4ca…` подтвердил server close 03:36:37.536Z,
logout 03:36:47.698Z, завершение own PID 794091, отсутствие `.writer`,
неизменность raw 68, source 4456, acceptance source 74, pins 10 и runtime
288 каждого payload. Изменения профиля/guard не требовались.

Original diagnostic `307e1272…` сохраняет cleanup/logout/shutdown false;
recovery записано отдельно. Candidate ABC/1 `2f048e06…` остаётся failed.
Профиль свободен; следующих model slots пока нет. Приоритет — уточнить
владельца второй маски отдельной private v2 trace, сохранив v1 неизменной,
затем решить необходимость минимальной runtime-правки. Если общая правка
потребуется, прежняя matched-серия останется исключённой из итоговой приёмки,
а новая потребует всех прежних 18+25 gates. Skill по технической ошибке
не меняется; JS fallback не разрешён. Первая волна 3/9, candidate 3/25,
полная приёмка не завершена.


На 2026-10-14 03:45 UTC private mask diagnostic v2 запущен Root 26816
после independent static approval `b8c5ae24…`: семь тестов PASS, 4458 source
hashes и 79 V1 originals совпали. Дополнительно закрыты два RED→GREEN finding:
nonboolean cached value не выводится, cached foreign DOM getter не вызывается.
V2 capture выполняется в том же исходном evaluate; temporary field удаляется
до исходного guard/public snapshot. Повторных чтений/кликов/IPC не добавлено.
Пять исходных apply inputs, driver, managed entry и replay совпадают с V1.
Verification `e11dbb6e…`, reviewed binding `5c4eac75…` сохранён; Root изменил
только ready/status, active binding `9ae3a3a8…`. Каталог
`abc-wizard-mask-diagnostic` отделён от неизменного V1.
Live input доставлен, импорт выполняется. Model calls 0; no early Save,
Product/skill/payload/pins unchanged. Native diagnostic не является acceptance.
Следующие модели не запускались; candidate 3/25, firstwave 3/9 нечистая,
повторы и итоговая приёмка остаются незавершёнными.


На 2026-10-14 03:58 UTC V2 native diagnostic завершён Root 26816 exit 0,
без LLM: пять исходных apply и diagnostic-save SUCCEEDED, package_closed /
logged_out true, no discard, Host ACK/exit 0. Result
`2f2e995ca9db14ae9ed1565664c2abb5d2238de7b403c10ceb8c59a38f0ac19a`.
Independent postlive review `cc0e67c3…` подтвердил 3988 journal rows одной
session/runtime/actionManifest, 66 receipts, четыре journals и 73 raw,
4458 source / 79 V1 / 74 acceptance / 10 pins / оба runtime 288 unchanged.

Целевой Calculator в 557 ms показал единственную own wizard mask;
штатное ожидание 394 ms закончилось masks 0 и verified open в 951 ms.
Второй mask без TID из V1 не воспроизведён и не классифицирован. Это
non-reproduction, не Product fix, не acceptance и не замена failed ABC/1.
Save связан с own path `/user/ABCOpenDiag-d3f61ea4ba1e4fd4.lgp`, но
reopened/persisted_content_verified false; проверки сохранённого содержимого
и повторного открытия не заявляются. Дополнительная диагностика без нового
actualfailure сейчас не нужна; Product/skill/runtime/pins не меняются.

Диагностическая candidate firstwave продолжена в frozen порядке:
`risky-approved-claims/1` запущен Root 78243; Session
`ses_ec770db5bffeqJU4QzDZwcPh7p`, стандартный импорт выполняется, JS-вызовов
пока нет. После terminal нужен exact own archive трёх успешных/copied
candidate slots (sales/monthly/claims, девять файлов), с прежними статическими
pre/postconditions и обратной картой; во время active CLI файлы не переносятся.
Candidate completed 3/25, firstwave 3/9 нечистая, повторы закрыты;
полная приёмка не завершена.


На 2026-10-14 04:05 UTC `risky-approved-claims/1` завершён полным PASS:
Session `ses_ec770db5bffeqJU4QzDZwcPh7p`, CLI/wrapper 0, cleanup true,
oracle/policy/calculation PASS, JS nodes/calls 0. SHA attempt
`cd7cc72d40f5a703ab7f382ab90f501d3e477a9a0a3e01ddea6891f7f0d57f14`,
audit `27b07d0a59a02d6703e3237e0c043045734410c7464d5d222aeb4d528759a58f`.
Машинный audit подтвердил полную историю, runtime settlement, export identity
и связность графа. Root 78243 завершён exit 0; CLI около 381 секунды.

В observed history `filter-approved-high-1` отклонён до эффекта:
REQUEST_REJECTED / Unsupported node label (подпись содержит >), cleanup true.
Модель исправила подпись и с NEW operation ID `filter-approved-high-2`
успешно применила тот же стандартный Filter. JS fallback не использован;
это естественная ошибка настройки, отдельно от явного recovery fixture.

Candidate completed 4/25 (firstwave 4/9): три полных PASS и ABC/1 incomplete.
Baseline остаётся 18/18, 17 oracle/расчёт PASS, 11 policy PASS. Общие build,
skill и pins unchanged; повторы 2/3 закрыты, полная приёмка не достигнута.
Перед frozen next ROI/1 Root ждёт exact own archive девяти copied файлов
sales/monthly/claims с independent review; активных Root CLI/native/admin нет.
Read-only preparation6 `d8feff37…` сохранена (prior archive108/protected254);
отдельный final9plan готовится после claims terminal. Active/failed/unowned
файлы не переносятся, полная inverse map обязательна.


На 2026-10-14 04:13 UTC exact own archive трёх успешных candidate slots
sales/monthly/claims завершён. Final9 plan `8bf57641…` и independent approval
`e3393cf0…` сохранены без изменения readyForMove. Root operator 25780 повторил
проверки own receipt/local bytes, inode/mode/mtime/ctime/SHA, target absence,
idle profile и terminal CLI, protected268, prior108 и excluded6 до переноса.
Девять точных файлов перемещены `mv -n` на том же device68 в существующий own
archive; intent и полная inverse map записаны до переноса. Ничего не удалено.
Receipt `6b97846b8465655d3754d93dbc03afbd887074d679a7a2f64e8ea5b2392518b2`:
root526→517, archive108→117. New targets сохраняют bytes/SHA/inode/mode/mtime;
original paths absent; prior108, excluded6, protected268 и остальные root names
unchanged. Перед будущим reopen/reproduction обязательна точная обратная
реставрация соответствующих LGP и входов. Independent postmove ещё ожидается.

Следующий frozen candidate slot — ROI/1 после этого review. Root CLI/native/
admin отсутствуют; Product/skill/build/pins unchanged. Candidate completed4/25
(три полных PASS, ABC/1 incomplete), firstwave4/9 нечистая. Baseline18/18:
17oracle/расчёт PASS,11policy PASS. Повторы закрыты, итоговая приёмка не завершена.


На 2026-10-14 04:16 UTC independent postmove `16020b56…` подтвердил
117 archive names/bytes/SHA/device/inode/mode/mtime и отсутствие всех117
original paths; prior108 fullstats и excluded6 fullstats/SHA unchanged,
root517 измерен. Protected268/3excluded refs/141V1+V2raw/4458diagnostic source,
74acceptance source/10pins0400/обаruntime288 unchanged. Other root name equality
подтверждена Root operator; независимый review не заявляет повторное сравнение
полного before inventory, которого в receipt нет. Blockers отсутствуют.

Frozen следующий `campaign-roi-by-channel/1` запущен Root32921; Session
`ses_ec7615900ffeSpJbGwjzNPDotz`, стандартный импорт выполняется, JS-вызовов
пока нет. Source/build/skill/pins неизменны, инструментация private diagnostics
в этот model run не добавляется. Candidate completed4/25; первая волна4/9
остаётся нечистой, повторы закрыты, полная приёмка не завершена.


На 2026-10-14 04:22 UTC `campaign-roi-by-channel/1` завершён полным PASS:
Session `ses_ec7615900ffeSpJbGwjzNPDotz`, CLI/wrapper0, cleanuptrue,
oracle/policy/calculation PASS, JS nodes/calls0. SHA attempt
`1e37171e0efe0098f234b900f200df544cc4fdc169cbee0631f8ad15c20d637d`,
audit `4dd8c7e07a3896e4f8fabe557c0326feec01f11e0b943b6b6e9d3acc5e0e1488`.
History completeness, settlement, export identity и graph completeness PASS;
Root32921 exit0, CLI около378секунд. Обычный model run не содержит private
инструментацию. Product/skill/build/pins unchanged.

Следующий frozen standard `first-last-touch/1` запущен Root4970.
Candidate completed5/25 (four full PASS и original ABC/1 incomplete),
firstwave5/9 нечистая. Baseline18/18,17oracle/расчёт PASS,11policy PASS.
JS-вызовов в candidate standard пока не наблюдалось; это не policyPASS
несохранённого ABC/1. Повторы закрыты, полная приёмка не завершена.


На 2026-10-14 04:43 UTC candidate `first-last-touch/1` завершён технически
неполно: Session `ses_ec75aae26ffel7visXjzm5Wf31`, CLI exit1 / wrapper3,
cleanup false, attempt SHA
`284f23435c2cc4bfbfb4ecaceffb60970d1409715702fd7a66633976d8cd119b`.
Save, CSV и oracle отсутствуют; observed JS0 не является policy PASS.
Семь стандартных узлов выполнены успешно: Import, Calculator, два Group,
Join, Reform Columns (подготовка имени канала) и Sort. Ранее в progress
Reform Columns ошибочно назван Calculator; здесь сохранён фактический тип.

При Export3 native input0 имеет bbox (1164,780,15,24), нижняя граница own
canvas794, viewport800, scrollTop0/max82. После Link штатный cleanup
восстанавливает прежний scrollTop. Native GUID/роль/владелец проходят проверку,
но все девять hit points не принадлежат целевому PortCell; rightclick
не выполняется. Два covering div имеют role=presentation; точные владельцы
не установлены. Внутренний отказ NOT_APPLIED/effect false/cleanup true
не отменяет уже созданные Export и Link: внешняя операция AMBIGUOUS.
Это ошибка видимости поддерживаемого стандартного узла, не capability gap
и не основание для JS fallback. Патч для неповторившейся второй маски ABC
не выбран; V1/V2 evidence сохраняется как диагностика.

Строгая привязка собственных семи native GUID и latest server init04:22:10.525Z
подтвердила user:158; binding SHA
`f59e17748719e8d91affb42ca73a72074440f77e1690b1b8a2b87aab36a177c7`.
Закрыта только user:158 в04:40:31.099Z, admin:159 logout04:40:41.218Z,
две refresh подтвердили отсутствие собственной сессии, MCP69805 exit0.
После independent archive admission `df46f231…` guard перемещён intact
atomic rename в `.writer-recovered-node-selection-20261013T233119Z-4699a5-user158`;
receipt `ba16e90049a306a9aae2cf10a0d501478f8089574aaf11ae3089e59c564fe3b5`.
Original attempt не переписан и не повышен до PASS. Финальная независимая
проверка сохранности recovery boundary ожидается; Product/tests ещё неизменны.

Решение: непосредственно перед input0 mapping стандартного exports.text,
после Link, при доказанном выходе порта за нижний край viewport выполнить одну bounded
прокрутку собственной canvas через существующий guarded scroll.
Использовать свежий видимый non-script graph anchor с тем же container_ref,
не obscured port. Затем fresh observe должен подтвердить прежние document,
workflow, Export и canvas. Исходный openInputPort(0), native ownership,
роль и все девять hit checks остаются обязательными; если порт всё ещё
перекрыт, stale, masked/locked или диапазон недостаточен, клика нет.
Не добавляются public tools, JS grants, alias, обход guard или общий layout.

Серия233119 остановлена после18baseline и6candidate: baseline17oracle/расчёт PASS,
11policy PASS,6FAIL,1incomplete; candidate4full PASS и2technical incomplete,
firstwave6/9 нечистая. Явные JS/tags/recovery и повторы этой сборки не запускаются.
Необходимая правка общего runtime требует новой immutable matched пары и
полных18baseline+25candidate на новой сборке. Старые попытки сохраняются
исключёнными из итоговой приёмки; их нельзя заменять, переносить или повторно
считать. Политика skill и критерии приёмки unchanged; задача не завершена.


На 2026-10-14 04:50 UTC final independent recovery158 review PASS:
`a82224430bbc21ee95d92bf9fd3ed6b0b4e324d336006057e732ef82e6b2279b`.
Source .writer absent; архив сохраняет nonce/owner bytes/device/inodes7628891/7628892,
mode и mtime; directory ctime ожидаемо изменён rename. Fresh server log
подтверждает собственные closure158/logout159 без новых incarnations; own CLI/
chat/profile/currentpayload managed processes absent. Original attempt284f…
и raw16 (145parts/39messages), source74, pins10×0400, runtime288×2 и working288
unchanged. Операционное восстановление завершено отдельно от failed scenario;
CLI1/wrapper3/cleanupfalse/incomplete остаются исходным результатом.
Можно начать TDD исправление input0 clipping; общая приёмка остаётся открытой.


На 2026-10-14 04:53 UTC независимый review продолжения Export clipping
подтвердил scope, actual factory seam, сохранность guarded scroll/native GUID/
девяти hit checks и новую matched18+25. Блокеров нет. Уточнение плана принято:
existing negative guards могут сразу проходить, обязательный RED — actual
post-Link clipped input0 на старом factory; новые behavior/guards вводятся TDD.
Product implementation ведётся отдельно, source review/checks/live ещё впереди.

Подготовка сборки read-only: Bun1.3.14 revision0d9b296af, Node24.19 SHA
bc17c508… и Chromium1246 SHA1e0652a3… совпали с pins. Нужны clean detached
checkout нового общего commit, baseline verify до восстановления двух старых
skill-файлов, затем clean candidate build/verify, новые фактические closures
и ordinary native gates. Старые payload/current-run/profile не менялись.
Историческая series-stop SHA
`2dce56a9a7fe0f80179399be3aa9615067dfccc8ab6fb3813a74da25e9a921d7`
независимо сверена:24original attempt hashes/24unique Sessions,18baseline+
6candidate,4candidate selection-audit complete PASS,2incomplete,19unstarted.


На 2026-10-14 04:59 UTC для следующей matched пары уточнён prospective
порядок: independent pair review + все ordinary native gates + immutable pins,
затем candidate9; при чистом gate — baseline18, затем candidate16.
Runtime/runner/audit менять для перестановки не требуется: audit каждого
слота читает pinned task/attempt/mode и не зависит от baseline receipts.
Это execution order; full acceptance по-прежнему требует все43freshslots,
18standard policy PASS, oracle не хуже нового baseline, все исключения/
recovery/manual reviews. Сравнительный PASS до завершения обеих фаз запрещён.

Новый effective acceptance lock до первой модели обязан закрепить этот
executionSchedule. При ранней остановке сохранить каждый started slot и
явно отметить unstarted; старые outcomes0, никаких замещающих повторов.
Один общий профиль, уникальные пути/новые Sessions, sequential processes
сохраняются. Нагрузка/storage остаются факторами локальной серии при любом
порядке. Исторический baseline-before-first9 серии233119 не переписывается;
этот prospective порядок заменяет его только для следующих matched пар.

Независимый Product WIP review выявил привязку fresh retry к прежним canvas/
anchor до scroll. Actual UI_EPOCH_CHANGED RED подтвердил ненужную scroll,
когда порт стал visible; минимальный GREEN связывает fresh context/owner/
viewport/port/anchor в существующем perform identity. Shared perform,
native port ownership/hit guards unchanged; final freeze/negative suite/
approval ещё ожидаются. Trigger ограничен наблюдавшимся выходом порта
за нижнюю границу viewport (804>800), не всеми видами clipping canvas.


На 2026-10-14 05:04 UTC TDD исправление Export lower-viewport input0
завершено: Product изменён только в text-export-node.mjs (+24строки), SHA
`1e5772e763f81b67ac374722389b65ad7bbf97a835388d51b1630086cef44956`.
Новый actual factory test SHA
`e4190d32047d6ad64276c6d6e99288600e4cde08ab1c99d2bd1e31a2114561a0`.
RED original source: Port has no observed interaction point. GREEN проходит
через настоящий serialized observer/guarded scroll/native opener, проверяет
ровно один ui_scroll_applied с exact owner/from0/to82 и verified input wizard.
Отдельный actual UI_EPOCH_CHANGED RED закрыт pre-gesture identity binding
fresh node/context/owner/viewport/port/anchor; shared perform не менялся.
17/17 focused PASS, две syntax checks и diffcheck0; verification SHA
`f86a556646355c40ba3f911907ed3f19d7d0305be2d66f9fe4677844ccddb0e5`.

Independent final source review Approved-source, SHA
`96f0bf54ef3aa22817b38d4cea9f1dfee503338c74e5391b820c72b08fa8ef67`:
отдельные pinned Node17/17PASS/0SKIP, hashes до/после совпали, actual journal/
четыре line hashes и10author evidence проверены; observer/channel/opener/
context/shared fixture byteequalHEAD. Initial lock не допускает scroll;
если lock появился уже после scroll-prepared, безопасная own scroll может
завершиться, но fresh readiness запрещает даже начало открытия порта.
Общий Node suite и связанные модули, ordinary new-payload proof и модели
этим verdict не заменяются. Root related checks active; остальные stages открыты.


На 2026-10-14 05:08 UTC appropriate checks исходного commit
`a8db3e0f4cdde78399f6f81114e936fa16980920` завершены Root:
related focused378/378PASS/0SKIP и pinned Node24.19 fullupstream3847tests/
3837PASS/0FAIL/10SKIP/0cancelled/0todo, exit0. Cwd client; module/test hashes
до/после совпали. Full TAP command/log/result сохранены; related spec reporter
counts взяты из исходного полного log отдельной supplemental summary,
original result не переписывался. Общая root-checks-verification SHA
`a24d9902389d8e1d2adb370f4af89d2580f758eb10438b3422d532757c552f2a`.
Source review и checks закрыты отдельно от ordinary native/model acceptance.

Новая matched пара `20261014T050544Z-2085d7` собирается из того же commit
в собственном clean detached checkout; baseline74/candidateff18 skill,
модель/variant/tasks/seed/18+25 unchanged. Effective lock должен закрепить
новый prospective schedule candidate9→clean gate→baseline18→candidate16.
Пока нет активного Root model/native/admin процесса и current-run не переключён.
Private clipped Export proof проходит отдельный static review: нужны точный
saved XML noJS gate и canonical own scroll completed/trace; эти fixes не
меняют Product/runtime. Новые immutable bindings и live ещё не допущены.


На 2026-10-14 05:15 UTC новая matched пара050544 frozen без model/native calls.
Source `a8db3e0f4cdde78399f6f81114e936fa16980920`, own clean detached checkout;
baseline build/verify0 до restore двух старых skill-файлов, candidate build/
verify0 после restore. Runtime обеих фаз
`7982512e1949b23bc019305d22bf8fbfd54c4c3dc0258258497134e904e640f3`,
288files; относительно233119 изменён только text-export-node.mjs.
Full buildsource14701files, paired inventory5726: CLI/deps/browser equal,
различаются только2skill-файла и3metadata с original-specifier normalization.

Immutable0400 pins: baseline
`fb31e4f286a3fec4afa4a0896e34e40b98233fa789a321f6f2bead5740278adf`,
candidate
`dd65ee0a1e4a1e187925ebd16c94ec87d633b4abe239f5afb5e107869185ff67`;
effective lock
`afc1c7d94b5df4760d4efce3e5bf92b8d0640dfd89ec2102bdba2c470a485378`,
provenance
`f478535935cbf5c5c2174244d0eba393758465382b4f0abc8c1366d54585d8cb`.
Все10 operational inputs0400, historical72+2/audit2654 unchanged,
15defs/43unique18+25 без reservation. Lock закрепляет native/pair/pins→
candidate9→clean gate→baseline18→candidate16, comparative PASS только
после обеих фаз. Старые outcomes0; current-run остаётся historical233119.

Independent pair/pins review начат отдельно от автора сборок. Private reader
fixes и ordinary bound native gates ещё впереди; stage сборки+live не закрыт.
Полная модельная приёмка ещё не начата на этой паре; цель остаётся активной.


На 2026-10-14 05:24 UTC independent static pair/matrix/pins review PASS:
pair `2c103f2b9113e84d4e642dd5f9548b80a1537c1c77059d4a6af3818e1b5b5d65`,
matrix `b364ed2c364d83d091ec595f212e616ad8ba6a8e3970055c9ad3c798077b1773`,
pins `28b0d108f0ae2443871e310ec5de03a38630c0202d730adb631bed1acc6dcd0d`.
Обе5726-entry manifest,288runtime и14701source фактически сверены;
отличаются только2skill+3metadata. Payload/task/model/variant/seed unchanged.

Обнаруженные семь prompt hash mismatch относились к FOUR-arg diagnostic
buildAgentPrompt в metadata; actual runner использует THREE-arg. Сохранены
initial frozen matrix/lock/provenance и mismatch evidence, отдельно создана
corrected matrix SHA
`f6f1171a516b7895dc4ac308af875080ce92a9f09a3eccb3f8d0af03003c1774`;
независимо подтверждены43/43 actual prompt hashes (36 прежних unchanged).
Эффективный lock теперь только acceptance-lock-corrected.json:
`5be90328908ea793e4b75bb61adcaf54975e24ba85bab1729f611c32013a1875`.
Corrected provenance `cfb90d433652186f14a7b65f3dc0f3e6d027bd19d2ba337a980a3d978fb1ae24`;
metadata amendment `e854b2091cb15a9ceddf7ea6b3d603ae4d632e910e0dd5fccd1c3d4564640642`.
Оригинальные pins/payload/исходники/задачи/runner не менялись; это metadata
correction до первой модели, не новый runtime/pair и не перенос исходов.

Все ordinary proof для нового runtime prepared ready:false. Clipped Export
reader findings закрыты private TDD (9tests/38expect/typecheck0); independent
bound approval ожидается. JS/Join/schema подготовлены другим автором,
25tests/3typecheck0; их independently принимает другой reviewer, чтобы автор
не принимал собственный proof. Model/native live0, current-run historical233119;
полная приёмка и stage сборки+live остаются открытыми.


На 2026-10-14 05:29 UTC все bound ordinary proof получили independent static
approval: clipped Export `1b7c80af6d886273ed1da31b84689e5e049d86dd1ab0a333c2d75d58dd80a61b`;
JS `6145511ebcf611b03fb691229b8377895d4df32b6c1ecd752d70a65010b6860f`;
Join `1bb87b801a6b07a10fefe3f2ec5c5f185e4bb189ef37b150dd50c28b51be9eb6`;
schema `339d5242f782543d488ba9959f096d76da187ffff0d148a66d9b27ec05a2e92e`.
Approvals подтверждают static bindings/checks, не свежие native результаты.

Root запустил clipped Export первым, Root25228 active. Exact container0c72…
running, writer absent, run dir absent проверены перед допуском. Reviewed binding
`5b498da175e98e9e23b31e2e1cb02138b138f0d43f559f7f27001d512e28e692`
сохранена0400/byteequal; активированы только ready/status, active SHA
`973307358d75a95a7aef1e0e3cdbfc7872192c9b1d0b57f9da0aa98f404ab2a8`,
exclusive admission
`70ecc163420614cf53f8bc6b56302d4edbb32e0a2218eec50666dd2069874018`.
Первый preserve отказался O_EXCL, потому что reviewed copy уже существовала;
до повторного допуска подтверждены её exact bytes/mode, никакой overwrite
или дополнительный native запуск не происходил.

Own ordinary prepare и input delivery прошли; Import1 SUCCEEDED/cleanuptrue,
Calculator выполняется. Actual7standard prefix, Export3position900,640 и
no early Save сохраняются. Clipping/scroll/CSV/graph/финальный cleanup ещё
не подтверждены. Другие native/CLI/admin/модели не запускаются одновременно;
model slots0, current-run ещё historical233119. Цель и stages live/18+25 открыты.


На 2026-10-14 05:43 UTC original ordinary8node clipped proof Root25228
завершён exit3 до Export: GroupLast group-last-1 AMBIGUOUS/open/
WIZARD_OPEN_NOT_CONFIRMED/cleanupfalse; Import/Calc/GroupFirst SUCCEEDED.
Result SHA `6c7f7f93dca97432393f9ff9c7ab18f4a776836d0433c658a24c0430371c8d7f`.
NoSave/CSV/clipping, model0; runtime1029384 ACKfalse/exit1.
Raw1367: один own begin_wizard click ACK133ms, native waits140/192/259ms,
guard отказ564ms; before1365 exact own Group/unlocked/point observed/masks0.
Error output уже grouping с ownGUID/masks0, но catch перечитывает UI:
predicate-time cause неизвестна, secondmask не утверждается.
Read-only diagnosis SHA `a32a6d6d2af19c34ad07dd732e74c5f6e2a17307578ba2e6172a19965ed2634b`;
Product/общий runtime по этому неизвестному отказу не меняются.

Strict3successfulGUID/6serverevents связали только user:160 latestinit05:27:39.471Z,
binding `7a7c62478cf06abfab25e79e1f7621eadbfb5829ae853132f1b6ae3aba3c8895`.
Root soleadmin закрыл160 в05:37:51.045Z после exactfreshrow/confirmation;
двеrefresh подтвердили отсутствие160, admin161logout05:38:13.017Z.
Bridge59539/browser closed/exit0, guard отсутствовал; профиль/история не менялись.
Independent final recovery SHA
`6db3bae9b1fcde4ee77566b2378c4f9171de98d8dc8e96db5bc985c12ebbc4ee`:
raw35/source4452/fixtures9/protected15/effective10inputs0400/runtime288×2
unchanged, own processes absent, new160init отсутствует. Original failed
остался failed; recovery не подтверждает исправление Экспорта.

Следующий diagnostic scope — новый private ordinary Import→Sort→Export,
tiny27B/independent27B oracle, same Export position900,640,3nodes2links/noJS/
noGroup/noearlySave. Сохраняются verifyRevealEvidence, ordinary entry и
строгий cleanup; actual clipping обязателен, иначе NOT_REPRODUCED.
Это изоляция Exportfix от неизвестного Group отказа, не упрощение модельных
сценариев/18+25 acceptance. Новый private binder/graph проходит TDD и review;
старый8node proof immutable, runtime/pair/pins unchanged.

После recovery Root49772 запустил approved ordinary JS downstream отдельно.
Reviewed binding6e668b33… preserved; ready/status active SHA
`6c4c132dc9b2a1ef988629c476608225b4cebb2dc19cc145a5813c584ceb4296`,
admission
`aa1786cadade63c231efabe819476c9b8af0c70e87f8c49875df50618eb4246a`.
Другой Host/CLI/admin не активен. Новые native результаты ещё ожидаются;
model slots0, current-run historical233119, цель и live/model stages открыты.


Checkpoint 2026-10-14 06:03 UTC — pair050544, model slots0.
Ordinary JS downstream Root49772 завершён exit0: Group A17/B21,
direct Sort B21/A11/A6, native CSV27B и saved5nodes4links/source/schema/socket
проверены. Own package closed без discard, Logout/HostACKtrue/exit0.
Result SHA `c33451733c68f2cd52e2c8bd2d3f7a94e6d8f18f7c1dc7b4574dc6b0dd230d93`;
independent live review `4a25b1108464fe429d2ee77b96ce6360d556e2e9d06fd8f950f21efd7260766b`.
Это PASS отдельного native gate, не model acceptance/18+25.

Minimal ordinary Import→Sort→Export Root40322 завершён exit3:
Import/Sort SUCCEEDED, Export input_mapping AMBIGUOUS/cleanupfalse,
noSave/CSV/Logout/ACK. Result `4e90c98213335b3582dacbf3f199820fd3701ddbd2f040ec2c7231d399ee3877`
сохранён failed. Raw740 input bottom804/viewport800;741–742 один own scroll
0→82;744/746 same owner/ref/identity, input bottom722 внутри viewport.
Masks/dialogs0, но covering `<u>` без установленных owner/class/ancestors;
все9 native hits отказали до меню/клика. Вертикальное clipping устранено,
full mapping/CSV gate NOTPASS. Report clippingReproduced=false осталось
initial default: evidence reader не вызван после отказа, это не отсутствие
clipping в raw. Read-only diagnosis
`1c791af08cd3e754d3c1b423e4632e967bfa83db804d65a6802b811797a70eaa`.
Неизвестный U не основание для ослабления native guard или Product patch.

Strict native/server GUID binding связал только user:163 latest init05:50:57.982Z,
SHA `a9048d46a9473bb04d0b37ffb2437424d69bc69770cd91599e1a03643a7c7943`.
Root SDK7158 закрыл exactfresh163 после exact confirmation; отсутствие
подтверждено двумя refresh06:02:29.022/29.789Z. Own admin164 Logout06:02:50.254Z,
login visible; browser closed/bridgeexit0. Guard отсутствовал, originals/profile
не менялись. Независимый final recovery/read-back ещё ожидается.

Следующий private diagnostic собирает ограниченные DOM/parent/cache data-values
того же9hit evaluate только own Export input0; getters/новые browsercalls/clicks/
изменение predicate запрещены. TDD и independent static review до live,
no acceptance credit. Join/schema static approved, fresh live ещё не выполнены.
Runtime/payload/effective corrected pins unchanged; current-run historical233119.
Stages fresh native/build acceptance и18+25 остаются открыты.


На 2026-10-14 06:08 UTC independent recovery163 PASS:
`f9f5b2ee23889b8ef38628dc24445a285726f75e789554f0c12294e72ad9d386`.
Server closure16306:02:28.203Z/admin164Logout06:02:50.246Z/noReinit;
raw22/source4453/fixtures15/protected68/effective10/runtime288×2 unchanged,
own processes absent/.writer absent. Original failed4e90… не upgraded.

Root79801 запустил approved ordinary Join. Reviewed binding6a0062fd…f3302
preserved0400; only ready/status activation
`5246b5963751898d04971e500ed2aa43411fe07e2a3d46d3adbb52e06ff1574c`,
admission `18c5ae1a96fc9481cb6236bbc609b2a7b774a5f0ad696313cee481ad99c80538`.
Fresh4452source/5fixtures/85protected и own idle проверены. Первоначальный
read-only process filter оказался шире own scope и отказал до mutations;
повторная проверка scoped к этой серии, чужие процессы не затрагивались.
Join outcome pending; no other Host/CLI/admin/model. Model slots0/stages open.
