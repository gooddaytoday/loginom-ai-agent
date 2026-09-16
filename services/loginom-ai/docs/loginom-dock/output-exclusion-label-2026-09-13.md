# Исключение выходного поля: native-нормализация метки

В Loginom7.4.2, DerivedDataSourceOutputSocketWizard, исключение создаёт новую
запись с name=source.name и label=source.name, даже если source.label отличается
или выходное поле было переименовано. Тип и exclusion_source остаются связанными
с исходным полем; data_kind становится «Неопределенное».

Подтверждено на узле16 в test-1. Исторический вызов
`node16-types-off-done` остановился AMBIGUOUS после эффекта: прежняя проверка
ожидала label=source.label. Ошибка не была скрыта/переименована в успех.
После исправления новый вызов `node16-types-off-fixed` полностью прошёл Done,
выходной DataTypes исключён, autosync=false. После сохранения, выхода из аккаунта
и нового открытия пакета роли прочитаны диагностом без изменения настроек;
`node16-execute-preserved` с parameters={} подтвердил прежнее исключение и
пятиколоночную схему. Точный variant_io этим не подтверждён.

Evidence: `.dock/node16/live-1789278261737/browser-992.json`,
`.dock/node16/live-1789287816037/apply-fixed.json`,
`.dock/node16/live-1789288166870/{reopen-fixed-native,execute-fixed}.json`.
Исправление сохраняет строгие проверки source, record/field id, type, owner,
неизменности остальных полей и группировки исключений; остальные виды мастеров
сохраняют прежнюю семантику. Явная неподдержанная метка исключения отклоняется
до жеста. Tests:24 port-mapping cases (distinct label, renamed output,
existing-excluded replay, wrong label, unrelated changes, обычный/input mapping).
Полный клиентский baseline до последних дополнительных тестов:1393PASS/1SKIP.
