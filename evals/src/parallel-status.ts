import path from "node:path"
import { EvalFailure } from "./fail"
import { globalLockRoot, readLeaseReceipt, readResourceReservation } from "./lease"
import type { SlotFile } from "./slots"

/** Recorded ownership is a snapshot; status never grants live admission. */
export async function readEnvironmentStatus(file: SlotFile, lockRoot = globalLockRoot) {
  const pairFile = path.join(file.controller.stateDir, "pair.json")
  const readPair = () => readLeaseReceipt(pairFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("STATUS_PAIR_INVALID", 2)
  })
  const pair = await readPair()
  if (pair !== undefined && (!object(pair) || pair.version !== 2 || pair.kind !== "pair-provision" ||
    JSON.stringify(pair.server) !== JSON.stringify(file.server) || typeof pair.nonce !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(pair.nonce) ||
    !["acceptance", "research"].includes(String(pair.purpose)) || !["provisioning", "configured", "ready", "destroying", "destroyed"].includes(String(pair.phase)) ||
    !object(pair.resources) || Object.entries(pair.resources).some(([key, value]) => !["network", "server", "studio"].includes(key) ||
      typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value))))
    throw new EvalFailure("STATUS_PAIR_INVALID", 2)
  const resources = object(pair) && object(pair.resources) ? pair.resources : {}
  const containerId = typeof resources.server === "string" ? resources.server : null
  const keys = [containerId ? `server:${containerId}` : null, `judge:${file.judge.codexHome}`,
    ...file.slots.flatMap(slot => [containerId ? `user:${containerId}:${slot.username}:0` : null, `profile:${slot.profileDir}`])]
  const read = () => Promise.all(keys.map(key => key ? readResourceReservation({ key, lockRoot }) : undefined))
  const reservations = await read()
  const snapshotChanged = JSON.stringify(reservations) !== JSON.stringify(await read()) || JSON.stringify(pair) !== JSON.stringify(await readPair())
  const projection = (reservation: typeof reservations[number]) => reservation ? {
    key: reservation.key, state: reservation.state, token: reservation.token, revision: reservation.revision,
    commandId: reservation.commandId, journal: reservation.journal,
    owner: { bootId: reservation.owner.bootId, pid: reservation.owner.pid, starttime: reservation.owner.starttime, uid: reservation.owner.uid },
  } : null
  return { version: 2, kind: "parallel-environment-status", admission: "not_verified", snapshotChanged,
    pair: object(pair) ? { phase: pair.phase, purpose: pair.purpose, nonce: pair.nonce,
      containerId, studioContainerId: resources.studio ?? null, networkId: resources.network ?? null } : null,
    server: projection(reservations[0]), judge: projection(reservations[1]),
    slots: file.slots.map((slot, index) => ({ id: slot.id, username: slot.username,
      user: projection(reservations[2 + 2 * index]), profile: projection(reservations[3 + 2 * index]) })) }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}
