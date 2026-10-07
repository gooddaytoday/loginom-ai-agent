# LAB-16: исправление доказательств настройки, 2026-10-07

База: `ae0cc71c43e3bced9b5bfe1bea724e9f79b9a9e2`, ветка `evals`.
Коммиты исправлений: `8c50e972a` (создание) и `929617b1e88f2d117074768eec2e9b642a7138e7` (перенастройка); последний — проверенный code SHA.
PASS требует успешного native создания того же document/workflow/node до последующих apply/read.
Reconfigure требует явного изменения Amount на avg; все успешные avg starts следуют за полным sum/read. Поздний output mapping не заменяет переход.
Три новые регрессии прошли RED→GREEN через публичные validateNodeAttempt/checkNodeSequence; корректные mapping и отдельный node_read сохраняются.
`bun test` из `evals/`: 357 pass, 0 fail, 1554 expects, 27 файлов; `bun typecheck`: exit 0.
Повторная локальная validateNodeAttempt проверка сохранённых author-evidence/reference: 3/3 PASS, без изменения evidence.
`git diff --check ae0cc71c43e3bced9b5bfe1bea724e9f79b9a9e2 --`: exit 0.
Cases/input/oracle/reference/provenance, task/summary schema, LLM-судья и его калибровка не изменены.
Новые live model attempts, cold rerun и независимая приёмка Ben в этом исправлении не выполнялись.
Предыдущий ACCEPT Ben относится к старому SHA; новый frozen SHA требует повторной независимой приёмки в LAB-16.
Следующий шаг: Ben получает новый SHA и вручную выполняет согласованную приёмку; финальный done устанавливает человек после ACCEPT.
