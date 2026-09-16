# Node17 готов к полному запуску Hermes

Реальная user-v1 проверка `20260913-161159-ac299abe` прошла независимый аудит:
аккаунт test-2 и закрытие меню, source5×3, baseline124, terminal reject без
execution, сохранность baseline через одно скачивание, один настоящий replace
и новый результат 124 байта. Observer занял 1806.90 мс; observer вместе с replace
— 19247.08 мс. Проверены public wire/projection, журнал и actual-dispatch=1,
новый execution, origin, code, bytes и владелец. Отклонены 9 подмен baseline,
12 origin, 24 native proof и 5 public projection (всего 50).
Сессия `471ffb36-5df7-41cf-996a-41aba9628e62` закрыта; собственных PID нет,
global config не изменился. Исторический CLI tag runner сохранён; отдельный
current-authorization.json связывает новую попытку с уточнением автономии.

Существующая проверка готовности теперь использует уже подтверждённое текущее
скачивание вместо устаревшего observer pin; проверяет hashes исходных evidence,
неизменный runtime/observer, граф и свежие байты. Реальный user-v1 replace
проверен прежним полным component auditor. Дополнительной стадии допуска нет.
Manifest разрешает запуск полного задания; **это не full-goal PASS**.
Старые FAIL и диагностические остановки сохранены без изменения.

20 Python-проверок прошли при подготовке. Ранее текущий observer прошёл 30 Node
проверок; его код в этой попытке не менялся. Штатный read-only preflight прошёл:
Hermes0.21.0, существующая подписка, openai-codex/gpt-5.6-sol/low, без fallback,
refresh/import и запуска модели. Перед фактическим запуском повторяется штатная
проверка auth/pins; ошибки не разрешают сменить модель.

Source handler: `2524921058b29db0e79e9a188ec7bb8fa9ef9d8c`.
Runtime155: `347615cbae29323d80b57488b794ecce607b5b9e0d2fbe86aa88b7460241311c`.
Harness281; manifest: `bdaea73bf339f48249b2bc539756ff03d9282c725803d846fcb374caaee7f8e5`.
Цель не сокращена: 22 node operations, три доставки, все save/reopen.
Свободно примерно 83.4 GiB.

## Полный запуск после выделения единственного Hermes-слота

Рабочая директория: `/Users/kartamyshev/Git/loginom-dock/.worktrees/node-17-text-export`.
Точная команда (пока не выполнялась):

```sh
python3 /Users/kartamyshev/Git/loginom-dock/.worktrees/node-17-text-export/tools/loginom-acceptance/run.py --run --goal text-export-node-complete --model-profile chatgpt-sol --runs-root /Users/kartamyshev/Git/loginom-dock/.worktrees/node-17-text-export/.dock/node17/acceptance/runs --node /Users/kartamyshev/.loginom-dock/releases/0.1.0-dev.20260910.3-80ca61417ec7/runtime/node --hermes-home /Users/kartamyshev/.hermes --hermes /Users/kartamyshev/.local/bin/hermes --hermes-python /Users/kartamyshev/.hermes/hermes-agent/venv/bin/python --hermes-source /Users/kartamyshev/.hermes/hermes-agent --dock-config /Users/kartamyshev/.loginom-dock/config.json --browsers /Users/kartamyshev/.loginom-dock/runtime/browsers --loginom-user test-2 --loginom-url 'http://logi-test-plan.bg.local/app/?testable=true' --storage-directory /test-2 --manifest-uri viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node11.2-candidate/manifest.json --manifest-sha256 bb2fe2207e01d594108efb591d1c25036adc12f67168ef895dfde755d391ac2a --timeout 3600 --max-turns 100
```

Выполнить полный goal: типизированный CSV, Unicode/кавычки/переносы/NULL,
wide40 TSV/BOM/CRLF, header-only и настоящий zero-byte файл, изменение формата,
reject/replace, Done/Close, сохранение, явное переоткрытие и destination-only
повторное выполнение сохранённых узлов. В конце повторное сохранение пакета.
После Hermes я проверяю реальные usage/receipts/публичные ответы, а не exit0.
Затем в отдельной новой owned test-2 сессии переоткрываю итоговый пакет,
выполняю сохранённые источники/Empty, четыре destination-only экспорта и
полное read-only inventory отсутствия Done/Close-файлов. Итоговый
`text_export_acceptance.py --run-dir RUN --external-dir FRESH` должен принять
все требования. До этого полный результат остаётся pending.

Следующий триггер — координатор выделяет свободный Hermes-слот. Новые узлы,
main/merge/push/deploy/общий plugin не запускались. Причина исторического
отказа скачивания остаётся неизвестной; два последующих живых скачивания,
включая реальный replace, прошли, неизменный неуспешный прогон не повторялся.

[Component audit](17-text-export-user-v1-component-success.json),
[точные pins, preflight и аргументы](17-text-export-ready-for-hermes.json).
