> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-0ac8ff273e1e` и изменения: [происхождение](../../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../../docs/node-development/README.md).

> 13 сентября: отдельный пересмотр неизменного run20260913-072904-3cc4ad0e
> verifier identity-import-v1 прошёл **122/122**. Исходный frozen **FAIL112/118** сохранён.
> Нового Hermes run не было; production/goal не менялись. Отчёт:
> `services/loginom-ai/docs/plans/loginom-dock/node12-identity-auditor-followup-1/README.md`.

# Узел 12 — комплект кандидата после точечного follow-up

Последний результат: **автономная приёмка FAIL112/118**, run `20260913-072904-3cc4ad0e`.
[Причина, проверки и ограничения](attempt-20260913-072904.md). Предыдущий preflight PASS
подтверждал допуск к запуску, а не завершение приёмки.

## Допуск кандидата 12.2 — 13 сентября 2026

Новый preflight **PASS**, зарегистрированное Dock MCP прочитало настоящий manifest;
его SHA `d0c9a5bedc170754dd251c982508e0ad8568d300091eda0027962c496df62adf`
совпал с серверными байтами. URI:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node12.2-candidate/manifest.json`.
Координатор выполнил VPS build/stage/readback; activated:false. Реальные pins
сохранены в pins.json и [новой квитанции](candidate-preflight-2.json).

Проверены 153 runtime, 243 harness и 386 source build inputs, goal и native skill.
Штатный launch.sh preflight прошёл: Hermes0.21.0, существующая подписка
openai-codex/gpt-5.6-sol/low, без обновления токенов и fallback.
Отдельный штатный check-tools.mjs прошёл initialize/list_tools: все11 обязательных
инструментов доступны. Первая диагностическая попытка была отклонена из-за прав
0755 на собственной state-папке; после приведения к штатным0700 проверка прошла.
Исходная квитанция отказа сохранена; код и ограничения защиты не изменялись.

Preflight receipt: `unavailable:artifact-97ae52a854a5a31f`.
MCP и серверные подтверждения: `unavailable:artifact-89125475dabda27d`.
Эти preflight receipts не перезаписывать. Source archive/source-files.json описывают
неизменный source commit0e11a3fb; документальные pins не входят в runtime/harness
или source build input map, пересборка исходного архива не требуется.

Ни модель, ни браузерные действия не запускались. Реальная usage identity,
геометрия окна и полный16-operation goal проверяются только в новом автономном run
после отдельного слота координатора. Прежний FAIL103/112 сохраняется.

Ниже — исторический отчёт follow-up до серверной сборки; его указания «ещё не stage»
относятся к тому завершённому ходу, а актуальный допуск приведён выше.


Команда `node12:acceptance-followup:1:cc24a1f5e07f78076c901965a028b67858272754`.
Исправление было закоммичено: `0e11a3fb24ca40a9f855008d2b0d1856d6f771ad`.
Прямой native-аудит Codex **34/34 PASS**, проверка параметров **6/6 PASS**,
**13/13** отрицательных подмен отклонены. Автономная приёмка ещё не выполнена;
Hermes в этом follow-up не запускался. Новый stage и слот закреплены за координатором.

## Подтверждённые причины и исправления

После подтверждения перезаписи файловый диалог исчезает раньше, чем завершается
обработчик «Сохранить как» и закрывается его меню. На собственном черновике
`/test-1/packages/Node12-followup-save-20260913.lgp` прямое наблюдение за DOM
зафиксировало file=[] при всё ещё видимых MainMenuForm и его маске; затем исчезли
меню и маска. Снимок `ui-7.json` содержит явный `atDialogHidden.menuVisible:true`.
Два диагностических observer-а оставили разные относительные шкалы времени;
их смешанные абсолютные ms не используются как общий таймер.

В старом runtime save_as после исчезновения диалога снова нажимал кнопку меню:
переход мог закрыть ещё видимое меню перед разрешением `packages.close`.
Ожидание завершения нативного save-flow уже существовало для save_checkpoint.
Оно перенесено в общую часть `runPackageSaveAs`, до разделения keepOpen/reopen.
Таймаут не увеличен, повторные клики не добавлены, locks не снимаются. Новый
регрессионный тест моделирует toggle меню и его задержанное закрытие после overwrite.

