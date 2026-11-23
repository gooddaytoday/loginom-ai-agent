# Предложение приёмки этапа 1

Критерии требуют утверждения до реализации. Этап 0 не регистрирует runtime,
не собирает CLI и не заявляет модельную приёмку. Живые наблюдения — в
[discovery.md](../discovery.md), не являются PASS будущего обработчика.

## Данные, oracle и результат

Модели передаются только `task.md` и четыре CSV из `data/`.
`fixtures/manifest.json`, `oracle.py`, expected и документы исследования
в её контекст не входят. В `fixtures/` те же точные байты входов; manifest
фиксирует типы, порядок полей, NULL-маркер, размер и SHA256 каждого CSV.
Сначала созданы fixtures/task/oracle/expected, затем выполнен исследовательский узел.

Oracle — Python >=3.9, только csv/json/stdlib. Для каждой главной строки
независимо выбирает все B и C с равным Key; `None == None` задаёт явно
предложенную NULL-safe семантику. Отсутствующее совпадение заменяет одним
пустым правым кортежем; два списка перемножаются. Значения присоединяются
без вычислений и преобразования типов. Actual и API Loginom не используются.

| Вариант | Входы | Ожидание |
|---|---|---|
| single | main + ref-b | 6 строк × 6 полей, expected-single.json |
| initial | main + ref-b + ref-c | 8 строк × 7 полей, expected-initial.json |
| final | main + ref-b-duplicates + ref-c | 13 строк × 7 полей, expected.json |
| composite | composite-main + composite-ref | 7 строк × 4 поля, composite/expected.json |

В основном бизнес-сценарии модель сначала получает initial, затем меняет
первый справочник на duplicates в том же узле и сохраняет final.
Cold проверяет только финальный результат; initial — адресная проверка
настройки/повторного выполнения в этапе 1, без нового механизма cold-аудита.
single — отдельное адресное предложение, живой результат пока not_checked.
composite/task.md — самостоятельное задание с одним справочником и ключом
Code+Zone (integer+string), включая NULL в каждой части и пустую Zone;
его живой результат пока not_checked. Модели этого случая передаются только
два CSV из composite/data. Для него на этапе 1 регистрируется собственный сценарий
`enrich-data-composite` существующего run-check.

```sh
python3 docs/node-development/nodes/transform-enrichdata/acceptance/oracle.py --case single
python3 docs/node-development/nodes/transform-enrichdata/acceptance/oracle.py --case initial
python3 docs/node-development/nodes/transform-enrichdata/acceptance/oracle.py
python3 docs/node-development/nodes/transform-enrichdata/acceptance/oracle.py --case composite
```

Ожидания задают `output_node_type:transform.enrich_data`, `output_port:0`,
`ordered:false`, `column_order:exact`. Мультимножество сохраняет кратность:
два совпадения каждого справочника дают четыре строки, а не одну и не две.
Для final RowID распределены 1:4, 2:1, 3:1, 4:2, 5:4, 6:1.
RowID=3 подтверждает независимость второго справочника от первого;
RowID=6 — левое дополнение; RowID=4 — NULL-key matches;
Note="" и Note=NULL проверяются раздельно.

Поля: RowID/Key integer, Amount real, Note string,
RefName string, RefRate real, RefName_1 string. Lookup keys отсутствуют.
Порядок полей задан в task. Для него требуется явный output mapping port 0,
autosync=false и полный fields layout: при autosync=true cold переставил
Key перед RowID (см. discovery). Это существующая возможность, не новый
приёмочный механизм. Метки присоединённых полей заданы явно:
LookupName, LookupRate, LookupName; остальных — `label_any:true`.
Все значения точны; real имеют `tolerance:{abs:0,rel:0}`. Использованы
двоичные рациональные числа без агрегации или вычисляемого округления.
Значения Int64 вне safe JS range, Variant и даты не представлены этим fixture.
Не заменять пропуски на текст null, ноль или пустую строку ради совпадения.

## Матрица для утверждения

1. Один и два справочника; точные same-type ключи каждого входа с главной
   таблицей; полные связи и identity всех источников/портов.
2. Непустые ключи, NULL, unmatched, duplicate multiplicity, исключение
   правых ключей, префиксы имён/меток, точные типы и порядок полей.
3. На том же узле заменить первый справочник с совместимой схемой;
   проверить свежие 13 строк, Save и cold Execute без восстановления настроек.
4. Адресные UI/handler проверки составного ключа и фильтра совместимых
   полей, неподходящего типа, неверного префикса, неподдержанного mode/третьего
   справочника и Cancel. Отдельные входы/задание/ожидание составного ключа
   уже в composite/; основной expected не доказывает его работоспособность.
5. Нативную причину отказа читать из btnError. Неизвестный эффект — inspection,
   без повторной мутации. После завершающих чтений закрыть пакет и выйти.

