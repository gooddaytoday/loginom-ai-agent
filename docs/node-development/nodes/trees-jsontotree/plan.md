# JSON в дерево: подплан полного покрытия

[Карточка](README.md) · [RUNBOOK](../../RUNBOOK.md) · [Карта покрытия](../../coverage-map.json).

Component ID: `component.trees.JSONToTree`. Slug: `trees-jsontotree`. База исследования кода: `5f772aea9`. Источники: Help 7.4, дата доступа 2026-10-02. Статус всех новых этапов: `discovery_required`; каталог: `current_help`. Это подготовленный документ, а не выполнение этапов. В базовом `node-support.mjs` обработчик не зарегистрирован, runtime type и фактические native ports ещё требуется подтвердить. Реестр приёмки не повышается.

## Источники, результат и семантика

- `trees-jsontotree:help01` — [JSON в дерево](https://help.loginom.ru/userguide/processors/data-trees/json-to-tree.html) (Help 7.4, прочитано 2026-10-02).
- `trees-jsontotree:help02` — [Порт Дерево](https://help.loginom.ru/userguide/workflow/ports/mapping-trees.html) (Help 7.4, прочитано 2026-10-02).

Вход — таблица со строковым JSON-полем, выход — типизированное дерево. JSON number, integer вне безопасной JS-точности, Boolean, string, null, пустой объект/массив и отсутствующий узел имеют различную семантику. Массивы должны быть однородными; повторный ключ оставляет последнее значение, а смешанные типы повторного ключа дают variant. Обучение не требуется.



Код и Help изучены статически; live discovery, модельная попытка и аналитическая приёмка сейчас не выполнялись. Перед реализацией наблюдать component/fulltype, портовые identities, каждую страницу мастера и различия редакции/платформы в собственном аккаунте. Неизвестное свойство остаётся вопросом с наблюдаемым условием закрытия, не вымышленным control/API.

## Этапы и зависимости

| Этап | Результат этапа | Приоритет 0–5 | Обязательные принятые этапы |
| --- | --- | ---: | --- |
| `trees-jsontotree:s1` | Автоструктура и типизированное чтение | 2 | `foundation:typed-trees`, `foundation:oracle-tabular` |
| `trees-jsontotree:s2` | Ручная схема и строгая проверка | 3 | `trees-jsontotree:s1` |
| `trees-jsontotree:s3` | Загрузка схем, даты и полный mapping | 4 | `trees-jsontotree:s2`, `foundation:file-artifacts` |

Схема и autosync дерева относятся к контракту `foundation:typed-trees`: после явной настройки читать фактические пути, типы и mapping; смену источника проверять отдельно для auto/manual и autosync on/off. Для режимов с изменяющейся схемой закрепить собственное разрешение по подтверждённому readback и независимый tree oracle. Строгая ручная схема остаётся строгой; табличная политика CrossTable sliding не является разрешением для дерева.

Общие результаты: [приёмка и oracle](../../foundations/acceptance/plan.md), [типизированные порты](../../foundations/typed-ports/plan.md), [динамическая схема](../../foundations/dynamic-schema/plan.md), [обучение](../../foundations/training/plan.md), [внешние ресурсы](../../foundations/external-systems/plan.md). Зависимость принимается с SHA и собственными доказательствами; чужая активная ветка не считается готовой основой. Самостоятельные fixtures устраняют необходимость ждать парный преобразователь или узел Разбиение на множества.

## Матрица всех режимов и требований

Каждая строка обязательна в указанном этапе; комбинации параметров проверяются по причинно значимым взаимодействиям, а не одним smoke-test. Строка источника обозначает документацию поведения, столбец проверки — будущую независимую проверку. Ни одна строка пока не PASS.

| Требование | Режимы и параметры | Этап и источник | Проверка и ожидаемое доказательство |
| --- | --- | --- | --- |
| `trees-jsontotree:r01` | JSON-поле, auto schema, root auto/always-array/always-not-array | `trees-jsontotree:s1`; `trees-jsontotree:help01` | Один и несколько входных JSON, корневые object/array/scalar; exact схема и количество элементов. Противоречивую фразу Help про always-not-array проверить отдельным discovery case. |
| `trees-jsontotree:r02` | Однородные массивы, повторные ключи, null, пустые/отсутствующие узлы | `trees-jsontotree:s1`; `trees-jsontotree:help01` | Parser oracle сохраняет pairs, поэтому обнаруживает duplicate keys/type change, не теряя историю до проверки variant. |
| `trees-jsontotree:r03` | Ручная структура и strict on/off; известные/лишние/пропущенные поля | `trees-jsontotree:s2`; `trees-jsontotree:help01` | Strict даёт ошибку при несовместимой структуре, non-strict фиксирует диагностику; отсутствующий scalar=NULL, отсутствующие container/array не создаются. |
| `trees-jsontotree:r04` | Исключение корня только с одним child; не исключать массив/несколько children | `trees-jsontotree:s2`; `trees-jsontotree:help01` | Сравнить три формы; флаг не должен безусловно отрезать первый уровень. |
| `trees-jsontotree:r05` | Даты ISO8601/предустановленные/ручные шаблоны, Z и локаль сервера | `trees-jsontotree:s3`; `trees-jsontotree:help01` | Зафиксировать timezone и секунды/миллисекунды; независимо рассчитать UTC→local; явная опечатка года в Help-примере не переносится в expected. |
| `trees-jsontotree:r06` | Полная схема дерева: имена/метки, scalar/variant, data_kind, container/array, обязательность, порядок, ручные связи и автосвязывание по имени+типу, autosync on/off, исключения и восстановление связей; загрузка JSON/XSD, namespace/root/recursion0..3, раскрытие рекурсивных узлов и метки xsd:documentation. | `trees-jsontotree:s3`; `trees-jsontotree:help01`, `trees-jsontotree:help02` | Независимый typed-tree oracle сравнивает пути, флаги, порядок массивов, точные значения и отсутствие контейнеров отдельно от NULL примитива; обязательный корень нельзя оставить несвязанным. Загрузка схемы проверяется как замена старой структуры, Cancel её сохраняет. |
| `trees-jsontotree:r07` | JSON из файла/строки; XSD namespaces/root/recursion; смена данных меняет auto schema | `trees-jsontotree:s3`; `trees-jsontotree:help01`, `trees-jsontotree:help02` | Подтверждённый source artifact и схема каждой версии, сохранение после reopen; никакого переноса старой preview schema. |

## Реализация в текущем runtime

Переиспользовать `packages/loginom-runtime/client/lib/node-apply.mjs`, `node-procedure.mjs`, `node-execution-procedure.mjs`, `node-process-context.mjs`, `execution-journal.mjs`: существующую операцию, deadline, ownership и отмену. `workspace-ui.mjs` расширять адресным наблюдением собственных страниц; не вводить общий интерпретатор сценариев и не обращаться к внутренним RPC Loginom.

Для дерева переиспользовать ownership/граф/журнал, а не табличный reader. `node-read-contract.mjs` допускает только завершённые table outputs; `node-api.mjs` описывает table read ports. Typed tree/variable evidence и расширение этих границ идут через общий подплан типизированных портов, с одним владельцем. `port-mapping-procedure.mjs` — образец транзакционной работы мастера, не готовый tree mapper.

Handler, параметры, context/readback и procedure добавлять в `packages/loginom-runtime/client/lib` по образцу `grouping-node.mjs`/`grouping-parameters.mjs` для скалярных ролей и `calculator-node.mjs`/`calculator-readback.mjs` для упорядоченных выражений. Эти образцы не доказывают готовность данного узла. После discovery добавить проверенный тип в `node-support.mjs`, публичный вариант в `node-api.mjs` и компактное развёртывание в `user-workflow.mjs`. Изменение общего контракта согласовать с владельцем соответствующего foundation; не вносить разрозненные новые train/tree/variable wire-формы в каждом handler.

Адресные проверки создаются рядом в `client/test` и выполняются из каталога пакета по его принятой команде. Пока тестов нового обработчика нет, их нельзя указывать как выполненные. Отдельно проверить совместимость 14 существующих типов и read/job/recovery на затронутых путях.

## Независимые fixtures и численные ожидания

Основной JSON: {"id":1,"items":[{"sku":"A","qty":2},{"sku":"B","qty":0}],"active":false,"note":null}. Отдельные документы: {}, [], missing note, empty string, nested empty array, duplicate id same/different type, large integer 9007199254740993, Unicode keys, dateZ с известным timezone. Ожидания хранят дерево со schema и values отдельно; стандартный JSON parser с object_pairs_hook сохраняет повторения ключей. Для mixed arrays и trailing comma ожидается отказ. Integer и Boolean exact, дробные значения передаются oracle десятичным текстом; округлённый preview не доказательство. Два самостоятельных schema fixtures JSON/XSD позволяют не ждать XML handlers.

Expected, формулы oracle, допуски и отрицательные подмены (значение/тип/порядок/связь/модель/источник) закрепить до модельного прогона. Не вычислять expected импортом handler и не выводить их из фактического результата проверяемой попытки. Непрерывные допуски применяются только к указанным числам; identity, Boolean, NULL, строки, количество и схема сравниваются точно. Раздельно хранить входы для модели и oracle/expected вне её workspace. Для всех стадий нужны пустой вход, границы типов, Unicode, повторный запуск, смена исходника и save/reopen в релевантном режиме.

## Ошибки, восстановление и приёмка

Узловые отказы: Невалидный JSON, неправильный root mode, mixed array, лишнее свойство при strict, несовпавший тип, потерянная схема. После частично выполненного parsing не публиковать старое дерево.

Проверять запрос до эффекта; Done/Close/Execute имеют разные результаты. При отказе мастера прочитать его собственную причину, закрыть принадлежащий операции error dialog, затем подтвердить cleanup. Не повторять Execute/Train или загрузку схемы при lost reply/неизвестном эффекте; использовать status/inspect/recover той же операции, сохраняя исходный deadline и FAIL. Ошибка/отмена не должна выдавать старый output как свежий. Для меняющего схему режима проверить фактические выходы и downstream связи после каждого изменения.

Business task этапа описывает требуемое преобразование/модель, входные файлы и уникальный путь нового пакета. Модель и effort берутся из назначения; предел попытки **7200 секунд**. Приёмка — standalone CLI и независимый cold-check точного опубликованного SHA по [общему регламенту](../../workflow/acceptance-cli.md). Проверить параметры, все входы/выходы и типы, полноту малых результатов, происхождение модели/данных, сохранение и отдельное открытие; `package_closed=true` и `logged_out=true` обязательны. Текущий табличный cold-check расширять через foundation для дерева/переменных/обучения; до появления нужного oracle этап остаётся NOT_RUN. Сборка, exit 0, preview и cleanup отдельно не означают аналитический PASS.

Этап готов к разработке после закрытия его discovery вопросов и фиксации независимых expected; этап готов к приёмке после handler, адресных тестов и проверенного oracle; принимается только объявленный stage scope. Полное покрытие узла требует всех строк всех этапов. Исторические результаты другого SHA/режима не переносятся. Checkpoint не длиннее 20 строк: SHA, принятый scope, проверенные результаты, ограничения, следующий stage/trigger. Реализация, интеграция и выпуск остаются отдельными состояниями; слияние и выпуск требуют отдельной команды владельца.

<!-- parallel-execution:start -->

## Параллельная работа

При подготовке этого плана новые задачи и прогоны не запускались; существующие карточки могут уже выполняться. При назначении используются [правила Multica](../../workflow/multica-parallel.md); наличие строки не подтверждает доступность ресурса или готовность этапа.

| Этап | Направление | Группа карточки | Разработка | Интеграция | Модель | Независимая проверка | Примечание |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `trees-jsontotree:s1` | Деревья | trees-jsontotree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `trees-jsontotree:s2` | Деревья | trees-jsontotree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |
| `trees-jsontotree:s3` | Деревья | trees-jsontotree | — | runtime-registration<br>readiness-publication<br>base-branch | legacy-oauth (legacy OAuth) | oracle-profile | Одна активная карточка разработки на узел; независимые узлы этой дорожки не образуют цепочку. Общая регистрация — отдельное короткое окно перед проверкой итогового SHA. |

<!-- parallel-execution:end -->
