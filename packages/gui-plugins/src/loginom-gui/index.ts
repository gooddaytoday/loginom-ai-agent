import { Plugin } from "@opencode/plugin/gui"

export default Plugin.define({
  i18n: {
    en: {
      show: "Show Loginom Window",
      "no-window": "There is no Loginom window for this conversation yet.",
      starting: "Loginom is starting. Try again in a moment.",
      taskbar: "Windows did not bring Loginom forward. Select it from the taskbar.",
      manual: "Loginom could not be brought forward. Switch to it using your window manager.",
      "layout-unavailable": "Automatic placement is unavailable. Move the Loginom window manually.",
    },
    ru: {
      show: "Показать окно Loginom",
      "no-window": "Для этого разговора пока нет окна Loginom.",
      starting: "Loginom запускается. Попробуйте ещё раз через несколько секунд.",
      taskbar: "Windows не вывела Loginom на передний план. Выберите его на панели задач.",
      manual: "Не удалось вывести Loginom на передний план. Переключитесь на него вручную.",
      "layout-unavailable": "Автоматическая раскладка недоступна. Переместите окно Loginom вручную.",
    },
  },
})
