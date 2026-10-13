import { expect, test } from "bun:test"
import { buildJobs, runSlotQueue } from "../src/scheduler"

test("slot queue: jobs retain the exact round-major order", () => {
  expect(buildJobs(["slow", "fast"], 2)).toEqual([
    { index: 0, taskId: "slow", attempt: 1 },
    { index: 1, taskId: "fast", attempt: 1 },
    { index: 2, taskId: "slow", attempt: 2 },
    { index: 3, taskId: "fast", attempt: 2 },
  ])
})

test("slot queue: an available slot starts the next round before another pipeline finishes", async () => {
  const slow = Promise.withResolvers<void>()
  const nextRound = Promise.withResolvers<void>()
  const starts: string[] = []
  const pending = runSlotQueue({ jobs: buildJobs(["slow", "fast"], 2), slots: ["a", "b"], signal: new AbortController().signal,
    async execute(slotId, job) {
      starts.push(`${slotId}:${job.taskId}:${job.attempt}`)
      if (job.index === 0) await slow.promise
      if (job.index === 3) nextRound.resolve()
      return { result: job.index, quarantine: false }
    },
  })
  try {
    await nextRound.promise
    expect(starts).toEqual(["a:slow:1", "b:fast:1", "b:slow:2", "b:fast:2"])
    slow.resolve()
    expect(await pending).toEqual({
      results: [0, 1, 2, 3].map(index => ({ job: buildJobs(["slow", "fast"], 2)[index]!, slotId: index === 0 ? "a" : "b", result: index })),
      quarantined: [], unassigned: [],
    })
  } finally { slow.resolve(); await pending }
})

test("slot queue: a quarantined slot stops while the healthy slot drains the shared queue", async () => {
  const starts: string[] = []
  const run = await runSlotQueue({ jobs: buildJobs(["task"], 4), slots: ["a", "b"], signal: new AbortController().signal,
    async execute(slotId, job) {
      starts.push(`${slotId}:${job.index}`)
      return { result: job.index, quarantine: slotId === "a" }
    },
  })
  expect(starts).toEqual(["a:0", "b:1", "b:2", "b:3"])
  expect(run.quarantined).toEqual(["a"])
  expect(run.results.map(row => [row.slotId, row.result])).toEqual([["a", 0], ["b", 1], ["b", 2], ["b", 3]])
  expect(run.unassigned).toEqual([])
})

test("slot queue: abort stops assignments and still drains every active pipeline", async () => {
  const abort = new AbortController()
  const bothStarted = Promise.withResolvers<void>()
  const aborted = Promise.withResolvers<void>()
  const finishB = Promise.withResolvers<void>()
  const starts: number[] = []
  const jobs = buildJobs(["task"], 4)
  const pending = runSlotQueue({ jobs, slots: ["a", "b"], signal: abort.signal,
    async execute(_slotId, job) {
      starts.push(job.index)
      if (job.index === 0) { await bothStarted.promise; abort.abort(); aborted.resolve() }
      if (job.index === 1) { bothStarted.resolve(); await finishB.promise }
      return { result: job.index, quarantine: false }
    },
  })
  try {
    await aborted.promise
    finishB.resolve()
    const run = await pending
    expect(starts).toEqual([0, 1])
    expect(run.results.map(row => row.result)).toEqual([0, 1])
    expect(run.unassigned).toEqual(jobs.slice(2))
    expect(run.quarantined).toEqual([])
  } finally { finishB.resolve(); await pending }
})

test("slot queue: a rejected pipeline stops assignments and waits for the remaining pipeline", async () => {
  const bothStarted = Promise.withResolvers<void>()
  const failed = Promise.withResolvers<void>()
  const finishB = Promise.withResolvers<void>()
  const starts: number[] = []
  const reason = Error("pipeline failure")
  const pending = runSlotQueue({ jobs: buildJobs(["task"], 4), slots: ["a", "b"], signal: new AbortController().signal,
    async execute(_slotId, job) {
      starts.push(job.index)
      if (job.index === 0) { await bothStarted.promise; failed.resolve(); throw reason }
      if (job.index === 1) { bothStarted.resolve(); await finishB.promise }
      return { result: job.index, quarantine: false }
    },
  })
  let settled = false
  void pending.then(() => { settled = true }, () => { settled = true })
  try {
    await failed.promise
    await Bun.sleep(0)
    expect(settled).toBe(false)
    finishB.resolve()
    const error = await pending.then(() => undefined, error => error)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors).toEqual([reason])
    expect(starts).toEqual([0, 1])
  } finally { finishB.resolve(); await pending.catch(() => undefined) }
})

test("slot queue: quarantine of every slot preserves all unassigned jobs", async () => {
  const jobs = buildJobs(["task"], 4)
  const run = await runSlotQueue({ jobs, slots: ["a", "b"], signal: new AbortController().signal,
    async execute(_slotId, job) { return { result: job.index, quarantine: true } },
  })
  expect(run.quarantined).toEqual(["a", "b"])
  expect(run.results.map(row => row.result)).toEqual([0, 1])
  expect(run.unassigned).toEqual(jobs.slice(2))
})

test("slot queue: an already aborted run assigns no jobs", async () => {
  const abort = new AbortController()
  abort.abort()
  const jobs = buildJobs(["task"], 2)
  const starts: number[] = []
  expect(await runSlotQueue({ jobs, slots: ["a", "b"], signal: abort.signal,
    async execute(_slotId, job) { starts.push(job.index); return { result: job.index, quarantine: false } },
  })).toEqual({ results: [], quarantined: [], unassigned: jobs })
  expect(starts).toEqual([])
})

test("slot queue: a cleanly stopped slot is distinct from quarantine and leaves the healthy slot running", async () => {
  const run = await runSlotQueue({ jobs: buildJobs(["task"], 4), slots: ["a", "b"], signal: new AbortController().signal,
    async execute(slotId, job) { return { result: job.index, quarantine: false, stop: slotId === "a" } },
  })
  expect(run.quarantined).toEqual([])
  expect(run.stopped).toEqual(["a"])
  expect(run.results.map(row => [row.slotId, row.result])).toEqual([["a", 0], ["b", 1], ["b", 2], ["b", 3]])
  expect(run.unassigned).toEqual([])
})
