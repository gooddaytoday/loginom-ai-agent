# Chromium 1243: native resource inventory

18 сентября 2026 года получены два архива Chrome for Testing 153.0.8010.12.
Адреса определены через `playwright-core/cli.js install --dry-run chromium`
закреплённого runtime client с платформами win64 и mac14-arm64. Это только
выбор download metadata; нативные браузеры на Linux не запускались.

- Windows: https://cdn.playwright.dev/builds/cft/153.0.8010.12/win64/chrome-win64.zip
  — 205123748 bytes, SHA256 `415968b02065d4a9e2c10b85f0ae9f489b8fba500e94d9d0a7b7c4852a7234c1`.
- macOS: https://cdn.playwright.dev/builds/cft/153.0.8010.12/mac-arm64/chrome-mac-arm64.zip
  — 190970181 bytes, SHA256 `930e2a2c15addbaca1fe9b07bfa520667bced556d7988707186819cb4279ef3b`.

Архивы и отдельные каталоги `chrome-win64-extracted`, `chrome-mac-arm64-extracted`
сохранены в `/home/kiselev/.cache/loginom-ai-agent/native-resources/chromium-1243`.
Все entries прочитаны с ZIP CRC validation; проверена принадлежность путей
каталогу extraction, сохранены файлы, режимы и пять macOS symlinks. Каждая ссылка
после создания разрешается в существующий объект внутри extraction root.
Windows архив не содержит symlinks. License/resources из архивов сохранены.

Windows `chrome-win64/chrome.exe`: PE32+ GUI x86-64;
SHA256 `9b07943f834485b43c9d54caea2951c78715f9f07070a80ab6658465ebd3e711`.
macOS `chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`:
Mach-O 64-bit arm64; SHA256 `8319963f6625accf51c0dd4f55091ceaf9f09ed39e7a52fed4fae12b2a6b668a`.

SHA256 вычислены локально, не сверены с независимым подписанным browser checksum
manifest. Подписи executables не проверены. Browser version установлена по
закреплённому Playwright metadata и URL, не через native execution. Отдельный
headless-shell и FFmpeg этим шагом не скачивались. Release pins не изменены.
Полные platform resources, staging, signing и native acceptance остаются открытыми.
