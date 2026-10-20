# Browser recovery: native CI fixture follow-up

**Результат:** восстановить реальные cross-platform test fixtures для уже принятого Host run-released, без изменения продукта. Новый macOS source-check run должен проверить обе release-политики и CLI outcomes. Linux-проверки не выдаются за macOS PASS.

**Основание:** macOS candidate39390143347, job118519428884, source29e25beb46. После принятого build-isolation fix прежнего loader failure нет; оба browser-recovery-release tests падают в cli-keychain.ts realpath(root) с LOGINOM_CREDENTIAL_PROTECTION_UNAVAILABLE. Их fixture не создаёт root до encode и не stage-ит Keychain helper. Отдельно CLI management outcomes timeout90000ms: exit143 после runner kill вместо ожидаемого1. Raw runtime этой fixture не отвечает на run-released, который Host ждёт до5000ms при каждом release. Последняя связь — конкретная гипотеза для проверки, не установленная внутренняя причина всего timeout.

**Первый проверяемый результат:** исходные тесты успешно проходят через настоящие private IPC/credential paths. RED уже сохранён в native CI log; для CLI минимально проверить тот же fixture/outcomes и отсутствие ACK, затем GREEN тем же путём. Не нужны Loginom или новый browser stage.

**Источник свидетельств:** .superpowers/sdd/2026-10-20-browser-recovery-host-loader/macos-39390143347-job.log. Host native setup pattern уже есть в test/saved-package-shutdown.test.ts; Agent fixture — test/cli/standalone-status.test.ts, общий managed-entry template теста management commands. Главный checkpoint сохраняет completed Export probe; native BR расширение пока не начинается.

**Проверка плана:** независимое review GO; обязательных замечаний нет.

## Ограничения, объём, исключения

- Одна implementation task, два однородных исправления test protocol/setup. Host/Agent owning AGENTS обязательны; чужие профили, Keychain entries и процессы не затрагивать.
- Только существующие mkdir/profile0700 и buildKeychain на darwin до credential stage; сохранить cliCredentials(process.platform) и fail-closed protection. Не вводить plaintext fallback или подмену process.platform. Для own native credentials следовать существующей адресной fixture cleanup, не общему Keychain reset.
- CLI raw runtime должен отвечать released:true на run-released без изменения исходных call/close/cancel/outcome assertions. Сначала подтвердить, что именно отсутствующий ACK создаёт ожидание; при опровержении не сохранять precautionary fix.
- Никаких production/SDK/API/timeout/pins/dependency/workflow changes, retries, новых mocks/string tests или общего runner. Не менять ожидаемый exit1 на143 и не увеличивать90s.
- Ожидание: 4–5 файлов, ~+50/−5 строк с планом/checkpoint; код ~+5–10 строк в двух существующих tests. При ×2 пересмотреть подход. Более широкая механика требует нового plan review.
- Исключения: реальные macOS GUI/Loginom/installed acceptance, BR-S2/S4/S5/S6, модели, release flag/merge/publication. Новый CI — проверка изменённого кода, не повтор неизменённого run.

### Task 1: Native setup и протокол фикстур

- [x] **Step 1 — RED/source boundary.** Прочитать реальные ошибки и минимальные fixtures. Установить реальные preconditions Keychain по существующему native pattern и цепь release→request/5000ms→fixture без ACK. Для CLI зафиксировать воспроизводящий command/observed behavior, использовать native timeout как исходный RED; не запускать полные suites вслепую ради получения того же timeout на Linux.
- [x] **Step 2 — минимальная правка/GREEN.** Подготовить только own root/helper до credential stage в Host release fixture; добавить только корректный ACK в Agent raw managed runtime. Пройти исходные release/shutdown tests и все четыре management phases. Не добавлять новых критериев/механизмов вокруг fixture.
- [x] **Step 3 — проверки.** Закреплённые Bun1.3.14/Node24.19.0 command-local; тесты из packages/loginom-host и packages/agent, никогда repo root/tsc. Одна обычная полная Host suite, Agent focused test/cli/standalone-status.test.ts и typecheck обоих пакетов; git diff --check. Production Agent не меняется, повтор full3842 suite не требуется для fixture-only строки; новая CI отдельно проверит integration. Любую новую ошибку сначала изолировать как product/check/environment defect.
- [x] **Step 4 — review/CI/checkpoint.** Commit reviewable code, независимое spec+quality review; после принятия обновить checkpoint и draft PR, push. Один свежий существующий macOS candidate на новом commit, сохранить фактические Sourcechecks/артефактные исходы; не объявлять Linux PASS всей CI. Слияние/выпуск не выполнять.

**Локальный результат и review:** исправлены только две test fixtures: собственный root0700/helper/адресная Keychain cleanup и run-released ACK. Linux baseline outcomes77,6s PASS →35,6s PASS (около42s устранённого ожидания), focused Agent7/7; Host targeted19/19, штатная full370 PASS/7 SKIP/0 FAIL, typecheck обоих пакетов и diff-check PASS. Independent review нашёл один fail-fast teardown defect; scoped fix ждёт allSettled и агрегирует ошибки до rm. Повторное review — M1 ADDRESSED, новых замечаний нет. Native macOS Source checks подтверждены следующим отдельным свидетельством; все шаги этой fixture-задачи завершены.

**Native CI:** run [39394672093](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/39394672093), source `bd2e8dd5c588ac5fd20c30943d72892818eb50a0`, job118534327530. `Source checks` SUCCESS, 20.10.2026 08:42:56 UTC. Неизменный check-macos.ts последовательно проверил Product, полный Host, Desktop и focused Agent CLI, включая исправленные release/management fixtures. Подготовка macOS14/arm64/pins также SUCCESS. Это закрывает native gate fixture-задачи. `Build and verify both products` на момент наблюдения in_progress; артефактный candidate и installed/macOS GUI acceptance этим не объявляются PASS.
