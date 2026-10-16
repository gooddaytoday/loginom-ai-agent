import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import path from "node:path"
import os from "node:os"
import { evaluateHandoff, type HandoffState } from "../src/evaler-handoff"

const sha = "a".repeat(40)
const next = "b".repeat(40)
const state = {
  issue_id: "LAB-16", phase: "rich" as const, base_sha: sha, frozen_sha: null,
  executor: "Rich" as const, review_cycle: 0, reject_count: 0, processed_report_ids: [],
  last_dispatch: { id: "dispatch-rich", phase: "rich" as const, sha, root_trigger: "owner-1", task_id: "rich-task", outcome: "queued" as const },
}
const report = {
  kind: "report" as const, id: "rich-ready", issue_id: "LAB-16", task_id: "rich-task", phase: "rich" as const,
  actual_sha: next, status: "READY_FOR_BEN" as const,
  evidence: { attachment_id: "bundle-rich", manifest_sha256: "c".repeat(64), checked_sha: next,
    validation: "confirmed" as const, cleanup: "confirmed" as const, product: "FAIL" as const },
}

test("Rich's verified frozen SHA becomes the independent review target", () => {
  const result = evaluateHandoff({ state, event: report, pending_tasks: [] })
  expect(result.action).toBe("ready_to_dispatch")
  expect(result.target).toBe("Ben")
  expect(result.state.frozen_sha).toBe(next)
  expect(result.state.review_cycle).toBe(0)
})

test("replaying READY does not dispatch Ben or increment the review cycle twice", () => {
  const accepted = evaluateHandoff({ state, event: report, pending_tasks: [] })
  const replay = evaluateHandoff({ state: accepted.state, event: report, pending_tasks: [] })
  expect(replay.action).toBe("no_action")
  expect(replay.state).toEqual(accepted.state)
  expect(replay.target).toBeUndefined()
})

function reviewing() {
  const ready = evaluateHandoff({ state, event: report, pending_tasks: [] }).state
  const proposed = evaluateHandoff({ state: ready, event: { kind: "dispatch", id: "dispatch-ben", root_trigger: "rich-ready" }, pending_tasks: [] }).state
  return evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: "dispatch-ben", outcome: "queued", task_id: "ben-task" }, pending_tasks: [] }).state
}
const verdict = { ...report, id: "ben-verdict", task_id: "ben-task", phase: "ben" as const, status: "ACCEPT" as const }

test("quality ACCEPT with independently confirmed product FAIL goes to human review", () => {
  const result = evaluateHandoff({ state: reviewing(), event: verdict, pending_tasks: [] })
  expect(result.action).toBe("in_review")
  expect(result.reason).toBe("ACCEPT; product FAIL")
  expect(result.state.phase).toBe("in_review")
  expect(result.state.executor).toBeNull()
})

test("a review of another SHA leaves the frozen target unchanged", () => {
  const current = reviewing()
  const result = evaluateHandoff({ state: current, event: { ...verdict, actual_sha: sha }, pending_tasks: [] })
  expect(result.action).toBe("no_action")
  expect(result.state).toEqual(current)
  expect(result.reason).toContain("stale")
})

test("a worker report must belong to the current issue, task and phase", () => {
  for (const event of [ { ...report, issue_id: "LAB-17" }, { ...report, task_id: "old-rich-task" }, { ...report, phase: "ben" as const } ]) {
    const result = evaluateHandoff({ state, event, pending_tasks: [] })
    expect(result.action).toBe("no_action")
    expect(result.state).toEqual(state)
  }
})

test("unknown cleanup and unverified results block handoff", () => {
  for (const evidence of [ { ...report.evidence, cleanup: "unknown" as const }, { ...report.evidence, checked_sha: sha },
    { ...report.evidence, validation: "unconfirmed" as const }, { ...report.evidence, product: "ERROR" as const } ]) {
    const result = evaluateHandoff({ state, event: { ...report, evidence }, pending_tasks: [] })
    expect(result.action).toBe("blocked")
    expect(result.state.phase).toBe("blocked")
    expect(result.state.frozen_sha).toBeNull()
  }
})

