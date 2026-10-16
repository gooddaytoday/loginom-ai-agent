import path from "node:path"

export function watchAttemptIncidents(directory: string, onIncident: (code: string) => void) {
  const codes = new Set<string>()
  const controller = new AbortController()
  const inspect = async () => {
    const output = (await Promise.all(["events.jsonl", "stderr.txt", "judge-events-1.jsonl", "judge-events-2.jsonl", "judge-stderr-1.txt", "judge-stderr-2.txt"]
      .map(name => Bun.file(path.join(directory, name)).text().catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return ""
        return "INCIDENT_OBSERVATION_UNCONFIRMED"
      })))).join("\n")
    const observed = [
      ...(/\bLICEN[CS]E_(?:[A-Z]+_)*(?:DENIED|EXCEEDED|EXPIRED|ERROR)\b|\bE\w*Licen[cs]e\w*(?:Error|Limit|Exception)\b|лицензи[^\n"}]{0,120}(?:отказ|превыш|недоступ)|(?:отказ|превыш|недостат)[^\n"}]{0,120}лицензи/i.test(output) ? ["LICENCE_DENIED"] : []),
      ...(/"name"\s*:\s*"(?:APIError|ProviderAuthError|ProviderModelNotFoundError|ProviderInitError)"|"statusCode"\s*:\s*429\b|\bHTTP\s+429\b|(?:rate|usage)[_ -]?limit[_ -]?(?:exceeded|reached|error)|rate[_ -]?limited|too many requests|quota[_ -]?(?:exceeded|exhausted)|insufficient[_ -]?quota/i.test(output)
        ? ["PROVIDER_ERROR_OBSERVED"] : []),
      ...(output.includes("INCIDENT_OBSERVATION_UNCONFIRMED") ? ["INCIDENT_OBSERVATION_UNCONFIRMED"] : []),
    ]
    for (const code of observed.filter(code => !codes.has(code))) { codes.add(code); onIncident(code) }
  }
  const pending = (async () => {
    while (!controller.signal.aborted) { await inspect(); await Bun.sleep(250) }
  })()
  return { async stop() { controller.abort(); await pending; await inspect() } }
}
