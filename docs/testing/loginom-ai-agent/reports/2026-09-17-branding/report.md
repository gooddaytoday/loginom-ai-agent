# Linux 0.1.3: путь установки, бренд нового чата и инструкции модулей

Дата: 2026-09-17. Канал prod, Linux x86_64. Исходный commit: `b1643b1c0b0f79d81bf49246af2a59b7a3759f17`. Последующий commit отчёта не меняет установленные файлы.

## Изменения

- DEB устанавливает приложение в `/opt/loginom-ai-agent`. Полное имя `Loginom AI Agent` сохранено в меню и metadata. Упаковочный productName Linux использует slug, поскольку electron-builder/FPM строит из него каталог `/opt`.
- Новый чат использует видимую надпись и accessible label `Loginom AI` в `WordmarkV2`. Текст адаптируется к ширине, использует цвет темы и помещается в SVG viewBox.
- Обновлены статический verifier, Docker entrypoint и smoke-тест для нового пути; GUI smoke проверяет реальное содержимое и границы надписи.
- Добавлены AGENTS.md для product, loginom-host, loginom-runtime и desktop connection lifecycle; дополнены desktop/app/ui/agent и корневой указатель. Описаны владение секретами, поколения подключений, recovery, proxy, схемы инструментов и выпуск.

## Выполненные проверки

- `bun typecheck` в desktop и UI — PASS.
- `bun test electron-builder.config.test.ts scripts/release/artifact.test.ts` из desktop — 5 PASS, 47 assertions.
- 31 локальная ссылка в обновлённых AGENTS.md существует; `git diff --check` — PASS.
- Production build и упаковка DEB/AppImage — PASS. Архив исходников создан из чистого commit.
- Статическая проверка каждого финального пакета — PASS, по 4365 файлов runtime; проверены хеши, архитектура, metadata, новый install root и Exec DEB.
- Реальное обновление через apt: `0.1.2 → 0.1.3`, итог `install ok installed`.
- `/usr/bin/loginom-ai-agent` разрешается в `/opt/loginom-ai-agent/loginom-ai-agent`; старый `/opt/Loginom AI Agent` отсутствует. Desktop Name/Exec/StartupWMClass корректны.
- SHA256 установленного `resources/app.asar` совпадает с финальным linux-unpacked. Хеши пользовательских connection.json и auth.json до/после обновления совпадают; значения секретов не опубликованы.

- GUI установленного `/opt/loginom-ai-agent/loginom-ai-agent` в Xvfb/изолированном профиле — PASS: четыре поля мастера, пустые секреты без placeholder, настоящее подключение Loginom, сохранение с правами 0600, redacted IPC readback, новый чат `Loginom AI` без обрезания, повторный запуск без мастера. [Снимок нового чата](new-chat.png), [результат smoke](installed-gui.txt).

## Артефакты

Каталог: `packages/desktop/dist/release-0.1.3/`.

| Файл | SHA256 |
| --- | --- |
| `loginom-ai-agent-0.1.3-source.tar.gz` | `aef4f06e9e08b4e1ba8ca003782f3a156c87840ae786b2882848d24b53e0ad73` |
| `loginom-ai-agent-linux-amd64.deb` | `2d5dc452e494679f3a7e61ecc659ce698861a9380aa40a4c81cab9e1902c70db` |
| `loginom-ai-agent-linux-x86_64.AppImage` | `c4cc036cf05d3efe68e1cea7992e71c638674b4301b14947d8bffb37e70d1ba8` |

## Границы проверки

Windows/macOS и Docker-матрица ОС в этом небольшом обновлении не запускались повторно. Контейнерные пути обновлены; предыдущая Linux-матрица описана в [отчёте 0.1.0](../2026-09-16-linux/report.md). AppImage проверен статически; запуск новой версии проверен через DEB. Пакеты неподписаны, публичный feed выключен. Пользовательский работающий сеанс не завершался: чтобы перейти на новые файлы, приложение нужно полностью закрыть и запустить снова.
