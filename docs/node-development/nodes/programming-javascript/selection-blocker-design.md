# Source75: отказ выбора перед открытием JavaScript

Исследование 2026-09-27, без изменения runtime и без браузерного прогона. Наблюдаемый HEAD: `f4603ad552aa3a85a8bb00b5726511d3c7fdb234`. Проверены все 192 SHA256 pins из `javascript-freeze75-source.json`: несовпадений нет. Root параллельно выполняет duplicate; его результаты здесь не оцениваются.

## Вывод

Доказан отказ guard до отправки body click: второй inspect обнаружил хотя бы один элемент, удовлетворяющий текущему предикату видимости и селектору `[role="dialog"],.x-mask,.bg-mask-message,.x-mask-msg`. Конкретный элемент, его класс, владелец, причина появления и длительность существования **не записаны**. Нельзя назвать его transient loading mask, остатком mapping wizard или безвредной маской disabled control.

Минимальное следующее изменение — диагностический receipt из **того же синхронного inspect, который обнаружил blocker**, с сохранением отказа. Автоматический settlement пока не обоснован. Это позволит выбрать узкое исправление по реальному владельцу, не ослабляя guard.

## Прочитанные evidence

Read-only каталог: `/home/george/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/native-cardinality-odd-probe-01`.

- `report.json`: SHA256 `ea3e134d6aa21ae4547d3fa018a35fcd5c595ee8ec29f81831d931682d0fd952`; `FAILED`, `work_stage=open-wizard`, ошибка `Private selection blocked`; cleanup: package_closed/logged_out/browser_closed все true.
- `execution-events.jsonl`: SHA256 `557cda953ced592b24b6b1e0bfd23196326377926eb6043e77bbe54518cbbd39`.
- Строка 476, 14:40:32.323Z: `port_mapping_close_verified`, original graph unchanged, unlocked graph, normal verified close с подтверждением; это не путь ambiguous-unlock reconciliation.
- Строки 477–478: native roundtrip graph bound и input port/mapping verified (`Value`, integer). Проверку INPUT3 root сообщил отдельно; данное исследование не повторяет независимую сверку ячеек.
- Строка 479, 14:40:32.380Z: initial selection inspect прошёл; `ready=false`, `native_selection_count=2`, `dom_replacements=0`, Setting отсутствует, body point `(632,232)` доступна.
- Строка 480, 14:40:32.390Z: `selection_dispatch` — запись намерения, не receipt применённого клика.
- Строка 481, 14:40:32.403Z: `selection_refused`, `effect_possible=false`, `opening_dispatched=false`, `Private selection blocked`, `owner_verified=false`. Нет selection gesture-returned или open-dispatch.

Метки времени относятся к записи событий, а не задают точное время возникновения blocker. По сообщению root поздний `work-refusal.png` показывает обычный граф; скриншот не исследован здесь и даже его позднее отсутствие overlay не устанавливает вид blocker в момент отказа. Output odd не протестирован этим прогоном.

## Точный механизм и call path

Пути ниже относятся к packages/loginom-runtime/tools/loginom-acceptance/ в
worktree node-javascript на source75. Эти runtime-файлы ещё не интегрированы
в основную ветку документации; номера строк привязаны к source75.

1. `javascript-live.mjs:949–963` устанавливает `open-wizard`, получает wizard binding и вызывает `selectJavascriptForSettings` с default `openSettings=false`. Именно этот initial-open путь соответствует evidence. Последующие запись эффекта открытия и отдельный Setting click ещё не достигнуты.
2. `javascript-execution-runtime.mjs:217–272` удерживает document/controller/model/diagram/graph/container/native/cell/shape. Inspect сначала проверяет native и DOM identity, затем в строке 249 выполняет общий blocker guard. Видимость означает connected, positive width/height и visibility != hidden; это не доказательство перекрытия body point, принадлежности активному workflow или пользовательской модальности. `.x-window` отдельно в этом селекторе отсутствует.
3. Строки 274–284: initial inspect → awaited record(before) → record(dispatch intent) → beforeSelect → повторный inspect → точное сравнение результатов и deadline → `dispatched=true` → mouse.click. Для initial-open beforeSelect — пустой default callback. Между двумя evaluate есть async границы; причинную связь с close mapping это не доказывает.
4. Ошибка blocker во втором inspect возникает до выставления dispatched. Она также означает, что проверки native/DOM выше guard прошли **в этом inspect**. Catch (строки 304–307) повторяет inspect и любой его сбой заменяет на `{owner_verified:false}`. Поэтому это поле не доказывает смену owner и не сообщает причину повторного сбоя. Повторный inspect не сохраняет исходный blocker.
5. `openJavascriptWizard, runtime:322–332` — отдельный reopen-путь: select с openSettings=true, подтверждение владельца до Setting, консервативная lifecycle reservation на open-dispatch, затем finish/settlement. Его нельзя считать caller этого отказа. Wizard settlement после открытия не устраняет initial pre-click отказ.
6. `closeJavascriptPortMapping, runtime:397–419 и 719–727` закрывает mapping и проверяет topology/graph под своим исходным deadline. Узкий recovery допускается лишь по exact ambiguous applied-close unlock receipt, без повторения Close. Успешная проверка графа не обещает отсутствия будущих DOM overlays.

