import type log from "electron-log/main.js"
import { redactLogValues } from "@loginom-ai-agent/loginom-host/local-logs"

export function redactElectronLog(secrets: () => string[]): (typeof log.hooks)[number] {
  return (message) => ({ ...message, data: redactLogValues(message.data, secrets()) })
}
