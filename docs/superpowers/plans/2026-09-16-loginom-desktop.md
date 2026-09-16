# План: встроенный исполнитель, настройки и первый запуск

Дата: 2026-09-16. Статус: к реализации; продуктовый код этой задачей не менялся.
Основание: [согласованная спецификация](../specs/2026-09-16-loginom-ai-agent-desktop-design.md).
Зависимость: задачи F1–F6 из [foundation](2026-09-16-loginom-foundation.md).
Здесь `packages/agent` означает переименованный `packages/opencode`.

Цель: встроить перенесённый Dock в production backend v1 и дать пользователю
один мастер/раздел настроек без установки плагина и внешнего runtime.
Стек: Electron main/preload, Solid, TypeScript, Effect в backend v1,
существующий клиент Dock `.mjs` в управляемом процессе. V2 не является целью.

## Контракты и владение состоянием

Новые файлы и API ниже — задания на создание, не описание уже имеющегося кода.
`packages/product/src/index.ts` задаёт идентичность; его `Product` используется
в путях и ресурсах. Схемы сериализуемых Loginom-сообщений размещаются в
`packages/schema/src/loginom.ts`; там нет Electron, файловой системы или сервисов.
Client не импортирует Core/Server. Публичные Protocol/HttpApi при необходимости
меняются через исходные схемы и `bun run generate` из `packages/client`.

Desktop main владеет connection service, общей блокировкой применения настроек,
хранилищем credentials и supervisor процессов. `packages/loginom-host` содержит
адаптер backend и supervisor/transport с раздельными entrypoints. Backend v1
связан с main через приватный MessagePort, переданный при запуске utility process.
Все backend instances этого desktop обращаются к одному coordinator. Второй
экземпляр того же профиля не создаёт независимый coordinator. Remote/WSL backend
не получает локальные credentials автоматически: в этой версии Loginom доступен
в комплектном локальном backend; обычные возможности других backend сохраняются.

Renderer видит только `window.api.loginom`:

```ts
type SecretEdit = { operation: "preserve" } | { operation: "replace"; value: string }
type PasswordEdit = SecretEdit | { operation: "empty" }
type Candidate = {
  revision: number
  url: string
  username: string
  apiKey: SecretEdit
  password: PasswordEdit
}
// read(): несекретные поля, revision, hasApiKey/hasPassword, status.
// check(candidate): { validationId, expiresAt } либо типизированная ошибка стадии.
// save({ validationId, revision }): status; секреты второй раз не передаются.
// cancelPending({ revision }): status; status(): тот же безопасный снимок.
```

`validationId` — случайный одноразовый token, связанный с кандидатом, revision и
профилем приложения; живёт 5 минут только в main. Редактирование требует новой
проверки, устаревшая revision даёт conflict, а не перетирает другое окно.
При первой настройке preserve ключа недопустим; пустой пароль допустим.
Детали ключа/пароля не возвращаются ни в одном результате или исключении.
Для кнопки сохранения UI при необходимости сначала вызывает check.

## D1. Выделить переносимый runtime и управляемый запуск

**Файлы:** `packages/loginom-runtime/package.json`, перенесённые `client/` и
связанные runtime sources по source-map; новые `src/managed-entry.mjs`,
`test/managed-entry.test.mjs`; `packages/loginom-host/package.json`,
`src/transport.ts`, `src/supervisor.ts`, `test/transport.test.ts`.

- [ ] Зафиксировать исходные тестовые команды Dock по импортированному package.json;
  выполнить клиентские tests из `packages/loginom-runtime`, сохранить baseline.
  Не запускать старые installers, auto-update Dock или Codex/Hermes adapters.
- [ ] Добавить контрактный тест запуска с абсолютными путями Node/Chromium,
  содержащими пробелы и Unicode, и отдельным writable user-data. До реализации
  он должен падать на отсутствующем managed entrypoint.
- [ ] В managed entrypoint принять версию протокола, generation, chat/run identity,
  корни profiles/artifacts и resource manifest. Убрать поиск Node/Chrome в PATH,
  first-run downloads и независимое автообновление Dock из этого пути запуска.
