Это комплект предложения этапа 0, до регистрации сценариев v0.3.9.

- Модели: `task.md` и единственный вход `../fixtures/documents.csv`.
- Oracle/expected/schema/manifest — вне контекста модели.
- `expected.json`: повторение родителей включено.
- `expected-no-repeat.json`: отдельный task второго узла, новый пакет/профиль.
- `proposed_tree_output` — адресный проект ожидания дерева; существующий
  cold-check его не проверяет. Табличное совпадение не является PASS пары.
- `response.json` — исходный документ для независимой проверки доставки CSV;
  `edge-cases.json` — материал последующих этапов, не выполненная матрица.

Из корня checkout:

```sh
python3 docs/node-development/nodes/trees-jsontotree/acceptance/oracle.py --check
python3 docs/node-development/nodes/trees-jsontotree/acceptance/oracle.py --no-repeat --check
node docs/node-development/nodes/trees-jsontotree/acceptance/measure-schema.mjs
```

Без `--check` oracle генерирует соответствующее expected; использует только
stdlib Python, int и Decimal, без импорта Loginom или runtime. Для основного
fixture ожидаются 4 строки, 6 полей, сумма qty=6, точный Int64.
Цены dyadic binary64, abs=rel=0; допуск не исправляет округлённый readback.
