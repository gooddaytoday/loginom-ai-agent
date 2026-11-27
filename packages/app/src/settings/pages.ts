import type { SettingsPage } from "@opencode/plugin/gui"
import type { IconProps } from "@opencode/ui/icon"
import type { useLanguage } from "@/runtime/i18n/language"
import type { SettingsNavGroup } from "./navigation"
import type { SettingsRootTab } from "./surface"

type Label = Parameters<ReturnType<typeof useLanguage>["t"]>[0]

export const pageIcons = {
  general: "sliders",
  appearance: "appearance",
  notifications: "notifications",
  shortcuts: "keyboard",
  projects: "folder",
  providers: "providers",
  models: "models",
  extensions: "extensions",
  servers: "server",
  about: "info",
} as const satisfies Record<SettingsRootTab | "projects" | "extensions", IconProps["name"]>

export const pageLabels = {
  general: "settings.tab.preferences",
  appearance: "settings.general.section.appearance",
  notifications: "settings.tab.notifications",
  shortcuts: "settings.shortcuts.title",
  providers: "settings.providers.title",
  models: "settings.models.title",
  servers: "settings.section.server",
  about: "settings.tab.about",
} as const satisfies Record<SettingsRootTab, Label>

export function settingsPageGroups(input: {
  translate: ReturnType<typeof useLanguage>["t"]
  multipleServers: boolean
  pages: readonly SettingsPage[]
}): SettingsNavGroup[] {
  const host = (value: SettingsRootTab, order: number, label: Label = pageLabels[value]) => ({
    value,
    order,
    icon: pageIcons[value],
    label: input.translate(label),
  })
  const plugins = input.pages.map((page) => ({
    value: page.id,
    icon: page.icon ?? pageIcons.extensions,
    label: page.title,
    group: page.group === "work" ? "work" : "application",
    order: page.order ?? (page.group === "about" ? 30 : Number.MAX_VALUE),
  }))
  const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order

  return [
    {
      label: input.translate("settings.group.work"),
      items: [host("providers", 20), host("models", 30), ...plugins.filter((page) => page.group === "work")].sort(
        byOrder,
      ),
    },
    {
      label: input.translate("settings.group.application"),
      items: [
        host("general", 10),
        host("shortcuts", 20, "settings.tab.shortcuts"),
        host("about", 30),
        host("appearance", 100),
        host("notifications", 110),
        host("servers", 120, input.multipleServers ? "settings.tab.servers" : pageLabels.servers),
        ...plugins.filter((page) => page.group === "application"),
      ].sort(byOrder),
    },
  ]
}
