## Эталоны n7–n12

Записать каждый `n*/expected-demo.json` из соответствующего независимого oracle
до любого прогона. Указать полные итоговые строки, типы, порядок и числовые
допуски. Формат проверять реальным вызовом `parseExpectedOutputs` из
`scripts/node-acceptance/expected-outputs.mjs`, а не просто импортом модуля.

Для кластеризации сравнивать размеры и центры без привязки к номерам групп.
Для регрессии проверять коэффициенты и прогнозы с допусками. Для REST исключить
динамические поля и поставить `label_any: true` у не заданных просьбой меток.
Новых механизмов сравнения и изменений оснастки не требуется.

Образцы:
- [n1 expected](../../../n1/expected-demo.json);
- [clustering expected](../../../../../../node-development/nodes/datamining-clustering/acceptance/expected.json) — номера кластеров из образца не переносить;
- [regression expected](../../../../../../node-development/nodes/datamining-linregression/acceptance/expected.json);
- [REST expected](../../../../../../node-development/nodes/integration-restrequest/acceptance/expected.json).

Примерный `package_path` не является личным путём реального прогона.
