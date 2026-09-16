# Обычная установка перед RC6

Пользователь14сентября выбрал: сначала довести обычную установку до работы с новыми узлами и пользовательскими каталогами, затем выпустить RC и обновить сайт. Это расширение подготовки поставки, не запуск новых узлов. Принятая реализация98fd9c5a и website014d0dac сохранены. Main/серверный runtime/общий установленный плагин пока не менялись.

## План реализации

1. Общий workflow_profile для Codex/Hermes с user-v1/executor-replay, immutable release pins и явно выбранным корнем хранения Loginom. Сохранить legacy hermes_profile и персональное подключение profiles/hermes-user.json при обновлении; миграцию второго файла включить в транзакцию/откат установщика. Вход по умолчанию ручной через существующий LOGIN_REQUIRED→READY, тестовый passwordless остаётся отдельным явным режимом.
2. Подписанные каталоги без привязки к test-2: декларация session destination policy, точный разрешённый корень берётся из host config и связывается с подготовленным документом/фактическим Loginom account. Не выводить каталог из username. Сохранение, upload, export и native download применяют одну политику; native breadcrumbs/имя/тип объекта подтверждают фактическое назначение. Не переписывать pinned catalog после загрузки. Legacy тестовые ограничения сохраняются для старых каталогов без новой policy.
3. Пользователь дополнительно потребовал прикреплять датасет файлом к сообщению Codex и Hermes. Codex получает opaque host-input ticket из существующего доверенного UserPromptSubmit hook (native section Files mentioned by the user). Hermes Desktop/TUI передают вложения как @file; исходный префикс перед первым Context Warnings/Attached Context отделяется от раскрытого содержимого. Относительные пути разрешаются только через сохранённый host task cwd, не общий cwd процесса. Пути из файла, истории и model tool args не дают полномочий. TTL/hash/size/claim и привязка к agent/native session обязательны. Hermes producer читает тот же выбранный профиль. Проверка реальных вложений обоих приложений входит в приёмку; messaging gateways отдельно не объявляются поддержанными без их проверки.
4. Подготовка/инструкции user-v1 возвращают все14 реально зарегистрированных типов. Оба native skills согласовать с готовыми handler API, ручным входом, входными файлами и рабочей папкой. Не добавлять универсальный интерпретатор сценариев.
5. Точные compatibility profiles macOS/Linux/Windows для Loginom7.4.2. Реальное определение платформы и strict matching сохраняются. Проверять платформы реально; сборки сами по себе не являются live приёмкой. XLSX остаётся вне RC.
6. Адресные unit/contract проверки, живые операции в другом явно выбранном каталоге, ошибки/path traversal/account change/пробелы/кириллица, fresh setup/upgrade/rollback с сохранением посторонних настроек. Перед реализацией UI-политики посмотреть живой Loginom и существующие E2E helpers. Один Hermes Sol/low слот, обычная задача из нового комплекта и независимый аудит результата; не повторять модель как основной debug loop.
7. Согласованные version/manifests/hooks, чистый source snapshot, сборки на VPS, проверки готовых архивов и native lifecycle. После принятия точных assets — prerelease rc.6, download/hash readback, затем новый landing manifest и Caddy build/deploy/rollback проверка по releasing.md/operations.md.

## Точки кода

config.mjs, setup.mjs, dispatch.mjs, bridge.mjs, user-results.mjs; host-artifacts.mjs и hook.mjs/hooks.mjs; Hermes __init__.py. Storage: artifacts.mjs, artifact-delivery.mjs, executor.mjs, text-export-parameters/procedure/output.mjs, workspace.mjs; schemas/catalog builder/publisher. В native TID whitespace→underscore и удаление запятой должны сочетаться с exact original label и folder kind, чтобы не принимать коллизии.

## Статус

Исследование исходников и read-only карт выполнено. OpenViking healthy, GitHub active account доступен, VPS healthy/9.1GiB свободно. Реализованы shared workflow profile, выбранные каталоги и identity guard, привязанные export/upload/download/save destinations, Codex/Hermes attachment producers, выбранный config и обратимый profile update в setup. Для завершения установщика ещё требуется выпущенный release-workflow.json с реальными pins. Сборка/публикация не выполнены. Три предыдущих combined сценария остаются PASS для исходного приёмочного профиля; новый профиль этими отчётами не принимается автоматически.

