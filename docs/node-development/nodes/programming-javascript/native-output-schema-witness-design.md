# D witness source audit: code → mapping → physical output0

Статус: source audit завершён; complete D schema witness пока **не доказан**.
Это документ проектирования, не source94 implementation и не live acceptance.
База аудита: HEAD `9132b60cdaf14481ca76f59248ef59159889fee6`, freeze93, 1281 pins.
Контракт — ROOT native-named-access-design §7 (S13, исторический snapshot первого
аудита; ROOT позднее изменил файл своим C checkpoint). Проверка выполнена по локальным
retained sources и замороженному runtime; browser, RPC, CLI и новое выполнение JS
не использовались. Загруженный frontend текущего live-сеанса этим аудитом не проверен.

## Вывод для допуска D

Найденные источники показывают отдельные поверхности metadata: configured
`engine.OutputColumnDefs`, отдельный code-preview `preview.ColumnInfos`, физический
preview dataset и output-port mapping. Ни один найденный путь не замыкает одновременно
фактическое code-generated поле, materialized mapping и physical output0 после completed
без загрузки metadata через RPC или повторного открытия wizard.

Поэтому физическое имя можно сохранять только как physical observation. При отсутствии
доказанной связи результат остаётся `case_complete=false`,
`code_to_physical_schema_link_unverified`. Совпадение Name, DisplayName, индекса или
значения не доказывает происхождение поля и не позволяет объявить изменение имени
нормализацией JavaScript engine. D live остаётся заблокирован до отдельного решения ROOT.

## Проверенные пути и границы доказательства

### 1. Configured code columns

S1: `CodeColumnsWizard.SetComponentAsync` получает `engine` и
`engine.OutputColumnDefs(i)` через `bg.selectAsync`/`bg.selectAll`; держит `FEngine`,
`FOutputColumnDefsArray`, первый элемент назначает `TargetColumns` (114–123).
`QueryColumns` возвращает `sourceColumns:null`, `targetColumns:this.TargetColumns`
(94–98). Это wizard определения столбцов, а не source→target materialized mapping.
Вход вызывает подготовку content, выход — `ApplyPropEditors` (132–149).

S2: `JavaScriptCodeWizard` выбирает Name/DisplayName/DataType из тех же
`OutputColumnDefs`, копирует их в `FOutputColumnDescs`. При code-configurable columns
редактору назначается пустой `OutputColumnDescs`; preview получает отдельный массив
(213–245). Копия plain metadata теряет field identity. Нет доказательства, что эти
configured definitions после AssignColumns становятся актуальными generated fields.
Нельзя использовать requested literals или эти копии как наблюдение code-source имени.

### 2. Code-preview — другой execution path

S3: `OnNewRowsReady` выбирает `FPreview.ColumnInfos(i)` и строит descriptors только
с `displayName`/`dataType` (222–235), без Name. `LoadPreviewData` вызывает
`FPreview.ExecuteAsync(count)` (262–275). Это не пассивное чтение уже completed output0.
Вызов preview для materialization D witness запрещён контрактом; даже его descriptors
не доказывают Name и соответствие физическому output-port field.

### 3. Output mapping и его UI records

S7 регистрирует `IBGColumnsMappingEngineOutputPort` и имя wizard. При уточнении ROOT
предоставил реализацию S14: полностью прочитаны все283 строки,18309bytes, SHA совпал
с manifest. Исторический пробел «реализация отсутствует» закрыт этим source retention.
Manifest сообщает static HTTP200 GET от2026-09-28T01:28:34.145444+00:00; это не
доказательство класса, загруженного в live browser.

S14 `QueryColumns` (116–136) выбирает через `bg.selectAsync(FOutputPort, ...)`
`port.SourceColumns`, `port.Socket`, `port.PatternDefs`, `port.TargetColumns` и
`targetColumns.Vendor.ValidUsageTypes`. Возвращает source/target collections и
`component=port.Socket`. S4 `PrepareContent` (578–589) сохраняет их в
`FSourceColumns`, `FTargetColumns`, `FPatterns`, `FComponent`. Это реальные имена
полей экземпляра wizard, а не догадка о скрытом proxy cache. После уже завершённой
подготовки они могут содержать локальные references. Уточнение S16 ниже показывает:
reference не удерживает временные selected descriptors на proxy. Их lifetime,
актуальность и достижимость после Done/completed не следуют из присваивания полям wizard.

S14 `SetComponentAsync` (149–177) выбирает переданный объект как
`IBGColumnsMappingEngineOutputPort`, сохраняет `FOutputPort`, затем
`FDataSource=safeCast(outputPort.Socket.Output, IBGCustomDerivedDataSource)`.
Выбираются SyncThroughColumns/StrictDataTypes/SupportExcludeColumns и vendor
ColumnDefs; autosync button получает FDataSource.SyncThroughColumns (171), затем
вызывается PrepareContent. Значит autosync UI отражает значение при подготовке,
а не безусловно свежий флаг после execution. Getter DataSource/OutputPort (223–231)
лишь возвращает FDataSource/FOutputPort, но для descriptor-only capture всё равно
допустимы только reviewed собственные data descriptors, без вызова getter.

Source подтверждает совместное получение mapping collections и Socket.Output из
одного FOutputPort. Он **не проверяет** `port.TargetColumns === FDataSource.ColumnDefs`,
не связывает этот FDataSource с physical preview interface116 и не доказывает, что
переданный value — именно owned JavaScript output0. Эти равенства/association нельзя
добавлять как установленный факт. Нужны сохранённые owner/port/session identities и
source-backed соответствие коллекций, включая physical field.

S14 `DoGetEditableColumnProperties` (87–102) раскрывает более сильный кандидат связи:
`columnDef.Extensions → IBGColumnDefMappingExtension.Source → IBGProxyColumnInfo`.
Через selectAsync выбирается DeriveType; затем safeCast результата Source и ветки
pdtChild/pdtNewborn влияют на доступность default usage type. В отличие от
Mapping.SourceName это object-valued relation, но метод использует его для UI editing,
не удостоверяет принадлежность generated code dataset. SafeCast может не дать proxy;
DeriveType не является доказательством исходного Name, code execution или связи с
OutputColumnDefs. Метод не удерживает Source/extension как witness и не гарантирует
их последующее сохранение. Нельзя выполнять этот UI метод ради capture.

S15 generated proxy подтверждает удалённую природу доступного fallback:
IBGColumnDefMappingExtension interface81 `get_Source` (25258–25305) отправляет
method188 и возвращает interface87. IBGProxyColumnInfo interface227 (79569+) имеет
RPC getter Name method646 (79614–79658), DeriveType method647 (79705–79748).
Не вызывать эти getters, cast или select, предполагая локальность. Если helper
переопределяет их на cache, его точная реализация, descriptor path и invalidation
должны быть доказаны отдельно. Retained generated RPC не доказывает, что именно этот
fallback будет использован загруженным объектом, но исключает blanket «getter read-only local».

