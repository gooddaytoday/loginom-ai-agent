# Текстовый экспорт: Windows-1251

LAB-712, 2026-11-01, исходный SHA `004e96dbfa47e8b5251493ab38ae5766ecc0fa5a`.
Loginom 7.4.2, Linux/Chromium 1246, `https://app.loginom.ai/app/?testable=true`.
Наблюдения выполнены в отдельном собственном пакете аккаунта reviewer назначенной пары.
Использованы native UI по `data-tid`, чтение кешированных Ext controls и штатный
production `link.create`; внутренний JavaScript Loginom и серверные методы не подменялись.

Две страницы экспорта после настройки входа:

| Основа `MF;TF-1;WizrdMCF;` и суффикс | Наблюдение |
|---|---|
| `ExportTextFileParamsWizard;edtFileName;ValueControl` | Путь назначения, первая страница |
| `ExportTextFilePreviewWizard;edtCodePage;ValueControl;trg_picker` | Выбор кодировки, вторая страница |
| `ExportTextFilePreviewWizard;edtCodePage;ValueControl;boundlist;Кириллическая_(1251)` | Метка «Кириллическая (1251)», числовое native значение `1251` |
| `ExportTextFilePreviewWizard;edtWriteBOM;ValueControl;DisplayEl` | Checkbox доступен при CP1251; `true` принимается UI, файл остаётся без BOM |

Контракт использует `Windows-1251`, уже принимаемый Текстовым импортом
(`text-import-encoding.mjs`); экспорт не вводит дополнительное написание.
UTF-8 имеет прежние native значение `65001` и метку «UTF-8 (65001)».

На входе discovery были строки `Привет Ёё` и `Ж漢😀` (UTF-8). Подключённый
экспорт с кодовой страницей 1251 и включённым BOM скачан через штатное
`FileStorageForm;mniDownload`. Его 28 байт:

```text
caeee409d2e5eaf1f20a3109cff0e8e2e5f220a8b80a3209c61a1a0a
```

Кириллица закодирована CP1251; BOM отсутствует. `漢` и emoji заменены каждый
байтом `1a` (SUB). Это наблюдённая потеря данных, а не транслитерация, `?`
или отказ экспорта. Агент должен предупредить пользователя. Рекомендуемое
явное значение — `bom:false`; CP1251 выбирается только по просьбе пользователя.
При повторном открытии настройки native BOM наблюдался `false`.

Фикстура, `expected.json` и независимый Python byte oracle созданы до изменения
обработчика. Данные основаны на typed/escaping фикстурах: integer/real, кириллица,
кавычки и `;` внутри строки. Ожидания: 76 байт CP1251, затем 112 байт UTF-8;
кириллические метки заголовков, `;`, CRLF, без BOM. Oracle не получает данные
из runtime и не передаётся модели. Сценарий `text-export-cp1251` проверяет
два экспорта того же узла и последующий cold-read сохранённого входа.
