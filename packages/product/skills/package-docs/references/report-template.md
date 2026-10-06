# Report template («ИИ Отчет»)

Final user-facing Markdown must match this outline (golden sample:
`abc-xyz-analysis.lgp_report.pdf` / tools.loginom.ru `ai_report.md`).

```markdown
Версия сервиса «ИИ Отчет»: `1.0`

# Отчет о пакете «<name.lgp>» (<YYYY-MM-DD HH:MM:SS>)

## Общая информация о пакете «<name.lgp>»

* **Версия платформы**: `<ApplicationVersion>`

### Описание пакета

> <Russian business prose about the package purpose>

### Ссылки на внешние пакеты

* Нет внешних зависимостей
  <!-- or bullet list of referenced package names -->

### Статистика пакета

* **Количество модулей**: `N`
* **Общее количество заметок**: `N`
* **Общее количество узлов**: `N`
* **Общее количество подмоделей**: `N`
* **Общее количество узлов программирования**: `N`
* **Общее количество узлов-ссылок**: `N`
* **Общее количество производных узлов**: `N`

### Список модулей

* Модуль 1. «…»

## Модуль 1. «…»

### Описание модуля

> <prose>

**Общая структура:**
<short flow summary>

**Описание подмоделей:**

1. **Имя:**
   * **Вход:** …
   * **Расчёт:** / **Обработка:** …
   * **Выход:** …

### Статистика модуля

* **Глубина вложенности сценария**: `N`
* **Количество заметок**: `N`
* **Количество узлов**: `N`
* **Количество подмоделей**: `N`
* **Количество узлов программирования**: `N`
* **Количество узлов-ссылок**: `N`
* **Количество производных узлов**: `N`
```

Do **not** include in the final report:

- `Используемая модель:` line (omit even if the model name is known)
- node inventory tables
- visualizer lists
- Engine / settings attribute dumps
- Help `Источники:` section
- GUIDs in prose
