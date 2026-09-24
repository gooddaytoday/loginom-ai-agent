> Исторический документ, адаптированный для навигации в Loginom AI Agent. Даты, версии, SHA и результаты относятся к прежним проверкам. Пути к коду указаны относительно нового репозитория; это не доказательство проверки текущих файлов. Исходник `source-872ff1e94409` и изменения: [происхождение](../../../../../docs/node-development/provenance.json). `unavailable:artifact-*` означает [неперенесённый материал](../../../../../docs/node-development/history/unavailable.md). Актуальная работа: [регламент](../../../../../docs/node-development/README.md).

> Пакет разрешён пользователем и выполнен командой
> `node11:saveas-integration:1:direct-user-20260913`.
> [Результат и новые pins](11-saveas-integration-results-2026-09-13.md).
> Ниже сохранён первоначальный план переноса.

# Узел 11: минимальный пакет интеграции Save As

Статус: **integration_package_ready / awaiting_user_authorization**.
Команда: `node11:coordinator-reply-resume:1:20260913`.
Целевая ветка: `codex/node-11-replacement`, исходный HEAD
`7c2f766ea2cac03a6ad0e3e954e585d90603ac7a`.
Код не перенесён. Cherry-pick, merge, тестовые прогоны, браузерная диагностика,
Hermes, сборка и stage в этой фазе не выполнялись.

## Источник и границы переноса

Принятый production commit узла12:
`0e11a3fb24ca40a9f855008d2b0d1856d6f771ad`.
Статус reassessment122/122 принят со слов координатора; повторная приёмка здесь
не проводилась. Адресно прочитан сам коммит и его различия с нашей веткой.

В нашей ветке подтверждён тот же проблемный порядок: после исчезновения file dialog
ветка reopen сразу нажимает Packages, а ожидание исчезновения `packages.save_as`
и событие `save_flow_completed` находятся только внутри `if (keepOpen)`.
Исправление переносит это существующее ожидание, проверку saveError и запись
события перед условием, распространяя их также на close/reopen.
Это ожидание завершения native Save As; не произвольная задержка и не изменение
жизненного цикла пакета. Дополнительная диагностика старой гонки не нужна.

| Файл | Точный объём будущего переноса | Проверенная применимость |
| --- | --- | --- |
| `packages/loginom-runtime/client/lib/executor.mjs` | Единственный hunk коммита, `browserCapability`, исходная строка992: ожидание native Save As перед `if (keepOpen)` | `git apply --check` прошёл, код не применялся |
| `packages/loginom-runtime/client/test/executor.test.mjs` | Только новый тест `overwrite waits for native Save As menu dismissal before reopening its Close command` | Исходный hunk не применяется из-за отличающегося контекста EOF; добавить этот тест отдельно после нынешнего последнего теста |

Контекст конфликта установлен: у узла12 перед новым тестом имеется отдельный
`save/reopen graph proof retains links with semicolons in automatic node labels`,
которого в узле11 нет. Кроме того, ранее узел12 изменил распознавание связей с `;`
в `graphSnapshot` (около строки415 executor). Эти изменения предшествуют выбранному
коммиту и не являются зависимостью ожидания Save As. Main/Partial/Typed/Preserved
не содержат `;`. Не заменять целиком unavailable:artifact-e31e521c0e5fdbf9 и не переносить эти изменения
вместе с ожиданием. Общий `packages/loginom-runtime/client/test/support/executor-fixture.mjs` совпадает
между родителем source commit и целевым HEAD; новые fixture-зависимости не выявлены.

Остальные пять файлов source commit исключены: `duplicates_node_acceptance.py`,
`full_read_evidence.py`, `persisted_import_evidence.py`, `test_full_read_evidence.py`,
`test_persisted_import_schema.py` в `unavailable:artifact-6c9840df3f4b6129` относятся к аудиту
узла12. Для переноса ожидания они не требуются. Принятые A1–A3 и эталоны Replacement
не пересматриваются. Наш persistence-аудитор допускает дополнительное событие
`save_flow_completed` перед close, сохраняя обязательные checkpoint и reopening.

