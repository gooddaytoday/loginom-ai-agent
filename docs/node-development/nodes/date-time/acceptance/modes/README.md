Предложение LAB-1012. UI подтвердил шаблоны StringFmt, но редактор своего
формата, ширина числовых маркеров и выполненный выход ещё не исследованы.
Это не утверждённый runnable-сценарий и не PASS.

Модели только `../task-string-formats.md` и `../../fixtures/formats.csv`.
Oracle/expected/schema/card остаются у проверяющего.
`python3 docs/node-development/nodes/date-time/acceptance/modes/oracle.py --write`
воспроизводит expected.json; `--check` сверяет. Oracle — Python stdlib с явной
подстановкой числовых маркеров, без Loginom, runtime и зависимой от локали
strftime. Ожидание дополнения нулями — предложение до живого подтверждения.

Raw остаётся string, DateA/DateB — гражданские datetime с миллисекундами.
Разбор строк и преобразование часового пояса не приписываются этому узлу.
Прежний календарный/ISO scope сохраняется. CSV/Save/cold/cleanup и 2/3 + 2/3
на точном SHA потребуются после утверждения и реализации; здесь NOT_RUN.
Данные proposal-карточки не регистрируют runtime, хеши — 64 нуля.
