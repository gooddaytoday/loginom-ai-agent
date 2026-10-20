# Packaged browser recovery: availability и естественные модельные прогоны

Канонический installed flag1 CLI путь прошёл: current capability true,
save_checkpoint, native Close/logout/noDiscard, ACK/exit0 и освобождение writer.
Первая SaveAs/reopen попытка завершилась cleanup FAIL и сохранена отдельно.
Три отрицательные CLI строки также PASS; контрольная установка штатно удалена.
Task 1 принята независимым spec+quality review без обязательных замечаний.
Desktop Task2 принята независимым spec+quality review без обязательных замечаний.
Новый image run выполнил бизнес-задание без recovery; text run заблокирован
rate limit provider. Desktop model run не допущен без CLI transition.
Собственные CLI/Desktop установки штатно удалены; profiles/evidence сохранены.
Исходная Task3 и acceptance/release gate открыты.

## Проверенная поставка

- CLI 0.2.1, prod, Linux x64; исходники `2e625530354afad01a8f6d99fc3269317015b6ea`, `sourceDirty:false`.
- Manifest: `browserRecovery:true`; source tree digest `10c6141a1d382ea1ba92441e5dd8309255dace875bd54189842d654fa8699039`.
- Полная сборка с pinned Bun1.3.14/Node24.19.0/Chromium1246, archive roundtrip и проверка установленного manifest прошли.
- Установка штатным installer в отдельный HOME; launcher указывает на собственный payload. Собственный sandbox root:root/4755, запуск non-root без обхода sandbox.
- Отдельные profile/workspace, `PURE=1`, без `CLI_BUNDLE`; public headless setup завершился кодом0.

## Первая попытка: SaveAs/reopen

| Проверка | Наблюдение |
|---|---|
| Public путь | `skill loginom-automation` → `dock_prepare new_draft` → describe SaveAs → SaveAs собственного UUID-пакета → finish |
| Текущая task capability | Верхнеуровневый `session.json.browserRecovery:true`; session связана с текущим CLI run через SHA256 session ID и совпадающий prepare receipt |
| Prepare | `prepared:true`, `READY`, собственный пустой черновик; без узлов/CSV |
| Save | `availability-save`, `SUCCEEDED`, `reopened:true`; точный путь и пустой граф после reopen проверены |
| Native state после Save | `modified:false`; checkpoint не выполнялся; проверка вычислений не заявляется |
| Native cleanup | `BLOCKED / TAB_IDENTITY_CHANGED`, stage `close_request`; `package_closed:false`, `logged_out:false`, `unsaved_changes_discarded:false` |
| Task runtime transport | `LOGINOM_RUNTIME_CLEANUP_FAILED`, `closed_ack:false`, exit1/no signal |
| CLI/profile | `LOGINOM_HOST_CLEANUP_FAILED`, exit1/no signal; `.writer` сохранён |
| Ресурсы/OS | Browser resource close fulfilled; итоговый cleanup rejected. Собственных оставшихся процессов нет; все ранее наблюдавшиеся собственные PID отсутствуют |

Save receipt также содержит arrangement warning `result_unconfirmed`: успешная
расстановка не заявляется. Успех Save и отсутствие процессов не заменяют
подтверждённое закрытие пакета и logout. Management validation ACK/exit0 не
используется как доказательство task cleanup.

## Граница установленного отказа

Сохранённый prepare/checkpoint содержит исходные tab identity и workspace prefix
`MF;TF-1`; Save trace после reopen показывает prefix `MF;TF-3`, проверенные путь
и граф. Полный новый tab identity в receipts отсутствует. Shutdown берёт tab из
`workspacePreparation`, а native guard требует совпадения browser preparation
receipt с текущими package object и tab. Поддержанная данными гипотеза: reopen
SaveAs меняет привязку, которую cleanup продолжает брать из prepare. Какая именно
часть проверки identity отказала, текущие receipts не различают. Полный публичный
SaveAs reply не содержит `next_step` на prepare/refresh; advice фиксирует только
`modified:false`. Пропущенного предписанного refresh-шага в этом ответе нет.

