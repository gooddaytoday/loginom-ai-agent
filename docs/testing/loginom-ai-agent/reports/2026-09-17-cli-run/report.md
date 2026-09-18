# Native CLI run: живой oracle A/B

Дата: 2026-09-17. Результат: PASS для описанного ниже Linux headless CLI run.
Это не итоговая сертификация IND-01…14 и не проверка production-модели.

## Артефакт

- Candidate: `/tmp/loginom-cli-candidate-20260917-async-wait`.
- Version: `0.0.0-dev-202609171753`, Linux x64, sourceDirty=true.
- Source commit: `c37913ab5ca8f421b76286bf25c282b83cc2de56`.
- Source tree SHA256: `3c0255cc355b2f299dd7f011129956da3587bda6ca3b3c0760bdb9b9507215dd`.
- Archive: `/tmp/loginom-ai-agent-cli-0.0.0-dev-202609171753-linux-x64.tar.gz`.
- Archive SHA256: `b1cf1d86d4798aa0beffd9ba69eb5cbe7bee8177e53125e88391cba6f3db3e83`.
- Build verified the extracted archive inventory. Documentation written after build
  is not part of that source snapshot. The candidate was invoked by absolute path;
  this run does not independently certify installation or PATH isolation.

## Проверенный путь

`packages/desktop/test/loginom/runtime-acceptance.ts` использовал
`packages/loginom-host/script/cli-oracle-transport.ts`: локальный scripted
OpenAI-compatible provider выдавал вызовы через настоящий backend v1 CLI.
Операции выполнялись настоящими комплектными host/Node/runtime/Chromium на живом
Loginom. Development CLI_BUNDLE override не использовался. Loginom credentials
подавались приватно; в репозитории не сохранялись.

Для каждого набора создан отдельный CLI profile. `loginom setup --stdin-json`
достиг ready; `run --headless --format json --file ...` выполнил prepare,
доставку исходного пользовательского вложения, импорт, группировку, сохранение,
закрытие пакета и наблюдение закрытого состояния. Permission bypass был явно
задан тестовым runner; это не доказательство работы интерактивного permission UI.

| Проверка | A | B |
| --- | --- | --- |
| Имя вложения | sales.csv | sales.csv |
| Поля | Category;amount | Category;amount |
| Значения amount | 10, 20, 25 | 100, 1 |
| Группы | Alpha=35, Beta=20 | Alpha=100, Beta=1 |
| Итог независимого cold readback | 55 | 101 |
| Повторная настройка узлов | Нет | Нет |
| CLI exit / оставшийся guard | 0 / нет | 0 / нет |

Source paths обоих вложений различаются. Холодное открытие выполнялось отдельным
Node reader после выхода соответствующего CLI; оба результата имеют status PASS,
settingsReapplied=false. Cleanup reader подтвердил закрытие пакета и logout.

Private evidence: `/tmp/loginom-linux-oracle-KnLoLK/summary.json`, tool receipts,
`cli/*/exit.json`, `cold-A/result.json`, `cold-B/result.json` и cleanup receipts.
Удалённые тестовые пакеты имеют уникальные имена этого прогона и сохранены.
Предыдущая неопределённая операция из `/tmp/loginom-linux-oracle-idY1ka` не повторялась.

## Исправление и регрессии

Runtime сообщает активную асинхронную работу отдельно от общей незавершённости.
Host сохраняет durable admissions через wait, разрешает владельцу ожидать и
снимает только его записи после подтверждения отсутствия unsettled work.
Потеря владельца или неопределённость сохраняют recovery; другой run не получает
права снимать его записи. Полный живой oracle подтвердил, что `running` после
node apply больше не блокирует последующий node wait.

- Host: 21 tests, 136 assertions PASS; новые процессные сценарии: 5/58 PASS.
- Runtime executor/bridge: 51 tests PASS.
- Host, Agent, Desktop typecheck PASS; `git diff --check` PASS.
- Native TUI PTY setup/password/prompt: PASS, exit 0, guard=false, alive=[],
  secret_visible=false, history_verified=true. Эта отдельная проверка использовала
  fixture runtime/provider, а не живой Loginom. Private evidence:
  `/tmp/loginom-cli-tui-n1cy818x`.

## Открытые границы

Одинаковый prompt и настройки через Desktop/TUI/run, живой TUI oracle,
headed/headless/resume matrix, потери процессов/сети во время изменяющей операции,
установленный Desktop regression и native Windows/macOS acceptance не закрыты
этим отчётом. Установленный Desktop не изменялся. Candidate не опубликован.
