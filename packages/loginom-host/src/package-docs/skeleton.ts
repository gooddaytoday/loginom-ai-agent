import type { PackageStructure } from "./extract"

export function renderSkeleton(structure: PackageStructure): string {
  const date = new Date()
  const time = `${date.getFullYear()}-${[date.getMonth() + 1, date.getDate()].map((value) => String(value).padStart(2, "0")).join("-")} ${[date.getHours(), date.getMinutes(), date.getSeconds()].map((value) => String(value).padStart(2, "0")).join(":")}`
  const file = structure.package.file_name || `${structure.package.name || "package"}.lgp`
  return [
    "Версия сервиса «ИИ Отчет»: `1.0`",
    "",
    `# Отчет о пакете «${file}» (${time})`,
    "",
    `## Общая информация о пакете «${file}»`,
    "",
    `* **Версия платформы**: \`${structure.package.application_version || "неизвестно"}\``,
    "",
    "### Описание пакета",
    "",
    "> PLACEHOLDER_PACKAGE_DESCRIPTION",
    "",
    "### Ссылки на внешние пакеты",
    "",
    ...(structure.package.external_references.length
      ? structure.package.external_references.map((reference) => `* \`${reference}\``)
      : ["* Ссылки на внешние пакеты отсутствуют"]),
    "",
    "### Статистика пакета",
    "",
    `* **Количество модулей**: \`${structure.stats.modules}\``,
    `* **Общее количество заметок**: \`${structure.stats.notes}\``,
    `* **Общее количество узлов**: \`${structure.stats.nodes}\``,
    `* **Общее количество подмоделей**: \`${structure.stats.submodels}\``,
    `* **Общее количество узлов программирования**: \`${structure.stats.programming_nodes}\``,
    `* **Общее количество узлов-ссылок**: \`${structure.stats.reference_nodes}\``,
    `* **Общее количество производных узлов**: \`${structure.stats.derived_nodes}\``,
    "",
    "### Список модулей",
    "",
    ...(structure.modules.length
      ? structure.modules.map((module) => `* Модуль ${module.index}. «${module.display_name || module.name}»`)
      : ["* (модули не найдены)"]),
    ...structure.modules.flatMap((module) => [
      "",
      `## Модуль ${module.index}. «${module.display_name || module.name || module.id}»`,
      "",
      "### Описание модуля",
      "",
      `> PLACEHOLDER_MODULE_${module.index}_DESCRIPTION`,
      "",
      "### Статистика модуля",
      "",
      `* **Глубина вложенности сценария**: \`${module.stats.nesting_depth}\``,
      `* **Количество заметок**: \`${module.stats.notes}\``,
      `* **Количество узлов**: \`${module.stats.nodes}\``,
      `* **Количество подмоделей**: \`${module.stats.submodels}\``,
      `* **Количество узлов программирования**: \`${module.stats.programming_nodes}\``,
      `* **Количество узлов-ссылок**: \`${module.stats.reference_nodes}\``,
      `* **Количество производных узлов**: \`${module.stats.derived_nodes}\``,
    ]),
    "",
  ].join("\n")
}
