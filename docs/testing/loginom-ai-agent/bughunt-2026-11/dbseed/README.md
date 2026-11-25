# Test databases for DB connection cases

PostgreSQL 16 (5432), MySQL 8.4 (3306) and MS SQL 2022 (1433) on the owner's experiment server. Each has the same database `sales`, loaded from `gen.py` (deterministic):

| table | rows | notes |
|---|---:|---|
| customers | 1000 | `email` NULL in 79 rows |
| products | 200 | |
| orders | 20000 | |
| order_items | 60114 | `discount_pct` NULL in 36260 rows |

Sum of `quantity*unit_price` over `order_items` is 4572468066.06 in all three.

- Ports accept connections only from app.loginom.ai (159.194.227.128); the runner hosts cannot connect directly.
- Connection parameters for cases live on the hunter hosts in `~/.config/loginom-run-check/db-test.conf` (mode 600: `DB_HOST`, `DB_*_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`). Never commit the password.
- Oracles: `python3 gen.py OUT_DIR` writes the same CSVs that were loaded.
- `load.sh` and `load-mssql.sh` are the scripts used on the server (`/opt/loginom-testdb`, Docker Compose); passwords come from the containers' environment.