### Идентификаторы для сверки перед применением

- Исходный blob executor: `2b2bf2627ad63aa3c92d47978b033bd82d7a7cc5`.
- Целевой blob executor: `c6369c00533ac3fee3c0aa6e4c25b60cb084ad93`.
- Исходный blob test: `c0fec25a108d939307be3355ef26d2b34a6ea9dc`.
- Целевой blob test: `0d6e2c4ce07164df769f3e1a884aaac7659fedcd`.
- SHA256 штатного diff executor (`git diff SOURCE^ SOURCE -- FILE`):
  `a7d1b5e5e3e484c335b9388b5d11b4b877658cdb6ee925d977dcf2aa553a205b`.
- SHA256 штатного diff test до разрешения контекста:
  `167a7f12567587eeee0106ff9d1adcbf5740abe6d1a3efd05bda505f2333126f`.

Полный cherry-pick source commit избыточен и не разрешён. После отдельной команды
пользователя следует перенести только указанный runtime hunk и один тест,
сохранив текущие изменения ветки11. При изменении целевых blobs сначала повторить
только проверку применимости, а не весь принятый follow-up.

## Focused-проверка после разрешённого применения

1. Запустить собственным Node24 набор `packages/loginom-runtime/client/test/executor.test.mjs`: он содержит
   новый overwrite race test и существующие keepOpen, conflict fail, точный path/
   graph, закрытие меню и delayed Open проверки. Не повторять полный A1–A3 аудит.
2. В отдельном видимом source-browser профиле, `--start-maximized`, viewport=null,
   Loginom7.4.2/test-2 подготовить собственный небольшой диагностический пакет
   Main → Typed по имеющимся Replacement fixtures. Выбрать уникальный новый путь
   `/test-2/packages/Node11-saveas-integration-<session-id>.lgp`, зафиксировать
   реальные session/runtime/catalog/browser pins и исходные graph/settings/output.
   Соседние браузеры и исходный read-only acceptance-пакет не изменять.
3. Выполнить checkpoint в этот новый путь, оставив пакет открытым: дождаться
   `save_flow_completed`, точного path/graph и `reopened:false`. Затем отдельно
   SaveAs в тот же собственный путь с разрешённой перезаписью и close/reopen.
   Проверить порядок `overwrite_confirmed` → `save_flow_completed` →
   `saved_package_closed` → `package_open_command_ready` →
   `reopened_package_observed` → `postcondition_verified`; потребовать реальное
   закрытие прежней вкладки, точный путь, неизменный граф и `reopened:true`.
   Ошибка/таймаут остаются отказом; не маскировать их повторными toggle или unlock.
4. После reopening выполнить существующие Main и Typed без перенастройки,
   подтвердить новые execution IDs, сохранённые параметры и полный Typed6×11
   независимым component-аудитором. Это ограниченная диагностика общей операции,
   не замена полной автономной задачи11 (11 операций/4 узла/2 связи).
   Штатно закрыть собственный пакет/браузер и сохранить receipts/result.

Если race воспроизведётся, остановиться на фактическом отказе и передать evidence
координатору/владельцу общего исправления; новый полный аудит или Hermes не запускать.

## Следующая контрольная точка

Требуется отдельная команда пользователя на применение этого пакета. До неё
runtime остаётся `3b21e8f0c52820b058caf9c02bb00d006d7bf9b451891ec27646f8018e46e00e`;
новый candidate/stage не готовится. После изменения кода и focused-проверки
потребуются новый source commit/runtime pin и обновление исходного архива и launch
pins; согласование VPS stage/readback и Hermes slot остаётся у координатора.
Исторический FAIL55/59 узла11 и принятые результаты A1–A3 остаются без изменений.
