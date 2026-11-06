# Редактирование выбросов

Component ID: `component.preprocessing.Elimoutlier`.
Runtime type / mode предложения: `preprocessing.elim_outlier` / `detect`.

## Текущий срез v0.4.0

Зарегистрирован `preprocessing.elim_outlier` / `detect`. SD/IQR с явными множителями; непрерывные числовые поля; keep/keep; Train перед Execute; три выхода 0/1/2.

Ограничения: Прочие способы редактирования не поддержаны. Конвенция дробных квартилей не подтверждена; первый IQR fixture не зависит от неё.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [elim-outlier-node.mjs](../../../../packages/loginom-runtime/client/lib/elim-outlier-node.mjs):1–32; [elim-outlier-parameters.mjs](../../../../packages/loginom-runtime/client/lib/elim-outlier-parameters.mjs):1–28; [preprocessing.elim_outlier.md](../../../../packages/product/skills/loginom-automation/references/nodes/preprocessing.elim_outlier.md):1–20. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[Подплан](plan.md) · [Discovery LAB-531](discovery.md) ·
[Приёмочный комплект](acceptance/README.md) · [Схема параметров](parameter-schema.json).

Этап 0 завершён в объёме решения оркестратора 30.10.2026; подплан
`ready_for_development`. Срез этапа 1 — SD/IQR с явными множителями и keep
для обоих классов. Подтверждены сериализованный native engine
`TBGElimOutlierEngine`, NULL/пустая строка, population SD, строгие границы IQR и
пересчёт после смены входа с явным Train. Конвенция дробных квартилей
**не установлена (шесть гипотез, различитель подготовлен)** и вынесена за
этап 1. Его expected содержат только независимые от конвенции случаи.
Полный readback refresh и отдельное RPC-свойство FullType не заявляются
проверенными. Разрывы классифицированы оркестратором как H1 стенда mas3;
дальнейшее ручное исследование остановлено его решением.
Критерии являются предложением: до этапа 1 их утверждает владелец.
Обработчик не реализован; registry implementation/integration/release
не повышаются. Доказанность каждой части live-исследования указана в discovery.

Три табличных выхода: 0 — все строки, 1 — выбросы без экстремумов,
2 — экстремальные значения. Они сверяются по отдельным output_port одного
узла. Стенд наблюдён: Loginom 7.4.2 Enterprise. Модельных и cold PASS нет.

Этап 1 — создание/настройка, SD/IQR, явное обучение на текущем входе,
три выхода и компактный readback. Этап 2 отдельной карточкой — прочие
способы редактирования. W2/W3 уже поддерживаются приёмочной оснасткой базы.
Новые общие алгоритмы и механизмы верификации этой карточкой не разрешены.

Приращение предложенной полной dock_node_apply схемы: 914 Б,
включая parameter-schema 865 Б. Общий запас после F2 нужен перед
регистрацией этапа 1; предел полной схемы не блокирует этап 0.
