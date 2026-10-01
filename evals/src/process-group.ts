import { EvalFailure } from "./fail"

export async function groupProcesses(group: number) {
  const listed = await Bun.$`ps -eo pid=,pgid=,stat=`.quiet().nothrow()
  if (listed.exitCode !== 0) throw new EvalFailure("Не удалось проверить группу процессов eval", 2)
  return listed.text().split("\n").flatMap((line) => {
    const [pid, pgid, state] = line.trim().split(/\s+/)
    return Number(pgid) === group && !state?.startsWith("Z") ? [Number(pid)] : []
  })
}

export function signalGroup(group: number, signal: NodeJS.Signals) {
  try { process.kill(-group, signal) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error
  }
}

export async function stopGroup(group: number) {
  signalGroup(group, "SIGTERM")
  const deadline = Date.now() + 5_000
  while ((await groupProcesses(group)).length) {
    if (Date.now() >= deadline) {
      signalGroup(group, "SIGKILL")
      await Bun.sleep(100)
      if ((await groupProcesses(group)).length) throw new EvalFailure(`Группа eval ${group} не завершилась`, 1)
      return
    }
    await Bun.sleep(50)
  }
}
