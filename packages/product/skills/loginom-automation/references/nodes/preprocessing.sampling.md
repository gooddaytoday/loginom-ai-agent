# Сэмплинг (`preprocessing.sampling`)

<!-- mode: sequential random stratified biased -->
## Выборка и разбиение

Первые/последние N строк выбирай узлом `preprocessing.sampling`, `mode:"sequential"`, `parameters:{count:N,position:"first"}` или `position:"last"`. Последовательное разбиение выполняй `preprocessing.data_partition`, `mode:"sequential"`, `parameters:{train_count:N,test_count:M,allocation_order:"test_train_unused"}`. Размеры — в строках; порядок выделения задаётся `allocation_order`. Обычный `finish:"execute"`, без обучения. Читай порты `[0,1,2]`: общий/train/test; общий содержит сначала train, затем test и первое поле `IsTestSet` boolean (false/train, true/test). Для полного малого результата укажи `sample_rows:100,require_exact_numbers:true` и проверь полноту. Маркер NULL для экспорта выбирай по [правилу экспорта](exports.text.md). Для полей `datetime`, если пользователь не задал формат экспорта, у `exports.text` явно укажи `date_format:"yyyy/mm/dd",date_separator:"-",time_format:"hh:nn:ss.zzz",time_separator:":"`: пустые настройки используют локальный формат даты. Для этих операций выбирай указанные узлы; Калькулятор и JavaScript не нужны. Случайную выборку создавай тем же `preprocessing.sampling`, `mode:"random"`, `parameters:{count:N,seed:42}`. Стратификацию задавай `mode:"stratified"`, `parameters:{count:N,seed:42,strata_fields:[{kind:"input_field",name:"Class"}]}`: перечисли все дискретные поля страт. Для отбора со смещением используй `mode:"biased"`, `parameters:{count:N,seed:42,bias_field:{kind:"input_field",name:"Class"},bias_factors:[{value:"A",factor:0.4},{value:"B",factor:1}]}`. Поле смещения — дискретная строка, факторы 0..1 охватывают все наблюдённые категории. Размер не задаёт точную квоту каждой категории. У `preprocessing.data_partition` доступны те же три режима и параметры метода, но размеры задаются `train_count` и `test_count`; приоритет тестового множества выключен. В этих режимах не передавай `position` или `allocation_order`. Новый узел требует явные размеры, seed и параметры метода; существующему передавай только изменения. Для повторного выполнения сохраняй источник и seed, используй существующий узел и `finish:"execute"`, затем сравни полные результаты. Для случайного отбора, стратификации и смещения выбирай эти узлы через `loginom_dock_node_apply`.

### Первые/последние N строк

`position:first/last`, размеры в строках.

### Случайная выборка/разбиение

Явные размеры и seed; повтор на том же источнике/seed. Для stratified и biased используй параметры выше.
<!-- /mode -->

<!-- mode: uniform -->
## Равномерный случайный метод

Выбирай `loginom_dock_node_apply`, `preprocessing.sampling`, `mode:"uniform"`, `parameters:{count:6,seed:42,group_size_rows:1}`. Размер группы в строках задаётся отдельно от размера выборки. Для `preprocessing.data_partition` используй `parameters:{train_count:6,test_count:4,seed:42,train_group_size_rows:1,test_group_size_rows:1}`; читай порты `[0,1,2]` (общий/train/test). Приоритет тестового множества: `test_priority:true,test_priority_position:"beginning"` или `"end"`. На существующем узле передавай только изменения; пропущенные настройки сохраняются.

Используй `finish:"execute"`. Повторяй тот же узел при том же источнике, seed и размерах групп. Проверяй полные значения и типы всех портов. Не обещай квоты классов или формулу генератора. Экспортируй запрошенные CSV и сохрани пакет после настройки.
<!-- /mode -->
