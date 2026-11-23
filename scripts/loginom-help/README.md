# Локальная справка Loginom

`update.py` собирает справку пользователя Loginom с https://help.loginom.ru/userguide/ в нормализованный markdown,
который поставляется в продукте: `packages/product/help/loginom-help/data/<path>.md` и `packages/product/help/help-manifest.json`.
Модель читает страницы по URI `viking://resources/loginom-dock/sources/loginom-help/data/<path>.md`.
Пути повторяют исходники GitBook: `X.html` → `X.md`, `X/` → `X/README.md`, корень → `README.md`.

## Когда обновлять

При выходе новой версии Loginom или заметном обновлении сайта (`Last-Modified` главной новее `source.last_modified` в манифесте).

## Команда

```sh
python3 -I scripts/loginom-help/update.py
```

Скрипт берёт список страниц из `sitemap.xml` и скачивает их по одной, не чаще раза в секунду (около 18 минут).
Сырые html он сохраняет во временный каталог и печатает его путь. Пересборка из сохранённых html без сети:

```sh
python3 -I scripts/loginom-help/update.py --from-dir <каталог html>
```

При первой сборке без манифеста нужны ещё `--fetched-at` и `--last-modified`. Иначе они берутся из прежнего манифеста.
Каталог `data` перезаписывается целиком, поэтому удалённые на сайте страницы исчезают. Повторный запуск на тех же html даёт нулевой дифф.
Скрипт отказывает с ненулевым кодом, если корпус пуст, если страница больше 50 000 байт или 2000 строк, или если ссылка ведёт вне корпуса.

## Что проверить в отчёте

Отчёт в stdout — markdown-таблица добавленных, удалённых и изменённых страниц относительно прежнего манифеста; её можно вставить в описание PR.
Проверьте, нет ли неожиданных удалений, что страницы из `help` карточек узлов
(`packages/loginom-runtime/client/lib/node-contracts.mjs`) существуют, и выборочно просмотрите изменённые страницы в `git diff`.

## Чего скрипт не делает

- Синонимы для поиска (`aliases.jsonl`) скрипт не трогает. После обновления выполните
  `python3 -I scripts/loginom-help/aliases.py check`: он перечислит функции Калькулятора без синонимов
  и записи на удалённые страницы. Недостающие синонимы пишет агент по [заданию](aliases-prompt.md)
  из вывода `aliases.py missing`; клиентский тест `knowledge-client.test.mjs` упадёт, пока у функции их нет.
- `loginom_version` (сейчас `7.4`) задаёт константа `LOGINOM_VERSION` в `update.py`; при переходе сайта на новую линейку Loginom её правят руками.

Тесты: `python3 -I -m unittest discover -s scripts/loginom-help/tests`.
