# Linux CLI: потеря host во время импорта

## Исходный отказ

Артефакт `0.1.4-cli.202609180107`, evidence
`/tmp/loginom-cli-owner-crash-dbItxD`: SIGKILL Node host после running receipt
импорта и появления durable recovery. CLI завис до спасательного SIGINT
драйвера через 120 секунд; code 130 вместо 1 — **FAIL**. Все 24 отслеженных
процесса завершились, recovery и writer guard сохранены, повторный вход
отказал с PROFILE_BUSY/code 3. Этот результат не является PASS.

## Причина и исправление

Верхний entrypoint выполнял явный exit только в успешной ветке Promise.
При ошибке cleanup выставлялся exitCode, но открытые процессные handles
могли удерживать CLI. Flush stdout/stderr и exit перенесены после catch:
обе ветки завершают процесс; ошибочная cleanup по-прежнему сохраняет guard.
Драйвер теперь отдельно фиксирует deadlineExceeded и запрещает PASS после
срабатывания спасательного таймера.

Регрессионный тест запускает настоящий entrypoint с удерживающим interval
и дочерним Node fixture, который завершается с ошибкой на close. Проверяются
code 1, отсутствие timeout, диагностика и сохранённый guard. Тест: PASS,
5 assertions. Typecheck пакетов agent и loginom-host: PASS.

Независимый real-process transport fixture: 3/3 PASS, 18 assertions;
после SIGKILL pending call отклоняется LOGINOM_HOST_CLOSED, close —
LOGINOM_HOST_CLEANUP_FAILED, за 3–5 мс. Это проверка транспорта без Loginom.

## Повторный live запуск

Кандидат native binary `0.1.4-cli.202609180130`:
`/tmp/loginom-cli-host-exit-20260918/loginom-ai-agent-cli-linux-x64/bin/loginom-ai-agent-cli`.
Build и --version smoke: PASS. Для этой проверки явно задан development
bundle `/tmp/loginom-cli-native-staging-202609180107/resources/loginom`.
Это проверка нового executable со старым неизменённым runtime closure,
не новый полный архив и не установленный артефакт. Используется scripted
model provider, настоящий Chromium и Loginom. Результат записывается ниже.

Повторный live запуск: **PASS**, evidence
`/tmp/loginom-cli-owner-crash-ndFZfU`, log
`/tmp/loginom-cli-host-exit-live.log`: target host, SIGKILL, activeImport true,
code 1, deadlineExceeded false, trackedProcesses 24, alive [], guarded true,
retryCode 3, busy true. Recovery
`eb838949-9819-4153-9f10-7c71eb33bdff.json` сохранён; acknowledgement/replay
не выполнялись. Сигнал отправлен после running receipt и durable recovery;
точная серверная фаза не атомарна, бизнес-результат не утверждается.

Полный `standalone-status.test.ts`: 3 PASS, 89 assertions, 45.08 s.
Остаются полный архив/installed acceptance исправления, browser crash,
network loss и требования настоящего model provider/native платформ.
