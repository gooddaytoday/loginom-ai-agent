# Chromium 1246: согласованное обновление runtime

Статус на 2026-09-26: исходники закрепляют MCP 0.0.82, Playwright/core
1.64.0-alpha-1789764292000 и Chromium 1246 / 154.0.8037.0. Node остаётся
24.19.0, MCP SDK — 1.30.0. Это кандидат для Ubuntu acceptance, не выпуск.
Live Loginom и native Windows/macOS acceptance нового комплекта не завершены.
Прежние action-catalog acceptance records не переименовывались и не переносились.

## Причина и границы доказательства

Координатор воспроизвёл падение pinned Chromium 153 на локальной Blob-загрузке:
две из трёх копий профиля завершились неуспешно; одна выполнила пять загрузок.
Точный Chromium 1246 выполнил 15 из 15 загрузок в трёх независимых копиях,
headed, с sandbox и наблюдением после saveAs. Это подтверждает результат
локальной матрицы, но не устанавливает конкретный исправленный Chromium bug.
Отключение partial download popup не стало подтверждённым обходным путём.

Последующие проверки уточнили границы этого результата: live28 прошёл загрузку,
но live29 на том же Chromium 1246 завершился SIGSEGV при `download.saveAs`,
до проверки выбора JavaScript-узла. Обновление версии само по себе не устранило
падение. Evidence: `g2-operator-29/` и `chromium1246-crash29-metadata.json`
в той же приватной кампании.

В `chromium1246-restart-matrix/report.json` проверены отдельные запуски процессов:
в трёх группах reuse первый запуск прошёл (3 PASS), а два последующих запуска
на каждом уже использованном профиле упали (6/6: 4 SIGSEGV, 2 SIGTRAP).
С новым профилем на каждый процесс все 9/9 запусков прошли: точные 22 байта
и 1500 мс наблюдения после загрузки. Отчёт и соседние `.log` подтверждают
воспроизводимое условие падения при повторном запуске с профилем; они не
устанавливают внутреннюю причину Chromium и не заменяют live acceptance.

Для следующих source-operator attempts координатор назначает отдельный свежий
профиль на каждый запуск, сохраняя прежние профили как evidence. Это соответствует
существующему продуктовому lifecycle, проверенному по исходникам:

- Desktop `desktop-service.ts` и standalone CLI через `node-entry.ts` используют
  общий `createLoginomHost`, который запускает `src/managed-entry.mjs`.
- Каждый `start` managed-entry создаёт
  `generations/<generation>/chats/<chat>/attempts/<randomUUID>/browser-profile`
  на Linux/macOS; Windows получает отдельный `mkdtemp`-профиль.
  Повторный запуск runtime, включая тот же chat/generation, создаёт новый attempt.
- `loginBrowser` передаёт этот путь в `launchPersistentContext`; MCP получает
  тот же authenticated context. Общий постоянный профиль загрузок в этой
  продуктовой цепочке не обнаружен. Живой runtime сохраняет свой context между
  вызовами; новый профиль создаётся на запуск runtime, а не на каждую загрузку.
- Source operator напрямую принимает назначенный `--profile` и сам не создаёт
  уникальный attempt: свежесть пути обеспечивает координатор. Ранее профиль
  кампании повторно использовался между запусками.

Read-only аудит download-пути: до `saveAs` отмена возможна только в ветках
отказа с немедленным возвратом; отмена в `catch` следует после ошибки.
Предшествующего `download.delete` в успешной ветке нет. Init script отключает
`showSaveFilePicker` только для нужного origin и не вызывает `revokeObjectURL`.
Жизненный цикл Blob URL внутри самого Loginom этим аудитом не проверен.

Live30 на свежем профиле завершился OBSERVED с process0 и полным cleanup:
download/input, выбор узла, readback source и переход Next подтверждены.
Sentinel отсутствовал: факт исполнения JS остаётся ambiguous, G2 не закрыт.
Предложение последующей batch-проверки:
один свежий context и подготовленный input на attempt, отдельный JS-узел,
идентификаторы эффектов и evidence на case; переход к следующему case только
после подтверждённого завершения и закрытия preview/wizard. Неопределённый
результат останавливает batch; общий cleanup выполняется один раз. Это предложение
не реализовано и не является доказательством успешной приёмки.

Матрица координатора: `chromium-1246-matrix-report.json` в приватной кампании
`javascript-20260926-ubuntu`. Первоначальная проверка stable 154.0.8037.57
отдельна и не используется как доказательство для pinned 154.0.8037.0.

## Входы и целостность

Release pins: [loginom-release.json](../../../packages/product/loginom-release.json).
SHA256 `client/package-lock.json`:
`313161b44cefb98b531789a2d9fbb6f4b380f80bb88b976787a0fc5b2d8e30d1`.

Executable SHA256:

| Target | Исполняемый файл внутри Chromium 1246 | SHA256 |
| --- | --- | --- |
| linux-x64 | `chrome-linux64/chrome` | `1e0652a37f41d22ca22066c40896398cb7acce71f2746028061064369b299ab9` |
| win32-x64 | `chrome-win64/chrome.exe` | `e3390ab4c5d43b720a4aac16cb5c3889857a449d1aaeeda4ec86005beb98ff37` |
| darwin-arm64 | `chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing` | `ae4d66517f6879a70239c073f7be3d3b4d82bb3158938c6cb456bcd66f8f386e` |

