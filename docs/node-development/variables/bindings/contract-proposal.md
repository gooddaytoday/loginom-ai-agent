# Предложение контракта для утверждения

Непроверенные предпосылки — [discovery](discovery.md). Имена ниже проектные;
их нет в публичном API базы. Изменений `packages/agent`, Host-протокола,
deadline, общего бюджета и нового универсального evaluator не предлагается.

## Запрос: один patch привязок поверх W1

Добавить optional top-level `bindings` к `dock_node_apply`:

```json
{
  "variable_inputs": [{
    "source": {"document_id":"issued","workflow_id":"issued","node_id":"issued"},
    "output": 4, "input": 0, "kind": "control"
  }],
  "bindings": [{
    "parameter": "/groups/0/0/value",
    "variable": {"kind":"control","input":0,"name":"Limit"}
  }]
}
```

Это фрагмент, остальные обязательные поля apply сохраняются. `parameter` —
JSON Pointer относительно **parameters**, проверенный по описанию типа;
не строка DOM и не native PropertyPath. `variable` адресует точное mapped
техническое имя на input узла, а не имя в произвольном пакете. Source ref/output
и связь задаются существующим W1 `variable_inputs`; поле bindings их не дублирует.
Внутри операции имя разрешается в native variable ID и ConnectedRecord.
Локальные defaults читаются, но их создание в этом срезе не добавляется.

`kind:control,input:0` означает W1 subtype 4; файловые/REST используют
`kind:variables,input:0` subtype 3, когда **регистрация типа** задаёт управляющую
роль этого порта. Subtype 3 сам по себе не делает любой variables-вход control:
обычный вход `Var.*` Калькулятора остаётся отдельным. Табличные ordinals прежние.
Скрытый control раскрывает существующий W1, без нового endpoint API.

Семантика patch:

1. Отсутствие `bindings` или `[]` сохраняет все привязки. Указанный элемент
   создаёт/меняет только один выбранный binding; дубли parameter запрещены.
2. Одновременная константа в том же parameter и binding — отказ, даже если
   значения совпадают. Отказ также при пересечении с прежним узловым variable
   operand/local bindings. Нет правил «последняя запись побеждает».
3. В первом срезе нет unbind. Нельзя скрыто переключить сохранённый variable
   mode в constant mode обычным literal patch: требуется явная поддержанная
   операция из прежнего контракта либо отказ. Поздний unbind — отдельное решение.
4. Для массивов pointer привязан к **результату полного parameters patch**,
   затем к ID native строки. Нельзя переносить индекс из старого DOM. У existing
   Фильтра без `groups` pointer относится к полному независимо прочитанному
   сохранённому набору. Если patch удаляет/меняет строку с неуказанным binding,
   требуется отказ, пока сохранение identity не доказано; silent rebinding запрещён.
5. На первом этапе только точные integer/string/boolean по декларации поля,
   без парсинга строк, integer→real и NULL. Native enum/range проверяется тоже:
   integer не означает допустимое K/seed. Real/temporal добавляются после своего
   codec и живых проверок; автоматически их не включать.
6. `finish:done` подтверждает настройку, `execute` — новое выполнение,
   `close` сохраняет прежнюю семантику discard. Apply не означает Save пакета.

## Как тип объявляет поля

В `dock_action_describe` существующий `parameter_schema` остаётся строгой
схемой **литералов**. Поля, пока отсутствующие в нём (например sort_result
Группировки), добавляются явно только вместе с узловой регистрацией. Рядом
предлагается `binding_schema`: строгая схема массива со своим `oneOf` по
доступным parameter, variable kind/input/name. Она ограничивает общий компактный
binding envelope и сообщает фактические тип/range/NULL-правила. Пример карточки:

```json
{
  "binding_schema": {
    "type":"array","maxItems":32,
    "items":{
      "type":"object","additionalProperties":false,
      "required":["parameter","variable"],
      "properties":{
        "parameter":{"const":"/settings/source/source_path"},
        "variable":{
          "type":"object","additionalProperties":false,
          "required":["kind","input","name"],
          "properties":{
            "kind":{"const":"variables"},"input":{"const":0},
            "name":{"type":"string","minLength":1,"maxLength":128}
          }
        }
      }
    },
    "description":"Exact mapped string; non-NULL; verified own file. Omit the bound literal."
  }
}
```

Для массива условий используются ограниченные шаблоны pointer + проверка
реального набора/оператора, а не перечисление 128×64 полей в describe. Карточка
публикует только поля текущего поддержанного режима; состояние конкретной
страницы/строки проверяется в live preflight. Нет binding_schema — тип общий
envelope отклоняет. Native TID, PropertyPath, локаторы, row resolver и codec
живут в существующем обработчике, не в видимом моделью контракте и не в новом
диспетчере. `describe` не подтверждает live availability или выполненный узел.

Обязательный literal slot может быть удовлетворён ровно одной объявленной
привязкой: общая валидация сначала проверяет envelope, затем узловой resolver
проверяет целую конфигурацию с bound slots. Нельзя запускать старый валидатор,
который требует source_path/value-константу, до этого разрешения. Внутреннее
текущее значение допустимо для проверки range/provenance, но не для записи
literal или включения default в связанное поле. Изменения required-правил
ограничены объявленными bound slots, прежние literal-запросы не ослабляются.

## Readback и отказы