Обновлять cache через этот wizard нельзя. S14 `SyncSourceColumns` (47–57) читает
SyncRequired, при true вызывает ActivatePorts → ActivatePortsSilent (27–38), затем
SyncToOutside(epsmDesign), InitializeSourceColumns и PrepareExcluded.
InitializeSourceColumns (40–45) делает PrepareContent/LoadGridStores/RefreshRelations.
RefreshSourceColumns (139–143) сначала Invalidate. Более того, PageChangeAsync
(197–205) при входе вперёд вызывает SyncToOutside(epsmDesignFastOptional), а PageEnterAsync
(207–221), даже при !SyncRequired, загружает stores/relations и при нулевом mapping
инициализирует target columns. DoCreateMappingToAll (72–85) может вызвать
FDataSource.SynchronizeSource(true,true). SetSyncThroughColumns/SynchronizeSource и
DoVerify (179–195) также имеют явные write/remote effects. Это достаточная причина
не переоткрывать wizard для witness; source не позволяет утверждать, что каждый такой
вызов обязательно исполнит JavaScript, но пассивным чтением существующего состояния
они не являются.

S6 содержит generated proxy интерфейса 860. `get_SourceColumns` (29392–29435)
посылает RPC method2351 и возвращает interface102; `get_TargetColumns`
(29437–29480) посылает method2352 и возвращает interface84. Это свидетельство механизма,
не разрешение вызвать методы. Обращение к похожему property нельзя объявлять локальным.
S8 дополнительно показывает, что custom proxy может перенаправлять методы на `$FHelper`
и готовить properties. Наличие helper само по себе не доказывает, что конкретный getter
читает cache; нужны точная helper implementation и наблюдение загруженного класса.

S4: `GetRelations` (472–505) выбирает target column.ID и extension.Mapping.SourceName,
находит target record по ID, source record — по **Name**, затем ставит reciprocal
ConnectedRecord. Это materialized UI association, восстановленная по имени, а не
самостоятельное доказательство identity code-field. `DoSetSourceColumn` (389–401)
использует `sourceRec.data.$self`, `targetRec.data.$self` и вызывает Mapping.SetSource:
его нельзя использовать для read-only witness. S5 PrepareStore (1120–1136) устанавливает
collection, удаляет записи, делает `loadAsync`, сбрасывает ConnectedRecord. Перезапуск
этого метода создаёт/обновляет состояние и не является чтением существующего cache.

S9 existing `readMappingBrowser` требует открытый видимый mapping wizard и два grid
store (18–33), проверяет bounded records и reciprocal ConnectedRecord (35–93), читает
autosync pressed state (129–146). Этот reader не даёт путь к закрытому wizard после
completed. Его nonempty Name и лимит `<240` также не соответствуют D-контракту,
допускающему необычное/пустое native имя при более строгих byte/unit bounds.
Нельзя переиспользовать результат как доказательство D или ослабить общий reader.

### Дополнительные object/index relations: направление ещё требует proof

S18 interface declarations подтверждают ColumnInfo.Collection (4825),
ColumnDefMappingExtension.Source/SourceIndex/Mapping (4834), DataSource.ColumnDefs/Columns
(4897), CustomDerivedDataSource.ProxyColumnInfos (4920), ProxyColumnInfo.Target/
TargetColumnIndex/NameBase/Token (4994). S19:5282 объявляет отдельный
DerivedDataSourceMappingEngineOutputPort с DerivedDataSource и Socket.
Ни совпадение интерфейсов, ни названия Source/Target не доказывают фактический граф.

Числовые contracts ниже извлечены из generated proxy implementation S6/S15;
это direct getter IDs, не новые методы metadata selection. Штатный RequestPropertyValues
использует metadata descriptors, а не ручную dispatch-подмену.

| Объект/interface | Getter → method | Return contract | Source lines |
|---|---|---|---|
| MappingExtension81 | Source→188; SourceIndex→189 | ColumnInfo87; int32 | S15:25258–25350 |
| ColumnInfo87 | Collection→145 | collection object; этот getter начинается26257 | S15:26238–26301 |
| DataSource116 | ColumnDefs→307 | ColumnDefs84 | S15:39879–39923 |
| CustomDerivedDataSource219 | ProxyColumnInfos→619 | ProxyColumnInfos234 | S15:35961–36005 |
| ProxyColumnInfo227 | Name и NameBase→646 | string, тот же method в обоих wrappers | S15:79614–79704 |
| ProxyColumnInfo227 | DeriveType→647; Token→651 | enum1byte; int32 | S15:79705–79748,79881–79924 |
| ProxyColumnInfo227 | Target→652; TargetColumnIndex→653 | ColumnInfo87; int32 | S15:79925–80013 |
| DerivedDataSourceMappingEngineOutputPort861 | DerivedDataSource→2354; Socket→2355 | DerivedDataSource221; socket720 | S6:43664–43783 |

Доказуемое направление getters: mapping extension → source column; proxy column →
его Target column и TargetColumnIndex; derived port → DerivedDataSource/Socket.
Возвращённый ColumnInfo87 не маркирует слой «оригинальный code» или «физический output».
Особенно нельзя по слову Target приравнять proxy.Target к target mapping record.
По inspected retained non-generated usages семантический bridge не найден; это
ограничение данного набора, не утверждение об отсутствии реализации в продукте.

Для будущего фиксированного source graph можно проверить Source.Collection и membership
в ProxyColumnInfos, затем один уровень Source-as-Proxy.Target/Target.Collection/Index.
Глубина строго один hop, без рекурсивного unwrap/поиска до совпадения строки. Нужны
наблюдённые native equalities и источник семантики этого hop. TargetColumnIndex сравнить
с Index **доказанного** target объекта, не автоматически с physical index0.
DerivedDataSource port getter — кандидат bridge к Socket.Output и D, но доступность
interface861 у JavaScript output0 не доказана; не выполнять speculative cast chains.

NameBase нельзя объявлять «сырым именем до нормализации»: в данном proxy он и Name
посылают одинаковый646. Token — int32, не доказанный generation/version counter;
одинаковый Token не исключает staleness/ABA. Даже object/index/collection agreement
оставляет code-generated provenance открытым до определения слоя и materialization.
Эти кандидаты не добавляют calls в5-request proposal автоматически: ROOT сначала
выбирает source-proven fixed graph, корректирует descriptors/лимиты и проверяет semantic
bridge. Не поддерживаемый интерфейс/неоднозначный hop означает stop, не fallback по Name.

### 3a. PropertySelector: scope selected values, nesting и surviving copies