test("default rework limit stops the second fresh REJECT for Evaler without spending duplicates", () => {
  const reject = { ...verdict, status: "REJECT" as const }
  const first = evaluateHandoff({ state: reviewing(), event: reject, pending_tasks: [] })
  expect(first.action).toBe("ready_to_dispatch")
  expect(first.target).toBe("Rich")
  expect(first.state.reject_count).toBe(1)
  const replay = evaluateHandoff({ state: first.state, event: reject, pending_tasks: [] })
  expect(replay.action).toBe("no_action")
  expect(replay.state.reject_count).toBe(1)
  const second = evaluateHandoff({ state: { ...reviewing(), reject_count: 1, review_cycle: 2 },
    event: { ...reject, id: "second-verdict" }, pending_tasks: [] })
  expect(second.action).toBe("blocked")
  expect(second.state.phase).toBe("blocked")
  expect(second.reason).toBe("EVALER_DECISION_REQUIRED: rework limit reached")
  expect(second.state.reject_count).toBe(2)
})

test("accepted dispatch receipts and pending matching tasks never route the same stage twice", () => {
  for (const outcome of ["queued", "coalesced", "deferred"] as const) {
    const current = { ...state, last_dispatch: { ...state.last_dispatch, outcome } }
    expect(evaluateHandoff({ state: current, event: { kind: "dispatch", id: "retry", root_trigger: "owner-1" }, pending_tasks: [] }).reason).toBe("dispatch already accepted")
  }
  expect(evaluateHandoff({ state: { ...state, last_dispatch: null }, event: { kind: "dispatch", id: "new", root_trigger: "owner-1" },
    pending_tasks: [{ issue_id: "LAB-16", phase: "rich", sha, task_id: "already-running" }] }).reason).toBe("matching task pending")
})

test("a new dispatch proposal becomes ambiguous until an authoritative receipt is read", () => {
  const proposed = evaluateHandoff({ state: { ...state, last_dispatch: null }, event: { kind: "dispatch", id: "dispatch-new", root_trigger: "owner-1" }, pending_tasks: [] })
  expect(proposed.action).toBe("dispatch")
  expect(proposed.target).toBe("Rich")
  expect(proposed.state.last_dispatch?.outcome).toBe("ambiguous")
  const retry = evaluateHandoff({ state: proposed.state, event: { kind: "dispatch", id: "second", root_trigger: "owner-1" }, pending_tasks: [] })
  expect(retry.action).toBe("blocked")
  expect(retry.reason).toContain("readback")
})

test("only a receipt for the proposed dispatch resolves its routing uncertainty", () => {
  const proposed = evaluateHandoff({ state: { ...state, last_dispatch: null }, event: { kind: "dispatch", id: "dispatch-new", root_trigger: "owner-1" }, pending_tasks: [] }).state
  const wrong = evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: "other", outcome: "queued", task_id: "new-task" }, pending_tasks: [] })
  expect(wrong.action).toBe("no_action")
  expect(wrong.state.last_dispatch?.outcome).toBe("ambiguous")
  const correct = evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: "dispatch-new", outcome: "coalesced", task_id: "new-task" }, pending_tasks: [] })
  expect(correct.action).toBe("no_action")
  expect(correct.state.last_dispatch?.task_id).toBe("new-task")
  expect(evaluateHandoff({ state: correct.state, event: { kind: "dispatch", id: "retry", root_trigger: "owner-1" }, pending_tasks: [] }).reason).toBe("dispatch already accepted")
})

test("infrastructure BLOCKED and reports with the wrong role status cannot advance", () => {
  const blocked = evaluateHandoff({ state, event: { ...report, status: "BLOCKED" }, pending_tasks: [] })
  expect(blocked.action).toBe("blocked")
  expect(blocked.state.phase).toBe("blocked")
  expect(evaluateHandoff({ state, event: { ...report, status: "ACCEPT" }, pending_tasks: [] }).action).toBe("blocked")
  expect(evaluateHandoff({ state: reviewing(), event: { ...verdict, status: "READY_FOR_BEN" }, pending_tasks: [] }).action).toBe("blocked")
})

test("Rich corrections must produce a new frozen SHA", () => {
  const current = { ...state, frozen_sha: next, reject_count: 1, review_cycle: 1,
    last_dispatch: { ...state.last_dispatch, sha: next } }
  const result = evaluateHandoff({ state: current, event: report, pending_tasks: [] })
  expect(result.action).toBe("blocked")
  expect(result.reason).toContain("new SHA")
  expect(result.state.frozen_sha).toBe(next)
})

test("malformed input and unknown statuses fail closed with a safe validation error", () => {
  for (const invalid of [null, {}, { state, event: { ...report, status: "DONE" }, pending_tasks: [] },
    { state: { ...state, executor: "Ben" }, event: report, pending_tasks: [] }, { state, event: report, pending_tasks: null } ])
    expect(() => evaluateHandoff(invalid)).toThrow("invalid handoff input")
})

