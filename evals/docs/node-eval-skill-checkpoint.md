# loginom-node-eval-case — checkpoint 2026-10-08

- Версия skill: 1.0.1; ветка: `node-eval-skill`; source SHA: `a9121493747e562207ef2b6daed73fd353cd9cab`.
- Совместимость imports/checker проверена на обоих remote checkout `701bb7e202708f46cd8f5f028c42008fd0f3f9a9`.
- Bundle SHA256: `ae063af24dee7e2885cc3cab5562f7bdb856fefea0172bd5c557e4dfc738e5b8`; manifest: 13/13 файлов.
- Remote: `/home/user/.local/share/loginom-evals-runtime/support/node-eval-skill-v1.0.1/`; архив рядом `.tar.gz`, read-only.
- Local: `~/.agents/skills/loginom-node-eval-case` → текущий `evals/skills/loginom-node-eval-case`; symlink/read-back проверены.
- Rich instructions SHA256: `5cf9d1f315205b265f62bde664932a7da4ac8ac0390acf71bb66ca1e31e23548`; API readback совпал.
- Ben instructions SHA256: `b20acfb68b0be254905ccd7d5fe6dbe094394f9aadedc71614ed2b39ab68b2d3`; API readback совпал.
- Evaler/squad и прочие worker settings сохранены; active/queued tasks отсутствовали; карточки не запускались.
- Role env overlay немодельно подтвердил reference profiles, `gpt-6.1-sol/xhigh`, explicit assignment timeout 1800000 ms.
- Структура skill, ссылки и отсутствие executable зависимости от старого пакета проверены; `quick_validate`/typecheck PASS.
- Узкие tests: 7 PASS, 0 FAIL, 34 assertions — шесть helper tests и существующий native collector; typecheck PASS.
- LAB-16: реальные cold CSV fixed-sum/sliding-average/reconfigure прошли новый static checker.
- LAB-26: три archived code verdict PASS; три реальные cold CSV прошли checker; без native/read proof — FAIL.
- Независимый offline forward-test создал расчёт до чтения harness; найденный пропуск произвольных expected CSV в хэшах исправлен.
- Remote imports и 8 static graph/CSV smoke PASS; remote live-цикл нового skill ещё не проверен.
- Локальный live-пилот BLOCKED: isolated container stopped; оба старых reference profile не проходят assertProfileClean (история).
- Полная suite была остановлена из-за пересечения с соседним live; её итог не заявляется. Старые reports/кейсы сохранены.
- Следующий шаг: подготовить собственный clean profile и эксклюзивное окно isolated stand, затем согласованный пилот sliding-source-refresh.
