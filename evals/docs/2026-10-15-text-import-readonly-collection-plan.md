# LAB-57: сбор свежего полного наблюдения

Решение делегированного координатора: исправить только read-only сбор наблюдений. Exact independently admitted base — `de285aa4fe659b8e0277fe5bb8bc772d4fc82452`. Его фактический foreground завершился exit 2 до kernel once: общий сбор превысил 15 секунд. Kernel continuation остаётся 0/1, все шесть прежних consumed receipts неизменны.

Сохранены измерения: serial CLI 20.936 s, parallel CLI 17.485 s; direct API 81.002 s, gzip API 20.098 s. Это диагностика, не admission. API snapshot не выбран: SQL опубликованного exact Multica commit охватывает deferred только с wakeup_id, тогда как действующий guard сохраняет все видимые pending statuses. Новые model/native/reference/product/cold effects в измерениях отсутствуют.

Выбран минимальный путь: тот же CLI, все roster agents, все cursor pages и records, прежняя partition и независимый Node replay. Четыре параллельных read-only agent scans сохраняют исходный порядок roster/pages. До трёх полных наблюдений разрешены только когда предыдущий сбор полностью завершился, не содержит известного blocker, но истекло прежнее окно 15 секунд. Частичный результат, исключение, отказ процесса/FD, unknown/live/foreign/blocked resources не разрешают retry. Финальный результат обязан целиком укладываться в прежние 15 секунд. Наблюдения не смешиваются, старые timestamps не обновляются. Эффекты между наблюдениями отсутствуют; exhausted => STOP. Метаданные истекших наблюдений сохраняются в command evidence и успешном final proof.

Рассмотренные альтернативы: сократить историю до первых страниц/active snapshot — отвергнуто из-за неполноты; увеличить окно — не выбрано. Гарантии выполнения за 15 секунд нет: новый source обязан безопасно отказать при устойчивой задержке.

План Root (применяются TDD и writing-plans; дополнительного человеческого approval нет):

1. RED → GREEN публичного Python collector через synthetic external CLI: одновременно начатые agent scans, полный last-page blocker, прежний порядок/ledger. Файл `evals/script/lab57-queue-pages.py`, новый адресный тест и существующий fake CLI fixture.
2. RED → GREEN отдельного pure read-only window runner: expired whole observation заменяется полностью; exception/known blocker не повторяется; exhausted/invalid bounds отказывают; fresh final содержит elapsed history. Файлы `evals/script/lab57-readonly-window.py`, `evals/test/lab57-readonly-window.test.ts`.
3. `lab57-route-inspect.py` запускает полное исходное наблюдение через этот runner; Node/FD/kernel/lease/source/history/once/native/ABI/actor и scientific criteria не меняются. Новое исходное наблюдение заново читает profiles/roster/runtimes/все queues/container/storage/FD.
4. Адресные affected queue/window tests, package typecheck, SOURCE continuous process proof; clean commit, две одинаковые чистые сборки, полный source manifest/Git blobs/bundle/diff и сохранённые RED/errors. Не повторять unchanged full suites.
5. Один handoff существующему Evaler для независимой exact SOURCE проверки, без cleanup dispatch. До SOURCE_ACCEPT изменённые support/helper/admission не устанавливать; kernel once не расходовать.
6. После actual admission Root готовит новый private preonce directory и проверяет actual queues/receipts/неизменность всех consumed once перед отдельной попыткой. Unknown runtime `9f8907d3…` не получает автоматического исключения. MAS — чужой стенд; вмешательств нет. Automation OFF.

Фактическая очистка и Ben ACCEPT ещё не получены. Этот план не является completion, RELEASED, FREE или разрешением новых научных прогонов.
