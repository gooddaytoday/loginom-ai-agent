> Исторический документ старого проекта; для актуальной работы используйте [регламент Loginom AI Agent](../../../../docs/node-development/README.md). Прежний checkout обозначен как неперенесённая среда; оригинал закреплён Git-ревизией в [происхождении](../../../../docs/node-development/provenance.json).

## RC8 опубликован и установлен — 15 сентября 2026

Исправлено чтение предпросмотра перед группировкой. Client/tag 2712a9a9,
site 3d1a096e; оба плагина установлены, Codex hooks 6/6 trusted.
Source и готовый macOS: 1845 PASS/1 SKIP; Linux: 457 PASS; живой сценарий
импорт → калькулятор → группировка → сохранение прошёл.
Hermes не перезапускался: сначала пользователь должен сохранить открытый пакет,
затем перезапустить Hermes и продолжить в новой задаче. Старый pending RC7
не разблокируется обновлением файлов. Новые узлы не запускались.
[Проверки, ограничения и откат](releases/rc8-release-2026-09-15.md).

---

## RC7 опубликован и установлен — 15 сентября 2026

Исправлена изоляция чатов Hermes и передача вложений. Клиент c63b3b36 / RC7
опубликован, main отправлен после отдельного разрешения; оба Mac-плагина
обновлены, Codex hooks6/6trusted. Desktop и messaging Hermes штатно перезапущены,
оба загрузили native router RC7. Настройки модели и рабочие каталоги сохранены.
Source/Mac1843PASS+1SKIP, Python10PASS, Linux102PASS; живая проверка двух задач
подтвердила изоляцию и доставку. GUI composer после установки ещё не воспроизведён.
Сайт8ad84954/current20260915-rc7-8ad84954 переключён, backend сохранён.
[Полный отчёт, границы и откат](releases/rc7-release-2026-09-15.md).
Ниже сохраняются исторические checkpoints; ожидание выпуска RC7 завершено.

---

## Актуальный выпуск 14 сентября 2026

Клиент `0.1.0-rc.6` / source `0df6da82` опубликован для3платформ.
Сайт: VPS current `/opt/loginom-dock/releases/20260914-rc6-fc606397`,
Caddy `loginom-dock:landing-rc6-fc606397`; backend остался
`loginom-dock:studio-landing-70411dfe`. Изолированный preview удалён; образы
для отката сохранены. [Полные проверки и точные пути отката](releases/rc6-release-2026-09-14.md).
Сведения о прежнем current/Caddy ниже — история; перед изменениями сверять live.

---

# Узел 11: перенос проверен, кандидат 11.2 собран — 13 сентября 2026

Разрешённый SaveAs перенос 12 → 11 завершён: source `b0571534`, report `165bc5e5`.
Независимый временный помощник сверил точный hunk и новый тест с `0e11a3fb`,
39 артефактов, 392 файла архива с Git и 253 harness inputs; расхождений нет.
Подтверждены 38/38 executor tests и 10/10 focused live audit. Для Main повтор
потребовал исходных параметров и прошёл через мастер импорта; обход мастера
не реализован и не заявляется. Старый полный FAIL 55/59 сохранён.

Координатор собрал на VPS и staged immutable `2026.09.13-node11.2-candidate`.
Manifest SHA: `bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a`.
Все четыре файла прочитаны обратно и совпали побайтно. Рабочий server/current
сохранён, preview/current по-прежнему 404; activated:false.
[Квитанция и ограничения](node11-candidate-v2-2026-09-13.json).
В прежней задаче узла 11 на Astra medium назначен ограниченный candidate preflight.
Новый ход `01a09a08-b0e8-7b41-8324-8d88b6e086de` подтверждён active/inProgress.
Hermes11 не назначен: слот остаётся14.
Полное повторное ревью, main/push, активация и общий плагин не затронуты.

---

# Второй кандидат узла 12 проверен на VPS — 13 сентября 2026

`2026.09.13-node12.2-candidate` собран из source
`0e11a3fb24ca40a9f855008d2b0d1856d6f771ad` и размещён без активации.
Manifest SHA: `d0c9a5bedc170754dd251c982508e0ad8568d300091eda0027962c496df62adf`.
[Полный комплект проверенных pins](node12-candidate2-2026-09-13.json).

Архив source содержит 628 файлов, включая packages/loginom-runtime/executor/capability-abi.json;
контрольная сумма `39876dd6a497762bf1ea2f8626d6d3dde2b2c279c564f964448c3adec4939192`.
Сборка и stage выполнены на VPS Node 24.19.0; каталог и отчёты:
`/opt/loginom-dock/releases/20260913-node12.2-candidate/`.
Source inbox: `/opt/loginom-dock/releases/20260913-node12-preparation2/`.
Локальная проверенная копия: `unavailable:artifact-49434b3415c399d8`.
Все четыре catalog-файла совпали при server readback и после скачивания.
Save roots обеих операций: `/test-1/packages`; Loginom 7.4.2 / macOS / Chromium;
E2E revision `2cad5602`, stale_actions пуст.

До и после stage сервер/current указывал на
`/opt/loginom-dock/releases/20260904-landing-7b711846`;
preview/current отсутствовал (404), current_catalog_sha256:null.
Старые кандидаты сохранены. Новый developer preflight завершён PASS; квитанции
проверены. Узлу 12 назначен отдельный слот нового полного Hermes-прогона;
подтверждён старт хода разработчика, запуск модели и итог ещё не подтверждены.
Сборка каталога не означает автономную приёмку или выпуск.

---

# Кандидат14 размещён; начата проверка native save — 13 сентября 2026

На VPS собран, staged и повторно прочитан
`2026.09.13-node14-test4.1-candidate`, source c32a5d5e. Manifest SHA
`921f5d51e78cd190f1352900ee755fee9c2b614759b46b04595e3dc34537a483`.
Все4 опубликованных файла побайтно совпали со сборкой и скачанным комплектом.
Save roots обеих операций только `/test-4`; DataRecovery допущен, compatibility
Loginom7.4.2/macos/chromium, E2E2cad5602, stale_actions:[].
Current server и отсутствие preview/current сохранились; activated:false.
[Проверенные pins](node14-candidate-2026-09-13.json).

Первоначальный10-file source packet был неполон: publisher импортирует
packages/loginom-runtime/executor/capability-abi.json. Builder прошёл, публикация остановилась до записи.
Координатор добавил11-й tracked файл из того же c32a5d5e, сохранив остальные
байты и исходный пакет; validation/stage/readback прошли. Исправленный archive
SHAff8f6ae7433da30824dcf38c0c3ad60ffd495d36d1980216e7dd29a062223504.
Разработчику поручено исправить exporter и проверить загрузку publisher из
изолированного архива. Один SSH отказ при передаче сменился успешным повтором;
credentials/SSH-настройки не менялись, причина единичного отказа не установлена.

