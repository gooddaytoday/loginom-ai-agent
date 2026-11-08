# Замена (`transform.replace_columns`)

<!-- mode: exact regex mixed external -->
Для словаря соответствий используй этот тип. Схему параметров читай в
`dock_action_describe` с выбранным mode. Вычисляемые формулы — Калькулятор.
<!-- /mode -->

<!-- mode: exact -->
`rules[]`: field с kind=input_field и name, type входного ключа, pairs,
other. Строки требуют case_sensitive, числа — precision≥0, максимум два
десятичных знака. Допуск включительно; ближайший ключ, при равенстве больший;
precision>0 добавляет real `_Delta=ключ−вход`. Большие Int64 — строки цифр.
from.type=type, to.type=result_type (по умолчанию type). Boolean to.value —
JSON true/false. Boolean/datetime требуют other.null; datetime — локальный
ISO с целыми секундами. Другой result_type с other.keep пока недоступен.
<!-- /mode -->

<!-- mode: regex mixed -->
Regex: string from — шаблон, to — строковая константа. Первое совпадение
подстроки меняет всю ячейку; $1 остаётся литералом. Регистр — inline (?i).
Допущены ASCII-литералы, группы, [0-9], {n}, ^/$. Regex иного типа нет.
<!-- /mode -->

<!-- mode: regex -->
`pairs` упорядочены. Опускай case_sensitive/precision. other — keep/null.
<!-- /mode -->

<!-- mode: mixed -->
Точное pairs имеет приоритет над regex_pairs, затем other.keep/null.
Строки требуют case_sensitive; он не управляет regex. Правило заменяет обе
таблицы поля; чтобы сохранить одну, передай её пары явно.
<!-- /mode -->

<!-- mode: external -->
Предложение LAB-1102, до реализации недоступно. `mode:"external"`:
основная таблица — input 0, справочник — дополнительный табличный input 1.
Индекс data-tid не равен логическому порту; используй выданные ссылки.
`rules[].external={port:1,value,replacement,information,unused}`: точные
имена полей после маппинга входа 1; value/replacement — по одному полю,
information/unused — списки, покрывающие все остальные поля без повторов.
Не передавай pairs/regex_pairs. type — тип ключа, result_type — тип замены;
роли фильтруются по этим типам. В этом срезе проверены строковые ключи/замены.
Дубликаты ключей вызывают отказ; не выбирай первое/последнее значение.
NULL сопоставляется с NULL, пустая строка отдельно. other.keep оставляет
несовпавшее значение и false в `_Replaced`; информационное поле даёт NULL.
Имена информационных столбцов прочитай из выхода, например CodeInfo.
Повторная настройка сохраняет роли и input 0/output 0 того же узла.
<!-- /mode -->

<!-- mode: exact regex mixed external -->
`output_mode:"replace"` меняет поле; add сохраняет его и создаёт `_Replace`.
Флаг `_Replaced` — boolean. other.null меняет и исходный NULL, флаг true.
Незаданные поля/правила и output_mode сохраняются. Повторное выполнение:
parameters={}, inputs=[], mappings=[] с прежним mode. Для порядка столбцов
задай полный output mapping с autosync=false. Выполни, прочитай таблицу,
выгрузи CSV с ?, сохрани пакет и проверь cold. Не восстанавливай правила
по expected; файлы oracle/expected модели не передаются.
<!-- /mode -->
