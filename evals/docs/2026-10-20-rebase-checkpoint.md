# Rebase evals-parallel на loginom — 2026-10-20

- Исходная вершина: `225c3850ffef1d3cd5df36295cfe88be4256af22`.
- Общая база до переноса: `2a9b6782205e60d79561f4d25b9ee35f025bb29d`.
- Целевая loginom: `966c3c584dba6838cea3eb38c62126a22ef37a24`.
- Вершина после rebase: `ff45e02967f44a41207aa1e4bd39f3b26f8756dd`.
- Backup: `refs/backups/evals-parallel-20261020-225c3850ff`.
- [x] План проверен независимо; рабочая копия была чистой, незавершённых Git-операций не было.
- [x] Перенесены 419 коммитов; `rebase.updateRefs=false`, остальные существовавшие refs сохранены.
- [x] Единственный конфликт — тест входа: оставлен upstream Tab после username вместо дублирующего click password; документация коммита сохранена.
- [x] Range-diff: 418 неизменных патчей, 1 объяснённое отличие, пропущенных/добавленных коммитов нет.
- [x] Код evals и изменения CLI run совпадают с исходной веткой; весь loginom-runtime совпадает с целевой loginom.
- [x] Runtime: 26 тестов pass; typecheck evals и agent pass; diff --check pass.
- [x] CLI process tests: 19 pass, 0 fail; проверены JSON-события, provider retry и SIGINT с локальным тестовым провайдером.
- [x] Независимое ревью переноса: No findings.
- Live evals, модели, установленный payload и публикация этим переносом не проверялись.
- Private-план, range-diff и логи: `/home/kiselev/storage/tmp/evals-rebase-20261020-107j5bmd`.
