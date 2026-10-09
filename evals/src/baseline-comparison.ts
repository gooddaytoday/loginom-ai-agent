import type { BaselinePins, checkBaseline } from "./baseline"
import { baselineCaseSummary, baselineRole } from "./baseline"
import { evaluatorFingerprint } from "./evaluator-replay"
import { analyzeComparison } from "./compare-analysis"

export type OperationalEquivalence = {
  version: 1; baselineId: string; previousIsolationSha256: string; currentIsolationSha256: string
  previousOpsConfigSha256: string; currentOpsConfigSha256: string; previousHarnessSha: string; currentHarnessSha: string
  evaluatorSha256: string; decision: string; changes: ("role" | "paths" | "operational-harness")[]
}

type Report = Awaited<ReturnType<typeof checkBaseline>>

/** Fail closed on conditions; product experiments do not waive scorer or environment identity. */
export async function compareBaselineConditions(before: Report, after: Report) {
  const declared = after.manifest.version === 2 ? after.manifest.declaredChanges ?? [] : []
  const reasons: string[] = []
  if ([before, after].some(report => report.status !== "complete" || report.kind !== "baseline" || report.coverage.measured !== 144 ||
    report.manifest.cases.length !== 48 || !report.cleanup || !report.released)) reasons.push("coverage")
  if (JSON.stringify(before.manifest.cases) !== JSON.stringify(after.manifest.cases) || JSON.stringify(before.manifest.jobs) !== JSON.stringify(after.manifest.jobs)) reasons.push("corpus")
  const a = before.manifest.pins
  const b = after.manifest.pins
  const fixed: (keyof BaselinePins)[] = ["mode", "corpusSha", "judgeModel", "judgeReasoning", "threshold", "timeoutMs", "judgeTimeoutMs", "promptSha256", "schemaSha256", "endpoint", "containerId", "imageDigest", "dockRevision"]
  reasons.push(...fixed.filter(key => a[key] !== b[key]).map(key => key))
  if (["cliVersion", "cliSource", "cliManifestSha256", "binarySha256"].some(key => a[key as keyof BaselinePins] !== b[key as keyof BaselinePins]) && !declared.includes("cli")) reasons.push("undeclared:cli")
  if (a.model !== b.model && !declared.includes("model")) reasons.push("undeclared:model")
  if (a.variant !== b.variant && !declared.includes("reasoning")) reasons.push("undeclared:reasoning")
  if (after.manifest.version === 2 && (after.manifest.baseline?.id !== before.id ||
    after.manifest.baseline.manifestSha256 !== before.manifestSha256)) reasons.push("baseline_reference")
  const scoring = await Promise.allSettled([evaluatorFingerprint(before.checkout, a.harnessSha), evaluatorFingerprint(after.checkout, b.harnessSha)])
  const first = scoring[0]!.status === "fulfilled" ? scoring[0]!.value : undefined
  const second = scoring[1]!.status === "fulfilled" ? scoring[1]!.value : undefined
  if (!first || !second || first !== second || a.evaluatorSha256 && a.evaluatorSha256 !== first || b.evaluatorSha256 && b.evaluatorSha256 !== second)
    reasons.push("evaluator")
  const proof = after.manifest.operationalEquivalence
  const explained = proof?.version === 1 && proof.baselineId === before.id && proof.previousIsolationSha256 === a.isolationSha256 &&
    proof.currentIsolationSha256 === b.isolationSha256 && proof.previousOpsConfigSha256 === a.opsConfigSha256 && proof.currentOpsConfigSha256 === b.opsConfigSha256 &&
    proof.previousHarnessSha === a.harnessSha && proof.currentHarnessSha === b.harnessSha && first && first === second && proof.evaluatorSha256 === first &&
    typeof proof.decision === "string" && proof.decision.trim().length > 0 && Array.isArray(proof.changes) && proof.changes.length > 0 &&
    new Set(proof.changes).size === proof.changes.length && proof.changes.every(change => ["role", "paths", "operational-harness"].includes(change))
  if (a.isolationSha256 !== b.isolationSha256 && !explained) reasons.push("isolationSha256")
  if (a.opsConfigSha256 !== b.opsConfigSha256 && !explained) reasons.push("opsConfigSha256")
  if (a.harnessSha !== b.harnessSha && !explained) reasons.push("operational_harness")
  const experiment = declared.filter((change): change is "model" | "reasoning" => change === "model" || change === "reasoning")
  for (const item of after.manifest.cases.filter(item => item.collection !== "node")) {
    const a = await baselineCaseSummary(before, item.key)
    const b = await baselineCaseSummary(after, item.key)
    if (!a || !b) continue // Coverage already reports missing evidence.
    const analysis = analyzeComparison(a, b, { experiment })
    reasons.push(...analysis.compatibility.map(reason => `${item.key}:${reason}`))
    if (analysis.reliability.reasons.includes("snapshot_mismatch") || analysis.reliability.reasons.includes("evaluation_provenance")) reasons.push(`${item.key}:evaluation_lineage`)
    if (JSON.stringify(a.dock) !== JSON.stringify(b.dock) || a.loginom.image_digest !== b.loginom.image_digest) reasons.push(`${item.key}:environment`)
  }
  return { status: reasons.length ? "INCOMPARABLE" as const : "COMPARABLE" as const, before: before.id, after: after.id, reasons,
    declaredChanges: declared, experiment,
    operational: { previousRole: baselineRole(before.manifest), currentRole: baselineRole(after.manifest), explained: Boolean(explained), proof: proof ?? null },
    evaluator: { previous: first ?? null, current: second ?? null },
    interpretation: "Вывод относится к совокупности объявленных изменений; три попытки не доказывают статистическую значимость. Analytic structure: unavailable." }
}