- [ ] Передавать ключ и пароль по отдельному приватному pipe/MessagePort main →
  runtime; не через argv, URL, process-wide env, MCP arguments или stdout.
  Этот канал не является модельным MCP endpoint и не включён в его tool list.
- [ ] Supervisor запускает процесс только для своего chat/profile; ready содержит
  protocol version, generation, runtime/browser hashes и identity, без secrets.
  Несовпадение manifest/generation закрывает этот процесс и выдаёт stage error.
- [ ] Добавить bounded startup/shutdown, обработку EOF/abort/crash, уничтожение
  только принадлежащего приложению дерева процессов. Ошибки sanitize до IPC/log.
  Все изменяемые файлы вне install directory; Chromium sandbox не отключается.
- [ ] Проверить реальным дочерним процессом ready, отказ, завершение и отсутствие
  секретов в captured output. Browser launch дополнительно проверяется R1–R3.
- [ ] В host добавить scripts `test: bun test`, `typecheck: tsgo --noEmit` и tsconfig
  по соседнему package; выполнить `bun test test/transport.test.ts` и
  `bun typecheck` из `packages/loginom-host`. Commit `feat(runtime): add managed Loginom process`.

## D2. Подключить инструменты, доверенные inputs и изоляцию чатов

**Файлы:** `packages/loginom-host/src/index.ts`, `src/adapter.ts`, `src/inputs.ts`,
`src/run-registry.ts`, `test/adapter.test.ts`, `test/inputs.test.ts`;
`packages/agent/src/session/prompt.ts`, `src/tool/registry.ts`,
`src/session/run-state.ts`; `packages/desktop/src/main/server.ts`.

- [ ] Сначала написать интеграционный тест двух чатов с одинаковым именем файла,
  разными contents и разными trusted message IDs: grants, browser profile,
  operation IDs и output artifacts не должны пересекаться.
- [ ] Подключить встроенный adapter без runtime npm install. Включать инструкции
  Loginom и tools перед provider turn только при готовом подключении. Использовать
  host-bound dispatch, не общий `MCP.add` с идентичностью последнего чата.
- [ ] Внутри исполняемой работы v1 `ensureRunning`, до первого получения Loginom
  tools/system context, получить run lease. Не брать lease снаружи: повторный
  присоединившийся вызов не должен увеличивать число активных задач.
  Сохранять lease на весь drain, включая промежутки между tool calls и моделью.
- [ ] Dispatch берёт session/run/generation из доверенного registry. Текущий
  исходный user message берётся из v1 history; `ToolContext.messageID` может быть
  ID assistant и не заменяет ID пользовательского вложения. Model arguments
  никогда не задают session, generation, permission grant или runtime profile.
- [ ] Admission вложений использует существующие host-authorized picker/upload
  данные и исходное user message. Произвольный путь из текста модели не выдаёт
  права чтения. Определить границу чтения локального файла и lifetime grant;
  одинаковые имена не перезаписывают чужой upload/artifact.
- [ ] На время закрытого admission gate новый run не получает Loginom capability;
  пользователь видит ожидающее применение, остальные инструменты/чаты работают.
  Уже начатый run сохраняет старые инструменты и generation до завершения.
  Включение Loginom в середине уже начатого run откладывается до следующего drain.
- [ ] Завершение/abort освобождает lease синхронно с финализацией реальной работы,
  а не по UI idle event. Ambiguous receipt удерживает recovery lease отдельно.
  Сохранить прежние cancellation, receipts, reconciliation и validation hooks.
  Передавать interrupt в принадлежащий run; не переписывать SessionV2 orchestration.
- [ ] Запустить host tests/typecheck; из `packages/agent` выполнить
  `bun test test/loginom/host.test.ts` (создать этот integration test) и
  `bun typecheck`. Commit `feat(agent): integrate trusted Loginom tools`.

## D3. Реализовать хранение и узкий IPC настроек

