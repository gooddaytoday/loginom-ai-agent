# Узел 12 — комплект подготовки автономной приёмки

Команда: `node12:acceptance-preparation:1:7bf88255562c59cd32397be3f68c4ec85cb55b38`.
Подготовка и полный candidate preflight завершены 2026-09-13. Разработка и единственный раунд N12-R1 приняты
координатором. Повторное ревью не проводилось. Координатор выполнил VPS build/stage
и readback; локальный preflight прошёл без сценария Hermes. Слот ожидается после узла 11. Это готовность комплекта,
не готовность подплана или установленного клиента.

## Замороженные входы

Source commit: `7bf88255562c59cd32397be3f68c4ec85cb55b38`, ветка
`codex/node-12-duplicates`; исправление аудитора: `ce10e177647ac27eb469832c14c6ff07e3325620`.
Все файлы source/runtime/skill/harness совпадают с этим commit. Документация
подготовки не входит в runtime и не меняет исполняемые исходники.

- Runtime: `81a65c886ba64fb72ea1ac180ea79cb674d50958a144971a2a0e14aea98b2505`.
- Harness, 239 файлов: `b73e69f020fa7a2d8b0a7c30e721d8bca940ccf6476baf1e1de1328aae94ffd0`.
- Native skill: `b9c0c5a9d09cbcc2e1f6d93dc41206f0d3837c517fcf970d4d2d787f4edf4872`.
- Adapter: `0.1.0-rc.4-acceptance`; его реализация и skill включены в runtime pin.
- Node 24.19.0, Playwright 1.63.0-alpha-2026-08-31, MCP 0.0.80, SDK 1.30.0,
  Chromium revision 1243 / 153.0.8010.12 — локальный runtime-check прошёл.

Полные mappings: [pins.json](pins.json), [source-files.json](source-files.json).
624 tracked-файла отобраны из указанного commit: клиентский inventory (386 файлов),
весь harness с goal/fixtures, executor/catalog и сборщик/публикатор каталога.
Приватный исходный архив `.dock/node12-acceptance-preparation-1/source-7bf88255.tar`,
SHA-256 `b42eaa33f903b68d88e8cbe05416fd1bd430aae181cc4d3994da199bbff8be56`.
Это исходники для VPS, не локальная production-сборка. Архив не содержит credentials,
node_modules, личных конфигов, журналов или прежних frozen exports.

## Задача и полный результат

Hermes получает существующий `tools/loginom-acceptance/goals/duplicates-node-complete.txt`
через штатный renderer и три `fixtures/duplicates/Node12-*.csv`. Имена доставки и
путь пакета renderer формирует по новому run ID. Goal содержит пользовательские
действия, параметры данных, ожидаемые группы и ограничения работы; не содержит
путей аудитора, внутренних selectors, исходных журналов или способа пройти проверки.
Независимый [expected.json](expected.json) остаётся у аудитора.

Объявленный scope не сокращён:

- Три импорта и три разметки: main10 (10×9), null8 (8×7), empty (0×7).
  Составной Key/Sub; Value/Amount сравниваются, Id сохраняется без участия.
  Полные группы и исходные типизированные строки записаны в expected.json.
- На том же main10: key-only, configure-only через «Готово», отмена альтернативных
  ролей через «Закрыть», восстановление исходных ролей и результатов.
- Штатный save_checkpoint, явно запрошенное отдельное reopening через save_as,
  сохранность шести GUID, трёх связей и ролей до повторного применения настроек.
  После открытия — новое выполнение всех трёх импортов и всех трёх разметок.
- Всего 16 node.apply; полные чтения, свежие execution identities, точные исходные
  bytes, отсутствие UI-резерва и добавленных при reopening узлов. Done/Close
  не принимаются за свежее выполнение.

Финальный независимый gate:

```sh
python3 tools/loginom-acceptance/duplicates_node_acceptance.py --run-dir "$NODE12_RUN_DIR"
```