S16 `ProcessPropValues` (118–126) ставит selected values через SetPropValues, вызывает
callback и всегда делает DeletePropValues в finally. `DoProcessPropValuesAsync`
(128–138) ожидает callback перед таким же cleanup. Однако `ProcessPropValuesAsync`
(140–146) при **обычном function callback** выбирает синхронный ProcessPropValues;
async function тоже является function, поэтому автоматически удерживать scope до её
Promise нельзя. Вариант с объектом callback имеет другой lifetime. Будущий capture
должен использовать короткий синхронный callback без await и не полагаться на неявное
продление scope.

`GetSelectPropValuesHandlerAsync` (160–164) сначала вызывает
rpc.TBGSession.GetPropertyValues, затем возвращает handler. S17:2543–2589 подтверждает
RequestPropertyValues request и DispatchMessageAsync; S16 selectAsync (482–504)
возвращает callback-wrapper. Это штатное remote metadata selection, а не пассивное
обнаружение уже существующего cache. SetPropValues временно меняет local proxy shape,
даже когда selected metadata getters не являются setters.

S16:949–969 WrapPropValue ведёт счётчики в `__$cachedProps`, определяет own properties;
UnWrapPropValue (970–985) при decrement до0 удаляет property и запись счётчика.
DeletePropValues (987–1000) снимает также cached interface casts. WrapQueryInterface /
UnWrapQueryInterface (638–684) ведут отдельный refcount и восстанавливают/удаляют
QueryInterface при последнем выходе. Поэтому сохранённые wizard.FOutputPort,
FSourceColumns/FTargetColumns или extension.Source references **не доказывают**, что
Name/Source/Items/Count/DeriveType сохранятся как own data descriptors после callback.
Последующее обычное чтение может снова обратиться к prototype getter/RPC.

Это не доказательство отсутствия всех cache:

- Вложенный/перекрывающийся selection удерживает обёртку, пока счётчик больше0;
  MergeItems (930–947) может объединять диапазоны. Такой survivor не имеет автоматически
  известной freshness и lifetime; нельзя удерживать его искусственно незавершённым select.
- Plain строки/числа, отдельно скопированные в callback, и сохранённые object references
  переживают снятие wrapper. Первые — исторические значения, вторые — identities;
  ни те, ни другие не делают underlying metadata неизменяемыми.
- UI record data / FOutputColumnDescs copies и специализированный `$FHelper` cache могут
  жить отдельно. Их ownership, invalidation и source relation проверяются отдельно.
- Selected свойство может быть accessor: GetCachedChangablePropDesc (893–915) содержит
  локальный getter и setter с вызовом исходного setter. Поэтому «own property» не равно
  безопасный data descriptor, а наличие cached wrapper не разрешает assignment.

Для Items range S16:549–568 возвращает локальные items только в `[start,end)`, за пределами
может вызвать OriginalItems. Любой capture обязан ограничиться индексом0 при диапазоне
[0,1), не перечислять «ещё одно поле» через Items(1). S17:2504–2524 кодирует range
отдельным selector descriptor; использовать selectAll для диагностического лимита нельзя.

### 4. Реально поддержанный physical metadata path

S10 замороженного runtime проверяет owner/Done, node/port и completed child (81–147),
затем уже видимый physical DataSetForm. Путь, существующий в коде:

```
Ext.getCmp(root.id).Controller = dc
 dc.FDataTable = dt
 dc.FDataSource = ds
 dt.FDataSourceStore = store
 ds.$FHelper = helper; ds.$ = identity
 dc.FColumnInfosStore.data.items = fields
 fields[0].data = field
```

S10:150–182 удерживает dc/dt/ds/store/helper/identity/fields/field/cache, проверяет
`dc.FModelNode`, единый datasource в table и store.proxy, helper.FBaseProxy,
сессию ds.$S, interface116 и remote owner/object. Проверяет total rows и loaded cache,
`$FDataChangeCookie`/`$FStateChangeCookie`, их identity/prototype/значения. Поле здесь
является записью physical preview metadata; код не доказывает равенство этой записи
объекту target column proxy из mapping. Текущий admission требует Value/Value/Integer
и не допускает D имена — это намеренно сохранено.

S11:25–27 сравнивает held snapshot, 56–81 проверяет его до/после каждого native read,
финально повторяет проверку. Method321 читает physical index; snapshot consistency
явно `observed_local_only`, не atomic server snapshot. S12:101–135 держит graph,
input edge/targetPort и completed process identities; это не отдельный output mapping
witness. Проверенные cookie identities относятся к physical datasource, не к неизвестной
code schema/mapping collection. Нельзя распространять их invalidation coverage на эти
коллекции без дополнительных исходников.

## Follow-up: owned diagram output0 → P; граница generated-source provenance

Source-only исследование ограничено retained frontend JS в preview-source-40 (75files),
output-schema-source-94 (2files), calibration-wizard-source87 (6files), плюс уже pinned
runtime S10/S12. Новые HTTP sources не получались. Filename/symbol search не подменяет
полное чтение всего сервера; серверный implementation в этой source closure отсутствует.

### Что именно хранится в diagramPort.data

S20 ModelForm.AddOutputPorts (996–1005) перечисляет **modelNode.OutputPorts**, добавляет
каждый через AddOutputPort и отдельно создаёт service AddPort. AddOutputPort (1007–1013)
берёт model-node port.Socket/Guid, создаёт diagram port, затем `xPort.SetData(port,...)`.
S21 Unit.SetData (103–118) присваивает `this.data=data`; GetData возвращает то же поле.
S20 DoMappingOutputPort (1374–1378) получает port.GetData и вызывает ShowNode Wizard.
Поэтому owned diagram output0 из S10 содержит model-node output-port object W, а не
автоматически engine output port P. Нельзя просто выполнить cast diagramPort.data→860
на основании UI типа или FGUid. AddPort service также нельзя принять за native output0.

S22 WizardModelComponentForm.PrepareOutputPortsWizard (225–258) показывает **другой**
путь: modelComponent.Engine.OutputPorts.Items(i).Port, затем интерфейс
IBGModelEngineOutputPortInfo и выбор wizard vendor; engine port передаётся
AddWizardVendorAsync. S7 выбирает mapping wizard, S14.SetComponentAsync сохраняет
переданный outputPort в FOutputPort. Это source-backed роль engine port как входа
mapping wizard. Исполнять PrepareOutputPortsWizard ради проверки нельзя: он открывает/
строит wizard, использует selectAll и vendor actions. Также portInfo.Guid используется
для поиска vendor по InterfaceInfo, а не доказан как instance GUID diagram port.

### Статически проверенный native graph и contracts

S19 metadata плюс S6 generated proxies дают следующий путь (стрелки — getters,
не выполненные в этом аудите обращения):

