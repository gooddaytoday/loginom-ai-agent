# Checkpoint: evalrun-runtime → v02-evals — 2026-10-15

- Целевая ветка: `v02-evals`, исходный HEAD `c63c01fa7618b84abaabc227e3e8b98500d97265`.
- Источник: `evalrun-runtime`, SHA `2040675fec8ee8334486b8550bb69b4cfb9f1657`; исходная рабочая копия чистая и не менялась.
- Слияние без конфликтов; перенесены 25 файлов (+790/−20), весь входящий diff внутри `evals/`.
- Перенесены standalone EvalRunner, durable admission/export, zero-infra-retry policy, process namespace/writer fixes, тесты и эксплуатационные документы.
- Архивное сравнение контейнеров из `c63c01fa76` сохранено. В `evalrun-runtime` нет `baseline-comparison.ts`; его отдельная зависимость и integration patch остаются актуальны.
- `bun typecheck` из `evals/`: PASS.
- Полный `TMPDIR=/home/kiselev/storage/tmp bun test`: 807 PASS / 8 SKIP / 1 FAIL, 4040 assertions, 816 тестов в 62 файлах, 700.86 с.
- Единственный FAIL: `transition.test.ts`, `main: ready failure сохраняет настоящий timeout и запрещает следующий dispatch`; `processCleanup.status=failed` из-за `EACCES` при чтении `/proc/<pid>/exe` вместо ожидаемого `confirmed`.
- Точный повтор: исходная `evalrun-runtime` PASS (37.12 с); объединённая ветка PASS ×3 (35.80, 35.74, 36.34 с), каждый запуск — один тест / 19 assertions.
- Диагноз: flaky, 1 FAIL / 4 запусков на объединённой ветке; причина гонки `/proc` не установлена. Доказательств merge-регрессии нет: runtime-файлы и тест побайтно совпадают с исходной веткой. Повторы не заменяют зелёный полный прогон.
- Код/тест для сокрытия сбоя не менялись; при повторном воспроизведении сохранить cleanup evidence с birth identity и принадлежностью проблемного PID, сохраняя отказ при неподтверждённой identity.
- Восемь SKIP — штатные `nativeBusy`/`browserBusy` guards при активном Chrome; Docker- и sandbox-fixtures выполнялись.
- `git diff --cached --check`: PASS; конфликтующих файлов нет.
- Новые модельные прогоны, live judge, deployment и действия на удалённом runtime не выполнялись.
- Известные ограничения продуктового smoke и recovery сохранены в [исходном checkpoint](2026-10-15-evalrun-checkpoint.md); слияние не меняет их статус.
