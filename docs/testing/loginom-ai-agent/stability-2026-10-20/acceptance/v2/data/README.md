## Входы новых n7–n12

Создать собственный `data/` каждой задачи. Синтетические CSV, 10–40 строк данных
в файле, без персональных данных: UTF-8 без BOM, заголовок, запятая, точка в числах.
Зафиксировать генератор и seed, описать схему, типы и единицы в README задачи.
Повторная генерация должна воспроизводить CSV; oracle читает уже записанные CSV.

Образцы структуры:
- [n1/data](../../../n1/data/) — готовый D7, не менять;
- [кластеризация](../../../../../../node-development/nodes/datamining-clustering/acceptance/data/points.csv);
- [регрессия](../../../../../../node-development/nodes/datamining-linregression/acceptance/data/train.csv);
- [REST](../../../../../../node-development/nodes/integration-restrequest/acceptance/data/requests.csv).

Это образцы, а не данные новых задач. Для n12 условие подготовки должно
существенно менять обучающую выборку или признаки.
