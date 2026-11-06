# Analytics expansion — Бизнес-вопросы B

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

Отчёт по сохранённым измерениям **24 ранее принятых eval-пар / 24 форм этой коллекции**. Итоговый K кампании —24/50:26пар deferred вне этого знаменателя; прежние65 задач не смешиваются с новым набором. [Общий отчёт](analytics-expansion-final.md) фиксирует все50 dispositions.

## Источники и область

- Исходы, run IDs, pins и ограничения: accepted-outcomes-report-input.json (приватный архив; не опубликован).
- Парный контекст и исторические различия: accepted-outcomes-summary.md (приватный архив; не опубликован).
- Именованные structural verdicts, точные result/rubric sources и правило агрегации: accepted-structure-report-input.json (приватный архив; не опубликован).

## Раздельные показатели

- **Official pass:** T=6, F=18, recorded NULL=0; знаменатель — все 24 формы, включая отказы.
- **Numeric oracle:** T=10, F=14, recorded NULL=0; oracle не проверяет весь формат, граф или Save.
- **Completion/status:** completed=13, failed=6, no_artifact=5. Это записанный status, а не full-contract success.
- **Judge status:** no_artifact=11, scored=13. Пропущенный judge не заменяется оценкой.
- **Resources:** PASS=11, FAIL=13; одновременно official pass=T и resources PASS — 3. Resource FAIL сохранён отдельно от eval-вердикта.
- **Report-defined structural criteria:** PASS=10, FAIL=3, unknown=11; официальный structural_score ниже учитывается отдельно.

## Как читать structure

Report-defined показатель проверяет только выбранные именованные структурные пункты: frozen `axis=structure`, явные `native-data-flow`/`native_structure`/`native_scenario`; при их отсутствии у P42/P44 — `export-contract`, прямо требующий связный native-граф.

PASS означает непустой набор и явный true у каждого выбранного actual checklist verdict; FAIL — полный набор с хотя бы одним false. Если пункт отсутствует, checklist пуст/NULL или judge пропущен, результат unknown. Score, oracle, no_artifact и отсутствие failed IDs не заполняют этот пробел.

Покрытие пунктов неоднородно: это не единый официальный score и не проверка всех предметных требований. `official structural_score` передан без пересчёта: 0=1, 100=1, NULL=22. NULL не заменён нулём.

## Все 24 сохранённых исхода

T/F — записанный boolean; NULL — официальный NULL; unknown — отсутствующий structural verdict. Колонка structure: **report-defined / official structural_score**. Ссылка pins ведёт к сохранённому run summary с agent/judge/binary/runtime pins; это не новая проверка установленного продукта.

