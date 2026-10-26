# Измерение: пробное слияние v1.19.4 в форк

- форк: `2e6f66a92d961d3e517fb9cc63dc4b4c77039389`; upstream: `148842ef7cb1bc34192b3fff57d0f9721ab9c801` (v1.19.4); база слияния: `501ff62cbf40d4ff260b48c9f1fc113e9b9a83e1`
- git version 2.43.0; стратегия ort; merge.directoryRenames=conflict; rerere выключен
- **unmerged-путей: 69** (строк CONFLICT: 71; SHA-256 списка: `79cf0bc5b50ff4d4f87567929c8725540868509e32dc9879868be5336cfcda6f`)

## По типам (из сообщений git)

| тип | путей |
|---|---|
| content | 57 |
| file-location | 6 |
| modify/delete | 4 |
| modify/delete,rename/delete | 2 |

## По группам путей

| группа | путей |
|---|---|
| .github | 2 |
| bun.lock | 1 |
| package.json | 28 |
| packages/agent (src, script) | 10 |
| packages/agent/test | 9 |
| packages/console | 4 |
| packages/core | 1 |
| packages/opencode | 2 |
| packages/stats | 6 |
| packages/tui | 2 |
| packages/web | 2 |
| прочее | 2 |

Строк CONFLICT больше числа путей на 2: пути rename/delete порождают по две строки
(rename/delete по старому пути и modify/delete по новому); учитывается один путь.
