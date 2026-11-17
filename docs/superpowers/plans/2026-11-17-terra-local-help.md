# Локальная Help: подготовка и запуск на runner1

## Основание и ограничения

Поручение владельца от 17 ноября 2026: перенести локальную Help в отдельную
ветку от autonomy-pilot, проверить новую CLI и запустить сравнение с LAB-1747
на runner1 без ожидания baseline. План независимо проверен до реализации.

- Base: `ae149d3f13277c1e3d4c0775e83d8ce2e6fbb13b`; branch `terra-local-help`.
- Переносить только `ff17297f1c`, `1b841e1883`, `db25763115`; whole-branch merge запрещён.
- Сохранить сценарные возможности base; Help snapshot/aliases не обновлять.
- Эксперимент сравнивает полный local-help: локальный поиск и Help вместо MCP,
  включая прекращение доступа к e2e-tests и ai-skills.
- Исходные рабочие изменения, LAB-1747 и исторические ресурсы сохраняются.
- Доступы Codex получать через Bitwarden по актуальному правилу основного checkout;
  local.env не читать. Секреты и raw evidence находятся вне Git.

## Выполнение

- [x] Точечный перенос и TDD; runtime17/17, Product33/33, staging13/13,
  importer11/11, aliases143/461 и typecheck Host/Product/opencode прошли.
- [x] Независимое ревью переноса; чистая CLI prod/browserRecovery=true со штатными pins.
- [x] Проверка manifests/inventory/archive/hashes и семи установленных Help-инструментов.
- [x] Собственная local N1 пара; по одному calc-data-double, cohort-spend-activity,
  crosstable-fixed-sum из frozen corpus; .lgp/rerun/oracle/cleanup, все попытки сохранены.
- [x] Ветка отправлена, удалённый SHA проверен; pre-push 33/33 typecheck и secret scan clean.
- [x] Runner1: старые службы/reservations сверены; собственные N6 pair/profile/state/unit
  и judge-home; права EvalOps/publisher, native prepare/verify и cleanup проверены.
- [x] Независимое ревью установленной поставки и условий запуска.
- [ ] Свежая in_progress карточка, trigger-preview и единственное назначение EvalOps.
- [ ] Read-only наблюдение до requestPreflight 6/6 и первых measurement admissions.

## Неизменные условия кампании

Harness `ae149d3f13277c1e3d4c0775e83d8ce2e6fbb13b` в отдельном чистом checkout.
Corpus source `29ea34e27b8f96ed27b744f639c9f48933f52443`: точные 146 задач/438 ключей
LAB-1747, исходные prompts, inputs, references, oracle, рубрики, порядок и timeouts.
experimentPins.sourceSha обозначает корпус, новый SHA CLI хранится отдельно в manifest.

Product `openai/gpt-6.1-terra/xhigh`, requested serviceTier=default; фактический tier
учитывать отдельно. Судья `gpt-6-sol/xhigh`, threshold70, timeout300000ms, transport reserve1.
N6/batch6, максимум526 начатых попыток, 3 последовательные технические ошибки,
noProgress24h, batch<=8h. Clock от created_at свежей campaign card.
Сохранить model catalog, image/action/skill pins и остальные условия LAB-1747.

Сначала закончить подготовку, затем создать карточку запуска. EvalOps самостоятельно
создаёт request/manifest/wakeups и ведёт запуск/ремонт/resume по frozen runbook.
После назначения внешний Codex только наблюдает. Глобальные runtime-привязки агентов
не менять. Quality FAIL окончателен; повторы только по принятой технической политике.

В финальном поручении явно сравнить с проверенным архивом LAB-1747: успешность,
oracle, структура, устойчивость трёх раундов, конкретные регрессии. Технические отказы
и пропуски показывать отдельно; хостовые различия учитывать для времени и timeout.
Новый порог «качество сохранилось» не вводить. Smoke не является измерением кампании.
При операционном ремонте baseline фактические версии harness и периоды их применения
брать из финального архива. Исходный pin не доказывает неизменность всей истории.
Технически неучтённые результаты с quality verdict сохранять отдельно с исходной
оценкой; ремонт baseline автоматически в новую frozen поставку не переносить.

## Проверенная поставка и дополнение владельца

CLI `0.3.9-eval.20261117.c01ee3e3b8` собрана из чистого
`c01ee3e3b8c3d1ab5b6e0dd193e8b5915b57e00a`. Последующие изменения этого документа
не меняют закреплённый source CLI. Archive roundtrip, canonical manifest и установка
на runner1 проверены: 6666 файлов, 5642 ресурса, modes/links сохранены.
Archive SHA256 `c1cd1beac711c2bdf3cd022e7c43969461bb4bc8e2a6efb607e6155e9a1557d9`.
Семь Help-инструментов прошли проверку в отдельном network namespace без сети;
knowledge-key в поставке отсутствует.