**Файлы:** `packages/schema/src/loginom.ts`;
`packages/desktop/src/main/loginom/connection-store.ts`, `credentials.ts`,
`connection-service.ts`, соответствующие `*.test.ts`;
`src/main/ipc.ts`, `src/preload/index.ts`, `src/preload/types.ts`.

- [ ] Добавить схемы Candidate, safe ConnectionView, ошибки стадий и IPC response.
  Пароль preserve/replace/empty различим; replace требует непустое значение,
  empty записывает именно пустую строку. Пустой API key при редактировании UI
  преобразуется в preserve; при первой настройке отклоняется.
- [ ] Тестами зафиксировать сериализацию: write допускает secrets, read/status/
  errors/export никогда их не содержат. Провайдеры моделей не меняются.
- [ ] На Linux атомарно сохранять `connection.json` с plaintext API key/password
  в product config, `0600`, user-owned directory. Проверять права временного и
  окончательного файла; использовать write/fsync/rename, не общий config API.
- [ ] На Windows/macOS использовать Electron safeStorage с защищённым ОС ключом;
  хранить encrypted bytes отдельно от несекретной metadata. Недоступность защиты
  блокирует сохранение, без plaintext fallback. Реальную OS-проверку вынести в
  native runbooks, unit test проверяет только ветвление адаптера.
- [ ] Хранить generation records и атомарный active pointer. На Windows/macOS
  сначала durable credential blob, затем metadata/pointer; старые blobs удалять
  только после завершения их leases. Тестировать отказ записи без потери active.
- [ ] Не помещать connection store в generic `storeGet`/config registry; закрыть
  доступ через общие store IPC и debug export. Credentials нет в renderer storage.
  Проверять sender frame/window и schema во всех новых IPC handlers.
- [ ] В read вернуть только URL, username, derived folder, наличие secrets,
  revision/generation и состояние. Сохранённое поле пароля остаётся пустым;
  наличие пароля отображается текстом рядом, без placeholder и скрытого значения.
- [ ] Из `packages/desktop` выполнить `bun test src/main/loginom/connection-store.test.ts`
  и `bun test src/main/loginom/credentials.test.ts`, затем `bun typecheck`.
  Commit `feat(desktop): store Loginom connection settings`.

## D4. Проверять кандидата без обращения к папке

**Файлы:** `packages/desktop/src/main/loginom/connection-service.ts`,
`connection-service.test.ts`; `packages/loginom-runtime/src/connection-check.mjs`,
`test/connection-check.test.mjs`, перенесённый browser/login handler.

- [ ] Добавить контрактный тест: невалидный key, неверный пароль, недоступный
  сервер/Loginom, пустой пароль и уже вошедшая чужая identity. Во всех отказах
  active generation/профили рабочих чатов остаются прежними.
