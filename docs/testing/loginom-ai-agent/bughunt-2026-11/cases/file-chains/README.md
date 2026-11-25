# Пошаговая работа с файлами

| Сценарий `--scenarios` | Ходы | Входы первого хода |
|---|---|---|
| `bh-w47` | 4 | XLSX с листами «Заказы», «Товары» и «Архив» |
| `bh-w48` | 3 | TSV в Windows-1251 с десятичной запятой и датами дд.ММ.гггг |
| `bh-w49` | 3 | SQLite с таблицами `orders` и `products` |
| `bh-w50` | 3 | CSV с UTF-8 BOM и запятой, CSV с Windows-1251 и точкой с запятой |

Передайте в `--cases` абсолютный путь к каталогу `cases`, в `--scenarios`
имена последних ходов. Для проверок SQLite-экспорта укажите `--cold`.
Продолжения используют исходное вложение и тот же чат.

Проверки и генерация выполняются из корня репозитория. Для XLSX нужен
`openpyxl`, для генерации SQLite — Python 3.11+ с API `sqlite3.serialize`.

```sh
cases=docs/testing/loginom-ai-agent/bughunt-2026-11/cases
python3 "$cases/file-chains/generate.py" --out "$cases"
for case_dir in "$cases"/bh-w{47,48,49,50}*; do
  python3 -B "$case_dir/oracle.py" > "$case_dir/expected.json"
done
```

`run-check.py` проверяет граф каждого хода, а для последнего хода w49 —
скачанный CSV и повторное открытие пакета. Для остальных таблиц используйте
`python3 -B "$cases/file-chains/review.py" RUN_DIR` после `wait`. Проверка
сопоставляет идентификаторы узлов между ходами и сравнивает типы и значения
из квитанций Loginom с независимым оракулом. Для разбора действий используйте
`bughunt-audit.py RUN_DIR --cases "$cases" --json` и
`bughunt-audit.py --patterns RUN_DIR --json`.
