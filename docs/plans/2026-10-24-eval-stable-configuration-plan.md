# Стабильная конфигурация eval при смене generation

> Независимое ревью плана — PASS. Выполнять последовательно через executing-plans и TDD; ревью кода — до внедрения. Не вмешиваться в текущую LAB-134.

**Цель:** новая штатная preparation сохраняет доказательство конфигурации, позволяющее после reboot продолжить ту же кампанию на прежних owned ресурсах без повторного измерения сохранённых результатов.
**Архитектура:** отдельный digest в существующем preparation receipt; campaign prepare-generation сравнивает его с новым native наблюдением. Runtime identity, legacy hash и точные проверки leases не меняются.
**Стек:** существующие Bun/TypeScript, Docker и native leases, без зависимостей.
**Основание:** основной autonomous-evals-план и reboot-generation-подплан в этом каталоге. LAB-134 доказала недостаток прежнего hash: он включает runtime Networks; старые полные входы не сохранены, точное изменившееся поле не установлено.

## Ограничения и проверка ревью

- `ServerIdentity` и прежняя формула `configurationHash` сохраняются побайтно совместимыми. Новое доказательство не вкладывается в identity.
- Новая preparation хранит только `stableConfiguration: { version: 1, hash: <sha256> }`. Сырые Docker/config данные не публикуются: HostConfig может содержать секреты.
- Digest включает server config, image IDs, полные HostConfig, обе network maps и точные байты Components.cfg, initial/served server.json и proxy config. Ключи объектов канонизируются; порядок aliases несущественен, остальные массивы сохраняют порядок.
- Исключаются только поля network endpoint: EndpointID, IPAddress, IPPrefixLen, Gateway, GlobalIPv6Address, GlobalIPv6PrefixLen, IPv6Gateway, MacAddress. NetworkID, aliases, IPAMConfig, driver options и неизвестные поля остаются.
- Legacy preparations не дополняются текущими данными. Если доказательства отсутствуют у всех, остаётся прежнее точное сравнение configurationHash; смешанный/повреждённый набор запрещён. LAB-134 этим изменением задним числом не восстанавливается.
- Campaign continuity guard остаётся в prepare-generation; generic prepareEnvironment не запрещает разные конфигурации разных экспериментов. Ownership, topology, закрытие старого использования, CLI/pins, deadline и финальная точная runtime-проверка сохраняются.

Ревью проверяет пять рисков: реальный restart с новым endpoint; настоящее изменение HostConfig/сети/файла; legacy и смешанные receipts; прерывание planned→staged; смешанное наблюдение при restart. Тесты ниже закрепляют соответствующие границы. Не обещать устранение именно LAB-134 без исторических входов.

## Шаг 1 — первое native доказательство

Файлы: `evals/src/parallel-pair.ts`, существующие `parallel-pair.test.ts` и `parallel-pair-integration.test.ts`.
Интерфейсы: `stablePairConfiguration(input) → {version: 1, hash: string}` для указанных выше входов; `readServerObservation(file) → {identity: ServerIdentity, stableConfiguration}`. `readServerIdentity(file)` возвращает прежний identity из того же fenced чтения.

- [x] Один RED: runtime network-поля меняются, stable digest остаётся одинаковым. Добавить минимальную projection и получить GREEN. Следующий RED→GREEN отдельно проверяет изменение реальной настройки/файла, сохранение неизвестного поля и нечувствительность к порядку ключей/aliases.
- [x] Перенести native чтение в readServerObservation без изменения прежнего hash/полей identity; использовать те же повторные inspect и server epoch fence. Проверить существующие identity-тесты.
- [x] На локальном Docker создать отдельную временную owned research pair штатными createPair/destroyPair. Если точных образов нет, прочитать их через `docker image save` с runner2 по SSH и загрузить локально; удалённая среда не меняется. Сверить image IDs, не останавливать чужие контейнеры.
- [x] Опциональный integration-тест: observation → настоящий restart обоих контейнеров на той же сети → observation. Epoch и legacy hash меняются, stable digest сохраняется; fresh verify проходит, verify со старой identity отказывает. Finally удаляет только ресурсы этой pair штатной командой. Команда из `evals/`: `EVAL_PAIR_INTEGRATION=1 bun run test test/parallel-pair-integration.test.ts -t 'stable configuration survives'`.
- [x] После первого native GREEN — целевые unit-тесты, typecheck, независимое ревью и коммит. Если native предположение неверно, сначала установить фактический diff; не добавлять исключения без доказательства runtime-семантики.

