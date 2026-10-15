export function redactKnownSecrets<T>(value: T, secrets: string[]): T {
  const patterns = variants(secrets)
  const clean = (value: unknown, depth = 0): unknown => {
    if (depth > 40) return "[omitted]"
    if (typeof value === "string") return patterns.reduce((text, secret) => text.replaceAll(secret, "[redacted]"), value)
    if (Array.isArray(value)) return value.map(item => clean(item, depth + 1))
    if (!value || typeof value !== "object") return value
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clean(item, depth + 1)]))
  }
  return clean(value) as T
}

/** Retains enough raw bytes to match credentials split across pipe chunks. */
export function createOutputRedactor(secrets: string[]) {
  const patterns = variants(secrets).map(value => Buffer.from(value))
  const width = Math.max(0, ...patterns.map(value => value.length))
  let pending = Buffer.alloc(0)
  return (chunk: Uint8Array, final = false): Uint8Array => {
    if (!patterns.length) return chunk
    pending = Buffer.concat([pending, chunk])
    const limit = final ? pending.length : Math.max(0, pending.length - width + 1)
    const output = []
    let offset = 0
    while (offset < limit) {
      const match = patterns.map(pattern => ({ pattern, at: pending.indexOf(pattern, offset) }))
        .filter(match => match.at >= 0 && match.at < limit)
        .sort((a, b) => a.at - b.at || b.pattern.length - a.pattern.length)[0]
      if (!match) break
      output.push(pending.subarray(offset, match.at), Buffer.from("[redacted]"))
      offset = match.at + match.pattern.length
    }
    const end = Math.max(offset, limit)
    output.push(pending.subarray(offset, end))
    pending = pending.subarray(end)
    return Buffer.concat(output)
  }
}

/** Sanitizes JSON values so a quoted credential cannot replace JSON delimiters. */
export function createJsonOutputRedactor(secrets: string[]) {
  const enabled = secrets.some(Boolean)
  let pending = Buffer.alloc(0), raw = false
  return (chunk: Uint8Array, final = false): Uint8Array => {
    if (!enabled) return chunk
    pending = Buffer.concat([pending, chunk])
    if (final && !raw && pending.length && pending.at(-1) !== 10) pending = Buffer.concat([pending, Buffer.from("\n")])
    const output = []
    let end = 0
    while (!raw) {
      const newline = pending.indexOf(10, end)
      if (newline < 0) break
      const line = pending.subarray(end, newline).toString("utf8")
      try {
        output.push(Buffer.from(line.trim() ? JSON.stringify(redactKnownSecrets(JSON.parse(line), secrets)) + "\n" : line + "\n"))
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error
        // Preserve malformed diagnostic output, but delay it until EOF to mask multiline credentials.
        raw = true
        break
      }
      end = newline + 1
    }
    pending = pending.subarray(end)
    if (final && pending.length) {
      output.push(Buffer.from(redactKnownSecrets(pending.toString("utf8"), secrets)))
      pending = Buffer.alloc(0)
    }
    return Buffer.concat(output)
  }
}

function variants(secrets: string[]) {
  return [...new Set(secrets.filter(Boolean).flatMap(secret => [secret, encodeURIComponent(secret), JSON.stringify(secret).slice(1, -1)]))]
    .sort((a, b) => b.length - a.length)
}
