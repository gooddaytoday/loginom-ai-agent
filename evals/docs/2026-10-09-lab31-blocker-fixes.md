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

## Проверки исходников

- `crosstable-coverage` 958b7aaac… слита в `evals` (merge 1a92fc01e); четыре кейса сохранены. Исторический ACCEPT относится к 958b7aaac….
- F3: 4a8e4983c; точные full-label/ref/stale/wizard/foreign/link/child guards. Дополнительная native link регрессия: e15d41a04, 43 executor PASS.
- Handoff: 26533f1eb; 23 PASS, ERROR Ben/incomplete/stale/unknown блокируются, duplicate не будит Ben повторно.
- Provider probe: ad98e7c98; 2 PASS; HEAD один, 5 секунд, без generation/redirect/fallback; новый receipt не обходит once по source.
- Recovery: e76296d79; 26 адресных тестов. Обычная немодельная recovery → release → следующий admission прошла в Docker network-none fixture; ERROR неизменен, registration/harness снимаются по проверенному evidence.
- Host full evals: 496 PASS/5 SKIP/8 FAIL (закрытый stand/foreign Chromium и inaccessible foreign CLI PID). Guards сохранены. Full evals в отдельном PID namespace: **512 PASS, 0 FAIL**, 47 файлов; `bun typecheck` PASS.
- Full client runtime, pinned Node 24.19.0: **2545 PASS, 0 FAIL, 10 SKIP** (platform/opt-in browser). Skill memory-policy/provider/bubblewrap регрессии сохранены и проходят.

## Дополнительная подтверждённая гонка

Изолированный полный набор воспроизвёл потерю настоящего exit receipt после SIGTERM CLI: subreaper записывал exit_code=143, но supervisor завершал launcher до чтения receipt. Новый RED-тест воспроизвёл exitCode=-1. Supervisor теперь ждёт receipt при живой проверенной identity launcher в пределах прежнего пятисекундного остатка и общего cleanup-бюджета. После исправления supervisor/transition/sandbox: 41 PASS, typecheck PASS. Sandbox-тест проверяет недоступность внешнего файла через /proc/PID/root; наличие самого root в повторно использованном PID namespace не означает утечку.

## Связь после полного native-чтения

Установленный CLI 0.1.18-lab31.1 подтвердил F3/full read автоматически названной Кросс-таблицы (10 точных ячеек). Следующая связь к экспорту отказала до drag с CAPABILITY_ERROR / Unsafe Loginom selector parameter: общий encoder запрещал `;` даже внутри полного наблюдённого native имени. RED executor-тест воспроизвёл FAILED вместо SUCCEEDED. Resolver теперь сначала получает текущий owned graph и сохраняет `;` только при точном совпадении полного node_label с наблюдённым именем. Суффиксы портов, чужие/неизвестные имена, опасные символы, неоднозначность, workflow/DOM freshness и native link context остаются закрытыми. Явный новый label с `;` по-прежнему NOT_APPLIED; публичная схема не меняется. Executor: 43 PASS; полный runtime и новый immutable CLI проверены отдельно. Первый native отказ сохраняется; это немодельная регрессия, не повтор product eval.

## Ошибка изоляции немодельного fixture

В первом frontend `server.json` имел `wsproxy=auto`: Loginom сначала выбирал прямой ws://127.0.0.1:8080/ws/, а не отдельный proxy. Фактический маршрут зафиксирован после cold read-only отказа. Поэтому первоначальные native attempts сохранены с invalid isolated-stand provenance; их нельзя использовать как подтверждение cleanup отдельного backend. На собственном frontend установлен поддерживаемый `wsproxy=true` с readback, затем наблюдены только ws://127.0.0.1:32770/app/ws/ и собственный физический storage. Неверная ручная passwordless-конфигурация собственного образа заменена штатно сгенерированным Users.cfg; raw auth/config остаются private. Адреса созданных при неверном маршруте файлов записаны в отдельный residual ledger, очистка отложена до освобождения общего backend другим агентом. Общий сервер не перезапускался, чужие процессы не завершались.

## Установленный комплект и немодельная проверка

