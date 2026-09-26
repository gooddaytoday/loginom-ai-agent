# JavaScript: checkpoint исполнения

Дата: 2026-09-26. Фаза **0A/0B: OpenViking восстановлен; discovery JavaScript продолжается**.
Пользователь назначил исполнение [плана](plan.md), Ubuntu и только headed-браузеры.
Начаты операторские наблюдения 0B. JS-handler, полное discovery, ревью реализации
и CLI-приёмка ещё не выполнены.

Повторная проверка после перезапуска Codex: MCP `health`, actor `find` и чтение
найденной записи `g2_g3_module_integration.md` успешны. Установленный Doctor
0.8.1 подтвердил credentials, `system/status`, 15 MCP tools и все подсистемы
`/ready`: **0 failures**. Единственное предупреждение — исторические ENOENT
при чтении rollout других задач; текущий поиск/чтение ими не заблокированы.
Настройки доступа не менялись. Разработчик продолжает G2/G3 operator в прежней
задаче; до передачи проверенной версии новый live-прогон не запускался.

## Актуальная диагностика после запроса пользователя

Пользователь попросил перепроверить причину и сообщил, что ничего не менял.
Журнал владеющего Desktop App Server подтверждает для той же задачи:
`17:17:27.465Z starting → 17:17:42.445Z failed`, затем
`18:29:50.697Z starting → 18:30:04.867Z ready`; в `18:39:08.004Z` снова ready.
Прежний отказ запуска больше не является текущим блокером.

В turn `01a0df04-a426-7b50-babf-b43bbe5dc48e` инструменты реально появились,
но `mcp__openviking__health` и `mcp__openviking__find` оба отклонены до обращения
к адаптеру: `MCP tool call requires approval, but approval policy is never`.
Причина текущего отказа — несовместимость требуемого подтверждения инструмента
с политикой задачи, а не доказанная недоступность OpenViking.

Проверены локальный helper регистрации и фактическая конфигурация: per-tool
approval settings отсутствуют; registration config SHA совпадает с текущим файлом.
Все 15 инструментов свежего каталога адаптера не имеют `annotations`, включая
`readOnlyHint`. Штатный root MCP health успешен; pinned Node получил HTTP 200
за 1.001 с, прямой curl — 200 за 1.405 с. Отдельный Doctor в том же ходе встретил
сетевой timeout и отказ VPN-проверки CLI launcher; это сохранено как отдельное
наблюдение, не как установленная причина прежнего старта или текущего policy refusal.
У процесса адаптера и координатора одна network namespace. Проверки не меняли
VPN, proxy, credentials или sandbox.

Исходная транспортная первопричина неизвестна: adapter заменяет upstream error
на общее сообщение, а transport logger отключён. Длительность около 15 секунд
согласуется с timeout, но не доказывает его. Улучшение безопасной диагностики
требует отдельного изменения исходников/поколения; текущие pins не переписаны.

Пользователь явно разрешил **все операции памяти, включая запись**. На idle-границе
в существующем worktree установлено `mcp_servers.openviking.default_tools_approval_mode
= "approve"`; согласованно обновлён config SHA регистрации:
`54994d52ba430d7acb76517fa71cd52cda20a3658dda1a2fb2e9cd5aab8617d9`.
Прежнее предложение только девяти операций чтения заменено этим решением.
Global config, approval_policy и sandbox не менялись. Побайтная проверка
подтвердила сохранение capture state, activation, routing receipt и hooks;
новый enrollment не выполнялся, cursor не сбрасывался. Backup и receipt —
приватный `.local/project-memory/rollouts/20260926.2/approval-all-20260926/`.
Свежий App Server `config/read` увидел настройку; проверка hooks сохранила пять
trusted project hooks и отсутствие original memory hooks в worktree. Доверие
hooks само по себе не подтверждает разрешение вызовов MCP.

Пользователь перезапустил Codex. Root health и точное чтение ранее извлечённого
результата успешны. В той же задаче разработчика запущен turn
`01a0df0d-b86b-73e2-ab7f-b1778a97a466`: проверить actor health/find/read после
перезапуска, затем продолжить bounded диагностику wizard-ready11. Разработчик
в 18:50:41Z подтвердил успешные health, find (один результат) и exact read.
Доступ обеих задач восстановлен, продуктовая работа возобновлена.
Исходники адаптера и его generation не менялись.

После восстановления проверено и новое извлечение: root actor find/read вернули
`viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/operator_pass14_ready.md`.
Запись содержит сообщение разработчика после перезапуска и правильный SHA
оператора14 `20a2553407442e4231a832659f6f7772f4f427182c27c2b439218f8f8b494f45`.
Это дополнительное доказательство доступности нового общего контекста из root;
ручной remember/capture не запускался. Summary другой записи назвал cleanup15
успешным, что противоречит его report: cleanup был подтверждён отдельным
recovery15. Канонические reports/checkpoint имеют приоритет над summary памяти.

## Продолжение G1 после восстановления памяти

