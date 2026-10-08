# Совместимость native acceptance с compact runtime

Диагноз: устаревший тестовый адаптер, а не подтверждённая регрессия продукта.
`c643db47657f6644b167d27dbaa0dec269e769c4` намеренно закрепил бюджеты
compact apply за host; `f03b2dbdf0` ввёл resume только по operation ID.
Адаптер продолжал передавать `budgets` и полный первоначальный request.

Исправлены две строки `packages/desktop/test/loginom/runtime-acceptance.ts`:
удалён явный budget и сохранён исходный operation ID при resume.
Строгая validation, предел повторов и deadlines не менялись.

Два отдельных TDD-цикла воспроизвели `unknown field budgets` и
`unknown field contract_revision`, затем дали GREEN. Тест вычисляет реальные
declarations адаптера в VM с синтетическими идентификаторами и проверяет
публичные schemas, type parameters и host expansion. Live entrypoint,
credentials, Loginom, браузер и модель при этом не запускаются.
Предварительная диагностика отдельно сверила definitions source/CLI49/Desktop49
с resource manifests и воспроизвела несовместимость трижды.

Узкий набор: 6 PASS / 30 assertions; Desktop `bun typecheck`: PASS.
Полный первичный Desktop `bun test`: 155 PASS, 5 SKIP, 5 FAIL, 1 error.
Он включил неподдерживаемый Bun `node:sqlite` и не получил pinned Node.
Штатный CI исключает `src/main/draft-store.test.ts` и использует pinned Node.
Отдельный повтор host-port с Node24.19 показал устаревшую fixture: call/admit
отклонены текущим skill scope, tools не входит в managed runtime и зависает.
Fixture приведена к действующему публичному IPC-контракту: bind automation scope,
prepare и получение advertised tools происходят до проверяемой задержки.
Scope и generation guards не обходятся. Возврат каталога tools исправлен
в fixture; проверяемая поздняя операция по-прежнему не может пересечь поколения.
Узкий host-port набор: 4 PASS в трёх последовательных повторах.
Штатный CI-набор с Node24.19.0: 159 PASS / 5 SKIP / 0 FAIL / 864 assertions.
Команда из `packages/desktop`:
`LOGINOM_AI_AGENT_TEST_NODE=<owned Node24.19.0>/bin/node bun test --path-ignore-patterns=src/main/draft-store.test.ts`.
Desktop `bun typecheck` после исправления fixture: PASS.
Это исправление тестовой инфраструктуры; продуктовые сборки49 не изменились.

Evidence находится в приватном каталоге `package-docs-20261006/ab-local-stand-20261008`
и `/tmp/skills-runtime-acceptance-budgets-signal`. Native live oracle после
исправления не выполнен; успешная проверка schemas его не заменяет.

## 2026-10-09: compact request в owner-loss driver

Тот же устаревший аргумент найден в `script/cli-owner-crash.ts` до его native
запуска. Контракт `c643db476` намеренно удаляет `budgets` из публичной compact
schema и добавляет их при host expansion. Удалена одна строка driver;
signal targets, проверка active operation/recovery, deadlines и cleanup assertions
сохранены. Это исправление тестового адаптера, не изменение продукта.

TDD RED: фактический request driver отклонён публичным validator с
`unknown field budgets`. GREEN: compact schema, import parameter schema и
полный host-expanded request принимаются. Тест вычисляет существующий request
в VM без запуска live entrypoint; отдельной копии request в тесте нет.
Он написан на JavaScript, как проверяемые runtime contracts. Первый TypeScript
вариант дал TS7016 на их отсутствующих declarations; после переноса теста в
`.test.mjs` Host typecheck PASS без изменения tsconfig или добавления `any`.

Команда из `packages/loginom-host`:
`bun test test/cli-owner-crash-contract.test.mjs test/cli-owner-crash.test.ts test/oracle-provider.test.ts`:
5 PASS/0 FAIL/28 assertions; `bun typecheck`: PASS.
Private evidence: `ab-local-stand-20261008/owner-driver-compact-{red,green,regression,final,typecheck,typecheck-final}-20261009.log`.
Все21 закреплённых A/B adapter pins повторно PASS; испытуемые сборки и frozen
harness не менялись. Native SIGINT/owner-loss/cleanup остаются непроверенными.
