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
