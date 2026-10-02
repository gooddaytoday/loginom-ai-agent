# JavaScript: завершение обучения узла

- event_id: `javascript-v1-completion-20261003`; campaign_id: `javascript-20260926-ubuntu`.
- node_id: `component.programming.JavaScript`; outcome: completed, candidate accepted.
- owner task: `01a0ddc9-3e19-75d3-a5c9-724783ed6c35`.
- Source: `6f6a66eb62c78ab2e8b10cd1bd7f38bcf931d8d6`, ветка `node-javascript`.
- Candidate15: `0.0.0-dev-202610022103`, manifest
  `93f4ae54483433b6de17b98eca43c885b722cd917eeb4c1e877f32ad9947455b`.
- Target: Loginom Enterprise7.4.2/Linux, Ubuntu x64, обычный headed Chromium,
  `http://logi-test-plan.bg.local/app/`, собственный аккаунт `jsteach`.

Реализованы knowledge1.2.0, зарегистрированный обработчик
`programming.javascript`/`script`, code/declared schema, new/existing,
точное чтение/замена source, current context и явный configured-output opt-in,
owned UI lifecycle/diagnostics/recovery, Execute/read и сохранение пакета.
Обычный CLI подключает существующий guarded native Close по последнему
подтверждённому собственному Save до logout/browser shutdown.

Проверки и границы каждой строки G1–G7/J01–J27/фаз0–6 приведены в
[аудите завершения](completion-audit.md). Последние current source проверки:
115 diagnostics/recovery и518 source/budget/UI/calculator tests PASS;
provenance5045PASS. Эти наборы не суммируются с перекрывающимися прежними suites.
Same-task F и адресные исправления зафиксированы в checkpoint.

[Автономная pair13](completion-phase6.md) принята: две independent original
standalone CLI GPT-6.1 Sol/low попытки, только бизнес-задача/CSV/save path,
полные6×4 результаты, ручная проверка всего авторского source, независимые
path-only cold reopen/source/settings/mappings/graph/fresh Execute и cleanup.
Pair audit SHA256
`33d8c16431faa9a4b510e3bc090eaf9f415f9e03afda0c14391e9796fd26f39a`.
Original holder завершён после проверки обеих terminal trials. Acceptance slot
освобождён; пакеты закрыты, `.writer` отсутствуют, процессы завершены.

Scope v1: один табличный input/output0, synchronous builtIn/Data, scalar types,
source≤32KiB/1024LF, declared≤64 columns. Не заявлены весь int64, UTC/epoch Date,
полный ES/Data API, async/Fetch/FS/external modules, multiports/variables,
другие платформы/builds. Natural insufficient-primary/Done error not_observed;
fixed context probes не доказывают общую устойчивость модели к prompt injection.
Внешний TestCafe not_run по принятому плану. Старые failed trials остаются FAIL;
точная live-причина прежнего shutdown hang не установлена.

**Интеграция и выпуск не выполнены.** Основной checkout `javascript` сохраняет
14 зарегистрированных handlers; новый handler находится в принятом child/candidate.
Реестр различает это состояние. Следующий возможный этап — отдельно назначенная
интеграция; merge/push/release/замена установленного клиента не производились.
Следующий узел не назначается.
