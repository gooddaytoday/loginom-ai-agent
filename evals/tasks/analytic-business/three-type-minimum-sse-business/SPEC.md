# Три операционных типа с минимальной внутригрупповой вариацией

Эталон разбивает все восемь объектов objects.csv на три непустые группы с минимальной суммой квадратов евклидовых расстояний до арифметических средних в исходных x,y. Оба признака имеют одинаковый вес; id сохраняет идентичность объектов и не участвует в расстоянии. Нормализация и промежуточное округление не применяются.

Вход: data/objects.csv, UTF-8, разделитель `;`, поля id (уникальная строка), x/y (непрерывные числа); пропусков нет. Независимый oracle использует CPython 3.12.3 и стандартную библиотеку fractions.Fraction, читает только data и перебирает все 966 разбиений восьми объектов на три непустые неразмеченные группы. Минимум единственен с точностью до перестановки меток: O01/O02, O03/O04/O05, O06/O07/O08; общая SSE равна 88/3. Дополнительная независимая проверка через попарную SSE и межгрупповую границу подтверждает этот минимум.

Фактический reference содержит один Unit, восемь native-узлов и восемь связей:

1. **Исходные объекты — TBGImportTextFile:** читает загруженный objects.csv; CodePage=65001, DelimiterChar=`;`, DecimalSeparator=`.`. id — dtString/dkDiscrete, x/y — dtFloat/dkContinuous.
2. **Три группы k-means — TBGClusterizationEngine:** признаки x/y — utActive/dkContinuous; id отсутствует среди признаков. Verified native inventory и readback того же узла подтверждают fixed k=3, seed=42, normalization=none и importance=1 для x/y. XML сохраняет Random/RandSeed=42, Params/NClustersAutoSelect=false и TrainingResults/Model с Dim=2 и тремя центрами. Отдельного атрибута k в Params нет; пустые NormSettings не доказывают нормализацию или веса. Источник этих параметров — сохранённые наблюдения J440/J444/J446/J453/J617, сведённые в закрытое свидетельство p46-native-evidence.md; J461 подтверждает settings_applied=true. TrainingResults представляет сохранённую обученную модель.
3. **Координаты центров — TBGReformColumnsEngine:** получает Centers/output1, сохраняет Cluster и переименовывает x/y в center_x/center_y.
4. **Назначения с центрами по Cluster — TBGJoinDataEngine:** Clusters/output0 подключён слева, реформированные центры справа; внутреннее соединение JoinType=jtJoin по равенству Cluster. После соединения каждый из восьми объектов имеет исходные id/x/y и координаты своего центра.
5. **Квадрат расстояния из координат — TBGCalcData:** создаёт squared_distance выражением `(x - center_x) * (x - center_x) + (y - center_y) * (y - center_y)`. Native Distance не подставляется вместо квадрата: например, у O01/O02 Distance=√2, а squared_distance=2.
6. **Средние координаты и размер групп — TBGGroupDataEngine:** группировка по Cluster; avg(x), avg(y), count(id), avg(squared_distance). Выходные mappings x_Avg→center_x, y_Avg→center_y, id_Count→objects, squared_distance_Avg→mean_squared_distance. Среднее считается по всем объектам каждой группы.
7. **Итог по center_x и center_y — TBGSortingEngine:** сортирует по center_x, затем center_y, LocaleAware=false; полный исходный и повторный CSV подтверждают возрастание. Выход оставляет четыре итоговые колонки, исключая Cluster.
8. **Экспорт итоговой таблицы — TBGExportTextFile:** одна CSV-таблица; CodePage=65001, CaptionType=ctUseColumnNames, DelimiterChar=`;`, DecimalSeparator=`.`.

Связи: 1→2; 2(output1)→3; 2(output0)→4(left); 3→4(right); 4→5→6→7→8. Имена и число узлов описывают этот reference; rubric принимает эквивалентные native-композиции с тем же общим контрактом. Серверные имена пакета и результата задаёт harness.

Полный результат — три строки в указанном порядке; колонки сопоставляются по именам, абсолютный допуск чисел 0.001:

```csv
center_x;center_y;objects;mean_squared_distance
0;0;2;2
20.3333333333;20;3;4.22222222222
45.3333333333;-20;3;4.22222222222
```

Общий reference D/B получен в detailed CLI-сессии без подсказки; отдельной business авторской попытки не было. Подтверждены совпадение входа с data, fresh полные назначения всех восьми объектов и центры, исходный экспорт и cold rerun D1 всех восьми узлов через UI без перенастройки и сохранения пакета. Новый полный CSV совпал с независимым oracle; фактический серверный LGP до/после имел один SHA. Происхождение и проверки записаны в provenance.json; закрытое свидетельство D1 — p46-cold-report.md. Совпадение с глобальным optimum доказано для этого fixture; общей гарантии глобального optimum k-means на произвольных данных из этого не следует. Judge-калибровка и Benchmark-измерения подтверждаются отдельно.