После отказа не было нового запуска, повторного SaveAs, Discard, удаления guard,
диагностики браузера или изменений production. Одноразовый private driver удалён;
собственная установка, profile и raw evidence сохранены. Следующий шаг требует
отдельного reviewed repair plan. Отрицательные CLI строки, Desktop, модельные
кейсы и качество recovery этим прогоном не проверены.

## Следующая проверяемая гипотеза

Для availability исходная Task3 требует собственного Save, без обязательного
переоткрытия. Bundled skill предписывает `package.save_checkpoint`: existing
keepOpen flow сохраняет package/workflow/tab и тот же native cleanup guard.
Scoped independent review GO для одной новой попытки в fresh profile/workspace
с новым UUID и тем же verified artifact; production inputs не менялись.
Первый SaveAs FAIL/guard/evidence сохраняются; новый путь не чинит SaveAs и
не будет заявлен как reopen или проверка persisted content.


## Вторая попытка: канонический Save, полный lifecycle PASS

После scoped independent review выполнена одна новая попытка с
`package.save_checkpoint` на той же проверенной установленной сборке. Изменения
после её source SHA ограничены документацией; повторная проверка installed
manifest и launcher прошла. Использованы новые HOME/XDG/profile/workspace и
UUID-пакет, `PURE=1`, без `CLI_BUNDLE`. Первый профиль и его guard сохранены.

| Проверка | Наблюдение второй попытки |
|---|---|
| Public путь | Setup → skill → prepare new_draft → describe save_checkpoint → save_checkpoint → finish |
| Capability / prepare | Текущая task `session.json.browserRecovery:true`, привязка к CLI session подтверждена; `prepared:true / READY` |
| Save | `SUCCEEDED`, `reopened:false`, `workflow_preserved:true`, `save_completed:true`, `persisted_content_verified:false` |
| Same open workflow | После Save подтверждены тот же tab/prefix, точный путь и пустой граф; `modified:false` |
| Native cleanup | `SUCCEEDED`, `package_closed:true`, `logged_out:true`, `unsaved_changes_discarded:false`, `packages_after:0`; привязан к текущему `availability-save` |
| Task runtime transport | `closed_ack:true`, exit0/no signal, request_error:null |
| CLI/profile | Exit0/no signal, stderr пуст, новый `.writer` освобождён |
| OS | Все15 наблюдавшихся собственных PID отсутствуют; оставшихся процессов нового профиля нет |

Успех подтверждает канонический Save без переоткрытия и обычный native lifecycle.
`persisted_content_verified:false` сохранён как ограничение; arrangement warning
`result_unconfirmed` не выдан за успех. Дополнительного Save не потребовалось.
Этот результат не исправляет и не отменяет отдельный отказ SaveAs первой попытки.
Production и cleanup policy не менялись. Одноразовый driver удалён, обе private
попытки и установленный payload сохранены. Выполнение остановлено перед
отрицательными controls; Desktop, модельные кейсы и recovery quality остаются
открытыми.


## Три отрицательные CLI строки: PASS

Контрольный полный flag0 artifact собран из чистого source
`ad1e302a74562c54a6dffdaddc9ecdf42b99a426`, установлен штатно в отдельный HOME;
manifest содержит `browserRecovery:false`. Build/archive roundtrip и installed
verification прошли. Флаговая установка сохранила исходную identity выше;
production inputs не менялись.

Каждая строка выполнена один раз последовательно со свежими HOME/XDG/profile,
workspace и UUID-пакетом через ту же публичную canonical Save цепочку.

| Строка | Manifest / runtime env | Текущая task capability | Lifecycle |
|---|---|---|---|
| Установленный compiled flag0, без CLI_BUNDLE | false / flag1, prod | `false` | PASS |
| Установленный compiled flag1, внешний CLI_BUNDLE на собственные неизменённые resources | true / flag1, prod | `false` | PASS |
| Source standalone через pinned Bun и development CLI_BUNDLE | source / flag1, prod | `false` | PASS |

Source использует существующий `packages/agent/src/standalone.ts`; legacy
`src/index.ts` был исправлен в назначении до live-запуска. Source строка не
представлена как installed artifact evidence.

