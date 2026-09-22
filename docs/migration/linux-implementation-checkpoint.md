# Linux: завершение реализации — 2026-09-16

## 2026-09-22 — description/dataset, final16 и новые ограничения под нагрузкой

Desktop `.20260922.4` проверен отдельно: DMG/ZIP/static/offline/signature/ASAR PASS; CLI build не завершён на cli-source-snapshot. Целевой D65 прошёл, включая самостоятельное reread55/exact с восстановлением форматов. Full final16 max5: 4 PASS / 4 BLOCKED / 1 INTERRUPTED по30мин / 1 FAILED(provider DNS), все клиенты закрыты. Исправляются UI_SCAN_LIMIT/time и configure300s при общем600s. Узкие180 PASS, runtime2308 PASS/2 SKIP, attribution5045 PASS; новая установленная приёмка ещё обязательна. Пользовательская установка и Linux acceptance не менялись. [Текущий checkpoint](../testing/loginom-ai-agent/description-dataset-debugging-checkpoint.md).

Исследование description/dataset на macOS — 2026-09-22, ещё выполняется:
отдельный тестовый кандидат `0.1.7-local.20260922.3` из `512a9b9bef88800d358b0e808d0f03fbd59b5e51`
установлен в `/Users/kartamyshev/Applications/Loginom Scenario Tests/0.1.7-local.20260922.3/`.
Исправлены ожидание масок до исходного срока и ложный конфликт preview
с идентификаторами скрытой копии графа; прежние исправления портов и бюджетов сохранены.
Runtime 2289 PASS / 2 Windows SKIP, общие macOS source checks 8/8 PASS;
DMG/ZIP, offline smoke, подпись и установленный hash проверены.
Целевые D02/D36 прошли; final15 в пять клиентов завершена 9 PASS / 1 BLOCKED.
D65 выявил короткий заданный моделью срок дополнительного чтения; исправление
compact node_read проверяется, новая итоговая серия ещё обязательна.
Рабочая установка пользователя не менялась; это не новая Linux-приёмка.
[Результаты и ограничения](../testing/loginom-ai-agent/description-dataset-debugging-results.md),
[точка продолжения](../testing/loginom-ai-agent/description-dataset-debugging-checkpoint.md).

Локальное macOS-обновление восстановления — 2026-09-21:
`0.1.7-local.20260921.2` из `be0011166` установлена и проверена.
Исправлены Proxy-массив в recovery IPC и ложная ошибка сохранения.
Настоящая кнопка в итоговом Electron прошла регрессию; в пользовательском
профиле восстановление завершено, generation 7 применена, pending отсутствует,
оба старых journal подтверждены, Loginom/AI connection check PASS.
История сохранена. [Отчёт](../testing/loginom-ai-agent/reports/2026-09-21-local-macos/recovery-update.md).

Локальное macOS-обновление — 2026-09-21: `0.1.7-local.20260921.1` из
`603259682` собрана и установлена в `/Applications/Loginom AI Agent.app`.
Исправлена ложная recovery-блокировка при параллельных tool calls.
Source/build/static/offline и установленный GUI connection/save/restart — PASS;
macOS Keychain доступ подтверждён пользователем после смены ad-hoc сборки.
Обычный профиль запущен, настройки/auth/история и старые recovery-записи сохранены.
Публикации и push не было; CLI собран, но не устанавливался. Это не новая
Linux-приёмка. [Отчёт установки](../testing/loginom-ai-agent/reports/2026-09-21-local-macos/report.md).