По дополнительному поручению владельца Multica CLI на runner1 обновлена с0.7.0 до0.10.0.
Тот же daemon/runtime online, ID, конфигурация и флаги сохранены; прежний бинарник
сохранён для отката. Это обновление оператора, модель и harness не менялись.

Для runner1 проверен отдельный loopback SSH-forward через действующий proxy runner2;
служебный Dock REST вернул точную baseline revision. Эта общая сетевая зависимость
и дополнительный hop учитываются при анализе времени и технических ошибок.
Native operator получает собственный fixed-target SSH helper, без изменения
глобальных runtime bindings, SSH config и baseline файлов.

Native prepare и verify на runner1 завершились READY6/6: установленный Chromium,
Help/connection, continuous process cleanup, runtime Close ACK, server sessions,
архивирование и освобождение server/profile reservations подтверждены. Первый
PROFILE_FORMAT_INVALID сохранён: в шесть новых профилей добавлены только отсутствующие
canonical markers, после чего штатный reconcile проверил cleanup. Семь свежих
OAuth files, шесть catalog hashes и экспериментальные pins не изменились.
Один немодельный models-list подтвердил Terra/xhigh/requested default; модельную
готовность должен проверить штатный batch после назначения.

Native EvalOps подтвердил права в LAB-1798: READY-комментарий и in_review прочитаны
обратно. В request брать только keys исторического reference manifest; его прежние
model pins не переносить. Request.pins содержит uppercase несекретные env names,
а experimentPinsFile отдельно хранит происхождение CLI/corpus. Lowercase proxy
остаётся в постоянном controller env; request/manifest создаёт сам EvalOps.

Локальная N1 приёмка завершена: все три сценария сгенерированы ровно по одному разу,
CLI exit0, получены LGP и полный CSV oracle PASS; node code-verdict PASS без retry.
Каждый сохранённый пакет повторно выполнен: все native узлы (3/5/3), unchanged SHA,
новый полный CSV, actual Close/Logout и cleanup PASS. Judge scores для smoke не
выставлялись. Фактический response tier не сохранён; Terra/xhigh/requested default
подтверждены. Help calls0 во всех трёх исходных попытках; повторов ради Help не было.
Все попытки, включая ранний preflight403 и ошибку purpose вспомогательного cold,
сохранены вне Git отдельно от успешного recovery. Calc raw helper exit1 из-за
отсутствующего frozen acceptance.json сохранён отдельно при PASS native/SHA/CSV.
Финальный native verify READY/released; собственные контейнеры и сеть удалены
штатным helper после проверки identity/labels/reservations. Results/history сохранены.

Итоговое независимое ревью: Spec PASS / Quality PASS. Свежая campaign card LAB-1805
создана в in_progress без исполнителя; `created_at=2026-11-17T14:20:25Z` задаёт clock.
Body read-back побайтно совпал: SHA256
`2992f41f59c033a3c7ea288c45950bf387f405ca98cfcda60ede742e4e1eefe5`.
При создании native tasks и wakeups отсутствуют. Следующий шаг — trigger-preview
и единственное назначение EvalOps, после которого внешний оператор только читает.
Дальнейший живой прогресс, manifest/request, итог и архив — в LAB-1805; этот
checkpoint фиксирует проверенную подготовку до назначения.

## Checkpoint

- Перенос: `dc25afa296` → `2759213b83` → `4f1bc598fa`; source review Spec/Quality PASS.
- Help snapshot byte-exact; пять существующих help_path изменены, новые узлы не добавлены.
- Последовательный CLI:22/22 PASS; Product33/33, staging13/13 и pre-push typecheck33/33 PASS.
- Initial broad Host/CLI имели таймауты; readiness timeout и file-reference flakes подтверждены на base.
- Успешные узкие validation runs проверили полный контракт; полного Host PASS не заявляем.
- CLI source c01 закреплён; local build/offline Help/remote installed manifest проверены.
- Все три local original completed0, full CSV oracle PASS; node code-verdict PASS, генерация по одному разу.
- Все три cold PASS: native узлы 3/5/3, unchanged LGP SHA, новый CSV, Close/Logout/cleanup/released.
- Финальный N1 verify READY/released; собственная Docker-пара удалена, все evidence сохранены.
- Первый cold consumer выбрал draft-purpose; BLOCKED сохранён, отдельный штатный recovery освободил ресурсы.
- Runner1: отдельные N6/pair/harness/corpus и свежие OAuth; native prepare/verify READY6/6, model calls0.
- В N6 preseed добавлены только отсутствующие canonical profile markers; auth/cache сохранены.
- Native authority LAB-1798 READY/in_review через собственный SSH helper; final installed review PASS.
- LAB-1805 создана in_progress/unassigned, clock14:20:25Z; body exact, tasks/wakeups0.
- Следующий шаг: trigger-preview и единственное назначение EvalOps; далее только наблюдение в LAB-1805.