- [ ] Валидировать HTTP/HTTPS URL без credentials в URL; имя — один сегмент,
  без `/`, `\`, управляющих символов, `.`/`..`. Сохранять регистр и допустимое
  имя точно, без молчаливой нормализации. Корень вычислять как `/${username}`.
- [ ] Runtime добавляет `testable=true` через URL API, сохраняя прочие параметры;
  исходный пользовательский URL сохраняется отдельно. Endpoint знаний берётся
  из release Product/resources либо технического app override, без пятого поля.
- [ ] Проверка использует отдельную краткоживущую сессию: авторизация сервера
  и реальный Loginom login. Пароль вводится private host API напрямую в browser;
  ни модель, ни MCP tools не получают его и не выполняют ввод по текстовой инструкции.
- [ ] На уровне dispatcher в validation mode разрешить только auth/login операции.
  Не вызывать folder list/stat/test upload и не открывать файловую панель для probe.
  Тест должен запрещать все такие вызовы и всё равно успешно завершать check.
  Не отключать ошибки доступа при последующей реальной работе с файлами.
- [ ] Связать успешную проверку с одноразовым validation token. Проверка не
  активирует профиль; expiry/revision conflict требуют нового check. При отказе
  сохранить несекретный draft, уничтожить временный браузер и private candidate.
- [ ] Из runtime выполнить `node --test test/connection-check.test.mjs`, из desktop
  `bun test src/main/loginom/connection-service.test.ts` и `bun typecheck`.
  Реальный Loginom auth проверить дополнительно по CON-01–CON-04, не выдать
  результат test double за доступность сервера. Commit `feat(loginom): validate connection candidates`.

## D5. Применять поколения после общего барьера и восстанавливаться

**Файлы:** `packages/desktop/src/main/loginom/coordinator.ts`, `coordinator.test.ts`,
`src/main/index.ts`; `packages/loginom-host/src/run-registry.ts`, `supervisor.ts`,
`test/lifecycle.test.ts`; `packages/agent/test/loginom/lifecycle.test.ts`.

- [ ] Написать тест двух backend instances/окон: generation 7 активна, обе задачи
  удерживают lease, кандидат 8 проверен; save закрывает admission новых Loginom
  задач, ни один старый процесс не прерывается после завершения только одной задачи.
- [ ] Реализовать единую сериализованную очередь coordinator: revisions, pending,
  leases и cancelPending. Не вызывать `global.config.update`, Instance.dispose
  или общий sidecar restart для Loginom settings.
- [ ] При нуле task/recovery leases подготовить новое поколение под закрытым
  gate; проверить managed runtime ready + generation handshake. Для каждой
  следующей chat session создаётся собственный профиль; смена URL/username всегда
  создаёт чистый профиль без старых cookies. Старое active живёт до commit.
- [ ] После ready атомарно записать active pointer, открыть gate и затем завершить
  старые idle runtimes. Ошибка подготовки оставляет старое active, pending.error
  и открытый gate старого поколения. Потеря обоих runtime даёт recoverable blocked
  только Loginom с retry действием; остальные чаты продолжают работу.
- [ ] Проверить crash до ready, после ready/до pointer, после pointer/до cleanup:
  startup читает durable pointer и generation handshake, закрывает orphan процессы,
  восстанавливает ровно одно active. Не повторяет ambiguous business operations.
  Не удаляет старые receipts до их reconciliation/явного завершения.
- [ ] Отмена/замена pending работает с compare-and-swap revision; изменение другого
  окна отражается через status. Проверенный кандидат не сохраняется вечно:
  если ожидание превысило validation expiry, перед активацией повторить auth check
  на сохранённом кандидате; не заменять этим ready handshake.
- [ ] Добавить проверку утечки секретов в событиях/ошибках; в test-only harness
  предусмотреть адресную инъекцию runtime-start failure и паузу перед pointer commit
  для CON-08. Не оставлять доступный модели/произвольному renderer fault endpoint.
- [ ] Запустить `bun test src/main/loginom/coordinator.test.ts` из desktop,
  `bun test test/lifecycle.test.ts` из host и `bun test test/loginom/lifecycle.test.ts`
  из agent; typecheck этих пакетов. Commit `feat(loginom): apply settings after active tasks`.

Ожидаемый смысл assertions (имена test harness создаются вместе с тестом):

```ts
expect(state.activeGeneration).toBe(7)
expect(state.pendingGeneration).toBe(8)
expect(state.acceptsNewLoginomRuns).toBe(false)
// После обоих release и successful ready/commit:
expect(state.activeGeneration).toBe(8)
expect(state.acceptsNewLoginomRuns).toBe(true)
```

## D6. Сделать общую форму мастера и доступные настройки

**Файлы:** `packages/app/src/components/settings-loginom.tsx`,
`settings-loginom.test.tsx`, `dialog-settings.tsx`, `src/context/platform.tsx`,
`src/pages/layout.tsx`, `layout-new.tsx`, shared sidebar component,
`src/i18n/ru.ts`, остальные действующие locale keys;
`packages/desktop/src/renderer/onboarding.tsx`, `src/renderer/index.tsx`.

- [ ] Прочитать утверждённые §7 спецификации и макет в задаче. Сделать одну форму,
  используемую мастером и Loginom settings; платформенный bridge опционален для
  web app, без импорта Electron в app. Пустой bridge не означает настроенный Loginom.
- [ ] Четыре поля: API key, URL `http://logi-test-plan.bg.local/app/`, username
  `user`, password `""`. У password нет атрибута placeholder в любом состоянии.
  Корень `/<username>` только readonly; нет folder picker/probe и поля модели.
