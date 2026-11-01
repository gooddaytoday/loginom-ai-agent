# Сглаживание: подплан

Статус: `ready_for_development`. Редакция 2, 2026-10-31, этап 0 — LAB-642.
Component ID: `component.preprocessing.Smoothing`, slug `preprocessing-smoothing`.
Runtime-предложение: `preprocessing.smoothing` / `hodrick_prescott`.
База: `v039@3377e6b164bcf509a050fb1536bae8dbf8bece39`, Linux x64 mas3.
Реализации и приёмки обработчика пока нет. Критерии ниже утверждает владелец
до отдельного назначения этапа 1.

[Исследование](discovery.md) · [приёмочное предложение](acceptance/README.md) ·
[карточка узла](README.md) · [реестр](../../registry.json).

## 0. Границы назначения

Действует регламент сквада из карточки. Только собственная назначенная пара,
https://app.loginom.ai/app/?testable=true, элементы по data-tid.
Модель этапа 1: openai/gpt-6.1-sol, medium, 1800 с. Живые прогоны — run-check,
start+wait в одном foreground-вызове. Oracle и expected модели не передавать.
Merge, релиз и закрытие карточки — вне назначения.

Разрешены аддитивная регистрация типа, собственный обработчик/раздел навыка
и сценарий существующего run-check. Если понадобится изменение packages/agent,
публичного контракта, общих бюджетов/deadline или общего кода сверх разрешённого —
blocked с одним вопросом. Отсутствие компонента, дополнительный режим/критерий
сверх утверждённого среза — также stop. Лимит полной dock_node_apply inputSchema
46000 Б, приращение типа ≤1050 Б. Сжатие под весь состав выпуска — отдельно;
на этапе 0 runtime не регистрируется и CLI не собирается.

## 1. Проверенная основа

На стенде Loginom 7.4.2, палитра Предобработка → Сглаживание.
Мастер SmoothingWizard, один табличный вход и выход, Execute без обучения.
Нативный Engine — TBGCustomModelComponentEngine, параметры полей —
TBGSmoothingDefExtension. VendorGuid=73aad18e-9b22-4667-9feb-94ee1cae948e.
Fulltype подтверждён сериализацией собственного пакета с привязкой к GUID узла.
Полная матрица наблюдений и её ограничения — в discovery.md.

Новый естественный выход: RowID,X,X_S,R,R_S,Tag. При старом сопоставлении
новые поля могут добавиться в конец, при cold reopen autosync=true снова
пересоздаёт порядок. Для заданного стабильного порядка — имеющиеся
mappings.fields и autosync=false, без нового общего механизма.
Тип сглаженных полей — real; исходные типы и NULL сохраняются.
Нелинейный ряд, замена источника, внутренние и краевые NULL сопоставлены
с независимыми рациональными нормальными уравнениями HP.

## 2. Этапы

### Этап 0 — исследование и комплект

[discovery.md](discovery.md), fixtures/manifest.json, acceptance/task.md,
независимый acceptance/oracle.py и expected*.json. Статус плана означает
готовность предложенного среза к разработке после утверждения критериев;
не означает поддержку runtime или PASS приёмки. Модельных прогонов нет.

### Этап 1 — Ходрик–Прескотт

- `preprocessing-smoothing:r01`: выбрать continuous integer/real поля;
  для каждого lambda ИЛИ связанный period; сохранить исходные и добавить real-копии.
- `preprocessing-smoothing:r02`: NULL, порядок строк/полей, точность, повторное
  выполнение того же узла после изменения источника, Save и cold reopen.

Новый узел требует полный список правил; существующий сохраняет пропущенные
настройки. Readback: node/source identity, mode, field, lambda, period,
выбранный редактор, output_port=0, фактические имена/типы результата.
Descriptions каждого поля — parameter-schema.proposal.json;
NODE_TYPES.semantics — discovery.md. Только строковый mode hodrick_prescott.
Не передавать внутренние числовые коды алгоритмов.

Границы UI: Lambda 0.0625…102659800000000, period 2…20000;
по умолчанию Lambda=1600, period=39.7. Неподдержанные типы, wavelets,
неоднозначные lambda+period и внешние привязки отклонять до мутации.
Не вводить train/apply: это обычное преобразование текущего входа.

Образцы: transform.sliding_window для упорядоченного результата,
missing-values для редакторов полей. Собственный драйвер SmoothingWizard;
регистрация и schemas/readback — аддитивно в уже имеющихся точках.
Выходное сопоставление использует существующий контракт mappings.
Необходимости общей правки на этапе 0 не установлено.

### Этап 2 — вейвлеты, отдельное назначение

- `preprocessing-smoothing:r03`: Добеши order 1…10, Койфлеты 1…5,
  CDF 9/7 без порядка, depth 1…10.
- `preprocessing-smoothing:r04`: семь способов продолжения границ,
  линейная интерполяция NULL до преобразования.

UI-инвентарь этого семейства есть в discovery, численная приёмка отсутствует.
Перед реализацией нужны отдельные fixtures, независимый oracle с точной
конвенцией границ и утверждённые критерии. В текущий HP-сценарий не включать.

## 3. Oracle и приёмка для утверждения

Python >=3.9 stdlib fractions.Fraction: точное решение
(W + lambda D2ᵀD2)t = Wx, W=1 для известных значений, 0 для NULL.
Это самостоятельная математика; Loginom/runtime/actual не используются.
Для N≥2 при <2 известных значениях функционал не задаёт единственный тренд;
all-null не выдаётся за численный PASS, отдельно фиксируется native-поведение.

Основной пользовательский сценарий: series.csv → HP для X/R с Lambda=1 →
update.csv в том же импорте → тот же узел → полный CSV и Save.
Финальный выход: 8 строк/6 полей RowID,X,R,Tag,X_S,R_S, output_port=0,
ordered=true, column_order=exact, autosync=false для заданного порядка.
Исходные значения/типы/NULL точны; вычисленные real: abs=1e-8, rel=1e-10.
Незаданные метки — label_any=true. Ожидаемые числа — acceptance/expected.json.
Адресные случаи и воспроизведение — acceptance/README.md и oracle.py --case.

Старые W2/W3 не нужны: база уже поддерживает tolerance, ordered и output_port.
Новые механизмы проверки и receipts не добавлять. Собственные сырые журналы,
пакеты и доказательства происхождения в Git не включать.

## 4. Проверки и точка продолжения

Этап 1: red→green на production-ветке, затем required-checks.py list --base
и verify по отчёту. Client — полный набор с pinned Chromium 1246 под nice -n 19;
при изменении оснастки — весь scripts/node-acceptance/tests/*.test.mjs;
при runtime/src — полный bun test в loginom-host по регламенту.
Модельная приёмка: cold PASS, ≥2/3 PASS исполнителя на одном SHA и отдельно
≥2/3 на том же SHA в независимой проверке, корректные Save и cleanup.

Следующий шаг: владелец утверждает HP-scope, oracle, допуски, порядок и порт;
затем отдельная карточка реализации. Оценка — 1–2 цикла разработки + 1 приёмки.
Schema-size и ограничения живой матрицы зафиксированы в discovery.md.

Источник документации: [Loginom Help: Сглаживание](https://help.loginom.ru/userguide/processors/preprocessing/smoothing.html).
Живые наблюдения имеют приоритет над историческим подпланом.
