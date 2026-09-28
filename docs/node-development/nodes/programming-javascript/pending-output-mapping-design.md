# Выходное сопоставление до материализации исходных полей

2026-09-28. Уточнение private G7 persistence flow по live source105 writer08.
Реализация этого уточнения ещё не выполнена; это не закрытие G3/G7.

## Подтверждённое состояние

После своего Done S2 и снятия блокировки output mapping DataSetOutputSocketWizard
имеет полный cached source store из0 записей и target store из2 записей.
ObservedID/ObservedID/integer/data_kind1 и PhaseMarker/PhaseMarker/string/data_kind2
сохранились; Required=false; diagnostic connected:false/source_label:null (это не утверждение
о различии null и отсутствующего native свойства).
Внутри собственного headercontainer колонка dataIndex=SourceDisplayName,
itemId=colSourceDisplayName, exact tid ...;colSourceDisplayName имеет hidden=true,
DOM принадлежит мастеру, visible=false. Ячеек colSourceDisplayName_ нет; колонки
Name/DisplayName/DataKind/DefaultUsageType видимы. Это установлено по native/UI
состоянию, не по тексту ошибки и не по отсутствию результатов поиска.

Сейчас reader требует ячейку SourceDisplayName даже при таком скрытом заголовке.
Отдельно writer/auditor требуют полное равенство initial и pre-execution mapping,
включая исходные поля/связи. Исправить только DOM-предикат недостаточно: состояние
без исходных полей нельзя выдавать за полное проверенное сопоставление.

## Выбранный порядок

1. Узко распознавать native hidden source column только у наблюдённого
   DataSetOutputSocketWizard с source_count0, отсутствием ConnectedRecord и
   SourceDisplayName/SourceDataType у всех targets. Проверять complete stores,
   record identities, exact own header/column identity, hidden=true/visible=false,
   отсутствие source cells, уникальные visible Name/DisplayName и остальные
   прежние настройки/guards. Чужой, visible, duplicate, missing-header или
   connected target остаётся отказом. Не использовать diagnostic payload как
   authority: admission должен заново читать native/DOM в той же операции.
2. Возвращать отдельно проверенность configured target inventory и отсутствие
   подтверждения source identity. Полное сопоставление не заявлять. Сохранить
   raw proof в source cycle наряду с semantic mappings: нынешний helper удаляет
   flags/owner при semantic projection и недостаточен для нового состояния.
3. До final Execute требовать неизменности входного mapping, autosync и всех
   configured target properties относительно S1. Переход source fields/связей
   в неподтверждённое состояние допускается только с указанным native proof.
   Source/settings проходят прежние полные read/Close и module policy. Не
   переносить Execute перед чтением исходника и не принимать произвольный FAIL.
4. После нового owned Execute и typed output обязательно читать оба mapping
   полностью, с source_identity_verified=true, и сравнивать с initial semantic
   mapping. Сделать это до save2. Затем сохранить S2, выполнить прежнюю проверку
   после save и отдельный cold reader. Expected source не передаётся cold UI.
5. Cold before-execute может различать полное и доказанное configured-only
   состояние по тому же native контракту; его ожидаемые поля определяет только
   независимый auditor. После cold Execute требовать полное проверенное mapping
   и равенство writer-final, включая source fields/связи. Если cold встретит
   другое состояние (особенно input mapping), не расширять допуск без evidence.

Альтернативы отклонены: глобально игнорировать отсутствующую ячейку; заменять
native schema одним rendered text; объявлять cache source count0 доказательством
полного mapping; вообще пропускать pre-execution mapping; сохранять S2 до
проверки восстановленных связей. Простое ожидание не исправило observed layout:
он оставался стабильным до bounded timeout.

## Проверки и границы

Reader tests исполняют serialized функцию на собственном header, скрытом/видимом/
чужом/duplicate/missing header, source count>0, connected record, неполном store,
изменённом target/type/label/autosync и потерянной native identity. Отдельно
проверить, что старые callers не принимают configured-only как полный source proof.

Actual writer tests должны отвергать изменение configured targets до Execute,
отсутствие native proof, неподтверждённые mappings после Execute и попытку save2
до этой проверки. Auditor независимо проверяет raw identity/flags, configured
comparison и итоговое полное mapping, порядок journal событий и original budgets.
Новые fault injections не должны разделять реализацию predicate с auditor oracle.

Обязательны pinned source freeze, новые headed writer/cold processes с новыми
профилями для code и declared и прежние source/output oracles. Старые FAIL/пакеты
сохраняются. Это уточнение не разрешает новый public JS handler или CLI acceptance.