test("another pending phase prevents a new stand task without waiting", () => {
  const result = evaluateHandoff({ state: { ...state, last_dispatch: null }, event: { kind: "dispatch", id: "new", root_trigger: "owner-1" },
    pending_tasks: [{ issue_id: "LAB-30", phase: "ben", sha: next, task_id: "foreign" }] })
  expect(result.action).toBe("blocked")
  expect(result.reason).toContain("another task")
})


test("offline CLI prints a proposal without rewriting input or echoing unknown keys", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evaler-handoff-"))
  try {
    const filename = path.join(directory, "input.json")
    const source = JSON.stringify({ state: { ...state, private_secret: "must-not-echo" }, event: report, pending_tasks: [] })
    await Bun.write(filename, source)
    const child = Bun.spawn([process.execPath, path.resolve("script/evaler-handoff.ts"), filename], { stdout: "pipe", stderr: "pipe" })
    const output = await new Response(child.stdout).text()
    expect(await child.exited).toBe(0)
    expect(JSON.parse(output).action).toBe("ready_to_dispatch")
    expect(output).not.toContain("must-not-echo")
    expect(await Bun.file(filename).text()).toBe(source)
    await Bun.write(filename, "{invalid-private-secret")
    const bad = Bun.spawn([process.execPath, path.resolve("script/evaler-handoff.ts"), filename], { stdout: "pipe", stderr: "pipe" })
    const error = await new Response(bad.stdout).text()
    expect(await bad.exited).toBe(2)
    expect(JSON.parse(error).action).toBe("blocked")
    expect(error).not.toContain("private-secret")
  } finally { await rm(directory, { recursive: true, force: true }) }
})

test("assignment dispatch can omit a native parent comment", () => {
  const result = evaluateHandoff({ state: { ...state, last_dispatch: null }, event: { kind: "dispatch", id: "assignment-intent", root_trigger: null }, pending_tasks: [] })
  expect(result.action).toBe("dispatch")
  expect(result.state.last_dispatch?.root_trigger).toBeNull()
})

test("accepted routing cannot be downgraded or rebound by a conflicting receipt", () => {
  for (const event of [ { kind: "receipt" as const, dispatch_id: "dispatch-rich", outcome: "not_queued" as const, task_id: null },
    { kind: "receipt" as const, dispatch_id: "dispatch-rich", outcome: "ambiguous" as const, task_id: null },
    { kind: "receipt" as const, dispatch_id: "dispatch-rich", outcome: "coalesced" as const, task_id: "rich-task" },
    { kind: "receipt" as const, dispatch_id: "dispatch-rich", outcome: "queued" as const, task_id: "wrong-task" } ]) {
    const result = evaluateHandoff({ state, event, pending_tasks: [] })
    expect(result.action).toBe("blocked")
    expect(result.reason).toContain("readback")
    expect(result.state).toEqual(state)
    expect(evaluateHandoff({ state: result.state, event: { kind: "dispatch", id: "unsafe-retry", root_trigger: "owner-1" }, pending_tasks: [] }).action).toBe("no_action")
  }
})


test("a review cycle is counted once when Ben's dispatch is accepted", () => {
  const ready = evaluateHandoff({ state, event: report, pending_tasks: [] }).state
  const proposed = evaluateHandoff({ state: ready, event: { kind: "dispatch", id: "ben-intent", root_trigger: "rich-ready" }, pending_tasks: [] }).state
  expect(proposed.review_cycle).toBe(0)
  const uncertain = evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: "ben-intent", outcome: "ambiguous", task_id: null }, pending_tasks: [] }).state
  expect(uncertain.review_cycle).toBe(0)
  const event = { kind: "receipt" as const, dispatch_id: "ben-intent", outcome: "queued" as const, task_id: "ben-task" }
  const accepted = evaluateHandoff({ state: uncertain, event, pending_tasks: [] }).state
  expect(accepted.review_cycle).toBe(1)
  const replay = evaluateHandoff({ state: accepted, event, pending_tasks: [] })
  expect(replay.action).toBe("no_action")
  expect(replay.state).toEqual(accepted)
  expect(replay.state.review_cycle).toBe(1)
})