Operator12 запущен координатором в headed Chromium под `jsteach` на прежнем
стенде и профиле. Проверки native ownership мастера (GUID, исходный `FModelNode`,
workflow, tab, package ancestry и root) прошли. Единственное false-условие —
`no_visible_blockers`: начальные маски загрузки исчезли, к deadline осталась
ровно одна `.x-mask.x-border-box` над `TuneDataSourceInputPortWizard;colTargetDelete`,
размер 30×27. Поэтому полное отсутствие любой `.x-mask` не является корректным
условием готовности этой страницы. Нельзя исключать все маски: разработчику
поручена точная проверка принадлежности маски disabled control.

Private evidence: `g1-operator-12/report.json`. Результат прогона —
`CLEANUP_UNCONFIRMED`, browser closed, Close не отправлялся, logout не подтверждён
самим оператором. Отдельный readonly recovery12 подтвердил аккаунт `jsteach`,
0 пакетов, успешные UI logout и закрытие browser context; evidence —
`g1-recovery-12.json`. Source insertion, Next, Done, Preview и engine probes не выполнялись.

Operator13 (operator SHA256
`fa4f618d047035b8529d3f63088b04ae908b8714758bd77467f112a556313675`)
подтвердил native `Ext.grid.column.Action`, `disabled=true`, exact DOM identity,
цепочку владельцев grid/page/wizard и совпадение геометрии оставшейся маски.
Не прошли только предполагаемые `empty_mask` и `no_dialog_role`; реальная маска
содержит дочерние элементы и role. Эти предположения не подтверждены source и
не должны считаться доказательством загрузки. Разработчик уточняет структуру
штатной Ext mask; blanket-исключение всех масок не вводится.

Report13: `CLEANUP_UNCONFIRMED`, browser closed, Close/Next не отправлены.
Recovery13 отдельно подтвердил `jsteach`, packages0, logout/context close.
Private evidence — `g1-operator-13/report.json`, `g1-recovery-13.json`.
Режим `--inspect-pages` подготовлен, но ещё не запущен. G1 не закрыт.

