// Loginom AI Agent product plugin. Core runs it as a built-in server plugin: last in `post`, with a guarded and
// reserved ID (seam U1, `packages/core/src/plugin/product.ts`). Access grants, the tool gate, the Host lease, skill
// sources and Loginom tools arrive in stage B2.2…B2.5.
import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "loginom.product",
  setup: () => {},
})
