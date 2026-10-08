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
