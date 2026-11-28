import { Schema } from "effect"

export const Package = Schema.Struct({
  name: Schema.String,
  path: Schema.String,
  folder: Schema.String,
  modified: Schema.String,
  size: Schema.Number,
})

export type Package = typeof Package.Type

export const Folder = Schema.Struct({ name: Schema.String, path: Schema.String })

export type Folder = typeof Folder.Type

export const Listing = Schema.Struct({
  folders: Schema.Array(Folder),
  packages: Schema.Array(Package),
  slow: Schema.Boolean,
})

export type Listing = typeof Listing.Type

const Recent = Schema.Struct({ package: Package, usedAt: Schema.Number, action: Schema.optionalKey(Schema.String) })

export type Recent = typeof Recent.Type

export const History = Schema.Struct({ connection: Schema.String, items: Schema.Array(Recent) })

export function remember(items: readonly Recent[], recent: Recent) {
  return [recent, ...items.filter((item) => item.package.path !== recent.package.path)].slice(0, 3)
}

export function matches(name: string, query: string) {
  const normalized = (text: string) => text.normalize("NFC").toLocaleLowerCase("ru")

  return normalized(name).includes(normalized(query.trim()))
}

export function visible(listing: Listing, query: string, byName: boolean, locale: string): Listing {
  const compare = new Intl.Collator(locale, { numeric: true }).compare

  return {
    ...listing,
    folders: listing.folders
      .filter((item) => matches(item.name, query))
      .toSorted((left, right) => compare(left.name, right.name)),
    packages: listing.packages
      .filter((item) => matches(item.name, query))
      .toSorted((left, right) => {
        const byDate = (Date.parse(right.modified) || 0) - (Date.parse(left.modified) || 0)

        return (!byName && byDate) || compare(left.name, right.name)
      }),
  }
}
