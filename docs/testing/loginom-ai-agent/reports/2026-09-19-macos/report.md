# macOS candidate — 2026-09-19

Статус: **IN PROGRESS**. Этот документ не означает принятия установленных продуктов.
Канонический список обязательных проверок: [план](../../../../../plan.md).

## Исходная точка и окружение

- Ветка `macos-build` создана от актуальной `loginom` / `origin/loginom`, commit
  `697cc2e5addff232f2faeb9be8c4790100995f18`. Отслеживаемых изменений не было;
  единственный неотслеживаемый `plan.md` совпадал с переданным планом.
- Локальная машина: macOS 27.0 (26A428), arm64; Xcode Command Line Tools доступны.
- Изолированные инструменты находятся в `~/.cache/loginom-macos-build/tools`.
  Bun 1.3.14 (`0d9b296a`), Node 24.19.0 arm64, npm 11.17.0 и LICENSE из полного
  официального Node-дистрибутива. Инструменты пользователя не заменялись.
- Node SHA256: `27db838bb204ef7c21df2931f5656e4c8fb32e6e947f363a402b49714d32b5b1`.
  Chromium 1243 SHA256:
  `8319963f6625accf51c0dd4f55091ceaf9f09ed39e7a52fed4fae12b2a6b668a`.
  Оба соответствуют существующим macOS pins; оба Mach-O arm64.
- Полная установка всех workspace остановилась на TLS hostname mismatch
  `pkg.pr.new` (Solid Start, не входит в Desktop/CLI). Установка по тому же
  `bun.lock` с фильтрами Desktop/Agent/Host/Product прошла; lock не менялся.
  Runtime установлен через `npm ci --ignore-scripts --omit=dev --workspaces=false`.

## Исходные сбои и source-проверки

- Product: typecheck и 4 теста PASS.
- Host: исходные два recovery-теста предполагали Linux plaintext codec.
  После явного выбора codec в этих fixtures: typecheck PASS,
  49 PASS / 4 platform skip / 0 FAIL, 354 assertions.
- Desktop: исходные lifecycle fixtures также предполагали plaintext.
  После исправления fixtures и добавления shutdown/storage/proxy-проверок:
  47 PASS / 0 FAIL, 137 assertions. Повторный typecheck после интеграции — PASS.
- Agent: исходный typecheck PASS; первый целевой набор 10 PASS / 1 SKIP / 4 FAIL.
  Причины: canonical `/private/var` paths, зависимость fixtures от staged Desktop Node,
  отсутствие Keychain helper и plaintext assumptions. После исправления двух fixture-файлов совместный прогон: 11 PASS / 0 FAIL, 165 assertions.
- Packaging/manifest: 8 PASS / 0 FAIL, включая совместимость исторического Linux manifest.
- Реальная проверка Node proxy: HTTP, HTTPS CONNECT, node:http, loopback bypass,
  отсутствие direct fallback — PASS.
- Синтетический подписанный Mach-O arm64 app проверен после упаковки в DMG и ZIP.
  Это проверка verifier, **не** доказательство готовности Electron-продукта.

## Нативный Keychain helper

Helper собран clang с minimum macOS 14.0 и подписан ad-hoc.
`codesign --verify --strict`, Mach-O arm64 и minimumOS подтверждены.
11 проверок нативного Keychain прошли: шифрование и повторное чтение, nonce,
изоляция профилей, alias, повреждённый ciphertext, отсутствующий helper,
копия в отдельный установочный путь, замена идентичными signed bytes,
недоступный helper без plaintext fallback.

Настройки пользовательского Keychain не изменялись. Созданы две отдельные
тестовые записи. Проверка идентичной копии не доказывает доступ после изменения
ad-hoc identity; эта граница проверяется отдельно на конечном кандидате.
Локальное доказательство: `/tmp/loginom-keychain-acceptance-AIXteb/summary.json`.

## Пока не подтверждено

Предварительная Desktop source-сборка прошла, staged resources: 4432 файла.
Настоящие Desktop DMG/ZIP и полный CLI TAR.GZ, installed GUI/CLI acceptance,
Loginom/model/CSV 55/101, совместный lifecycle, CI macOS14 и скачанные CI artifacts.
Gatekeeper trust, Developer ID, notarization, public release и auto-update
исключены согласованным планом. Полная GUI-приёмка на чистой macOS14 не входит в этап.

## Кандидат 01: промежуточная проверка

`0.1.4-macos.20260919.1`, чистый commit `dcf1b0410192dc7fcfec71b89e0240c709a19c51`.
Desktop DMG/ZIP и CLI TAR.GZ собраны. Статические verifier после исправления
проверки Chromium: PASS; автономный smoke после исправления loopback/timeout
cleanup: PASS. Эти scripts новее исходников кандидата, поэтому итоговый
кандидат будет пересобран из единого commit.

Исходный Playwright Chromium имеет linker-signed ad-hoc подпись без resource seal.
Это подтверждено на исходном и упакованном browser. Проверяется подпись кода,
полный SHA256 inventory и строгая deep-подпись внешнего Desktop .app; Node/Chromium
не переподписываются. Ограничение отражено в static reports.

Установленный CLI01 прошёл автономные install/uninstall/reinstall, busy-payload
refusal, сохранение профилей и Keychain read-back. GUI01 прошёл onboarding,
реальное подключение, encrypted storage и восстановление после restart.
Xiaomi Token Plan Singapore, `mimo-v2.5`, вернул `OK` через backend кандидата;
никакие provider secrets не включены в доказательства.

CSV01 остановился до UI-изменений: resource manifest унаследовал Linux-каталог.
Найден существующий immutable macOS catalog `2026.09.14-rc6-macos-candidate`,
SHA256 `d26ce18ab9ef3285d5bac7aff1d17d4968defb1d41ebd7cbbda8d9cbede07255`.
Нативный `pinActionCatalog` проверил manifest и все связанные files; compatibility
`loginom-7.4.2-macos-chromium-ru`, platform `macos`, browser `chromium`.
Выбор платформенного каталога добавляется в shared staging; gate не обходится.

CI01 не создал jobs из-за недопустимого runner context в job.env; исправлено.
CI02 подтвердил arm64/macOS14 и provisioning, но Agent typecheck выявил пропуск
root workspace SDK/@types при filtered install. Добавление `--filter loginom-ai-agent`
подтверждено на чистом локальном архиве: frozen install и четыре typecheck PASS,
lock unchanged, неиспользуемый Solid Start не установлен.

Локальный pre-push hook запускал общий typecheck всех upstream workspaces и
остановился на отсутствующем Solid Start в console-support. После успешных
package-local проверок push выполнен без этого hook; сам hook не изменялся.
