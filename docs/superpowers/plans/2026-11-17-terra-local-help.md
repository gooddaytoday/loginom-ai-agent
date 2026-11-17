# Локальная Help: подготовка и запуск на runner1

## Основание и ограничения

Поручение владельца от 17 ноября 2026: перенести локальную Help в отдельную
ветку от autonomy-pilot, проверить новую CLI и запустить сравнение с LAB-1747
на runner1 без ожидания baseline. План независимо проверен до реализации.

- Base: `ae149d3f13277c1e3d4c0775e83d8ce2e6fbb13b`; branch `terra-local-help`.
- Переносить только `ff17297f1c`, `1b841e1883`, `db25763115`; whole-branch merge запрещён.
- Сохранить сценарные возможности base; Help snapshot/aliases не обновлять.
- Эксперимент сравнивает полный local-help: локальный поиск и Help вместо MCP,
  включая прекращение доступа к e2e-tests и ai-skills.
- Исходные рабочие изменения, LAB-1747 и исторические ресурсы сохраняются.
- Доступы Codex получать через Bitwarden по актуальному правилу основного checkout;
  local.env не читать. Секреты и raw evidence находятся вне Git.

## Выполнение

- [x] Точечный перенос и TDD; runtime17/17, Product33/33, staging13/13,
  importer11/11, aliases143/461 и typecheck Host/Product/opencode прошли.
- [ ] Независимое ревью переноса; чистая CLI prod/browserRecovery=true со штатными pins.
- [ ] Проверка manifests/inventory/archive/hashes и семи установленных Help-инструментов.
- [ ] Собственная local N1 пара; по одному calc-data-double, cohort-spend-activity,
  crosstable-fixed-sum из frozen corpus; .lgp/rerun/oracle/cleanup, все попытки сохранены.
- [ ] Ветка отправлена, удалённый SHA проверен.
- [ ] Runner1: старые службы/reservations сверены; собственные N6 pair/profile/state/unit
  и judge-home; права EvalOps/publisher, native prepare/verify и cleanup проверены.
- [ ] Независимое ревью установленной поставки и условий запуска.
- [ ] Свежая in_progress карточка, trigger-preview и единственное назначение EvalOps.
- [ ] Read-only наблюдение до requestPreflight 6/6 и первых measurement admissions.

## Неизменные условия кампании

Harness `ae149d3f13277c1e3d4c0775e83d8ce2e6fbb13b` в отдельном чистом checkout.
Corpus source `29ea34e27b8f96ed27b744f639c9f48933f52443`: точные 146 задач/438 ключей
LAB-1747, исходные prompts, inputs, references, oracle, рубрики, порядок и timeouts.
experimentPins.sourceSha обозначает корпус, новый SHA CLI хранится отдельно в manifest.

Product `openai/gpt-6.1-terra/xhigh`, requested serviceTier=default; фактический tier
учитывать отдельно. Судья `gpt-6-sol/xhigh`, threshold70, timeout300000ms, transport reserve1.
N6/batch6, максимум526 начатых попыток, 3 последовательные технические ошибки,
noProgress24h, batch<=8h. Clock от created_at свежей campaign card.
Сохранить model catalog, image/action/skill pins и остальные условия LAB-1747.

Сначала закончить подготовку, затем создать карточку запуска. EvalOps самостоятельно
создаёт request/manifest/wakeups и ведёт запуск/ремонт/resume по frozen runbook.
После назначения внешний Codex только наблюдает. Глобальные runtime-привязки агентов
не менять. Quality FAIL окончателен; повторы только по принятой технической политике.

В финальном поручении явно сравнить с проверенным архивом LAB-1747: успешность,
oracle, структура, устойчивость трёх раундов, конкретные регрессии. Технические отказы
и пропуски показывать отдельно; хостовые различия учитывать для времени и timeout.
Новый порог «качество сохранилось» не вводить. Smoke не является измерением кампании.

## Checkpoint

- Перенос: `dc25afa296` → `2759213b83` → `4f1bc598fa`; source review Spec/Quality PASS.
- Help snapshot byte-exact; пять существующих help_path изменены, новые узлы не добавлены.
- Full Host:400pass/33fail/6skip/8errors; CLI:9pass/13fail/3errors. Полного PASS нет.
- Узкие повторы readiness/ordinary CLI:3/3 PASS на port и base; file-reference flaky на обеих.
- Broad failures не объявлены все объяснёнными; их последовательная проверка продолжается.
- Product timeout включал остановку своего процесса; последовательный повтор33/33 PASS.
- Runner1: отдельная pair/N6/frozen harness+corpus; новые собственные OAuth, без model calls.
- CLI build, local smoke и native acceptance/запуск ещё не выполнены.
- Следующий шаг: собрать чистую поставку, завершить проверку source failures и installed CLI.
