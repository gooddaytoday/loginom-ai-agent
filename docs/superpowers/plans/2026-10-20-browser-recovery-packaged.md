# Browser recovery: packaged acceptance implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Выполнять последовательно, отмечать только подтверждённое.

**Goal:** Выполнить доступную часть Task 3 [плана 5](2026-10-19-browser-recovery-5-acceptance.md): доказать capability настоящих установленных Linux CLI/Desktop и отдельно установить возможность естественных модельных прогонов.

**Architecture:** Существующие build scripts, installer и публичный CLI/backend; `oracleProvider` служит только оператором проверки доступности. Первый сквозной результат — установленный CLI с флагом, настоящий task runtime с `browserRecovery:true`, собственный Save и штатное завершение. Production code не меняется.

**Tech Stack:** Закреплённые Product Bun/Node/Chromium, standalone CLI, Electron, Playwright, DEB.

**Spec:** [design §4, §11](../specs/2026-10-19-browser-recovery-design.md), исходная Task 3 сохраняет критерии; S5 остаётся отложенным и не зависит от этой проверки.

## Global Constraints

- Каждый artifact создаётся в новом каталоге из чистого зафиксированного source; фактический SHA и build flag берутся из manifest. Нельзя переписывать manifest или использовать CLI_BUNDLE для положительной installed строки.
- На диске читать верхнеуровневое `session.json.browserRecovery` текущей task attempt; management validation и in-memory `session.metadata` не заменяют его. Отсутствующий файл не означает false.
- Проверки выполняются по одной. Профили, HOME/XDG, workspace, package path и evidence — собственные, отдельные от пользовательских; секреты только в private stdin/files. Sandbox включён, non-root, никаких Discard и повторов неопределённых изменений.
- Публичные skill → Dock tools, штатные permission flags и cleanup policy сохраняются. `acceptanceFault`, внутренний host/runtime, synthetic browser replies и новые hooks/API для этих строк не используются.
- Capability, успех подготовки/Save, native Close/logout, transport ACK/exit и OS absence — отдельные факты. Сохранить уже подтверждённый boolean при последующем отказе; успешную очистку не угадывать.
- Каждая строка модельных прогонов требует заранее установленного исторического case/run ID; отсутствующие ID блокируют соответствующую строку, а не остальные известные кейсы. Scripted provider не доказывает качество модели или recovery. Windows/macOS и release enablement/merge/publication исключены.

## Review Focus

- Runtime env не подменяет compiled flag; external bundle не считается verified installed bundle — Task 1.
- Сопоставление настоящего task session с текущим запуском, отсутствие false из validation/старого файла — Tasks 1–2.
- Новый draft требует собственного подтверждённого Save для normal CLI shutdown — Task 1.
- DEB installation, installed ASAR/resources и `app.isPackaged` не заменяются unpacked запуском — Task 2.
- Неполные исторические ID, HTTP 401 и отсутствие естественного отказа не превращаются в PASS — Task 3.

## Размер и границы

Ожидается 5–6 tracked docs, около +260/−15 строк суммарно, включая этот план, отчёт, runbook и checkpoints; production/test source — 0. При удвоении пересмотреть подход. Короткие одноразовые drivers лежат вне Git, используют существующий `oracleProvider` и public APIs; после проверки удалить driver, оставить private evidence. Это необходимая связь public interface → runtime metadata, поскольку management/status и skill inventory сами task runtime не запускают. Ни нового reusable harness, ни fixtures, ни зависимостей, ни дополнительных release artifacts/AppImage или Docker matrix нет.

### Task 1: Установленный CLI и три отрицательные CLI-строки

**Files:** Create `docs/testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-packaged/report.md`; Modify owning progress в `2026-10-19-browser-recovery-5-acceptance.md` и checkpoint в `2026-10-19-browser-recovery.md`.

**Interfaces:** Existing `packages/loginom-host/script/build-cli.ts`, artifact `install.sh`/`uninstall.sh`, `packages/loginom-host/script/oracle-provider.ts`, public `loginom setup`/`run`. Output: actual source/manifest identity, current task session boolean и раздельные cleanup facts для каждой CLI строки.

