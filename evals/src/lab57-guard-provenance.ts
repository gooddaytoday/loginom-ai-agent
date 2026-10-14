import { prepareLab57CleanupProposal, validateCapturedLineage, lab57CleanupScope } from "./lab57-cleanup-proposal"
import type { ProcessCleanup } from "./process-supervisor"

// Exact coordinator-accepted original records. This exception does not amend generic retirement.
const accepted = {
  "source_file_hashes": {
    "evals/script/run-node-evals.ts": "ff0d34669d1514b3529d043c1c39d3cf43db3368dc72cea39b9629495c10df29",
    "evals/src/node-runner.ts": "5bdebe3842d48b0634e081652f3d79f9053e26fcbd22290ecfe1d3fd8eb50531",
    "evals/src/run.ts": "2f5b438bba211dc805107007608d2e0fd61e2d377421ee5d5a01fd47ca7e4c30",
    "evals/src/node-eval-ops.ts": "5f616c2cc4bf59aa6234bd6bf7c7220eb3c8a6102d8fae264088450d924b24e7",
    "evals/src/lease.ts": "d2ab22606c27e315483a86b1852134ce5da23ce46e769c5114b89dbb02cc54a0"
  },
  "original_product_command_sha256": "39c0fa95ec6bc3f9cf8a1f927d260a15e93f9a8a8d948b704fea4f4286e37b72",
  "captured_parent_edges": [
    {
      "case": "csv-comma-utf8",
      "original_cleanup_sha256": "0c10e3aee031427cc34ce4893004d8ed2095c2de5b81222686e22a344618e868",
      "launcher": {
        "pid": 2127478,
        "starttime": "99116395",
        "uid": 1000,
        "parent": 2126565,
        "group": 2127478,
        "session": 2127478
      }
    },
    {
      "case": "csv-pipe-multiline",
      "original_cleanup_sha256": "1d3878fc10972a6cf892d4e2d292cf69809fe58891b871da825eef72b78c4004",
      "launcher": {
        "pid": 2128694,
        "starttime": "99137870",
        "uid": 1000,
        "parent": 2126565,
        "group": 2128694,
        "session": 2128694
      }
    },
    {
      "case": "tsv-utf16le",
      "original_cleanup_sha256": "d8232a9f55141d5b85ee487cc90477769de1318015594c7bf1c1553b9272dce3",
      "launcher": {
        "pid": 2129877,
        "starttime": "99158121",
        "uid": 1000,
        "parent": 2126565,
        "group": 2129877,
        "session": 2129877
      }
    },
    {
      "case": "tsv-utf8",
      "original_cleanup_sha256": "34e8b0335f97f1f3bdf19966e4cf0c752366e15680fc674250e654c2cd3b3f52",
      "launcher": {
        "pid": 2131148,
        "starttime": "99188206",
        "uid": 1000,
        "parent": 2126565,
        "group": 2131148,
        "session": 2131148
      }
    },
    {
      "case": "txt-comma-utf8",
      "original_cleanup_sha256": "e52f5fea432dc29c843f77057b92bb70da75633f3ae377bdb878eab80fbc0935",
      "launcher": {
        "pid": 2132361,
        "starttime": "99214037",
        "uid": 1000,
        "parent": 2126565,
        "group": 2132361,
        "session": 2132361
      }
    },
    {
      "case": "txt-semicolon-cp1251-decimal",
      "original_cleanup_sha256": "1ef7a1544f4a779bcf9648300a3afa081953cf2eaa7ecda90c35769fb31862f1",
      "launcher": {
        "pid": 2133627,
        "starttime": "99242764",
        "uid": 1000,
        "parent": 2126565,
        "group": 2133627,
        "session": 2133627
      }
    }
  ]
} as const
const object = (v: unknown): Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {}
const hash = (v: string) => new Bun.CryptoHasher("sha256").update(v).digest("hex")

/** Static provenance only: no process absence, server cessation, admission or cleanup is inferred. */
export function validateLab57EquivalentGuard(original: unknown, provenance: unknown) {
  const v = object(provenance), input = object(original)
  const missing = prepareLab57CleanupProposal(original).missing.filter(reason => ![
    "LEGACY_GUARD_PARENT_BIRTH_UNCAPTURED", "SERVER_CESSATION_UNPROVEN", "FRESH_OPERATOR_GUARDS_REQUIRED",
  ].includes(reason))
  if (input.guardParentCapture !== null && input.guardParentCapture !== undefined) missing.push("SYNTHESIZED_PARENT_CAPTURE_REFUSED")
  for (const [file, expected] of Object.entries(accepted.source_file_hashes)) {
    const bytes = object(v.sources)[file]
    if (typeof bytes !== "string" || hash(bytes) !== expected) missing.push(`FROZEN_PRODUCER_CHANGED:${file}`)
  }
  if (typeof v.command !== "string" || hash(v.command) !== accepted.original_product_command_sha256) missing.push("ORIGINAL_COMMAND_CHANGED")
  for (const expected of accepted.captured_parent_edges) {
    const bytes = object(v.captures)[expected.case]
    if (typeof bytes !== "string" || hash(bytes) !== expected.original_cleanup_sha256) {
      missing.push(`ORIGINAL_PARENT_EDGE_CHANGED:${expected.case}`)
      continue
    }
    const proof = (JSON.parse(bytes) as { processes: ProcessCleanup }).processes
    missing.push(...validateCapturedLineage(proof, lab57CleanupScope.acquiredAt))
    const launcher = proof.processes.find(p => p.pid === proof.launcher?.pid)
    if (!launcher || Object.entries(expected.launcher).some(([key, value]) => launcher[key as keyof typeof launcher] !== value) ||
      launcher.parent !== 2126565 || BigInt(launcher.starttime) <= 99114278n) missing.push(`ORIGINAL_PARENT_EDGE_UNKNOWN:${expected.case}`)
  }
  return { status: missing.length ? "ORIGINAL_GUARD_PROVENANCE_REFUSED" : "ORIGINAL_GUARD_PROVENANCE_VERIFIED",
    applied: false, originalParentCapture: "NOT_PRESENT", originalHarnessAdmission: "NOT_PRESENT",
    serverCessation: "UNPROVEN", cleanup: "UNCONFIRMED", missing: [...new Set(missing)] }
}
