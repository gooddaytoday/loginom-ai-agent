import { Plugin, Store } from "@opencode/plugin/gui"
import { builtinCatalog } from "@opencode/plugin/gui/builtin"
import { Schema } from "effect"
import en from "./i18n/en"

export default Plugin.define({
  i18n: builtinCatalog({ en, ru: () => import("./i18n/ru") }),
  stores: {
    composerPackages: Store.global(
      Schema.Record(Schema.String, Schema.Struct({ name: Schema.String, path: Schema.String })),
      {},
    ),
    startExamples: Store.global(Schema.Struct({ dismissed: Schema.Boolean, ownSessions: Schema.Int }), {
      dismissed: false,
      ownSessions: 0,
    }),
  },
})