VPS evidence: `/opt/loginom-dock/releases/20260913-node14-test4.1-candidate/`;
source inbox: `20260913-node14-preparation`. Локально
`unavailable:artifact-f5ccbce66cb3faa5` хранит реальные байты/отчёты,
`complete-source-packet/` — полный исправленный source packet.

После completed/idle подготовки14 в той же задаче на Astra medium назначен
native-save-candidate-preflight. Команда
`node14:native-save-candidate-preflight:1:921f5d51e78cd190f1352900ee755fee9c2b614759b46b04595e3dc34537a483`;
ход `01a098f0-5364-7d91-b517-bd22469f0ae8` подтверждён active/inProgress.
Переданы фактические pins, поручены новый preflight, native checkpoint/test-4,
отдельный reopen/полный output без настройки, live geometry wrapper и reader.
Hermes14 не выдан; сборка каталога не означает принятие узла.
Merge/push/deploy/current activation/обновление общего клиента не выполнялись.

---

# Кандидат узла11 размещён без активации — 13 сентября 2026

Версия `2026.09.13-node11.1-candidate`, source code `91dee921` (389 tracked inputs),
runtime `b99b922033e87b7580f14c2eec8cd0744c23bab29ee45b2548212cdac8c394ca`.
Manifest URI: `viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.1-candidate/manifest.json`.
SHA: `28434c4b61305eaa08c76db1dad470599852b48f333f734ad3e946687941ab37`.
Сборка и stage/readback выполнены на VPS Node24.19.0 в
`/opt/loginom-dock/releases/20260913-node11-1-91dee921/`; там же build/stage и
coordinator-readback reports. Source inbox — соседний `20260913-node11-preparation`.

Повторно прочитаны4 immutable файла: совпали побайтно. Save roots:[`/test-2`],
обе revisions:`2`; Loginom7.4.2/macos/chromium; E2E2cad5602, stale_actions:[].
Проверен текущий Dock skill manifest8 entries и main content integrity, revision
`afa295bf48dc48da5d3c995665a06ef2190ff620bae3243d46557e0371536790`.
`activated:false`, сервер/current и общий клиент сохранены.
[Полные hashes/pins](node11-candidate-2026-09-13.json).
Это staged-каталог для отдельной source-приёмки; успех Hermes ещё не получен.

---

# Кандидат узла12 собран на VPS и проверен — 13 сентября 2026

Подготовительный ход узла12 завершён;624 файла архива сверены с Git objects
commit `7bf88255562c59cd32397be3f68c4ec85cb55b38`. На VPS проверены health,
импортированный E2E и прежний Node24.19.0 с SHA
`bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`.
Новая версия отсутствовала; выполнены отдельные build, validate, stage/readback.

- Версия: `2026.09.13-node12.1-candidate`.
- Manifest URI: `viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node12.1-candidate/manifest.json`.
- Manifest SHA: `1a5a46312501d20ec7e23a2db12ed95bf34d784ead45628b12cdcf1492a276ce`.
- VPS evidence: `/opt/loginom-dock/releases/20260913-node12.1-candidate/`;
  `build-report.json`, `stage-report.json`, `coordinator-readback.json`.
- Все4 опубликованных файла повторно прочитаны и побайтно совпали со сборкой.
  Обе операции сохранения разрешают только `/test-1/packages`.
  Compatibility: Loginom7.4.2, macos/chromium; E2E
  `2cad5602158fd2e4836d821d644a2b8d92f571a2`, `stale_actions:[]`.
- `staged:true`, `activated:false`. Действующий server release и отсутствие
  preview/current остались прежними; сервер/общий клиент не обновлялись.

При проверке подготовительного script исправлена только команда в переданной
копии: `publish-action-catalog.py --validate-only` требует также `--stage`.
Исходники runtime/harness не менялись. Разработчику передана поправка для
воспроизводимости и фактические pins; поручен полный preflight без запуска
Hermes и commit документов подготовки. Новый ход
`01a0989a-1f11-7c83-993f-c30dc753df78` подтверждён active/inProgress.
Очередь Hermes11→12; слот12 не выдан.
Это проверка каталога, не автономная приёмка узла. Новые узлы/merge/push не запускались.

[Проверенная сводка](node12-candidate-2026-09-13.json). Локальные исходники и
readback: `unavailable:artifact-b43a4d2329e46fdb` в основном checkout.

---

# Диагностика доступности координатором — 13 сентября 2026

Пользователь разрешил координатору при недоступности Dock самостоятельно заходить
на VPS и проверять причину, без повторного запроса разрешения на диагностику.
Использовать описанный ниже SSH-доступ и проверенный host key. Проверять внешний
HTTP/TLS, SSH, текущие контейнеры, Caddy, ресурсы и относящиеся к сбою журналы,
сохраняя только сведения без секретов. До выбора исправления установить слой сбоя.

Доступность восстановлена: обычный маршрут с Mac дал HTTP200 обоих доменов
примерно за 0.45 s, успешный SSH, диагностику клиента и реальное чтение через MCP.
Во время предшествующих таймаутов путь через `utun7` не работал, а соединения
через `en0` к тому же VPS проходили. Проверены контейнеры, ресурсы и loopback
API/Caddy; точная причина сбоя туннельного пути не установлена. Последующая проверка
подтвердила восстановление личной OpenViking: авторизация, доступ к памяти и MCP
успешны. По запросу пользователя четыре разработчика возобновлены на Astra medium;
повторный допуск их собственных окружений после паузы ещё ожидается.
[Доказательства, ограничения и checkpoints](dock-availability-2026-09-13.md).

Для проверки только доступности использовать `/health`. В текущем исходном коде
`/ready` выполняет embedding probe, а `verify-server.py` вызывает `/ready`.
Последний подходит для расширенной проверки установки с учётом конфигурации моделей,
но не является пассивной проверкой соединения. Прочитанный серверный pin:
`7b7118468353eacab83551a3570efb4de76b6b2f`. Монитор loopback API не доказывает
исправность публичного TLS.

---

# Клиент с Объединением обновлён — 12 сентября 2026

Код Объединения и исправлений отправлен в GitHub main: **0e2bb03f**.
На Mac установлен **0.1.0-dev.20260910.3-80ca61417ec7**, собранный на VPS.
Прежняя локальная диагностика, настройки и версия для отката сохранены.
Плагины Codex/Hermes обновлены, шлюз Hermes перезапущен; для обновлённого
плагина Codex начать новую задачу.

Установочный снимок: **1385 PASS / 1 SKIP**. Живой независимый аудит установки:
**13/13 PASS**, результаты 4×3, 3×40 и все 16×3; исходная автономная приёмка:
**84/84 frozen PASS**. Первоначальный отказ открытия порта в тесном диагностическом
графе сохранён отдельно; оставшаяся проверка прошла после разнесения узлов.

