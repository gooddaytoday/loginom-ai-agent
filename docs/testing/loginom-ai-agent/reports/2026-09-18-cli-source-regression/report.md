# CLI source regression after native credentials and profile permissions

Проверки выполнены на Linux, 18 сентября 2026 года, из package directories.
Использован Bun 1.3.14 из закреплённого toolchain и
LOGINOM_AI_AGENT_TEST_NODE=/home/kiselev/.cache/loginom-ai-agent/toolchain/node-v24.19.0-linux-x64/bin/node.

- packages/loginom-host: полный `bun test` — 36 PASS, 2 SKIP, 0 FAIL,
  213 assertions, 15 files. Native DPAPI tests пропущены на Linux.
- packages/agent: `bun test test/cli/standalone.test.ts test/cli/standalone-status.test.ts
  test/cli/loginom-management.test.ts test/cli/profile.test.ts test/cli/profile-windows.test.ts`
  — 16 PASS, 1 SKIP, 0 FAIL, 165 assertions. Native ACL test пропущен на Linux.

Проверены реальный private Node process/transport, async recovery journal,
cleanup acknowledgement + exit, manifest/install, Linux credential persistence,
Keychain crypto envelope, staging preflight, standalone management/setup/recovery,
provider listing без Loginom, early signals и защита профиля.
Standalone-status fixture использует resources Node из Desktop build; это test
fixture зависимости, не утверждение о независимости установленного CLI-дистрибутива.
Managed runtime в management-тесте scripted, реальный Loginom/Chromium здесь не
использовался. Отдельные прежние live acceptance результаты не расширяются.

Первый host запуск без LOGINOM_AI_AGENT_TEST_NODE завершился 9 failures из-за
отсутствующей обязательной настройки тестового Node (27 PASS / 2 SKIP).
После задания pinned Node выполнен весь набор, а не только упавшие tests.
Инструкция пакета уточнена. Production dependencies для исправления тестового
окружения не изменялись. Native Windows/macOS и новый installed artifact не проверены.
