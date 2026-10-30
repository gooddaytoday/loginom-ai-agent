# Приёмочное предложение

Критерии требуют утверждения владельцем до этапа 1. Runtime-обработчика пока нет.
[Исследование](../discovery.md) описывает наблюдённую семантику и границы.
[Задание](task.md) получает модель вместе только с data/sales.csv;
oracle.py, expected.json и fixture-expectations.json в её контекст не передавать.

## Независимый oracle

oracle.py использует только стандартную библиотеку Python, CSV и индексы строк.
Он не импортирует Loginom, runtime или код будущего обработчика.
NULL-маркер — ?, сравнение NULL/0/false раздельное, время datetime гражданское.
Основной real-набор состоит из точно представимых четвертей.
Скрипт дополнительно проверяет заранее заданные примеры: первую/последнюю строку
основного результата, несортированный ряд, настоящий NULL, пустой и короткий вход.

~~~sh
python3 docs/node-development/nodes/transform-slidingwindow/acceptance/oracle.py
python3 docs/node-development/nodes/transform-slidingwindow/acceptance/oracle.py --check
~~~

expected.json — один выход SlidingWindow, порт 0, ordered=true,
column_order=exact, 10 строк и 8 полей. Real tolerance: abs=0, rel=0.
Источник перед созданием окна должен иметь Month:string, Sales:integer, Price:real
в этом порядке, как требует task.md. Автоопределение Month как даты недопустимо.
Метки, не заданные бизнес-заданием, имеют label_any=true.
package_path заменяет обвязка; фиксированного имени узла нет.
Ожидаемый граф: импорт → Скользящее окно → текстовый экспорт.
Cold-check читает выход окна; CSV нужен существующей проверке run-check.

fixture-expectations.json содержит адресные предложения для трёх политик.
Обычные кейсы описывают свежую естественную схему. types-one-lag-existing
описывает текущий выход после добавления лага к ранее настроенному проходному узлу;
types-one-lag-reopened — его порядок после Save/открытия с автосинхронизацией.
Статус живого наблюдения каждого случая приведён в discovery.md;
наличие JSON само по себе не является PASS.

## Сценарий этапа 1

Существующий run-check поддерживает внешний набор через --cases, новая оснастка не нужна.
После реализации, утверждения критериев и публикации SHA:

~~~sh
python3 scripts/node-acceptance/run-check.py start --head <SHA> --cases "$PWD/docs/node-development/nodes/transform-slidingwindow" --scenarios acceptance --pair "$PAIR" --cold
python3 scripts/node-acceptance/run-check.py wait <каталог_результата> --timeout 4500
~~~

start, затем wait собирать в одном foreground-вызове по регламенту сквада.
Модель openai/gpt-6.1-sol, medium, 1800 с; пара из новой карточки.
Не передавать oracle модели. На этапе 0 эти команды не запускались, CLI не собирался.
