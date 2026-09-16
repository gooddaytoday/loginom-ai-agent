# P3: метка импорта и полнота таблицы

Проверено 2026-09-06 на Loginom 7.5.0-alpha+build.49202 в отдельном
диагностическом браузере root, account test. Hermes run174120 завершён;
его однократный audit51/59 не пересчитывается.

## Наблюдения

- Импорт после finish получает автоматическую метку имени CSV. Это прямо
  описано в Help `data/integration/import/txt/README.md`, раздел «Шаг 3. Описание
  узла»; E2E `bg/selectors.ts` (DoneWizard) и `bg/helpers/wizard.ts`
  различают режимы метки. Mapping сверён с `bg/sels/sMapping.ts`. В run174120
  ready completion204/208 показывает имя CSV до finish210; trace210 связывает
  предыдущий owner «Текстовый файл» с итоговым graph node CSV. Reopen220
  подтверждает нового owner. Проверка должна учитывать только такую связанную
  смену метки, не произвольное переименование или подмену узла.
- В собственном сохранённом и повторно открытом пакете root TF5, на странице
  `ColumnsMappingEngineOutputPortWizard`, при viewport1200×818 тело
  `grdTargetColumns;tbl` имеет clientWidth932 и scrollWidth1000. В таком
  состоянии native observer правильно выдаёт partial.
- При viewport1280×800 то же тело имеет ширину1012, пять последовательных
  строк полностью помещаются; native observer выдаёт complete_configured_rows.
  При1440×1000 также полный результат. Идентичность исходных полей этим
  отдельным наблюдением не объявляется доказанной.
- Новый Dock browser context получает явный viewport1280×800, записанный
  в session metadata. Проверки горизонтальной обрезки сохранены.
- После finish run174120 DOM body с тем же tid заменяется. Новый bounded
  settle ждёт три одинаковых epoch/body/label refs и возвращает последний
  проверенный снимок; guard старого ref не обходится.

## Транспорт Hermes

Некорректный call213 передал `{scope:graph}` универсальному tool_call без
имени. Набор разрешённых инструментов не расширен. В новом изолированном
acceptance config штатный `tools.tool_search.enabled=off` сохраняет прямые
схемы Dock. Это подтверждено native `assemble_tool_defs` установленного
Hermes без вызова модели. Подписка/provider/model/reasoning не изменены.

Все эти наблюдения — диагностика. Следующий автономный Hermes run должен
отдельно подтвердить полный import roundtrip; остальные P3 gates открыты.
