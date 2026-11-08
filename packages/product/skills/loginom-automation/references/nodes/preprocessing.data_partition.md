# Разбиение на множества (`preprocessing.data_partition`)

<!-- mode: sequential random stratified biased -->
## Выборка и разбиение

Первые/последние N строк выбирай узлом `preprocessing.sampling`, `mode:"sequential"`, `parameters:{count:N,position:"first"}` или `position:"last"`. Последовательное разбиение выполняй `preprocessing.data_partition`, `mode:"sequential"`, `parameters:{train_count:N,test_count:M,allocation_order:"test_train_unused"}`. Размеры — в строках; порядок выделения задаётся `allocation_order`. Обычный `finish:"execute"`, без обучения. Читай порты `[0,1,2]`: общий/train/test; общий содержит сначала train, затем test и первое поле `IsTestSet` boolean (false/train, true/test). Для полного малого результата укажи `sample_rows:100,require_exact_numbers:true` и проверь полноту. Маркер NULL для экспорта выбирай по [правилу экспорта](exports.text.md). Для полей `datetime`, если пользователь не задал формат экспорта, у `exports.text` явно укажи `date_format:"yyyy/mm/dd",date_separator:"-",time_format:"hh:nn:ss.zzz",time_separator:":"`: пустые настройки используют локальный формат даты. Для этих операций выбирай указанные узлы; Калькулятор и JavaScript не нужны. Случайную выборку создавай тем же `preprocessing.sampling`, `mode:"random"`, `parameters:{count:N,seed:42}`. Стратификацию задавай `mode:"stratified"`, `parameters:{count:N,seed:42,strata_fields:[{kind:"input_field",name:"Class"}]}`: перечисли все дискретные поля страт. Для отбора со смещением используй `mode:"biased"`, `parameters:{count:N,seed:42,bias_field:{kind:"input_field",name:"Class"},bias_factors:[{value:"A",factor:0.4},{value:"B",factor:1}]}`. Поле смещения — дискретная строка, факторы 0..1 охватывают все наблюдённые категории. Размер не задаёт точную квоту каждой категории. У `preprocessing.data_partition` доступны те же три режима и параметры метода, но размеры задаются `train_count` и `test_count`; приоритет тестового множества выключен. В этих режимах не передавай `position` или `allocation_order`. Новый узел требует явные размеры, seed и параметры метода; существующему передавай только изменения. Для повторного выполнения сохраняй источник и seed, используй существующий узел и `finish:"execute"`, затем сравни полные результаты. Для случайного отбора, стратификации и смещения выбирай эти узлы через `loginom_dock_node_apply`. Равномерный случайный метод пока не поддержан.

### Последовательное разбиение

Размеры train/test и порядок выделения; без обучения.

### Случайная выборка/разбиение

Явные размеры и seed; повтор на том же источнике/seed. Для stratified и biased используй параметры выше. Равномерный случайный метод: «Этот режим пока не поддерживается». Не подменяй его другим алгоритмом.
<!-- /mode -->
