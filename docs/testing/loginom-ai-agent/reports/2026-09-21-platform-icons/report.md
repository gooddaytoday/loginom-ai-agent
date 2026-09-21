# Иконки приложения и сайтов — 2026-09-21

Desktop **0.1.6**, prod, собран из чистого commit
`645da9ebfd83764da01d39df1d6eb01f799e0558` и установлен в Linux.
Это локальная неподписанная сборка; версия не повышалась и публичный релиз не создавался.

## Что изменено

- Отдельные SVG-слои полного знака, компактной L и подложек Windows/Linux/macOS.
  Исходный PNG сохранён без изменения; SHA256 проверен.
- ICO 16/24/32/48/64/128/256; Linux PNG 16/24/32/48/64/96/128/256/512;
  ICNS 16–1024 и малые Retina-представления. Вне desktop-плиток прозрачность.
- Одинаковое оформление prod/beta/dev; Linux использует отдельный каталог PNG.
  Старые Store/Android/iOS-ресурсы не включаются в Desktop.
- Установленная macOS-сборка использует ICNS; 1024px Dock PNG — только development.
- Обновлены Mark/Splash и PNG уведомлений; текстовый Loginom AI сохранён.
- Лендинг Loginom Dock и веб-приложение получили отдельные versioned favicon,
  Apple touch, обычные и maskable PWA-иконки и раздельные web manifests.
  Общие legacy favicon документационного сайта не изменены.

## Выполненные проверки

- `bun test scripts/icons.test.ts scripts/copy-icons.test.ts electron-builder.config.test.ts scripts/release/artifact.test.ts`
  из Desktop: **17 PASS, 1 macOS-only SKIP, 440 assertions**.
- `bun scripts/generate-icons.ts --check`: все **135** выходных файлов совпали.
- Все ICO/ICNS-представления дополнительно декодированы Pillow.
  Проверены прозрачные углы, компактные слоты и 80%-safe-circle maskable.
- `bun typecheck` в ui/app/desktop: PASS; Desktop typecheck повторён в чистой сборке.
- Веб-приложение и лендинг собраны. В браузере проверены подключённые ссылки;
  **18/18** URL favicon/manifest/PWA вернули HTTP 200.
- Предпросмотр визуально проверен на светлом, тёмном и цветном фоне, включая
  реальные размеры 16/24/32/48/64/128. См. `packages/desktop/icons/preview/index.html`.
- Desktop собран закреплёнными Bun 1.3.14, Node 24.19.0 и Chromium revision 1243.
  DEB и AppImage прошли штатный verifier: **4379 runtime resources** каждый.
  Snapshot оставался чистым. Манифест и hashes приложены.
- DEB переустановлен через apt; dpkg: `0.1.6 install ok installed`.
  `/usr/bin/loginom-ai-agent` указывает на `/opt/loginom-ai-agent/loginom-ai-agent`.
- Installed ASAR совпал с собранным: SHA256 `02cd31571ecea592a812f62a50edf5babbf4ed61f6168ddff7e5147e227c4267`.
  Все 4379 установленных runtime-файлов прошли проверку по release manifest.
- Все **13** active icon files установленного payload совпали с исходниками.
  Gio зарегистрировал `com.loginom.aiagent.desktop`; Gtk.IconTheme вернул новые
  hicolor-иконки во всех **9** размерах, с побайтовым сравнением.
- Штатный installed GUI smoke под Xvfb: PASS (четыре поля, пустые секреты,
  штатные defaults, отсутствие обрезки кнопок).
- Отдельный installed icon smoke: PASS. Favicon SVG и notification PNG загружены
  через настоящий renderer protocol и совпали с новыми файлами. Получен реальный
  `_NET_WM_ICON` окна Electron: **512×512**, прозрачные углы, **173368** полностью
  непрозрачных пикселей совпали с мастер-рендером. Снимки приложены.
- **3** файла пользовательских настроек/авторизации сохранили содержимое;
  launcher установленного CLI остался прежним. Пользовательский Desktop не закрывался.

## Артефакты

Каталог: `/home/kiselev/git/loginom-ai-agent/packages/desktop/dist/icons-645da9ebf`.

- `loginom-ai-agent-0.1.6-source.tar.gz`: SHA256 `1a04688a8083aef7103a69e7e86ed31d0ff29df6bda514cd475323a1f6b11cd7`.
- `loginom-ai-agent-linux-amd64.deb`: SHA256 `be22270b0f7a0984490fc971d91d8b02777585daa02c5bf2d25c22a4be769ae8`.
- `loginom-ai-agent-linux-x86_64.AppImage`: SHA256 `66ed159625ec81b588a090a1062aa3af58f318cb9c5e26765e6f4982928555d4`.

## Границы проверки

- Для Windows/macOS проверены ресурсы и интеграция исходников; новые EXE/DMG
  не собирались и не устанавливались. Их нативная визуальная приёмка остаётся отдельно.
- На Linux проверены GTK lookup и реальный X11 window icon. Изолированный GUI
  выполнен под Xvfb; снимок меню/панели текущего пользовательского GNOME не получен.
  Уже запущенный пользовательский экземпляр использует старый код до полного перезапуска.
- Веб-сборка выдаёт существующие предупреждения Vite о preload/fonts,
  смешанных dynamic/static imports, source map и размере chunks; сборка успешна.
- Проверки модели, Loginom-бизнес-операций и полная Docker-матрица в icon-only
  обновлении не повторялись. Прежние приёмки остаются привязаны к своим артефактам.
- Сайты не публиковались, push не выполнялся, CLI не пересобирался и не переустанавливался.
- Существующие незавершённые checkpoint/report изменения другой задачи сохранены.
