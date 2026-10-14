import path from "node:path"
import type { ProcessIdentity, ProcessOwner } from "./process-supervisor"

export function qualifyClosedProcessEvidence(value: unknown, input: { owner: ProcessOwner; producerPid: number }) {
  if (!Number.isSafeInteger(input.producerPid) || input.producerPid < 1 || !input.owner.id ||
    !["slot", "admin", "judge", "command"].includes(input.owner.kind)) return
  const proof = evidenceObject(value), owner = input.owner
  const lifetime = evidenceObject(proof.lifetime), launcher = lifetime.launcher
  if (proof.status !== "confirmed" || proof.error !== null || proof.capture_complete !== true || proof.observation_mode !== "continuous" ||
    !Number.isSafeInteger(evidenceObject(proof.observations).count) || Number(evidenceObject(proof.observations).count) < 1 ||
    !Array.isArray(proof.unknownProcesses) || proof.unknownProcesses.length ||
    !Array.isArray(proof.verification) || proof.verification.length !== 2 || proof.verification.some((value, index, passes) => {
      const pass = evidenceObject(value)
      return pass.owned_remaining !== 0 || typeof pass.observed_at !== "string" || !Number.isFinite(Date.parse(pass.observed_at)) ||
        Date.parse(pass.observed_at) < Date.parse(String(lifetime.finished_at)) ||
        index > 0 && Date.parse(pass.observed_at) <= Date.parse(String(evidenceObject(passes[index - 1]).observed_at))
    }) || lifetime.producer_pid !== input.producerPid || JSON.stringify(lifetime.owner) !== JSON.stringify(owner) ||
    typeof lifetime.started_at !== "string" || typeof lifetime.finished_at !== "string" ||
    ![lifetime.started_at, lifetime.finished_at].every(value => Number.isFinite(Date.parse(value))) || Date.parse(lifetime.finished_at) < Date.parse(lifetime.started_at) ||
    !validEvidenceIdentity(launcher) || evidenceObject(proof.launcher).pid !== launcher.pid || evidenceObject(proof.launcher).ready !== true ||
    !Array.isArray(proof.processes) || !proof.processes.every(validEvidenceIdentity) || !proof.processes.some(identity => JSON.stringify(identity) === JSON.stringify(launcher)))
    return undefined
  return { owner, launcher, identities: proof.processes, startedAt: lifetime.started_at, finishedAt: lifetime.finished_at }
}

function evidenceObject(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function validEvidenceIdentity(value: unknown): value is ProcessIdentity {
  const identity = evidenceObject(value)
  return typeof identity.starttime === "string" && /^\d+$/.test(identity.starttime) && typeof identity.executable === "string" && path.isAbsolute(identity.executable) &&
    ["pid", "group", "session"].every(key => Number.isSafeInteger(identity[key]) && Number(identity[key]) >= 1) &&
    ["uid", "parent", "device", "inode"].every(key => Number.isSafeInteger(identity[key]) && Number(identity[key]) >= 0)
}
