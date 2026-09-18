# Linux: завершение реализации — 2026-09-16

**Закрытие технической standalone Linux-цели — 2026-09-18.**
Этапы 1–5 выполнены и проверены в рамках Linux-only scope. Пользователь отложил
полный юридический third-party/source/relinking audit как отдельную работу
(его ориентир 2–5 рабочих дней); он не является gate этой технической цели.
Его процессы остановлены, подготовленные материалы сохранены. Это не legal
clearance и не production release; Windows/macOS и signing остаются отдельно.


Актуальное Linux-only продолжение CLI — 2026-09-18: пользователь принял реальный
Xiaomi smoke (успешные Dock operations и CSV import) как достаточный. Повторный
полный сценарий этой моделью не требуется. Final CLI `0.1.4-cli.20260918linux`
из edc68138d прошёл archive/install/uninstall, offline Ubuntu22/Debian12 startup,
headless run и installed headed TUI CSV 55/101/cold readback. Отдельный Desktop
с идентичными исходниками продукта прошёл тот же oracle; шесть captures/pins
совпали, оба порядка закрытия Desktop/CLI подтвердили независимость. Исправлен
только acceptance driver для доказанного pre-dispatch UI_EPOCH_CHANGED.
Тестовая установка CLI удалена, пользовательский Desktop не заменялся.
[Текущий отчёт и ограничения](../testing/loginom-ai-agent/reports/2026-09-18-cli-final-linux/report.md),
[остаток проверок](../testing/loginom-ai-agent/reports/2026-09-18-cli-final-linux/acceptance-audit.md).
Windows/macOS исключены из текущей цели; неподписанные development artifacts
не означают прохождение полного attribution/source/relinking release audit.

Ниже сохранены исторические checkpoint-записи с прежним scope и версиями.

Текущий standalone checkpoint 2026-09-18: source поддерживает native Windows/macOS
build branches, но они не исполнены; Linux candidate 02:10 прошёл полный build,
archive verification и installed network-loss acceptance после running import
receipt (code 4, durable recovery, все 24 процесса завершены). Active-import SIGKILL/SIGINT и блокировка нового run до
model dispatch подтверждены на 00:38. **Общая CLI-цель не завершена**: настоящий
model provider,
native OS и signing gates перечислены в [текущем CLI checkpoint](../testing/loginom-ai-agent/standalone-cli.md).
Installed Desktop regression 02:25 также PASS: GUI, CSV 55/101, save и cold
reopen/readback; после теста восстановлена 0.1.4. Исправлена упаковка прав при
umask 077. Подробности — в текущем CLI checkpoint.
Исторические Desktop результаты ниже не расширяются этой записью.


Отдельная работа 2026-09-17, ветка `loginom-cli` от `c37913ab5`: начата реализация
[самостоятельного CLI](../superpowers/specs/2026-09-17-loginom-cli-standalone-design.md).
Её текущие исходники и проверки учитываются отдельно в
[CLI runbook](../testing/loginom-ai-agent/standalone-cli.md). Приведённые ниже
исторические результаты установленного Desktop не подтверждают новую CLI-сборку.

Проверка CLI-ветки 2026-09-17: текущий Desktop успешно собран и упакован в
`linux-unpacked`; live GUI onboarding/save/restore прошёл в development Electron
и packaged executable с отдельными профилями. 43 теста, typecheck, реальный proxy
и 4365 resource hashes PASS. [Отчёт и ограничения](../testing/loginom-ai-agent/reports/2026-09-17-cli-desktop-regression/report.md).
Это не новая установка DEB/AppImage; пользовательский Desktop не изменялся.
Сравнение CSV-сценария Desktop/TUI/run одного snapshot ещё не выполнено.

Позднее в той же CLI-ветке packaged Desktop прошёл канонический CSV oracle
через свой backend API: независимое холодное readback 55/101, совпавшие hashes
вложений, отдельные profiles/packages. Такой же набор прошёл native TUI;
фактические schemas/bootstrap instructions и runtime pins совпали.
[Отчёт](../testing/loginom-ai-agent/reports/2026-09-17-desktop-cli-oracle/report.md).
Это по-прежнему разные snapshots и не installed DEB acceptance.