[Состав, проверки, ограничения и откат](client-update-union-2026-09-12.md).
Публичный Release и production-каталоги не переключались. Повторная инвентаризация
VPS после успешной сборки/скачивания получила отказ SSH в доступе.
Следующие узлы, параллельный пилот и общий V4/V5 не возобновлялись.

---

# Клиент со Слиянием обновлён — 12 сентября 2026

По выбранному варианту 3 установлен **0.1.0-dev.20260910.3-0e806f650d40**.
Исходные изменения закоммичены и отправлены в main: `ac6b510f`.
Комплект собран на VPS; прежняя локальная диагностика API и настройки сохранены.
Плагины Codex/Hermes обновлены, шлюз Hermes перезапущен.
Установочный снимок: **1345 PASS / 1 SKIP**. Живая проверка установленного
Слияния: Inner **1 × 79**, смена ключа и Left **1 × 78**; независимые проверки
настроек и значений прошли, по **11/11** подмен evidence отклонены.
Исходная автономная приёмка Hermes Sol/low: **58/58 PASS**.
[Состав, доказательства и откат](client-update-join-2026-09-12.md).
Для загрузки обновлённого плагина Codex нужна новая задача. Серверные каталоги
и публичный Release не переключались; следующие узлы и пилот не возобновлялись.

---

# Клиент обновлён — 12 сентября 2026

Установлен **0.1.0-dev.20260910.3-c68743ca2658** с исправлением возврата к сценарию
и проверяемыми компактными результатами. Код отправлен в main: `8da19462`.
Сборка на VPS; сохранена прежняя локальная диагностика API.
Codex/Hermes плагины обновлены, шлюз Hermes перезапущен, настройки сохранены.
Установочный снимок: 1317 PASS /1 SKIP; живая проверка установки: 7/7 PASS.
Исходная автономная приёмка: 31/31 PASS,11 подмен отклонены.
[Состав, проверки и откат](client-update-process-focus-2026-09-12.md).
Для новых инструментов Codex начать новую задачу. Публичный Release не создавался;
новые узлы и параллельный пилот не запускались.

---

# Каталог для тестовых аккаунтов размещён — 11 сентября 2026

На VPS собран и staged/readback `2026.09.11-parallel-pilot.1-candidate`:
manifest SHA `4ac827fc9e0cefa609bf2cb8fd7d3d79318dd3fe92999decc7e385fae51fc6e2`,
URI `viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.11-parallel-pilot.1-candidate/manifest.json`.
Обе операции сохранения revision2 допускают `/test-1`, `/test-2`, `/test-3`;
каталоги подтверждены через живой UI созданных пользователем аккаунтов.
Профиль Loginom7.4.2, E2E `2cad5602158fd2e4836d821d644a2b8d92f571a2`;
`stale_actions=[]`, `activated=false`. Manifest прочитан также через Dock MCP.
Чистые исходники `7da6f1f8`, сборка в
`/opt/loginom-dock/releases/20260911-catalog-parallel-pilot1-7da6f1f8`.
Production current и контейнеры не переключались; перед сборкой проверены
health/auth/MCP и фактические образы. Клиент и глобальные профили не обновлялись.
Пилот впоследствии остановлен пользователем; каталог остаётся кандидатом
для последовательной проверки, успешная приёмка новых узлов не заявляется.

---

# Клиент с «Фильтром строк» установлен — 11 сентября 2026

Код отправлен в main: `79f072dc`. Клиент на Mac:
**`0.1.0-dev.20260910.3-38f8be0b843b`**, собран на VPS из чистого локального
снимка `668d9f95`, который сохраняет прежнюю диагностику API.
Плагины Codex/Hermes обновлены, шлюз Hermes перезапущен, настройки сохранены.
Установленный runtime `f14d6452ef74c43fd75730f87bae2db8bb3d4e7faca2aeb5604a47af96d0f61e`.

Mac **1288 PASS / 1 SKIP**, native diagnostics **5 PASS**; живой независимый
аудит установки **11/11 PASS**, оба выхода по пять строк, все 50 значений сверены.
Source Hermes после ревью: **49/49 frozen PASS**, десять подмен отклонены.
Дополнительные Linux-тесты имеют нестабильные отказы; зелёный прогон не заявляется.
Предыдущая версия `7adeb19b4c91` сохранена для отката.
[Состав, проверки и ограничения](client-update-row-filter-2026-09-11.md).
Для обновлённых инструментов Codex начать новую задачу. Публичный выпуск не выполнялся.
Общий preflight `UI_SCAN_LIMIT` для нового узла на 1000 полях остаётся отдельным.

Ниже сохранены исторические записи; актуальная установка описана выше.

---

# Клиент с «Параметрами полей» установлен — 11 сентября 2026

Текущий клиент на Mac: **`0.1.0-dev.20260910.3-7adeb19b4c91`**, сборка на VPS.
Основной код принят в main-коммите `b8ea6295`; локальный снимок
`a23f08df3cfa3c79281e80656b0d0e210af8c84a` сохраняет прежнюю диагностику API.
Runtime: `1161c1c8f8d82bd3742d4d49bf84ab69f98bf348dcdcb487f4fcb4257881ddfa`.
Codex/Hermes плагины обновлены, шлюз Hermes перезапущен. Настройки сохранены.
Mac и VPS: по **1245 PASS, 1 SKIP**; живой аудит установки **11/11 PASS**, выход 6×4.
Автономная приёмка исходников после ревью: **49/49 PASS**, девять подмен отклонены.
[Состав, проверки, отличие от main и откат](client-update-field-parameters-2026-09-11.md).
Для Codex начать новую задачу. Публичный выпуск не выполнялся; V4/V5 открыты.
Подпланы06/09 (Слияние)/10 и следующая группа11–16 остаются planned.

Ниже сохранены исторические записи; актуальная установка указана выше.

---

# Установленный клиент обновлён — 11 сентября 2026

Установлен **`0.1.0-dev.20260910.3-aff2b95bac44`**, собранный на VPS:
исправления main `7774320f` плюс сохранённая локальная диагностика ошибок API.
Source snapshot: `615b26ae96ba34b7146630e7b1518f7004714ff5` (локальный).
Runtime: `4f08940c0803585ccb9f688eab96738c9d4dbcc4fd5d652180971e2e48ca0648`.
Codex/Hermes native-плагины обновлены, шлюз Hermes перезапущен.
Mac и VPS: по **1192 PASS, 1 SKIP**; установленный клиент на Loginom 7.4.2:
независимый аудит **12/12 PASS**. Настройки и предыдущая версия сохранены.
[Состав, проверки, ограничения и откат](client-update-2026-09-11.md).
Для Codex начать новую задачу; публичный выпуск не выполнялся.

---

## Локальный пользовательский профиль Hermes — установлен 10 сентября 2026

