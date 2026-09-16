# Изолированная сборка candidate Node14 на VPS

Выполняет координатор после проверки отсутствия версии
`2026.09.13-node14-test4.1-candidate`. Исполнитель Node14 не публикует её.
Источник каталога — ровно `c32a5d5e163fe174afba59abce973ac405742cdc`.
`build_packet.py` создаёт tar только из одиннадцати tracked файлов: два штатных
скрипта, четыре JSON каталога, capability-abi.json для publisher и четыре модуля зависимостей. Секреты, профили,
.env, node_modules, рабочая .dock и незакоммиченные файлы не включаются.

Создание/проверка пакета на Mac (новый, несуществующий каталог):

```sh
python3 tools/loginom-acceptance/node14/build_packet.py --out .dock/node14-acceptance-packet-v2
```

Передать `catalog-source.tar` и `source-manifest.json`. На VPS в выделенном
пустом каталоге сверить SHA архива с manifest и все одиннадцать файлов после извлечения.
Не извлекать поверх checkout/production. Убедиться, что manifest.json и остальные
файлы новой immutable версии отсутствуют в Dock. Частично существующая версия
требует разбора координатором; новую версию не выбирать молча.

В каталоге извлечённых исходников задать отдельную совместимость:

```sh
python3 - <<'PY'
import json
from pathlib import Path
p=Path('node14-compatibility.json')
with p.open('x') as f:
 json.dump(dict(profile_id='loginom-7.4.2-macos-chromium-ru',loginom_build='7.4.2',platform='macos',browser='chromium'),f,indent=2)
 f.write('\n')
PY
node deploy/loginom-dock/build-action-catalog.mjs --input executor/catalog --out node14-build --candidate --version 2026.09.13-node14-test4.1-candidate --package-root /test-4 --compatibility node14-compatibility.json --loginom-build 7.4.2
python3 deploy/loginom-dock/publish-action-catalog.py --build node14-build --stage --validate-only
```

`node14-build` должен быть пустым/отсутствовать. Node 24.19.0; Python стандартной
библиотеки достаточно. Build выполняется на VPS; локальная сборка не заявляется.
Проверить в результате оба save actions: allowed_roots строго `["/test-4"]`,
node.add допускает `preprocessing.data_recovery`, все три JSON и manifest имеют
E2E `2cad5602158fd2e4836d821d644a2b8d92f571a2`, статус candidate, нет stale actions.
Проверить profile/platform/browser/build, локаль будущего сеанса ru.

После успешной валидации координатор использует собственный установленный путь
admin-файла (не передаёт его в пакет/логи):

```sh
python3 deploy/loginom-dock/publish-action-catalog.py --build node14-build --stage --admin "$NODE14_ADMIN_FILE" --endpoint http://127.0.0.1:1933 --report node14-stage-report.json
```

Переменная NODE14_ADMIN_FILE должна быть выбрана из актуального operations/live
состояния координатором. Штатный publisher сверяет импортированный E2E и все
хеши зависимостей, затем читает обратно immutable bytes. `--activate` не применять.
Созданный builder файл current.json — локальное описание; на сервер его не
переключать. Сохранить серверный current до/после и подтвердить неизменность.

Вернуть в исходную задачу полный stage-report, реальные manifest URI/SHA,
actions/selectors/source-index SHA и manifest.compatibility. Плановый URI —
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node14-test4.1-candidate/manifest.json`;
до серверного readback его существование и SHA не считаются подтверждёнными.
После этого отдельно разрешаются native save test-4 и полный candidate preflight.

Исходный10-file архив сохранён как evidence: builder import прошёл, но publisher
не нашёл executor/capability-abi.json до validation/stage. Версия2 включает ABI
из того же c32a5d5e; проверяется также publisher --help/import после извлечения.
