# Сетевая готовность eval: план реализации

Цель: исправить процедуру подготовки новой среды и ограничить существующий
requestPreflight без новых запросов, зависимостей или transport-реализации.
Основание — явное дополнение владельца 27.10 из бокового чата; оно не
отменяет LAB-334. Ponytail full, код через TDD, независимые plan/diff reviews.

## Границы

- Product/model/corpus/criteria/budget/clock LAB-334 неизменны; установленный
  harness ed129 сохраняется до отдельного решения по repair/freeze-протоколу.
- Не останавливать здоровые batches. Текущий proxy environment repair
  принадлежит EvalOps и выполняется существующими средствами отдельно.
- Direct runner допустим; proxy не угадывать, маршрут автоматически не менять.
- Секреты, credentials, полный env и raw URLs в диагностике не публиковать.
- Temporary evidence только `/home/kiselev/storage/tmp/luna-baseline-20261027/`.

## Действия

- [x] Независимый review этого плана до реализации: PASS, `/root/plan_review`.
  180 секунд ограничивают запрос, не cleanup. Сначала проверки и публикация
  runbook, затем standing links/read-back; установленный ed129 не обновлять
  неявно. Диагностика показывает env, а не доказанный маршрут.
- [x] В `evals/src/preflight.ts` ограничить только requestPreflight собственным
  потолком 180 секунд: короткий READY не должен ждать timeout аналитического
  кейса 15/30/60 минут. Сохранить возможность существующего меньшего timeout
  для fixtures, если это минимальный совместимый интерфейс. В
  `evals/src/prepared-run.ts` убрать привязку к measurement task timeout.
  Measurement timeout, admission, judge и cleanup не менять.
- [x] RED → GREEN по одному поведению в `evals/test/preflight.test.ts` и
  затронутых существующих fixtures: bounded preflight независимо от task
  timeout, failure/cancellation/cleanup, safe effective proxy-env diagnostics
  и direct без обязательного proxy. Не вызывать живые модели и не мокировать
  internal functions/globalThis. Использовать существующий fake CLI.
- [x] Добавить минимальную диагностику существующего запроса по фактическому
  child environment (режим/наличие proxy/bypass, без значений/credentials).
  Различать конфигурацию proxy и доказанное использование/доступность пути.
  Сохранить её в существующей evidence, без нового framework/обёртки.
- [x] В `evals/docs/autonomous-campaigns.md` добавить одну каноническую
  процедуру: systemd → batch → isolated CLI, фактические HTTP(S)_PROXY и
  NO_PROXY, обход local Loginom, несекретный transport freeze до измерений;
  отдельно local verify, HTTP path и requestPreflight READY всех slots.
  Default periodic оставить только здесь; active scoped wakeups не менять.
- [x] Перечитать ID/инструкции EvalOps, EvalBaseline и EvalRunner в Multica.
  Сохранить before/after вне Git; изменить только instructions: короткие
  обязанности + одна ссылка на канонический runbook; удалить постоянное
  утверждение о runner1 и копии интервалов. Все остальные поля сохранить.
  После записи перечитать и проверить точное совпадение instructions и
  неизменность моделей/runtime/прав/остального. Существующие кампании и
  wakeups не перенастраивать.
- [x] Адресные поведенческие тесты и `bun typecheck` из evals. Независимый
  review полного diff по Ponytail, секретам, callsites, fixtures и границам
  measurement/cleanup/admission. Коммит/push только проверенного результата.
- [x] Решение о поставке отделить от source change: свежий live state,
  разрешённый repair/freeze и обязательные проверки до любой установки.
  В checkpoint явно записать source SHA и реально установленный SHA.

## Приёмка

Новая политика проверена без живых моделей; в диагностике нет утечек;
measurement semantics сохранены; три standing instructions перечитаны;
установленная поставка и source-only изменения названы отдельно.

## Checkpoint исходников

27.10.2026: TDD и адресные проверки завершены: 128 PASS, 2 gated process-denial
SKIP, 0 FAIL, 570 assertions. Typecheck — PASS на hash-verified копии 335
входных файлов (Bun 1.3.14, TypeScript 5.8.2, bun-types 1.3.13).
Независимый plan/diff review `/root/plan_review` — PASS. Private receipt:
`preflight-change-receipt.json` в каталоге evidence текущей кампании.

Единственный production caller больше не берёт timeout измерительного кейса.
В существующий run.json добавлены timeoutMs и пять boolean connectionEnvironment
из env, переданного supervisor после sandbox. Нового transport, конфигурационного
параметра кампании, отдельного запроса или файла диагностики нет.

Кандидаты standing instructions трёх агентов независимо проверены: PASS,
SHA-256 `b37ee48bfdc61e75f08f4c22f8cd13d66b4709cceb77cb8ec06473cd560474ea`.
Их запись/read-back выполняются после публикации этого runbook. Default 7200
сохранён только в runbook; дубликат в evals/AGENTS.md заменён ссылкой.

LAB-334 сохраняет установленный acceptedHarness ed129 и CLI05bb. Доработки
preflight пока source-only; для старта достаточно отдельного environment repair.
Его прямое продолжение взял чат стенда, который согласует владение с уже
активным EvalOps. Новых поручений и параллельных мутаций окружения отсюда нет.

Код и канонический runbook опубликованы в `baseline-luna`, commit
`8685deb150007c158bb3ee8c9a562626780782bb`. После push, в 15:55–15:56 МСК,
изменено только поле instructions и выполнен точный read-back:

- EvalBaseline `77032943-ad18-4ae9-a2c6-668769077c86`;
- EvalRunner `5218b92b-71e0-4197-8225-4c30521a3467`;
- EvalOps `b2d8e21a-61af-41a4-a3aa-39d77bfe29c5`.

У каждого одна ссылка на опубликованную каноническую процедуру; сервер/пути/
интервал определяет конкретное поручение и scoped wakeups. Полный read-back
проверил неизменность остальных конфигурационных полей, включая модели,
reasoning, runtime, права и custom settings; автоматические status/updated_at
в сравнение конфигурации не входят. Private receipt:
`standing-instructions-readback-receipt.json`; before/after сохранены вне Git.

Решение о поставке: новый timeout/diagnostics на LAB-334 не устанавливать.
Для установленного сетевого дефекта достаточно environment repair; смена
harness ради этой source-политики сейчас не нужна. Измерительные условия,
acceptedHarness ed129, product05bb и текущие scoped wakeups сохраняются.
Новый source не проходил live model acceptance и полный suite заново;
утверждается только указанный адресный набор и typecheck. Дальнейшая установка
в новую кампанию требует собственного freeze/qualification по её поручению.