```
held diagram node.data = N (ModelNode1069)
held diagram output0.data = W (ModelNodeOutputPort1081)
W.Parent.ParentNode → N
W.Socket → socket961
N.Component → component780
component.Engine → engine781
engine.OutputPorts → items815
items.Items(i) → item814
item.Port → enginePort812
enginePort.Socket → socket961
enginePort --selected interface cast--> P:ColumnsMappingEngineOutputPort860
P.SourceColumns → ColumnInfos102; P.TargetColumns → ColumnDefs84
```

| Getter | Method → result interface | S6 actual proxy lines |
|---|---|---|
| W.Socket |2825→961|71037–71081|
| W.Parent |delegates ModelNodePort.Parent; metadata2807|71031–71033; S19:6262|
| W.Parent.ParentNode |2815→1069|71708–71754|
| N.Component |2245→780|68617–68661|
| N.OutputPorts |2240→1082|68347–68391|
| component.Engine |2112→781|51905–51949|
| engine.OutputPorts |1700→815|52546–52590|
| output items.Items(i) |2200→814|59296–59343|
| output item.Port |2199→812|59106–59150|
| enginePort.Socket |2193→961|58947–58991|
| P.SourceColumns/TargetColumns |2351→102;2352→84|29392–29480|

Важно: для **output** item используется2199→812, а generic EnginePortItem имеет
другой2181→817. Не смешивать эти typed contracts. Также specialised derived port861
может иметь Socket2355→720 (предыдущий раздел); равенство interfaces не требуется,
но cross-interface object association должно быть получено явным native cast и
проверено в одной session. Нельзя выводить alias только из названия Socket.

**Уточнённый кандидат admission P без wizard.** После отдельного ROOT разрешения
metadata-only протокола возможны два bounded select stages до пяти schema stages:

1. От уже held W выбрать Index/Parent.ParentNode/Socket и nested node.Component.Engine
   с OutputPorts.Count. Сверить parent node native identity с N и held graph/port0,
   W.Index=0 и native node port collection membership; сессия/owner unchanged. Для
   первого узкого D-кандидата потребовать engine.OutputPorts.Count=1. UI output count
   включает AddPort и не задаёт это число; фактический native count ещё не наблюдался.
   При другом count stop, а не автоматическое расширение сканирования.
2. От полученных output items выбрать только range[0,1), Count ещё раз, item и
   item.Port с Socket; выполнить только фиксированный selected cast к860. Требовать
   enginePort.Socket native identity равную W.Socket (не Name/Index/Guid equality),
   P относится к тому же selected engine port и session, вернуть held refs и scalars
   внутри sync callback. Unsupported cast/другой Socket — stop. Если специальные socket
   wrappers не сравнимы без нового alias bridge, admission остаётся незавершённым.

Это конкретный проверяемый bridge, но **source не доказывает его фактическое выполнение
или истинность этих равенств для текущего D узла**. Содержимое private browser runtime
не читалось. Нужны повторные owner/socket/component/engine/port checks, особенно OnEngineChange:
held старый P не становится текущим от сохранённой ссылки. Если Stage1 требуемый selector
collection membership не укладывается в reviewed tree, пересмотр descriptor/budget
проходит ROOT отдельно. UI/engine collection indices не являются общей identity.

Два admission stages должны войти в revalidation каждого раунда, а не оставаться
однократной предпосылкой. Уточнённый проектный лимит — **7 select API calls/раунд,
максимум4 раунда=28 API calls**, если выбран этот вариант. Ни7, ни прежние5 не являются
автоматической верхней границей wire RPC (см.transport caveat). Это предложение изменения
бюджета для ROOT, не разрешённое выполнение и не изменение frozen source93.

### Почему P.SourceColumns пока нельзя назвать original code schema

S19:5887 metadata именует SourceColumns/TargetColumns и getter IDs. S6:29392–29435
реализует SourceColumns только как request2351→interface102; client не вычисляет это
из engine.OutputColumnDefs и не показывает, какая server collection стоит за ответом.
S14.QueryColumns передаёт ответ в wizard; SyncToOutside/ActivatePorts загружают или
меняют состояние, но их вызовы не раскрывают внутреннюю materialization AssignColumns.
S14.Source extension и S18.ProxyColumnInfo описывают доступный interface graph, а не
происхождение original code-name. S1/S2 — configured columns; S3 — отдельный preview.

В inspected closure встречается IBGJavaScriptEngine/OutputColumnDefs в wizard callers,
но не найдена component-specific generated-source implementation, которая доказывала бы
`AssignColumns result collection === P.SourceColumns` либо точный промежуточный proxy
mapping. Не делать inference, что отсутствие client implementation означает отсутствие
функции на сервере. Даже успех socket bridge + Source/Target/Collection equality даёт
лишь owned **mapping-source-to-physical** observation. Оно не различает engine name
normalization и rename, уже выполненный до SourceColumns.

Остающийся provenance gate: retained server/component implementation либо иной
проверяемый native lineage contract, связывающий фактическую code-generated collection
и её original field с P.SourceColumns (включая proxy.Target/Collection/индекс и правило
именования), плюс freshness после completed. NameBase646/Token651 это не заменяют.
Без такого proof `case_complete=false`, `code_to_physical_schema_link_unverified`.
Не расширять semantic conclusion по совпадению requested/observed строк.

## Требуемое замыкание identity и staleness

Будущая отдельная D capability допускается только для пяти закреплённых D sources из
S13, code mode, generation=true, **наблюдённого** autosync=true, исходного owner/Done
и owned completed output0. Requested metadata, code-source metadata и physical-target
metadata хранятся раздельно. На каждом из двух переходов требуется идентифицированный
объект и источник связи; lookup по имени и совпадение строк недостаточны.

Нужно удерживать исходную code collection/field, mapping collection/record/extension,
physical field, datasource и generation/invalidation witnesses, а также exact строки
и types/indices. Данные сериализуются с JSON escaping; Name и DisplayName отдельно
не более128 UTF-16 units и512 UTF-8 bytes. Без trim, ASCII regex, transliteration и
caller-supplied expected name. Для source и target требуется полный набор из одного
Integer field, physical index0; output1row, upstream4rows. Payload остаётся exact
−9007199254740991 (`010000000000e0ff`) независимо от observed имени.

Digest служит экспортируемой уликой, не заменяет page-local held objects. Revalidation
необходима до/после каждого разрешённого data RPC, после upstream и при final report:
те же объекты, строки, prototype/runtime pins, owner/session/port/completed child,
collection membership/count, cookies и доказанное invalidation state. При замене,
accessor вместо data descriptor, pending load, неизвестной freshness или разрыве
association — отказ. Новый execution, Apply/Done, reopen и metadata RPC не допускаются.
Одинаковая identity без доказанного обновления/invalidation также может быть stale.

## Пробелы и ограниченное предложение capture для ROOT

