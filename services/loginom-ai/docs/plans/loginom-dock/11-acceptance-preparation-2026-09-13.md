> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-f89f0c5aab1e` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

# Узел 11: комплект автономной приёмки подготовлен

Команда: `node11:acceptance-preparation:1:91dee921e9e17343d53bf20fd7ca5f3b19f8de7a`.
Статус: **prepared / awaiting_candidate_stage_and_slot**. Единственный раунд
исправления принят координатором; повторное ревью не требуется. Этот этап
подготовил запуск и аудит, но не запускал модель, браузер или серверный stage.

## Закреплённый код и зависимости

- Ветка `codex/node-11-replacement`, код узла
  `91dee921e9e17343d53bf20fd7ca5f3b19f8de7a`, handler `replacement-v1-internal-2`.
- Runtime 155 файлов:
  `b99b922033e87b7580f14c2eec8cd0744c23bab29ee45b2548212cdac8c394ca`.
- Чистые build inputs: 389 tracked файлов коммита. Архив
  `unavailable:artifact-781959b570690ea6`,
  SHA `8fe1faca81c16291fff2b704b7f20388edb3432fe0513243a3cdb2bae632096c`,
  1017271 байт. Рядом `.manifest.json` с полным списком path/SHA/size/mode.
  Состав определяет `deploy/loginom-dock/package-client-source.py`; включает
  client, оба плагина, shared adapters, builder/publisher и unavailable:artifact-a9e850f2f3253f03.
  Непринятые изменения AGENTS.md и .gitignore, секреты, профили и .dock не включены.
- Node 24.19.0, Playwright 1.63.0-alpha-2026-08-31, Playwright MCP 0.0.80,
  SDK 1.30.0, Chromium 153.0.8010.12/rev1243.
- Hermes 0.21.0; существующая подписка `openai-codex / gpt-5.6-sol / low`.
  Preflight проверил наличие и достаточный срок токена без вывода секретов;
  перед запуском проверка повторяется, смены провайдера нет.
- Native Hermes skill `plugins/loginom-dock-hermes/skills/loginom/SKILL.md`, SHA
  `b9c0c5a9d09cbcc2e1f6d93dc41206f0d3837c517fcf970d4d2d787f4edf4872`.
- Требуемая Dock skill revision из проверенного полного source harness:
  `afa295bf48dc48da5d3c995665a06ef2190ff620bae3243d46557e0371536790`.
  Её текущий серверный readback ещё требуется; новая сессия проверит файл по хешу.
- Используется существующий приёмочный adapter `0.1.0-rc.4-acceptance`, entry
  `packages/loginom-runtime/client/bin/loginom-dock.mjs`; содержимое entry/adapter связано source pin.
  Отдельный диагностический adapter `node11-full-source-harness` не выдаётся за Hermes.

## Задача, данные и независимые эталоны

Goal: `packages/loginom-runtime/tools/loginom-acceptance/goals/replacement-node-complete.txt` содержит
только пользовательскую задачу и описание данных; нет driver-команд, manifest,
operation IDs, внутренних квитанций или инструкций построения доказательств.
При запуске подставляются только уникальные имена CSV и путь пакета.

Данные `packages/loginom-runtime/tools/loginom-acceptance/fixtures/replacement/input.csv` и
`partial-input.csv` уже tracked; их размеры и SHA закреплены в
`replacement_upload_probe.py`. Оба доставляются с проверкой исходных байтов.
Никаких fixture/expected файлов из других веток не требуется.

Объявленный scope: два импорта Main/Partial и две Замены Typed/Preserved,
четыре узла и две связи, 11 последовательных node operations:
два импорта → типизированная Замена → правило B в add → частичное правило C
без режима → replace → add → после reopening два импорта и две Замены.
Проверяется весь результат: string/Null/empty/literal null, регистр,
Int64 max, real precision0, other keep/Null/value, флаги, метки и порядок,
сохранность неперечисленных правил и конечных настроек после открытия пакета.

Эталоны полного выхода (в той же fixtures/replacement): `expected-multi.json`,
`expected-partial-before2.json`, `expected-partial-add.json`,
`expected-partial-replace.json`; правила Typed — `parameters-multi.json`.
Промежуточные и окончательные таблицы заданы заранее, не выводятся из ответа узла.
Эталоны и весь приёмочный harness фиксируются хешами в request.json.

N11-R1 refusal уже проверен отдельной прямой матрицей. Новый обычный Hermes
проверяет положительные частичные изменения и **persistence окончательной ревизии**.
Не утверждается повтор всех 19 исторических групп, long-table/empty/response-loss
или новый автономный отказ на конфликтующем запросе.

## Независимый аудит

`packages/loginom-runtime/tools/loginom-acceptance/replacement_acceptance.py` связывает:

- точный goal, данные, stage pin, модель/эффективный usage/auth guard;
- пользовательские MCP-вызовы и ответы с исходными node/save квитанциями;
- доставленные байты, полную схему и данные обоих импортов;
- объявленные параметры каждой Замены, native configuration и полный выход;
- два разных save-действия: checkpoint, затем save_as с реальным закрытием и
  reopening того же пути; новый dock_prepare должен связать свежий workflow;
- четыре узла/две связи, сохранённые GUID, настройки и новые выполнения после
  reopening. Для Замен после открытия параметры и mappings должны быть пустыми;
- неизменные runtime/harness/native skill, отдельный профиль и session metadata.

Компонент `replacement_persistence_evidence.py` остаётся честно помеченным как
диагностический: его PASS сам по себе не даёт автономной приёмки. Новый внешний
аудитор требует дополнительно обычный успешный Hermes и все публичные связи.
`subplan_complete=false` до решения координатора, даже если весь аудит пройдёт.
Положительного полного автономного экспорта ещё нет; его нельзя заменить моками.

## Изоляция и команды на Mac

Локальный запуск выполняется из этого worktree. Его `run.py` создаёт уникальный
`unavailable:artifact-8e78cd45fadf6e0f<run-id>/private/hermes-home` и `dock-state`;
браузерный профиль — `dock-state/sessions/<session-id>/browser-profile`.
Каждый запуск имеет отдельные auth-copy/cursor/evidence. Dock читает только
явный `unavailable:artifact-f77afb35dfa1513e`, Hermes — существующую `.hermes` подписку.
Личная OpenViking память не подставляется в Dock. Shared hooks не перенастраиваются.
Loginom account **test-2**, storage **/test-2**, конечный путь
`/test-2/packages/Dock-acceptance-<run-id>.lgp`; оригинальные пакеты не затрагиваются.

```sh
python3 packages/loginom-runtime/tools/loginom-acceptance/replacement_launch.py --preflight \
  --output unavailable:artifact-703a2925216030d9