Последующий checkpoint CLI-ветки: Desktop/CLI 0.1.4-cli.202609171930 собраны
из одного snapshot. [Отчёт](../testing/loginom-ai-agent/reports/2026-09-17-unified-cli-build/report.md):
contracts/pins совпали; Desktop и installed TUI cold oracle PASS, installed
run B остановился на UI_EPOCH_CHANGED с сохранённым recovery. CLI install/uninstall
и native early SIGINT PASS; пользовательский Desktop не обновлялся, CLI после
проверки удалён. Это не полный Linux release PASS и не завершённый IND-03.

Следующая общая сборка CLI-ветки 0.1.4-cli.202609171958 содержит исправление
подтверждённого stale-folder precondition. Desktop/headless run/headed TUI
прошли canonical cold oracle 55/101; contracts/pins совпали, IND-02/03 для
этого scripted-provider Linux сценария PASS.
[Новый отчёт](../testing/loginom-ai-agent/reports/2026-09-17-native-folder-fix/report.md).
Installed Desktop и весь release/platform набор по-прежнему не закрыты;
старый failed run/recovery сохранён, пользовательское приложение не обновлялось.

Обновление 2026-09-17: установлен DEB **0.1.4**. В новом чате буквы **AI** используют приглушённый фирменный красный `#C79292` с непрозрачностью 32%; [отчёт, проверки и хеши сборок](../testing/loginom-ai-agent/reports/2026-09-17-brand-accent/report.md). Настройки Loginom и ChatGPT auth сохранены. Для уже открытого приложения требуется полный перезапуск.

Обновление 2026-09-17: установлен DEB **0.1.3** в `/opt/loginom-ai-agent`, новый чат показывает **Loginom AI**. Инструкции модулей связаны из корневого AGENTS.md. [Отчёт, проверка обновления и актуальные сборки](../testing/loginom-ai-agent/reports/2026-09-17-branding/report.md). Настройки подключения и ChatGPT auth сохранены; текущий пользовательский сеанс нужно полностью перезапустить.

Обновление 2026-09-17: установлен DEB **0.1.2**, исправлена совместимость схем Dock с ChatGPT; [отчёт и текущие сборки](../testing/loginom-ai-agent/reports/2026-09-17-schema/report.md). Проверен реальный ответ модели в установленном приложении. Требуется полный перезапуск текущего пользовательского сеанса.


Обновление 2026-09-17: установлен исправленный DEB 0.1.1 с системным HTTP/HTTPS-прокси GNOME; [отчёт и актуальные сборки](../testing/loginom-ai-agent/reports/2026-09-17-proxy/report.md). Для уже открытого приложения требуется полный перезапуск.


Linux-реализация завершена в ветке `loginom`. Исходный commit установщиков: `8ac362966a5801c2180ce7ea2de4a9aae6da3efa`; последующий commit документации не меняет их содержимое. Версия 0.1.0, prod, x86_64. [Итоговый отчёт, SHA256 и доказательства](../testing/loginom-ai-agent/reports/2026-09-16-linux/report.md) — канонический результат приёмки. [Инструкция сборки и проверки](../testing/loginom-ai-agent/linux.md).

## Реализовано

