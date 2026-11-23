export type EventName =
  | "request_rejected" | "request_failed" | "report_rejected" | "csp_violation" | "connection_violation"
  | "publication_pending" | "build_started" | "publication_rejected" | "build_failed" | "build_ready" | "publication_removed"

export type EventFields = {
  code?: string
  key?: string
  sourceHash?: string
  buildHash?: string
  publication?: string
  template?: number
  builderImage?: string
  directive?: string
  disposition?: "enforce" | "report"
}

export type EventWriter = (event: EventName, fields?: EventFields) => void

export function createEventLog(
  role: "web" | "publisher",
  write: (line: string) => boolean | void = writeStdout,
  now = Date.now,
): EventWriter {
  let windowStart = now()
  let attempted = 0
  let suppressed = 0
  const emit = (event: object) => {
    try {
      return write(JSON.stringify(event)) !== false
    } catch {
      // A diagnostic write must not alter the operation that produced it.
      return false
    }
  }
  return (event, fields = {}) => {
    const time = now()
    const newWindow = time - windowStart >= 60_000
    if (!newWindow && attempted >= 60) {
      suppressed++
      return
    }
    const timestamp = new Date(time).toISOString()
    if (newWindow) {
      if (suppressed && emit({ timestamp, role, event: "events_suppressed", count: suppressed })) suppressed = 0
      windowStart = time
      attempted = 0
    }
    attempted++
    const accepted = emit({
      timestamp,
      role,
      event,
      // Six 128-unit strings and one 512-unit path fit in 8 KiB even with six JSON bytes per unit.
      code: fields.code?.slice(0, 128),
      key: fields.key?.slice(0, 128),
      sourceHash: fields.sourceHash?.slice(0, 128),
      buildHash: fields.buildHash?.slice(0, 128),
      publication: fields.publication?.slice(0, 512),
      template: fields.template,
      builderImage: fields.builderImage?.slice(0, 128),
      directive: fields.directive?.slice(0, 128),
      disposition: fields.disposition,
    })
    if (!accepted) suppressed++
  }
}

function writeStdout(line: string) {
  if (process.stdout.writableNeedDrain) return false
  console.log(line)
}
