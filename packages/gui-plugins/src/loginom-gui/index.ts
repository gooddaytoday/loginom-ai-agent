import { Plugin } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"
import en from "./i18n/en"

export default Plugin.define({ i18n: builtinCatalog({ en, ru: () => import("./i18n/ru") }) })
