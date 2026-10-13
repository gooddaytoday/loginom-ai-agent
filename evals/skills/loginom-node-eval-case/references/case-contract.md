# Контракт небольшого кейса

`AGENT_REPO` — назначенный совместимый checkout loginom-ai-agent. Сначала читать
его AGENTS.md, `evals/AGENTS.md`, принятый подплан узла и исходное поручение.
Поддержку сверять по `docs/node-development/registry.json`, карточке узла и текущим
`evals/src/node-cases.ts`, node runner/validator. Реестр продукта не означает, что
harness уже проверяет этот режим. Неизвестный case/required ID — ERROR, не PASS.

## Данные и задание

Выбирать один проверяемый режим/переход; несколько кейсов могут покрывать разные
возможности одного узла. CSV небольшой, но различающий: например, неодинаковые
значения для разных агрегатов, разные категории и порядок ключей. Не строить
полный факторный перебор без такого назначения.

Prompt фиксирует типы, роли полей, операции, порядок строк, имена колонок,
разделитель, NULL/округление/допуск и требуемые переходы, когда они существенны.
Входы называть по basename; basename разных inputs должны быть уникальны.
Не давать готовую таблицу ответа и не подменять целевой узел ручными данными.

Oracle вычислять независимо от Loginom, например Python standard library и
Decimal. Сохранить программу расчёта и ожидаемый CSV; для многоэтапного задания
сохранить отдельные промежуточные oracle. Имена не ограничены `oracle.csv`:
в хэши/provenance включать также `initial-oracle.csv` и другие ожидаемые результаты.
До модельной попытки фиксировать хэши входов, расчёта, oracle и исходного task.json.

## Каталоги и формат

Черновик: отдельный `$WORK_ROOT/drafts/<id>/`, вне `EVAL_WORKSPACE_ROOT`, профиля и
загружаемой tasks коллекции. Готовый кейс: `evals/tasks/node-evals/<id>/`.
Незаконченный подкаталог с task.json ломает загрузку всей коллекции.

Сохранить существующий формат task.json из `evals/src/task.ts` и ближайшего принятого
кейса: id совпадает с именем каталога, prompt, inputs, reference, spec,
expected_output, checklist; timeout_ms/oracle_tolerance — по назначению.
Обязательные свойства отмечаются required=true; перечень required ID определяется
реальной поддержкой runner. `oracle.csv` используется штатной сверкой harness.
Checklist/expected_output не попадают в prompt оцениваемой модели.

Состав: task.json, SPEC.md, reference.lgp, data/, воспроизводимый oracle,
acceptance.json для статического графа и раздельные oracle-provenance.json /
reference-provenance.json по действующим примерам checkout. Новую общую схему не вводить.
SPEC должен отражать фактический Unit.xml и требования истории, которые XML не доказывает.

Статический acceptance может задавать required_type_fragments, linked_nodes,
path.from/path.to, inputs.type_fragment/suffixes, forbidden_literals. Это только
проверка пакета. При смене CSV в inputs.suffixes указывать конечный источник;
всю историю исходного и обновлённого CSV проверяет event validator.
