Из корня Git checkout (Python 3.9+, только stdlib):

```sh
python3 scripts/node-acceptance/required-checks.py list --base origin/demo-022 --head HEAD
python3 scripts/node-acceptance/required-checks.py verify --base origin/demo-022 --report report.md
```

`list` сравнивает merge-base..head; незакоммиченные файлы не учитываются.
Правила путей и подсказки сценариев — таблица RULES в начале скрипта.
Сценарии n/s/r описаны в каталоге `run-check.md`; подсказки не заменяют матрицу узла.
Команды запускают вручную из корня; `$PAIR` — каталог разрешённой тестовой пары.
Путь Chromium совпадает с кешем run-check, его корень меняет LOGINOM_AI_AGENT_BROWSER_SOURCE.
Живой запуск включает start И wait; офлайн-replay его не заменяет.
Для cold Export runner уже передаёт `--csv` со скачанным файлом; повторный запуск не нужен.

Скопируйте строки таблицы `list` в отчёт и добавьте четвёртую колонку `Результат`.
Сохраните ID и команду точно, включая обратные кавычки; один ID на строку:

```md
| ID | Команда | Почему / пути | Результат |
|---|---|---|---|
| `host-unit` | `(cd packages/loginom-host && bun test)` | #447 | exit 0 |
| `acceptance-tests` | `node --test scripts/node-acceptance/tests/*.test.mjs` | оснастка | FAIL; журнал: acceptance.log:12 |
```

`head-retest`: MERGED_HEAD_REPO должен указывать на checkout объединённой головы base+head.
Если для пересечения нет известного набора, задайте HEAD_RETEST_COMMAND тестами этих файлов.
`main-chat-approval` без команды: только `FAIL; журнал: owner-decision.md:3`; решение принимает основной чат.
`verify` возвращает 1 при неполных ID, 2 при ошибке ввода/Git, 0 при полном учёте, включая FAIL.
Это только сверка текста: она не запускает проверки и не подтверждает их успех или разрешение.
