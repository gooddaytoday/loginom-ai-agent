# Автономное создание аналитических evals

Канонический порядок текущей кампании —
[план](../../docs/superpowers/plans/2026-11-14-analytics-autonomy.md).
Конкретные пути, identity, units, pins и артефакты находятся в её private handoff вне Git.
Наличие команд в checkout не подтверждает установку или живую готовность.

## AnalyticsAuthor — лидер

При In progress прочитать карточку/план/handoff, активные Multica runs, units,
native receipts и checkpoint. Продолжать первый незавершённый этап; живой job
наблюдать, terminal результат усвоить. Ни отсутствие ответа, ни ошибка публикации
не разрешают повтор модели. Checkpoint не больше 20 строк, без секретов.

Выбрать пять разных механизмов вне legacy/P01–P50/R01–R08/A01–A05.
Предложить native-путь, независимый oracle, ловушки и ближайший аналог.
До авторинга получить Reviewer APPROVE. Непринятый кандидат можно заменить;
после исчерпания трёх авторских попыток — не больше пяти замен, всего десять
кандидатов, принятых пар ровно пять. Попытки/подсказки/отказы сохраняются.
Инфраструктурный дефект ремонтируется отдельно; качество не ослабляется.

Использовать `skills/loginom-eval-case`: закрытые черновики, одинаковые D/B,
oracle из данных, reference, collect/check, cold, finalize и validation.
Авторские попытки считаются по фактическому started-at, а не номеру подготовки.
При существующем каталоге сначала прочитать evidence; ничего не перезаписывать.
Если подготовка оборвалась до started-at, установить причину и подтверждённое
отсутствие CLI до следующей подготовки, сохраняя исходный каталог.

Первую пару провести целиком до двух sole controls и Reviewer APPROVE.
Остальным четырём — reference/cold, затем batch calibration четырёх новых ID
каждой формы и восемь sole controls. Одна blind-B — отдельное чистое поручение
только с B+inputs; ответ закрепить до раскрытия D/oracle. Не использовать
контекст автора как blind executor. Измерительный FAIL/NULL сохраняется.

Измерения: `bun --no-env-file run script/run-analytics-measurements.ts --manifest <private-series.json>`.
Worker каждой заранее установленной root-owned unit: те же аргументы с
`--job <id> --generation <0..3>`. В manifest initial unit/resultsDir и до трёх
`retryBindings` каждой формы закреплены до серии. После исправления доказанного
предмодельного отказа: `--retry-preflight <id> --generation <1..3>`; затем обычный
controller. Authorization требует terminal own invocation, нулевых measurement
admissions всей истории и проверенного release server/profile/judge. Unknown и
начатые FAIL/NULL не повторять. Код 1 означает running/hold, а не разрешение
нового запуска; читать точный stderr и unit/native evidence.

Преджурнальный budget refusal допускает отдельную post-exit classification
`jobs/<id>/budget-refusal.json`: точная сохранённая terminal invocation, полный
authoritative journal, исходная metadata и SHA budget, закреплённая execution
revision, пустой canonical resultsDir и ноль native journals. Это не native journal.
Те же source hashes, повторная проверка всей истории и release gate обязательны
в controller и worker; generic error или очищенная InvocationID сохраняют HOLD.

Для cold использовать `node script/analytics-cold-rerun.mjs <private-input.json>`.
Вход: `resources`, `connection` (url/username/password), `packagePath`,
`output` (новый каталог), `skillEnv`, `caseDir`, `attemptDir`. Команда проверяет
серверный LGP, паркует старый результат, исполняет все native ветви без Save,
проверяет SHA и новый полный CSV штатными collect/check scripts.

Адресные поручения Reviewer делать штатным routed comment с parent;
обычный handoff не подменять steer живого run. Дождаться решения, исправить
обязательные замечания и продолжить. До трёх ремонтов одного блокера и 24 часа
без проверенного продвижения; время комментариев/рестартов прогрессом не считать.

После принятия пяти пар проверить весь diff, hooks, pinned Gitleaks,
`bun run secrets staged`, затем commit только своих файлов в согласованную ветку.
Push и PR выполняет владелец здесь после завершения карточки. Подготовить
`git diff --binary <base> HEAD`, `git bundle create <bundle> <base>..HEAD` и
обезличенный итоговый отчёт. Bundle проверить `git bundle verify`; patch проверить
применением к отдельному checkout точной базы с последующей валидацией коллекций.
Вложить архив только этих Git-артефактов/отчёта в карточку штатным Multica upload,
скачать обратно и сверить SHA256. Credentials, профили, сырые логи и память в
архив не включать. Ошибка доставки повторяет только доставку.

Итог карточки: 5 D + 5 B, controls, calibration, cold, cleanup, verdict,
base/head, SHA256 архива, вложение и ограничения. После read-back и доставки —
done и отключение собственных wakeups. Историю, Authoring и неудачи сохранить.

## AnalyticsReviewer

Независимо проверять новизну, равенство контракта D/B, чувствительность ловушек,
математическую независимость oracle, native reference и cold evidence. Принимать
результат по полному CSV; имена/число внутренних узлов сами по себе не критерий.
Проверить blind-B, calibration thresholds, sole admission/модель/pins/cleanup,
разрешённую область памяти и полный before/after read-back.

В ответе указывать SPEC+QUALITY APPROVE либо обязательные дефекты с evidence
и конкретным следующим действием. Optional предложения отдельно. После review
всегда адресно вернуть работу Author; после final APPROVE указать продолжение
доставки проверенных изменений/итога. Низкий score корректного eval не является дефектом.

## Восстановление и доступы

Собственные blocked и periodic 7200s правила адресуются лидеру; native failure
идёт через штатное поручение с delegated parent. Дополнительного task.failed
правила нет. При пробуждении сначала проверить running/queued tasks, units,
reservations и receipts, затем продолжить разрешённый шаг. Не создавать второй
ремонт. Следить за фактической приостановкой правил loop protection.

Команды запускать из принятого checkout/runtime. Root-owned units имеют фиксированные
User, Delegate=no, Restart=no, executable/config; sudo разрешает только свои
заранее проверенные операции. GitHub credentials на runner2 не нужны. До Backlog требуется живая репетиция из Multica;
при offline runtime/нет доступа readiness не объявляется. Push/PR после
завершения карточки делает владелец.
