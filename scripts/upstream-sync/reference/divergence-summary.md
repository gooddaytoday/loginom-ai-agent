# Расхождения форка с upstream: файлы, изменённые форком

- форк `2e6f66a92d961d3e517fb9cc63dc4b4c77039389`, база `501ff62cbf40d4ff260b48c9f1fc113e9b9a83e1`
- парных файлов (изменение или переименование): **2630**; добавлено форком: 9145; удалено: 24

| класс | файлов |
|---|---|
| mech:internal-only | 1125 |
| mech:needs-external | 669 |
| substantive | 437 |
| move-only | 345 |
| binary | 54 |

## Механические различия по наборам классов (наименьший набор)

| набор | файлов |
|---|---|
| scope | 982 |
| userfiles | 243 |
| env,userfiles | 131 |
| env | 124 |
| scope,userfiles | 79 |
| svckey,scope | 67 |
| scope,env | 57 |
| svckey | 45 |
| pkgdir | 17 |
| scope,pkgdir | 13 |
| scope,env,userfiles | 11 |
| svckey,scope,env | 10 |
| pkgdir,env | 4 |
| pkgdir,userfiles | 3 |
| svckey,env | 3 |
| svckey,scope,userfiles | 2 |
| svckey,pkgdir | 1 |
| svckey,scope,env,userfiles | 1 |
| pkgdir,env,userfiles | 1 |

## Содержательный остаток по кластерам

| кластер | файлов | + строк | − строк | затронуто upstream (1000 коммитов) | в реальной дельте |
|---|---|---|---|---|---|
| K1 session/tools/server | 16 | 769 | 99 | 12 | 2 |
| K1 session/tools/server (tests) | 16 | 2214 | 90 | 12 | 3 |
| K10 manifests+lock | 11 | 1131 | 1311 | 10 | 10 |
| K11 brand assets/strings | 218 | 4141 | 2759 | 132 | 1 |
| K12 core identity/paths | 8 | 27 | 22 | 4 | 0 |
| K12 core identity/paths (tests) | 2 | 7 | 7 | 0 | 0 |
| K13 other | 9 | 32 | 23 | 3 | 3 |
| K13 other (tests) | 1 | 10 | 13 | 0 | 0 |
| K2 CLI/worker/config | 22 | 373 | 179 | 3 | 3 |
| K2 CLI/worker/config (tests) | 6 | 263 | 126 | 3 | 2 |
| K3 skills/commands | 2 | 101 | 30 | 2 | 0 |
| K4 provider/plugin/proxy | 6 | 92 | 25 | 4 | 3 |
| K4 provider/plugin/proxy (tests) | 4 | 265 | 9 | 3 | 3 |
| K5 install/update | 1 | 16 | 6 | 1 | 0 |
| K5 install/update (tests) | 1 | 10 | 2 | 0 | 0 |
| K6 desktop main/renderer | 23 | 429 | 199 | 16 | 0 |
| K6 desktop main/renderer (tests) | 3 | 26 | 26 | 3 | 0 |
| K7 app/ui | 50 | 381 | 224 | 35 | 0 |
| K7 app/ui (tests) | 46 | 349 | 134 | 38 | 0 |
| K8 tui | 13 | 86 | 59 | 5 | 2 |
| K8 tui (tests) | 7 | 166 | 21 | 2 | 0 |
| K9 CI/build/release | 26 | 588 | 533 | 11 | 6 |

## Файлы, добавленные форком (по верхним каталогам, первые 15)

| каталог | файлов |
|---|---|
| services/loginom-ai | 3823 |
| packages/loginom-runtime | 1754 |
| docs/testing | 671 |
| evals/tasks | 626 |
| evals/drafts | 547 |
| docs/node-development | 428 |
| packages/loginom-host | 263 |
| evals/calibration | 149 |
| packages/desktop | 149 |
| evals/test | 130 |
| packages/agent | 77 |
| evals/src | 69 |
| docs/superpowers | 68 |
| evals/fixtures | 56 |
| evals/docs | 52 |
