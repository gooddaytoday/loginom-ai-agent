# Перенос LAB-58–63 в text-import-evals

Дата: 2026-10-19. План утверждён владельцем и независимо проверен до исполнения.

## Цель и границы

Собрать в `text-import-evals` принятые eval LAB-61 и необходимые продуктовые исправления CLI. Исходная общая ветка и `origin/text-import-evals`: `d627dd2651a7146e55cf2c87ceb85af10ee67b4b`.

LAB-58 уже включена (`68161f9e34` и `f2aa79b415`, merge `a08f584e74`), LAB-59 включена (`c05028803f`, merge `3414f0becb`), LAB-60 включена (`c0588df2b3` → `7500e2c3b8`). Повторный перенос не нужен. Их 32 кейса и reference.lgp должны сохраниться побайтно. LAB-62–63 пока представлены только drafts; готовых реализаций в проверенных refs нет.

Новые live/model-прогоны, сборка и установка CLI, изменения AppArmor/ОС, публикация ветки, изменения карточек и запуск LAB-62–63 в этот этап не входят. Исходные результаты и installed pins сохраняются с историческим смыслом.

## Порядок переноса

1. Сохранить binary diff, исходные refs и индекс рабочей копии в `/home/kiselev/storage/tmp/`. Только после повторной проверки отсутствия unstaged/untracked изменений и равенства индекса `204c5c0258` обновить устаревший checkout командой `git read-tree -m -u 204c5c0258 d627dd2651`. При изменившемся состоянии остановить этот шаг без принудительного восстановления.
2. Последовательно перенести только runtime source/tests следующих четырёх зависимостей из истории `origin/lab61-owner-fix`, по одному адаптированному коммиту с исходным SHA: `2acc44bae02663132b5ec3e26a7257a1bc1a9cdc`, `97499df591b34f9f4290b30610965c8ee0b7a76f`, `27b11bf2307cb94dd1ca73708f64659270f02e93`, `d17a0fc42513171b3c7563bb005d5a7919d72b9b`. Использовать scoped diff `packages/loginom-runtime/` и `git apply --3way --index`. Старые docs/native matrices этих коммитов не переносить. Перед реализацией каждой зависимости воспроизвести соответствующий поведенческий RED, затем GREEN с исходными положительными/отрицательными тестами.
3. Выполнить полный `cherry-pick -x` последовательно: `2e990a84aa25dc37a4e808da564be752aae6f564` (`origin/lab61-epoch-fix`), `4070ca4a70c03bf4fcb0024fa860e3bac987b547` (`origin/lab61-initial-fix`), `a2ba3d0fc8de25c50e497233506b4a6e4f50e06d` (`origin/lab61-owner-fix`). Остальную историю старой CLI и OS proposals не включать.
4. Выполнить `git cherry-pick -x 7d3a5cbda2873094219dec836b1b6c0ffa40f639..a0218e41029e51c8bf4134a8594e4dfe598e1b35` из `origin/owned-truth-predicates`. Это 31 линейный коммит: четыре начальных до `1b93b62c8b` из `origin/lab61-diagnostics`, `6ed1f51393` из `origin/lab61-initial-cases-a2ba` и 26 checker/test fixes до принятого exact SHA. Не переносить вершины промежуточных веток повторно.
5. Сохранить source → integrated SHA mapping и результаты проверок в этом документе; обновить действующий runbook и checkpoint (до 20 строк), не переписывая исторические отчёты.

## Совместимость и проверки

Перенос `97499df591` добавляет необязательные `settings.format.multiple_delimiters`, `date_format`, `date_separator` и соответствующие readback schema/types. При отсутствии параметров прежнее поведение сохраняется. Protocol и Server HttpApi не меняются, генерация Client не требуется. Не заменять runtime целиком старым `a2ba`: сохранить target-specific guards, в том числе `workspace-ui.mjs`.

