# Построение → документация: installed candidate49

CLI: три логических повтора прошли mechanics, проверку графа, PDF facts/layout
и independent cold replay. Desktop: три повтора mechanics/graph/PDF QA прошли;
cold replay: один PASS, два readonly FAIL; переход Desktop3/3 не принят. Это отдельный переход, не закрытие
всей scenario/multiturn матрицы, этапов5–8 или A/B.

Испытуемый product SHA `49b1584f23b4aa47e18b26119389d6f45623fc94`,
установленный CLI0.1.17/AppImage из сохранённых полных artifacts.
Модель `openai/gpt-6.1-sol`, variant `medium`.
Точная команда/conditions и receipts лежат в собственном приватном
`/home/kiselev/.local/share/loginom-ai-agent-acceptance/package-docs-20261006`.

## CLI: три повтора

- Логические1/2: `openai-49-cli-docs-after-build-journals-20261008`;
  попытка2 восстановлена после пользовательской паузы в отдельный evidence.
- Логический3: `openai-49-cli-docs-after-build-third-20261008`, physical1.
  Conditions совпадают, кроме `repeat=3` → `1`; исходные receipts не переименованы.
- Каждый построенный пакет: реальные import/group nodes и одна связь;
  совпадение GUID, исходного `.lgp`, документационного attachment и SHA после
  обработки. Документные ходы: browser execs0; все шесть страниц PDF просмотрены.
- Internal journals до/после документационного хода попарно совпали по bytes
  и SHA256. Это отдельное доказательство сохранности runtime evidence.
- Cold1/2: `cold-49-cli-docs-after-build-20261008`. Cold3 первоначально
  отклонён `COLD_PACKAGE_NOT_WRITABLE`; own readonly view закрыта/logout,
  source/input не изменились, оставшихся процессов нет, container removed.
- После отдельного наблюдения native ReadOnly=false на точном собственном
  пакете cold3 выполнен в `cold-49-cli-docs-after-build-recheck-20261008`.
  Исходный FAIL сохранён. Владелец и причина освобождения writer не установлены;
  чужие блокировки не снимались. Повтор не заменяет первоначальный результат.
- Все три независимых cold: Alpha35/Beta20, owner/execution подтверждены,
  settingsReapplied=false, package/input byte-identical, native close/logout,
  remaining0, own containers removed. Модель/судья/Help в cold не вызываются.

Итог `cli-docs-after-build-three-review-20261008/review.json`:
`MECHANICS_GRAPH_PDF_QA_COLD_PASS_3_OF_3`. Manifest SHA256:
`e52333a18ab71d2e705fc808f533e9281c1cde9716b174de3db60fafa0418bd8`.
Controllers cold/lock observation сохранены рядом с review.
Warm server logout отдельно не подтверждён; cold подтверждает только свои сессии.

## Desktop: открытая часть

`openai-49-desktop-docs-after-build-20261008`: native AppImage GUI/onboarding
и backend HTTP, три двухходовых повтора штатно завершились exit0.
Документные ходы browser execs0, attachment unchanged; два реальных узла и
связь подтверждены package-proof. Каждый PDF содержит две страницы, все шесть
страниц просмотрены: факты, граф и основные настройки соответствуют пакету,
layout PASS. Полный аудит всех настроек этой проверкой не заявляется.

Evidence QA: `desktop-docs-after-build-qa-20261008`; сохранены render receipts,
review и manifest. Internal journals собраны в конце попыток; попарная
байтовая неизменность warm/docs, проверенная для CLI, для Desktop не заявляется.
Independent cold: попытка1 PASS (Alpha35/Beta20, settingsReapplied=false,
bytes unchanged, close/logout/remaining0/container removed). Попытки2/3
отклонены COLD_PACKAGE_NOT_WRITABLE, source/input SHA не изменились,
own readonly view close/logout и remaining0 подтверждены; containers removed.
Для попытки2 отдельное native observation подтвердило ReadOnly=true.
Неизвестные writer locks не снимаются; case3/3 не принят.
Product code не менялся; все первоначальные отказы сохраняются.
Исходные Loginom server/client не останавливались и не переключались.
## Offline подготовка Desktop cold на собственном локальном стенде

Сохранён набор `desktop-docs-cold-local-prepared-20261008` в долговременном
acceptance-каталоге. Manifest SHA256
`af98153cbe379acd51577088c42178612e9675a47ffc1288fb6558661bc2922d`.
Для трёх исходных `docs-after-build` пакетов Desktop49 проверены SHA256 пакета
и CSV по warm proof и историческим before-копиям; сохранены точные server paths,
три разных GUID grouping, label и ожидаемые Alpha35/Beta20. XML не изменялся.
Закреплены hashes `cold.mjs`, `processes.mjs`, resource manifest и исходных
proof/result. Повторное чтение всех plans/copies/pins подтвердило совпадение;
полный inventory ресурсов в этой подготовке повторно не проверялся.

Статус `OFFLINE_BYTES_PINS_PASS_LIVE_REQUIRED`: браузер/модель/судья0,
Docker и стенд не затрагивались. Прежние cold1 PASS/2 readonly FAIL сохранены.
Запуск разрешён только после завершения formal controller с подтверждённым
cleanup, на fresh own isolated server, с повторной проверкой guards/pins.
Дальнейший staging/reader adapter ещё требуется; подготовка не закрывает gate.

### Source/file guard перед будущим Desktop cold controller

Приватный `ab-local-stand-20261008/skills-desktop-cold-guard.py` проверяет обе
formal completion receipts, собственный runDir каждой стороны,15 уникальных
задач ×3, точные task/attempt identities и подтверждённый result/process cleanup.
Проверка освобождения ресурсов не требует analytic PASS: закрытый no_artifact
остаётся отказом в A/B и не мешает дальнейшей независимой приёмке.

Через TDD выполнены пять последовательных RED→GREEN циклов: незавершённая
серия; неподтверждённый cleanup; candidate, заимствующий baseline runDir;
подменённая attempt identity; сокращённый task set, скрывающий failed cleanup.
Positive fixture подтверждает допуск полностью закрытых analytic failures.
Финальный `test-desktop-cold-guard.py`:6 PASS/0 FAIL, реальные временные файлы,
без mocks и внешних вызовов. Это исходная fixture-проверка, не native cold.

Текущая реальная formal-серия отклонена `FORMAL_NOT_COMPLETED` до ресурсных
операций; `desktop-cold-guard-current-formal-refusal-v2.json` SHA256
`e684eedac0d4bf2ee50a441dd33e89bd35f22d26d9eda245be3a946aaa4448d6`.
Guard SHA256 `a161573fc957c66ee5cf71c9b0a741f7280979417eaa9401dd067b38c1c206bd`,
test SHA256 `76ea430c5b15291d82d2d900892e1fc9fa6b2912330db8cd83cccddc1caa3bac`.
Все RED/GREEN logs сохранены; common/21 pins перепроверены и неизменны.
Guard пока не подключён к staging/reader controller: его реализация и native
проверка ещё нужны. Desktop cold1 PASS/2 readonly FAIL и открытый gate сохраняются.
