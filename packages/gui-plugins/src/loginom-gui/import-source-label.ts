export function importSourceLabel(value: string | undefined): string | undefined {
  return value
    ?.split("|")
    .map((source) => {
      const candidate = source.trim()
      const relativeUrl = candidate.startsWith("//")
      if (/^[a-z]:[\\/]/i.test(candidate)) return source
      const url = URL.parse(relativeUrl ? `https:${candidate}` : candidate)

      if (!url || (!url.hostname && url.protocol !== "file:"))
        return relativeUrl || /^[a-z][\w+.-]*:\/\//i.test(candidate) || /^https?:/i.test(candidate) ? "—" : source

      url.username = ""
      url.password = ""
      url.search = ""
      url.hash = ""

      return relativeUrl ? url.href.slice("https:".length) : url.href
    })
    .join("|")
}
