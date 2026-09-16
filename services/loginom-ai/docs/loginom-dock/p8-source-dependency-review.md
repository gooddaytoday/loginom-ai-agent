# P8: подготовка проверки транзитивных исходников

6 сентября 2026. Реализован отдельный offline review tool
`deploy/loginom-dock/review-source-dependencies.mjs`. Это подготовка source review,
не принятый source index и не завершение P8. Runtime, текущие каталоги, admission,
публикация и полный skill не изменены.

## Контракт

Инструмент принимает существующий source index и локальный E2E Git repository.
Читает Git blobs точного `e2e_commit`, сверяет SHA всех объявленных файлов,
разбирает статические import/reexport, import type, import-equals, literal
require/dynamic import и triple-slash references через TypeScript AST.
Исходники E2E не исполняются. Изменённые и untracked файлы checkout не подмешиваются.
TypeScript parser задаётся оператором отдельно вместе с заранее проверенным SHA;
его версия и digest входят в отчёт. Parser — доверенный локальный инструмент,
его загрузка не является sandbox для произвольного стороннего JavaScript.

Для relative imports допускаются точный путь либо единственный `.ts/.tsx/.js/.jsx/
.d.ts/index.ts/index.tsx/index.js`. Неоднозначность, отсутствие файла, выход за
репозиторий, symlink, неподдержанный формат, синтаксическая ошибка, nonliteral
load и превышение бюджета завершают работу отказом без отчёта об успехе.
Default budgets: 1000 файлов, 32 MiB исходников, глубина 256; Git calls ограничены
30 секундами и 40 MiB output. Обход циклов конечный; обнаруженные back-edge cycles
явно записаны для review. Они не теряются и не объявляются ошибкой продукта.

Bare imports (включая возможные aliases), type/lib references остаются отдельными
review items. Это статический разбор поддержанных синтаксических конструкций,
не полный анализ динамической загрузки произвольной JS-программы. Loader aliases,
кастомные resolvers и выполняемые filesystem reads нужно проверять вручную.
TypeScript path mapping и external dependency closure не аттестуются.
Git submodules требуют явного локального manifest через `--submodules`: точный
parent E2E commit, path, gitlink commit и абсолютный путь локального Git repository.
Каждый commit сверяется с Gitlink родителя до чтения nested Git blobs; повторные,
неверные и перекрывающиеся pins отвергаются. `submodule_pins` и source mount/commit
каждого файла входят в отчёт. Tool не скачивает их, запрещает lazy fetch через
`GIT_NO_LAZY_FETCH=1` и не подставляет содержимое рабочего дерева.

Результат всегда имеет `status: SOURCE_REVIEW_REQUIRED`,
`admission_eligible: false`. Он содержит SHA/размер/Git blob каждого файла,
транзитивное множество файлов каждого action, edges с source line, cycles и
external review items. `source_index_sha256` — SHA компактного JSON-представления
прочитанного объекта, не SHA исходных bytes файла. Выход создаётся exclusively,
существующий файл не перезаписывается. При отказе новый output не создаётся.
Инструмент не меняет статусы actions, в том числе `stale`, и не обновляет builder.

## Проверенное ограничение настоящего E2E snapshot

Read-only запуск по действующему index с
`e2e_commit=2cad5602158fd2e4836d821d644a2b8d92f571a2` остановился на импорте
`bg/consts/general.ts` → `../../ci/common/consts`.
`ci/common` — Git submodule, закреплённый как
`bbdd0ab231f2e0f007d75a2583e0e22c08b2ef85` (режим 160000); `.gitmodules`
содержит относительный URL `../ci-common.git`.

Exact Git commit submodule оказался доступен локально. После явного manifest
разрешённых nested Git blobs получена статическая relative-import closure:
82 файла, 350 import edges, 30 обнаруженных back-edge cycles, 76 external import
occurrences. По actions: `link.create` — 82 файла, `node.add` и `package.save_as` —
по 81. Это действительная closure поддержанных relative imports, но external
packages/aliases и смысл исходников остаются review items. Исходники не исполнялись.

Существующий importer не рекурсивен: `git_accessor.py` и code parser клонируют с
`--no-recurse-submodules`. `source_snapshot.py:inspect_checkout` сохраняет Gitlink
metadata в `gitlinks`, пропуская его содержимое; `preserve_git_source` отправляет
только manifest `files`. `inventory-git-sources.py` также отдельно записывает
gitlinks. Поэтому новые локальные nested blob hashes сами по себе не означают,
что эти bytes доступны клиенту в импортированном `.source/`.

Следующий ограниченный участок: согласовать pinned отдельный ресурс ci-common
через существующий Git importer и adapter manifest, который связывает dependency
mount, parent gitlink commit, resource URI и manifest SHA. Затем проверить
доступность exact bytes и лишь после review расширять catalog source index.
Текущий tool не вводит importer и не меняет server/client APIs. Простого
копирования файлов или обновления SHA в старом index недостаточно.

## Воспроизведение

Ниже шаблоны с явно выбранными путями; tool ничего не устанавливает и не публикует.

```sh
node deploy/loginom-dock/review-source-dependencies.mjs \
  --repository /path/to/e2e-tests \
  --index executor/catalog/source-index.json \
  --submodules /private/reviewed-local-submodules.json \
  --typescript /path/to/typescript/lib/typescript.js \
  --typescript-sha256 REVIEWED_PARSER_SHA256 \
  --out /private/new-source-dependency-review.json

DOCK_REVIEW_TYPESCRIPT=/path/to/typescript/lib/typescript.js \
  node --test deploy/loginom-dock/test/source-dependencies.test.mjs
```

Проверено 18/18 локальных тестов с TypeScript 5.2.2, parser SHA
`012d08c32b7cf31f629b649216dbb742afdebe859cd95c73bbc7b1275dd045f1`.
Проверки покрывают transitive closure и dirty checkout, cycles, external aliases,
missing/escape/ambiguous/symlink/submodule, hashes/budgets, nonliteral load,
парсер вместо regex по comments/strings, exclusive output и неизменность index.
Это не live Loginom acceptance и не release attestation.

После ручной проверки полученной карты новые source dependencies должны попасть
в существующий index через обычное review. Далее обязательны source diff review,
проверка актуальности selectors/helpers, live verification, candidate и отдельный
admission. Существующая цепочка и запрет автоматического повышения `stale`
сохраняются.

Локальный manifest для проверенного E2E checkout (пути выбираются оператором):

```json
{
  "schema_version": 1,
  "e2e_commit": "2cad5602158fd2e4836d821d644a2b8d92f571a2",
  "pins": [{
    "path": "ci/common",
    "commit": "bbdd0ab231f2e0f007d75a2583e0e22c08b2ef85",
    "repository": "/path/to/e2e-tests/ci/common"
  }]
}
```

Manifest разрешает только локальное чтение exact Gitlink revision. Он не
является source review approval или разрешением публикации ресурса.