Предлагаемый `configuration.bindings` — полный bounded inventory до 32 связей,
а не эхо запроса. Элемент: `parameter`, `mode:"variable"`, native row ID,
`variable:{kind,input,id,name,type,is_null}`, фактический source ref/output и
input port GUID, connected/local, `verified:true`. `PropertyPath` допустим
в приватном доказательстве; пользователю нужен стабильный parameter.
Идентификаторы нового документа cold не сравниваются с прежним session ID.
Если активная привязка не поддержана reader, нельзя вернуть скрытый literal
как настройку. Значение source, прочитанное при preflight, не выдаётся за значение
именно прошедшего Execute; для этого нужны его execution receipt и W1 reader.

Preflight до изменения настроек проверяет: declaration/pointer/mode, отсутствие
дубликатов и конфликтов, точный owner/workflow/kind/input, полный mapped inventory,
уникальное имя и ID, тип/NULL/range и собственную файловую provenance при path.
Текущие defaults и неуказанные bindings сохраняются. Для имени файла новое значение
**каждый раз** проходит existing storage/admission/path policy; старая квитанция
на файл A не разрешает файл B. URL не включается этим первым срезом.

Предлагаемые причины: `BINDING_PARAMETER_UNSUPPORTED`, `BINDING_CONFLICT`,
`BINDING_VARIABLE_MISSING`, `BINDING_TYPE_MISMATCH`, `BINDING_NULL_UNSUPPORTED`,
`BINDING_VALUE_INVALID`, `BINDING_PORT_MISMATCH`, `BINDING_SOURCE_UNVERIFIED`.
Сообщение содержит parameter и ожидаемый тип/порт, без секрета или значения пути.
Неизвестная active binding при independent readback — неоднозначность результата,
а не успешная сохранённая константа.

«Отказ до эффекта» имеет честную границу: ошибки формы/декларации и source
проверяются до создания/подключения; existing node settings проверяются read-only
до первой записи. У нового узла часть native availability известна лишь после
создания/открытия. Если тогда обнаружен неподдержанный UI, уже есть эффект
создания; штатные receipts/cleanup/effect_possible обязательны, не обещать
атомарность. Гонка источника, неизвестный результат Done, изменившийся owner
после записи — прежний AMBIGUOUS/uncertain-effect, не «без эффекта» и не новый apply.

Writer использует штатные жесты SwitchButton/picker/commit и проверяет их owner;
после Done заново открывает мастер и сверяет весь inventory, завершает Cancel.
Нет изменения внутреннего JS Loginom, XML writer, скрытых RPC, blanket scan всех
SwitchButton и обхода Next/ошибок. Другой жест у строки требует узлового адаптера;
принципиальная несовместимость мастеров возвращает этап 0 в blocked.

## Save и cold

Предлагается расширить существующую приёмку, после решения владельца, compact
inventory `binding_inventory` рядом с W1 `variable_inventory`. Оно описывает
node type/label, parameter, mapped name/type, kind/input и source type/output;
нативные IDs нового документа заново разрешаются, не берутся из expected.
Формат и verifier **не реализованы** и не передаются в stock expected как будто
он уже умеет их проверять. Полный проект — `acceptance/binding-inventory.proposal.json`.

Cold: Save с modified=false → закрыть → открыть сохранённый пакет в новом
документе → перечитать связи/mapping/variable mode без изменений → новое Execute
→ полные типизированные таблицы и CSV → повторная сверка binding inventory.
Только одинаковый результат таблицы недостаточен: literal даёт тот же ответ.
После изменения только источника нужно второе выполнение с другим результатом
на том же node GUID, прежним binding и неизменёнными параметрами. Оба экспорта
сверяются с отдельным expected. Перед cold сохранить финальное значение source.

## Байты модели

Измерено на базе через `node --test test/model-schema-budget.test.mjs`:
51 PASS, compact `name+description+inputSchema` после `userNodeTool` — **14 539 Б**,
полная внутренняя input schema — 63 280 Б, запас compact — **5 461 Б** до 20 000.
49 карточек: наибольшая обычная CrossTable **8 090 Б**, Import Text **7 390 Б**.
JavaScript **16 318 Б** — существующее отдельное исключение теста; общий предел
12 000 не повышается и на новые bindings это исключение не распространяется.

Бюджет проекта (оценка, будущий результат обязательно перемерить):

| Поверхность | Добавление | Верхний ориентир | Предел |
|---|---:|---:|---:|
| Compact apply: один bounded envelope bindings, без всех node полей | ≤1 200 Б | ≤15 739 Б | 20 000 Б |
| Обычная карточка: binding_schema только своего типа | ≤1 800 Б | CrossTable ≤9 890 Б; Import Text ≤9 190 Б | 12 000 Б |
| Каждый файл узла: короткий пример и ссылка на общую справку | ≤500 Б | исходный размер + 500 Б, проверить до изменения | 6 000 Б |

Схема параметров для неподдержанных пока literal полей входит в эти 1 800 Б,
а не получает скрытый дополнительный резерв. Если карточка не помещается,
сократить поддержанный набор полей/текст, не повышать общий бюджет. Базовые
reference bytes и запас записаны в implementation. SKILL.md не расширять
развёрнутым общим текстом; место для любой ссылки измерить отдельно.
Данный каталог design docs не является файлом узла, который выдаётся модели.

## Решения владельца до реализации

Утверждение общего optional top-level bindings и binding_schema; точные
первые шесть полей после живого подтверждения; запрет неявных conversion/NULL
и отсутствие unbind в первом срезе; адаптация существующих Filter/CrossTable/LGD
без смены их контрактов; предложенный cold inventory и две приёмки.
Охват Variant читателя для трёх табличных типов — отдельный цикл W2 после
наблюдения входных мастеров, а не побочный эффект этого утверждения.
