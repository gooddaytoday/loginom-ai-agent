# Диагностика Docker fixtures EvalBaseline — 2026-10-08

Классификация: два существующих integration-теста `checkIsolatedLoginom` нестабильны.
На source 44c7928bf полный suite дал 458 PASS, 2 SKIP, 2 timeout (20 секунд).
Четыре отдельных повтора воспроизвели первый timeout 3/4, второй 1/4; assertions не падали.
Трасса показала Docker run 5,180 + 8,553 секунды, stop 4,106 и update 1,991 секунды.
После timeout Bun продолжал незавершённый callback одновременно со следующим тестом.
Причина внутри Docker daemon не установлена; признаков регрессии admission не обнаружено.

Подготовка и подтверждённое удаление точных fixture IDs вынесены в beforeAll/afterAll.
Бюджет admission остаётся 20 секунд; все прежние проверки сохранены. Hooks имеют отдельный
60-секундный бюджет lifecycle, проверяют доступность контейнера и отсутствие ID после удаления.
Fixtures изолированы network none, без host mounts/портов; Loginom и модели не запускаются.
Пять последовательных повторов дали 10 PASS, 0 FAIL. Admission занимал 6,28–7,44 секунды
для первого теста и 1,96–2,11 секунды для второго. Каждый повтор подтвердил очистку.
Команда из evals/: `bun test test/isolated-storage.test.ts -t 'checkIsolatedLoginom:'`.
`bun typecheck` после изменения PASS. Итог полного suite фиксируется в checkpoint.

## Writer settlement после включения LAB-31

Классификация: отсутствующая предпосылка интеграционных тестов, не флаки и не
регрессия защиты. В `d6e0d0720` добавлена проверка отсутствия всех native-процессов
текущего UID перед settlement; `24472a1d7` использует её для owned registration.
Три теста воспроизвели `Writer-release processes busy or foreign` в 4/4 запусках:
на локальном хосте в обоих снимках присутствовал сторонний Chrome.

Положительные settlement/registration и проверка последующих writer/runtime
ограничений требуют чистый stand UID. Для этих трёх тестов добавлен явный
`skipIf(nativeBusy)`, как в существующих server-only node-eval-ops fixtures.
Assertions и production guard сохранены; отрицательные проверки чужих native
процессов продолжают исполняться. Чужие процессы не завершаются.
Команда воспроизведения из evals/: `bun test test/writer-settlement.test.ts test/owned-registration.test.ts`.
Локальный skip не подтверждает положительные ветки: все семь clean-host fixtures
обязательно выполнить на сервере без skip на этапе 5, до smoke.

После правки targeted suite: 78 PASS, 7 clean-host SKIP, 0 FAIL; 85 тестов в
13 файлах, 535 assertions. `bun typecheck` PASS. Полный suite после следующих
изменений этапа 3 остаётся обязательным; положительные clean-host ветки пока не проверены.

## Единичный CLEANUP_UNKNOWN в fixture resume

Targeted запуск baseline/node-eval-ops после readiness ledger дал 40 PASS, 4 SKIP,
1 отказ `fixture executor resumes pending jobs...`: resume вернул CLEANUP_UNKNOWN.
Три отдельных повтора и три воспроизведения через public prepare/start/resume/check
прошли; все шесть cleanup имели confirmed, capture_complete=true, unknown=0,
owned_remaining=[0,0] и подтверждённые обязательные stages. Причина исходного
отказа не установлена: старый finally удалил fixture вместе с доказательствами.
CLEANUP_UNKNOWN не доказывает конкретную ошибку supervisor или чужой Chrome.

Тест теперь сохраняет приватный fixture при отказе; успешный удаляет как прежде.
Это диагностическое изменение, не утверждение об устранении неизвестной причины.
Assertions и guards сохранены. Финальный полный suite на текущей реализации:
519 PASS, 7 clean-host SKIP, 0 FAIL; 526 тестов/47 файлов, 2508 assertions,
526,39 секунды. `bun typecheck` PASS. Live проверки ещё не выполнены.
