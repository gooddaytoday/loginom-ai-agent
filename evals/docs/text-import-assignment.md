# Шаблон назначения текстового импорта

Подготовлено к отдельному запуску владельцем; сейчас не выполнять.

Карточка содержит ID из `src/text-import-cases.json`, inputs-only ZIP и внешний
SHA256. Закрытый код/черновики/ожидания находятся в отдельном preparation-комплекте
карточки 0. Полный исходный ZIP с private transactions не передавать.
Полученный exact SHA checkout проверять независимо; локальный путь не является доставкой.

Worker model Rich/Ben/Evaler: UNCHANGED. Scenario builder reference/product:
`EVAL_AGENT_MODEL=openai/gpt-6-luna`, `EVAL_AGENT_VARIANT=high`; legacy
`MODEL=openai/gpt-6-luna`, `VARIANT=high`; provider model ID `gpt-6-luna`.
Actual модель подтверждается после будущего запуска, в текущем этапе NOT_RUN.

Допуск по LAB-55 и runtime повторить непосредственно перед исполнением.
Не менять baseline/общий runtime. При конфликте предпочесть отдельный локальный
стенд, проверив фактическую изоляцию ресурсов и лимиты провайдера.

Цепочка Evaler→Rich→Evaler→Ben→Evaler. Rich работает на frozen SHA, максимум три
reference-попытки; Ben фиксирует независимый oracle до открытия авторских ответов.
Оба выполняют один fresh product run каждого ID: skip-judge/repeat=1.
Принятый skill 1.0.7 и импортный контракт читать из exact checkout назначения.
Обязательны input/native/sequence/typed warm/cold/mutation/provenance/cleanup проверки.
Diagnostic не требует успешного пакета; положительный reference без cold не допускать.
Качество ACCEPT/REJECT/BLOCKED отдельно от product PASS/FAIL/ERROR.
После ACCEPT Evaler переводит в in_review; Done/merge/release — действия владельца.

Будущая последовательность: 0→1→2→3→4→5→6→7. Старт следующей карточки требует
отдельного разрешения владельца, ACCEPT предыдущей и подтверждённой очистки.
Подготовка не создаёт runs, mentions, wakeups или расписания.
