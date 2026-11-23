# Данные для расширенных режимов

Все файлы синтетические, UTF-8 без BOM, LF, заголовок, `;`, десятичная точка.
Точное число записей/байты/SHA — manifest.json. Oracle проверяет исходные байты
Python csv, а не результат Loginom. Три записи в typed.csv специально различают
ненулевую сумму, ноль, отрицательное значение и секунды времени.

- typed.csv: Id integer, Amount real, Active boolean, EventAt datetime, Note string.
- typed-update.csv: те же поля + Extra integer; независимые новые значения.
- variant.csv: Id integer, Value integer/string/real/NULL; NULL-маркер `\N`.

В исходном формате дата отделена пробелом, в typed expected нормализована в
ISO с миллисекундами; timezone не задана. CSV для oracle экспортируют как
yyyy-mm-dd HH:mm:ss. Для Variant выключен Value сохраняет текст исходных
чисел, а не форматированную строку с двумя знаками после точки.

Список, маска, параллельность и пути используют прежние fixtures/multi-file;
имя из переменной — прежние fixtures/file-variable. Это те же входные байты,
а не копии с изменившимися именами. Для HTTP typed.csv — только предлагаемое
тело будущего endpoint; наличие файла в Git не доказывает доступность HTTP.
