# Evaler — checkpoint внедрения
Контракт: ../evaler-orchestration.md; личные инструкции Evaler/Rich/Ben и squad рядом.
Цель: existing Evaler leader, exactly3 agents, eval-tests/6.1-sol/xhigh/max1; daemon slot1.
Статус этого исходного checkpoint: контракт подготовлен; deployment readback и code gates ещё не записаны.
SHA внедрения: NOT_RECORDED; runtime supplement receipt: NOT_RECORDED.
Operator config: R/operations/node-eval-ops.json; R=/home/user/.local/share/loginom-evals-runtime.
Lease: persistent currentworker, unit/reference/cold/live сериализованы, crash/unknown cleanup не освобождают.
Роли: Rich author, Ben independent exact-SHA reviewer, Evaler evidence/status; done/merge человек.
Модель builder 6.1-sol/xhigh; evaluated 6-sol/default; installed CLI source904f7f85 отдельно от harness SHA.
Цикл: один routed dispatch → конец хода → один обычный worker comment → auto leader wake.
Code-verdict отдельно от eval quality; product FAIL с confirmed cleanup совместим с ACCEPT; no quality retry.
После 2 Ben REJECT: in_review/OWNER_ACTION_REQUIRED; infra/unknown ownership: blocked.
LAB-16 при внедрении не перезапускается; прежние SHA/attachments/results сохраняются.
Следующий шаг: записать реальные code/readback/delivery receipts; затем пилот следующей готовой карточки владельца.
Ограничение: полный Evaler→Rich→Ben→Evaler цикл до такого пилота не подтверждён.
