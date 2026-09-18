# Native TUI: живой CSV oracle A/B

Дата: 2026-09-17. Результат: PASS в описанном Linux headless TUI scope.

## Артефакт и воспроизведение

Candidate `/tmp/loginom-cli-candidate-20260917-tui-files`, version
`0.0.0-dev-202609171808`, Linux x64, sourceDirty=true.
Source commit `c37913ab5ca8f421b76286bf25c282b83cc2de56`;
sourceTreeSha256 `e88186d6093fa0033bbacfa986ff23ef561d2507279effa894da94bce115460e`.
Archive SHA256 `756a7917c67343acdfa5206390357ce22d1e9c9f1ce616bd4b0ca8f6ccdbe1aa`.

Manual `packages/desktop/test/loginom/runtime-acceptance.ts` запущен с
`LOGINOM_AI_AGENT_TEST_CLI_INTERFACE=tui` и этим native executable/resources.
`cli-oracle-transport.ts` предоставлял локальный scripted provider;
`tui-oracle.py` управлял PTY: выбирал `@sales.csv` через autocomplete и отправлял
задание. Вызовы шли через настоящий TUI worker/backend v1, общий host и
комплектные Node/runtime/Chromium в живой Loginom. Private admission не подменялся:
oracle сверял SHA256 файла, полученного runtime из исходного пользовательского
сообщения. Для каждого набора использовался отдельный профиль.

## Результат

| Проверка | A | B |
| --- | --- | --- |
| Имя файла | sales.csv | sales.csv |
| Значения amount | 10, 20, 25 | 100, 1 |
| Группы | Alpha=35, Beta=20 | Alpha=100, Beta=1 |
| Независимый cold readback | PASS, total=55 | PASS, total=101 |
| settingsReapplied | false | false |
| Native TUI exit | 0 | 0 |
| Forced exit / оставшийся guard | false / false | false / false |

Оба сценария прошли импорт, исполнение, группировку, сохранение и закрытие.
После выхода TUI отдельный Node reader открыл сохранённый пакет, исполнил узлы
без повторной настройки и проверил данные. Source paths двух CSV различаются.
Тестовые удалённые пакеты имеют уникальные имена прогона и сохранены; операции
прежних неопределённых прогонов не повторялись.

Private evidence: `/tmp/loginom-linux-oracle-AzjH3J/summary.json`, 32 tool receipts,
`cli/*/tui-exit.json`, `cli/*/exit.json`, `cold-A/result.json`, `cold-B/result.json`.
Terminal output проверен адаптером на отсутствие настоящего API key перед
сохранением в private evidence. Raw terminal/credentials не добавлены в git.

## Границы доказательства

Использован scripted provider и явно задан permission bypass. Это доказательство
полного tool/runtime пути из TUI, а не качества рассуждений модели или permission
UI. Headed mode, resume, аварии во время мутаций и установленный Desktop regression
здесь не проверены. Установленный Desktop не изменялся.

Ранее CLI run прошёл oracle на версии 0.0.0-dev-202609171753; эти две проверки
не доказывают IND-02/03 для Desktop/TUI/run одного source build.
Изменение source SessionPrompt, приводящее model text и admission к одному
snapshot, и новый acceptance driver сделаны после snapshot этого candidate.
Source regression snapshot/range, missing file и отмены чтения: 4/8 PASS;
Agent/Host/Desktop typecheck PASS. Новый snapshot-контекст ещё требует native
пересборки. Все платформенные gates Windows/macOS остаются отдельными.