Реализация output mapping wizard теперь установлена (S14), object-valued
extension.Source найден (S14/S15). Всё ещё не установлены: component-specific proxy
и helper OutputColumnDefs/generated code schema; материализация code-generated field;
принадлежность extension.Source фактическому code dataset; локальный cache для
Source/DeriveType и его invalidation (S16 теперь доказывает временный scope select,
но не lifetime отдельных helper/UI cache); доступность и срок жизни mapping cache после
Done/completed; native mapping target →
physical preview field association; invalidation/cookies обеих schema collections;
загруженное соответствие retained source hashes. Не придумывать `$F...` пути к этим данным.

### Конкретный следующий дизайн: controlled metadata selection (proposal)

**Только предложение для ROOT review, не разрешение RPC или runtime implementation.**
Предыдущий descriptor-only вариант сохраняется лишь если найден независимый cache с
proven lifecycle/invalidation. Теперь основным предложением является отдельная узкая
metadata capability, использующая штатный select protocol. Она потребует явного
изменения прежнего no-metadata-RPC контракта; нынешний D допуск остаётся закрыт.
Нельзя молча расширить source93 reader или выполнить это proposal в текущей сессии.

**Два корня и admission.** `D` — уже held physical datasource `dc.FDataSource` из S10,
interface116. `P` — IBGColumnsMappingEngineOutputPort данного owned JavaScript output0.
S14 подтверждает операции над P; follow-up выше устанавливает construction path
и candidate bridge через одинаковый native Socket. Фактические association, loaded
classes и selected metadata admission всё ещё должны быть проверены до реализации. Нельзя брать произвольный P от caller,
из найденного wizard или по совпавшему имени. До первого запроса закрепить document,
node,port0,source hash одного из пяти D cases,generation=true,Done,completed child,
исходную process fingerprint, D session/remote identity, physical cache/cookies и P
association с тем же node/port. Если нет уже существующего P с доказанной association,
остановиться до RPC; не открывать wizard для получения P.

**Schema часть раунда, максимум5 select API calls** (P admission follow-up добавляет2). Каждый callback синхронный: копирует
только allowlisted scalars и удерживает ссылки; selected descriptors после него не
используются. Каждый request предваряется и завершается локальным owner/process/cache
check. Select descriptors фиксированы implementation, caller их не передаёт.

1. От P выбрать `SourceColumns`, `TargetColumns`, `Socket.Output` с cast в
   IBGCustomDerivedDataSource, `SyncThroughColumns`, `ColumnDefs` и Counts трёх collections
   (пути S14:116–177). Требовать autosync=true, все counts=1. Не выбирать PatternDefs,
   Vendor, SyncRequired, Verify, callbacks или какие-либо actions. Скопировать references
   P/S/T/socket/output/output.ColumnDefs и их remote identity/session. Не считать
   T===output.ColumnDefs установленным заранее: проверить фактически, иначе stop.
2. От уже held D выбрать `ColumnDefs` и Count. Это реальный interface116 getter,
   S15:39879–39923, method307→interface84, а не придуманный dc cache path. Требовать
   Count=1 и native collection identity равную P.TargetColumns и output.ColumnDefs.
   Если backend даёт разные wrappers/collections, не считать равенство по строкам
   достаточным: нужен отдельно source-backed alias/cast bridge, до него stop.
3. От S выбрать `selectRangeAsync(S,0,1,...)`: ровно один source field, его
   ID/Index/Name/DisplayName/DataType/Collection, и повторить Count=1 в selector.
   S16:431–449 и549–568 дают `[0,1)` semantics. Native Collection getter — S15:26257+,
   method145. Требовать Index0, Integer, Collection=S. Не запрашивать рекурсивный lineage.
4. От T выбрать такой же диапазон0..1 и target metadata, Extensions с интерфейсом
   IBGColumnDefMappingExtension, его Source,SourceIndex и ограниченные metadata Source.
   S15:25258–25350 подтверждает Source method188→interface87 и SourceIndex method189;
   S14:87–102 подтверждает cast Source в IBGProxyColumnInfo/DeriveType. Require:
   target.Collection=T, extension.Source identity равна captured S.Items(0),
   source index0 и повторный Count=1. DeriveType можно фиксировать лишь как наблюдение,
   не как oracle. Если cast unsupported, ambiguous или Source не тот field — stop.
5. От D.ColumnDefs выбрать единственный field тем же диапазоном. Требовать native
   identity равную T.Items(0), Index0/Integer, collection identity та же. Metadata
   physical-preview record из S10 сверить отдельно как corroboration, не как identity
   oracle. Native D.ColumnDefs(0) становится предлагаемым authoritative physical field;
   native value остаётся чтением D по index0,method321. Это новая capability, а не
   ослабление старого Value schema guard.

Пункты3–5 описывают фиксированный selector tree, а не готовый исполняемый snippet.
Property names/typed casts должны пройти сверку generated metadata до implementation;
если нужный Count нельзя включить в тот же range selector штатным API, нужен отдельный
ROOT-approved пересмотр бюджета, не скрытый дополнительный вызов. No selectAll,
никаких fallback getter calls за пределами callback, никаких dynamic selector paths.
SourceIndex/Collection/identity являются проверяемыми связями; Name equality не заменяет их.

**Что этот раунд реально доказывает при успехе.** Он может установить цепь
P.SourceColumns[0] ← target.MappingExtension.Source; target принадлежит P.TargetColumns
и D.ColumnDefs, а D уже связан с physical output0 и completed child. Remote equality
требует одинаковой session и canonical native object identity; held proxy refs также
удерживаются. Разные interface IDs одного объекта могут требовать явной доказанной
cast association; нельзя смешивать owner/object из разных sessions или считать
произвольные proxy wrappers взаимозаменяемыми. Existing preview field object и native
ColumnDef proxy не обязаны быть одним JS object — новый native witness это различает.

Но P.SourceColumns[0] ещё **не автоматически original code field**. Не закрытый source
вопрос: как JavaScript engine materializes AssignColumns result в SourceColumns,
есть ли proxy rename до mapping, что означает Source.Name против underlying code Name.
S1 OutputColumnDefs — configured definitions; S3 code preview — отдельное выполнение.
Ни то ни другое не закрывает gap. Требуется component/server или retained client path,
связывающий code-generated collection с S (включая wrappers/DeriveType). До этого даже
полностью совпавшая цепь называется `mapping-source-to-physical observation`,
`case_complete=false`, `code_to_physical_schema_link_unverified`. Requested literals
остаются отдельно от observed mapping-source и physical names.

