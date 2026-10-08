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