По persisted imports первоначальное объяснение «мастер отсутствовал» уточнено:
в старом run были begin_wizard и confirm_wizard_deactivation. При ожидаемом
reopened_package это неверная цепочка: фактического открытия пакета не было,
узел оставался выполненным. `settings:{}` само по себе не являлось дефектом.
Общий низкоуровневый existing_import_evidence не ослаблен и не изменён.
Новый composite `verify_persisted_import` сначала проверяет настоящую цепочку
save/close/open и публичную новую привязку пакета, только затем исходную
конфигурацию, source identity/bytes, свежий execution и полный результат.
Никаких дополнительных запросов открытия мастера обычному Hermes не добавлено.
При отсутствии достаточных нативных наблюдений настроек остаётся FAIL.

Отдельная диагностическая проверка параметров сравнила сырые UI-наблюдения
источника, формата и всех колонок после настоящего открытия с ожиданием,
независимо построенным из трёх fixture. Она не использует значения из проверяемого
output как expected. Неверный ожидаемый Null-маркер отклонён для каждого набора.

Излишнее sample_rows==10 заменено проверкой достаточной ёмкости запроса,
точных total/returned/sample counts, полной ширины, отсутствия усечения/фильтра
и совпадения execution IDs. Нативные schema/values проверяются отдельными
независимыми аудиторами. Полная таблица из 8 строк принимается с ёмкостью 8 или10.

Отрицательная проверка выявила дополнительный пробел persisted-import projection:
подмена имени поля итоговой схемы не отклонялась старым низкоуровневым читателем.
В новом composite добавлено точное сравнение name/label/type/data_kind с
независимой исходной схемой, в том числе при 0 строк. N12-R1 для Duplicates
не изменялся, его независимое ожидание четырёх служебных полей сохранено.

## Живые доказательства и границы

Сессия `fbb98fee-183b-4330-8fb9-2a23a61f9248`, собственный аккаунт `test-1`,
Loginom7.4.2, URL `http://logi-test-plan.bg.local/app/?testable=true`.
Пакет `/test-1/packages/Node12-followup1-native-20260913.lgp` создан в новом
source harness. Старый failed пакет не изменялся. Использовался staged каталог
node12.1 только как диагностический каталог; это не приёмка нового кандидата.

Три импорта и три разметки: main10/null8/empty. Штатный save_checkpoint прошёл,
save_as replace подтвердил overwrite, save_flow_completed, saved_package_closed,
package_open_command_ready, reopened_package_observed и postcondition_verified.
После отдельного dock_prepare(open_package) все шесть прежних GUID выполнены
заново. Импорты переданы с settings:{}, роли разметки сохранились, outputs
10×9/8×7/0×7 и исходные 10×5/8×3/0×3 проверены полностью. Граф — 6 узлов/3 связи.

34 native gates включают обе цепочки сохранения, новое package/workflow binding,
доставку и байты всех CSV, настройки, полную схему/значения и свежие выполнения.
Отдельный параметрический аудит — 3 положительных и 3 отрицательных проверки.
13 подмен: missing close, missing open preparation, foreign package/source,
changed settings request, explicit truncated flag, incomplete sample, wrong count,
short rows, changed schema/value, old execution, different source bytes.
Все отклонены на отдельных копиях, исходные evidence не изменялись.

Приватные артефакты `unavailable:artifact-957732117fe7a993`:
`native/native-audit.json`, `native/negative-audit.json`,
`native/settings-diagnostic-audit.json`, `native/evidence.json`, `ui-7.json`;
воспроизводимые diagnostic scripts — рядом. SHA перечислены в
[followup-summary.json](followup-summary.json).

Прежний run `20260913-060514-47b236af`: hashes request/evidence/attempt/original audit
проверены и неизменны. Повторная проверка новым аудитором сохранена отдельно
в `old-run-reaudit-final.json`: четыре full_read отказа устранены, но три
persisted-import gates, save_chain и all_gates_present остаются FAIL.
Новый frozen PASS ему не присваивается.