| ID / slug | Score / pass / oracle | Actual status | Resources | Structure | Actual result / evidence / pins |
|---|---|---|---|---|---|
| P01 · receivables-payments-credits | 63 / F / T | completed | PASS (приватный архив; не опубликован) | T / 100 | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P02 · procurement-three-way-match | 75 / F / T | completed | FAIL (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P03 · inventory-ledger-reconciliation | 13 / F / F | completed | FAIL (приватный архив; не опубликован) | F / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P05 · freight-weight-bill-audit | 0 / F / F | no_artifact | PASS (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P06 · licensed-seats-billing-audit | 0 / F / F | failed | FAIL (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P07 · accepted-returns-credit-audit | 63 / F / F | completed | FAIL (приватный архив; не опубликован) | F / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P08 · budget-unbilled-commitments | 0 / F / F | failed | FAIL (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P09 · customer-base-purchase-penetration | 0 / F / F | no_artifact | FAIL (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P11 · cross-device-campaign-reach | 100 / T / T | completed | FAIL (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P12 · inspected-unit-defect-rates | 0 / F / F | no_artifact | FAIL (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P13 · joint-ownership-revenue-allocation | 0 / F / F | no_artifact | FAIL (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P14 · order-discount-category-revenue | 75 / F / T | completed | FAIL (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P16 · daily-cash-bank-reconciliation | 0 / F / F | failed | PASS (приватный архив; не опубликован) | unknown / 0 | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P17 · observed-purchase-cohort-retention | 63 / F / T | completed | PASS (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P18 · signup-month-product-activation | 0 / F / F | failed | FAIL (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P20 · employee-day-attendance-overtime | 0 / F / F | no_artifact | PASS (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P21 · station-hour-bike-flows | 0 / F / F | failed | PASS (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P22 · invoice-first-payment-lag | 100 / T / T | completed | FAIL (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P23 · matched-basket-price-index | 13 / F / F | completed | PASS (приватный архив; не опубликован) | F / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P27 · tariff-functional-conflicts | 0 / F / F | failed | PASS (приватный архив; не опубликован) | unknown / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P41 · wholesale-basket-concentration | 100 / T / T | completed | FAIL (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P42 · paired-change-dispersion | 100 / T / T | completed | PASS (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P44 · delivery-cost-dummy-regression | 100 / T / T | completed | PASS (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |
| P46 · three-type-minimum-sse | 100 / T / T | completed | PASS (приватный архив; не опубликован) | T / NULL | result (приватный архив; не опубликован) · evidence (приватный архив; не опубликован) · pins (приватный архив; не опубликован) |

## Существенные ограничения

**P01: historical и текущий judge-only различаются.** Исходные sole model attempts дали D100/T/T и B88/T/T; после исправления пропущенного format-критерия те же артефакты получили текущие63/F/T в обеих формах. Таблица использует63; нового model run не было. Structural100 не отменяет result-full/honest-report=false.

**P06D: official PASS не равен полному контракту.** Сохранены88/T/T и native-data-flow=true, но nonrequired saved-export=false/full_contract_conformant=false. Это не основание пересчитать verdict или назвать полный one-export contract выполненным; для B сохранён собственный failed/0 исход.

**P46D: interrupted, judge skipped.** Official score/pass/oracle и structural_score — NULL, native_scenario verdict unknown. Архивный численно верный CSV не заменяет эти значения и не доказывает полный saved-package PASS; B имеет собственные100/T/T.

У P17B native-data-flow=true не отменяет три false предметных пункта и official63/FAIL; независимая семантическая интерпретация в review не является rescoring. Аналогично numeric oracle=T при денежном format FAIL не означает весь результат PASS.

Pins внутри D/B каждой принятой пары зафиксированы равными, но это не утверждение одной сборки всей кампании. Configured judge pins сами по себе не доказывают judge invocation; actual judge_status и связанные reviews сохранены отдельно.

По одной попытке на форму, отбор только принятых и уже измеренных пар, разные типы задач, рубрики, время/нагрузка и инфраструктурные отказы создают heterogeneity и selection bias. Нельзя обобщать доли на все50 задач или причинно приписывать разницу D/B формулировке. В частности, provider401/token_expired P27B не доказывает аналитическую сложность B.

Конкретные memory/cleanup/IO/RSS/reopen/response-tier ограничения остаются в связанных actual evidence/reviews. Известные FAIL и NULL не исключались ради улучшения долей; итоговое независимое review и его результат приведены в [общем отчёте](analytics-expansion-final.md).

## Отдельно, вне знаменателя accepted24

**P19D:**100/T/T, completed, resources PASS — сохранённая verification (приватный архив; не опубликован). **P24B:**75/F/T, completed, resources FAIL — сохранённая verification (приватный архив; не опубликован). Это одиночные сохранённые измерения deferred/незавершённых пар; они не добавлены к24строкам, долям или структурным счётчикам отчёта.

## Проверка автором

Offline selfcheck:24ID/slug и все значения каждой строки сопоставлены исходному input и actual result; все локальные ссылки существуют; структурные показатели сопоставлены отдельному48-row input. Judge/model/runtime/oracle не запускались. Созданы только два отчёта D/B; cards/checkpoint/rubric/score не менялись. Это авторство отчётов, не независимое final review.
