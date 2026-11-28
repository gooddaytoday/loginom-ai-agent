import { Plugin, Store } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"
import { Schema } from "effect"
import en from "./i18n/en"
import { History, Package } from "./package-model"

export default Plugin.define({
  i18n: builtinCatalog({ en, ru: () => import("./i18n/ru") }),
  stores: {
    composerPackages: Store.global(
      Schema.Record(
        Schema.String,
        Schema.Struct({ kind: Schema.Literal("loginom"), package: Package, connection: Schema.String }),
      ),
      {},
    ),
    recent: Store.global(History, { connection: "", items: [] }, "packages-recent"),
    startExamples: Store.global(Schema.Struct({ dismissed: Schema.Boolean, ownSessions: Schema.Int }), {
      dismissed: false,
      ownSessions: 0,
    }),
  },
})
