# Выбор исходников Loginom AI Agent

Дата: 2026-09-16. Состояние реализации: F1/F2 выполнены для исходников;
первичный импорт F3 выполнен и побайтно проверен. Интеграция/ребрендинг продолжаются.

## Зафиксированный источник

Выбран `refs/heads/wow-landing` commit
`f0ecbb35a2e5e81e81821314cf6a3ba17df2beb0`. Он включает main
`9b46c85f68d054a27afad732d74785332098c0ba` и Linux
`a82cf65de409fe8c6735992d7ee8031e1466e1bb`. Относительно Linux добавляет
сайт, его тесты и исправления упаковки; runtime Linux не заменяется старой веткой.

Снимок SHA256: `06ad2c58ea3144cdd283837c58926adfba682da50310843ddbfc291a29f81d18`.
Повторное чтение refs/status/metadata до и после архива не выявило изменений.
Исходные worktrees не блокировались и не изменялись. Это стабильный снимок
исходников, не обещание остановки остальных задач или сохранения будущих изменений.

## Состав и решения

- `client`, `executor`, shared memory library и Loginom acceptance tools →
  `packages/loginom-runtime` с сохранением относительных путей.
- `landing` → `apps/loginom-site`.
- Серверные исходники, Rust/C++, Studio, deployment, знания, fixtures и документация →
  `services/loginom-ai`; внутренние относительные пути сохранены.
- `LICENSE` и `README_UPSTREAM.md` сохранены также рядом с runtime. Лицензии не менялись.
- Root AGENTS, старые host integrations/marketplaces, GitHub workflows и plugin
  examples → архив. Их инструкции и автозапуск не активируются в новом проекте.
- Ветка Cursor целиком сохранена в истории: generic host identity/router/download
  изменения рассматриваются при D1/D2 по контракту нового host. Cursor hooks,
  claims и plugin registration не импортируются в активный desktop.
- `codex/executor-linux`, `rl-bench`, backup branch и все служебные refs сохранены
  в истории без merge поверх актуального baseline. Старые PASS остаются историческими.
- Два stash состояния/родительские деревья сохраняются через reflog roots; в реальном
  источнике сейчас одна запись stash. Проверка двух stash выполнена отдельно fixture.
- Все 42 untracked Linux-файла сохранены в закрытом архиве без объявления готовыми.
  После оценки regression harness можно импортировать отдельным проверяемым изменением.

[Source map](source-map.json) содержит 5655 записей (включая две копии notices),
4951 активный файл, Git blob/tree/commit и SHA256. `archive` указывает на
`history.bundle`; точный объект определяется `commit` + `sourcePath`, не копией файла.
Импорт использует только сохранённые Git-объекты и не читает старый checkout.

## Проверки

- `python3 -m unittest test_inventory test_archive test_sources` из `script/migration`:
  6 tests PASS. Включены detached/reflog-only commit, staged/unstaged, два stash с
  untracked parents, symlink, private file, source drift, tampering/path escape,
  отказ overwrite и восстановление при недоступном оригинальном source path.
- Реальный restore: 45 refs, 97 history roots, 4 worktrees, 107 архивных файлов — PASS.
- `verify_sources.py --map ../../docs/migration/source-map.json --root ../..`:
  4951 imported files PASS до дальнейших преобразований.
- Локально проверено отсутствие действующего ключа из конфигурации Dock в активных
  импортируемых blobs. Значение не выводилось. Это проверка известного ключа,
  не утверждение об автоматическом распознавании всех возможных исторических секретов.

## Ограничения и следующий шаг

Runtime dependency install, тесты Dock в новом layout, product identity, desktop
интеграция и Linux сборка ещё не подтверждены. Рабочие server volumes не копировались.
История и приватная часть архива не предназначены для публикации.
Активные `.dock` diagnostic данные сохранены на исходных местах и исключены из
этого source-only архива; перед retirement нужен их отдельный согласованный снимок.
Следующий этап: связать новые workspace packages и реализовать F4/F5, затем D1–D7/R1–R7.
