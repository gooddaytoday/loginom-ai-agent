import { Plugin, Store } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"
import en from "./i18n/en"
import { History } from "./package-model"

export default Plugin.define({
  i18n: builtinCatalog({ en, ru: () => import("./i18n/ru") }),
  stores: { recent: Store.global(History, { connection: "", items: [] }, "packages-recent") },
})