**Лимиты, freshness и cleanup.** Предлагаемые policy bounds:5 schema select calls +2 P-admission calls/раунд,
не более4 раундов (перед output value read; после него; после upstream; final),
итого≤28 select API calls, один pending API operation, no retry/replay, общий metadata
deadline≤60s, отдельный request≤10s; существующие более строгие deadlines сохраняются.
На раунд≤32 held objects, не более одного field на collection, Name/DisplayName
≤128 UTF-16 units/512 UTF-8 bytes, сериализация≤16KiB; никаких payload/data row запросов.
Timeout, oversized response, ownership change, новое выполнение, loading или mismatch
делают capability unusable, а не запускают новый Sync/reopen. Никаких
Sync/Activate/Verify/Set/Execute/SynchronizeSource/Invalidate/Apply/Done.

Число select calls не равно гарантированному числу wire requests. S17:2733–2735
предупреждает о возможных сообщениях при custom proxy creation. Это не означает,
что каждый decode отправляет RPC: требуется closure конкретных helper constructors
или отдельно разрешённое transport observation. Превышение allowlist/budget должно
закрывать capability; такую возможность ещё предстоит доказать, а не обещать по5calls.

Это policy limits, а не уже доказанные transport guarantees: GetPropertyValues сначала
декодирует ответ, поэтому post-decode byte check не ограничивает серверный string payload.
S17 success path освобождает request/response, но catch не содержит полного finally cleanup.
Это ограничение **error-path assurance**, а не требование переписать штатный frontend.
Уточнение S17:3779–3787: Release возвращает JS buffer в локальный pool;
CacheSize16/MaxCachedDataSize1048576 (7204–7208). Пропущенный Release сам по себе не
доказывает server leak. SplitPropertyValues создаёт локальные fragment buffers,
ReadPropertyValues освобождает их при decode; success верхнего buffer не доказывает
полный error-path cleanup. Нельзя добавлять ручной Release поверх штатного API:
в показанном Release нет idempotence guard. Глобальный monkeypatch и переписывание
Loginom RPC не предлагаются.

**Успешный metadata read:** штатный selector завершён; короткий sync callback скопировал
все required scalars в immutable DTO и удержал только явные identities; callback scope
закрыт, нет известных pending API operations; owner/process/schema associations повторно
проверены. После finally никаких ленивых property reads из selected proxy. Успех одного
API read не означает case_complete: code provenance, four-round revalidation и обычный
подтверждённый cleanup остаются самостоятельными требованиями. Local pooling internals
не объявляются проверенными по одному fulfilled Promise.

**Безопасный отказ:** при timeout/decode error/ownership uncertainty capability retire,
DTO не публиковать, запретить replay и дальнейшие metadata/data/UI операции. Late Promise
completion не может снять retirement или опубликовать DTO. Закрывать только собственный
browser context; не пытаться UI logout/close-package через неясное runtime состояние.
Оставить pending/late outcome и server cleanup неизвестными, если их нельзя подтвердить;
не заявлять server cancellation. Не выполнять ручной Release скрытых API buffers.
Такой fail-closed outcome — не успешная приёмка и не полное подтверждение cleanup.

Это соответствует существующему source93 precedent S23: javascript-live.mjs:1278
отказывает UI cleanup при nativeReadUncertain,1393–1398 закрывает собственный context и
ставит CLEANUP_UNCONFIRMED, если package close/logout/browser close не подтверждены.
Для будущей metadata capability ROOT может отдельно допустить такую же политику отказа;
текущий runtime не изменён и этот путь не исполнялся. Pooling gap сам по себе не блокирует
source исследование или такой ограниченный diagnostic design.

До выполнения всё ещё нужны review реальных metadata getters/custom constructors,
wire side-effect boundary и утверждённый byte/deadline budget. Client getter source не
доказывает, что сервер не materializes state; это не исправляется browser close.
Если безопасная граница неизвестна, ROOT сужает конкретный diagnostic protocol отдельно.

Каждый раунд строит свежие копии metadata **внутри callback**, держит native objects,
сравнивает exact scalars/association/digest с первым, подтверждает removal/restore
временных wrappers после callback относительно исходного nesting state; не вызывает
UnWrap/DeletePropValues вручную. Не удерживать selection scope открытым вокруг data RPC.
Проверять identity/cookies/process до/после каждого request; code/mapping invalidation
также должен быть proven либо freshness остаётся only observed-at-reads. Четыре совпавших
раунда не доказывают atomicity/отсутствие ABA между ними. Без version/invalidation witness
нельзя заявлять непрерывную неизменность schema. Missing lifecycle/source ownership
остаётся причиной UNRESOLVED, а не заменяется одинаковым digest.

**Предлагаемый следующий шаг ROOT.** Разрешить только source closure для P association,
JavaScript generated-S provenance, selector metadata/getters, successful-read/uncertain-failure policy и native
field identity bridge. Затем ROOT может отдельно рассмотреть этот фиксированный
metadata-only protocol как diagnostic capture; execution и D acceptance требуют
отдельного решения. Ни одного из этих RPC/кастов этот аудит не выполнял.

## Альтернатива: code-side telemetry в новом двухколоночном probe family

**Оценка design, без реализации и live.** Формальный Data API S24:553–620 объявляет
IColumnInfo.Name/DisplayName/DataType, IColumn.Index и
IOutputTable.GetColumn(index):IOutputColumn, AssignColumns/Append/Set.
Это API contract из документации, не доказательство поведения конкретного server build.
Тем не менее он позволяет предложить прямое code-side наблюдение без восстановления
внутренней server implementation getter2351.

Новый fixed source может создать **два** столбца в единственном output port0:
исследуемый Integer index0 и telemetry String index1. Requested Name/DisplayName первого
столбца задаются закрытой матрицей; имя второго — фиксированный отдельный ASCII literal,
не совпадающий с любым requested исследуемым именем. После AssignColumns source читает
`OutputTable.GetColumn(0)` и копирует **реальные properties** Name,DisplayName,Index,
DataType. Он не строит observed metadata из переданных AssignColumns literals.

Предлагаемая последовательность: создать обе definitions сразу одним AssignColumns;
снять scalar snapshot index0 (и identity-relevant metadata index1), проверить bounds;
Append ровно один раз, Set index0 exact Integer candidate; повторно прочитать index0
и сверить metadata; записать bounded JSON в index1 через Set по numeric index.
DTO: фиксированная version/probe-id, code-side column count и два metadata snapshots;
requested metadata и source hash хранятся отдельно в harness evidence. JSON не содержит
computed expected physical name или произвольные payload objects. Bounds сохраняют
128 UTF-16 units/512 UTF-8 bytes на Name/DisplayName, например полный JSON≤4096UTF-8 bytes.
Конкретные source bytes/hash и budget должны быть отдельно утверждены ROOT; здесь их нет.
Сам hash source не включать в source рекурсивно: он закрепляется внешним owner witness.

Для такого probe новый native contract читает из того же held completed datasource
ровно1row×2columns: native Integer index0 (exact −9007199254740991,
bytes010000000000e0ff) и native String index1 (strict bounded JSON, exact schema/types,
no extra keys/duplicate fields). Source admission, Done, completed child, original
upstream4, generation/autosync, cookies, deadlines и source hash остаются обязательными.
Нельзя получить допускаемые schema names из caller или самой telemetry без проверки
фиксированного выполнявшегося source и native field associations. Preview не oracle.

