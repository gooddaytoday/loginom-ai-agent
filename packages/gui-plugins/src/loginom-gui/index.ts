import { Plugin } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"
import en from "./step-failure/en"

export default Plugin.define({ i18n: builtinCatalog({ en, ru: () => import("./step-failure/ru") }) })
