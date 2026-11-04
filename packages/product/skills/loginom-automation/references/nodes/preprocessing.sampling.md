# Сэмплинг (`preprocessing.sampling`)

## Выборка и разбиение

Первые/последние N строк выбирай узлом `preprocessing.sampling`, `mode:"sequential"`, `parameters:{count:N,position:"first"}` или `position:"last"`. Последовательное разбиение выполняй `preprocessing.data_partition`, `mode:"sequential"`, `parameters:{train_count:N,test_count:M,allocation_order:"test_train_unused"}`. Размеры — в строках; порядок выделения задаётся `allocation_order`. Обычный `finish:"execute"`, без обучения. Читай порты `[0,1,2]`: общий/train/test; общий содержит сначала train, затем test и первое поле `IsTestSet` boolean (false/train, true/test). Для полного малого результата укажи `sample_rows:100,require_exact_numbers:true` и проверь полноту. Маркер NULL для экспорта выбирай по [правилу экспорта](exports.text.md). Для полей `datetime`, если пользователь не задал формат экспорта, у `exports.text` явно укажи `date_format:"yyyy/mm/dd",date_separator:"-",time_format:"hh:nn:ss.zzz",time_separator:":"`: пустые настройки используют локальный формат даты. Для этих операций выбирай указанные узлы; Калькулятор и JavaScript не нужны. Случайную выборку создавай тем же `preprocessing.sampling`, `mode:"random"`, `parameters:{count:N,seed:42}`. У `preprocessing.data_partition` случайное разбиение задавай `mode:"random"`, `parameters:{train_count:N,test_count:M,seed:42}`; приоритет тестового множества выключен. В random не передавай `position` или `allocation_order`. Новый узел требует явные размеры и seed; существующему передавай только изменения. Для повторного выполнения сохраняй источник и seed, используй существующий узел и `finish:"execute"`, затем сравни полные результаты. На просьбу о стратификации (`stratified`), отборе со смещением (`biased`) или равномерном случайном методе сообщи пользователю: «Этот режим пока не поддерживается». Не подменяй эти режимы другим алгоритмом.

### Первые/последние N строк

`position:first/last`, размеры в строках.

### Случайная выборка/разбиение

Явные размеры и seed; повтор на том же источнике/seed. Stratified, biased и равномерный случайный метод: «Этот режим пока не поддерживается». Не подменяй эти режимы другим алгоритмом.