- Побайтно сравнить 140 файлов десяти кейсов, checker и его тест с принятым `a0218e4102`; полный Git tree с ним совпадать не должен.
- Подтвердить сохранность всех материалов 32 кейсов LAB-58–60 и 32 reference.lgp относительно исходной общей ветки.
- Выполнить runtime RED → GREEN для неполных настроек, форматов дат, владения combo и количества полей; затем один полный `bun run test:upstream` из `packages/loginom-runtime` с Node 24.19.0.
- Из `evals/` выполнить `bun test --timeout 30000` и `bun typecheck` с Bun 1.3.14. Временные данные и сырые логи держать в `/home/kiselev/storage/tmp/`, не в Git.
- Проверить итоговый diff и чистоту ветки. Сохранять исходный SHA в каждом переносе; адаптированным коммитам давать conventional commit title.

## Исполнение

Устаревший checkout восстановлен до `d627dd2651` без изменения ref. Индекс и рабочие файлы точно соответствовали `204c5c0258`; binary diff, список refs и индекс сохранены в `/home/kiselev/storage/tmp/text-import-integration-20261019T133451Z/`. Рабочая копия после обновления чистая.


### Итог исполнения

Все 38 переносов выполнены локально в `text-import-evals`. Проверенный кодовый срез: `7ce625db6fc0acc31c8ff98f6f8d7592bf9ee6be`; последующие правки ограничены этим отчётом, runbook и checkpoint. Изменения не публиковались. Независимый review подтвердил совпадение scoped/full patch-id с исходниками и отсутствие случайных изменений поведения.

- 140 файлов десяти кейсов LAB-61, checker и его тест побайтно равны принятому `a0218e41029e51c8bf4134a8594e4dfe598e1b35`. Checker SHA256 `e82d3637a5c258fe8dcd7041aa073ee22f7bec33f4e2a5828f5f3ee1a09038ab`, test SHA256 `b12056b9e9005906f8e10d32493d8efe8f8c93d544846bf07c68bdd66ebcd265`.
- Все 418 файлов и 32 reference.lgp LAB-58–60 сохранены. Независимо проверено также сохранение всех 584 прежних файлов в 48 каталогах с эталонами и всех 48 reference.lgp, включая другие ранее существовавшие кейсы.
- Runtime: четыре содержательных RED → GREEN; завершающая адресная проверка 278 PASS / 0 FAIL. В workspace-ui сохранены target-specific guards; совпадение с a2ba целиком не навязывалось.
- Полный `bun run test:upstream`: 2694 PASS / 10 SKIP / 3 FAIL, 2707 tests, 214.3 s. Отказы — 5000 ms IPC timeouts трёх неизменённых managed-shutdown tests под общей параллельной нагрузкой. Три отдельных повтора файла дали 5 PASS / 0 FAIL каждый. Контролируемый повтор всего того же набора `node --test --test-concurrency=4 test/*.test.mjs` из runtime client: **2697 PASS / 10 SKIP / 0 FAIL**, exit 0, 225.577 s. Код, assertions и deadlines не менялись.
- Полный `bun test --timeout 30000` из evals: **1204 PASS / 6 SKIP / 3 FAIL**, 1213 tests / 59 files / 33830 expects, exit 1, 2132.838 s. Все три отказа относятся к неизменённым writer-settlement/owned-registration: guard обнаружил настоящие чужие CLI/Chromium в host /proc. Два отдельных повтора этих файлов воспроизвели 18 PASS / 3 FAIL каждый. Это стабильное условие окружения, не дефект переноса; чужие процессы не изменялись.
- Те же два файла с сохранённым UID и приватным /proc: **21 PASS / 0 FAIL / 71 expects**, exit 0, 10.67 s. Команда из evals: `unshare --user --map-current-user --pid --fork --mount-proc /home/kiselev/.bun/bin/bun test --timeout 30000 ./test/writer-settlement.test.ts ./test/owned-registration.test.ts`. Проверки отказа для чужого и недоступного native-процесса также прошли. Код guard, тесты и системные правила не менялись. Результаты полного host-прогона и отдельного изолированного прогона не объединяются в фиктивный единый зелёный full.
- `bun typecheck` из evals: exit 0, 11.243 s. Node 24.19.0, Bun 1.3.14; точные client dependencies из существующего package-lock установлены только во временный каталог: SDK 1.30.0, MCP 0.0.80, Playwright/core 1.63.0-alpha-2026-08-31. Браузеры не скачивались.
- `git diff --check` для изменённого runtime, checker/test и новых документов проходит. В полном импортированном наборе сохранены исходные CRLF и whitespace provenance; их предупреждения не исправлялись ради побайтной сохранности.

