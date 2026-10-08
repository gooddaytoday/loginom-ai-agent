# loginom-node-eval-case — checkpoint 2026-10-08

- Версия skill: 1.0.4; ветка: `node-skill-fixes`; source SHA: `2179e67d5cb5ffb4837ff13ce36a010b3a454709`.
- Совместимость imports/checker проверена на обоих remote checkout `701bb7e202708f46cd8f5f028c42008fd0f3f9a9`.
- Bundle SHA256: `2f56e91d985f3dd45bf0dff141955dbd9898c475066eb80a69ec77dd249387fb`; manifest: 13/13 файлов.
- Remote: `/home/user/.local/share/loginom-evals-runtime/support/node-eval-skill-v1.0.4/`; архив рядом `.tar.gz`, read-only.
- Local: `~/.agents/skills/loginom-node-eval-case` → текущий `evals/skills/loginom-node-eval-case`; symlink/read-back проверены.
- Rich instructions SHA256: `55f476791e47478cbdb84c77bf86e2f65c824e5727717636b704282f459b1588`; API readback совпал.
- Ben instructions SHA256: `673f84fa8a300dec71c37e0b5350eb204cc26f7ad90de573fd057c612426289b`; API readback совпал.
- Evaler/squad и прочие worker settings сохранены; active/queued tasks отсутствовали; карточки не запускались.
- Memory denials и заданный provider применяются в собственном profile mount; OAuth/Loginom setup не меняются.
- JSON/JSONC поддержаны Bun.JSONC; одинаковый порядок итоговых permissions не допускает перекрытия поздним wildcard.
- Настройки/провайдеры сохраняются; конфигурационные файлы получают 0600; секреты не записываются в builder/config report.
- Узкие tests: 10 PASS, 0 FAIL, 79 assertions; реальные bwrap profile probes; typecheck/quick_validate PASS.
- Runtime docs имеют 0 битых относительных ссылок; 5 внешних целей явно читаются в AGENT_REPO, проверены на обоих checkout.
- Remote imports и 8 static graph/CSV smoke PASS; stand FREE, 4 profile guards без остатков, storage пустой.
- Предыдущие immutable версии сохранены; 1.0.2 не подключалась (JSONC gate); актуальное подключение — 1.0.4.
- Исторические LAB-16/LAB-26 не перезапускались. Локальный пилот/новый remote live-цикл этой правкой не проводились.
- Полная suite не повторялась; прежний локальный пилот BLOCKED из-за stopped isolated stand/истории reference profiles.
- Следующий шаг: подготовить собственный clean profile и эксклюзивное окно isolated stand, затем согласованный пилот sliding-source-refresh.
