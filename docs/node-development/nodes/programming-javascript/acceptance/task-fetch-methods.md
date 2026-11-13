С помощью JavaScript проверь жизненный цикл черновика нашей службы
`{{FIXTURE_BASE_URL}}`: PUT `/draft` с точным сообщением `{"value":"draft"}`,
PATCH `/draft` с `{"value":"final"}`, затем DELETE `/draft` без тела.
Для двух сообщений тип содержимого — application/json. После этого запроси
HEAD `/text`. Для каждого шага выведи Method и фактический Status в указанном
порядке. Не повторяй изменения автоматически при неопределённом результате.
Сохрани fetch-methods.csv и пакет `{{PACKAGE_PATH}}`.