Согласован [план](../plans/loginom-dock/09-hermes-user-diagnostics.md).
Диспетчер Hermes выбирает `~/.loginom-dock/profiles/hermes-user.json`, если файл
существует; Codex продолжает читать `~/.loginom-dock/config.json`. Файл профиля
приватный (0600), содержит Dock connection и `hermes_profile` version1:
`mode=executor-replay`, `result_profile=user-v1`, закреплённые manifest URI/SHA,
`input_upload_directory=/user/dock-p3`, `passwordless_login=true`, `loginom_user=user`.
Целевой URL — проверенный 7.4.2 `http://logi-test-plan.bg.local/app/?testable=true`.
Пароль не добавляется. Подключение 7.5 сохраняется в общем config для Codex и отката.

Провайдер основного Hermes установлен: `openai-codex`, модель `gpt-5.6-sol`,
`agent.reasoning_effort=low`, без fallback. Иные параметры Hermes сохраняются.
Перед установкой сохранены исходные конфигурации, runtime pointer и native source
в `unavailable:artifact-1d36eadf89406bc0` (приватно, не Git). Установлен комплект `0.1.0-dev.20260910.3`, собранный на VPS; runtime
`84a47863909ad7ca90389e9e54a12da85af12e531a0562821234723c9695901e`.
Source commit — в `~/.loginom-dock/current/release.json`, тот же pin у native-плагина.
[Обычная приёмка и независимый аудит](hermes-user-diagnostics-2026-09-10.md) прошли.
Native source доступен в `~/.loginom-dock/native-sources/` как локальное bare Git
зеркало чистого коммита; установленные файлы сверены с VPS-комплектом.

Локальный отчёт обычного запуска: `~/.loginom-dock/bin/loginom-dock report SESSION_ID`;
добавление `--json` возвращает счётчики по запросам и задачам без полного тела журнала.
Данные лежат только в `~/.loginom-dock/diagnostics/`; исходные квитанции браузерных
операций — в `sessions/SESSION_ID/execution-events.jsonl`. Новые журналы на сервер
не отправляются. Поля null означают отсутствие подтверждённой метрики, не ноль.

Откат требует восстановления прежнего native source Hermes, прежнего runtime и
сохранённой конфигурации Hermes, а также удаления нового файла Hermes-profile,
если его раньше не было. Не заменять общий config или конфигурацию Codex.
Исходный rollback runtime: `releases/0.1.0-dev.20260910.2-0afdd48cc0d2`;
указатель `previous` сохраняется на него. Первоначальные снимки в before-install
не заменяются снимками промежуточных сборок. Публичный выпуск и landing исключены.

---

## 8 сентября 2026 — staged-каталог полного node.apply

На VPS собран и staged/read-back `2026.09.08-node-apply.1-candidate`; activated=false.
Release: `/opt/loginom-dock/releases/20260908-catalog-node-apply1-5b48f9d8/`.
Manifest URI:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.08-node-apply.1-candidate/manifest.json`,
SHA256 `936ef73d933e85bfd8429b8b0f2b515c543ca415a2b22ba57e108232c54ddf44`.
`package.save_as` и `package.save_checkpoint` revision2, allowed_roots `/user/dock-p3`;
compatibility loginom-7.4.2-macos-chromium-ru; stale_actions=[].

Сборка выполнена в существующем node:24.19.0-bookworm-slim без сети.
Source archive SHA `1704b9de16b923c31070aa283847825313852c330caee47873f583f714aec532`;
252 отобранных файла, base commit b203ad1bfd9abed9352278c520ac2373ff056588,
**build_inputs_match_commit=false**: это зафиксированный dirty-worktree snapshot,
а не объявление коммита с этими изменениями. source.tar.gz.manifest.json сохранён
рядом с архивом на VPS. Stage report: stage-report.json в том же release.
Настоящий bridge подтвердил новый каталог и обе persistence actions; браузерные
действия/модель в precheck не выполнялись. Production current.json и контейнеры
не переключались. Приёмка Hermes полного Подплана03 пока не выполнена.

## 7 сентября 2026 — staged-каталог пилота импорта

На VPS собран кандидат `2026.09.07-node-import.1-candidate` из явно отобранных
исходников в `/opt/loginom-dock/releases/20260907-catalog-node-import1`.
Stage и read-back выполнены; `activated=false`. URI:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.07-node-import.1-candidate/manifest.json`,
SHA256 `dcef4bc665c53185eca66e674b126b21fae3b21077bc5cdc293769afc053321f`.
Кандидат использован в отдельной source-приёмке импорта (54/54 PASS,
`20260907-170150-12a754e8`); это не production admission полного каталога.
Публичный клиент этой работой не переустанавливался. Runtime источников и пределы
пилота закреплены сверху [implementation-status.md](implementation-status.md).

# Сервер, конфигурация и развёртывание

## Обновление публичного клиента и Caddy — 7 сентября 2026

Опубликован `0.1.0-rc.2-fix`, source `487ada8e3bdfe99d827033a519d6be610c707d91`.
Текущий Caddy: `loginom-dock:landing-rc2-fix-f9549670`, image ID
`sha256:7718912a50c5975bb5d99e48e2af7ccce82338bda8b6fb0e9509386ebc84dcb1`.
Source лендинга: `f954967097832960863dd858185cb9c99972a762`.
API/MCP-контейнер не пересоздавался. current/server source остались прежними;
исторические caddy-image.* в старом каталоге не описывают этот новый образ.
Точные inputs, image.* и backup конфигурации:
`/opt/loginom-dock/client-build/rc2-fix-487ada8e/landing/`.
Для отката сайта брать `deploy.env.rc2-baseline`, а не промежуточный rc.5,
который удалён из GitHub по запросу пользователя. Подробнее:
[windows-agent-install.md](windows-agent-install.md).
Остальные записи ниже сохраняют свои даты применимости.

Сначала прочитать [памятку агенту](agent-handoff.md). Инвентаризация ниже сверена
с сервером 4 сентября 2026 года; перед изменениями повторить read-only проверки.
Секреты здесь намеренно не приводятся. Документационная задача не является
поводом перезапускать сервисы, переустанавливать клиента или запускать модели.

## Стенд Loginom для тестирования и отладки

С 7 сентября2026 по явному выбору пользователя использовать
`http://logi-test-plan.bg.local/app/?testable=true`; отображаемая версия7.4.2.
Исходная проверка использовала `user`, но для текущих потоков назначены отдельные
аккаунты test-2/test-1/test-3/test-4, для координатора — `orcestrator`.
Назначения и собственные каталоги проверять по [реестру потоков](../plans/loginom-dock/three-stream-workflow.md).
Уточнением пользователя 12 сентября прежнее исключение Excel от 7 сентября
отменено: Linux-стенд поддерживает XLSX, импорт и экспорт включены двумя задачами
в [очередь потока1](../plans/loginom-dock/four-stream-node-roadmap.md).
Это адрес целевого Loginom, отдельно от VPS/API/MCP Dock ниже. Production Dock
и установленный клиент этой проверкой не изменялись. Перед новой приёмкой
нужны соответствующие origin/build pins и проверенные storage allowed roots.

