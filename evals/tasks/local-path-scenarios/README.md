# Local file paths (#74)

Готовы два reference: [csv-two-paths](csv-two-paths/SPEC.md) и
[local-lgp-edit](local-lgp-edit/SPEC.md). В `csv-two-paths` два вложенных
`data/Первый #1/sales.csv` и `data/Второй %2/sales.csv` передаются через prompt
в режиме `input_mode: paths`, без вложений. Независимый результат: Alpha=17,
Beta=20, Gamma=5. Исходные пути и одинаковые basename не сплющиваются.

`csv-two-paths` построен настоящим приватно установленным CLI candidate
`0.0.0-dev-202610211509`, source `bbd2e1af7d`, Loginom 7.4.2.
Модель **openai/gpt-6.1-sol**, variant **xhigh** подтверждены по БД.
Первая попытка, без подсказки, 570 с; граф/CLI-CSV и cold browser MCP rerun
прошли. Шесть узлов активны без ошибок; повторная выгрузка совпала с oracle,
пакет закрыт без сохранения. Runtime ACK/exit0 и освобождение профиля подтверждены.
Подробности и SHA входов/reference находятся в `csv-two-paths/provenance.json`.
Task-local копии scripts skill сохраняют relative paths и проверяют источник по
admission/grant/operation/destination/SHA; установленный skill не менялся.

`local-lgp-edit` принят после независимого review 2026-10-26: исходный автономный
пакет передаётся вложенным локальным путём, существующая формула исправлена на
`amount*3`. Сохранены исходный JavaScript, четыре GUID и три связи с прежними
портами; CLI-CSV и cold browser MCP rerun совпали с oracle 30/60/75.
Первая попытка без подсказки, 300.6 с, приватно установленный prod CLI
`0.3.2-localpaths74.9f7233ce71`, clean source `9f7233ce71`;
`openai/gpt-6.1-sol/xhigh` подтверждена по БД. CLI вернул **1**
(`CLI_TOOL_FAILED`): после активации skill `read` отказался читать бинарный
`.lgp`, затем модель успешно продолжила через Loginom. Native Close/logout,
runtime ACK/exit0 и освобождение профиля подтверждены отдельно. После cold Close
без сохранения байты reference и исходного пакета не изменились. Детали и SHA —
в `local-lgp-edit/provenance.json`. Файлы и исторические проверки `csv-two-paths`
сохранены без изменений.
Калибровка и isolated benchmark **NOT_RUN**. Reference authoring не заменяет
sandbox benchmark или Desktop/CLI routing acceptance.

Следующий шаг — выполнить из `evals` платную калибровку только пары
(каждый reference служит foreign negative другому):

```sh
JUDGE_MODEL=gpt-6-sol JUDGE_REASONING=xhigh bun run src/run.ts --calibrate --tasks tasks/local-path-scenarios --only csv-two-paths,local-lgp-edit
```

Затем live benchmark по задаче 8 с явным `EVAL_REPEAT=1`; его фактические model и
variant будут записаны отдельно. Повторные benchmark/corpus сюда не добавляются.

Хэши коллекции из task-local `validate_collection.ts`:

- `agent_inputs_hash`: `5f4445075f167cdf2b842bb8dd36496e5ccf1bc71396ef924545981846520490`
- `rubric_hash`: `d761d93d039f65e21f5f452163c1b959575317b5a8fdbaf5d4bbec72c15a2d97`

Хэши относятся к обоим принятым cases. Draft и runtime evidence хранятся вне коллекции.
