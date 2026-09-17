# Linux 0.1.4: фирменный акцент AI

Дата: 2026-09-17. Production Linux x86_64. Исходный commit установщика: `3d48e50cf3124285dcfd7c39c3206a25e280bdc4`.

## Изменение

В надписи нового чата `Loginom AI` буквы `AI` окрашены в приглушённый фирменный красный `#C79292` с `fill-opacity="0.32"`. Цвет взят из [официальной красно-серой палитры Loginom](https://brandbook.loginom.ru/color/index.html). Слово `Loginom` сохраняет цвет темы с непрозрачностью 12%.

GUI smoke проверяет visible/accessibility text, отдельный `tspan` для `AI`, вычисленный цвет `rgb(199, 146, 146)`, непрозрачность `0.32` и попадание всей надписи в SVG viewBox.

## Проверки

- `bun typecheck` в `packages/ui` и `packages/desktop` — PASS.
- Тесты конфигурации и статического verifier — 5 PASS, 47 assertions.
- Production build с закреплёнными Bun 1.3.14, Node 24.19.0 и Chromium revision 1243 — PASS.
- GUI smoke на unpacked и установленном приложении — PASS: фирменный акцент, четыре поля мастера, пустые password placeholders, реальное подключение Loginom, безопасный IPC readback, права `0600`, повторный запуск без мастера.
- DEB и AppImage прошли статическую проверку; в каждом проверены 4365 файлов runtime.
- DEB обновлён с 0.1.3 до 0.1.4. Итоговый статус: `install ok installed`; `/usr/bin/loginom-ai-agent` ведёт в `/opt/loginom-ai-agent/loginom-ai-agent`.
- Установленный `app.asar` байт-в-байт совпадает с кандидатом. Хеши пользовательских `connection.json` и `auth.json` до и после установки совпадают; значения секретов не публиковались.

## Артефакты

Каталог: `packages/desktop/dist/release-0.1.4/`.

| Файл | SHA256 |
| --- | --- |
| `loginom-ai-agent-0.1.4-source.tar.gz` | `bfd82075f24fd4d185842054bde9980936971eeb3759ad369d4db2a71b17455e` |
| `loginom-ai-agent-linux-amd64.deb` | `173a1f2b5cb2adc0d5c214260335443e970f00065fb8a56b0d37cf6534610e6d` |
| `loginom-ai-agent-linux-x86_64.AppImage` | `a56357a55078887a41188c75ba7e8c015fd56b30aa6497fc58bb1ecad6f0a798` |

Пакеты локальные и неподписанные, публичный update feed выключен. Windows/macOS и Docker-матрица для этого визуального изменения не запускались. Для перехода уже открытого пользовательского приложения на 0.1.4 нужен полный перезапуск.