Operator14 подтвердил исправление маски: cached native mask identity,
отсутствие видимого сообщения и все ownership predicates прошли; overlays1,
blockers0. Source SHA оператора —
`20a2553407442e4231a832659f6f7772f4f427182c27c2b439218f8f8b494f45`.
Штатный Ext `Element.mask()` содержит presentation/message subtree:
[официальный исходник](https://docs.sencha.com/ext/6.2.0/classic/src/Element.js-1.html).
Live проверка cache identity подтверждена на самом стенде.

Первый `--inspect-pages` остановился до Next: поиск `input[type=radio]` вернул
0 при существующих Ext indicators, index=null. Это неверное предположение об
HTML controls, не доказательство отсутствия страниц. Single Close и подтверждение
успешно вернули исходный WorkFlowTreeNode/граф с тем же JS GUID
`8f607965-3a27-4b81-96a6-5ef070f5e3ee` (`wizard-close-settled`). Cleanup затем
истёк в `wait-owned-package-ui`: код использовал observation до закрытия мастера
и fallback visibility только по размерам. Разработчику переданы исправления
наблюдения native indicators и обновления observation после Close.

Report14 остаётся `CLEANUP_UNCONFIRMED`; отдельный recovery14 подтвердил
`jsteach`, packages0, logout/context close. Evidence: `g1-operator-14/report.json`,
`g1-recovery-14.json`. Editor/source/engine не проверены; G1 остаётся открытым.

Operator15 (SHA256 `e1cf0472b21357ef621c55dc4abeef6855529f180518d4b5dd20a35c7b24a128`)
подтвердил переходы 0 `TuneDataSourceInputPortWizard` → 1
`JavaScriptColumnsWizard` → 2 `JavaScriptCodeWizard`. Всего пять native
`Ext.form.field.Radio`, их `InputEl` — HTML `input type=button`; ownership и
согласование native checked/DOM прошли. Два Next выполнены по одному.

Полный CodeMirror read: 2 строки, 130 UTF-8 байт, SHA256
`6eb6e2f9e8395c9b00185f1fa9f77cae18c041784f2b2033da946e74aebecc64`,
`source_redaction_changed=false`; owner `JavaScriptCodeWizard;cmpCodeCM`.
Настройки: readOnly=false, mode=javascript, indentUnit=4, indentWithTabs=false,
smartIndent=true, electricChars=true. Это чтение исходного шаблона, не проверка
ввода, исполнения или сохранения. Версия CodeMirror и оставшиеся страницы ещё
не наблюдены. Single Close/confirmation с code page вернули собственный граф.

Cleanup15 остановился при закрытии пакета: ожидание по одному размеру hidden
messagebox могло завершиться раньше появления нового Save dialog, затем
одноразовый dialog.count() пропустил discard. `cleanup-refusal` подтверждает
ожидаемый вопрос о сохранении Package1 и кнопку «Не сохранять». Разработчику
передана замена на bounded observation видимого exact dialog либо packages0,
с записью эффектов до single dispatch. Report сохраняет CLEANUP_UNCONFIRMED.
Recovery15 отдельно подтвердил `jsteach`, packages0, logout/context close.
Evidence: `g1-operator-15/report.json`, `g1-recovery-15.json`. G1 частично закрыт
наблюдениями identity/editor, полный gate и G2–G7 ещё открыты.

Operator16 завершён с **подтверждённым полным cleanup**: package closed,
UI logout и browser closed true; дополнительный recovery не потребовался.
Source SHA оператора `4c335c766c4622b93ade7d69b6f7ad127eaf14d5733184b582ec1f4163f244c5`.
CodeMirror на стенде — **4.11.1**, настройки совпадают с operator15.

G4 input probe: keyboard.type изменил sample (896 вместо 849 байт); insertText
передал sample точно (849 байт/8 строк, 20ms). Граничный insertText: ровно
32768 UTF-8 байт/1024 строки, полное совпадение SHA256
`5aead120eaa874ee7b1f02c0e2971dd79eac6ddf091528053b59ccf343b186e0`, 1007ms.
Baseline восстановлен точно, прежний SHA `6eb6e2f9…ebecc64`, 22ms.
Aggregate `PROBE_PASS`, selected_method=insertText, full_g4_status=not_closed.
Это доказательство выбранного способа ввода и readback на этом редакторе;
сохранение, исполнение и вся матрица G4 ещё не доказаны.

После восстановления шаблона единственный Next со страницы code2 открыл
`DoneWizard`, «Описание узла», checked native indicator4. Indicator3 оказался
скрытым; его назначение не установлено. Остальные native owners и отсутствие
blockers подтверждены. Оператор ошибочно требовал видимость всех индикаторов
и переход строго index+1, потому финальный work status FAILED на
`expected_page_transition`. Исправление должно сохранять owner и ограниченный
порядок, но учитывать наблюдённые пропуски условных страниц. Done/Preview не
нажимались. Evidence — `g1-operator-16/report.json`; очистка прошла штатно.

## Подготовка G2/G3

Координатор проверил `execution-probe-design.md` разработчика: собственный
закреплённый CSV → наблюдённые typed input6×5 → отдельные declared/code trials,
sentinel положительно доказывает исполнение, отсутствие sentinel его не
отрицает; passive table read не должен повторять Execute. Execution runner
ещё разрабатывается, live G2/G3 не запускался.

Независимый private oracle подготовлен стандартным Python csv из source с
проверенным SHA `4fce338d2edd2901ba35732ed148a1a80eba4a5fbf927f2828f3cdbe6b8fa09e`.
Сохранены пробелы Customer, кириллица и все30 входных значений. Ожидаемый
результат — 6×2: ObservedID Integer1..6 и PhaseMarker String JS_G2_TABLE_V1,
исходный порядок, numerical tolerance0. Technical names входа ещё должны быть
наблюдены на стенде; позиционное совпадение не заменяет binding.
`g2-independent-oracle.json` в кампании, SHA256
`d61d649ed91c41c4961f51855508a893b17d6fc75b11c30419d3836186e8f97a`.
Статус expected_not_live_validated; это не финальный business CLI oracle.

Source oracle в новом `javascript-execution-evidence.mjs` независимо сверён
координатором с Python oracle: все30 входных и12 выходных значений и обе схемы
совпали (pinned Node, package directory). Live correctness этим не доказана.
В review передано требование fresh sentinel messages для конкретного
once-effect/node/source SHA: прежняя запись консоли не подтверждает исполнение
после нового Next/Done/Preview; terminal outcome проверяется отдельно.


## CLI-профиль: offline reconciliation после отменённого OAuth

Старый guard отменённого сеанса (nonce `b0e663b1-6c9f-48f0-9e32-54150f220415`)
архивирован только после проверки отсутствия процессов со ссылками на собственный
профиль в args/environment/cwd/fd, пустого state/locks и отсутствия auth.json.
Недоступные служебные процессы отдельно идентифицированы как sd-pam/ssh-agent.
Acceptance lease свободен; проверка/архивирование выполнены под registry lock.

Первый source `providers list` в developer worktree завершился CLI_START_FAILED:
AppRuntime import не находил cross-spawn в SDK. Pinned Bun1.3.14 выполнил
`install --frozen-lockfile --ignore-scripts`, установлено2 пакета. bun.lock SHA256
до/после совпал: `e97377f2000cd858fa0d4d770cc5f03d0012312edc4606267cb3c3b3513184ff`.
Guard этого неуспешного запуска тоже архивирован после отдельной offline-проверки.
Повтор `providers list` завершился exit0, **0 credentials**; штатный выход снял
.writer, state/locks пуст, auth.json отсутствует. OAuth не возобновлялся, прежний
код входа не используется. Это подготовка source CLI, не приёмка candidate.

Private receipt/backups: `cli-oauth-offline-reconciliation-20260926/` в прежней
кампании. CLI profile остаётся прежним, новый профиль/кампания не создавались.
Требуется новый собственный OAuth перед приёмкой собранного кандидата.

## История остановки: MCP при возобновлении разработчика

После recovery11 задача разработчика подтвердила отсутствие OpenViking tools
и ошибку `MCP startup failed`, code `-32003`, `OpenViking transport request
failed; no automatic write replay.` Это наблюдение turn
`01a0deec-d45a-7493-a286-913922938f20`, а не отрицание ранее проверенного полного
цикла. Продуктовая работа приостановлена по правилу проекта о доступной памяти.

Координатор повторно прочитал точный URI результата через штатный root-плагин.
Установленный Doctor подтвердил `/ready`, авторизацию и 15 MCP tools:
0 failures; warning относится к прежним ENOENT transcript других задач.
Свежий отдельный запуск того же собранного `20260926.2/server.mjs` выполнил
initialize/tools-list и получил 15 инструментов без stderr. Причина первоначального
транспортного сбоя не установлена; ошибка уже загруженного MCP-клиента разработчика
остаётся. Не объявлять её доказанной ошибкой регистрации или недоступностью сервера.

Регистрация, routes, hooks и capture state не менялись. Наблюдённый cursor — 298,
canonical workspace Peer сохранён; ручной capture/commit не запускался.
Приватный receipt — `developer-memory-startup-20260926T1814.json` в кампании.
Разработчик idle; Browser закрыт с подтверждённым logout/recovery11; resources
lease сохранён, CLI acceptance slot не занят. Начатый device-code OAuth процесс
ожидал входа; при окончательной остановке отменён координатором через Ctrl+C,
exec session 82194 завершился с exit 0. Auth-файл не появился; `.writer/owner`
остался, поэтому профиль нельзя считать освобождённым. Guard сохранён для
отдельной reconciliation перед следующим OAuth запуском, не удалён вслепую.

Следующий шаг: Restart MCP `openviking` в приложении, владеющем задачей, затем
actor health/find/read в **той же** задаче разработчика. Root CLI daemon control
socket отсутствует; новый отдельный App Server не обновит подключение Desktop.
Пользователю отправлен запрос перезапуска MCP, при отсутствии кнопки — Codex.
Не пересоздавать задачу, не повторять enrollment и не сбрасывать cursor.
После восстановления продолжить диагностику конкретного условия wizard-ready11,
затем G1–G7. Runtime/исходники адаптера и предыдущие доказательства сохранены.

Блокер подтверждён в трёх последовательных ходах Goal: исходная диагностика,
повторный turn `01a0deef-c99b-7e41-a799-8074412e5efb` и последний
`01a0def0-6c07-7d82-b3a3-f269d3225e60`. Каждый повтор дал ту же ошибку запуска
при одном вызове зарегистрированного MCP. Все 18 файлов source manifest совпали
с hashes. Дальнейших безопасных действий для восстановления MCP уже загруженной
задачи доступными средствами не найдено; Goal переводится в **blocked**, не
complete. После перезапуска подключения пользователем продолжить эту кампанию.

## Актуальное состояние после реализации адаптера

- В Git добавлены собственные исходники project-memory, generation `20260926.2`,
  source commit `1419ec3906b80a30be91cdd5bab9af35ad88e548`.
  Внешний macOS adapter больше не требуется. Старые hashes/runtime сохраняют
  историческое значение; [отчёт реализации и проверки](../../../../services/loginom-ai/tools/project-memory/ubuntu-adapter.md).
- В прежнем worktree `.worktrees/node-javascript` создана настоящая задача
  `01a0de3e-6a07-7661-aa88-ed4807aef6ec` — «JavaScript: общая память и допуск Ubuntu»,
  Astra medium. Product base `a8ad59766dbdb4f2da0b54367a755ce00891dd71` сохранён.
  После передачи документации исходный чистый HEAD разработчика —
  `b21a63f01ad326870c70c2479508508bc59825c1`; plan source —
  `14a4fa47b676f087eac06de21a2654737788f8ef`. Все 30 отличающихся от base файлов
  документации совпали с источником побайтно; product code не переносился.
- Registration `22ccfcf0-7919-4954-9342-82450a28a6f3` активна. Пять project hooks
  trusted, original memory hooks в worktree отсутствуют; основной плагин сохранён.
- Реальные host metadata Codex совпали с thread/cwd. Успешны actor health/find/read,
  официальный Stop/capture, native PreCompact/commit, exact read-back и semantic
  find результата из основного проекта. Cursor `0 → 13 → 22`, сервер: 22 сообщения,
  один commit. При смене поколения capture state сохранён побайтно; сброса не было.
- Извлечённая запись:
  `viking://user/kiselev/peers/-home-george-git-loginom-ai-agent/memories/events/2026/09/26/memory_verification_success.md`.
  Ручных remember/write не было. Локально: 59 runtime Node + 13 Python + 23 helper
  Node checks PASS. Документационный validator и diff whitespace checks PASS.
- Runtime и квитанции приватны: `.local/project-memory/{runtime,rollouts}/20260926.2/`.
  Неуспешный первый runtime/rollout `20260926.1` сохранён. Основной checkout и корень
  worktree получили `0755` вместо `0775`; cache плагина не менялся, hooks используют
  отдельную защищённую копию с теми же bytes. Validators ownership не ослаблены.
- На границе проверки памяти compaction turn completed подтверждён приложением;
  тогда задача была notLoaded, model/hook
  writer не оставлен работающим. Capture cursor 22, ovSessionId null, own lock отсутствует.
  Browser/CLI в этой проверке не запускались; выделенный headed profile закрыт ранее.

Продолжение назначено **этой же** задаче после переноса явно выбранных docs-only
commits: фазы 0A/0B и разработка до первого ревью. Browser/account/profile lease
теперь принадлежит координатору: разработчик готовит исходники оператора,
координатор выполняет headed-проверки и возвращает evidence. Параллельных
Loginom-сессий нет. Повторная регистрация не нужна. Использовать Ubuntu
Node/Bun, `jsteach`, заданный стенд, только headed; установить server OS и storage,
подготовить независимый CLI profile/candidate, выполнить JS discovery. Полный план
обучения пока не завершён; снята его блокирующая зависимость от внешнего adapter.

## Текущее выполнение на Ubuntu

Desktop при продолжении задачи разработчика выбрал managed sandbox без доступа
к сети стенда и внешнему browser profile. Возобновление этой же задачи отдельным
App Server остановлено штатным active-writer guard. Guard, capture state и
права sandbox не менялись. Поэтому координатор выполняет живую часть в своей
разрешённой среде; разработчик сохраняет владение исходниками handler/оператора.

Разработчик подготовил каталог 14 engine probes и оператор `javascript-live.mjs`
в своём worktree. Это пока исходники проб, не доказательство native execution.
Первый headed запуск `g1-operator-01/report.json` подтвердил account `jsteach`,
Loginom Enterprise 7.4.2, ноль исходных пакетов, собственный черновик `Package1`
и native model `MF;TF-1`. На скрытом элементе палитры выполнение остановилось;
JS-узел не создан. Закрытие черновика подтверждено Count=0, logout первой попытки
не подтверждён. Отдельная адресная recovery `g1-recovery-01.json` затем подтвердила
тот же аккаунт, ноль пакетов, UI logout и закрытие browser context. Обе попытки
сохранены вне Git. Server OS/storage остаются не установленными; G1 не закрыт.

Дополнительные наблюдения: `g1-palette-02` завершился с полным cleanup, но снял
пустое дерево до загрузки строк. В `g1-operator-03` ожидание строк подтвердило
палитру и элемент JavaScript; отказ произошёл при hit-test после прокрутки,
до drag. Сообщение — `Palette item covered after scroll`, а не timeout.
Cleanup остановился на неизвестном подтверждении, его последний native snapshot
показал Count=0. Отдельный `g1-recovery-03.json` подтвердил `jsteach`, ноль пакетов,
UI logout и context close. Следующий шаг — ограниченная диагностика координат,
фактического элемента в точке захвата и сообщения cleanup; не повторять drag
без устранения причины. Все 14 engine probes по-прежнему not_run.

Последующее уточнение `g1-hit-test-04`: элемент перекрывала `bg-mask-message`
формы сценария. При раннем закрытии наблюдён диалог Loginom
`Cannot read properties of null (reading 'GetNodes')`. Ожидание снятия маски
в 05 устранило это препятствие. В 05 также обнаружена ошибка атрибуции оператора:
системный узел переменных был принят за новый; JS creation этим не доказан.
В 06 после нового drag появился отдельный GUID/label JavaScript, но проверка
ошибочно отвергла промежуточные null icon/DOM. Сохранён фактический prompt
отбрасывания своего пакета и кнопка «Не сохранять». Recovery06 прошла.
В 07 создание пакета подтвердилось, но workflow не загрузился за 30 секунд;
это ошибка подготовки графа, не JS-кода. Screenshot показывает загрузочную
маску без сообщения об ошибке. Для 08 owner пакета связывается до ожидания
графа; отдельный диагностический предел графа — 90 секунд, без повторного create.

Независимая readonly-проверка `storage-platform-01.json` подтвердила отсутствие
пакетов до/после навигации (reconciliation07), собственный каталог `/jsteach`,
native `DefaultStorageDirectoryTreeNode`, доступные Upload/CreateDirectory,
UI logout и context close. Файлы/каталоги не создавались: write/readback ещё
not_checked. Assignment обновлён этим наблюдённым storage; server OS не установлен.

В worktree разработчика зафиксирован отдельный Host commit `9d75933fac`:
валидированный явный URL сохраняет внутренний `urlSource: explicit`, поэтому
не мигрирует на product default при restart. Старые записи без provenance
сохраняют legacy migration. Проверки разработчика: 44 tests PASS, включая
6 отдельных процессов для Desktop/CLI codec; Host typecheck PASS. Координатор
прочитал diff и выполнил commit, поскольку sandbox разработчика запрещает
запись worktree git index. Это source-проверка J27, не actual candidate CLI gate
и не формальное ревью фазы 5. Product base регистрации не изменялся.

Последующие попытки G1 сохранены отдельно:

- 08 выявила ещё одну промежуточную фазу создания: native package уже существует,
  но имя/путь ещё null. Recovery08 подтвердила `jsteach`, Count=0 и полный выход.
  Оператор теперь сначала связывает native package, затем ожидает его metadata
  и граф в пределах одного исходного deadline, без повторного Create.
- 09 доказала создание отдельного JS-узла: GUID
  `5de8c1c2-47ac-4d58-b61a-025cbcc41d54`, иконка `bg-vendor-icon-javascript`,
  собственный DOM в графе; системный узел переменных сохранён. Double-click
  внутреннего vertex был отклонён из-за перекрытия кнопками выбранного узла.
  Закрытие пакета, UI logout и browser close подтверждены в этой попытке.
- 10 открыла мастер через принадлежащую этому узлу кнопку `;Setting`, как
  существующий `node-wizard-open.mjs`. Наблюдена страница «Настройка входных
  столбцов». При закрытии появился точный диалог подтверждения с кнопками
  «Да/Нет»; оператор его не обработал. Recovery10 подтвердила Count=0 и выход.
- 11 сохранила screenshot и DOM уже открытого мастера без видимого сообщения,
  но readiness predicate истёк. Это отказ оператора, а не доказательство
  неработоспособности JS-узла. Close не отправлялся после истечения deadline;
  cleanup той попытки не подтверждён, browser context закрыт. Отдельная
  `g1-recovery-11.json` подтвердила account `jsteach`, Count=0, UI logout и
  context close. Следующая проба должна показать результат каждого условия
  readiness и проверить native ownership по существующему node-context.

После recovery11 браузер закрыт; lease профиля остаётся у координатора.
CodeMirror, источник/версия редактора, страницы после входного mapping и
движок ещё не проверены. Все 14 engine probes остаются `not_run`, G1–G7 открыты.
Видимые пять индикаторов страниц мастера нельзя автоматически приравнять
к четырём страницам исторического e2e enum; порядок предстоит наблюдать.

CLI dependency preparation завершена закреплённым Bun по lockfile. После
адресной reconciliation собственного неуспешного старта команда source CLI
`providers list` завершилась с exit 0 и показала 0 credentials в отдельном
профиле кампании. Начата штатная device-code OAuth авторизация ChatGPT, ожидается
пользовательский вход. Название метода `headless` относится к device-code flow,
браузер в этом процессе не запускается. Это source preflight, не compiled
candidate и не CLI-приёмка. До приёмки нужны собственный candidate и проверка
OpenAI OAuth/доступности Sol по регламенту.

## История подготовки до нового адаптера

Ниже сохранены прежние проверки и причины остановки. Статусы «не создана»,
«adapter отсутствует» и прежний next trigger относятся к прошлым шагам;
актуальный допуск и следующий шаг указаны выше.

## Изоляция и владельцы

- campaign: `javascript-20260926-ubuntu`, mode `single`, единственный узел
  `component.programming.JavaScript`; attempt реализации/CLI ещё не создан.
- Координатор: task `01a0ddc9-3e19-75d3-a5c9-724783ed6c35`, основной checkout
  `/home/george/git/loginom-ai-agent`, ветка `javascript`.
- Создан постоянный worktree
  `/home/george/git/loginom-ai-agent/.worktrees/node-javascript`, ветка
  `node-javascript`, чистый HEAD/base
  `a8ad59766dbdb4f2da0b54367a755ce00891dd71` (`loginom`).
- Задача разработчика/её bootstrap **не созданы**; регистрация памяти не активна.
  Это намеренно сохраняет HEAD==base для fresh-enrollment helper.
- Исходный согласованный docs source:
  `086cad12c3` (перед исполнением); дополнения Ubuntu находятся в этом checkpoint
  и соседнем плане. Перед переносом закрепить полный SHA docs-коммита этих файлов.
  Координаторские изменения memory kit — отдельный
  `01cc4dc86392cf3e8820780fc8cc68b6e9a22985`; они не меняют product base.
  Переносить только явно выбранные docs-only commits после допуска памяти.
- Приватный общий журнал:
  `~/.local/state/loginom-ai-agent/node-development/host-resources.json`, owner —
  текущая задача; создан под атомарным `registry.lock` после проверки списка задач
  приложения и процессов. Других активных Loginom-задач в полученном списке нет;
  существующие Chrome-процессы не присваивались и не изменялись.
- Кампания: `~/.local/state/loginom-ai-agent/node-development/campaigns/javascript-20260926-ubuntu/campaign.json`.
  Lease `javascript-20260926-ubuntu-preparation`; CLI slot не занят,
  `acceptance.lock` не создавался. Общий lock записи освобождён.

## Проверено на Ubuntu

1. Сеть: назначенный `http://logi-test-plan.bg.local/app/` разрешается в
   `10.200.11.224`, прямой HTTP GET вернул 200.
2. Пользователь назначил выделенный аккаунт `jsteach`; он закреплён в lease.
   Секреты в документацию/Git не сохраняются.
3. Штатный `src/connection-check.mjs::loginBrowser`, отдельный профиль
   `connection-preflight-profile` внутри приватной кампании, `headless:false`,
   Chromium1243, действующий DISPLAY, sandbox и `--no-proxy-server`.
   Прочитаны фактические account=`jsteach`, Connected=true, `bg.app.Version=7.4.2`,
   PackageNodes.Count=0. Logout через UI и закрытие собственного context подтверждены;
   пакеты/узлы/файлы Loginom не создавались. Native receipt:
   `connection-preflight.json`; операторский скрипт и screenshot — рядом, вне Git.
   Screenshot был сделан до полной отрисовки рабочего интерфейса и не доказывает
   готовность палитры/мастера. Редакция и ОС сервера пока **не установлены**.
4. Отдельный toolchain в
   `~/.local/state/loginom-ai-agent/node-development/toolchains/`:
   Bun `1.3.14+0d9b296af`, полный Node `24.19.0`, npm `11.17.0`.
   PATH пользователя и системный Bun `1.3.13+bf2e2cecf` не менялись.
   Bun получен из [официального release](https://github.com/oven-sh/bun/releases/tag/bun-v1.3.14);
   archive SHA256 `951ee2aee855f08595aeec6225226a298d3fea83a3dcd6465c09cbccdf7e848f`
   сверён с GitHub release asset digest. Node archive SHA256
   `14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647`
   сверён с официальным SHASUMS256; executable SHA256
   `bc17c508ffeed0ec622934f9b7fa72f8e78da65350e63c3eceb56fa688aa5e12`
   совпал с product pin. Точные пути — приватный `javascript-toolchain.json`.
5. Использованный Chromium executable SHA256
   `8c599d43aec53f2460a31ae2f4af6bd863f8258b34ff519564bc5d4726bfaa1e`
   совпал с Linux product pin. Это ещё не проверка целого candidate/resource manifest.

## Память и переносимость подготовки

Основной checkout использует рабочий штатный OpenViking. Doctor подтвердил
авторизацию, `system/status`, чтение, MCP и `/ready`: 0 failures, 1 warning о
прошлых прерванных recall. Точное чтение памяти текущего проекта прошло.
Effective Peer выводится из Ubuntu cwd; macOS URI не копировался.

Подтверждены и исправлены в координаторском kit:

- Исходный adapter передаётся явно `--source`; больше нет исполняемого default
  `/Users/kartamyshev/...`. Старый upstream manifest/hashes сохранены.
- `review_hooks.mjs --codex <absolute executable>` вместо пути macOS app.
  Настоящий Ubuntu `/home/george/.local/bin/codex` (Desktop 0.153.4) успешно
  выполнил initialize и hooks/list; системное доверие этим чтением не менялось.
- Фактический установленный ID — `openviking-memory@loginom-dock`, версия 0.8.1.
  Он передаётся `--plugin-id`, сохраняется в manifest и отключается только в
  новом worktree. Для прежних manifest сохраняется прежний marketplace.
- До bootstrap inventory должен доказать отсутствие original memory hooks
  **любого marketplace** в worktree; helper отказывает раньше захвата данных.
- Ubuntu umask `0002` создаёт `0775`/`0664`, которые текущий ownership validator
  отвергает. В тестовых fixtures установлен приватный umask; в CURRENT описаны
  проверка прав и защищённая копия неизменённого plugin pin. Права основного
  checkout и установленного плагина ещё не менялись, validators не ослаблялись.

Локальные проверки: **11 Python preparation tests + 4 Node hook-review tests PASS**.
Первый Python запуск дал 11 setup errors из-за umask `0002`; после исправления
fixtures — 11/11. Python suite выполнялась с временным preparation fixture:
настоящий overlay и `workspace-peer.mjs`, совпавший с upstream hash;
`server.mjs` специально неработоспособен и выбрасывает ошибку при запуске.
Это проверяет Git/TOML/manifest preparation, **не собранный MCP adapter**.
Node suite использует процесс RPC fixture и не пишет реальное доверие Codex.
Проверки синтаксиса Python/Node и `git diff --check` прошли.

Отдельный исходный `integrations/codex-mcp-adapter` с 11 файлами из manifest
пока не найден в проверенных checkout, cache и подходящих локальных архивах.
Установленный официальный plugin — другой компонент и не содержит этот adapter.
Путь/репозиторий его копии запрошен у пользователя. Поэтому project runtime,
hooks manifest/install, registration ID, bootstrap, activation и actor access
новой задачи пока отсутствуют. Тестовый fixture не установлен как runtime.
Capture/extraction/read-back новой задачи ожидают её допуска и первого этапа.

## Следующий шаг

Владелец — координатор текущей задачи. Восстановить точный исходный adapter,
проверить все hashes и собрать настоящий runtime. Затем закрыть права/identity
установки по CURRENT, проверить новый worktree до bootstrap, создать настоящую
задачу, оформить свежие receipts, activation и actor health/find/read.
После допуска перенести docs-only commits и выполнить discovery 0B в headed
Loginom под выделенным аккаунтом. Отдельно установить edition/ОС сервера,
палитру JavaScript, доступный storage, action manifest и будущий CLI/OAuth profile.

Подготовительный Loginom logout/context close подтверждены; неизвестных мутаций
или pending browser operations нет. Приватный profile/evidence сохранён.
При возобновлении сверить worktree, процессы, account lease и receipts;
не создавать вторую кампанию и не сбрасывать состояние существующих задач.

## Продолжение 0A: интерфейс и целостность bundle

Повторная проверка 2026-09-26, после docs source
`ed45485ac032ff6bc4921a2ca4a55a5650356719`. Worktree остаётся чистым на product
base; разработчик/bootstrap ещё не созданы, исходный adapter по-прежнему отсутствует.
Запрос его доступной копии остаётся без ответа. Предыдущий этап дал реальный
прогресс (Ubuntu helpers/toolchain/login), этот — следующие наблюдения.

- Штатный `verifyResources` выполнен bundled Node: **4668 файлов PASS**,
  manifest SHA256 `ff80b90e2c543a0f3afcdddae843af28372fad43c27c51cce0d58a7f9c66a9b4`.
  Приватный receipt — `source-bundle-verification.json` в каталоге кампании.
  При отдельном сравнении с product release pin найдено одно различие:
  `endpoint=https://loginom.duckdns.org/mcp` у этого bundle вместо актуального
  `https://mcp.loginom.ai/mcp`. Поэтому целостность подтверждена, но **допуск
  candidate не выдан**. Новый candidate должен собираться из исходников и pins
  по фазе 6; существующий source bundle не подменять именем нового candidate.
  Action manifest URI/hash и остальные release fields совпали с product pin.
- В собственном headed context под `jsteach` ранний переход «О программе»
  после успешного login показал `Cannot read properties of undefined (reading
  'NodeIndex')`. Доказательство сохранено: `platform-preflight.json` и screenshot.
  About metadata не прочитаны, logout первой пробы **не подтверждён**, context
  закрыт. Попытка сохранена как неуспешная, не переписана последующей проверкой.
- Отдельная recovery-проба подтвердила тот же account, 0 пакетов, отсутствие
  открытых сообщений, затем успешные UI logout и context close:
  `platform-recovery.json`. Серверных объектов/пакетов не создавалось.
- Проба с ожиданием видимой страницы «Начало» установила `homeVisible=true`,
  `bg.app.PlatformEdition=Enterprise`, успешные logout/context close:
  `platform-readiness.json`. Это отделяет login admission от загрузки интерфейса.
- Повтор чтения «О программе» после ожидания HomePage и подтверждения native
  active tab == `FAboutNode` прошёл. Фактически прочитаны
  `MF;TF-1;About;lblPlatformEditionValue=Enterprise` и
  `MF;TF-1;About;lblVersionValue=7.4.2`. Успешные UI logout/context close —
  `platform-ready.json`; screenshot — `platform-ready.png`. Полные локальные
  observations остаются приватными. Страница не содержит ОС сервера;
  эта характеристика запрошена у пользователя и не выведена из ОС агента.

Последний Loginom context закрыт, logout подтверждён. Browser lease хранит
профиль и evidence, но не объявляет работающий процесс; CLI slot свободен.
Содержимое установленного bundle не менялось. Блокирующее условие регистрации
памяти прежнее: нужна точная копия исходного adapter либо отдельно реализованное
и проверенное новое поколение; ослабление manifest/routing guards не допускается.
Условие сохраняется третий последовательный ход Goal: создание worktree,
Ubuntu-адаптация и дополнительные live-проверки дали прогресс, но не восстановили
зависимость. Автоматическое продолжение приостановлено на этом предусловии;
Goal не завершён. Next trigger — доступная копия adapter с проверяемыми hashes
или новое явное решение о замене механизма регистрации. ОС сервера также ожидает
подтверждения; работающий штатный OpenViking основного checkout не отключён.

## Передача разработчику — 2026-09-26

Задача подтверждена active/inProgress через App API. Разработчику назначен Goal
до ready-for-review, без запуска нового ревью/CLI-приёмки; scope обоих output
режимов и всей матрицы сохранён. Одно same-task review и acceptance будут
назначены отдельно на соответствующих границах. Product base и memory
registration не менялись. В docs-only transfer конфликт CURRENT.md разрешён
точной закреплённой версией документа, code-коммиты kit исключены.

Координатор отдельно готовит CLI provider/OAuth prerequisites. Source CLI
`providers list` в собственном приватном `cli-profile` завершился до model/Host
dispatch с CLI_START_FAILED. Диагностика import обнаружила отсутствующую
зависимость https-proxy-agent; это ещё не дефект продукта. Запущена установка
по lockfile закреплённым Bun с `--frozen-lockfile --ignore-scripts`. Guard
этого профиля сохранён до адресной проверки cleanup; browser не запускался.