CI release v0.1.6 — 2026-09-21: все обязательные jobs
[run 35584356107](https://github.com/gooddaytoday/loginom-ai-agent/actions/runs/35584356107)
прошли на исходном commit `ec399bdf7283f0c7e03aabf295a4db44346f4310`.
Desktop и standalone CLI собраны под Linux x64, Windows x64 и macOS arm64;
unit/e2e/typecheck, native checks, static/offline и Linux Docker matrix — PASS.
Создан draft pre-release с 30 assets; public publication не выполнялась.
[Отчёт и hashes](../testing/loginom-ai-agent/reports/2026-09-21-ci-release/report.md).
Пользовательские установки не менялись; это CI artifact acceptance, не новая
installed live Loginom/provider acceptance.

Слияние `main` → `loginom` — 2026-09-21 (только исходники): `main`
`c8a8ac0bd` объединена с `loginom` `6bffc8e3b`. Разрешены шесть текстовых
конфликтов; сохранены RC9 recovery checkpoints, ID-only resume и native bindings,
платформенные изменения Windows/macOS и Debian prerelease-проверка.
Контракт retained ambiguous work сохраняет lease текущего владельца для
ограниченных status/resume; безопасный pre-upload checkpoint остаётся settled.
Устаревший тест трёх попыток воспроизведён 3/3 и заменён детерминированными
проверками transient paint, caller deadline и render deadline 15s: временной
контракт намеренно изменён в `main` коммитом `b336e78af`.

Проверки объединённого дерева, Bun 1.3.14 / Node 24.19.0:
client suite (`--test --test-isolation=none` из `packages/loginom-runtime/client`)
— 2258 PASS / 2 SKIP; runtime tests — 28 PASS; host — 56 PASS / 7 SKIP;
Desktop unit/packaging — 72 PASS / 5 SKIP; migration unit — 6 PASS.
Typecheck `agent`, `app`, `desktop`, `loginom-host` — PASS после
`bun install --frozen-lockfile`. `verify_sources.py --transforms` — 5045 PASS;
локальные transformation hashes обновлены, upstream source-map сохранён.
`git diff --check` — PASS. Новые дистрибутивы не собирались и не устанавливались;
live Loginom и native Windows/macOS acceptance для этого merge не выполнялись.

Исправления review RC9 — 2026-09-21 (исходники, без сборки/установки):
подтверждённый pre-upload checkpoint больше не удерживает managed host в
recovery из-за уже завершённой навигации; неизвестный результат последующего
перехода или upload по-прежнему требует recovery. Автоматическое размещение
узлов пропускает координаты вне 64..10000 после пересчёта масштаба и смещения.
Регрессии воспроизведены до правки. После правки pinned Node 24.19.0:
146 PASS (`artifact-delivery`, `node-placement`, `node-target`, `executor`,
`--test --test-isolation=none`, запуск из `packages/loginom-runtime/client`).
Migration tests: 6 PASS; `verify_sources.py --transforms`: 5045 PASS.
Обновлены локальные source-transforms; upstream source-map сохранён.
[План и границы проверки](../superpowers/plans/2026-09-21-rc9-review-fixes.md).
Полный client suite и живая Loginom/installed acceptance в этой правке не выполнялись.

Отдельное Windows-only обновление 2026-09-19: установлен Desktop 0.1.5 с
понятной маской сохранённого ключа, check без сохранения, save/close и защитой
несохранённых изменений. Packaged GUI и реальный installed Dock/Loginom smoke
прошли. [Отчёт](../testing/loginom-ai-agent/reports/2026-09-19-settings-ux/report.md).
Это не повтор Linux-проверок и не изменение установленного Linux Desktop/CLI.

**Отдельное macOS-продолжение — 2026-09-19.** Ветка `macos-build` реализует
тестовый dev pipeline macOS14+ arm64: Desktop DMG/ZIP, самостоятельный CLI
TAR.GZ, ad-hoc подписи и общий CI. Все семь этапов завершены: installed-приёмка
на macOS27 и build/static/offline CI на macOS14.8.9 плюс проверка скачанных
артефактов — PASS. Точные версии и границы проверок:
[macOS report](../testing/loginom-ai-agent/reports/2026-09-19-macos/report.md),
[план](../../plan.md). Это не изменяет исторические Linux-результаты ниже.

Очистка 2026-09-18: удалены три дублирующих каталога последней сборки;
установки, архивы и материалы аудита сохранены.
[Журнал очистки](../testing/loginom-ai-agent/reports/2026-09-18-installed-desktop-cli/cleanup.md).

Синхронизация исходников RC9 2026-09-18: клиент Dock и служебные документы
доведены до `/home/kiselev/git/loginom-dock` `83c52ebb` (живые объекты;
архив `20260916-source-01` этот commit не содержит). Живая Loginom-приёмка
нового runtime и снимок нового архива ещё pending.

**Актуальная пользовательская установка Linux — 2026-09-18:** Desktop и CLI
`0.1.4-local.20260918.697cc2e5a` собраны из чистого snapshot и установлены.
Desktop GUI/ASAR/4365 runtime hashes и CLI help/version/status PASS.
Профили сохранены; CLI оставлен установленным.
[Отчёт о текущей установке](../testing/loginom-ai-agent/reports/2026-09-18-installed-desktop-cli/report.md).
Записи ниже описывают предыдущие проверки и установки.

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