test("incomplete READY returns to Rich for delivery without spending a review or reject", () => {
  const current = { ...state, frozen_sha: sha, reject_count: 1, review_cycle: 1 }
  const incomplete = { ...report, evidence: { ...report.evidence, attachment_id: "" } }
  const missing = evaluateHandoff({ state: current, event: incomplete, pending_tasks: [] })
  expect(missing.action).toBe("ready_to_dispatch")
  expect(missing.target).toBe("Rich")
  expect(missing.reason).toContain("DELIVERABLES_REQUIRED")
  expect(missing.state.frozen_sha).toBe(sha)
  expect(missing.state.delivery_sha).toBe(next)
  expect(missing.state.review_cycle).toBe(1)
  expect(missing.state.reject_count).toBe(1)
  expect(missing.state.last_dispatch).toBeNull()
  expect(evaluateHandoff({ state: missing.state, event: incomplete, pending_tasks: [] }).action).toBe("no_action")
  const dispatch = evaluateHandoff({ state: missing.state, event: { kind: "dispatch", id: "completion", root_trigger: "rich-ready" }, pending_tasks: [] }).state
  expect(dispatch.last_dispatch?.sha).toBe(next)
  const receipt = evaluateHandoff({ state: dispatch, event: { kind: "receipt", dispatch_id: "completion", outcome: "queued", task_id: "completion-task" }, pending_tasks: [] }).state
  const corrected = evaluateHandoff({ state: receipt, event: { ...report, id: "delivered", task_id: "completion-task" }, pending_tasks: [] })
  expect(corrected.action).toBe("ready_to_dispatch")
  expect(corrected.target).toBe("Ben")
  expect(corrected.state.frozen_sha).toBe(next)
  expect(corrected.state.delivery_sha).toBeNull()
  expect(corrected.state.review_cycle).toBe(1)
  expect(corrected.state.reject_count).toBe(1)
})


test("delivery completion never loops or masks unknown cleanup", () => {
  const missing = evaluateHandoff({ state, event: { ...report, evidence: { ...report.evidence, manifest_sha256: "missing" } }, pending_tasks: [] }).state
  const proposed = evaluateHandoff({ state: missing, event: { kind: "dispatch", id: "completion", root_trigger: "rich-ready" }, pending_tasks: [] }).state
  const current = evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: "completion", outcome: "queued", task_id: "completion-task" }, pending_tasks: [] }).state
  const incomplete = evaluateHandoff({ state: current, event: { ...report, id: "missing-again", task_id: "completion-task", evidence: { ...report.evidence, attachment_id: "" } }, pending_tasks: [] })
  expect(incomplete.action).toBe("blocked")
  expect(incomplete.reason).toContain("EVALER_DECISION_REQUIRED")
  expect(incomplete.state.reject_count).toBe(0)
  expect(incomplete.state.review_cycle).toBe(0)
  const cleanup = evaluateHandoff({ state, event: { ...report, evidence: { ...report.evidence, attachment_id: "", cleanup: "unknown" } }, pending_tasks: [] })
  expect(cleanup.action).toBe("blocked")
  expect(cleanup.state.delivery_sha).toBeUndefined()
})

test("all accepted Ben outcomes count once and task enrichment does not recount", () => {
  for (const outcome of ["queued", "coalesced", "deferred"] as const) {
    const ready = evaluateHandoff({ state, event: report, pending_tasks: [] }).state
    const proposed = evaluateHandoff({ state: ready, event: { kind: "dispatch", id: "ben-intent", root_trigger: "rich-ready" }, pending_tasks: [] }).state
    const accepted = evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: "ben-intent", outcome, task_id: null }, pending_tasks: [] }).state
    expect(accepted.review_cycle).toBe(1)
    const enriched = evaluateHandoff({ state: accepted, event: { kind: "receipt", dispatch_id: "ben-intent", outcome, task_id: "ben-task" }, pending_tasks: [] }).state
    expect(enriched.review_cycle).toBe(1)
    expect(enriched.last_dispatch?.task_id).toBe("ben-task")
    const conflict = evaluateHandoff({ state: enriched, event: { kind: "receipt", dispatch_id: "ben-intent", outcome: "not_queued", task_id: null }, pending_tasks: [] })
    expect(conflict.action).toBe("blocked")
    expect(conflict.state).toEqual(enriched)
  }
})


