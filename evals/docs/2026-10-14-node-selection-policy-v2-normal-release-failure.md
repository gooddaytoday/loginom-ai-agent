# Политика v2: продолжение после отказа с штатным release

Контракт execution-r4 фиксируется до следующей новой модели. Критерии
`node-selection-policy-v2` / `5b5053d14aecf7462e317b75fa3a14fa3bff6717080128edf0da582171a015fa`,
матрица31, runtime `659588…`, модель и входы неизменны. Изменение уже разрешено
прямым указанием пользователя: функциональный отказ не блокирует политику,
но требует содержательных доказательств, обязательного ревью и strict release.

## Фактическая необходимость

Candidate first-last-touch/2 завершён17:28:06.768Z. Стандартная аналитическая
цепочка построена, четыре Export-попытки отклонены без эффекта из-за отсутствия
Canvas outline control. Промежуточный пакет сохранён, CSV отсутствует.
Original wrapper2/calculationfalse/oraclefalse/policyincomplete остаются такими.
Причина отсутствия результата — реальные UI-отказы, а не сам oracle false.

Own cleanup подтвердил закрытие пакета и logout. CLI2540012 и Host2540474
завершены, ACKtrue/exit0, guard отсутствует. Административное восстановление
этой штатно завершённой сессии не требуется. Runner r3 остановился с
`ATTEMPT_NOT_COMPLETE`; этот остановленный ledger и его source lock сохранены.
Предыдущие четыре source-файла архивированы readonly: index `d949fb8d…`.

## Допуск и границы

Узкий дополнительный путь действует только с opt-in execution-v2 context,
для стандартной candidate попытки с уже собранным пакетным closure и штатным
release. Используется существующий новый readonly policy-v2 sidecar по
phase/task/attempt. Его criteria SHA, Session, task, attempt, package и ссылки
на исходные attempt/audit/parts/runtime/closure должны совпасть с доказательствами.
Обязательны reviewer/reason, полный журнал, содержательные аналитические решения,
отсутствие необоснованного JS и отдельное положительное ревью отказа/аномалии.
Prepare/import-only, недостаточный/отрицательный/чужой review допуска не дают.

Runner не переписывает audit и не выставляет ему фиктивные graph/export/oracle
PASS. Он разрешает только переход к следующему слоту с отдельной причиной
`POLICY_V2_FAILURE_RECORDED`; исходные результаты сохраняются. Успешные обычные
попытки идут прежним путём. Default v1 не меняется. Все существующие проверки
protected/copy hashes, package identity, own package/logout/resource/terminal/
Host close, dead PID и writer absence остаются обязательными.
Ни JS-попытка, ни незавершённый runtime не разрешаются этим путём.

## Реализация и проверки

- [ ] В `evals/test/node-selection-series.test.ts` получить RED через публичный
  `runSeriesSlot` на обезличенной проекции фактического partial-save отказа.
- [ ] Минимально изменить только `evals/script/run-node-selection-series.ts`:
  связать новый sidecar с исходными sealed evidence и допустить policy-only
  переход после прежних strict-release проверок. Исходные значения не изменять.
- [ ] Последовательно проверить отрицательные/неполные/чужие доказательства,
  ранний отказ, JS и каждый прежний release блокер; подтвердить старый v1 halt.
- [ ] Выполнить focused tests и package typecheck; получить независимое ревью.
- [ ] Зафиксировать новый immutable execution-r4 lock до нового dispatch;
  проверить readonly gate на том же закрытом слоте, сохранив исходные hashes.

Следующий слот — explicit-js/2. First-last-touch/2 не повторяется; его отказ
не заменяется успешной попыткой. Runtime и обработчики узлов не изменяются
и не пересобираются. Новая модель запрещена до GREEN/review/admission.
