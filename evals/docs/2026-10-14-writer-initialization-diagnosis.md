# Writer initialization: diagnosis 2026-10-14

Полный regression на `f247ee87e4` завершился: 909 PASS, 16 SKIP, 2 FAIL,
4661 assertions, 927 tests/74 files, 1044.47s. Обе ошибки — в
`test/writer-identity.test.ts`, cases `owner` и `owner-symlink`.
Private original log: `/tmp/evals-parallel-full-f247ee87e4-Wf9xv0.log`.

Классификация: устаревшие тесты после intentional change
`c183a97e38b21cb5c6272f5d83d9308b5adac2e9`
(`fix(evals): observe writer initialization before release checks`).
Fixture создаёт каталог `.writer` без первоначального owner; появление первого
regular owner во время acquisition допустимо. Такой fixture не подтверждает
замену уже наблюдавшегося owner. Symlink по-прежнему отвергается, но фактический
диагноз — `Writer owner is not a private file`, а не ошибка release identity.
Оба прежних ожидания воспроизводились 5/5; flakiness не обнаружена.

Исправлен только тест: acquisition regular owner проверяется по exact
directory device/inode и content; directory replacement и owner-symlink остаются
refused. Runtime/supervisor/release authority не изменены. Проверка
`releaseStaleWriter` на already observed replaced owner сохраняет refusal и файл.

Проверено: writer-identity 10 PASS/17 assertions; три initialization cases
5/5 последовательных повторов, 15 PASS/30 assertions; profile initial-owner и
replaced-owner refusal 2 PASS/4 assertions; typecheck/diff PASS.
Private GREEN signal: `/tmp/evals-writer-initialization-green-signal-nl9nu_jn.json`.
Собственные test roots удалены штатным finally; чужие native processes не трогались.

Повтор полного набора после test-only fix ещё требуется. SKIP не доказывают
успех native/live checks; Admin/OAuth и полная v2 admission остаются отдельными gates.