Аудитор проверяет публичные вызовы, нативный журнал, исходные байты/типы,
конфигурацию, полный выход, граф, цепочку save/reopen, свежесть, модель,
неизменность runtime/native skill/harness и полноту экспорта. Нулевой результат
обязан иметь независимую схему из fixture плюс четыре служебных поля; ожидание
не выводится из проверяемого выхода. Номера групп могут меняться, составы — нет.
Exit Hermes или его текстовый отчёт без полного PASS не засчитываются.

Принятые типы проверки — integer/string; NULL проверяется в сравниваемом строковом
Value отдельно от пустой строки и текста `null`. NULL в ключах, boolean/real/datetime
как исходные поля не получают live/autonomous acceptance этим goal. Boolean флаги
и integer группы служебного выхода входят в обязательную схему. Нет заявления
о нечётком сравнении, удалении/выборе одной копии, конфликте служебных имён как
положительном случае или отдельной node12 live lost-reply матрице. Ранние отказы
и прежние прямые lifecycle/fault проверки остаются отдельными историческими
доказательствами; новый автономный результат на них не подменяется.

## Изоляция и запуск после stage

[launch.sh](launch.sh) закрепляет account `test-1`, storage `/test-1` и наблюдавшийся
в N12-R1 URL `http://logi-test-plan.bg.local/app/?testable=true`. Общий config сейчас
содержит другой URL; override обязателен. Общий config и установленный клиент
не изменяются. Ключ Dock читается только из существующего собственного config.

Штатный run.py создаст новый уникальный каталог `.dock/node12-autonomous/runs/<run-id>`:
`private/hermes-home`, `private/dock-state`, отдельный
`private/dock-state/sessions/<session-id>/browser-profile`. Shared browser binaries
используются только для чтения; профиль и журнал никогда не переиспользуются.
Пакет: `/test-1/packages/Dock-acceptance-<run-id>.lgp`.
Видимый браузер запускается с `--start-maximized`, viewport:null; фактический
размер окна проверяется при разрешённом запуске, сейчас браузер не запускался.

Существующая подписка `/Users/kartamyshev/.hermes`: read-only connection precheck
успешен; токены не печатались, не копировались и не обновлялись. Runner закрепляет
`openai-codex / gpt-5.6-sol / low`, запрещает fallback и независимое обновление
скопированных refresh tokens. Исходный Hermes сообщает версию 0.21.0 в файлах;
эффективная версия и доступность подписки повторно проверяются штатным preflight.

После получения настоящих значений координатор задаёт `NODE12_MANIFEST_URI` и
`NODE12_MANIFEST_SHA256`; отсутствие значений останавливает launch.sh до любых
действий. Команды из корня worktree:

```sh
bash docs/plans/loginom-dock/node12-acceptance-preparation-1/launch.sh preflight
# Только после отдельной выдачи слота:
bash docs/plans/loginom-dock/node12-acceptance-preparation-1/launch.sh run
```

Полный `launch.sh preflight` прошёл на настоящих candidate URI/SHA.
[Машинная сводка](candidate-preflight-summary.json) закрепляет SHA отчёта;
приватный отчёт — `.dock/node12-acceptance-preparation-1/candidate-preflight.json`.
Hermes --version проверен штатным preflight; сценарий/модель/браузер не запускались.
Никаких фиктивных pin и старой автономной приёмки нет.

## Передача координатору для VPS

Версия `2026.09.13-node12.1-candidate` собрана и staged координатором.
Фактические URI/SHA внесены в pins.json; production activation не выполнялась.
Следующая инструкция сохранена для воспроизводимости; повторять stage сейчас не нужно.
Координатор сначала проверяет live inventory, существующую версию, доступность
Node 24.19.0 и соответствие импортированного E2E commit/source-index. Если версия
существует, не перезаписывать: сообщить фактический pin и сопоставить состав.
При изменённом E2E не обходить отказ публикатора и не подставлять другой commit.

