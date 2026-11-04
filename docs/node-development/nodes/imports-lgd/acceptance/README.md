# Приёмочное предложение LGD

Статус: **proposal / blocked**, LAB-772. Все ожидания записаны до модельных
прогонов; прогонов и CLI-сборок в этой карточке нет. Критерии утверждает
оркестратор до этапа 1. Регистрация runtime отсутствует.

| Сценарий | Файлы модели | Ожидается |
|---|---|---|
| standalone | task.md, source.lgd | 5 × 5, 25 значений, 4 NULL, 1 пустая строка |
| properties | task-properties.md, properties-stage0.lgd | 5 × 4, 20 значений, 3 NULL; RecordId / Идентификатор |
| corrupt | task-corrupt.md, corrupt-block.lgd | Отказ checksum, исходная причина, без успешного табличного результата |
| export-roundtrip | exports-lgd/acceptance/task.md, typed.csv, schema.json | Новый LGD и обратный импорт: 5 × 5, все свойства/значения |

Каждый сценарий получает новый пакет/чат/профиль. Заменить placeholders до
запуска. Oracle, expected.json, история исследования и файлы схемы, не названные
в таблице, модели не передаются. Метка узла произвольна (`label_any`), метки полей
точные. Пропуск, пустая строка, 0 и false различаются. Формулоподобный текст
`=SUM(A1:A2)` остаётся строкой. Amount: сумма `1242.06789`, сравнение каждого
значения точное (abs=0, rel=0): LGD не должен менять binary64. Дата — локальная
без timezone, допуск 1 мс для readback; расширять его при отказе нельзя.
Int64 на границах, Variant, пустой набор, DDF, LZO, 32-bit и переменные в этот
срез не включены. Это границы предложенного покрытия, не обещание общих типов.

`oracle.py` использует только Python stdlib и независимую CSV-спецификацию.
Генерирует оба expected.json, проверяет fixture bytes и сравнивает полный
канонический JSON таблицы: `complete:true`, `output_port:0`, `row_count`,
`columns:[{name,label,type,data_kind}]`, `rows:[[...]]`. Канонический JSON
**не является** новым runtime-публичным контрактом. Получение полного readback
должно использовать согласованный существующий cold reader.

```sh
python3 docs/node-development/nodes/imports-lgd/acceptance/oracle.py --check
python3 -m unittest discover -s docs/node-development/nodes/imports-lgd/acceptance -p 'test_*.py' -v
python3 docs/node-development/nodes/imports-lgd/acceptance/oracle.py --readback TABLE.json --case standalone
```

Для properties указать `--case properties`, для файла экспорта — `--case export`.
Oracle отклоняет неполный readback; его собственный PASS доказывает только
сравнение спецификаций. Проверка fixture checksum и однобайтовой мутации
не доказывает отказ Loginom. Повреждена копия внутри сжатого блока, не EndMark.

**Незакрытый вопрос файловой приёмки:** этот oracle не декодирует BGDATA.
Stock-import плюс Python-проверка ожидаемых значений независимы от нового
handler, но не от реализации формата Loginom. Простого сравнения экспорт →
новый импорт недостаточно: оба обработчика могут повторять одну ошибку.
Для строгого требования «oracle не Loginom» нужен отдельно квалифицированный
независимый decoder LGD; его наличие не подтверждено. До решения по этому
пункту экспорт не принимается и `ready_for_development` не объявляется.
Новый универсальный verifier в этой карточке не создаётся.

`expected.json` — проект схемы: импорт содержит cases, экспорт — file/table/
roundtrip; их нельзя напрямую подавать stock run-check. Табличный порт
импорта — логический 0; у sink `output_port:null`, `read.ports=[]`, результат
в `output.file_artifacts`. Native export `Input_Data-1` — UI индекс,
не логический input 1. Нельзя изобретать у экспорта табличный output 0.

После согласования: run-check start/wait на одном SHA, минимум 2 PASS из 3
исполнителя и 2/3 независимой проверки под другим аккаунтом; для каждого
положительного случая — Save и новый cold профиль, сохранённые настройки,
полный результат, штатное закрытие пакета и logout. Corrupt case отдельно
проверяет отказ; его lifecycle и cold-проверку согласовать до запуска.

Комплект содержит унаследованные бинарные fixtures из `origin/lgd-discovery`;
они не созданы candidate handler и не объявляются заново квалифицированными
на текущем стенде. Отдельный fixture с отличающейся меткой предотвращает
пустую проверку «имя равно метке». Квитанции и сырые журналы не включены.