test('Evaler recovered-author receipt admits exactly one original Ben handoff without changing ERROR',()=>{
 const event={...report,evidence:{...report.evidence,product:'ERROR' as const,
  review_admission:{kind:'recovered_author',resolution_sha256:'d'.repeat(64)}}};
 const before=JSON.stringify(event);
 const decision=evaluateHandoff({state,event,pending_tasks:[]});
 expect(decision.action).toBe('ready_to_dispatch');expect(decision.target).toBe('Ben');
 expect(JSON.stringify(event)).toBe(before);
 expect(evaluateHandoff({state:decision.state,event,pending_tasks:[]}).action).toBe('no_action');
});


test('recovered author admission cannot waive incomplete evidence stale SHA cleanup or Ben ERROR',()=>{
 const evidence={...report.evidence,product:'ERROR',review_admission:{kind:'recovered_author',resolution_sha256:'d'.repeat(64)}};
 for(const fault of [{...evidence,attachment_id:''},{...evidence,manifest_sha256:''},{...evidence,checked_sha:sha},
  {...evidence,cleanup:'unknown'},{...evidence,validation:'unconfirmed'}]) {
  expect(evaluateHandoff({state,event:{...report,evidence:fault},pending_tasks:[]}).action).toBe('blocked');
 }
 expect(evaluateHandoff({state:reviewing(),event:{...verdict,evidence},pending_tasks:[]}).action).toBe('blocked');
 for(const resolution_sha256 of ['', 'bad', 'F'.repeat(64)])expect(()=>evaluateHandoff({state,event:{...report,evidence:{...evidence,
  review_admission:{kind:'recovered_author',resolution_sha256}}},pending_tasks:[]})).toThrow('invalid handoff input');
});

test("a series can allow three automatic reworks and stop its fourth fresh REJECT", () => {
  for (const reject_count of [0, 1, 2, 3]) {
    const current = { ...reviewing(), rework_limit: 3, reject_count, review_cycle: reject_count + 1 }
    const event = { ...verdict, id: `reject-${reject_count + 1}`, status: "REJECT" as const }
    const result = evaluateHandoff({ state: current, event, pending_tasks: [] })
    expect(result.action).toBe(reject_count < 3 ? "ready_to_dispatch" : "blocked")
    expect(result.state.reject_count).toBe(reject_count + 1)
    expect(result.state.rework_limit).toBe(3)
    expect(result.state.review_cycle).toBe(current.review_cycle)
    expect(evaluateHandoff({ state: result.state, event, pending_tasks: [] }).state).toEqual(result.state)
  }
})

test("a blocked worker report retains its cause and actual SHA without changing the input", () => {
  const current = { ...state, review_cycle: 2, reject_count: 1, rework_limit: 3 }
  const event = { ...report, status: "BLOCKED" as const }
  const input = { state: current, event, pending_tasks: [] }
  const original = JSON.stringify(input)
  const result = evaluateHandoff(input)
  expect(result.action).toBe("blocked")
  expect(result.state.blocked_context).toEqual({ reason: result.reason, report_id: event.id, sha: next, cleanup_required: false })
  expect(result.state.processed_report_ids).toEqual([event.id])
  expect(result.state.review_cycle).toBe(2)
  expect(result.state.reject_count).toBe(1)
  expect(JSON.stringify(input)).toBe(original)
})

