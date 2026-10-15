import path from "node:path"

type ContainerSeries = {
  containerId: string
  executions: { key: string; kind: "product" | "judge"; record: { runDir: string; files: { path: string; sha256: string }[] } }[]
}

type VersionEvidence = { execution: string; runDir: string; path: string; sha256: string }

/** Uses executions verified by checkBaseline; never authorizes admission, recovery or cleanup. */
export async function compareContainerIdentity(before: ContainerSeries, after: ContainerSeries) {
  if (before.containerId === after.containerId) return { compatible: true, basis: "container-id" as const,
    before: { containerId: before.containerId, version: null, evidence: [] as VersionEvidence[], error: null },
    after: { containerId: after.containerId, version: null, evidence: [] as VersionEvidence[], error: null } }
  const a = await readVersion(before)
  const b = await readVersion(after)
  const compatible = !a.error && !b.error && a.version !== null && a.version === b.version
  return { compatible, basis: compatible ? "loginom-version" as const : null, before: a, after: b }
}

async function readVersion(series: ContainerSeries) {
  const evidence: VersionEvidence[] = []
  const versions = new Set<string>()
  for (const execution of series.executions.filter(execution => execution.kind === "product")) {
    for (const file of execution.record.files.filter(file => /^[^/]+\/1\/(?:infra-error\/)?diagnostics\/[1-9]\d*-execution-events\.jsonl$/.test(file.path))) {
      if (file.path.split("/").some(part => [".", ".."].includes(part) || part.includes("\\")))
        return { containerId: series.containerId, version: null, evidence, error: "invalid_evidence_path" }
      const bytes = await Bun.file(path.join(execution.record.runDir, file.path)).bytes().catch(() => undefined)
      if (!bytes || new Bun.CryptoHasher("sha256").update(bytes).digest("hex") !== file.sha256)
        return { containerId: series.containerId, version: null, evidence, error: "evidence_changed" }
      evidence.push({ execution: execution.key, runDir: execution.record.runDir, ...file })
      try {
        for (const line of new TextDecoder("utf-8", { fatal: true }).decode(bytes).split("\n").filter(line => line.trim())) {
          const record: unknown = JSON.parse(line)
          if (!record || typeof record !== "object" || Array.isArray(record))
            return { containerId: series.containerId, version: null, evidence, error: "invalid_journal" }
          if (!("target" in record) || record.target === null) continue
          if (typeof record.target !== "object" || Array.isArray(record.target))
            return { containerId: series.containerId, version: null, evidence, error: "invalid_journal" }
          if (!("loginom_build" in record.target)) continue
          if (record.target.loginom_build === null || record.target.loginom_build === undefined) continue
          if (typeof record.target.loginom_build !== "string" || !record.target.loginom_build.trim() || /\[redacted\]/i.test(record.target.loginom_build))
            return { containerId: series.containerId, version: null, evidence, error: "invalid_version" }
          versions.add(record.target.loginom_build)
        }
      } catch {
        return { containerId: series.containerId, version: null, evidence, error: "invalid_journal" }
      }
    }
  }
  if (versions.size > 1) return { containerId: series.containerId, version: null, evidence, error: "conflicting_versions" }
  return { containerId: series.containerId, version: [...versions][0] ?? null, evidence, error: versions.size ? null : "missing_version" }
}
