import { Logger } from "effect"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { redactLogValues } from "@loginom-ai-agent/loginom-host/local-logs"

import { retainedServiceLogs } from "@loginom-ai-agent/loginom-host/service-logs"

export function desktopServiceLogger() {
  const root = process.env.LOGINOM_AI_AGENT_SERVICE_LOG_DIR
  if (!root) return
  // The service's children must not share its logging destination.
  delete process.env.LOGINOM_AI_AGENT_SERVICE_LOG_DIR

  const logs = retainedServiceLogs(root)
  const target = join(root, `service-${process.pid}-${randomUUID()}.log`)
  void logs.prune()
  const known = Object.entries(process.env).flatMap(([key, value]) =>
    value && /(?:KEY|TOKEN|SECRET|PASSWORD|COOKIE)$/.test(key) ? [value] : [],
  )
  const logger = Logger.make((options) => {
    const entry = Logger.formatStructured.log(options)
    const messages = Array.isArray(options.message) ? options.message : [options.message]
    const data = redactLogValues([...messages, { cause: entry.cause, annotations: entry.annotations }], known)
    logs.append(target, JSON.stringify({ timestamp: entry.timestamp, level: entry.level, data }))
  })
  return { logger, flush: logs.flush }
}
