# #74: решения, оставшиеся владельцу

## B1. Автономная исходная edit-фикстура, задача 7

На clean candidate `bbd2e1af7df3e5deda2ea4604f9bec879ef4b2b8` настоящий CLI (`openai/gpt-6.1-sol`, `xhigh`, подтверждены по БД) не смог создать автономный источник строк. Карточка `programming.javascript` объявляет один вход и `catalog_add_available:false`; создание с `inputs:[]` отклонено как `NOT_APPLIED`, `REQUEST_REJECTED`, `Invalid parameters.inputs`, `effect_possible:false`. Проверка кода подтверждает обязательный вход нового узла: `packages/loginom-runtime/client/lib/javascript-parameters.mjs:17–19`. Другого поддерживаемого автономного генератора в node registry нет. Повтор того же запроса не исправит контракт.

Source `.lgp` и CSV не созданы. Требование автономности не ослаблено; Unit.xml вручную не создавался, внешний CSV не подставлялся. `local-lgp-edit`, оба routing transitions и их acceptance пока не готовы. Остальные независимые проверки продолжаются.

Рекомендуемый вариант для решения владельца: разрешить подготовить первоначальный автономный источник штатным интерфейсом через browser MCP, затем проверить/доработать и сохранить окончательный source настоящим candidate CLI. Это меняет только способ авторства исходной фикстуры, не продукт; ориентир — отдельный цикл проверки источника и cold rerun (около 1–2 часов, осуществимость ещё не подтверждена).
Альтернатива: отдельная задача на поддержку автономного источника в runtime. Она расширяет продуктовый контракт; оценка требует самостоятельного исследования и не входит в #74. Простая замена на внешний CSV нарушила бы согласованную автономность и здесь не выполнена.

## B2. Сохранённый guard неудачной source-попытки

После отказа источника пакет не был сохранён. Штатная политика `last_confirmed_own_save` вернула `BLOCKED / CONFIRMED_SAVE_REQUIRED`; приватный runtime завершился exit1 без успешного ACK, CLI сообщил `LOGINOM_HOST_CLEANUP_FAILED` и сохранил `.writer`. Browser/client закрыты по stage evidence; это не подтверждает native package cleanup. Guard и профиль не удалялись и не считаются пригодными к повторному использованию.

Skill [loginom-eval-case](/home/kiselev/git/agent-validation/.agents/skills/loginom-eval-case/SKILL.md) требует: «Коды 3 и 4 и оставшийся `.writer` — остановиться и спросить пользователя». Source-маршрут остановлен; согласно поручению об автономной работе блокер сохранён здесь. Оба собственных контейнера неудачной попытки остановлены; storage/backups и Docker state сохранены в task temp (`source-stand-stopped.json`), guard на месте. Независимый CSV-кейс использует другой stand/profile. Такой запуск не подтверждает восстановление старого профиля.

Evidence: `/home/kiselev/storage/tmp/local-paths-74-ptufs123/task7/`: `source-capability-refusal.json`, `work/source-authoring/edit-source/attempt-1/{events.jsonl,summary.json,stderr.txt,exit-code}`, `profile/loginom/runtime/generations/1/chats/*/attempts/*/{saved-package-cleanup.json,resource-close.jsonl}`, `profile/loginom/runtime/runtime-close-2711824-0ac99529-9631-41e2-b5f4-fbdbcb894c68.json`. Секреты и raw logs в Git не включены.

## B3. Isolated harness требует имя общей Docker-сети

Чистый выделенный сервер/Studio без mounts, Python отключён, marker/container ID/корни совпали; alias `loginom-server-7.4.2-test` находился в собственной сети `local-paths-74-csvref-34b87111`. Штатный `checkIsolatedLoginom` завершился exit2: «Изолированный Loginom требует network alias loginom-server-7.4.2-test в loginom-net для Studio». `evals/src/preflight.ts:76–79` проверяет именно ключ Networks["loginom-net"], поэтому private namespace не принимается. Модель не запускалась; пустые собственные preflight-контейнеры и сеть удалены, receipt сохранён.

