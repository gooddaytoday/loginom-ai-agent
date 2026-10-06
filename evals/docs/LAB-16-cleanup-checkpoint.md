# LAB-16: исправление storage cleanup

Первая приёмка Ben SHA `426eefe9dd9bc61303a6fd974c06ec37d5e2f1bc`: BLOCKED — CSV-only/no_artifact оставлял собственный result.csv, authoritative ERROR/2.
Human approval `01a11253-40ec-70d7-b734-44c6a8bfe44e` разрешил узкую TDD-правку общего harness и новую независимую приёмку в LAB-16.
Изменены только orphan CSV cleanup/остановка dispatch, fake fixture, регрессии, Docker verification script и документация в evals/.
Cases, input bytes, oracle/reference/provenance, task schema, parseEvents, generic summary и node validator не изменены.
Чистый проверенный code SHA `84ed8f04d1c5a814726576bbedce2bcc656a11bf`; финальный frozen SHA после docs commit указан в READY_FOR_BEN и evidence manifest.
`bun test` из evals/: 354 pass / 0 fail, 1547 expects, 27 файлов; `bun typecheck`: exit0.
Затронутые artifact/run/orphan suites: 39 pass / 0 fail; 10 новых регрессий входят в полный unit.
Реальный Docker adapter после unit: 6/6 PASS, собственный fixture cleanup confirmed, 0 model attempts.
Текущая статическая повторная проверка сохранённых reference evidence: 3/3 PASS; исходные CLI/cold/provenance gates сохранены.
Docker RED выявил ложную проверку отсутствия symlink через file-only listing; GREEN использует проверку точного пути.
Сохраняется no_artifact/FAIL при успешной очистке; ownership/process/copy/remove/verification failure остаётся ERROR; следующий dispatch остановлен.
Исходные author и Ben ERROR сохранены побайтно в новом evidence; Ben summary SHA256 `40072ab1e7eac5d75a1474878c92b84d43f58168bd1fad8efcaf75de3f7ca6d1`.
Исторические author model attempts не повторялись; новые quality measurements выполняет Ben после frozen SHA.
Rich/Ben `gpt-6.1-sol/xhigh`; builder `openai/gpt-6.1-sol/xhigh`; evaluated `openai/gpt-6-sol/default`; CLI clean source `904f7f85bf5450cbbfd48360d7dd9c483401face`.
Env/auth/profiles/raw diagnostics не коммитить. Unit, Docker/storage и live выполнять последовательно; global config и product CLI не изменены.
Следующий шаг: detached frozen SHA, независимые unit/typecheck/negative/reference/cold и 3 fresh live Ben, repeat1, skip-judge, без quality retry.
Ben возвращает VERDICT_BEN в этой карточке; ACCEPT качества eval допускает product FAIL. До ACCEPT статус in_progress; in_review после Rich wrap-up, done только человек.
