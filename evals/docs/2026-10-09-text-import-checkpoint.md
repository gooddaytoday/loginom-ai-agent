# Checkpoint подготовки текстового импорта

- Ветка `text-import-evals`, база `7a45abd845f830610f376e2f21631acc8a48e8b2`; кодовая точка `bd29fc792923c26364526b0da02dd820a976d99e`.
- Модели Rich/Ben/Evaler неизменны. Reference/product Loginom AI Agent — `openai/gpt-6-luna/high`; live admission отклоняет другой выбор.
- LAB-55 при начале подготовки: in_progress, активный run `01a11fc8-1ebb-7371-907b-16e7d26c14f4`; её сервер и pins не изменены.
- Подготовлены 58 synthetic drafts/59 inputs; bytes/SHA и независимые typed oracles проверены; private transactions исключены.
- Исправлены два вложенных source metadata и противоречия negative/refresh prompts; изменения записаны в preparation.json.
- Добавлены diagnostic task/hash/prompt, typed warm validator, source-bound collector, runner/reference integration, same-GUID correction и CSV→TSV sequence.
- Добавлена offline-подготовка cold-контракта. Ни модель, ни Loginom live/reference/product/cold не запускались.
- Адресные тесты и `bun typecheck` прошли; полный `bun test` выполняется, лог `.bundle/text-import-verification/bun-test.log`.
- Осталось: полноценный cold helper/verification и saved settings checks, дополнительные mutations/все case families, readiness/finalization и skill 1.0.7.
- Осталось: inputs-only ZIPs, immutable delivery manifests/CLI preparation, повторные offline checks, push exact SHA.
- Затем создать 8 backlog карточек существующего squad с `--no-start`, вложениями и pins; проверить runs/wakeups и сохранить readback.
- Карточки ещё не созданы; цель активна. После создания карточек запуск возможен только отдельным этапом по команде владельца.