## Уточнение пользователя: Linux и Windows

14 сентября пользователь разрешил выпустить Linux и Windows, опираясь на предыдущие версии плагина, а новую отладку этих платформ перенести после RC. Это явное исключение из полной V5-проверки для данного RC; не переименовывать старые classic/Chromium результаты в новую user-v1 приёмку. Серверная сборка, проверки архивов и доступные автоматические тесты сохраняются. Новая живая приёмка обычной установки, выбранных каталогов и прикреплённых файлов выполняется на этом Mac. В release notes и на сайте обозначить, что новый полный native прогон Linux/Windows не выполнен. Windows SSH14сентября отвечал TCP22, но закрывал соединение до обмена ключами; никаких изменений на Windows не было.

### Текущая проверка реализации

Живой Loginom7.4.2: orcestrator, создан и подтверждён /orcestrator/RC public 20260914, native TID с преобразованием пробелов, точные breadcrumbs/label/type. После исследования PackageNodes.Count=0, native Logout подтверждён; operator40598 закрыт. Локальные143 focused checks, дополнительные10contract checks,7catalog checks и8Hermes-native checks прошли. Полный client suite:1810PASS/1SKIP/9FAIL из-за sandbox EPERM на локальных сокетах и связанных ожиданиях; только эти suites повторяются с разрешёнными локальными сокетами. Новая живая приёмка изменённого runtime ещё не выполнена.

Source refs для вложений: Codex26.908.40834/codex0.154.0-alpha.6.2 native composer Files mentioned by the user; официальные hooks https://developers.openai.com/codex/hooks . Hermes693641aa8b4359c602283bdbbc14041e03bc47bc: file.attach→@file, context_references исходный префикс, host pre_llm_call/pre_api_request+pre_tool_call и scoped cwd/backend. Native producer не меняет Hermes core и не сканирует историю. Исключены paths из Attached Context, чужие sessions/turns, remote workspace read на host; разрешены локально staged remote attachments текущего profile.

Повтор четырёх suites, использующих реальные локальные сокеты/процессы:14/14PASS. Итого полного набора после подтверждённого sandbox-only повтора —1819PASS/1SKIP; исходный FAIL report сохранён. Синтетические attachment и profile проверки не заменяют предстоящую Mac native приёмку.

### Каталоги и проверка обычного профиля

На VPS собраны и прочитаны обратно immutable rc6 candidate-каталоги для трёх
платформ. Их точные URI/SHA закреплены в `client/lib/release-workflow.json`;
production current не переключён. Source4b452787 включил привязку Codex input
ticket к переданным самим host thread_id/turn_id;11адресных проверок прошли.

Через обычный source MCP (без mode/catalog overrides) на Mac подтверждены
LOGIN_REQUIRED→READY, фактический orcestrator,14типов, развёрнутое окно и
выбранный каталог. Пакет `/orcestrator/RC public 20260914/Проверка установки.lgp`
сохранён; попытка записи вне разрешённой папки отклонена до эффекта.
Evidence: `.dock/public-installation/ordinary-live/001`–`004` в интеграционном
worktree. После сохранения transport закрыт; native ClosePackage/Logout именно
для этой пробы не подтверждены. Сквозная native-передача вложения ещё не принята.
По последнему указанию пользователя дальнейшие проверки — только скриптами
Loginom Dock, без computer use.

Первая серверная сборка4b452787 сохранена как неуспешная проверка упаковки:
три теста не нашли два JSON Collapse, а Python-тест создал лишний pyc, из-за чего
строгая проверка manifest остановила установщик до изменения runtime/config.
Добавлены оба JSON, тестовый Python запускается с `-B`. Две большие DOM fixtures
используют существующие тестовые часы; рабочие лимиты и отдельные timeout-тесты
не изменены. Три проверки source packaging, включая полный suite из чистой
изолированной копии и отсутствие pyc после него, прошли (76.314с).
Нужна новая серверная сборка и проверка готовых комплектов; старый архив не публиковать.

### Исправленный комплект и сквозная scripted-проверка

