# Квантование (`preprocessing.binning`)

<!-- mode: internal apply -->
## Квантование числового поля

Для разбиения числового поля на интервалы выбирай `preprocessing.binning` через
`dock_action_describe` и `dock_node_apply`. Режим `internal` отдельно обучает
текущий вход, сохраняет интервалы и затем выполняет узел. Передавай
`parameters:{binning:{field:"X",method:"count",size:2,limits:[0,20]}}`:
`field` — точное имя Integer/Real/DateTime поля; `count` — целое число интервалов,
`width` — положительная ширина; оба требуют явные `limits:[lower,upper]`.
`frequency` — целое число плиток по количеству строк, `ties:"next"` по умолчанию
или `ties:"current"`; для него `limits` опусти. Округление и открытые края отключены.
Остальные поля и порядок строк сохраняются; NULL отличается от пустой строки.
Для получения результата явно задай `finish:"execute"` и
`read:{ports:[0,1],sample_rows:100,require_exact_numbers:true}`: порт 0 — строки
с производными сразу после выбранного поля, порт 1 — интервалы.
Для применения сохранённых интервалов того же узла после замены источника
используй `target.kind:"existing"`, `mode:"apply"`, `parameters:{}`, `inputs:[]`,
`mappings:[]`, `finish:"execute"`, оба порта. Этот режим не обучает и закрывает
просмотренный draft без коммита. При отсутствии сохранённых интервалов нужен
явный `internal`. Переобучение тоже выполняется через `internal`.
Автоматические пределы, СКО, другие правила совпадений и суммы не поддержаны.

## DateTime и ручные границы на том же узле

Для поля DateTime (тип 2) используй этот узел, без Калькулятора и JavaScript.
Сначала `internal`, `method:"count"`, `size:2`, `limits` как civil ISO
`["2027-07-10T00:00:00.000","2027-07-22T00:00:00.000"]`. Часовой пояс не добавляй
и не пересчитывай. Выполни и прочитай оба порта. Для переноса общей границы
и изменения меток вызови `dock_node_apply` для **того же** `target.kind:"existing"`
и ref, `mode:"internal"`, `inputs:[]`, `mappings:[]`,
`parameters:{binning:{field:"EventTime",method:"manual",intervals:[
{lower:"2027-07-10T00:00:00.000",upper:"2027-07-18T00:00:00.000",lower_included:true,upper_included:true,label:"Phase A"},
{lower:"2027-07-18T00:00:00.000",upper:"2027-07-22T00:00:00.000",lower_included:false,upper_included:true,label:"Phase B"}]}}`.
Передавай все интервалы в их порядке; флаги включения сохраняют наблюдённые
значения. `size`, `limits`, `ties` в manual опусти. Этот вызов сохраняет ручные
границы и метки, выполняет узел **без повторного Train**. После него не вызывай
count для применения: он обучит заново. Для следующего выполнения используй
`apply`. В manual тоже нужны `finish:"execute"`,
`read:{ports:[0,1],sample_rows:100,require_exact_numbers:true}`.
Порт 0 сохраняет исходные поля, производные идут сразу после выбранного поля;
порт 1 содержит datetime-границы и BoundsDataType=2. Исходный NULL сохраняется,
номер/метка/границы/OutOfBins=NULL; BinsID содержит имя выбранного поля, open=false.

## Квантование числового поля

Для интервалов числового поля выбирай `preprocessing.binning`, без Калькулятора и JavaScript; перед настройкой прочитай [детали internal/apply, параметров и обоих выходов](preprocessing.binning.md). Сохранение узла не сохраняет пакет — в конце используй `package.save_checkpoint`.
<!-- /mode -->