Для каждой строки отдельно подтверждены current `session.json` и привязка к CLI
run, prepare READY, текущий Save SUCCEEDED/без reopen/с сохранённым workflow,
`modified:false`, native Close/logout/noDiscard и `packages_after:0`, task
ACKtrue/exit0/no signal, CLIexit0/пустой stderr/освобождение `.writer`. Все15
наблюдавшихся собственных PID каждой строки отсутствуют; выживших процессов
соответствующего профиля нет. `persisted_content_verified:false` и arrangement
warning сохранены как ограничения. Повторов Save не потребовалось.

Одноразовый driver удалён. Обе установки, исходный failed guard и private evidence
сохранены до независимого review; uninstall в этом срезе не выполнялся.
Отрицательные значения не доказали качество recovery или моделей; Desktop и
модельные строки остаются открытыми. На этом controls slice остановлен.


## Контрольная установка удалена штатно

После проверки отсутствия собственных процессов standard `uninstall.sh`
контрольного artifact выполнен один раз с его отдельным install HOME, из каталога
вне payload. Exit0, `uninstalled:true`, `profilesPreserved:true`. Контрольные
launcher, установленный payload и current receipt отсутствуют; archive/artifact,
три control profile и raw evidence сохранены. Флаговая установка и исходный failed
guard сохранены. Ручного удаления и новых runtime-запусков не было.
Техническая очистка контрольной установки завершена; результаты availability
не изменились. Итоговый независимый spec review compliant, quality Approved; обязательных
замечаний нет. Root проверил raw evidence и разрешил границы review по прежним
проверкам исходных Task2/S5, CI и natural-case IDs; их новый PASS не заявляется.

## Desktop Task2: installed true, unpackaged false

Оба DEB собраны из clean source `703ed55875a71ab0d1187325bdc81ffcc27e4c1e`:
flag1/flag0 manifest boolean true/false; full static verifier — 4753 resources PASS
каждый. Полные source archive совпали. Версия 0.2.1/prod/Linux x64/backend v1,
Bun1.3.14/Node24.19.0/Electron42.3.3/Chromium1246.

На исходно свободный product path штатно установлен flag1 DEB. Проверены dpkg,
launcher/desktop Exec, installed ASAR equality и все runtime hashes. Installed
non-root/sandbox current task `browserRecovery:true`; тот же flag1 build через
development Electron — actual current `false`. В обеих строках публичная цепочка
skill → new_draft → describe/save_checkpoint сохранила собственный UUID-пакет;
Save SUCCEEDED, workflow_preserved:true/reopened:false/modified:false.

Обычный quit подтвердил current native Close/logout/noDiscard/packages_after0,
отдельно task ACK/exit0, app/Node exit0 и отсутствие 34/35 наблюдавшихся процессов.
Desktop пишет `package-cleanup.json`/event `saved_package_cleanup`; это его штатная
ветка single saved package, без private acceptance input. CLI basename отличается.
Save не доказывает persisted-content/readback или goal: outcome goal not_verified,
arrangement result_unconfirmed остаётся предупреждением.

Первая попытка Playwright под Bun завершилась launch timeout 120s до connection,
сессий и tools. Профиль/ошибка сохранены, 10 дочерних процессов завершены; capability
и native cleanup по ней не заявляются. Одна новая попытка использовала существующую
схему Bun oracle parent → pinned Node GUI driver и прошла. Production не менялся.
Сохранены также initial missing TEST_NODE, отсутствующий Electron postinstall,
отклонённый subtree source archive и ошибочный CLI-basename read-only probe.

Desktop typecheck PASS; packaging tests 14 PASS/2 platform SKIP/0 FAIL; crash-logging
после каждой сборки — 6 PASS. Flag0 только static control, не устанавливался.
Flag1 остаётся установленным для Task3; uninstall ещё не выполнен, чужие profiles
не удалялись. AppImage/другие ОС/модели/recovery gate не проверялись. Временные drivers
удалены, все profiles/raw attempts сохранены. Независимый Task2 review: spec compliant, quality Approved; обязательных замечаний нет.
Private evidence сохранён в `/tmp/loginom-desktop-recovery-task2-935el_n_`;
`flag1`/`flag0` содержат manifests/static/source, `evidence` — команды/exit/logs,
`installed-node`/`unpackaged` — разные profiles и полные public replies.