Ограничение проверки: полный evals на хосте с посторонним native CLI/Chromium не является зелёным; три соответствующих теста проверены отдельно в PID-изоляции. Повтор неизменённого полного корпуса не нужен для проверки переноса: 1204 успешных host-теста сохраняют применимость, причина отказов ограничена видимостью чужих процессов в /proc, а та же ветвь guard и её отрицательные сценарии проверены изолированно. Нового общего зелёного full для namespace не заявляется.

Проверены исходники offline. Живые и модельные прогоны, cold-приёмка, сборка, установка и публикация в этот этап не выполнялись. Карточки, назначения, исторические пины, AppArmor и системная конфигурация сохранены. Исторические genuine результаты и ошибки не переименовывались. LAB-62–63 остаются заготовками.

Сырые логи и резервные материалы находятся вне Git: `/home/kiselev/storage/tmp/text-import-integration-20261019T133451Z/`, `/home/kiselev/storage/tmp/lab61-runtime-port/`, `/home/kiselev/storage/tmp/lab61-managed-shutdown-signal/`, `/home/kiselev/storage/tmp/lab61-writer-settlement-signal/`.

### Соответствие исходных и перенесённых коммитов
Runtime (первые четыре — только source/tests, остальные полные `-x`):
- `2acc44bae02663132b5ec3e26a7257a1bc1a9cdc` → `742bc7246d38eb6e02ca67a3a9f1ea9b75b73810`.
- `97499df591b34f9f4290b30610965c8ee0b7a76f` → `4b5984dec62bb96c44f47d25ea277042c2acf536`.
- `27b11bf2307cb94dd1ca73708f64659270f02e93` → `044a7d9a98eaf5e40e7011a094e6701273933158`.
- `d17a0fc42513171b3c7563bb005d5a7919d72b9b` → `e09d8eb68cb6d486ce3d6a7fe4c567933c05aea6`.
- `2e990a84aa25dc37a4e808da564be752aae6f564` → `d7184e1a8aa451e39d25e6c3a7d66e279f79f676`.
- `4070ca4a70c03bf4fcb0024fa860e3bac987b547` → `6f697657dd002f4eed30e761dff252a239e32af4`.
- `a2ba3d0fc8de25c50e497233506b4a6e4f50e06d` → `21672616753223ee2edb23ddbf63d03671ce93d1`.

