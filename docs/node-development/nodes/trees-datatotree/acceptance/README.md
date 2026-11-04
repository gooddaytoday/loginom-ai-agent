Комплект **утверждённых критериев** LAB-770, до регистрации и живых прогонов.
Текущий run-check не принимает его как готовый сценарий; необходимые изменения
и условия разрешения перечислены в [контракте](../contract.md).

Модели передаются только `task.md` и `../fixtures/orders.csv`. `{{PACKAGE_PATH}}`
подставляет runner уникальным путём в каталоге текущего аккаунта. Labels узлов
из expected назначает подготовка runner, без обучения модели инструментам.
Структура уже описана в task; structure/manifest/schema/expected/oracle/skill
proposals не передаются модели. Внешний пакет или HTTP-сервис не требуется.

Проверка независимого расчёта из корня checkout:

```sh
python3 docs/node-development/nodes/trees-datatotree/acceptance/oracle.py --check
bun docs/node-development/nodes/trees-datatotree/acceptance/measure-schema.mjs
```

Без `--check` oracle генерирует оба expected. Он использует stdlib Python,
int и Decimal, читает исходные fixtures, проверяет их manifest и не импортирует
Loginom/runtime. Для проверки одного полного сериализованного документа:

```sh
python3 docs/node-development/nodes/trees-datatotree/acceptance/oracle.py --scenario table --check --actual-json /path/to/document.json
```

Это сравнение JSON-значений, не аудит UI, типов дерева, сохранения или cold.
Нельзя объявлять PASS узла по одному этому вызову. Локальные negative checks
отличают перестановку элементов, округлённый Int64, NULL/empty, Boolean/number,
duplicate keys. Native правило образования массива и корня пока not_checked.

`outputs[].rows[].JSON` — независимый semantic witness. Текущее сравнение raw
string может отвергнуть иной корректный escape spelling; запуски запрещены до
утверждённого адресного comparator. `proposed_json_comparison` и nested tree
expectation требуют W040. Не объявлять raw equality универсальным JSON oracle.

До реализации expected уже закрепляет ordered=true, output_port=0 и нулевой
допуск; изменить критерии после наблюдения результата без согласования нельзя.
Инструкции модели/предел 1800 с/medium и политика 2/3+2/3 берутся из назначения.

`schema-proposal.json`, `skill-routing-proposal.md`, `skill-trees-*.md` — только
проект model-visible контракта и оценка байтов, продуктовые файлы не изменены.

Критерии и W040 утверждены решением v040-scope в LAB-770. Реализация comparator,
регистрации и прогоны — отдельный этап 1; его первый шаг — native-подтверждение
массива без группировки и исключения Root. Семантические ожидания не изменены.