**Что даёт telemetry.** Если exact fixed source действительно выполнился в owned child,
а String cell прочитана из его же output0 с нужной association, DTO является наблюдением
API-visible code column metadata в указанной точке JS выполнения. Это прямее, чем
пытаться объявить P.SourceColumns исходной code schema по typed interface. Сравнение
с independently read native physical fields даёт paired code-side/physical observations
и не требует полного объяснения внутреннего сервера. Для P/socket mapping нужен новый
явно двухколоночный identity contract: Count2, диапазон[0,2), два source fields/two targets,
Source/SourceIndex/Collection и native D.ColumnDefs associations; не расширять existing
one-field reader автоматически. Совпадение имён не используется вместо этой связи.

**Пределы.** Instrumentation меняет schema cardinality1→2, sequence и добавляет
GetColumn/property reads/JSON/Set. Это новая probe family/fixture с новыми hashes,
не повтор старых пяти D cases, не их заднее принятие. Такой вариант совместим с full
handler scope «один output port, несколько columns», но сам ещё не реализует handler.
Даже если несколько requested имён проверены, вывод ограничен этим instrumented source.
Telemetry фиксирует Name API в момент snapshot; не гарантирует identity после окончания
execution и не объясняет, какой server layer выполнил последующий rename. При отсутствии
P/native field association возможно сообщить только end-to-end observation с gap,
не локализовать rename. Failed GetColumn/JSON/Set не означает rejection исследуемого
имени без отдельного source attribution. Partial output после failed child не читать.

**Рекомендация ROOT:** рассмотреть этот отдельный diagnostic family как конечный способ
получить code-side данные, вместо неограниченного поиска недоступной server implementation.
Старые D one-column cases оставить UNRESOLVED. Выбор нового family, изменение schema/native
reader и live остаются отдельными решениями ROOT; настоящий audit на этом завершён.

## Сохранность и проверка

При первоначальной записи и уточнениях S14/S15 и S16/S17, а также P-bridge follow-up проверены1281/1281 freeze93 pins
и108/108 ранее существовавших документов по `/tmp/d-schema-audit-doc-baseline.json`.
После записи уточнения проверка повторена. Единственное изменение этого аудита — настоящий документ. Runtime, tests,
предыдущие dirty/untracked docs и ROOT C evidence не менялись; тесты не запускались,
поскольку executable code не изменён. Факты ROOT live этим документом не переоцениваются.

## Источники: точные bytes и строки

SHA ниже вычислены непосредственно по прочитанным файлам; **S13 — исторический SHA
снимка первого аудита, не current hash изменяемого ROOT design**. Ссылка S13 ведёт на
текущий ROOT файл: она не является immutable snapshot. Immutable provenance S13 —
указанный git commit/path; его bytes воспроизводят historical SHA. При уточнении §7 перечитан;
полный файл не перепинован, checkpoint ROOT не изменялся этим аудитом. Retained HTTP provenance
manifest описывает историческое получение sources, не проверку loaded live frontend.
Ссылки указывают первую строку диапазона; диапазоны приведены отдельно.

- **S1** [CodeColumnsWizard.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/CodeColumnsWizard.js:94), строки 94–149. SHA256 `af4f512a9981e70066aadb3351a324b038dea3cc6d7bd00e1b5647043e0e3173`.
- **S2** [JavaScriptCodeWizard.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/JavaScriptCodeWizard.js:213), строки 213–245. SHA256 `ab0d3102321e00f38b5bd373c995bba67eb5beab1c10f1c349e8a7109b4362c7`.
- **S3** [CodePreviewController.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/CodePreviewController.js:215), строки 215–280. SHA256 `3a419d3e2735ea4ee113fe8567c3c87d47b604d6ae55181fa1995d9347d3d34a`.
- **S4** [ColumnDefsMappingWizard.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/ColumnDefsMappingWizard.js:389), строки 389–401, 472–505, 578–589. SHA256 `8f13072c9e9ee38251adbc0a10ce17c4d145165e6d064111b5ec30b03a84a2bf`.
- **S5** [ColumnsMappingWizard.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/ColumnsMappingWizard.js:89), строки 89–105, 1120–1136. SHA256 `0bf1921f44e7ff631cd6e7dea50f23ba0d1fe845629de2ba441d56f7aa130a48`.
- **S6** [fix61-bg.model.rpc.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-bg.model.rpc.js:29370), строки 29370–29480,43664–43783,51905–51949,52546–52590,58947–58991,59084–59150,59296–59343,68347–68391,68617–68661,71031–71128,71708–71754. SHA256 `53d043e4a7ee9dcc8006aa8915ca43d83a1df427fa0d73d8ea403357ec61a28f`.
- **S7** [fix43-bg_wizards_columns_ColumnsMappingEngineOutputPortWizardVendor.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix43-bg_wizards_columns_ColumnsMappingEngineOutputPortWizardVendor.js:13), строки 13–18. SHA256 `2de56e6bdb0fa4d4fe0ef63d90e637ae3f4634d1c75e1be5261873a7f72ddd75`.
- **S8** [fix61-bg_js_CustomProxyClassBuilder.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-bg_js_CustomProxyClassBuilder.js:1), строки 1–5, 25–61. SHA256 `9a28a3686efff3e2b4904994d876f43b0cb592da7f8e2f051a2fd68d15b6d18b`.
- **S9** [node-mapping-context.mjs](/home/george/git/loginom-ai-agent/.worktrees/node-javascript/packages/loginom-runtime/client/lib/node-mapping-context.mjs:18), строки 18–93, 129–146. SHA256 `c5577f0085dca6ca2fc3cbe7010832e1ec628debddfdf150ff715c205f159a46`.
- **S10** [javascript-native-roundtrip-binding.mjs](/home/george/git/loginom-ai-agent/.worktrees/node-javascript/packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-binding.mjs:81), строки 81–182, 208–209. SHA256 `31642ecc66c896b765e2c82bdbb707b66829230b5ff9857c89cf5c9a3105d090`.
- **S11** [javascript-native-roundtrip-read.mjs](/home/george/git/loginom-ai-agent/.worktrees/node-javascript/packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-read.mjs:18), строки 18–27, 56–94. SHA256 `b11ae0308995146b531c0295a4463ef769bf9c816444a335bd0ed025c35ca2a1`.
- **S12** [javascript-native-roundtrip-owner.mjs](/home/george/git/loginom-ai-agent/.worktrees/node-javascript/packages/loginom-runtime/tools/loginom-acceptance/javascript-native-roundtrip-owner.mjs:101), строки 101–135. SHA256 `94754890dbb70fddc5dc051e02ae78f677ce676fdb5b94e1df94b6a1cf7a4ded`.
- **S13** [native-named-access-design.md](/home/george/git/loginom-ai-agent/docs/node-development/nodes/programming-javascript/native-named-access-design.md:432), исторические строки 432–480 (§7), git revision `99b80bac69df5a469a01bd8bb951a75242cfe7c4:docs/node-development/nodes/programming-javascript/native-named-access-design.md` (SHA независимо проверен через git show). Historical snapshot SHA256 `acac8dfe4b0521ae735bd287ff09a39ebeedbf199789c0e1f9f8e33a93a1ab06`.