## Доступ и расположение

VPS Dock — **82.22.23.10**, Ubuntu 24.04, Docker/Compose уже установлены.
Публичные порты — 80/443, SSH — из конфигурации проекта. API на хосте слушает
`127.0.0.1:1933`; Ollama доступна внутри Docker-сети. DNS обоих доменов указывает
на этот VPS. Сертификатами управляет Caddy.

На машине разработки checkout находится в `unavailable:artifact-cf88a7be2dd0c277`.
Локальный `.env` содержит `LOGINOM_DOCK_SSH_HOST`, `LOGINOM_DOCK_SSH_PORT`,
`LOGINOM_DOCK_SSH_USER`, `LOGINOM_DOCK_SSH_PASSWORD`, `LOGINOM_DOCK_DOMAIN`,
`LOGINOM_TARGET_URL` и `OPENROUTER_API_KEY`. Проверенный SSH host key хранится в
`unavailable:artifact-b40a42378cf52df1`. Содержимое `.env` не исполнять через `source` и не печатать.

Для неинтерактивного SSH уже используется `sshpass -e`: пароль передаётся только
через окружение дочернего процесса. Пример **read-only** проверки из корня checkout:

```python
import os, pathlib, shlex, subprocess

root = pathlib.Path.cwd()
config = {}
for line in (root / '.env').read_text().splitlines():
    if '=' not in line or line.lstrip().startswith('#'):
        continue
    key, value = line.split('=', 1)
    words = shlex.split(value, comments=True)
    config[key.strip()] = words[0] if words else ''
env = dict(os.environ, SSHPASS=config['LOGINOM_DOCK_SSH_PASSWORD'])
ssh = ['sshpass', '-e', 'ssh', '-p', config.get('LOGINOM_DOCK_SSH_PORT', '22'),
       '-o', 'PreferredAuthentications=password', '-o', 'PubkeyAuthentication=no',
       '-o', 'StrictHostKeyChecking=yes',
       '-o', f'UserKnownHostsFile={root / "unavailable:artifact-b40a42378cf52df1"}',
       '-o', 'ConnectTimeout=30',
       f'{config["LOGINOM_DOCK_SSH_USER"]}@{config["LOGINOM_DOCK_SSH_HOST"]}']
subprocess.run(ssh + ['curl --connect-timeout 5 --max-time 10 --fail --silent --show-error http://127.0.0.1:1933/health'],
               env=env, check=True)
```

При отсутствии `.env`, `known_hosts` или сетевого доступа остановить только
зависящие от них операции и сообщить, чего не хватает. Не заменять SSH-аутентификацию
или проверку host key. Временные `/private/tmp/loginom-dock-*.py/.sh` использовались
в прежних задачах, но не входят в репозиторий и не являются обязательным инструментом.
Для нового сценария можно передавать проверенный shell-файл в `ssh ... bash -s`
через stdin; пароль и текст конфигов не должны попадать в команды или вывод.

### Пути на VPS

Все следующие пути относятся к `/opt/loginom-dock`, если не указано иначе.

| Путь | Назначение |
| --- | --- |
| `current` | Symlink на проверенный текущий серверный релиз |
| `releases/<id>/src/` | Снимок исходников для конкретной сборки |
| `releases/<id>/source.tar.gz`, `source.commit` | Архив исходников и полный commit; архив требуется backup-скрипту |
| `releases/<id>/image.name`, `image.id` | Образ приложения и проверенный Docker image ID |
| `releases/<id>/caddy-image.name`, `caddy-image.id` | Образ Caddy с лендингом и его ID |
| `releases/<id>/previous-release`, `deploy.env.before` | Предыдущий релиз и защищённая конфигурация для отката, если подготовлены при развёртывании |
| `prepared-release` | Кандидат для сборки; не доказывает, что этот релиз работает |
| `config/deploy.env` | Переменные production Compose: образы, ревизия, основной домен и публичный origin |
| `config/ov.conf` | Активные модели, auth и workspace сервера; mount в `/app/.openviking/ov.conf` |
| `config/client.json` | Обычный клиентский ключ общего аккаунта |
| `config/admin.json` | Ключ администратора аккаунта Dock для ресурсов/skill; отличается от server root key |
| `config/ovcli.conf`, `ovcli.settings.conf` | Собственные endpoint/ключ и язык CLI внутри контейнера |
| `config/assets-credentials.json` | Credentials GitLab для штатного Assets importer |
| `config/ca-bundle.crt`, `gitconfig`, `Caddyfile.gitlab` | Доверие внутреннему HTTPS gateway и настройки Git/LFS |
| `assets/` | Рабочие catalog, manifests, Assets State, baseline/audit, skill ZIP и memory templates |
| `tools/` | Установленные эксплуатационные скрипты из `deploy/loginom-dock/`; checkout сам их не обновляет |
| `deploy-stage2/compose.gitlab.yaml`, `gitlab-lfs-proxy.py` | Действующее дополнение Compose и код LFS proxy |
| `tunnel/gitlab.sock` | Unix socket временного reverse SSH-туннеля с машины под VPN |
| `client-build/` | Серверные входные файлы, клиентские комплекты и извлечённые предпросмотры |
| `backups/`, `latest-backup` | Полные локальные копии, архивы образов и указатель последней успешной копии |
| `monitoring/health.json` | Последний ограниченный отчёт состояния без provider messages/credentials |

Credentials имеют права 0600, их каталоги — 0700. Оригинальные данные находятся
в Docker volume `loginom-dock_dock_data`, внутри приложения —
`/app/.openviking/workspace`. Не редактировать внутренние индексы напрямую.
Остальные тома: `loginom-dock_caddy_data`, `loginom-dock_caddy_config`,
`loginom-dock_ollama_data`, `loginom-dock_gitlab_tls`.

### Снимок работающей установки

Текущий релиз — `/opt/loginom-dock/releases/20260904-landing-7b711846`, исходный
commit `7b7118468353eacab83551a3570efb4de76b6b2f`.
SHA-256 `source.tar.gz`:
`5880b4593c04f0da412f461d5c8fcf432827279e93b0650e718ce3e8ecf1b963`.
Следующие коммиты документации в GitHub не требуют смены серверной ревизии.