```

После stage/readback и явного слота координатор передаёт `candidate-pin.json`
с реально вычисленными `manifest_uri`, `manifest_sha256`, `save_revisions`,
`staged:true`, `readback_verified:true`, `activated:false`, `code_commit` и
`runtime_revision` из этого отчёта. Сейчас этого файла намеренно нет.
Команды следующего этапа (обязательные аргументы без значений вызывают отказ):

```sh
python3 packages/loginom-runtime/tools/loginom-acceptance/replacement_launch.py --run \
  --candidate-pin "$node11_candidate_pin" --slot-id "$node11_slot_id"
python3 packages/loginom-runtime/tools/loginom-acceptance/replacement_acceptance.py \
  --run-dir "$node11_run_directory" --candidate-pin "$node11_candidate_pin"
```

Обычный запуск включает `--skills loginom`, только Dock toolset, Sol/low,
100 ходов/3600 секунд, без fallback. Эти пределы не являются разрешением на повтор.
При отказе вернуться к Codex-диагнозу до нового прогона. Visible launch уже
закреплён `--start-maximized`/viewport:null; фактические размеры нового окна
нужно подтвердить после запуска. В этом этапе браузер не открывался.

## Серверный build/stage — только координатор

Предлагаемая уникальная версия **2026.09.13-node11.1-candidate**.
Существование версии на сервере здесь не проверялось. Не перезаписывать:
при уже существующей версии получить фактический pin/readback и сообщить его.
Publisher создаёт только отсутствующие файлы, отклоняет несовпадающие байты,
полностью читает их обратно; одинаковая существующая версия не перезаписывается.

Передать source archive, его manifest и tracked
`packages/loginom-runtime/tools/loginom-acceptance/replacement-stage-vps.sh` в отдельный серверный inbox.
На VPS проверить доступный Node 24.19.0 и передать его абсолютный путь третьим
аргументом; путь VPS Node не выдумывается. Точная команда с выбранным новым build-dir:

```sh
sh replacement-stage-vps.sh \
  client-source-91dee921.tar.gz client-source-91dee921.tar.gz.manifest.json \
  "$node11_vps_node" /opt/loginom-dock/releases/20260913-node11-1-91dee921
```

Скрипт проверяет archive SHA/полный source manifest, отказывается использовать
существующий build-dir, распаковывает source и запускает существующий builder:
`--candidate --version 2026.09.13-node11.1-candidate --package-root /test-2`.
Отдельный compatibility: profile `loginom-7.4.2-macos-chromium-ru`, build7.4.2,
macos/chromium; исходный profile7.5 намеренно не наследуется.
Затем publisher `--stage --validate-only`, после него `--stage` на штатном
`http://127.0.0.1:1933` с `/opt/loginom-dock/config/admin.json`. Ключ не печатается.
Ни activation, ни сборка/установка общего клиентского релиза не выполняются.

Ожидаемые артефакты: source-manifest.json, compatibility.json,
catalog-build-report.json; `catalog/{actions,selectors,source-index,manifest,current}.json`;
stage-report.json. E2E commit должен остаться
`2cad5602158fd2e4836d821d644a2b8d92f571a2`; публикация сама проверяет серверный
source manifest E2E. Save roots должны стать ровно [/test-2], обе save revisions
ожидаются `2`, но фиксируются по фактическому staged actions.json.
`current.json` в build — локальное описание кандидата, production current не меняется.

Manifest URI/SHA, action/selector hashes берутся **только из stage и readback**.
В комплекте нет фиктивного manifest SHA или утверждения, что предложенный URI существует.

## Что проверено и что остаётся

28 source-only тестов PASS: acceptance runner, destinations, runtime pin,
subscription и новый контракт задачи. Реальный preflight PASS без запуска
модели/MCP/браузера. Source archive verified, build inputs совпали с commit.
Синтаксис VPS-скрипта проверен; сам VPS build/stage не запускался.
Аудиторы повторно проверены на сохранённых файлах: 7 групп PASS, 18/18 подмен
отклонены (12 typed + 6 persistence). Это регрессия компонентов, не новый live-run.

Локальные результаты: `unavailable:artifact-0dd613e0e682e8cd`:
source-preflight.json, preflight-complete.json, auditor-components.json,
preparation-tests-complete.log, source archive и manifest. Сводка:
[replacement-acceptance-preparation-2026-09-13.json](../../loginom-dock/replacement-acceptance-preparation-2026-09-13.json).

Остаются: проверенный серверный candidate/skill readback, слот, свежий preflight
подписки, обычный Hermes, фактическое окно и независимый аудит всей задачи.
Старое `persisted_content_verified:false` исправления не превращено в true.
