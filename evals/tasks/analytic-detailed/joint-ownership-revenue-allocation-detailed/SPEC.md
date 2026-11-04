# Распределение выручки по мосту совместного владения

> Сведения о локальном окружении обезличены. Приватные подтверждения, упомянутые в документе, не включены в репозиторий.

## Задача и данные

Результат сохраняет полный реестр заказов и все исходные отношения order/owner, диагностирует сумму долей и распределяет выручку только допустимого заказа по исходной доле владельца. Detailed и business имеют одинаковые inputs, общий контракт, rubric, tolerance и oracle; подробная форма раскрывает способ расчёта.

Данные полностью синтетические, созданы eval-author: 5 orders и 9 ownership relationships. Оба raw CSV заморожены до ручного gold и oracle. Это не UCI, реальные заказы или производный снимок; внешние datasets, готовые пакеты и сторонние лицензии не использованы, лицензия репозитория — MIT. Денежная единица одна, дополнительных сборов нет; временное окно и преобразования дат отсутствуют.

orders.csv(order_id,revenue) — полный реестр с уникальным order_id. В ownership.csv(order_id,owner_id,share) уникальна пара order/owner, все order_id существуют в orders; мост может отсутствовать. Ключи — case-sensitive ASCII strings, входные ячейки непустые и без NULL. revenue неотрицательна и задана точной денежной строкой с двумя цифрами после точки; share — неотрицательная точная десятичная доля, включая нулевую. Входы UTF-8, `;`, заголовок, десятичная точка, двойная кавычка.

Независимый Python stdlib csv/Decimal oracle собирает исходные доли по заказу и отдельно проходит полный orders. Он складывает все доли, применяет включительное abs(share_sum−1)≤0.000001 и умножает revenue на исходную share только valid-заказа; недопустимые доли не перенормируются. При отсутствии моста он сохраняет строку заказа. Ручная полная 10×7 таблица создана независимо до native; экспорт Loginom не служит источником ответа. Фактические runtime и версия записаны в provenance.

## Фактический native reference

В saved Unit1 (ZIP member Unit_0/Unit.xml) наблюдаются 11 native узлов и 11 data links. Это один корректный путь; имена, число узлов и внутренняя композиция не являются критериями приёмки. Обе import-ветви связаны с единственным экспортом; JavaScript и готовые итоговые значения не подставлены.

| Узел | Компонент | Фактическая настройка |
|---|---|---|
| Реестр заказов | TBGImportTextFile | orders.csv; order_id string, revenue float |
| Мост владения | TBGImportTextFile | ownership.csv; order_id/owner_id string, share float |
| Сумма и минимум долей | TBGGroupDataEngine | order_id; SUM(share)→share_sum и MIN(share)→share_min через сохранённые mappings |
| Реестр с проверкой долей | TBGJoinDataEngine | полный orders слева, проверка долей справа; LEFT по order_id |
| Заказы и владельцы | TBGJoinDataEngine | полный реестр с проверкой слева, исходный ownership справа; LEFT по order_id |
| Статус и распределение | TBGCalcData | IsNull(owner_id)→missing_ownership, затем Abs(share_sum−1)≤0.000001→valid, иначе invalid_share_sum; only-valid revenue*share, иначе Null |
| Формат денежных значений | TBGCalcData | Str/Replace заменяют запятую точкой; IF/Find/Count/Concat дополняют revenue и непустой allocation минимум до двух дробных цифр, сохраняя NULL |
| Исключить служебные поля | TBGReformColumnsEngine | исключены численные денежные оригиналы, share_min и служебные text-поля; сохранены revenue_csv/allocated_csv и пять предметных колонок |
| Итоговые названия колонок | TBGReformColumnsEngine | revenue_csv→revenue, allocated_csv→allocated_revenue; семь заданных колонок |
| Порядок заказов и владельцев | TBGSortingEngine | order_id,owner_id ASC; LocaleAware=false |
| Итоговый CSV | TBGExportTextFile | один UTF-8 CSV, `;`, names header, decimal `.`, qualifier `"`, empty NULL; фактический LF/no BOM |

Импорты читают доставленные storage-файлы с suffix orders.csv и ownership.csv; точные пути — в provenance. LEFT подтверждён actual native readback; отсутствие JoinType в XML само по себе его не доказывает. Первый join сохраняет 5 заказов, второй создаёт 10 строк: девять исходных отношений и одну строку O03 без ownership. Нулевая доля O01/C не удалена.

Связи: ownership→group; orders+group→первый LEFT; первый LEFT+ownership→второй LEFT→status/allocation→money→prune→rename→sort→sole export. Group сохраняет mapping share_Sum→share_sum и share_Min→share_min. share_min наблюдается как служебная характеристика и не задаёт дополнительного условия допустимости.

Фактические формулы статуса и allocation: `IF(IsNull(owner_id), "missing_ownership", IF(Abs(share_sum - 1) <= 0.000001, "valid", "invalid_share_sum"))`; `IF(allocation_status = "valid", revenue * share, Null)`. Никакого промежуточного денежного округления, перенормирования или коррекции до точного равенства выручке нет.

Money сначала строит revenue_text=`Replace(Str(revenue), ",", ".")` и allocated_text с Null guard. Если точки нет, добавляется `.00`; если после неё одна цифра, добавляется `0`; иначе исходная дробная запись сохраняется. Поэтому 10.0000125 не округляется, нулевая allocation становится0.00, отсутствующая остаётся пустой. Семь итоговых имён и строковое денежное представление завершены до сортировки/экспорта.