test("Evaler's bound decision resumes the stopped worker without resetting counters", () => {
  const stopped = evaluateHandoff({ state: { ...state, review_cycle: 2, reject_count: 1, rework_limit: 3 },
    event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state
  const event = { kind: "continue_after_evaler", id: "evaler-decision", issue_id: state.issue_id,
    report_id: report.id, sha: next, target: "Rich" }
  const result = evaluateHandoff({ state: stopped, event, pending_tasks: [] })
  expect(result.action).toBe("ready_to_dispatch")
  expect(result.target).toBe("Rich")
  expect(result.state.phase).toBe("rich")
  expect(result.state.executor).toBe("Rich")
  expect(result.state.blocked_context).toBeUndefined()
  expect(result.state.last_dispatch).toBeNull()
  expect(result.state.base_sha).toBe(sha)
  expect(result.state.frozen_sha).toBeNull()
  expect(result.state.reject_count).toBe(1)
  expect(result.state.review_cycle).toBe(2)
  expect(result.state.rework_limit).toBe(3)
  expect(result.state.processed_report_ids).toEqual([report.id, event.id])
})

test("cleanup unknown requires a verified free and healthy stand before continuation", () => {
  for (const evidence of [undefined, { ...report.evidence, cleanup: "unknown" as const }]) {
    const stopped = evaluateHandoff({ state, event: { ...report, status: "BLOCKED", evidence }, pending_tasks: [] }).state
    expect(stopped.blocked_context?.cleanup_required).toBe(true)
    const event = { kind: "continue_after_evaler", id: "cleanup-decision", issue_id: state.issue_id,
      report_id: report.id, sha: next, target: "Rich" }
    for (const stand_ready of [undefined, false]) {
      const result = evaluateHandoff({ state: stopped, event: { ...event, stand_ready }, pending_tasks: [] })
      expect(result.action).toBe("blocked")
      expect(result.state).toEqual(stopped)
    }
    expect(evaluateHandoff({ state: stopped, event: { ...event, stand_ready: true }, pending_tasks: [] }).action).toBe("ready_to_dispatch")
  }
})

test("Ben can resume only an already frozen SHA, never unfinished Rich work", () => {
  const event = { kind: "continue_after_evaler", id: "ben-decision", issue_id: state.issue_id,
    report_id: report.id, sha: next, target: "Ben" }
  for (const frozen_sha of [null, sha]) {
    const stopped = evaluateHandoff({ state: { ...state, frozen_sha }, event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state
    const result = evaluateHandoff({ state: stopped, event, pending_tasks: [] })
    expect(result.action).toBe("no_action")
    expect(result.state).toEqual(stopped)
  }
  const stopped = evaluateHandoff({ state: reviewing(), event: { ...verdict, status: "BLOCKED" }, pending_tasks: [] }).state
  const result = evaluateHandoff({ state: stopped, event: { ...event, report_id: verdict.id }, pending_tasks: [] })
  expect(result.action).toBe("ready_to_dispatch")
  expect(result.target).toBe("Ben")
  expect(result.state.frozen_sha).toBe(next)
  expect(result.state.review_cycle).toBe(stopped.review_cycle)
})

test("continuation dispatches Rich's stopped SHA once and clears it before handing a new SHA to Ben", () => {
  const stopped = evaluateHandoff({ state, event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state
  const decision = { kind: "continue_after_evaler", id: "resume-author", issue_id: state.issue_id,
    report_id: report.id, sha: next, target: "Rich" }
  const resumed = evaluateHandoff({ state: stopped, event: decision, pending_tasks: [] }).state
  const event = { kind: "dispatch", id: "resumed-dispatch", root_trigger: decision.id }
  const proposed = evaluateHandoff({ state: resumed, event, pending_tasks: [] }).state
  expect(proposed.last_dispatch?.sha).toBe(next)
  const accepted = evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: event.id,
    outcome: "queued", task_id: "resumed-rich-task" }, pending_tasks: [] }).state
  expect(accepted.resume_sha).toBe(next)
  expect(evaluateHandoff({ state: accepted, event: decision, pending_tasks: [] }).state).toEqual(accepted)
  expect(evaluateHandoff({ state: accepted, event: { ...event, id: "duplicate-dispatch" }, pending_tasks: [] }).action).toBe("no_action")
  const final = "d".repeat(40)
  const completed = evaluateHandoff({ state: accepted, event: { ...report, id: "resumed-ready", task_id: "resumed-rich-task",
    actual_sha: final, evidence: { ...report.evidence, checked_sha: final } }, pending_tasks: [] }).state
  expect(completed.resume_sha).toBeUndefined()
  expect(completed.frozen_sha).toBe(final)
  const review = evaluateHandoff({ state: completed, event: { kind: "dispatch", id: "fresh-ben", root_trigger: "resumed-ready" }, pending_tasks: [] })
  expect(review.state.last_dispatch?.sha).toBe(final)
  expect(evaluateHandoff({ state: completed, event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state).toEqual(completed)
})

test("malformed continuation state cannot redirect Ben or carry a stop into a runnable phase", () => {
  const stopped = evaluateHandoff({ state, event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state
  const dispatch = { kind: "dispatch", id: "invalid-state", root_trigger: null }
  for (const current of [
    { ...reviewing(), resume_sha: sha },
    { ...stopped, resume_sha: next },
    { ...state, blocked_context: stopped.blocked_context },
    { ...stopped, executor: "Rich" },
  ]) expect(() => evaluateHandoff({ state: current, event: dispatch, pending_tasks: [] })).toThrow("invalid handoff input")
})

function acceptedDispatch(current: HandoffState, id: string, task_id: string) {
  const proposed = evaluateHandoff({ state: current, event: { kind: "dispatch", id, root_trigger: null }, pending_tasks: [] }).state
  return evaluateHandoff({ state: proposed, event: { kind: "receipt", dispatch_id: id, outcome: "queued", task_id }, pending_tasks: [] }).state
}

test("stale decisions cannot resume another issue, another stop, or completed work", () => {
  const stopped = evaluateHandoff({ state, event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state
  const event = { kind: "continue_after_evaler", id: "decision", issue_id: state.issue_id, report_id: report.id, sha: next, target: "Rich" }
  for (const wrong of [{ ...event, issue_id: "LAB-OTHER" }, { ...event, report_id: "old-stop" }, { ...event, sha }]) {
    const result = evaluateHandoff({ state: stopped, event: wrong, pending_tasks: [] })
    expect(result.action).toBe("no_action")
    expect(result.state).toEqual(stopped)
  }
  const accepted = evaluateHandoff({ state: reviewing(), event: verdict, pending_tasks: [] }).state
  for (const current of [state, reviewing(), accepted, { ...state, phase: "admission" as const, executor: null },
    { ...stopped, blocked_context: undefined }]) {
    const result = evaluateHandoff({ state: current, event, pending_tasks: [] })
    expect(result.action).toBe("no_action")
    expect(result.state).toEqual(current)
  }
})

test("a resumed worker still respects the stand queue and ignores old routing receipts", () => {
  const stopped = evaluateHandoff({ state, event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state
  const resumed = evaluateHandoff({ state: stopped, event: { kind: "continue_after_evaler", id: "resume",
    issue_id: state.issue_id, report_id: report.id, sha: next, target: "Rich" }, pending_tasks: [] }).state
  const event = { kind: "dispatch", id: "resume-dispatch", root_trigger: null }
  const matching = evaluateHandoff({ state: resumed, event,
    pending_tasks: [{ issue_id: state.issue_id, phase: "rich", sha: next, task_id: "already-queued" }] })
  expect(matching.reason).toBe("matching task pending")
  expect(matching.state).toEqual(resumed)
  const foreign = evaluateHandoff({ state: resumed, event,
    pending_tasks: [{ issue_id: "OTHER", phase: "ben", sha, task_id: "foreign" }] })
  expect(foreign.action).toBe("blocked")
  expect(foreign.state).toEqual(resumed)
  expect(evaluateHandoff({ state: resumed, event: { kind: "receipt", dispatch_id: "dispatch-rich",
    outcome: "queued", task_id: "rich-task" }, pending_tasks: [] }).state).toEqual(resumed)
})

test("an Evaler decision after the fourth REJECT does not replenish automatic reworks", () => {
  const stopped = evaluateHandoff({ state: { ...reviewing(), rework_limit: 3, reject_count: 3, review_cycle: 4 },
    event: { ...verdict, id: "fourth-reject", status: "REJECT" }, pending_tasks: [] }).state
  const event = { kind: "continue_after_evaler", id: "decision-after-four", issue_id: state.issue_id,
    report_id: "fourth-reject", sha: next, target: "Rich" }
  const resumed = evaluateHandoff({ state: stopped, event, pending_tasks: [] }).state
  expect(resumed.reject_count).toBe(4)
  expect(resumed.review_cycle).toBe(4)
  expect(resumed.rework_limit).toBe(3)
  const author = acceptedDispatch(resumed, "author-after-four", "author-after-four-task")
  const actual_sha = "d".repeat(40)
  const ready = evaluateHandoff({ state: author, event: { ...report, id: "ready-after-four", task_id: "author-after-four-task",
    actual_sha, evidence: { ...report.evidence, checked_sha: actual_sha } }, pending_tasks: [] }).state
  const reviewer = acceptedDispatch(ready, "ben-after-four", "ben-after-four-task")
  const rejected = evaluateHandoff({ state: reviewer, event: { ...verdict, id: "fifth-reject", status: "REJECT",
    task_id: "ben-after-four-task", actual_sha, evidence: { ...report.evidence, checked_sha: actual_sha } }, pending_tasks: [] })
  expect(rejected.action).toBe("blocked")
  expect(rejected.state.reject_count).toBe(5)
  expect(rejected.state.review_cycle).toBe(5)
  expect(evaluateHandoff({ state: rejected.state, event, pending_tasks: [] }).state).toEqual(rejected.state)
})

test("Ben continuation keeps the original evidence checks and never converts product ERROR to ACCEPT", () => {
  const stopped = evaluateHandoff({ state: reviewing(), event: { ...verdict, status: "BLOCKED",
    evidence: { ...verdict.evidence, product: "ERROR", cleanup: "unknown" } }, pending_tasks: [] }).state
  const resumed = evaluateHandoff({ state: stopped, event: { kind: "continue_after_evaler", id: "resume-review",
    issue_id: state.issue_id, report_id: verdict.id, sha: next, target: "Ben", stand_ready: true }, pending_tasks: [] }).state
  expect(resumed.review_cycle).toBe(stopped.review_cycle)
  const current = acceptedDispatch(resumed, "continued-ben", "continued-ben-task")
  for (const product of ["ERROR", "FAIL"] as const) {
    const result = evaluateHandoff({ state: current, event: { ...verdict, id: "continued-verdict", task_id: "continued-ben-task",
      evidence: { ...verdict.evidence, product } }, pending_tasks: [] })
    expect(result.action).toBe(product === "ERROR" ? "blocked" : "in_review")
    expect(result.state.resume_sha).toBeUndefined()
    expect(result.state.reject_count).toBe(stopped.reject_count)
  }
})

test("only the current worker report consumes resume SHA, including a new stop or incomplete delivery", () => {
  const current = { ...state, resume_sha: next }
  const stale = evaluateHandoff({ state: current, event: { ...report, task_id: "stale-task" }, pending_tasks: [] })
  expect(stale.state.resume_sha).toBe(next)
  for (const event of [{ ...report, status: "BLOCKED" }, { ...report, status: "ACCEPT" },
    { ...report, evidence: { ...report.evidence, cleanup: "unknown" } },
    { ...report, evidence: { ...report.evidence, attachment_id: "" } }]) {
    const result = evaluateHandoff({ state: current, event, pending_tasks: [] })
    expect(result.state.resume_sha).toBeUndefined()
    expect(result.state.processed_report_ids).toContain(report.id)
  }
})

test("new state and decision fields reject malformed values instead of dropping them", () => {
  for (const rework_limit of [-1, 0.5, "3", null, Number.MAX_SAFE_INTEGER + 1])
    expect(() => evaluateHandoff({ state: { ...state, rework_limit }, event: report, pending_tasks: [] })).toThrow("invalid handoff input")
  const zero = evaluateHandoff({ state: { ...reviewing(), rework_limit: 0 }, event: { ...verdict, status: "REJECT" }, pending_tasks: [] })
  expect(zero.action).toBe("blocked")
  const stopped = evaluateHandoff({ state, event: { ...report, status: "BLOCKED" }, pending_tasks: [] }).state
  for (const blocked_context of [{ ...stopped.blocked_context, sha: "bad" }, { ...stopped.blocked_context, cleanup_required: "false" },
    { ...stopped.blocked_context, report_id: "" }, { ...stopped.blocked_context, reason: "" }])
    expect(() => evaluateHandoff({ state: { ...stopped, blocked_context }, event: { kind: "dispatch", id: "invalid", root_trigger: null }, pending_tasks: [] })).toThrow("invalid handoff input")
  for (const stand_ready of ["true", null, 1])
    expect(() => evaluateHandoff({ state: stopped, event: { kind: "continue_after_evaler", id: "invalid",
      issue_id: state.issue_id, report_id: report.id, sha: next, target: "Rich", stand_ready }, pending_tasks: [] })).toThrow("invalid handoff input")
})

test("offline CLI continues a bound stop without rewriting its input or exposing extra context", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "evaler-continuation-"))
  try {
    const filename = path.join(directory, "input.json")
    const stopped = evaluateHandoff({ state, event: { ...report, status: "BLOCKED", evidence: undefined }, pending_tasks: [] }).state
    for (const stand_ready of [false, true]) {
      const source = JSON.stringify({ state: { ...stopped, blocked_context: { ...stopped.blocked_context, private_secret: "must-not-echo" } },
        event: { kind: "continue_after_evaler", id: "cli-decision", issue_id: state.issue_id, report_id: report.id, sha: next, target: "Rich", stand_ready }, pending_tasks: [] })
      await Bun.write(filename, source)
      const child = Bun.spawn([process.execPath, path.resolve("script/evaler-handoff.ts"), filename], { stdout: "pipe", stderr: "pipe" })
      const output = await new Response(child.stdout).text()
      expect(await child.exited).toBe(stand_ready ? 0 : 2)
      expect(JSON.parse(output).action).toBe(stand_ready ? "ready_to_dispatch" : "blocked")
      expect(output).not.toContain("must-not-echo")
      expect(await Bun.file(filename).text()).toBe(source)
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