Сборка d445db38 на VPS:4315файлов на платформу; manifest всех трёх комплектов
подтверждён. Полный Linux client suite1821PASS/1SKIP; на Mac305адресных проверок
и повторная целостность manifest прошли. Штатные установка Codex→откат→повторная
установка и установка Hermes прошли; ключи и профили сохранены. Публичного Release
и обновления сайта ещё нет.

Live-передача обнаружила виртуализацию большого списка папок. Загрузчик использует
существующий bounded `findNativeStorageRow` из экспорта; проверяет документ,
вкладку и родительскую папку, не повторяет неизвестную передачу. Также исправлен
возврат в известный сценарий из вкладки «Файлы»: сохранены проверки точного
документа/вкладки/пути, но активная вкладка больше не обязана уже показывать граф.
66адресных клиентских проверок прошли. Native Hermes при наличии @file берёт
только эти входы, чтобы пути выходного пакета/CSV не превращались в локальные
вложения;9native-проверок прошли.

`.dock/public-installation/attachment-probe-final-source`: на Loginom7.4.2
подтверждены admit→upload230байт/SHA→возврат в тот же сценарий→save_checkpoint→
ClosePackage→Logout. Session614bdf46-4be1-4f30-b092-1eb6e2cb43ab, пакет
`/orcestrator/RC public 20260914/Attachment-probe-1789404298678.lgp`;
cleanup SUCCEEDED, packages1→0, несохранённое не отбрасывалось.
Это scripted host-producer probe, а не настоящий native user event Hermes/Codex.
Предыдущие FAIL сохранены: пропущенный browser root, ошибка grant_id в операторе,
виртуальная папка и таймаут возврата. Старые пустые диагностические сессии не
являются доказательством native cleanup. Новые source changes требуют обновлённой
серверной сборки; затем один native Hermes и независимая проверка его результата.

### Итоговая обычная установка и native Hermes приняты

Финальный client source `0df6da8246be905445f1c127e57755b9379ac7ce` собран на VPS
для macOS, Linux и Windows; манифесты4315файлов проверены до и после66адресных
тестов Linux. Обновление обоих native-плагинов на Mac завершено; текущий runtime
`0.1.0-rc.6-b85bccf2723b`. Ранее установка→откат→повторная установка была
проверена на d445db38; эти процедуры не объявляются новым полным прогоном Windows/Linux.

Настоящий Hermes `20260914_200053_384093` на существующей ChatGPT-подписке,
openai-codex/gpt-5.6-sol/low, завершил задачу за1м45с. Native @file зарегистрировал
49байт CSV, SHA256 `57fb261b90c62e01f6f22074b3df5a461f17733884731619ce55e2a0adbb1c9d`.
Обычный профиль вернул14handlers и выбранные каталоги. Без mode/catalog overrides
Hermes загрузил файл, создал единственный Sales/imports.text, проверил Region:string,
Amount:integer и строки Север52, Юг10, Запад0, сохранил
`/orcestrator/RC public 20260914/Native-attachment-RC6-20260914.lgp`.

Независимый аудит всех9проверок native-пути прошёл; fresh reader
`311c4292-5c69-44be-80f3-4be7e6f659ff` подтвердил исходный GUID, новый документ,
единственный узел/ноль связей, выполнение и точные значения без переоткрытия
мастера. Пять проверок reader также PASS. Writer штатно закрыл сохранённый пакет
без discard; reader закрыл его с разрешённым удалением только временных изменений
своего диагностического просмотра. Оба выполнили Logout. Временные настройки
профиля и Hermes восстановлены побайтно; auth guard не обнаружил refresh/import.

Evidence: `.dock/public-installation/native-final/{pre-audit,final-audit}.json`,
`native-public-evidence.json`, `reopened/`. В local diagnostics сериализованный
`action_key` скрывается слишком широким redactor; для аудита использованы
оригинальные tool envelopes только этой сессии из Hermes DB, без system/reasoning.
Это диагностическое ограничение не меняет реальные квитанции выполнения.

Полный native composer event Codex отдельно не воспроизводился: проверены
контракт/привязка host metadata и scripted путь передачи. Linux/Windows GUI
исключение пользователя и отсутствие XLSX-обработчиков сохранены в release notes.
