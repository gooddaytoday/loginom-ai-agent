# Local file paths (#74)

Готов один reference: [csv-two-paths](csv-two-paths/SPEC.md). Два вложенных
`data/Первый #1/sales.csv` и `data/Второй %2/sales.csv` передаются через prompt
в режиме `input_mode: paths`, без вложений. Независимый результат: Alpha=17,
Beta=20, Gamma=5. Исходные пути и одинаковые basename не сплющиваются.

Reference построен настоящим приватно установленным CLI candidate
`0.0.0-dev-202610211509`, source `bbd2e1af7d`, Loginom 7.4.2.
Модель **openai/gpt-6.1-sol**, variant **xhigh** подтверждены по БД.
Первая попытка, без подсказки, 570 с; граф/CLI-CSV и cold browser MCP rerun
прошли. Шесть узлов активны без ошибок; повторная выгрузка совпала с oracle,
пакет закрыт без сохранения. Runtime ACK/exit0 и освобождение профиля подтверждены.
Подробности и SHA входов/reference находятся в `csv-two-paths/provenance.json`.
Task-local копии scripts skill сохраняют relative paths и проверяют источник по
admission/grant/operation/destination/SHA; установленный skill не менялся.

`local-lgp-edit` пока не входит в принятую коллекцию: автономный source package
заблокирован контрактом создания источника. См. [блокеры B1–B2](../../../docs/testing/loginom-ai-agent/local-file-paths-blockers.md).
Калибровка и isolated benchmark **NOT_RUN**. Reference authoring не заменяет
sandbox benchmark или Desktop/CLI routing acceptance.

После готовности обоих cases выполнить из `evals` платную калибровку только пары
(каждый reference служит foreign negative другому):

```sh
JUDGE_MODEL=gpt-6-sol JUDGE_REASONING=xhigh bun run src/run.ts --calibrate --tasks tasks/local-path-scenarios --only csv-two-paths,local-lgp-edit
```

Затем live benchmark по задаче 8 с явным `EVAL_REPEAT=1`; его фактические model и
variant будут записаны отдельно. Повторные benchmark/corpus сюда не добавляются.

Хэши коллекции из task-local `validate_collection.ts`:

- `agent_inputs_hash`: `91c875c792de22f312b3fa32a71309735443d77d1b51aa577350f8385dfb9927`
- `rubric_hash`: `96516dc821f47d97d7db364d62411c5da9c1bf58410179da5661e0fe5f51b89b`

Хэши относятся к текущему единственному принятому case и должны обновиться при
добавлении второго. Неполные drafts и runtime evidence хранятся вне коллекции.