- **S14** [ColumnsMappingEngineOutputPortWizard.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/output-schema-source-94/ColumnsMappingEngineOutputPortWizard.js:1), полностью1–283; ключевые27–57,87–102,116–177,179–231. SHA256 `6ad8ed1584136ec0fa3244e89a823f17f70fa561c998660390bd672ec514a79d`.
- **S15** [fix61-bg.rtl.rpc.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-bg.rtl.rpc.js:25258), строки25258–25350,26238–26301,35961–36005,79569–79748,79881–80013,39879–39923. SHA256 `11ac2c63d2e8162b974f57d14e0f4f57b19cc80d3d39797be377e22eced6a973`.

- **S16** [PropertySelector.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/output-schema-source-94/PropertySelector.js:118), строки118–180,431–504,538–568,638–684,865–1000. SHA256 `f630266cafcbb6559e6a7f521ff9e6c807b88be13e18e0d546e939c8f14c7b55`,55817bytes.
- **S17** [fix61-bg_js_rpc.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-bg_js_rpc.js:2504), строки2504–2524,2543–2652,2658–2743,3779–3787,7204–7208. SHA256 `afeb91811a02da1f7841fb8c03e3003686c98a051f09186af082a3c44a12b4cc`.

- **S18** [fix61-bg.rtl.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-bg.rtl.js:4825), строки4825–4838,4897–4923,4994. SHA256 `052ec6039e68de03f2e34fea56c3e3ed8b7b0dddadb03281ff8d9a816e6e5dc9`.
- **S19** [fix61-bg.model.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-bg.model.js:5282), строки5075–5078,5120,5169,5210,5282–5283,5442,5466–5471,5522–5537,5887,6126–6127,6197–6204,6248,6260–6265,6276,6315. SHA256 `d3ab87a3aca82985d41a8b9d4b3502c9d8d662204c67c07fb3ff2156d802407a`.

- **S20** [fix47-bg_app_ModelForm.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix47-bg_app_ModelForm.js:996), строки996–1014,1374–1378. SHA256 `f9e09db636782035cd02066f3592a95f61d65cbe7f70fca92e30b5d6b969e05c`.

- **S21** [fix47-bg_mxgraph_unit_Unit.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix47-bg_mxgraph_unit_Unit.js:103), строки103–118. SHA256 `c081ed053f2dc43b8cff9bd2a67bc163498ea90f7db35687f43ccb425b132658`.

- **S22** [WizardModelComponentForm.js](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/WizardModelComponentForm.js:225), строки225–258. SHA256 `90f0b274f3a59d471c73dec33149de41aff109e985ef7b76d475703ba1e5a5d4`.

- **S23** [javascript-live.mjs](/home/george/git/loginom-ai-agent/.worktrees/node-javascript/packages/loginom-runtime/tools/loginom-acceptance/javascript-live.mjs:1278), строки1274–1279,1391–1398. SHA256 `bb2f51c2f78fac533116a960158514821c7d86d552d2412c2b2a8cae4c81deaf`.

- **S24** [js_node_loginom_system_prompt.md](/home/george/git/loginom-ai-agent/docs/node-development/nodes/programming-javascript/references/js_node_loginom_system_prompt.md:553), строки553–620, формальный Data API; metadata документации, не loaded server proof. SHA256 `c9c2d44d4dc4cf34b8f21a98504cf9f6acfc70cac510c36fe2725e7c0d7c2d16`.

Retained provenance manifests:
- [manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/manifest.json:1), SHA256 `72a2264d29090522c876449b93307e379b5e6664ee9ca91e0bbe3978b64cd72e`.
- [additional-manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/additional-manifest.json:1), SHA256 `6da3252990f4a1c1f286394cd51e6f7191e721303c99c077c5298382b281fb28`.
- [declared-columns-manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/declared-columns-manifest.json:1), SHA256 `b1490b670e941dc88eb8f5bf0294bc68d0ef1c299919b36a3a0d2aa32aa26557`.
- [fix43-source-manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix43-source-manifest.json:1), SHA256 `e8c7f76667d9ac31d0b03caf9335d7d9e90c80ab806340284aa054ee560d9798`.
- [fix61-interfaces-source-manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-interfaces-source-manifest.json:1), SHA256 `26a0432100ca79055db7873758b384ee8646db7e8769ebd20b4ba586f30654ae`.
- [fix61-helper-source-manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/preview-source-40/fix61-helper-source-manifest.json:1), SHA256 `f89493cf55e97d00f1b1ab846e94fa77faad55872469023196a9816e9f0ffb41`.
- [output-schema-source-94/manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/output-schema-source-94/manifest.json:1), SHA256 `5443b8283827424b29902f921548baa09f13ed1fe7972088c49daccc817c1947`; static GET provenance S14, не loaded-runtime proof.
- [property-selector-manifest.json](/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/output-schema-source-94/property-selector-manifest.json:1), SHA256 `1aa049871ece81a2f3794bdf21a9add6fa2b3fb95be4d3b90cb91d47aec8fff0`; static GET provenance S16, не loaded-runtime proof.

## История revisions этого audit

- Исходный audit SHA256 `0bdaee96867f244ab671c7b77549d4d18dafe99e5f24570d71dae295a877c5a8`.
- Уточнение wizard/extension.Source S14/S15 SHA256 `14c6e5acc7d6b75bdc0f617ccec10087183c83fc0bbdec3190ff9b72dc79489f`.
- Текущая revision добавляет временный select lifetime S16/S17 и proposal controlled
  metadata selection. Прежние source proofs/hashes сохранены, закрытые source gaps
  отделены от остающихся; вывод о недопуске D не изменён. SHA текущего документа
  выдаётся во внешнем отчёте, чтобы не создавать самоссылочный hash.

Предыдущая revision с PropertySelector/controlled metadata proposal:
SHA256 `8780a8ade1e97cbbb64b92349025112f1332d4923ac7c9c3cfa66df693d0a35e`.
Текущий follow-up добавляет construction/Socket bridge и явно ограничивает generated-S
provenance. Сообщённый пользователем случайный клик с неизвестным временем не исследовался
через browser; этот source audit не принимает и не пересматривает live evidence.
