import path from "node:path"

import { EvalFailure } from "./fail"




/** Read-only collector; research controls also use this without cleanup authority. */
export async function serverFileObservation(containerId: string, read = scanServerFiles) {
  if (!/^[a-f0-9]{64}$/.test(containerId)) throw new EvalFailure("SERVER_FILE_CONTAINER_ID", 2)
  for (const attempt of [0, 1, 2]) {
    const startedAt = new Date().toISOString()
    const result = await read(containerId)
    if (result.code === 0) {
      const snapshot = parseSnapshot(containerId, startedAt, new Date().toISOString(), result.output)
      if (snapshot.complete) return snapshot
    }
    if (attempt < 2) await Bun.sleep(100)
  }
  throw new EvalFailure("SERVER_FILE_SCAN_UNCONFIRMED", 2)
}

async function scanServerFiles(containerId: string) {
  const child = Bun.spawn(["docker", "--host", "unix:///var/run/docker.sock", "exec", "-i", containerId,
    "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "sh", "-s"], { stdin: "pipe", stdout: "pipe", stderr: "pipe", timeout: 5000 })
  child.stdin.write(await Bun.file(path.resolve(import.meta.dir, "../fixtures/server-files.sh")).text())
  child.stdin.end()
  const [code, output] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { code, output }
}

function parseSnapshot(containerId: string, startedAt: string, finishedAt: string, output: string) {
  const fields = output.split("\0")
  if (fields.pop() !== "" || fields.length % 6 !== 0) throw new EvalFailure("SERVER_FILE_SCAN_FRAME", 2)
  const rows = Array.from({ length: fields.length / 6 }, (_, index) => fields.slice(index * 6, index * 6 + 6))
  if (rows.some(row => !["B", "P", "F", "E"].includes(row[0]!))) throw new EvalFailure("SERVER_FILE_SCAN_FRAME", 2)
  const before = rows.find(row => row[0] === "B" && row[1] === "before")
  const after = rows.find(row => row[0] === "B" && row[1] === "after")
  if (!before || !after) throw new EvalFailure("SERVER_FILE_SCAN_BOUNDARY", 2)
  if (rows[0] !== before || rows.at(-1) !== after || rows.filter(row => row[0] === "B").length !== 2)
    throw new EvalFailure("SERVER_FILE_SCAN_FRAME", 2)
  const processes = rows.filter(row => row[0] === "P").map(row => ({ pid: Number(row[1]), stat: row[2]!, maps: row[3]!,
    finalStat: rows.find(end => end[0] === "E" && end[1] === row[1])?.[2] }))
  const files = rows.filter(row => row[0] === "F").map(row => ({ pid: Number(row[1]), fd: Number(row[2]),
    target: row[3]!, identity: row[4]!, info: row[5]! }))
  const pidsBefore = before[2]!.trim().split(/\s+/), pidsAfter = after[2]!.trim().split(/\s+/)
  return { frame: { containerId, startedAt, finishedAt, output }, containerId, startedAt, finishedAt, pidsBefore, pidsAfter, processes, files,
    daemonStarttime: birth(before[3]!), daemonBefore: before[3]!, daemonAfter: after[3]!, locksBefore: before[4]!, locksAfter: after[4]!,
    complete: JSON.stringify(pidsBefore) === JSON.stringify(pidsAfter) && processes.length === pidsBefore.length &&
      processes.every(process => pidsBefore.includes(String(process.pid)) && birth(process.stat) && birth(process.stat) === birth(process.finalStat ?? "")) &&
      birth(before[3]!) === birth(after[3]!) }
}

function birth(stat: string) {
  return stat.slice(stat.lastIndexOf(")") + 2).trim().split(/\s+/)[19]
}