| Контейнер | Работающий образ |
| --- | --- |
| `loginom-dock-openviking-1` | `loginom-dock:studio-landing-70411dfe` |
| `loginom-dock-caddy-1` | `loginom-dock:landing-7b711846` |
| `loginom-dock-ollama-1` | `ollama/ollama@sha256:020e4134285e2ef4d8fd801234176de3b4faadc992a3eb06c8e66a2f9d4c4ba2` |
| `loginom-dock-gitlab-gateway-1` | `caddy@sha256:df7f1c2fb114453b951de51a98efc010db1655a92c2e86be6706714e2417a78d` |
| `loginom-dock-gitlab-lfs-proxy-1` | `loginom-dock:stage2-b2975a94` |

Image ID приложения:
`sha256:291a9afdde3696ef84cb5ea674c93f5c09bfa4268cd59978cca7cf7d52ff6066`.
Image ID Caddy/лендинга:
`sha256:2fa556e22e2c9084186b129885d3f8319f5584045b968e61295a57655003baf5`.
Приложение и Studio не пересобирались при обновлении `0.1.0-rc.2`: они сохранены
на прежнем проверенном образе `loginom-dock:studio-landing-70411dfe`. Другие два
вспомогательных контейнера также сохранены на прежних проверенных образах.
Общий `compose up` может пересоздать их из новых значений переменных образов;
при адресном обновлении указывать нужные сервисы и `--no-deps`.

### Модели

Канонические **активные** значения находятся в `config/ov.conf`. Локальный
`OPENROUTER_API_KEY` — копия ключа для работы с проектом; изменение одного `.env`
само по себе не обновляет работающий сервер.

| Функция | Модель в проверенном конфиге | Провайдер |
| --- | --- | --- |
| Embedding | `voyageai/voyage-4` | OpenRouter, адаптер `openai` |
| VLM | `qwen/qwen3.7-flash` | OpenRouter, адаптер `openai` |
| Rerank | `voyageai/rerank-2.5-lite` | OpenRouter, адаптер `openai` |
| Query planner | `ollama/guoxuter/ov_intent_analysis_sft:v7_q8` | Локальная Ollama через `litellm` |

При обновлении этой документации проверены настройки и readiness, **новые запросы
к моделям не выполнялись**. Результаты прежних реальных проверок — в журнале.
Применять ограничения моделей и исключение Hermes/ChatGPT из `AGENTS.md`.
После атомарной замены `ov.conf` нужно пересоздать приложение: простой `restart`
может оставить bind mount старого inode. Не менять upstream default account/user;
общий аккаунт клиентов выбирается ключом.

## Команды первичной проверки

Команды ниже выполняются **на VPS**. Они не выводят полные секретные конфиги.

```sh
readlink -f /opt/loginom-dock/current
cat /opt/loginom-dock/current/source.commit
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
docker inspect loginom-dock-caddy-1 --format '{{range .Mounts}}{{println .Source "->" .Destination}}{{end}}'
curl --connect-timeout 5 --max-time 10 --fail --silent --show-error http://127.0.0.1:1933/health
systemctl list-timers --all --no-pager 'loginom-dock-*'
cat /opt/loginom-dock/monitoring/health.json
```

Не печатать полный `docker inspect`/`docker compose config`, `ov.conf`, `.env`,
`client.json` или истории агента: они могут содержать секреты. Для синтаксиса
Compose использовать `config --quiet`. `verify-server.py` проверяет HTTPS,
readiness, аутентификацию, права обычного клиента и каталог MCP. В текущем коде
readiness включает embedding probe; это расширенная проверка установки,
не пассивный сетевой probe и не приёмка полного сценария Loginom.

### Точный production Compose

Выполнять из `src/` выбранного релиза. При проверке текущего стека:

```sh
cd /opt/loginom-dock/current/src
dock_compose() {
  docker compose --env-file /opt/loginom-dock/config/deploy.env \
    -f docker-compose.yml -f deploy/loginom-dock/compose.server.yaml \
    -f /opt/loginom-dock/deploy-stage2/compose.gitlab.yaml \
    --profile server "$@"
}
dock_compose config --quiet
dock_compose ps
```

Третий файл обязателен для существующего production: в нём mounts CLI/Assets,
GitLab CA и закрытая сеть. Не заменять его шаблоном из нового checkout вслепую.
При смене каталога релиза относительный путь Caddyfile тоже меняется; проверить
фактический mount. Не запускать `down -v`, не очищать Docker images/volumes как
часть обычного обновления.

## Подготовка и публикация изменения

### 1. Выбрать сборку

| Что изменено | Сборка на VPS | Что пересоздать после проверки |
| --- | --- | --- |
| Только документация | Не нужна | Ничего |
| Статика лендинга / Caddyfile | `Dockerfile.landing` | `caddy` |
| Только Studio | `Dockerfile.studio-update`, `BASE_IMAGE` из проверенного текущего приложения | `openviking` |
| Backend, Python/Rust/C++, серверные зависимости | Корневой `Dockerfile` | `openviking` и только действительно затронутые вспомогательные сервисы |
| Клиент/native plugins | [Выпуск клиентских комплектов](releasing.md) | Серверный образ сам по себе не обновляет клиент пользователя |
| Полный skill | Проверенный ZIP, `publish-skill.py`, manifest/read-back | Новая клиентская сессия; не пересборка сервера |

`Dockerfile.studio-update` заменяет **только** assets Studio в установленном
Python-пакете; он не переносит изменения backend. Исторические `Dockerfile.*-update`
также имеют узкий набор файлов и не являются универсальной сборкой.

### 2. Подготовить независимый каталог релиза

Зафиксировать проверенные исходники, убедиться в чистоте Git. Для полного снимка
можно использовать стандартный Git archive; временный старый упаковщик не требуется:

```sh
dock_revision=$(git rev-parse HEAD)
mkdir -p .dock
git archive --format=tar "$dock_revision" | gzip -n > "unavailable:artifact-fbb327c6e6a2dc89"
shasum -a 256 "unavailable:artifact-fbb327c6e6a2dc89"
```

Перед передачей проверить состав архива: только исходники, без credentials,
локальных зависимостей, профилей, `.dock` и build artifacts. Передать через SSH
в новый каталог `/opt/loginom-dock/releases/<уникальный-id>/source.tar.gz`;
проверить SHA-256 на VPS и распаковать в `src/`. Сохранить полный `source.commit`.
Не распаковывать поверх `current`. Наличие архива требуется последующим backup.

На VPS из нового `src/`, с явно заданными непустыми переменными:

```sh
# dock_revision — полный commit; dock_caddy_image/dock_app_image — новые уникальные теги.
docker build -f deploy/loginom-dock/Dockerfile.landing \
  --build-arg LOGINOM_DOCK_REVISION="$dock_revision" -t "$dock_caddy_image" .

# Только при изменениях Studio; dock_base_image — проверенный текущий образ приложения.
docker build -f deploy/loginom-dock/Dockerfile.studio-update \
  --build-arg BASE_IMAGE="$dock_base_image" \
  --build-arg LOGINOM_DOCK_REVISION="$dock_revision" -t "$dock_app_image" .
```

