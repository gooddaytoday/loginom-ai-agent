Утверждённый match-срез: сценарий run-check `variables-replace-match`.
`match_modes` проверяет значения независимым re/casefold/Decimal oracle для
фиксированного fixture. Имена, метки и типы сохраняются, первичный порядок точный;
после reopen/cold допускается штатный порядок Loginom при autosync; native-метки по умолчанию отличаются, handler должен их восстановить.
По решению владельца источник содержит datetime целой секунды и integer mixed.
Они проходят без замены. Typed-проба Variant/ненулевых миллисекунд из discovery
не входит в этот срез; oracle и expected описывают только match.
`expected-run.json` адаптирует независимое ожидание к W1: civil datetime целой
секунды записан с `.000`, без изменения значения. `expected-reopened-run.json` задаёт column_order:any только после reopen и в cold.
Oracle проверяет все три файла.
Модель получает только пользовательское задание и нужные fixtures;
oracle/expected ей не передаются. Проверка: `python3 oracle.py --check`.
