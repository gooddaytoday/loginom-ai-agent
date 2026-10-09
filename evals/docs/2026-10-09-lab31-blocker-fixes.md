# Исполнение минимальных правок LAB-31

Назначение владельца: crosstable-coverage → evals; F3 для полного наблюдённого имени; owned recovery registration/harness; безопасная диагностика dispatch; strict recovered_author → Ben. Product prompt/oracle/критерии и бюджеты сохраняются.

## Pins до слияния

- evals: 919ba97888444dbaa4bbaafa08b3decf8b25940e; origin/evals после fetch: b31ebe7d0bf5cd2cb1116ccdb90df65cd8578c2c.
- Принятая crosstable-coverage: 958b7aaac2bdea0c21f6a8e8dfd51cc090564dad; историческая приёмка относится только к ней.
- Перенесены только d2348afd1cc71e8eb0e30efc66dc2c05c8483a1c и f3a78b9040ab85e1f84e75f43a2f5970ba2ccfb6 из baseline-runtime (адаптация Rich/Ben profiles).

## Последовательность

1. Слияние четырёх кейсов: выполнено без конфликтов.
2. TDD F3: полное имя + Output_Data-N; чужие порты/связи/дети, wizard, неоднозначность, stale.
3. TDD recovery: settlement → registration verification до reservation → одна recovery → архив/cleanup → harness retirement → stand release. Private receipt связывает owner/запуск; unknown/foreign сохраняет lease.
4. TDD handoff: Evaler verified recovered_author resolution receipt; только Rich → Ben; исторический ERROR сохраняется; Ben ERROR запрещает ACCEPT.
5. Reference минимальная диагностика до повторных попыток; один ограниченный немодельный provider probe после headers timeout.
6. Runtime/evals tests/typecheck; immutable CLI/harness/skill manifest/pins; немодельные native execute/read/export/save/cold и recovery/admission на свободном stand.

## Общие ресурсы

LAB-55 и соседний агент 01a10b2c-f744-7552-a6e6-338f31569ef3 используют live-ресурсы. Их профили/контейнеры/pins не менять. Пока окно занято, локальные проверки и staging. Чужие untracked docs/local.env сохранены.

## Проверки и checkpoint

- F3 commit: 4a8e4983c; pinned Node 24.19.0 workspace-ui 293/293 PASS (включая full-label/ref/stale/wizard/foreign/link/child ambiguity).
- Handoff commit: 26533f1eb; 23 PASS, ERROR Ben/incomplete/stale/unknown блокируются, duplicate не будит Ben повторно.
- Provider probe commit: ad98e7c98; 2 PASS; HEAD один, 5 секунд, без generation/redirect/fallback; имя receipt не обходит once по source.
- На host полный evals запуск: 496 PASS/5 SKIP/8 FAIL; три отказа — закрытый stand с чужим Chromium, пять — inaccessible foreign CLI PID в native profile owner scan. Guards не изменены.
- Положительная обычная recovery → release → next admission немодельного fixture: PASS в отдельном PID namespace, собственный network-none Docker stand. Исходный ERROR неизменен, .process-group и .harness-lease удалены по evidence.
- Skill memory-policy/provider/bubblewrap регрессии PASS. Typecheck PASS. Остальные адресные/final проверки продолжаются.
- Соседний агент и LAB-55 активны; их docs/pins/профили сохранены. Native installed CLI ещё NOT_RUN; будущий комплект не активирован.

## Дополнительная подтверждённая гонка

Изолированный полный набор воспроизвёл потерю настоящего exit receipt после SIGTERM CLI: subreaper записывал exit_code=143, но supervisor завершал launcher до чтения receipt. Новый RED-тест воспроизвёл exitCode=-1. Supervisor теперь ждёт receipt при живой проверенной identity launcher в пределах прежнего пятисекундного остатка и общего cleanup-бюджета. После исправления supervisor/transition/sandbox: 41 PASS, typecheck PASS. Sandbox-тест проверяет недоступность внешнего файла через /proc/PID/root; наличие самого root в повторно использованном PID namespace не означает утечку.
