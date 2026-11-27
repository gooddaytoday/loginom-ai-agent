import { Plugin } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"

export default Plugin.define({
  i18n: builtinCatalog({
    en: {
      show: "Show Loginom window",
      unavailable: "The window opens when this conversation first uses Loginom.",
      taskbar: "Select the Loginom window on the taskbar.",
      manual: "Select the Loginom window manually.",
    },
    ru: async () => ({
      default: {
        show: "Показать окно Loginom",
        unavailable: "Окно появится после первого обращения к Loginom в этом разговоре.",
        taskbar: "Выберите окно Loginom на панели задач.",
        manual: "Выберите окно Loginom вручную.",
      },
    }),
  }),
})
