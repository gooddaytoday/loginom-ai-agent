# Перечисления

В контекст выполнения Python встроены перечисления, описывающие метаданные полей и переменных.

## Описание перечислений

### DataType

Представляет [типы данных Loginom](../../../data/datatype.md). Элементы перечисления:

Имя | Значение | Представляемый тип данных
None | 0 | Тип данных не задан
Boolean | 1 | Логический
DateTime | 2 | Дата/время
Float | 3 | Вещественный
Integer | 4 | Целый
String | 5 | Строковый
Variant | 6 | Переменный

### DataKind

Представляет [виды данных Loginom](../../../data/datakind.md). Элементы перечисления:

Имя | Значение | Представляемый вид данных
Undefined | 0 | Вид данных не задан
Continuous | 1 | Непрерывный
Discrete | 2 | Дискретный

### UsageType

Представляет [назначение полей Loginom](../../../data/datasetfieldfeatures.md). Элементы перечисления:

Имя | Значение | Представляемое назначение поля
Unspecified | 0 | Назначение не задано
Excluded | 1 | Исключенное
Useless | 2 | Непригодное
Active (синонимы: Used, Input) | 3 | Используемое
Predicted (синоним: Output) | 4 | Предсказываемое
Key | 5 | Ключ
Group | 6 | Группа
Value | 7 | Показатель
Transaction | 8 | Транзакция
Item | 9 | Элемент

## Примеры использования

```python
from builtin_data import OutputTable, DataType, UsageType

col0 = OutputTable.Columns[0]
#Проверка значения свойства с типом "перечисление"
if (col0.DataType == DataType.String):
    print("Столбец {} имеет строковый тип данных".format(col0.Name))

#Вывод числового представления значения перечисления
print(col0.DefaultUsageType)
#Вывод строкового представления значения перечисления
print(UsageType(col0.DefaultUsageType).name)
```
