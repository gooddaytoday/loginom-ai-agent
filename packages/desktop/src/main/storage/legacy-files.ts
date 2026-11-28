import type { DatabaseSync } from "node:sqlite"
import { Product } from "@loginom-ai-agent/product"

const storePrefix = "opencode."

const legacyPrefixes = [storePrefix, `${Product.slug}.`]

const extension = ".dat"

export function legacyStoreImportID(file: string) {
  return `legacy-store:${file}`
}

export function pendingLegacyStores(db: DatabaseSync, files: readonly string[]) {
  const imported = db.prepare("SELECT 1 FROM migration WHERE id = ?")

  return files.flatMap((file) => {
    const name = storeName(file)

    return name && !imported.get(legacyStoreImportID(file)) ? [{ file, name }] : []
  })
}

function storeName(file: string) {
  if (file === "default.dat") return file

  if (!file.endsWith(extension)) return
  const prefix = legacyPrefixes.find((prefix) => file.startsWith(prefix))

  if (prefix && file.length > prefix.length + extension.length) return storePrefix + file.slice(prefix.length)
}