- [ ] Объяснить сохранённые secrets отдельными подписями. Действия пароля:
  оставить, заменить, использовать пустой; API key заменить/оставить.
  Маскировать secrets, очищать локальный draft после save/закрытия формы.
- [ ] Добавить прямую кнопку «Loginom» в оба поддерживаемых sidebar layout и
  раздел того же уровня в настройках. Успех check не выдавать за применённые
  settings; pending показывает ожидание/отмену, failure — стадию/исправление.
- [ ] Мастер завершается по active connection, а не старому onboarding flag или
  наличию default project. «Позже» открывает приложение; после нового запуска
  незавершённая настройка предлагается снова. Existing model provider flow сохраняется.
- [ ] В unit/component tests проверить defaults, пустой password без placeholder,
  три password edits, повторный вход, failed/pending/active, revision conflict,
  доступ с клавиатуры, focus/error association, отсутствие secrets в DOM после save.
- [ ] Соблюсти `packages/app/AGENTS.md`: UI state через Solid store, тексты через
  typed i18n и проверенную терминологию. Если изменение затронет session/timeline,
  сначала снять production benchmark baseline, после сравнить; не перезапускать
  уже работающие пользовательские app/server для отладки. Lifecycle tests запускают
  и завершают собственную отдельную тестовую установку по утверждённому сценарию.
- [ ] Из app выполнить `bun run test:unit` и `bun typecheck`, из desktop
  `bun typecheck`. Commit `feat(app): add Loginom setup and settings`.

## D7. Проверить сквозную работу до пакетирования

**Файлы:** `packages/agent/test/loginom/acceptance.test.ts`,
`packages/app/e2e/loginom-settings.spec.ts`,
`docs/testing/loginom-ai-agent/reports/desktop-integration.md`.

- [ ] Пройти UI-01/02, CON-01–08, MODEL-01 из [общей матрицы](../../testing/loginom-ai-agent/README.md)
  на dev build с реальным тестовым Loginom и временным профилем. Секреты вводятся
  локально; отчёт не содержит их. При отсутствии сервиса/credentials — BLOCKED.
- [ ] Выполнить FLOW-01 с общим CSV oracle: Alpha=35, Beta=20, total=55; отдельно
  переоткрыть и выполнить сохранённый пакет. ISO-01 второго чата должен дать 101.
  Ответ модели или наличие скачанного пакета само по себе не является PASS.
- [ ] Пройти cancel/network interruption/ambiguous recovery; убедиться, что
  применение settings не отменяет параллельный обычный чат и не дублирует nodes.
- [ ] В browser e2e проверить renderer flow через действующий test:e2e harness;
  факт Electron IPC и bundled processes подтвердить отдельно в release R3/R6.
  Из agent выполнить `bun test test/loginom/acceptance.test.ts`; из app
  `bun run test:e2e -- loginom-settings.spec.ts` после сверки интерфейса runner.
- [ ] Если изменён public Protocol/HttpApi, выполнить `bun run generate` из
  `packages/client`, затем package typechecks; legacy JS SDK регенерировать
  штатным `./packages/sdk/js/script/build.ts`, если изменён его исходный API.
- [ ] В отчёте указать commit, runtime/catalog versions, сценарии, evidence и
  blockers. После успешного targeted набора не гонять повторно всю монорепу
  без нового изменения/ошибки. Commit `test(loginom): verify desktop integration`.

Граница готовности: D1–D7 подтверждают связность реализации и согласованный UI.
Чистая установка, отсутствие внешних runtimes, подпись и updater подтверждаются
только [планом выпуска](2026-09-16-loginom-release.md) и нативными отчётами.
