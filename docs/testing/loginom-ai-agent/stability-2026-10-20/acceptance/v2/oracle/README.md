## Независимый расчёт

Каждый n7–n12 получает свой `oracle.py`: стандартная библиотека Python,
входы только свои CSV, пути относительно `__file__`, JSON в stdout.
Не читать expected, пакеты, модельные результаты и сеть. Без аргумента
воспроизводить `expected-demo.json`; личный путь пакета меняет только `package_path`.
Дробную арифметику выполнять через `Decimal` или `Fraction`, числовые
приближения сопровождать явным допуском.

Образцы независимых расчётов:
- [n1](../../../n1/oracle.py);
- [clustering](../../../../../../node-development/nodes/datamining-clustering/acceptance/oracle.py) — геометрия полезна, нумерация групп здесь не подходит;
- [regression](../../../../../../node-development/nodes/datamining-linregression/acceptance/oracle.py);
- [REST](../../../../../../node-development/nodes/integration-restrequest/acceptance/oracle.py).

Проверить побайтное совпадение stdout с эталоном из рабочего и другого каталога,
а также неизменность всех полей кроме `package_path` при его подстановке.