## Предлагаемое диагностическое изменение — отдельное поручение

Внутри selection inspect сохранить текущий селектор, порядок identity checks и полный deny. При наличии видимых blockers вернуть дискриминированный результат `blocked` вместо потери данных при throw; вызывающая сторона обязана проверить его **до** body point, ready, сравнения snapshots и любого эффекта, записать receipt и выбросить прежнюю ошибку. Это должен быть единый путь для initial, pre-select-click, post-selection poll/final и pre-Setting checks. Poll wrapper не должен принять truthy blocked-object за ready.

Receipt: стадия inspect, исходный deadline, native/held-DOM checks passed, selection count, полный blocker count; максимум 12 descriptors, explicit truncated. Для descriptors: совпадения четырёх selector-категорий, bounded tid/id/classes/role/parent tid, rect, connection/visibility и геометрическая связь с удержанным graph/container. Связь DOM containment — наблюдение, **не** authority. Не сохранять innerHTML, тексты диалогов/масок, произвольные свойства native, handles или credentials. Не вызывать mask getters/methods. Ошибка сбора диагностики должна оставлять fail-closed результат.

Снимок сериализуется в том же evaluate, где сработал guard, до следующего await. Host добавляет effect flags и phase. Catch может дать отдельный `terminal_observation`, но не должен затереть исходный blocked snapshot или представлять failure-to-observe как owner mismatch. Ограничение descriptors не ограничивает deny: любой видимый blocker, включая за пределами первых 12, запрещает click.

Не добавлять ожидание или повтор операции на этой стадии. После отдельного root-поручения и заморозки новой версии нужен один ограниченный evidence-прогон. Невоспроизведение отказа не докажет причину старого случая.

## Если evidence обоснует settlement

Допустим только отдельный, явно доказанный класс owned busy с проверяемой native association; foreign/unknown dialog или mask остаются терминальным отказом. Нельзя переносить исключение disabled-delete mask из wizard на граф: `javascript-wizard-settlement.mjs` доказывает другое дерево native/root/page/grid/header.

Будущее ожидание — read-only внутри той же операции, с исходным deadline и теми же retained handles, без повторного Close/Setting/body click, нового reservation, rebinding или разрешения DOM replacement до жеста. Каждый sample повторно проверяет owner/DOM и строгую классификацию; unknown/foreign, смена identity, timeout или ambiguity прекращают операцию. После разрешённого settlement — fresh hit-test и проверка непосредственно перед единственным click. Изменение политики точного сравнения before/checked требует отдельного дизайна, его нельзя обойти сохранённой старой точкой. После dispatched=true/потери ответа gesture replay запрещён независимо от исчезновения blocker.

## Проверки для следующего изменения

`javascript-execution-evidence.test.mjs:21–99` уже проверяет owner/DOM change перед кликом, cover, journal/deadline, lost response без replay, один post-gesture detached replacement и blocker после жеста. Нет отдельного сценария появления dialog/mask между initial inspect и pre-click inspect с receipt точного blocker.

Добавить meaningful regression: blocker появляется при dispatch-intent record; initial inspect успешен; кликов 0; исходный snapshot сохранён даже если следующий inspect уже чистый. Проверить все selector-категории, >12 blockers, foreign ownership, diagnostic failure, journal failure, deadline, отсутствие попадания blocked-object в ready/poll и post-gesture refusal без replay. Existing tests строк 361–436 сохраняют wizard owner/mask guards; строки 478–499 — mapping-close без повторения подтверждения. Settlement tests добавлять лишь после отдельного разрешения соответствующего поведения.

В этом исследовании тесты не запускались: изменён только данный документ. Runtime, browser, config, private evidence, root checkpoint и frozen source75 не изменялись.

## Решение координатора

Дизайн проверен по source75 и сохранённым evidence. Назначен Fix76: только
диагностика первого failing inspect с прежним fail-closed/no-wait/no-replay.
Duplicate source75 независимо завершён PASS12cells/620refs/192pins,cleanup3/3;
браузер закрыт. После проверки и freeze76 нужен fresh odd run. Успех нового run
не установит причину прежнего отказа. Подробнее — [checkpoint](checkpoint.md).