Для полной серверной сборки вместо overlay использовать корневой Dockerfile с
`OPENVIKING_VERSION=0.1.0.dev0`, `UV_LOCK_STRATEGY=locked`,
`LOGINOM_DOCK_REVISION` и новым уникальным тегом. Не перезаписывать текущий тег.
Проверить image ID и сохранить `image.name/image.id`, `caddy-image.name/caddy-image.id`.
Если компонент не пересобирался, записать его фактический сохранённый образ.

### 3. Проверить до переключения

Для Caddy из нового `src/`:

```sh
docker run --rm --env LOGINOM_DOCK_DOMAIN=loginom.duckdns.org \
  -v "$PWD/deploy/loginom-dock/Caddyfile.server:/etc/caddy/Caddyfile:ro" \
  "$dock_caddy_image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

Дополнительно проверить HTTP-ответы в отдельном временном контейнере на loopback
с тестовой копией Caddyfile и явно HTTP listener. Syntax validation не проверяет
итоговые заголовки. Для лендинга страницы/JS/CSS имеют `Cache-Control: no-cache`,
WOFF2 — `public, max-age=31536000, immutable`; соответствующие matchers не пересекаются.
Именно конфликт этих правил вызвал откат первой публикации лендинга.

Извлечь собранные файлы через `docker cp` для предпросмотра либо проверить кандидат
на сервере. Пройти четыре выбора агент/ОС, ссылки, копирование, примеры, FAQ,
широкий и узкий экран. Сайт не требует моделей. Контейнер проверки убрать после
завершения; production volumes к нему не подключать.

### 4. Переключить только нужные сервисы и проверить

До изменения `config/deploy.env` сохранить его защищённую копию в новом релизе и
путь прежнего `current`. Не перезаписывать исходную копию при повторе неудачного
развёртывания. Менять только нужные переменные образов и ревизию, сохраняя остальное.
`LOGINOM_DOCK_DOMAIN` остаётся `loginom.duckdns.org`; домен лендинга задан отдельно
в `Caddyfile.server`.

Из нового `src/` использовать функцию `dock_compose` выше, например:

```sh
# При обновлении и Studio, и лендинга; для одного компонента оставить только его имя.
dock_compose up -d --no-build --no-deps --force-recreate openviking caddy
python3 /opt/loginom-dock/tools/verify-server.py
```

Дождаться healthy/readiness и сертификата, проверить публичный лендинг, MCP старого
домена, 302 для обеих форм `/studio/connect`, переход внутри Studio, корректные
MIME-типы и 404 на `/mcp` нового домена. При backend-изменении добавить проверки
затронутого поведения. Только после успеха переключить `current` на новый релиз
и записать фактические образы/хеши/результаты в документацию.

При ошибке вернуть сохранённый `deploy.env`, выполнить Compose из **предыдущего**
`src/` и пересоздать те же затронутые сервисы. Вернуть `current`, если он уже менялся,
затем повторить проверку готовности. Для Caddy откатываются и образ, и Caddyfile.
Данные и серверные credentials при таком откате не восстанавливаются из старой копии.
Автоматический откат образа допустим только при совместимом формате данных;
для миграций хранилища нужен отдельный порядок восстановления.

## Источники и skill

Канонические URI трёх источников перечислены в [архитектуре](architecture.md).
В рабочем `assets/catalog.yaml` используются внутренний HTTPS origin и `auth_ref`;
репозиторный catalog сохраняет исходные locator. Не публиковать рабочие credentials
вместе с catalog. `.source/` хранит оригиналы, `.source-manifest.json` — контрольные
суммы; обычное поддерево используется для семантического поиска.

Для обновления нужен временный туннель с машины под VPN:

```sh
python3 deploy/loginom-dock/gitlab-tunnel.py --env-file .env --state-dir .dock
```

Он работает на переднем плане. Предварительно проверить host key, права и отсутствие
другого владельца socket. Импорт запускать установленным `unavailable:artifact-48ba1ffdc934a6bc`:
он сериализуется с backup и завершает работу полным аудитом. До запуска подготовить
baseline нужных ревизий. Порядок и адресный повтор — в [development.md](development.md).
Чтение уже импортированных данных не требует запуска туннеля или повторного импорта.

Полный skill публикуется из проверенного ZIP через `unavailable:artifact-9ccd1a4150353244` с
явными `--archive`, `--admin`, `--report`. Сначала читать текущий manifest, затем
проверять результат и целостность. Отчёт — `assets/skill-publication.json`.
Не менять закреплённый skill текущей сессии. Полная процедура относится к изменению
skill, а не к каждой задаче через Dock.

## Клиент на машине пользователя

| Путь | Назначение |
| --- | --- |
| `~/.loginom-dock/config.json` | Активные endpoint, обычный клиентский ключ, Loginom URL; 0600 |
| `~/.loginom-dock/bin/` | Launchers, которые разрешают текущую установленную среду |
| `~/.loginom-dock/releases/`, `current`, `previous` | Проверенные среды, активная и предыдущая версии; на Windows `current`/`previous` — pointer-файлы |
| `~/.loginom-dock/current/runtime/node` | Закреплённый Node; на Windows путь разрешается через pointer и оканчивается `runtime\\node.exe` |
| `~/.loginom-dock/runtime/browsers/` | Управляемый Chromium |
| `~/.loginom-dock/sessions/<id>/session.json` | Реальные pins, пути, признак archive activation |
| `~/.loginom-dock/sessions/<id>/browser-profile/`, `artifacts/` | Изолированный браузер и результаты этой сессии |
| `~/.loginom-dock/archive/queue.sqlite` | Durable очередь, WAL/FULL; не очищать для устранения ошибки доставки |
| `~/.loginom-dock/registration-*` | Журнал native-регистрации и восстановления; может содержать credentials |
| `<checkout>/.dock/` | Приватные отчёты разработки, проверки и скачанные серверные артефакты |

На 10 сентября по запросу пользователя закрыты замечания сценария продаж и
обновлена среда macOS этой машины:
`~/.loginom-dock/releases/0.1.0-dev.20260910.2-0afdd48cc0d2`.
Сборка на VPS `/opt/loginom-dock/client-build/followups-7acb6d39` из чистых inputs
коммита `7acb6d396ffdb0422998342145f139246710ea7a`; runtime из 109 входов
`d1f4e7fe4f9384a885352005591d4bd68e87eca2610b1827080d1de3f458d207`.
Codex и Hermes включены, файлы/регистрации проверены, новые MCP-процессы
подключились. После тайм-аута HTTPS Hermes установлен из закреплённой локальной
Git-копии `~/.loginom-dock/native-sources/loginom-dock-7acb6d396ffdb0422998342145f139246710ea7a.git`.
Этот путь нужен для восстановления/повторной установки native-плагина.

Прежняя среда `0.1.0-dev.0-038fefe35353` сохранена в `previous` и проверена.
Откат обеих регистраций выполняется в обратном порядке установки: Hermes,
затем Codex; полный откат после этой установки не выполнялся. Личные настройки
вне Dock и основной config Dock сохранены. Для загрузки нового native skill
нужна новая сессия агента, для работающего gateway — перезапуск.

Это внутренняя предварительная поставка для Mac. Автономная приёмка **48/48 PASS**
относится к закреплённому `executor-replay` и Loginom 7.4.2; личный Loginom 7.5
и обычный `classic` не переключены. Публичный hotfix, landing и production
не менялись. [Отчёт, доказательства и ограничения](sales-followups-2026-09-10.md).
При диагностике смотреть `session.json` конкретной задачи.
Hermes должен использовать существующий выбранный профиль (`HERMES_HOME` или
явный `--hermes-home`) и уже подключённую подписку ChatGPT; личный memory provider
не менять. Полные transcript/config не выводить для поиска версии или имени профиля.

Релизные доказательства — `unavailable:artifact-5967002a19741213`; Windows-результат и
скриншот — в его подкаталоге `evidence/`. Предыдущая приёмка Hermes —
`unavailable:artifact-343a2bd4bffac840` и `unavailable:artifact-72544d9b5afe8f40`,
лендинг — `unavailable:artifact-ea2039e8ad752319`. Эти файлы не входят в Git; новый checkout может
их не иметь. Подтверждённые выводы и хеши сохраняются в журнале.

### Windows-машина для live-проверок

Проверенная машина — `192.168.1.48`, Windows 11 x64, пользователь `POWERUP\\vskar`.
OpenSSH доступен из локальной сети по отдельному ключу разработки; этот доступ
явно разрешён пользователем. Не публиковать приватный ключ и не заменять настройки
доступа без отдельной задачи. На машине установлены Codex и Hermes 0.21.0. Для
создания сценариев Hermes использует существующую подписку ChatGPT, provider
`openai-codex` и модель `gpt-5.6-sol`; не переключать его на OpenRouter или другую
модель ради тестов.

У Windows-машины нет постоянного VPN к целевому Loginom. Приёмка `0.1.0-rc.2`
использовала временный reverse SSH-мост через машину разработки для HTTP и
WebSocket; запись hosts, туннели и временная задача планировщика после проверки
удалены. Для новой live-проверки сначала организовать штатный VPN либо заново
создать явный временный мост к обоим протоколам. Доступность только HTTP не
подтверждает работу Loginom: без WebSocket интерфейс не завершает подключение.

## Резервирование и мониторинг

`loginom-dock-monitor.timer` и `loginom-dock-backup.timer` включены и активны.
Первый запускается каждые пять минут; второй — в 05:00 **Europe/Moscow**, независимо
от часового пояса, которым `systemctl list-timers` отображает даты.

`unavailable:artifact-c56c562b10cd445e` сохраняет пять томов, образы всех пяти контейнеров,
config, assets, source archive и эксплуатационные файлы. Он кратко останавливает
сервисы, сериализуется с импортом и возобновляет их при ошибке. Для переноса нужны
каталог копии и все файлы `backups/images`, на которые ссылается `image-checksums`.
Копии содержат credentials; права и закрытое хранение обязательны.

На момент проверки `latest-backup` указывает на `backups/20260903T020016Z`.
Восстановление выполняется `unavailable:artifact-ed08e53638d7109b --backup ... --name ... --root ...`
в отдельные сеть, тома и контейнеры; порты по умолчанию 19433/19443 только на loopback.
Проверить свободные порты, место и контрольные суммы до запуска. Оно не переключает
production DNS или публичные порты. Подробности — в [deploy README](../../deploy/loginom-dock/README.md).

Лендинг уже входит в Caddy image и существующий backup. Не считать `healthy` в
мониторинге проверкой всех сценариев, всех моделей или пригодности последней копии
к восстановлению без отдельной проверки.

## Корни сохранения пакетов в candidate-каталоге

`package.save_as` ограничивает пути данными `effect.allowed_roots` закреплённого
каталога. Старый `2026.09.05-agent.2-candidate` содержит `/user/data/packages`;
выбор Loginom account `test` и upload destination `/test` сам по себе эту
политику не меняет.

При сборке нового кандидата на VPS используйте явные параметры сборщика
`--version <новая-версия> --package-root /test/packages` для текущей разрешённой
приёмки. `--package-root` можно повторять для нескольких явно выбранных корней;
не выводите их из OS/SSH/Loginom username. Без параметра действуют корни исходного
каталога. Изменение политики требует новой версии и отдельного stage/readback,
а replay — новых manifest URI/SHA. Production activation по-прежнему требует
полной приёмки. Кандидат `2026.09.06-agent.3-candidate` собран на VPS и staged/readback 6 сентября:
manifest SHA `007465bf4d8fee5f238ef790db4584313d61373d27f92715f01388edfe413ae6`,
URI `viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.06-agent.3-candidate/manifest.json`.
Серверный build/report: `/opt/loginom-dock/releases/20260906-catalog-agent3-11f696c5/`.
Save revision 2 ограничен `/test/packages`. Production не активирован; live
сохранение и повторное открытие ещё должны пройти приёмку.

### Candidate для стенда Loginom7.4.2 (7 сентября2026)

`2026.09.07-agent.4-candidate`: build и stage/read-back выполнены на VPS в
`/opt/loginom-dock/releases/20260907-catalog-agent4-loginom742/` из предыдущего
серверного каталогаagent3. Profile loginom-7.4.2-macos-chromium-ru,
loginom_build7.4.2, save allowed root `/user/dock-p3/packages`.
Manifest URI `viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.07-agent.4-candidate/manifest.json`,
SHA `85ac2d532245d2da2c9428c499cfa74ba3cc0b3a6e0732c51e6b96cf9f96b0fa`.
Staged=true, activated=false. Это кандидат для проверки, не приёмка capability.
Каталоги `/user/dock-p3` и `/user/dock-p3/packages` созданы и повторно открыты
через UI под явно выбранным user; package save/reopen ещё не проверен.

### Candidate с «Параметрами полей» (7 сентября 2026)

`2026.09.07-agent.5-candidate` собран на VPS и staged/read-back в
`/opt/loginom-dock/releases/20260907-catalog-agent5-reform/`. Добавлен
`transform.reform_columns` в node.add revision3, с provenance
`bg/selectors.ts:370–374` того же E2E commit. Profile и save root сохранены
от agent4. Manifest SHA
`25c659669ace184ba27e7c8b0cea6c030997e29f2c7c89372d565f4bc8cdd4eb`, URI
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.07-agent.5-candidate/manifest.json`.
Staged=true, activated=false; автономная приёмка нового узла ещё не выполнена.
Production current повторно проверен: `20260904-landing-7b711846`.