| Row | Backend session | Runtime session / attempt |
|---|---|---|
| installed-node | `ses_ea6a1614fffep4EwAUTvtNdt20` | `5364f456-2603-43e2-944d-4c0f46878d4c` / `37f679db-b9c3-4fa1-96e9-99917b93be2e` |
| unpackaged | `ses_ea69ea77cffeUk72mu7vhZKGB3` | `10adfb2e-1972-47f7-ac75-52c736bdc5a1` / `643309eb-044d-4a17-8bde-9dbee3dd0553` |

Current `session.json` и `package-cleanup.json` находятся под соответствующим
`<row>/profile/desktop/loginom/runtime/generations/1/chats/<SHA256 backend session>/attempts/<attempt>`.
Transport receipts лежат в runtime root; `evidence/verified-summary.json` связывает
их с текущими native/Save/OS фактами. Исторический `installed` Bun-timeout отделён.

Дополнение к stderr Task2: в unpackaged также наблюдались CSP warning и quit-time
`Failed to finish bootstrap instance TypeError: Failed to fetch` (15:55:54.710).
Причина не установлена; подтверждённые native cleanup и ACK остаются отдельными
успешными фактами. Production repair и дополнительного native запуска не было.

## Natural Task3: исходный комплект до live model run

До первого модельного запуска 20.10 закреплён `WIZARD_OPEN_NOT_CONFIRMED`:
LAB-91 `103006-r3`, исходный source `025b73afacf2a9e6e485c5fc1872274a31f95502`.
Связь ID/ошибки дана в
[аналитическом срезе](../../../../node-development/nodes/integration-restrequest/large-graph-interaction.md).
Текущие stage1 `acceptance/README.md`, `task.md`, `data/requests.csv` и
`fixtures/manifest.json` побайтно совпали с историческим source. `expected.json`
отличается только ранее добавленным `label_any:true` у `HttpStatusCode`;
значения, типы и две строки прежние.

Модель получает только четырёхстрочное бизнес-задание GET
`https://httpbin.org/anything` с параметрами RequestId/Key, входной CSV UTF-8
(`r-a,"a b&я"` и `r-b,"x/y?"`), свежий собственный путь пакета вместо
`{{PACKAGE_PATH}}`. Требуется взять вернувшиеся RequestId/Key и реальный HTTP-код,
выгрузить три столбца в CSV рядом с сохранённым пакетом. Oracle, expected,
история отказов и инструкции обработчиков модели не передаются.

Четыре класса (DOM-owner, `UI_SCAN_LIMIT`, ожидание готовности, подтверждение
журнала JS) не имеют установленных case/run ID: каждый BLOCKED отдельно.
`100909-r1` известен для скачивания, но связь с медленным host не подтверждена:
эта строка также BLOCKED. Отсутствующий investigations-каталог и HTTP401
исторических архивов не блокируют известный WIZARD-комплект. Нового требования
старого timestamp/snapshot нет. Повтор естественного отказа не гарантирован;
успешная задача без перехода не станет recovery PASS.

Private evidence Task3: `/tmp/loginom-browser-recovery-task3-4wmxpueb`;
`evidence/preflight.json` фиксирует сравнение до запуска.

До первого live run выбрана `openai/gpt-5.6-sol`, variant `medium`: фактически
использована отдельным test model-smoke 19.10 и присутствует в текущем installed
`models openai --verbose`; `capabilities.input.image:true`, medium доступен.
Выделенный same-project OAuth имеется, исходник читается без изменения,
копия0600 помещена в новый CLI profile. Токены в отчёт не включаются.
По решению controller это выбор реально доступной модели для текущей Task3;
прежнее требование `gpt-6.1-sol/medium` относится к корпусу package-docs 07.10.
Сравнимость с тем корпусом не заявляется, модель внутри попытки не меняется.
В текущем OAuth-каталоге все15 моделей имеют image:true; текстовая модель
пока не выбрана. Public model-list preflight не является модельным запуском
или доказательством реального screenshot content.

### Image run: задача выполнена, recovery BLOCKED

