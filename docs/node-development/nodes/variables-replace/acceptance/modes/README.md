Утверждённый match-срез: сценарий run-check `variables-replace-match`.
`match_modes` проверяет значения независимым re/casefold/Decimal oracle для
фиксированного fixture. Предлагаемые имена, метки, типы и порядок сохраняются
как в exact; native-метки по умолчанию отличаются, handler должен их восстановить.
По решению владельца источник содержит datetime целой секунды и integer mixed.
Они проходят без замены. Typed-проба Variant/ненулевых миллисекунд из discovery
не входит в этот срез; oracle и expected описывают только match.
`expected-run.json` адаптирует независимое ожидание к W1: civil datetime целой
секунды записан с `.000`, без изменения значения. Oracle проверяет оба файла.
Модель получает только пользовательское задание и нужные fixtures;
oracle/expected ей не передаются. Проверка: `python3 oracle.py --check`.