Чистый CLI `0.1.18-lab31.2` собран официальным build-cli из e15d41a047598edb8cb5dabae6c28f30ac037440. Harness и skill 1.0.5 закреплены отдельно на 6150a3c0b7569e09e81728f0d16f634c13a8d77f. Build manifest, SHA256 всех архивов, skill manifest/ссылки и readback распаковки проверены. Комплект лежит в ignored `evals/.bundle/lab31-fixes-e15d41a04/`; `release-pins.json` имеет STAGED_ONLY. LAB-55, исторические результаты и действующие installation pins не переключались. Новая независимая приёмка Ben этого комплекта не выполнялась.

На собственном backend с подтверждённым ws route installed CLI прошёл import → execute → полный native read 10 ячеек автоматически названной Кросс-таблицы → export → save. Все бизнес-значения, NULL и native bytes сверены с oracle, рассчитанным до действий. Cold public CLI full-read отказал до выполнения с требованием same-session byte-verified import: guard сохранён, этот этап не заявляется PASS.

Cold saved-graph проверен через установленный runtime без перенастройки: новый документ, прежние GUID, подтверждённая новая native execution group, неизменный граф и LGP, вновь созданный CSV со всеми ожидаемыми значениями; F3 порта имени с несколькими `;` прошёл. CSV SHA256 215a01645a1d794c35a67a9e78d082647c0f18bcd9af094371e550ad83a1fccb; неизменный LGP SHA256 6ca1886b789dd135d9ddf4c0bd699eb0dd5eeb2f37ad2a8f645ddbbe026d9303. Сохраняются no_server_snapshot/unobserved_aba_risk. Это проверка реализации без модели, не повтор product eval.

Перед cold graph собственный пустой package lock оставил read-only toast. После минимальной диагностики, двух свежих проверок отсутствия своих процессов, сверки package hash/empty lock/container identity выполнена адресная очистка только этого lock. Отдельный тест обычного recovery → release → следующий admission уже покрывает такой lock ledger и удаление собственных registration/harness. Это Docker network-none fixture с немодельным management CLI, не installed-native recovery приёмка.

14 немодельных попыток учтены в attempt ledger, включая NOT_STARTED, первоначальные ошибки test adapter и неверного маршрута. Подготовлены 31 безопасный history/event файл с original/private и safe SHA256; raw auth/env/browser DB исключены. Собственные два контейнера и сеть удалены после архивирования storage/history; две проверки подтвердили отсутствие контейнеров/сети, финальные две проверки — отсутствие своих CLI/browser процессов. Исторический writer marker setup, не дошедшего до dispatch, сохранён: его не удаляли по PID/возрасту. Общие residual files из ошибочного маршрута остаются адресно учтёнными и ожидают свободного backend; полного общего cleanup здесь нет.

## Checkpoint

- Code SHA: e15d41a047598edb8cb5dabae6c28f30ac037440; принятые четыре case dirs побайтно соответствуют 958b7aaac2bdea0c21f6a8e8dfd51cc090564dad.
- CLI 0.1.18-lab31.2 archive SHA256: 788a1f14649180b07beeafd4b45660e978fa96e70a2279cdfd49810a1f984f1b.
- Harness 6150a3c0b archive SHA256: d03d7d88fd39e55fbc3e194f3c4786e24cfc997fac7528f5e848d145ebd52170.
- Skill 1.0.5/6150a3c0b archive SHA256: 84b5a106196f53cb1adc3eda95d13bb4b9a8fd35f09fb936797acecd72ff011e; manifest fe0a9e987bc803f7e028ae5e1160a60fcfe317e989211503455549f63731f39b.
- Checks: evals 512 PASS/0 FAIL в PID namespace; typecheck PASS; client runtime 2545 PASS/0 FAIL/10 SKIP.
- Installed fresh full read/export/save PASS; cold saved graph/CSV/F3 PASS. Public CLI cold full read — guarded refusal, не PASS.
- Lifecycle recovery/release/next admission PASS в nonmodel fixture; installed-native recovery не заявляется проверенным.
- Evidence archive SHA256: 5119416ff5fac0f745a076de6deb3b1c99952abba4a253696e61acd274dda92e; manifest 02aa709969af929d4dea1d44ca6d7c8b1cc137b98a5299e2a9b0687671d58f18; readback/secret scan PASS.
- Ограничения: STAGED_ONLY, Ben комплекта ещё не принимал; common residual cleanup отложен; provider/product FAIL остаются возможны.
- Следующий шаг: на свободном общем backend адресно проверить/очистить residual ledger; переключить только будущие назначения по новым pins.
