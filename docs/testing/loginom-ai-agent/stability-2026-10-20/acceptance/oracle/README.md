## Образцы независимого расчёта D1

- [s1-revenue/oracle.py](../../../demo-2026-10-22/s1-revenue/oracle.py)
- [s2-customers/oracle.py](../../../demo-2026-10-22/s2-customers/oracle.py)
- [s3-reconcile/oracle.py](../../../demo-2026-10-22/s3-reconcile/oracle.py)
- [s4-branches/oracle.py](../../../demo-2026-10-22/s4-branches/oracle.py)
- [s5-pivot/oracle.py](../../../demo-2026-10-22/s5-pivot/oracle.py)
- [s6-abc/oracle.py](../../../demo-2026-10-22/s6-abc/oracle.py)

Перефразировки не требуют новых расчётов. Новые n1–n6 требуют собственного
автономного `oracle.py`: стандартная библиотека Python, денежные вычисления
через `Decimal`, входы только CSV из своего `data/`, результат JSON в stdout.
Чтение expected, результатов модели и пакетов Loginom запрещено.
Без аргумента oracle воспроизводит свой `expected-demo.json`; аргумент личного
пути пакета меняет только `package_path`. CSV разрешаются относительно файла
oracle, а не текущего каталога. Проверить расчёты и требования к порядку строк
до фиксации эталона. Промежуточное округление без бизнес-требования не вводить.
