## Отражение тестовых кодов HTTP

Модели: [prompt.md](prompt.md), [requests.csv](data/requests.csv).
Оператору: [generate.py](generate.py), [oracle.py](oracle.py), [expected-demo.json](expected-demo.json).
Ожидаемое сочетание: импорт → REST-запрос → извлечение полей JSON → экспорт `echoes.csv`.
Генератор `generate.py`, seed **111022**, создаёт 12 строк RequestId/Key (string),
уникальные синтетические коды, без секретов и персональных данных.

Контракт: GET `https://httpbin.org/anything`, query-параметры RequestId и Key из строки.
Все 12 ответов успешного выполнения должны дать HTTP 200, `method=GET`,
`args.RequestId` и `args.Key` равны отправленным строкам. Результат — только отражённые
RequestId, Key, Method (string) и HttpStatusCode (integer), в точном порядке колонок,
свободном порядке строк. Подписи просьбой не определены, поэтому во всех колонках
`label_any: true`; имена и типы по-прежнему проверяются. Числовых допусков нет.
IP, URL, даты, заголовки, длительность и сырой ответ в expected не входят.
Oracle вычисляет 12 строк из CSV и фиксированного контракта, не обращаясь к сети.
Это ожидание успешного ответа, не обещание доступности httpbin. Доступность,
источник отражённых полей и реальная отправка запросов проверяются будущим прогоном;
один cold-check не отличит отражённые строки от ошибочной копии входа.

CSV: UTF-8 без BOM, LF, заголовок, запятая, точка в числах; пропусков нет.
Данные полностью синтетические, без персональных данных. Модели передавать только
просьбу и входной CSV; oracle, expected и README остаются у оператора.

Воспроизведение из корня репозитория (Python 3, стандартная библиотека):

```sh
D7_CASE=docs/testing/loginom-ai-agent/stability-2026-10-20/n11
python3 -B "$D7_CASE/generate.py"
python3 -B "$D7_CASE/oracle.py" > ./d7-rebuilt.json
cmp "$D7_CASE/expected-demo.json" ./d7-rebuilt.json
D7_ABS=$(realpath "$D7_CASE")
(cd / && python3 -B "$D7_ABS/oracle.py") > ./d7-other-cwd.json
cmp "$D7_CASE/expected-demo.json" ./d7-other-cwd.json
python3 -B "$D7_CASE/oracle.py" '/<username>/d7-n11-<run-id>.lgp' > ./d7-run-expected.json
```

Один позиционный аргумент меняет только `package_path`; по умолчанию используется
пример `/stability-2026-10-20/n11.lgp`. Oracle читает только CSV относительно
`__file__`, не генератор, expected, результаты Loginom или сеть. Проверка формата
через `parseExpectedOutputs` и правила будущего прогона — в [общем README](../README.md).
Временные JSON не коммитить. `nodes` проверяет наличие основных типов, не топологию.
`export_input` проверяет таблицу перед экспортом, а не байты файла или факт сохранения.
Статический расчёт не подтверждает выполнение, экспорт, сохранение или cold-check.
