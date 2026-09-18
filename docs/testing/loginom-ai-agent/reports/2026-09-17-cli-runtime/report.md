# CLI candidate: живой Loginom runtime — 2026-09-17

## Проверенный ресурс

Development artifact `/tmp/loginom-cli-candidate-20260917-browser-cleanup`,
version `0.0.0-dev-202609171710`, Linux x64, sourceDirty=true.
Base commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`;
sourceTreeSha256 `8e8291e7ce98cda932948bc1d3667914f0c429fa6279276be0385fef13c24cf2`.
Resource manifest SHA256 `90c81a6c4725d29121744c6840a14a6f603ec40fdc325787268012fe9d09ef81`.
Node 24.19.0, Playwright 1.63.0-alpha-2026-08-31, MCP 0.0.80, Chromium 1243.

## Результаты

`packages/desktop/test/loginom/runtime-acceptance.ts` запускался с явным
`LOGINOM_AI_AGENT_TEST_RESOURCES` на ресурсы CLI-кандидата и приватной passwordless
конфигурацией. Установленный Desktop не запускался и не изменялся.

| Проверка | Результат |
| --- | --- |
| A: sales.csv, Category/Value, Alpha=10+25, Beta=20 | PASS: сумма 55 |
| Сохранение A, закрытие, независимое холодное открытие | PASS: сумма 55, settingsReapplied=false |
| B: другой sales.csv, Alpha=100, Beta=1 | PASS: сумма 101 |
| Сохранение B, закрытие, независимое холодное открытие | PASS: сумма 101, settingsReapplied=false |
| Разные remote source paths при одинаковом имени вложения | PASS |
| SIGKILL supervisor после readiness настоящего runtime | PASS: 12 отслеживаемых процессов, 0 живых потомков |

Для parent-crash.ts добавлен явный resource override и проверка разрешённого
passwordless режима. Desktop typecheck и diff check прошли.

Private receipts и summary: `/tmp/loginom-linux-oracle-Tv9CKS`.
Тестовые пакеты/загрузки имеют уникальные имена и оставлены для проверки;
пользовательские файлы не удалялись. Секреты и raw receipts не включены в git.

## Границы доказательства

Это прямой вызов общего managed runtime через supervisor, а не prompt через
native CLI run/TUI или установленный Desktop. CSV используют Category/Value;
точный минимальный вариант спецификации с amount и одинаковым prompt во всех
интерфейсах ещё не проверен. Поэтому IND-03 и IND-05 не объявляются полностью PASS.

Crash происходил после readiness, без активной бизнес-операции. Потеря owner во
время изменяющего dispatch, разрыв сети, durable recovery и отсутствие replay
после таких сбоев остаются отдельной приёмкой IND-10. Этот отчёт не сертифицирует
Windows/macOS, release provenance, подписи или установленный Desktop regression.