Eval LAB-61 (полные `-x`, в порядке применения):
- `39a50f07c452cbe9050c52e3df6782d3dbd90da4` → `5503f8bc5dc9ad470531d49f967ff4224f22e24d`.
- `8d690175c8af92650b368e98ad975842a4899a04` → `34843ca09e434265716d0b1fb6a1fff409e15474`.
- `a1eee8637d59a362582f3dd45c98adbb84ab46f3` → `90cd9ccc515abc001ab47b9391ab2f76a0d7c156`.
- `1b93b62c8bbcdcd4ea2bf0c6de317547cced96a8` → `730cac47f3f96f6e4736c76cf1a9aeca8859fce2`.
- `6ed1f51393d7893d80d4364522d197c1a269d99d` → `06ac9c7dade40ec7ceecc1cb897ef1cca4ab2ab9`.
- `deae59d905621f9afa0ac2392a97b9cc8f4857b7` → `653af875831127c5945761b46c7502ac682a51cc`.
- `b00b926261bdefd377c572cc3b81903117dc51a0` → `4561324aad339d4272a7564611720fbbc7b3e851`.
- `ae8233824a47b39be160cb0295900422cc86d174` → `8939a5089b446e1a359618204d54fb282a8ee35d`.
- `d7873d3b3fe58eb1137bb9a85655c495f3e7c812` → `a9972b0e9fc75592f5b6f1b3a00b2d35b43b6304`.
- `86070b607d09595a07a6fde250965096ef2fb795` → `d638ee365b94093fe5886e32d4e87e70ebb7650a`.
- `1113633ef082a9f80f10f76afbd2ab18db67dc1d` → `e5844f3eecfe46e9faebbdf5bd9756ad2e3e887a`.
- `51a0eb16877dc1b1a6a113841219a2540077de3e` → `48ddba04961a17b6250a14159317ddd46351f88d`.
- `9d49d54465fe1cf38bf24dfbcd84a1ceab975aa9` → `605248806d7c411e6082f776a8f440801ad8e819`.
- `bae0d53817aa3c5340a050ed7861ee3ebd3f0f63` → `cfb869aa787e6fb7a822ce59bae81852751e767e`.
- `1088d04fe41f7765e3873d993b4b32a32eb5a369` → `1e81dbefb1466a2a71068910487243eb058ed184`.
- `6d02838c024f3450ba4709ea1e4c69ec6f482c80` → `2b0ac43b7ce5026de9def3ade484293f137916de`.
- `dfe5a42c4eab86adccb2c5477c2d609be4e13d1e` → `a1f69051bd0a4365a2a9e593d066afd1d34a3de2`.
- `b79fdf91fcb7b812a36631fc10c6e8d17e865042` → `fcab08e84e3251345614daa5e3cc6953a3ae2725`.
- `1d85661c5c7900c36c65e426ba57c81db3ad8f7f` → `a283c1a5641888d4381795baa2fcf7501b6cf82e`.
- `fd5c0956fd91f7aeaa2473b7d2f2bcd1f573d5e2` → `f5f5d8327e7828dc51b4cc302658b30c5dafd539`.
- `b2bdae1abf3320b2ef566aebe115a829fe4bce2f` → `03b1c9787b77003dd744fc13d463d293a93c776f`.
- `83ceaff967408a6a08d025103b4c3e53e23af874` → `a893cccf20e3441a9ffdf798915019a9019ea73b`.
- `5fd6148754a7cdf5fd45bebcceb0b8fb59ed340d` → `25c6e61f95883db53e95e9ac4bebe74eb9d07b75`.
- `8203816f086a3bf7d1aa601618a208ab331a32cf` → `db685880d636fbe0aa89abe6aed00f0532fca35b`.
- `a94d632010f15db6842f4080347f22c98a423eda` → `b6cd9b3c391d7f9869967b710f8b82ccb9c9c2af`.
- `e0e3c07b1157c0b373573e5e5b0b1c5fd378c1af` → `d8b45e3ed0c45d4adddc6f02cdf69d46e2a7f19d`.
- `e3496bbf48fd3e7531344171a5aeb2fbe6c30705` → `9b88ec82863eda2f3d85815df9fa148fbb2ba9d8`.
- `12f77a38cedf6870f8476aeeea51137ef03cc576` → `e1fe2a6c58443e01d789fa55796d37019dcbd5cd`.
- `012baa3f2e8e2fbe3931f21eba27c8c7e2f47d9d` → `bfb31f502f7c3a64914518d855d30d501ba97bf2`.
- `4506571e610ae19a5066ed740e71739f32aa54b8` → `477ed82b6ef1b1e3aa0e0e59fc5582cbdf0ad48c`.
- `a0218e41029e51c8bf4134a8594e4dfe598e1b35` → `7ce625db6fc0acc31c8ff98f6f8d7592bf9ee6be`.

У шести исходных eval-коммитов заголовки приведены к conventional commit style; авторство, source SHA и содержимое патчей сохранены.
