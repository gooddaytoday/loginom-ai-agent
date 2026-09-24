> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-d4fb649eb6d1` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Node16 — Свёртка столбцов: разработка

Статус: **независимая часть реализована; полный exact variant_io BLOCKED**.
Это не принятие полного узла, не ревью, не Hermes и не релиз.

Ветка `codex/node-16-collapse-columns`, принятая база
`a3b419bde8a660e1905284ee62a46362d5a49e09`. Аккаунт test-1, собственный каталог
`/test-1/node16-20260913-a56c2488`, пакет `Node16-diagnostic.lgp`.
Node24 запускается явно из установленного runtime. Browser visible/maximized,
viewport:null. Source MCP/Dock HOME изолированы; общий plugin не менялся.

## Разрешённый variant-прототип

[Проверенный ограниченный prototype](collapse-variant-prototype-result-2026-09-13.md)
получает самостоятельные native tags до decoder; это устраняет неопределённость
источника для наблюдённых случаев, но не означает интеграции/полной приёмки.

## Follow-up пустого результата

Диагностика после checkpoint6e36609d установила неактивный upstream перед
входным мастером. Добавлен ранний безопасный отказ; отдельный save/reopen
и reexecute после штатной активации источника прошёл с сохранением связей.
[Подробности и новые доказательства](collapse-empty-persistence-2026-09-13.md).
Исторический отказ ниже сохранён; его причина больше не считается неизвестной.

## Реализация

`transform.collapse_columns`, mode `unpivot`: полные упорядоченные роли
information/transposed, явный ignore_empty для нового узла, сохранение
существующего состояния с parameters={}, изменение одной политики,
Done/Close/Execute, сопоставление входа/выхода и native-exclusions.
Native-наблюдение связано с конкретным узлом, мастером и записями обоих списков;
общее выделение после перемещения не делает поле доступным в старом списке.
При изменении ролей удаляются только доказанные obsolete unbound outputs,
сохраняются другие поля, исключения и autosync.

Для однородных транспонируемых полей Loginom7.4.2 возвращает скалярный Values
(подтверждено для integer); для проверенного смешанного набора — variant.
Каждый generated source проверяется по полной фактической схеме.

Отдельные общие коммиты:

- `da4f54d8`: native-нормализация Name→name/label исключённой записи;
  source/record/field/type/owner проверки сохранены.
- `488b37a4`: тип, representation и decimal сохранены в user-v1;
  require_exact_numbers отклоняет непроверенный non-null variant вместо
  ложного точного результата. Это защита, не готовый exact variant reader.

## Проверенные наблюдения и сценарии

- Пакет сохранён и открыт в отдельной новой сессии; роли и исключение DataTypes
  прочитаны без повторного задания. Reexecution parameters={} успешен.
- Mixed source: integer1, real1.0, string"1", real17digits, integer2147483647,
  Date с .123ms, boolean/Null/empty string и одинаковые метки I/S.
- ignore_empty=false →15строк; true →9строк. Empty string/0/false не пропускаются.
- Close после замены ролей/политики отменяет черновик; последующее выполнение
  сохраняет прежнее состояние.
- Замена ролей на information=[Zone], transposed=[B,I] проходит, obsolete Id
  удаляется; excluded DataTypes и autosync=false сохраняются.
- Wide:27входных полей,26транспонируемых в порядке F26..F01,2строки.
  Все54исходные scalar-ячейки проверены. После отдельного открытия —52строки,
  native Values integer, точная выборка10строк; полный собственный Preview
  независимо сверяет52строки/260ячеек, включая26Null. Аудитор отклонил7подмен.
- Replay успешной операции возвращает тот же результат без браузерных вызовов
  (482→482 в живом журнале).
- Role conflict/empty transposed отклонены до browser-call; неизвестное поле
  отклонено NOT_APPLIED/effect_possible=false/node:null после закрытия временного
  preview и до target-creation.
- Пустой вход и information=[]:0строк, сохранена полная схема Names,
  DisplayNames,Values variant,DataTypes. Отдельный аудитор отклонил7подмен.
- Вход переставлен D,B,S,R,I,Zone,Id; выход Metric,Scalar,Key,Zone,DisplayNames
  с русскими метками и excluded DataTypes.9строк; аудитор отклонил10подмен.
  После сохранения и нового открытия parameters={} / mappings=[] повторно
  подтвердили всю схему, метки, порядок и результат, без задания конфигурации.
- После фактического set_checked потерян ответ: AMBIGUOUS/configure. Replay
  вернул прежний результат, resume отказал; browser count2806→2806→2806.
  Native-флаг false и прежние роли B,I прочитаны отдельно;6подмен отклонены.
  Исходная runtime-сессия осталась заблокирована pending operation, включая
  следующие node.apply. Это НЕ успешное автоматическое восстановление.
  Диагност отменил свой черновик через подтверждённый UI Close, сохранил пакет
  и завершил сессию. Журнал AMBIGUOUS не сбрасывался/не переписывался.
  Последующие проверки — независимая сессия, не продолжение неопределённой
  операции и не обход её журнала.

- Входной Scalar variant отклонён до создания target: NOT_APPLIED,
  effect_possible=false, cleanup_complete=true, node:null.
- Дополнительный reopen пустого узла остановился AMBIGUOUS/input_mapping:
  native Loginom показал «Обнаружены связи с несуществующими объектами».
  В видимом входном списке остался Id; выходной список сохранял прежние поля.
  Запрос имел inputs=[] и не задавал новое подключение. Причина изменения
  доступной схемы upstream ещё не установлена; автоматическое удаление связей
  не выполнялось. Prompt отменён, собственный мастер закрыт с подтверждением.
  Это отдельный открытый диагностический пункт: исходный empty audit PASS
  сохраняет силу только для первого выполнения, persistence/reexecution этого
  empty-узла НЕ подтверждены. Evidence: reopen-empty.json, empty-prompt.json,
  inspect-reopen-empty.json в последнем run-dir. Журнал отказа сохранён.

## Доказательства и границы

Все raw-артефакты в собственной `unavailable:artifact-1f3f00ac9e4d7670`, не публикуются как память.
Основные run-dir:

- `live-1789276952774`: первоначальный native mixed probe.
- `live-1789278261737`: действительное DataTypes-off, полный Date scalar,
  owner/schema/record probe и исторический AMBIGUOUS исключения.
- `live-1789287816037`: исправленное новое исключение, первый save.
- `live-1789288166870`: reopen/readback, Close и обе политики Null;
  исторический failure stale output сохранён.
- `live-1789288878830`: успешная замена ролей, wide source/full role setup;
  исторический отказ ожидаемой variant-схемы для homogeneous integer сохранён.
- `live-1789289520017`: fresh runtime
  `4e1a3ac45ae1e86dce23df7d6872ce996e71304409fc9518990964edb21bb64f`,
  reopened wide execution/full Preview/replay/refusals, empty/mapped/lost reply.
- `live-1789290314798`: отдельное последнее открытие сохранённого пакета,
  повторное выполнение mapped без задания параметров, входной variant refusal
  и сохранённый отказ повторного открытия empty (см. ниже).

`packages/loginom-runtime/tools/loginom-acceptance/collapse/audit_diagnostic.py` проверяет mixed
configuration/display,13отрицательных подмен на результат. Он явно возвращает
exact_variant_acceptance:BLOCKED. `audit_wide.py` проверяет homogeneous полный
результат отдельно и не объявляет variant_io пройденным.

Финальный полный функциональный source baseline:1405PASS/1SKIP/0FAIL
(`unavailable:artifact-7ff20790bf52e872`);17направленных collapse tests.
После него уточнена только пользовательская строка описания скалярного Values
в node-api; функциональные обработчики живого pin не менялись.
Финальная направленная проверка collapse/API/result-schema:29PASS/0FAIL
(`unavailable:artifact-6860088a27b12178`). Первый sandbox baseline имел EPERM
локальных сокетов; повтор со штатным разрешением прошёл, отказы не скрыты.

Полный exact variant_io остаётся открытым: проверенный Preview теряет
самостоятельный integer/real subtype, хотя Date сохраняет ms. В отчёте
[variant blocker](collapse-variant-blocker-2026-09-13.md) приведены конкретные
frontend source pins, ReadVariant loss point и вариант нового read-контракта.
Raw native RPC не вызывался, transport не внедрён; DataTypes-off не ослаблен.
Hermes не запускался, слот не назначен. Не сливать/не публиковать эту ветку
как готовый полный node16. Чужие bootstrap/policy изменения сохранены.