Передать source-архив и эту папку на VPS, проверить SHA архива, распаковать
в новый source-каталог. Запускать [build-stage-vps.sh](build-stage-vps.sh) **на VPS**:

```sh
NODE12_SOURCE=/opt/loginom-dock/releases/20260913-node12-preparation/source \
NODE12_PACKET=/opt/loginom-dock/releases/20260913-node12-preparation/packet \
NODE12_RELEASE=/opt/loginom-dock/releases/20260913-node12.1-candidate \
NODE12_NODE="$VERIFIED_VPS_NODE" \
NODE12_ADMIN=/opt/loginom-dock/config/admin.json \
bash /opt/loginom-dock/releases/20260913-node12-preparation/packet/build-stage-vps.sh
```

Это предлагаемые новые filesystem destinations, не утверждение об их наличии.
`VERIFIED_VPS_NODE` определяется координатором по live inventory, не угадывается.
Script проверяет все source hashes, использует явные compatibility 7.4.2 и
package-root `/test-1/packages`, валидирует результат, делает только stage/readback.
Публикатор отказывает при несовпадающем существующем immutable release.

Ожидаются catalog/{actions,selectors,source-index,manifest,current}.json,
build-report.json и stage-report.json. `current.json` в build — локальный output;
production pointer не переключается. Координатор возвращает фактические manifest
URI/SHA из stage/readback, полный server evidence path, подтверждение allowed_roots,
совместимости и отсутствия stale actions, затем отдельно выдаёт слот Hermes.
Client bundle/install для этой source-runtime приёмки не требуются.

## Выполненные проверки подготовки

Source preflight: 386/386 inputs совпали с commit. Runtime/dependency preflight
прошёл; 14 duplicates tests и 4 preflight tests прошли. Shell syntax обоих scripts
проверен. Дополнительно проверены отказ launch без candidate pin, отклонение
пустых доказательств полным аудитором и hashes исходного архива. Отчёты находятся
в `.dock/node12-acceptance-preparation-1/`. Live матрица и Hermes не повторялись.

Следующее действие: отдельная выдача слота после узла 11. Stage/readback и полный
preflight завершены. Merge/push/deploy/install в этой задаче отсутствуют.

## Проверенный кандидат и команда после выделения слота

Команда этапа: `node12:candidate-preflight:1:1a5a46312501d20ec7e23a2db12ed95bf34d784ead45628b12cdcf1492a276ce`.
URI: `viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node12.1-candidate/manifest.json`.
SHA-256: `1a5a46312501d20ec7e23a2db12ed95bf34d784ead45628b12cdcf1492a276ce`.
Манифест повторно прочитан зарегистрированным Dock read; SHA сырых байтов совпал.
Координатор проверил все четыре файла каталога, E2E
`2cad5602158fd2e4836d821d644a2b8d92f571a2`, отсутствие stale actions,
compatibility 7.4.2 и `/test-1/packages` у обеих операций сохранения.
Серверные доказательства: `/opt/loginom-dock/releases/20260913-node12.1-candidate/`
(`build-report.json`, `stage-report.json`, `coordinator-readback.json`).
Исправлена только инструкция validate: требуется `--stage --validate-only`;
этот режим не пишет на сервер. Пересборка не требуется.

Точная команда из корня этого worktree, **только после отдельной выдачи слота**:

```sh
NODE12_MANIFEST_URI='viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node12.1-candidate/manifest.json' \
NODE12_MANIFEST_SHA256=1a5a46312501d20ec7e23a2db12ed95bf34d784ead45628b12cdcf1492a276ce \
bash docs/plans/loginom-dock/node12-acceptance-preparation-1/launch.sh run
```

Повторять preflight с тем же output-файлом нельзя: runner защищает доказательства
от перезаписи. Разрешённый `run` создаст новый run ID; runtime/harness и подписка
проверяются заново. Существующий успешный preflight не заменяет приёмку.
