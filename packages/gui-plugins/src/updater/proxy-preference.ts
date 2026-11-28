import type { BuiltinMainStorage } from "@opencode/plugin/gui/builtin"
import { Schema } from "effect"

const key = "systemProxyEnabled"

export function systemProxyPreference(storage: BuiltinMainStorage) {
  return storage.store(key, { schema: Schema.Boolean, initial: true, from: { settings: key } })
}