**Проверяемый результат:** реальный restart со сменой endpoint не меняет stable proof и не ослабляет проверку текущей identity. Это не доказательство host reboot.

Реальный probe показал: CLI disconnect/connect меняет IPAMConfig и DriverOpts, поэтому не годится для положительного сравнения неизменных настроек. Используется restart прежних контейнеров: он меняет endpoint и epoch, сохраняя эти настройки; исключать IPAMConfig/DriverOpts из digest не требуется.

Шаг 1 проверен: 61 unit-тест / 226 assertions и typecheck прошли; native integration — 1 тест / 7 assertions. Реальный restart меняет epoch/legacy hash, stable proof сохраняется, старая identity отвергается. Свои контейнеры и сеть штатно удалены; независимое ревью — PASS.

## Шаг 2 — долговечное доказательство штатной preparation

Файлы: `evals/src/environment-preparation.ts`, `evals/src/user-environment.ts`, существующий `user-environment.test.ts`.
Интерфейс: optional аргумент stableConfiguration у stageUserPreparation; readUserPreparation валидирует и возвращает поле при наличии.

- [x] Через публичные stage/read с настоящими temp native leases получить RED→GREEN сохранения digest planned→staged и повторного входа. Отдельно проверить прерывание, повреждённое доказательство и неизменность legacy receipt; не переписывать старые preparations.
- [x] Prepare передаёт observation и identity из одного fenced чтения. Verify сохраняет прежние проверки. Запустить эти тесты и typecheck, независимо проверить diff, закоммитить.

**Проверяемый результат:** новый producer сохраняет ровно проверенный digest без секретов; legacy продолжает читаться без нового поля.

Шаг 2 проверен: три последовательных RED→GREEN для producer/read/reentry и отрицательных границ; 57 связанных тестов / 310 assertions и typecheck прошли. Независимое ревью — PASS. Полная native preparation и controller/reboot остаются шагом 3.

## Шаг 3 — безопасное продолжение кампании и host reboot

Файлы: `evals/script/run-campaign.ts`, существующий `campaign-control.test.ts`; ссылки и checkpoint в двух исходных планах.

- [ ] Публичным controller-тестом получить RED→GREEN: одинаковый новый stable proof допускает новую epoch тех же owned контейнеров при изменившемся legacy hash. При all-legacy оставить прежний exact guard; смешанные/повреждённые/разные proofs, реальные config/foreign-resource изменения и незакрытое прежнее использование отклоняются.
- [ ] Сравнивать старые proofs только с новым fenced observation; bootstrap identity должна точно совпасть с наблюдением. Сохранить все имеющиеся final/deadline/ownership/config-publish guards. Пройти целевые suite/typecheck и независимое ревью, коммит.
- [ ] После завершения LAB-134 поставить принятый frozen SHA штатно. В следующей согласованной полной кампании получить новые preparations до reboot и выполнить saved-node/controller-gap/host-reboot путь исходных планов. Сохранённое качество учитывается один раз, missing продолжается, очистка и публикация подтверждены. Не добавлять отдельную модельную кампанию только ради нового механизма.

**Проверяемый результат:** полный reboot-путь кампании работает при неизменных закреплённых условиях; local restart test не заменяет эту проверку.

## Размер, стоимость и исключения

Ориентир: четыре source-файла, четыре существующих test-файла и три плана, **250–450 изменённых строк** включая тесты/документацию; сверить git diff --stat. Новый digest нужен потому, что runtime hash нельзя сравнивать через reboot, а исторические входы не восстановить из digest. Отдельное поле сохраняет совместимость строгих identity comparisons. Новый reader переиспользует единственное native чтение вместо второго, потенциально другой epoch.

Новых receipt-файлов, ledger, очередей, scheduler, migration и зависимостей нет. Multica, текущая LAB-134, её manifest/results/pins/receipts, серверы и агенты не исправляются этим локальным этапом. Если изменился HostConfig или иное сохранённое поле, guard по-прежнему останавливает переход; исключение допускается только после конкретного доказательства его runtime-семантики. До host-reboot E2E готовность не заявляется.
