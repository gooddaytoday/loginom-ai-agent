# Offline-подготовка 58 evals текстового импорта

Код подготовлен локально от `evals@7a45abd845f830610f376e2f21631acc8a48e8b2`;
все изменения находятся в `evals/`. Текущий этап не запускал Loginom AI Agent,
новые reference/product/cold, живого LLM-судью или модельный/provider smoke.

## Проверено

- Полный `bun test`: **544 pass / 0 fail**, 2824 assertions, 53 файла, exit 0.
  Команда из `evals/`: `bwrap --unshare-pid --die-with-parent --bind / / --dev /dev --proc /proc -- bun test`.
  Начальный SHA прогона `4626da27a831cadf1835ff2b672cf65a9475a705`; после старта
  менялась только документация, программный код и fixtures не менялись.
  SHA256 исходного лога: `827bd82f802c8f169f5653c3573d7327896e8dfa2e214d3234352be69c9b99cb`.
- `bun typecheck`: exit 0. Legacy hash/collection и CrossTable тесты входят в общий прогон.
- Корпус: 58 ID / 59 исходных файлов; bytes/SHA и typed oracle пересчитаны независимо;
  положительные reference отсутствуют, runtime=NOT_RUN. Private transactions исключены.
- Семь inputs-only ZIP воспроизводятся побайтно, CRC/manifest/hash и allowlist проверены:
  только TASK.md, data и manifest. Oracle/SPEC/reference/results не передаются модели.
- Все 44 обычных положительных задания проверены через synthetic typed/native fixtures
  и мутацию наблюдённого разделителя. Отдельные проверки: диагностический исход без LGP,
  собственный raw journal, refusal/no Execute, same-GUID correction, CSV→TSV/fresh execution,
  exact Decimal/NULL/leading zeros, cold graph/GUID/bytes/full values/close/logout,
  запрет финализации без cold и перезаписи готового кейса, модельный admission.
- Native cold helper имеет provenance исходного CLI SHA и прошёл `node --check`.
  Неправильный CLI pin отклоняется до загрузки браузера. Helper не запускался live.
- Rich, Ben, Evaler readback: `gpt-6.1-sol/xhigh`, concurrency=1; не изменены.
  Reference/product Loginom AI Agent: `openai/gpt-6-luna/high`.
- Remote `evals` соответствует назначенной базе; remote `txt-delivery` соответствует
  CLI pin `5cd74d8ee5d6125692d953eb327b4d4f833c27a1`.

Первый общий прогон в host PID namespace: 529 pass / 5 skip / 3 fail.
Три отказа writer/registration повторены на базовом SHA и в 3/3 повторах:
защитная проверка обнаруживала чужие Chrome/native процессы. Эти процессы не
останавливались, guards не ослаблялись. В собственном PID namespace сначала
прошли 21/21 адресных тестов, затем полный прогон 544/544. Это проверка изоляции
offline-тестов, не свидетельство свободного host/серверного Loginom.

## Границы результата

Synthetic fixtures не являются реальными пакетами или runtime PASS. Warm XML
проверяет граф/GUID/путь; сохранённые настройки подтверждаются независимым native
cold readback при будущем запуске. Helper финализации фиксирует CODE_CHECKS_ONLY;
actual модель, бюджет, provenance CLI/product skill, stand release проверяются
отдельно по skill 1.0.7. Полный precise output обязателен, усечение даёт FAIL.

CLI exact pin не собран, не установлен и не активирован. Доступность Luna/high,
совместимость браузерных API и реальные новые сценарии пока NOT_RUN. Готова
методика отдельной сборки/допуска; обязательная разработка harness будущему Rich
не оставлена. LAB-55 подтверждена running/in_progress на сервере; её ресурсы,
профили, модели, pins и runtime не изменялись. Перед следующим этапом состояние
и изоляцию нужно проверить заново.

Следующий результат текущего этапа: восемь backlog-карточек существующего squad,
inputs-only вложения, exact pins и readback без runs/wakeups. Их выполнение —
последующая отдельная команда владельца.