Новая фактическая CLI session `ses_ea685a818ffefdcuJvJtZoMRd9`, runtime
`6704466b-5ade-4429-b644-55d1e3db31e1`, attempt
`b7387485-29c1-4877-a241-f04d2364301a`. Current task `browserRecovery:true`,
workspaceReady true; связь session/hash/attempt проверена. Модель и medium
сохранены в projected messages.

Естественный отказ не повторился: recovery calls0, screenshot calls0,
`recovered_via_browser_count:0`. Recovery — **BLOCKED**, не PASS.
Полный фактический provider tool catalog не захвачен; image capability и исходный
фильтр tools не доказывают публикацию screenshot или настоящий image content.

Текущий parse output прошёл существующий expected-output matcher; два actual
CSV-файла artifact store совпали, UTF-8/57байт/SHA256
`59090a0ade71b6a02213718ac850a6d120e6f1259fce149cc35acaa609ce1733`.
CSV содержит точные две ожидаемые строки. Public JS parameters берут RequestId/Key
из `JSON.parse(Response).args`, HttpStatusCode из ответа REST.
Canonical Save `save-httpbin-package` SUCCEEDED, reopened:false,
workflow_preserved:true, modified:false; persisted_content_verified:false
и arrangement result_unconfirmed сохранены. Cold readback не выполнялся.

Native `saved-package-cleanup.json`: SUCCEEDED, package_closed:true,
logged_out:true, unsaved_changes_discarded:false, packages_after0.
Task transport ACKtrue/exit0/no signal; CLIexit0/пустой stderr/writer освобождён.
Все29 наблюдавшихся собственных процессов setup+run отсутствуют. Исходный
dedicated OAuth hash не изменился. Raw evidence — `image/`; сводки
`evidence/image-summary.json`, `output-matcher.json`, `csv-check.json`.

### Text pre-run

После полного image cleanup один public `models --verbose` показал
`opencode/big-pickle`: input.image:false, toolcall:true, active, variants отсутствуют.
Штатный provider autoload допускает бесплатную модель с public authorization
без отдельного секрета; provider/config/capabilities не изменяются.
Controller разрешил одну последовательную попытку этой моделью с default variant
на том же бизнес-комплекте и новым private profile/UUID. Реальная доступность
provider проверяется этой попыткой; при отказе перебора моделей не будет.

### Text run: BLOCKED provider, Desktop не запущен

Фактическая новая session `ses_ea67c88c1ffeWIbFC5AYXgRdJR` подтверждает
`opencode/big-pickle`. Setup exit0, но первый provider turn получил
`AI_APICallError: Rate limit exceeded. Please try again later.`
Внутренний title request записал `AI_RetryError: Failed after 3 attempts`
с той же причиной. Эти автоматические повторы сохранены как наблюдение;
дополнительного запуска, смены модели или настройки retry не было.
После обнаружения ошибки отправлен SIGINT только собственному CLI.

CLI exit130/no signal, stderr пуст, writer освобождён, все18 наблюдавшихся
процессов setup+run отсутствуют. Tool calls0, task session.json отсутствует:
task capability **NOT_OBSERVED**, а не false. Task package/native Close/logout/
task transport не наблюдались; отдельные management validation и knowledge
receipts имеют ACKtrue/exit0. Их успех не заменяет task cleanup.
Результат задачи отсутствует; recovery count0, screenshot publication не проверена.
Оба профиля также записали auxiliary background npm install404 для
`@loginom-ai-agent/plugin`; причина отдельно не исследовалась, image PASS
этим предупреждением не отменяется. Сводка: `evidence/text-summary.json`.

Desktop real-model строка **BLOCKED**: ни один CLI run не дал recovery transition,
на котором brief разрешает её выполнять. Новых Desktop model session/receipt нет.

### Итоговая матрица исходной Task3 и §11

| Естественный класс 18.10 | Идентичность и новый результат |
|---|---|
| DOM-owner | BLOCKED: исходный case/run ID не установлен |
| UI_SCAN_LIMIT | BLOCKED: исходный case/run ID не установлен |
| WIZARD_OPEN_NOT_CONFIRMED | LAB-91 `103006-r3`; image `ses_ea685a818ffefdcuJvJtZoMRd9`: бизнес-результат PASS, recovery BLOCKED/no transition; text `ses_ea67c88c1ffeWIbFC5AYXgRdJR`: BLOCKED/provider rate limit |
| Ожидание готовности | BLOCKED: исходный case/run ID не установлен |
| Подтверждение журнала JS | BLOCKED: исходный case/run ID не установлен |
| Скачивание на медленном host | BLOCKED: для `100909-r1` не подтверждена принадлежность к slow-host классу |