- Клиент Dock перенесён в этот репозиторий: 4951 активный файл, source map и проверенный архив прежних интеграций. Приложение включает Node, Playwright/MCP, Chromium, лицензии и закреплённый каталог моделей; при запуске не устанавливает npm-пакеты или браузер.
- Общая форма первого запуска и заметных настроек Loginom: API-ключ, URL по умолчанию `http://logi-test-plan.bg.local/app/`, пользователь `user`, пустой пароль без placeholder. Модели подключаются прежним способом. Папка определяется как `/<username>` без проверки её доступности при настройке.
- Идентичность Loginom AI Agent: интерфейс, установщики, namespace пакетов, переменные окружения, конфигурация и журналы. Внешние контракты провайдеров и лицензионная атрибуция сохранены. Desktop использует backend v1; v2 экспериментален.
- Приватный управляющий IPC, изоляция поколений подключения и чатов, привязка вложений к исходному сообщению пользователя. В Linux секреты открыты в файлах 0600/каталогах 0700 согласно согласованному решению.
- Ожидающая смена подключения и маркеры отправленных операций сохраняются на диск. После аварии неопределённые операции требуют явного завершения восстановления в настройках; автоматического повтора нет. История попыток и receipts сохраняется.
- DEB и AppImage, проверка 4365 ресурсов, исходный архив и release manifest. Исправлена зависимость ALSA для Ubuntu 24: `libasound2t64 | libasound2 (>= 1.0.16)` исключает ошибочный выбор OSS shim.
- Собственный updater проверяет источник, канал и хеш до замены приложения. Публичный feed пока отключён.

## Проверено

- Итоговый код запущен без сети как UID 1200 со включённым Chromium sandbox в Ubuntu 22.04/24.04/26.04 и Debian 12/13. В четырёх ОС использованы зависимости чисто установленного базового кандидата и финальный payload; Ubuntu 24 дополнительно прошла установку итогового DEB после удаления неудачного тестового кандидата. Совпадение payload с обоими итоговыми установщиками проверено побайтово.
- 44 desktop-теста, 157 assertions; 3 backend-теста границы инструментов/вложений; 5 тестов журналирования; 29 тестов меню/навигации. Desktop/app и backend typecheck — PASS. Проверка переноса — 4951 файлов PASS; runtime suite до последнего изменения обнаружения меню — 1951 PASS, 1 skip; актуальная workspace UI suite — 274 PASS. Это не утверждение об исполнении всех тестов монорепозитория.
- Реальный мастер, check/save, права файлов, повторный запуск без мастера и восстановление обычного дискового профиля после SIGKILL. Завершение родителя runtime не оставило живых потомков; отмена prepare и потеря сети не вызвали повтор операции.
- Два разных `sales.csv`: результаты 55 и 101, сохранение и независимое холодное открытие с точным числовым readback без перенастройки узлов.
- Изолированные AppImage 0.1.0 → 0.1.1 через настоящий updater: автоматический перезапуск, сохранение настройки/сообщения чата, отклонение чужого URL, канала и повреждённого SHA512.
- X11/Xvfb и headed Chromium через Wayland в headless Weston. Предоставленный API-ключ отсутствует в 11609 файлах исходного архива и 4515 packaged files.

## Ограничения и передача

Windows/macOS требуют нативной реализации платформенных ресурсов и проверки по [инструкциям](../testing/loginom-ai-agent/README.md). Физический GPU, desktop portals и AppArmor пользовательского desktop не проверены контейнерами. Установщики неподписаны, публичный feed не настроен, публикация и удалённый CI не выполнялись.

Известное ограничение: apply с пустыми параметрами для холодного существующего Grouping может завершиться timeout на input mapping. Проверенное открытие и выполнение сохранённого графа не перенастраивает этот узел.

Старые OpenCode wrapper/desktop и репозиторий Dock не удалялись. Архив переноса: `/home/kiselev/backups/loginom-migration/20260916-source-01`. Приватные диагностические материалы остаются вне git; публичные сводки находятся в итоговом отчёте. Дополнительные подтверждения пользователя для завершённой Linux-реализации не требуются.


Дополнительная CLI-проверка: native 19:58 продолжил одну реальную сессию через
headed TUI `--session`, затем headless `run --continue`; два новых tools на запуск,
exit=0, guard=false, окна закрыты. Evidence `/tmp/loginom-live-resume-jAOvyh`;
подробности в `docs/testing/loginom-ai-agent/reports/2026-09-17-cli-live-resume/report.md`.
Это частичное покрытие resume matrix со scripted provider; общие release gates открыты.