524 Python tests PASS. Клиент: 1404 PASS / 1 SKIP. Первый запуск клиентских tests
в sandbox получил listen EPERM у межпроцессных блокировок; полный повтор с
разрешёнными локальными сокетами прошёл. Diff/shell syntax/source archive проверены.
Диагностические browser contexts закрыты; зависший при закрытии собственный UI
CLI PID57616 завершён адресным SIGTERM. Финальный process-check пустой.
Чужие процессы, clipboard/server locks, routing, credentials не менялись.

Scope остаётся integer/string, NULL в Value отдельно от пустой строки и текста
null; boolean/real/datetime как входные поля, NULL keys, отдельная live lost-reply
матрица не объявляются проверенными. Полного повторного review не было.

## Новые pins и воспроизводимый вход VPS

- Source `0e11a3fb24ca40a9f855008d2b0d1856d6f771ad`.
- Runtime,153 inputs: `1459a3d10e84a0f4742933f68333cb5843f27347b0062656d090a306446e4248`.
- Harness,243 inputs: `b8d5b9ced1725cbbb64da0d92d93a74cd2f90bf9b8f8ff0efbf1a4a2f434b9d3`.
- Goal unchanged: `eeb7594606862826a86e21c9defeaa9bd30ecccade23177b4be26b1438bbcb78`.
- Native skill unchanged: `b9c0c5a9d09cbcc2e1f6d93dc41206f0d3837c517fcf970d4d2d787f4edf4872`.
- Adapter будущего обычного Hermes: `0.1.0-rc.4-acceptance`; diagnostic adapter
  `node12-followup-1` указан в живой сессии отдельно.

628 tracked-файлов ровно из source commit собраны в исходный архив
`unavailable:artifact-300dc5eec9bc3af1`, SHA-256
`39876dd6a497762bf1ea2f8626d6d3dde2b2c279c564f964448c3adec4939192`.
Все извлечённые members сверены с source-files.json. Client source preflight:
386/386 inputs соответствуют commit. Это исходный архив, не локальная сборка.

Предложенная новая версия `2026.09.13-node12.2-candidate`. На VPS она не проверялась
и не создавалась этим ходом; manifest URI/SHA пока null в pins.json. Координатор
проверяет существование версии и live E2E/inventory. Существующее не перезаписывать.
Передать архив и эту папку в новые private VPS directories, проверить SHA,
распаковать source и выполнить на VPS:

```sh
NODE12_SOURCE=/opt/loginom-dock/releases/20260913-node12-preparation2/source \
NODE12_PACKET=/opt/loginom-dock/releases/20260913-node12-preparation2/packet \
NODE12_RELEASE=/opt/loginom-dock/releases/20260913-node12.2-candidate \
NODE12_NODE="$VERIFIED_VPS_NODE" \
NODE12_ADMIN=/opt/loginom-dock/config/admin.json \
bash /opt/loginom-dock/releases/20260913-node12-preparation2/packet/build-stage-vps.sh
```

Script проверяет source hashes и Node24.19.0, задаёт compatibility7.4.2 и
`/test-1/packages`, делает `--stage --validate-only`, затем stage/readback.
Ни activation, ни обновления current/shared client нет. Ожидаемые outputs:
catalog/{actions,selectors,source-index,manifest,current}.json,
build-report.json и stage-report.json. Пути выше предложены, не заявлены live.

После получения проверенных новых NODE12_MANIFEST_URI/NODE12_MANIFEST_SHA256:

```sh
bash services/loginom-ai/docs/plans/loginom-dock/node12-acceptance-preparation-2/launch.sh preflight
# Только после отдельного нового слота:
bash services/loginom-ai/docs/plans/loginom-dock/node12-acceptance-preparation-2/launch.sh run
```

Сохраняются обычный goal duplicates-node-complete целиком (16 операций),
существующая ChatGPT-подписка openai-codex/gpt-5.6-sol/low без fallback,
изолированные HOME/browser/session, test-1 и `/test-1/packages`.
Прежние candidate pin/автономные доказательства не переносятся на новый runtime.
Merge/push/stage/deploy/activation/shared plugin в этом ходе не выполнялись.
