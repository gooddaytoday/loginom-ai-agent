# OpenCode compatibility — локальный macOS кандидат

- База: `f6f9b0106fb3f455e581df3ee7ccb2e13f64d1f3`; ветка `opencode-compatibility`.
- Исправление: Product закрепляет совместимость OpenCode `1.18.31` из `d848db933^:packages/opencode/package.json`; версия Loginom остаётся независимой. Только OpenCode-family LLM запросы используют эту версию. SDK сохраняет свой служебный суффикс User-Agent.
- Приоритет заголовков сохранён: настройки модели, затем `chat.headers` плагина.
- Исходные проверки: `test/session/llm.test.ts` — 32 PASS, 0 FAIL; штатный `check-macos.ts` — все 8 этапов PASS, платформенные SKIP сохранены.
- Проверки выполнялись с незакоммиченным diff поверх базового SHA; `source-checks.json` фиксирует HEAD базы, а не отдельный SHA будущего кандидата.
- Неполные прямые запросы с публичной авторизацией и обеими версиями получили HTTP403 `FreeTierError`: они не доказывают исправление проверки версии. Требуется запрос обычного клиента.
- Кандидат: `0.1.17-opencode.1`, канал dev, backend v1, macOS arm64. Сборка и UI acceptance: NOT_RUN.
- Локальные диагностические файлы: `/Users/kartamyshev/loginom-reports/opencode-compatibility-2026-10-06/` (не входят в git).
- Рабочий `/Applications/Loginom AI Agent.app` не заменяется. Push, публикация и смена модели не выполняются.
- Следующий шаг: собрать чистый зафиксированный кандидат, проверить артефакты и два сообщения `opencode/ling-3.1-flash-free` через его окно.
