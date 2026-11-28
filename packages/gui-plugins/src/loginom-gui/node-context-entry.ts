import { Plugin } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"

export default Plugin.define({
  i18n: builtinCatalog({
    en: {
      remove: "Remove node",
      differentPackage: "This conversation is linked to a different Loginom package. Remove the node to send.",
      missingPackage: "Could not verify the Loginom package linked to this conversation.",
      stalePackage: "The package state is out of date. Try again when the open package can be verified.",
      differentConversation: "This Loginom node belongs to another conversation. Remove the node to send.",
    },
    ru: async () => ({
      default: {
        remove: "Убрать узел",
        differentPackage: "К этому разговору привязан другой пакет Loginom. Уберите узел, чтобы отправить сообщение.",
        missingPackage: "Не удалось проверить, какой пакет Loginom привязан к разговору.",
        stalePackage: "Состояние пакета устарело. Повторите отправку, когда открытый пакет можно будет проверить.",
        differentConversation:
          "Этот узел Loginom добавлен из другого разговора. Уберите узел, чтобы отправить сообщение.",
      },
    }),
  }),
})
