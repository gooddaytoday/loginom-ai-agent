# Кластеризация (`datamining.clustering`)

<!-- mode: k_means -->
## Кластеризация k-means

Используй `target.type:"datamining.clustering"`, `mode:"k_means"`, вход 0.
Для нового узла задай `features:[{kind:"input_field",name:"X"},...]` только
для непрерывных числовых признаков и `clusters` (2…1000). Идентификаторы
оставь вне features: они сохранятся в выходе. `seed` (0…2147483647) по умолчанию 42.
Нормировка всех признаков: `normalization:"none"|"standardize"|"scale_minus_one_one"|"scale_zero_one"|"absolute_scale"`.
standardize — выборочный SD; константный признак принимается Loginom.
Масштабы: [-1;1], [0;1], деление на максимальный модуль соответственно.
Новый узел использует none; пропуск на existing сохраняет однородный метод.
Для смешанных методов нужен явный выбор. Ручные диапазоны и контроль отложены.

`finish:"execute"` обучает текущий вход и выполняет узел. Читай `read.ports:[0,1]`:
0 — все исходные строки, Cluster и Distance; 1 — центры в исходных единицах.
Distance использует нормированные единицы. При отказе активации входа исправь
NULL/некорректные значения до Teach/Execute, без подмены нулями.
Параметры меняй на том же existing узле. Применение без Teach — режим apply ниже.
Нормируй в самом узле, без Калькулятора/JS. Seed фиксируй для повторяемости;
номера кластеров — метки, не ранги.
<!-- /mode -->

<!-- mode: g_means -->
## Автоматическое число кластеров g-means

Для автоподбора используй `loginom_dock_node_apply`,
`target.type:"datamining.clustering"`, `mode:"g_means"`, вход 0.
Новый узел требует `features:[{kind:"input_field",name:"X"},...]`,
`min_clusters`, `max_clusters` (целые 1…1000, min≤max), `threshold` (>0).
`clusters` относится только к k_means. RowID, Txn, Item и прочие идентификаторы не включай в features: они сохраняются
в строках. Нативный g-means выбирает число в пределах диапазона; Cluster —
метка, не ранг. Не вычисляй кластеры через Калькулятор или JavaScript.

`finish:"execute"` обучает, затем выполняет. Читай `read.ports:[0,1]`:
0 — все строки с Cluster и Distance; 1 — центры в исходных единицах.
Нормировка поддерживается теми же значениями, что в k_means.
При пропуске параметров existing сохраняет текущие min/max/threshold/seed.
При заданном seed выполни повторный запуск того же existing узла с mode g_means
и finish execute перед экспортом; сохрани пакет после выполнения. Ручные диапазоны и
применение сохранённой модели к holdout относятся к отдельным режимам.
<!-- /mode -->

<!-- mode: apply -->
## Применение сохранённой модели без переобучения

Обучи тот же узел через `mode:"k_means"`, `clusters:3`, `seed:42`,
`normalization:"none"`, `finish:"execute"`. Затем замени источник того же
`imports.text` на holdout с прежними именами и типами полей и выполни импорт.
Связь с Кластеризацией сохрани. Вызови `loginom_dock_node_apply` для
`target:{kind:"existing",type:"datamining.clustering",ref:...}`,
`mode:"apply"`, `parameters:{}`, `inputs:[]`, `mappings:[]`,
`finish:"execute"`, `read.ports:[0,1]`.

Apply читает сохранённые роли, none, фиксированное k и seed, закрывает мастер
через Cancel и выполняет только Activate. Teach и Done не вызываются;
`configuration.readback.training.status:"not_requested"`. Порт 0 содержит
holdout с назначениями и расстояниями; порт 1 — прежние центры.
Итоговые CSV создавай ПОСЛЕ apply двумя узлами `exports.text`:
первый целевой CSV — `inputs:[{source:node_ref,output:0,input:0}]` (holdout,
Cluster/Distance и исходные поля); второй — `inputs:[{source:node_ref,output:1,input:0}]`
(Cluster и координаты центров). В обоих source — ref того же узла Кластеризации;
`finish:"execute"` выгружает и скачивает каждый CSV. Два целевых файла относятся
к выходам 0/1 итогового apply. Train нужен для обучения. Сохрани пакет после
обоих экспортов. Не вызывай k_means на holdout: это
переобучение. Калькулятор и JavaScript для применения модели не нужны.
Apply принимает только существующий обученный fixed-k/none узел; параметры,
связи и mappings не меняет. g_means и нормированная модель в apply отложены.
<!-- /mode -->
