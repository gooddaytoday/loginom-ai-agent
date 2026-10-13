export type Job = { index: number; taskId: string; attempt: number }

export function buildJobs(taskIds: string[], repeat: number): Job[] {
  return Array.from({ length: repeat }, (_, round) => taskIds.map((taskId, index) => ({ index: round * taskIds.length + index, taskId, attempt: round + 1 }))).flat()
}

export async function runSlotQueue<T>(input: {
  jobs: Job[]; slots: string[]; signal: AbortSignal
  execute(slotId: string, job: Job): Promise<{ result: T; quarantine: boolean }>
}) {
  const results: { job: Job; slotId: string; result: T }[] = []
  const quarantined: string[] = []
  let next = 0
  let failed = false
  const drains = await Promise.allSettled(input.slots.map(async slotId => {
    try {
      while (next < input.jobs.length && !input.signal.aborted && !failed) {
        const job = input.jobs[next++]!
        const completed = await input.execute(slotId, job)
        results[job.index] = { job, slotId, result: completed.result }
        if (completed.quarantine) { quarantined.push(slotId); return }
      }
    } catch (error) { failed = true; throw error }
  }))
  const errors = drains.flatMap(result => result.status === "rejected" ? [result.reason] : [])
  if (errors.length) throw new AggregateError(errors, "Slot pipeline failed")
  return { results: results.filter(row => row !== undefined), quarantined, unassigned: input.jobs.slice(next) }
}