Пустые таблицы и удаление динамических портов пока not_checked, не отдельный
приёмочный режим. Если реализация потребует нового критерия или общей правки
сверх разрешённой регистрации типа — blocked с одним вопросом.

Приёмка опубликованного чистого SHA: cold PASS, >=2/3 PASS исполнителя
и отдельно >=2/3 на том же SHA под аккаунтом независимой проверки из своей пары.
Проверки изменённых путей обязательны по `required-checks.py list/verify`.

## Запуск после реализации и утверждения

На этапе 1 аддитивно зарегистрировать `enrich-data-left` → acceptance/
и `enrich-data-composite` → acceptance/composite/ в штатном каталоге run-check.
Источник каждого сценария — task.md, data/ и expected.json, base=None;
обычный узловой путь без external=True. Общие проверки не меняются.
После регистрации и публикации чистого SHA:

```sh
result=$(python3 scripts/node-acceptance/run-check.py start --head <SHA> --scenarios enrich-data-left,enrich-data-composite --pair "$PAIR" --cold) && python3 scripts/node-acceptance/run-check.py wait "$result" --timeout 4500
```

До регистрации имён эта команда не исполняется. `--cases` здесь не является
заменой регистрации: его external-путь требует export_destination routing hints,
которых в этих node-output expected нет. Не менять общий parser ради комплекта.

Команда start+wait исполняется целиком foreground. Модель
`openai/gpt-6.1-sol`, medium, 1800 с; среда и нагрузка — по регламенту сквада.
Бизнес-задание описывает целевой узел. Существующий run-check автоматически
добавляет штатный финальный CSV Export и проверяет скачанный файл по expected;
cold заново читает выход самого целевого узла. Дополнительного экспорта
или отдельного output_node_type:export_input в этот комплект не вводится.
Новых квитанций, reader-ов или механизмов доказательства происхождения нет.

## Объём регистрации и оценка

Оценка этапа 1 — **2 цикла реализации с новым бизнес-прогоном в каждом**:
первый — драйвер EnrichDataWizard, ключи/порты/префиксы, второй — обновление,
отказы, Save/cold и устранение наблюдённых дефектов. Независимая приёмка —
после опубликованного SHA; её прогоны не включены в эти два цикла.

Нужны собственные node/parameters/context/procedure/readback и тесты;
аддитивные type/schema/dispatch/readback регистрации, наблюдение своего
мастера, свой файл навыка и строка маршрутизации, сценарий run-check.
Образцы — Join для ключей, Union для нескольких входов и cached stores.
В `node-port-open.mjs:162` существующая обработка динамических входов
привязана к иконке uniondata: добавить enrichdata в тот же ограниченный
список типов, сохранив алгоритм ordinal/GUID/cell/owner checks.
Также зарегистрировать свои подписи входов в существующих type-specific
ветках наблюдения input mapping/overflow `workspace-ui.mjs` и выход 0
в соответствующем allow-list. Это требуется наблюдением Input_Data-3
при FPortIndex=2; обход проверки или равенство SVG-индекса номеру порта неверны.
Вне такой аддитивной регистрации новых общих алгоритмов не выявлено.
Если существующий путь окажется недостаточен, отдельное решение владельца
обязательно до общей правки. packages/agent и публичный контракт не менять.

## Размеры для планирования

UTF-8 bytes; JSON измерен `Buffer.byteLength(JSON.stringify(value))`.

| Представление | Байты | Бюджет / вывод |
|---|---:|---|
| node-type.proposal.json, compact | 1355 | static NODE_TYPES entry |
| parameter-schema.proposal.json, compact | 2214 | descriptions включены |
| будущая decorated type card, compact, pins={} | 4099 | <=12000; запас на session pins |
| та же карточка с отступами 2 | 5816 | оценка сериализации, не живая карточка |
| существующий published dock_node_apply inputSchema базы | 40219 | >20000 уже до нового типа |
| полная canonical inputSchema базы | 48576 | только измерение; лимита нет |
| существующий SKILL.md базы | 49525 | >40000 уже до нового типа |
| предлагаемая строка маршрутизации | 102 | <=~200 |
| skill-node.proposal.md (весь файл) | 3522 | <=6000 |

Карточка нового типа пока отсутствует в dock_action_describe. Оценка получена
из штатной оболочки `describeNodeTypes` (candidate revision
enrich-v1-internal-1, modes=[left], пустые pins) с подстановкой proposal типа
и его полного parameter_schema. При настоящей регистрации измерить карточку
с реальными session pins повторно. Не объявлять 4099 Б измерением живого ответа.
Приращение будущего SKILL.md — только строка 102 Б, файл узла загружается
отдельно. Общая оптимизация уже превышенных бюджетов на этапе 0 не выполняется;
это пункт отчёта, не стоп и не разрешение менять общий бюджет.
