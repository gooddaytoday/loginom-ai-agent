Исследование числовой замены нулём, 2026-11-01, Loginom 7.4.2, Linux/Chromium,
`https://app.loginom.ai/app/?testable=true`, собственный пакет назначенной пары.

Видимые ячейки мастера: `MF;TF-1;WizrdMCF;DataRecoveryWizard;colMethod_I`
и `colMethod_R`. После открытия I список содержит
`…;grdColumnsSettings;tbl;celleditor;cbx;boundlist;Заменять_на_0`.
Кешированный store этого видимого combobox содержит `Value:11`,
`DisplayText:"Заменять на 0"`. Это значение `ActionNull` для `method:"zero"`;
mean остаётся 3, строковая constant — 6. Ввод replacement value не требуется.

[Справка](https://help.loginom.ru/userguide/processors/preprocessing/imputation.html)
разрешает нулевую замену integer/real обоих видов данных; для этого среза вход
явно неупорядоченный. Порог не ниже фактической доли — условие заполнения.
Общая оговорка справки об all-null не переносится на zero: при нативном
`ActionNull:11` и пороге 100% полностью пустое числовое поле даёт нули.
Это подтверждено конфигурацией и точным завершённым портом; для zero не нужно
вычислять среднее известных значений. Независимый oracle использует константу 0
и сохраняет NULL при превышении порога.

Проверки mean, строковой constant, переменных и quality сохраняются. Другие
нативные enum в существующем узле остаются неподдержанными; unknown не
преобразуется в zero. Автоматической смены типа/вида данных нет.