Решение владельца: либо отдельно уточнить контракт preflight для проверенной собственной сети, сохранив container/marker/no-bind/Python/alias гарантии (ориентир: 3 файла, около +70/−10 с тестом и инструкцией; требует проверки реального маршрута Studio), либо назначить эксклюзивное окно общей сети с согласованной остановкой её сервисов. Самостоятельно добавлять дублирующий alias в общую сеть опасно для других Studio; этого не делали. Обход guard и неизолированный benchmark не выполнялись. Routing acceptance использует другой штатный runner и от этого отказа не зависит.

Evidence: `/home/kiselev/storage/tmp/local-paths-74-ptufs123/task8/benchmark-preflight/{stand.json,result.log,receipt.json}`. База candidate — `bbd2e1af7d`, код preflight не менялся.

## B4. Приватная загрузка перед default-save: диагностика

Отдельный natural CLI prompt без output path на prod candidate `9cb57e9cd9` использовал подтверждённый routing-пакет по внешнему пути `/inputs/Пакет для доработки #74.lgp`. Снимок 8450 bytes/SHA `0a7fc71707ccd45befd00f9826f7f2cd44d12ca5e4e2ac71ca1faf9729577e5d` принят; серверное имя корректно содержит `_74`. Native upload после подготовки директории занял оставшиеся около95с общего100с deadline и вернул `BROWSER_CALL_UNCERTAIN`; открытие и переименование не выполнялись. Проверка точного destination и prefix1323f586 на собственном сервере после отказа не нашла файла. Причина пока не установлена; связь с кириллицей/именем/нагрузкой не доказана.

CLI честно сообщил отказ и неизменность локального файла. Runtime cleanup `CLEANUP_OR_OPERATION_UNCONFIRMED`, exit1/no ACK, `.writer` сохранён; собственных процессов не осталось. Контейнер `local-paths-74-default-save-9cb57e9cd9` остановлен и сохранён, профиль не переиспользуется. По правилу skill о retained guard дальнейший модельный прогон этого маршрута остановлен; сейчас допустимы чтение сохранённых evidence/кода и независимое review. Таймауты и проверки upload не ослаблены, контрольного скачивания продукт не делал. Если дешёвая проверка не установит исправимый дефект, применяется точка решения задачи1; механизм не наращивать.

Evidence: `/home/kiselev/storage/tmp/local-paths-74-ptufs123/task8/default-save/{run.json,evidence/result.json,evidence/events.jsonl,evidence/runtime/**/execution-events.jsonl,evidence/runtime/runtime-close-281-e66e79cf-8e02-471d-8c72-4ee6f5529cc3.json}`. Selected routing4/4 на Desktop и prodCLI завершены независимо; B4 относится только к отдельному default-save.

Дешёвая диагностика завершена: независимый signal collector подтвердил одинаковый source и синтаксически корректную сборку browser code в успешном task3 bundle, prod candidate и текущем source. Отказ один, классификация FAILED/UNKNOWN; причину зависания и flaky-поведение установить нельзя. В runtime сохранился только console log с предупреждениями Ext; исходное execute-исключение заменено общим catch. Guard не обходили, контейнер не запускали повторно. Собственный сервер/Studio остановлены с копиями UserStorage/SessionBackup и Docker state; остальные сервисы не менялись.

Рекомендуемое решение владельца — разрешить один ограниченный нативный source-прогон на новом stand/profile с сохранением первичной ошибки и browser receipt до catch; ориентир 1–2 часа с подготовкой и разбором. Текущий guard остаётся нетронутым. Если он подтвердит недостаточность read-only completion, выбрать вариант точки решения задачи1: контрольное скачивание через существующую проверку или draft/delivery-маршрут с отдельной оценкой. Сейчас отсутствующий destination нечего проверять скачиванием; такой fallback без установленной причины не добавлялся. Механизм и таймауты не наращивались.
