> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-94ca97ba6c96` и изменения: [происхождение](../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../docs/node-development/README.md).

# Узел 14: preflight кандидата test4.2 — 2026-09-13

Назначение `node14:candidate-preflight:2:cadd80dfd8490f40c851475008a1ccd68d7a617dbcf6a77de25034ff8da7b2ad`
выполнено: **preflight PASS**, комплект готов к одному полному Hermes после отдельной
выдачи слота координатором. Модель не запускалась. Полная приёмка не выполнена.

## Точные версии и скачанный кандидат

Координатор предоставил immutable `2026.09.13-node14-test4.2-candidate`.
Manifest URI:
`viking://resources/loginom-dock/catalogs/executor-preview/releases/2026.09.13-node14-test4.2-candidate/manifest.json`.
SHA: `cadd80dfd8490f40c851475008a1ccd68d7a617dbcf6a77de25034ff8da7b2ad`.

Все **4/4** файла заново скачаны через штатный Dock download API и сверены по
размеру/SHA с readback координатора; три каталожных файла также сверены с manifest.
Локальные точные байты: `unavailable:artifact-b6b9a34715c1b3fc`.
В этот же каталог скопированы неизменённые stage-report и coordinator-readback,
необходимые полному аудитору. Первое скачивание ограничил сетевой sandbox;
повтор с разрешённым сетевым доступом прошёл. Серверных изменений не выполнялось.

Source `83dc0db5c4d765706f9dd5271bfe5ecc46220cb4`, предшествующий отчёт
`64bad441957190c016b805f05532f85798e2772f`. Source runtime:
`bdddbd1b922f99b0f8db4a6fa47b7e7c89315b4f5632d914531fdd6befaea77e`.
Подтверждены **156 runtime inputs, 395 source build inputs, 252 harness inputs**.
Исходники и harness не изменялись; SHA карты harness:
`a07e20a505fbd578bf3f14f7d81f305fb13658ba6c6c3a691da789975428eea5`.
Новый manifest SHA установлен только в новом приватном комплекте запуска.

## Реальный startup без модели

- Run подготовки: `20260913-132114-47f98daf`; отдельная сессия:
  `e68cf952-70a9-49e5-a232-56e3f8aef345`.
- Source MCP загрузил candidate2; журнал связывает его manifest и заданный runtime.
- Loginom `http://logi-test-plan.bg.local/app/?testable=true`, пользователь `test-4`,
  build 7.4.2: authenticated, ownership_verified, target_verified и READY.
- Создан отдельный несохранённый черновик. Фактическая геометрия того же окна:
  viewport=null, inner 1508×862, outer 1508×949, available 1512×949.
- Реальный prepare принял **8/8** входных CSV. Имена, размеры, SHA и grants
  сверены с frozen fixtures; назначения строго `/test-4`, overwrite=reject.
  Это admission входных файлов, не выполнение 9 импортов или полного сценария.
- Каталог разрешает `/test-4` для обоих `package.save_as` и
  `package.save_checkpoint`. Сохранение в этой фазе не запускалось.
- Две целевые проверки startup/API прошли. Повтор всей suite не требовался:
  source и harness совпали с проверенным коммитом предыдущей фазы.
- Проверка установленного Hermes 0.21.0 и существующей ChatGPT-подписки прошла:
  `openai-codex` / `gpt-5.6-sol` / `low`, без fallback и модельных запросов.
- Source MCP и собственный браузер закрыты; process-check: `all_stopped:true`.
  OpenViking health и targeted actor recall прошли; routing не менялся.

## Граница готовности и следующая команда

Полный исходный goal сохранился: **27 успешных операций, 9 импортов, 12 финальных
результатов, конечный native save и независимый reopen с полными данными**.
Доказанные терминальные отказы учитываются только строгим scoped verifier сверх
27 успешных операций. Требования и oracle не ослаблены.

SHA исходного goal:
`35a23e9aeb6a37c408e249aec54e12ca1f230cbc219392e5cabe9b6d4675a836`.
Старый `20260913-113814-1bc86af9` остаётся FAIL; **13/13** исходных receipts заново
сверены по размеру и SHA без изменений. Новые доказательства хранятся отдельно.

[Точные pins и индекс доказательств](missing-values-candidate2-preflight-pins-2026-09-13.json).
Готовый план одного запуска:
`unavailable:artifact-1238084df31ff246`.
Он содержит точные аргументы и `launch_authorized:false`; сам план ничего не
запускает. После выдачи слота повторно проверить pins и срок действия подписки,
использовать новый run/session и `unavailable:artifact-9fb194ecd7ffc948`.
Не продолжать уже закрытый startup-сеанс. Для полного аудитора использовать
скачанный каталог candidate2, затем отдельный независимый reader полного scope.

В этой фазе не выполнялись Hermes, review, VPS build/stage/activation, изменения
main или плагина, push, native save и независимый reopen. Candidate staged
координатором, activate=false; production/current по квитанциям координатора не
изменены. Готовность preflight не означает разрешение слота или успешную приёмку.