Ниже PASS source означает только ранее зафиксированный scripted native/source
результат из [smoke](../2026-10-20-browser-recovery-smoke/report.md) и
[source](../2026-10-20-browser-recovery-source/report.md); новых fault-прогонов
Task3 нет. Неповторённые unit/source проверки не названы installed/model PASS.

| Критерий §11 | Имеющееся evidence и граница |
|---|---|
| Исчерпанное восстановление mapping/настройки | Source BR-S1/S3 PASS; natural installed recovery BLOCKED/no transition |
| Release `user_action`, T1 | Source BR-S1 PASS; real-model T1 BLOCKED/not observed |
| Сломанный DOM-предикат, completed | Source BR-S3 PASS; real-model completed recovery BLOCKED/not observed |
| Потерян ответ выполнения/экспорта | Source BR-S4 PASS; BR-S5 FAIL/no_scroll_owner с прежней неопределённостью файла/Save/cleanup; новая model строка BLOCKED/not observed |
| Частичное восстановление, тот же узел | Source BR-S1/S2 continuable PASS; natural model BLOCKED/not observed |
| Неверные параметры до изменений | BLOCKED для этой model проверки: требуемый отказ не наблюдался |
| Живой старый исполнитель, поздний ответ | BLOCKED для installed/model: не воспроизводилось; отдельные source/unit claims не расширяются |
| Dock/browser вне своей фазы | Source BR-S6 отрицательные assertions PASS, cleanup BLOCKED; installed/model BLOCKED/not observed |
| Запрещённый tool/navigation/reload | Source BR-S6 проверил observe/evaluate/navigate/filename отказы; reload и installed/model здесь BLOCKED/not observed |
| Повторная ошибка/смена ID/continuable budget | Source BR-S3 повторная ошибка и BR-S6 budget evidence; полный installed/model критерий BLOCKED/not observed |
| Лимит/отмена/падение runtime | Source BR-S6 budget assertions PASS, native cleanup BLOCKED/ACKfalse/exit1; Task3 provider cancellation не является recovery cancel/crash проверкой — BLOCKED |
| Текстовая модель | BLOCKED/provider rate limit; image:false/toolcall:true — catalog facts, фактическая screenshot-tool absence не доказана |
| Модель с изображениями | BLOCKED/image content: capability true, screenshot calls0, настоящий image reply отсутствует |
| Prod CLI/Desktop Linux full recovery | CLI business output/Save/lifecycle PASS, recovery BLOCKED; Desktop model BLOCKED/no eligible CLI transition; Windows/macOS not checked |
| Flagged/dev/env controls | PASS только availability: принятые Task1 CLI4/4 и Task2 installed true/unpackaged false, flag1/flag0 DEB/static; не recovery quality |

### Возврат исходного install state

Перед удалением проверено отсутствие процессов, исполняемых из обоих собственных
payload. Из `/tmp` выполнен stock `artifact/uninstall.sh` с исходным CLI install
HOME: exit0, `uninstalled:true`, `profilesPreserved:true`. Далее
`sudo -n dpkg --remove loginom-ai-agent`: exit0, без purge. Dpkg оставил
`deinstall ok config-files`; наблюдались update-alternatives warnings об удаляемой
цели/dangling alternative, итоговые launcher и `/opt/loginom-ai-agent` отсутствуют.
CLI launcher, versioned payload и current.json также отсутствуют.

Metadata-снимки семи собственных старых/новых профилей до/после совпали;
исходный failed writer guard и dedicated OAuth hash неизменны. Артефакты,
все raw attempts и evidence сохранены. Два temporary Node drivers удалены.
`evidence/teardown-before.json`/`teardown-after.json` и
`cli-uninstall.*`/`desktop-remove.*` содержат проверки/вывод/exit.
Production repair, S5, merge, release и публикация не выполнялись.
