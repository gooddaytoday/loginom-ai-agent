# category-rating-revenue: доля рекомендованных

- Базовый SHA: `715b86633`; исправление локального корпуса от 2026-10-12.
- Контракт: пять выходных колонок из задания; отдельное количество рекомендованных не требуется. Допускаются `100 * AVG(is_recommended)`, `100 * SUM(is_recommended) / products` и эквивалентные расчёты.
- `group-category` проверяет число всех товаров, средний рейтинг и сумму выручки; `recommended-share` независимо проверяет процент. SPEC описывает эталон как пример, а не обязательную композицию.
- Пользовательский prompt, `reference.lgp`, dataset, oracle CSV/Python и provenance побайтно сохранены. Общий промпт судьи не изменён.
- `recommended-scale` сохраняет среднее индикатора, но убирает `* 100`; ошибочный CSV независимо воспроизводится заменой в oracle.py во временном каталоге. Ожидаемые провалы: `recommended-share`, `result-rows`; oracle=false.
- TDD: новый тест сначала FAIL (случай отсутствует), затем PASS через `loadTasks` / `prepareCalibrationCases`, с проверкой XML, остальных показателей, oracle и независимого воспроизведения CSV.
- Корпус: 35 задач / 114 мутаций; aggregate=35, sort=35, column=35, threshold=6, filter=3. Полный Python-пересчёт PASS; `bun typecheck` PASS.
- `agent_inputs_hash` (35 задач): `d7d221ed5177a195d346f01b793b7f8c51c15998bfee660d19bb93fce4b394f8` — сохранён.
- `rubric_hash` (35 задач): `73af640ae4e61e51961d9157c0eb554cb4a2f5e2a364d20360253ad5dc30f273` — новый контракт; прежний `02a57c7c…` остаётся историческим.
- `calibration_hash` (35 задач / 114 мутаций): `c865c91ea6fa7394f87b81b190795b2e13a8ef275f962bc05f0273916f7ce224`; весь корпус подготовлен через `prepareCalibrationCases`, XML проверен xmllint.
- Хэши изменённых sources: task.json=`b336b958a471bc0f3b3c2b925f8dba7944cfb4174ff4229d76253954ec346b56`, SPEC.md=`5bbb842be2375c5f27725b7b22db29beef6a83fa91c3716fbc492542a5612576`.
- Адресная приёмка использует явно утверждённый пользователем pin `gpt-6-astra/high`; новый default `gpt-6-sol/xhigh` из AGENTS.md этим прогоном не калибруется.
- Адресная калибровка `20261012-100954-calibrate`: exit 0, 5/5; positive=100/все пункты=true/oracle=true; sort, aggregate, column, recommended-scale=63/все ожидаемые отказы/oracle=false. [Структурированный отчёт](2026-10-12-category-rating-revenue-calibration.json).
- Полный `bun test`: exit 1, 537 PASS / 5 SKIP / 3 FAIL, 545 тестов / 53 файла. Отказы: два writer-settlement и один owned-registration; изменённые проверки корпуса и oracle прошли.
- Диагностика: все три отказа стабильны в 3 адресных повторах (каждый 18 PASS / 3 FAIL). Глобальный native snapshot отклоняет чужой Chrome, работавший до начала suite. Writer/profile/supervisor и их тесты не изменялись; живых процессов этих fixtures после повторов нет. Чужие процессы не останавливались.
- Команды из evals/: `bun test`, `bun typecheck`, `python3 script/check-calibration-corpus.py --tasks tasks/analytic`; `JUDGE_MODEL=gpt-6-astra JUDGE_REASONING=high EVAL_CLI_MODE=source bun run src/run.ts --calibrate --tasks tasks/analytic --only category-rating-revenue`.
- Ограничения: калибровка использует синтетический CSV и статический пакет, не выполняет Loginom. Исторические отчёты и попытка Luna не переоцениваются; полная калибровка остальных задач не проводится.
- Следующий шаг: повторить полную suite на свободном стенде без чужих native Chrome/Loginom процессов; runtime-контракт очистки в этой задаче не менять.
