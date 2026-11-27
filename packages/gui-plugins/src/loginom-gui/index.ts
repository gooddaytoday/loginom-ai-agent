import { Plugin } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"
import { dict as en } from "./i18n/en"
import graphEn from "./i18n/graph-en"
import schemaEn from "./i18n/schema-en"

export default Plugin.define({
  i18n: builtinCatalog({ en: { ...en, ...graphEn, ...schemaEn }, ru: () => import("./i18n/ru") }),
})
