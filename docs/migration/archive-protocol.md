# Архив исходников: выполненный checkpoint

2026-09-16, Linux. Закрытый каталог архива:
`/home/kiselev/backups/loginom-migration/20260916-source-01`.
Проверенное восстановление:
`/home/kiselev/backups/loginom-migration/20260916-restore-01`.
Оба каталога находятся вне старого/нового repo и всех worktrees; права корня `0700`.
Регулярные архивные файлы и секретный конфиг защищены `0600`.

Состав: history.bundle, отдельный bare mirror с backup refs для 97 history roots,
metadata/reflog journals/index каждого worktree, staged/working patches,
незакоммиченные файлы, выбранные ignored local configs, отдельная копия указанного
пользователем `/home/kiselev/.loginom-dock/config.json`. Последняя находится под
числовым именем в `external/`; публичная документация не содержит её содержимое.

Manifest SHA256:
`108c7f9710c5559b12c2d67da4b9bbe11ccc2ee9bac5f60665b591f80d6f4835`.
Полный приватный manifest и snapshot находятся внутри архива. Публичный результат —
[source restore proof](source-restore-proof.json).

Команды выполнены из `script/migration`:

```sh
python3 inventory.py --source /home/kiselev/git/loginom-dock --output /tmp/loginom-source-inventory.json
python3 archive.py --snapshot /tmp/loginom-source-inventory.json --destination /home/kiselev/backups/loginom-migration/20260916-source-01 --public-allowlist /tmp/loginom-public-allowlist.json --private-allowlist /tmp/loginom-private-allowlist.json
python3 restore_check.py --archive /home/kiselev/backups/loginom-migration/20260916-source-01 --destination /home/kiselev/backups/loginom-migration/20260916-restore-01 --report /home/kiselev/backups/loginom-migration/20260916-source-01-restore.json
```

Повторный прогон требует новых output directories; overwrite отклоняется.
Allowlist не разрешает неизвестные untracked/ignored paths. В текущем прогоне
все несохранённые материалы классифицированы private; открытой payload-копии нет.
Virtualenv, node_modules, pycache, dist исключены как восстанавливаемые outputs.
Активные `.dock` diagnostics исключены с явным обязательством сохранить отдельно
перед retirement; исходные данные не удалены. Архив не содержит live server backup.

Проверка восстанавливает каждый HEAD, обе staged/working дельты, untracked/private
файлы и symlinks в новом каталоге; сверяет Git roots и хеши. Git metadata и конфиг
также восстанавливаются в закрытый каталог. Secrets в отчёт не выводятся.
При SOURCE_CHANGED архив без полного manifest не считается успешным.

Удаление старого repo, исходных diagnostics или backup этой процедурой не разрешается.