## Полный результат и проверенные границы

Ровно 10 строк × 7 колонок; одна строка на исходную пару, а без моста — одна строка orders с пустым owner_id. Порядок order_id,owner_id по возрастанию как ASCII с пустым owner_id первым внутри заказа. Колонки сопоставляются по именам, без требования к их порядку. Тексты/NULL/статусы точны; числовой допуск выгрузки ±0.001 не заменяет допуск допустимости1e-6 и денежный текстовый формат≥2dec. Для share/share_sum нового minimum precision нет.

```csv
order_id;owner_id;revenue;share;share_sum;allocation_status;allocated_revenue
O01;A;100.00;0.25;1.00;valid;25.0000
O01;B;100.00;0.75;1.00;valid;75.0000
O01;C;100.00;0;1.00;valid;0.00
O02;A;60.00;0.4;0.9;invalid_share_sum;
O02;B;60.00;0.5;0.9;invalid_share_sum;
O03;;80.00;;;missing_ownership;
O04;A;25.00;0.6;1.0000005;valid;15.000
O04;B;25.00;0.4000005;1.0000005;valid;10.000012500
O05;A;10.00;0.5;1.000002;invalid_share_sum;
O05;B;10.00;0.500002;1.000002;invalid_share_sum;
```

O01: сумма1, исходные A/B/C=.25/.75/0 дают25/75/0; полная выручка каждому владельцу неверна. O02: сумма.9, обе исходные доли и строки сохранены как invalid_share_sum, allocation пуста. O03: revenue80 и одна missing_ownership строка; owner_id/share/share_sum/allocated_revenue пусты, не0/NULL-текст.

O04: сумма1.0000005 внутри допуска, allocation15 и10.0000125 по исходным долям. Их сумма25.0000125 равна revenue×share_sum; требование точного conservation или нормализация до25 не вводится. O05: сумма1.000002 вне1e-6, оба allocation пусты; observed native float1.0000019999999998 не меняет статус. Все70 именованных cells,8 пустых cells и15 непустых moneytexts≥2dec проверены, включая ноль.

Authoring A1 из разрешённого бюджета3 с технической подсказкой завершён CLI exit0; фактически наблюдается одна попытка. БД подтвердила openai/gpt-6-sol/xhigh. За607s:37tools,32Loginom calls,1tool error,0memory calls. Actual candidate CLI0.0.0-preview-cache; финализатор выполнил только --version, binarySHA совпал с исходным pin. Все11 saved GUID имеют собственный SUCCEEDED/completed execution;11links соответствуют исходным запросам.

Единственная ошибка final-fields-01 — Reform output name collision: NOT_APPLIED/NODE_APPLY_STOPPED, effect_possible=false/node=null/execution:not_requested/cleanup_complete=true. Исправлена final-prune-01+final-names-01 в той же A1, лишнего узла не оставила. Save SUCCEEDED/save_completed=true, но reopened=false/persisted_content_verified=false остаются ограничениями исходной операции. Оба ORIGINAL runtime/knowledge Close: ACKtrue/request_error=null/actual exit0/signal=null; сохранённое idle proof writer=null/recovery=[].

Root cold после независимого native audit открыл точный сохранённый пакет через «Пакеты → Открыть», исполнил каждый из11 BODY/F9 ровно один раз по зависимостям, включая обе import-ветви, без Configure/мастеров/изменения путей/связей/Save. После единственного park появился новый CSV480B на отдельном inode с mtime после park. Все70cells совпали с manual/oracle по именам±.001,15moneytexts/8NULL соблюдены; initial и cold CSV byte-exact. Actual server LGP SHA+stat и оба raw SHA+stat неизменны; прежний CSV сохранён. Close→«Не сохранять», logout, закрытие собственного ownTab[private] и idle writer=null/recovery=[] подтверждены. Независимые native и actual cold SPEC/QUALITY reviews APPROVE.

Сценарий в provenance — ссылка, выведенная из actual Authoring URL, saved package и Info.xml Name=Unit1. Cold открывал пакет через UI; посещение этой deep link отдельно не утверждается. Fresh ONLY-B получил лишь business prompt и2raw, заморозил полный70cell ответ до root comparison; root full70/formats PASS. Это отдельная независимая проверка business постановки, не B authoring/measurement.

D/B имеют одинаковые frozen inputs/oracle/acceptance/reference/SPEC и общие определения/rubric/tolerance. Private D финализирован штатно по original A/.case; original6 draft files/form и20 A files/.case сохранены. Business использует shared accepted detailed reference с source_task/source_provenance, без отдельной business authoring attempt/model/session/CLI.

Четыре XML+raw-recipe+fullCSV near-miss на форму: inner вместо первого LEFT теряет O03; epsilon1e-5 ошибочно распределяет O05; revenue вместо revenue*share копирует полную выручку valid-владельцам; revenue padding `.00`→`.0` нарушает денежный текстовый формат при numeric oracle=true. Первые три имеют oracle=false и предметные expected_failed. Только calibration copies редактируются для judge; исходный reference/BIN не правятся, native/cold исполнение mutants не утверждается. Foreign при будущей полной G05 — штатная следующая выбранная отличная аналитическая задача той же формы. Live judge calibration, sole D/B measurements и окончательная приёмка пары pending.