- [x] **Step 1: Первый установленный CLI с флагом.** Из root вызвать `LOGINOM_AI_AGENT_BROWSER_RECOVERY=1 LOGINOM_AI_AGENT_CHANNEL=prod <pinned-bun> packages/loginom-host/script/build-cli.ts <new-absolute-dir>` с pinned NODE_SOURCE/BROWSER_SOURCE; сохранить полный archive/manifest verification output. `env HOME=<own-existing-home> <artifact>/install.sh` устанавливает только свой launcher/payload; prefix-аргумента нет. Проверить installed manifest/resources и launcher realpath; sudo меняет owner/mode только собственного chrome-sandbox.
- [x] **Step 2: Первый public runtime.** Новый CLI_PROFILE и workspace вне репозитория, PURE=1, без CLI_BUNDLE. Private setup stdin `{apiKey,password,username,url}`; `loginom setup --headless --stdin-json --format json`. Existing oracleProvider задаёт public run `run --headless --format json --dir <workspace> --model test/test-model --auto -- <prompt с явным разрешением Save собственного UUID path>`. Последовательно skill `loginom-automation`, `dock_prepare {intent:"new_draft",operation_id:"availability-prepare"}`, `dock_action_describe {action_key:"package.save_checkpoint"}`, затем `dock_action_run {action_key:"package.save_checkpoint",operation_id:"availability-save",parameters:{path:"/<own-account>/browser-recovery-<uuid>.lgp",conflict_policy:"fail"}}`. Это канонический final Save из bundled skill: awaiting Save с сохранёнными package/workflow/tab, без Close/Open; переоткрытие исходной Task3 не требуется. Не создавать узлы и не загружать CSV. При native `modified:true` следовать только существующему Save advice/точному контракту checkpoint, не повторять неопределённую мутацию. После provider.finish дождаться штатного shutdown. Проверить `session.json.browserRecovery===true`, связь session/attempt с данным CLI run, current Save, saved-package-cleanup, ACK/exit0, `.writer` и собственные процессы. При неожиданном исходе остановить этот запуск и записать точную ошибку/очистку до новой гипотезы.
- [x] **Step 3: Остальные CLI строки после первого успеха.** Отдельный контрольный полный build без флага (`LOGINOM_AI_AGENT_BROWSER_RECOVERY=0`), собственные install HOME/profile; та же публичная цепочка при runtime env flag=1/channel=prod даёт false. Установленный flag1 CLI с `CLI_BUNDLE=<его собственные resources/loginom>` даёт false; source CLI `bun packages/agent/src/standalone.ts` с теми же dev resources даёт false. Каждая строка — свежий profile/workspace/UUID package/attempt; не менять байты build или cleanup policy. Manifest true/false сверить с входом сборки.
- [x] **Step 4: Проверить и зафиксировать.** Raw evidence остаётся private, report без секретов; independent task review по diff и evidence. Удалить одноразовый driver. После завершения собственных CLI удалить контрольную установку штатным uninstall с её HOME; flag1 installation сохранить для Task 3, удалить тем же способом после последних требуемых запусков либо при зафиксированном model blocker. Private profiles/evidence сохранить. `git diff --check`, commit `docs(testing): verify installed CLI recovery availability`. Отметить лишь фактически завершённые строки; исходная Task 3 остаётся открытой.

### Task 2: Установленный Desktop DEB и unpackaged control

**Files:** Modify тот же packaged report, `docs/testing/loginom-ai-agent/browser-recovery.md`, owning progress/checkpoint; `docs/migration/linux-implementation-checkpoint.md` — только короткая текущая ссылка на report.

**Interfaces:** Existing Desktop build/prebuild, electron-builder, write-manifest/verify-artifact; public `window.api.loginom` и backend session/prompt API по существующему `skills-acceptance/desktop.mjs`. Output: installed true, unpackaged false, manifest flag0/flag1 и фактическая очистка.