Windows/macOS executable hashes повторно измерены из официальных архивов:

- [Windows archive](https://storage.googleapis.com/chrome-for-testing-public/154.0.8037.0/win64/chrome-win64.zip), archive SHA256 `ed8b09ec970e5d5709678e05a2dafb7014c94c2ad959214e7e0f19ae69d2da12`.
- [macOS archive](https://storage.googleapis.com/chrome-for-testing-public/154.0.8037.0/mac-arm64/chrome-mac-arm64.zip), archive SHA256 `087abf7d9405bde17889b4ccbe7d12f4a4d12a0164cc087fedd3bfe46817baa7`.

[Native candidates](../../../packages/loginom-host/script/native-resource-candidates.ts)
сохраняют статус build candidates; архивная проверка не является native запуском.
Staging по-прежнему проверяет platform/arch, revision, executable hashes,
lock hash и платформенный action catalog. Sandbox и ограничения UI не ослаблены.

Linux credits экспортированы координатором из `chrome://credits/` точного 1246:
768 sections, 8454009 UTF-8 bytes. Текст и gzip повторно проверены по
[source.json](../../../packages/loginom-host/licenses/chromium/source.json).
CLI выбирает архив по закреплённой revision; прежний архив 1243 сохранён.
Это не утверждение о завершённом source-distribution compliance audit.

## MCP и владение браузером

Конфигурация явно задаёт `webmcp: false`: инструменты страницы не должны
добавляться в каталог. Тест реального MCP/SDK handshake без браузера проверяет
наличие `browser_run_code_unsafe`, схему `code`, отсутствие WebMCP-инструментов
в начальном каталоге и исключение browser tools из executor public catalog.
Поведение с живой страницей проверяется отдельно при runtime acceptance.

В установленном upstream API `createConnection()` создаёт `BrowserBackend`
без dispose callback: `browser_close`/`server.close` недостаточны для владения
созданным через этот API браузером. CLI factory имеет callback закрытия context
и browser. Поэтому browser integration fixtures теперь повторяют продукт:

- MCP owner использует CLI через `StdioClientTransport` и проверяет закрытие transport.
- Managed owner передаёт уже принадлежащий ему authenticated context и явно
  закрывает его после MCP. Продуктовый managed shutdown не менялся.

Первая local integration вывела успешные assertions, но оставила браузер живым;
координатор завершил только принадлежащий пробе процесс. Она не считается PASS.
Повторная `browser-1246-integration-02` после исправления fixture: 2 PASS,
runner exit 0, `remainingFixtureBrowserPids=[]`, source hashes неизменны.
Это local headed download/upload/navigation/ownership proof, не live Loginom.

Координатор также выполнил CLI-flavor staging `resources-1246-01`: 4375 файлов,
`verifyResources` и сравнение bundled runtime с worktree — PASS, `mismatches=[]`.
Manifest SHA256:
`cc6aa31baeb0426ea0fadcc143d26245b8630d087580b08f89912179e54fd736`.
Это проверка ресурсов, не сборка или установленная приёмка продукта.

## Проверки исходников и остающиеся проверки

- Host и Desktop `bun typecheck` — PASS.
- Host staging/notices: 10 PASS. Desktop packaging/static artifacts: 12 PASS,
  1 platform-specific SKIP. Новый afterPack-тест выполняет hook под pinned Node,
  как electron-builder, и проверяет `4755`: Bun 1.3.14 fs.chmod в отдельной
  пробе сохранил только `0755`, Node и Python сохранили `4755`.
- MCP contract, catalog, runtime-pin, resource-links, artifact discovery/download
  прошли. Изолированный `support/bridge-contract.mjs` — PASS.
- В sandbox дочерний `execFile` вернул пустые stdout/stderr даже для прямой
  записи строк. Из-за этого не прошли assertions вывода в action-catalog,
  action-catalog-lifecycle и bridge wrappers.
  Managed-shutdown suite дала четыре IPC readiness timeout и один MCP connection
  closed. Координатор повторил `bridge.test.mjs`, `managed-shutdown.test.mjs`
  и `action-catalog-lifecycle.test.mjs`: 23 PASS, exit 0, evidence
  `browser-1246-runtime-regressions.txt`. Эти средовые пробелы закрыты.
- Координатор повторил operator regressions и MCP contract: 123 PASS, exit 0.
  В `action-catalog.test.mjs` локально было 10 PASS и один fail
  `builder is deterministic and marks only actions affected by E2E dependency changes stale`,
  где stdout дочернего builder оказался пустым. Координатор повторил весь файл:
  PASS, exit 0, evidence `browser-1246-action-catalog.txt`. Все четыре средовых
  пробела закрыты независимыми повторными проверками.
- Все 13 hashes freeze27 сверены: содержимое JS probes и прежних shared fixes
  не изменено этим обновлением. G2/G3 остаются незавершёнными.

Следующий шаг — существующий live G2 через source operator, который использует
`loginBrowser` и владеет cleanup; отдельный Loginom/MCP handshake не является
новым условием допуска discovery. Отсутствующий полный remote MCP key остаётся
прежним ограничением CLI acceptance, а не discovery. Local MCP/managed paths и
новый resource bundle проверены; результат live G2 ещё предстоит получить.
Linux acceptance не сертифицирует Windows/macOS. Commit, merge, release и
установка продукта этим изменением не выполнялись.
