# Скользящее окно

Component ID: component.transform.SlidingWindow.
Runtime type / mode: transform.sliding_window / lag.
Нативный Engine: TBGSlidingWindowEngine, Loginom 7.4.2.

## Текущий срез v0.4.0

Зарегистрирован `transform.sliding_window` / `lag`. Окна по полям; три политики неполных записей; список окон заменяется целиком; пропуск параметров сохраняет настройки.

Ограничения: Только lag; управляющие переменные и остальные режимы вне среза.

Источник: `origin/v040-loginom-sync@94551fa4933ba0e23ab442ff47febaa6142d1c01`; [sliding-window-node.mjs](../../../../packages/loginom-runtime/client/lib/sliding-window-node.mjs):1–30; [sliding-window-parameters.mjs](../../../../packages/loginom-runtime/client/lib/sliding-window-parameters.mjs):1–34; [transform.sliding_window.md](../../../../packages/product/skills/loginom-automation/references/nodes/transform.sliding_window.md):1–16. Регистрация не заменяет живую приёмку точного SHA; прежние результаты ниже относятся к своим ревизиям.

## Исторические материалы и план расширений

[Подплан](plan.md) · [Исследование](discovery.md) ·
[Приёмочное предложение](acceptance/README.md) · [Исторический реестр](../../registry.json).

Этап 0 LAB-519 подготовлен: ready_for_development.
Критерии остаются предложением до утверждения владельцем.
Регистрация runtime и текущий срез перечислены выше; прежнее назначение этапа 0 сохранено как история.
Статус этапа 0 ведётся в подплане; исторический реестр и manifest происхождения
в этой карточке не изменялись.