- [x] **Step 1: Flagged DEB.** После принятия Task 1 собрать с flag1/channel prod и pinned ресурсами через `bun run build`, затем `bun run package --linux deb --x64 --publish never --config.directories.output=<new-dir>` из `packages/desktop`. Создать соответствующий source archive чистого commit и release manifest; static verifier обязан PASS. AppImage не нужен для исходной Task 3.
- [x] **Step 2: Installed runtime.** Перед установкой сверить актуальный dpkg/launcher state; на исходном read-only осмотре package и launchers отсутствовали. Если появился чужой installed payload/процесс, не заменять его: зафиксировать конкретный install blocker. При свободном пути штатно установить DEB, проверить dpkg/symlink/desktop Exec и ASAR/resources equality. Запустить установленный binary non-root с отдельными HOME/XDG и TEST_ROOT/TEST_ONBOARDING через существующий Electron driver pattern, задать private connection public API, отправить ту же короткую scripted цепочку Task 1 через public backend. Требуется текущий task `session.json.browserRecovery===true`; завершить собственный app обычным quit и записать native/ACK/OS факты отдельно.
- [x] **Step 3: Controls и возврат установки.** Тот же flag1 build запустить через development Electron с package directory (не packaged): текущий runtime boolean false. Затем отдельный build/DEB без флага и manifest/static verification false; это artifact control, дополнительная installed строка исходным планом не требуется. Если исходно DEB отсутствовал, штатно удалить только установленный тестом package после последнего необходимого собственного app run (при подтверждённом model blocker — в Task 2; иначе после модельной сессии Task 3), не purge и не удалять пользовательские profiles. Сохранить private evidence.
- [x] **Step 4: Review и commit.** Проверить raw identities/cleanup и `git diff --check`, независимый task review, обновить только подтверждённые строки. Commit `docs(testing): verify installed Desktop recovery availability`.

### Task 3: Естественные отказы и итоговая матрица исходной Task 3

**Files:** Modify packaged report, runbook и owning checkpoint/progress.

**Interfaces:** Дизайн §11 и исходная Task 3 Step 3; существующие business task/evals runners, `recovered_via_browser_count`. Никакого нового runner/fixture infrastructure.

- [x] **Step 1: Закрепить исходные кейсы до первого live model run.** Подтвердить точные case/run ID, входы и принадлежность шести классов 18.10. Подтверждён WIZARD-кейс LAB-91 `103006-r3`: аналитический срез18.10 связывает ID с ошибкой, source025b73afac и текущий REST GET business task/CSV совпадают; существующий комплект можно повторить новой попыткой. Отдельный timestamp/snapshot старого эпизода не вводится как новый гейт. Для четырёх классов ID отсутствуют, для `100909-r1` не установлен признак медленного host; соответствующие строки BLOCKED. Авторский investigations каталог отсутствует, указанные архивы GET HTTP401, но это не блокирует уже подтверждённый WIZARD-кейс. До первого model run записать в report его ID, исходный комплект и границы; повторение естественного отказа не гарантируется.
- [ ] **Step 2: Прогоны при доступном наборе.** Existing installed flag1 CLI: модель с изображениями, затем текстовая модель; затем одна установленная Desktop сессия с реальной моделью на кейсе, где CLI перешёл в recovery. Выбор реально доступных model IDs/capabilities и авторизации — по тестовым профилям; не копировать секреты в report. Записать actual run IDs, screenshot-tool availability, `recovered_via_browser_count`, результат задачи и очистку. Отсутствие естественного перехода — BLOCKED с ID нового прогона, не fault injection.
- [ ] **Step 3: Итог и review.** Заполнить матрицу §11 PASS/FAIL/BLOCKED с evidence и границами: scripted/source/installed/model отдельно. Отметить Windows/macOS not checked. Независимое ревью только новых результатов; commit `docs(testing): record packaged browser recovery acceptance`. При недоступных исторических кейсах сохранить BLOCKED, исходную Task 3 и release gate не закрывать.

## Progress

Tasks1–2 приняты independent spec compliant/quality Approved без обязательных замечаний: CLI availability4/4, Desktop installed true/unpackaged false, оба flag DEB/static/source archive и необходимые package checks. Production не менялся. [Packaged report](../../testing/loginom-ai-agent/reports/2026-10-20-browser-recovery-packaged/report.md) сохраняет actual sources, первый SaveAs cleanup FAIL/guard, Desktop pre-task Bun timeout и проверочные ошибки; minor stderr disclosure Task2 дополнено.

Task3Step1 подтверждён до live: известный WIZARD LAB-91/103006-r3 и исходный REST GET комплект. Image openai/gpt-5.6-sol/medium выполнила текущий business output/CSV/Save/native cleanup; recovery count0/no transition → BLOCKED. Text opencode/big-pickle получила provider rate limit, штатный SIGINT/exit130,0tools/0task runtime → NOT_OBSERVED native task facts. Desktop model BLOCKED/no eligible CLI transition; missing historical IDs/slow-host association блокируют свои строки. Оба собственных CLI/Desktop штатно удалены без purge, profiles/evidence/oldguard/auth сохранены. Root проверил raw результата/cleanup/teardown. Step2 и исходная Task3 открыты; Step3 report/commit выполнены, independent review ещё ожидается. Следующий шаг — review текущего среза, затем возврат к первому сквозному S5. Release gate остаётся закрыт.
