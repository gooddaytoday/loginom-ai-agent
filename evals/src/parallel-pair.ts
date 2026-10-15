import path from "node:path"
import { lstat, mkdir, open, readFile, realpath, readdir, rename } from "node:fs/promises"
import type { ServerIdentity, SlotDefinition, SlotFile, SlotLease } from "./slots"
import { EvalFailure } from "./fail"
import { acquireResourceLease, readLeaseReceipt, recoverResourceLease, writeLeaseReceipt } from "./lease"
import type { Reservation } from "./lease"
import { readUserOwnership, readUserPreparation } from "./user-environment"

const ownerNonce = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/

export const pairImages = {
  server: "sha256:d138ce018adb4959282e65f5e5b7fe58265706d6c8c5a432022e4400ca387d1a",
  studio: "sha256:69ce44ac1002dea3d3a78b5e35eb9175a352530ecd3f05bdb727d63895004e28",
}

export function reconcilePairResource(name: string, purpose: "acceptance" | "research", nonce: string,
  snapshots: { Id: string; Name: string; Labels: Record<string, string> }[], expectedId?: string, unresolvedCreate = false) {
  if (!snapshots.length && unresolvedCreate) throw new EvalFailure("PAIR_CREATE_UNKNOWN", 2)
  if (!snapshots.length && !expectedId) return undefined
  const item = snapshots[0]
  if (snapshots.length !== 1 || !item || !/^[a-f0-9]{64}$/.test(item.Id) || item.Name.replace(/^\//, "") !== name ||
    item.Labels?.["loginom.evals.kind"] !== "users" || item.Labels?.["loginom.evals.purpose"] !== purpose ||
    item.Labels?.["loginom.evals.nonce"] !== nonce || (expectedId && item.Id !== expectedId)) throw new EvalFailure("PAIR_OWNERSHIP", 2)
  return item.Id
}

export function planPair(server: SlotFile["server"], purpose: "acceptance" | "research", nonce: string) {
  const url = URL.parse(server.url)
  if (!url || url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/app/" ||
    server.alias !== "loginom-server-7.4.2-test" || url.port === "0" || url.username || url.password || url.hash || url.search ||
    server.network === "loginom-net" || server.container === server.studioContainer ||
    [server.container, server.studioContainer, server.network, server.alias].some(name => !/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,63}$/.test(name)) ||
    !["acceptance", "research"].includes(purpose) || !ownerNonce.test(nonce)) throw new EvalFailure("PAIR_CONFIGURATION", 2)
  const labels = ["--label", "loginom.evals.kind=users", "--label", `loginom.evals.purpose=${purpose}`, "--label", `loginom.evals.nonce=${nonce}`]
  return {
    network: ["network", "create", ...labels, server.network],
    server: ["create", "--name", server.container, ...labels, "--restart=no", `--network=${server.network}`, `--network-alias=${server.alias}`, pairImages.server],
    studio: ["create", "--name", server.studioContainer, ...labels, "--restart=no", `--network=${server.network}`, "--publish", `127.0.0.1:${url.port || "80"}:80`, pairImages.studio],
  }
}

export function usersMarker(containerId: string, nonce: string) {
  if (!/^[a-f0-9]{64}$/.test(containerId) || !ownerNonce.test(nonce)) throw new EvalFailure("PAIR_MARKER", 2)
  return { kind: "loginom-evals-users" as const, version: 2 as const, container_id: containerId, owner_nonce: nonce,
    roots: ["/workdir/UserStorage", "/workdir/SessionBackup"], inventory: [] as { username: string; storage_dir: string; owner_nonce: string }[] }
}

export function serverEpoch(input: { containerId: string; startedAt: string; hostBootId: string; daemonExe: string; daemonCmdline: string; daemonStat: string }) {
  const starttime = input.daemonStat.slice(input.daemonStat.lastIndexOf(")") + 2).trim().split(/\s+/)[19]
  if (!/^[a-f0-9]{64}$/.test(input.containerId) || !Number.isFinite(Date.parse(input.startedAt)) || !ownerNonce.test(input.hostBootId) ||
    input.daemonExe !== "/app/loginomd" || input.daemonCmdline.split("\0")[0] !== "/app/loginomd" ||
    !/^1 \([^\n]*\) [A-Z] /.test(input.daemonStat) || !starttime || !/^\d+$/.test(starttime) || BigInt(starttime) <= 0n)
    throw new EvalFailure("SERVER_IDENTITY_UNVERIFIED", 2)
  return new Bun.CryptoHasher("sha256").update(JSON.stringify({ version: 1, containerId: input.containerId, startedAt: input.startedAt,
    hostBootId: input.hostBootId, daemonPid: 1, daemonStarttime: starttime })).digest("hex")
}

type PairOptions = { purpose: "acceptance" | "research"; out: string; lockRoot: string }
type PairJournal = {
  version: 2; kind: "pair-provision"; nonce: string; purpose: PairOptions["purpose"]; daemonId: string
  server: SlotFile["server"]; images: typeof pairImages
  resources: { network?: string; server?: string; studio?: string }
  phase: "provisioning" | "configured" | "ready" | "destroying" | "destroyed"
  intent?: { operation: string; target: string; at: string }
}
type Container = {
  Id: string; Name: string; Image: string; Config: { Labels: Record<string, string> }
  State: { Running: boolean; StartedAt: string }; Mounts: unknown[]
  HostConfig: { Privileged: boolean; NetworkMode: string; RestartPolicy: { Name: string }; PortBindings: Record<string, { HostIp: string; HostPort: string }[]> | null }
  NetworkSettings: { Networks: Record<string, { IPAddress: string; NetworkID: string; Aliases: string[] | null }> }
}

export async function readServerIdentity(file: SlotFile): Promise<ServerIdentity> {
  const server = await inspectContainer(file.server.container)
  const studio = await inspectContainer(file.server.studioContainer)
  if (!server.State.Running || !studio.State.Running) throw new EvalFailure("SERVER_IDENTITY_UNVERIFIED", 2)
  const [daemonExe, daemonCmdline, daemonStat, components, initial, served, proxy] = await Promise.all([
    dockerText(["exec", server.Id, "readlink", "/proc/1/exe"]), dockerText(["exec", server.Id, "cat", "/proc/1/cmdline"]),
    dockerText(["exec", server.Id, "cat", "/proc/1/stat"]), dockerText(["exec", server.Id, "cat", "/workdir/Components.cfg"]),
    dockerText(["exec", studio.Id, "cat", "/usr/local/apache2/initial-content/server.json"]),
    dockerText(["exec", studio.Id, "cat", "/usr/local/apache2/htdocs/client/server.json"]),
    dockerText(["exec", studio.Id, "cat", "/usr/local/apache2/conf/loginom.site.conf"]),
  ])
  // Inspect again so a restart between the process and configuration reads cannot produce a mixed epoch.
  const current = await inspectContainer(server.Id)
  const currentStudio = await inspectContainer(studio.Id)
  if (!current.State.Running || !currentStudio.State.Running || current.State.StartedAt !== server.State.StartedAt ||
    currentStudio.State.StartedAt !== studio.State.StartedAt) throw new EvalFailure("SERVER_IDENTITY_CHANGED", 2)
  return { containerId: server.Id, startedAt: server.State.StartedAt, studioContainerId: studio.Id, studioStartedAt: studio.State.StartedAt,
    serverEpoch: serverEpoch({ containerId: server.Id, startedAt: server.State.StartedAt,
      hostBootId: (await readFile("/proc/sys/kernel/random/boot_id", "utf8")).trim(), daemonExe: daemonExe.trim(), daemonCmdline, daemonStat }),
    configurationHash: new Bun.CryptoHasher("sha256").update(JSON.stringify({ version: 1, server: file.server,
      serverImage: server.Image, studioImage: studio.Image, serverHost: server.HostConfig, studioHost: studio.HostConfig,
      serverNetworks: server.NetworkSettings.Networks, studioNetworks: studio.NetworkSettings.Networks, components, initial, served, proxy })).digest("hex") }
}

type PairCreated = { version: number; status: "infrastructure-ready"; purpose: PairOptions["purpose"]; nonce: string;
  resources: PairJournal["resources"]; identity: ServerIdentity; ownershipJournal: string; browserRouteQualified: boolean }

export async function createPair(file: SlotFile, options: PairOptions): Promise<PairCreated> {
  return usePair(file, options, "create") as Promise<PairCreated>
}

export async function destroyPair(file: SlotFile, options: PairOptions) {
  return usePair(file, options, "destroy")
}

export async function verifyParallelPair(file: SlotFile, expected: ServerIdentity) {
  const root = await lstat(file.controller.stateDir)
  if (!root.isDirectory() || root.isSymbolicLink() || root.uid !== process.getuid?.() || (root.mode & 0o777) !== 0o700 ||
    await realpath(file.controller.stateDir) !== file.controller.stateDir) throw new EvalFailure("PAIR_PRIVATE_DIRECTORY", 2)
  const source = path.join(file.controller.stateDir, "pair.json")
  const journal = await readLeaseReceipt(source).catch(() => { throw new EvalFailure("PAIR_OWNERSHIP", 2) }) as PairJournal
  if (!journal || typeof journal !== "object" || Array.isArray(journal) || Object.keys(journal).length !== 9 ||
    journal.version !== 2 || journal.kind !== "pair-provision" || !ownerNonce.test(journal.nonce) ||
    !["acceptance", "research"].includes(journal.purpose) || journal.phase !== "ready" || journal.intent ||
    !ownerNonce.test(journal.daemonId) || JSON.stringify(journal.server) !== JSON.stringify(file.server) ||
    JSON.stringify(journal.images) !== JSON.stringify(pairImages) || !journal.resources || Object.keys(journal.resources).length !== 3 ||
    Object.values(journal.resources).some(id => !/^[a-f0-9]{64}$/.test(id))) throw new EvalFailure("PAIR_OWNERSHIP", 2)
  planPair(file.server, journal.purpose, journal.nonce)
  if ((await dockerText(["info", "--format", "{{.ID}}"])).trim() !== journal.daemonId) throw new EvalFailure("PAIR_DOCKER_DAEMON", 2)
  for (const role of ["network", "server", "studio"] as const) {
    const name = role === "network" ? file.server.network : role === "server" ? file.server.container : file.server.studioContainer
    reconcilePairResource(name, journal.purpose, journal.nonce, await inspectNamed(role === "network" ? "network" : "container", name), journal.resources[role])
  }
  const current = await verifyPair(file, journal)
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
  if (JSON.stringify(await readLeaseReceipt(source)) !== JSON.stringify(journal)) throw new EvalFailure("PAIR_JOURNAL_CHANGED", 2)
  return current
}

export async function inspectUserStorage(file: SlotFile, identity: ServerIdentity, slot: SlotDefinition, owner: string) {
  if (!ownerNonce.test(owner) || !file.slots.some(configured => JSON.stringify(configured) === JSON.stringify(slot)))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  await verifyParallelPair(file, identity)
  const markerFile = "/workdir/.loginom-evals-isolated.json"
  const markerBytes = await dockerText(["exec", identity.containerId, "cat", markerFile])
  const marker = JSON.parse(markerBytes) as ReturnType<typeof usersMarker>
  const root = `${file.server.storageRoot}/${slot.username}`
  if (!marker.inventory.some(row => row.username === slot.username && row.storage_dir === root && row.owner_nonce === owner))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const script = 'set -eu; for dir in / /workdir /workdir/UserStorage "$1"; do ' +
    'test -d "$dir" && ! test -L "$dir" && test "$(readlink -f -- "$dir")" = "$dir" || exit 1; done; ' +
    'stat --printf "%d\\0%i\\0%u\\0%g\\0" -- "$1"; ' +
    'find -P "$1" -mindepth 1 -printf "%P\\0%y\\0%n\\0%U\\0%G\\0%D\\0%i\\0%s\\0"; ' +
    'stat --printf "%d\\0%i\\0%u\\0%g\\0" -- "$1"'
  const scanned = await docker(["exec", identity.containerId, "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "sh", "-c", script, "user-storage", root])
  if (scanned.code !== 0) throw new EvalFailure("USER_STORAGE_UNVERIFIED", 2)
  const fields = scanned.text.split("\0")
  if (fields.pop() !== "" || fields.length < 8 || fields.length % 8 !== 0 ||
    JSON.stringify(fields.slice(0, 4)) !== JSON.stringify(fields.slice(-4))) throw new EvalFailure("USER_STORAGE_UNVERIFIED", 2)
  const [device, inode, uid, gid] = fields.slice(0, 4)
  const service = await dockerText(["exec", identity.containerId, "cat", "/proc/1/status"])
  if (!/^\d+$/.test(device!) || ![inode, uid, gid].every(value => /^\d+$/.test(value!) && Number.isSafeInteger(Number(value))) || Number(inode) < 1 ||
    service.match(/^Uid:\s+\d+\s+\d+\s+\d+\s+(\d+)$/m)?.[1] !== uid || service.match(/^Gid:\s+\d+\s+\d+\s+\d+\s+(\d+)$/m)?.[1] !== gid)
    throw new EvalFailure("USER_STORAGE_UNVERIFIED", 2)
  const entries = Array.from({ length: (fields.length - 8) / 8 }, (_, index) => {
    const row = fields.slice(4 + index * 8, 12 + index * 8)
    if (!row[0] || row[0].startsWith("/") || row[0].split("/").some(part => !part || [".", ".."].includes(part)) ||
      !["f", "d", "l"].includes(row[1]!) || !row.slice(2).every(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) ||
      Number(row[2]) < 1 || Number(row[6]) < 1 || row[3] !== uid || row[4] !== gid || row[5] !== device || row[1] === "f" && row[2] !== "1")
      throw new EvalFailure("USER_STORAGE_TOPOLOGY", 2)
    return { name: row[0]!, type: row[1]!, links: Number(row[2]), uid: Number(row[3]), gid: Number(row[4]), device: row[5]!, inode: Number(row[6]), bytes: Number(row[7]) }
  })
  if (new Set(entries.map(entry => entry.name)).size !== entries.length ||
    await dockerText(["exec", identity.containerId, "cat", markerFile]) !== markerBytes) throw new EvalFailure("USER_STORAGE_UNVERIFIED", 2)
  if (JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
  return { version: 2, kind: "user-storage-observation", identity, username: slot.username, ownerNonce: owner, root,
    markerHash: new Bun.CryptoHasher("sha256").update(markerBytes).digest("hex"), device: device!, inode: Number(inode), uid: Number(uid), gid: Number(gid), entries }
}

export async function prepareUserStorage(file: SlotFile, lease: SlotLease, secretFile: string, serverLease: Awaited<ReturnType<typeof acquireResourceLease>>) {
  const assertHeld = async () => {
    await lease.assertHeld()
    if (lease.recoveryOnly) throw new EvalFailure("SLOT_RECOVERY_ONLY", 2)
    if (serverLease.reservation.key !== `server:${lease.identity.containerId}` || serverLease.reservation.state !== "retained" ||
      JSON.stringify(serverLease.reservation.identity) !== JSON.stringify(lease.identity)) throw new EvalFailure("SERVER_FENCE_UNCONFIRMED", 2)
    await serverLease.assertHeld()
    if (JSON.stringify(await readServerIdentity(file)) !== JSON.stringify(lease.identity)) throw new EvalFailure("SERVER_EPOCH_CHANGED", 2)
  }
  await assertHeld()
  const prepared = await readUserPreparation(file, lease, secretFile)
  const owned = await readUserOwnership(file, lease, secretFile)
  if (owned.everActivated) throw new EvalFailure("USER_IDLE_UNCONFIRMED", 2)
  await verifyParallelPair(file, lease.identity)
  const target = path.join(file.controller.stateDir, `storage-${lease.slot.id}.json`)
  const saved = await readLeaseReceipt(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  }) as Record<string, unknown> | undefined
  const markerFile = "/workdir/.loginom-evals-isolated.json"
  const markerBytes = await dockerText(["exec", lease.identity.containerId, "cat", markerFile])
  const marker = JSON.parse(markerBytes) as ReturnType<typeof usersMarker>
  const root = `${file.server.storageRoot}/${lease.slot.username}`
  const base = { version: 2, kind: "owned-user-storage", slotId: lease.slot.id, username: lease.slot.username, identity: lease.identity,
    preparationNonce: prepared.nonce, userKey: owned.userKey, ownerSource: owned.source.sha256, root }
  if (saved !== undefined && (!saved || typeof saved !== "object" || Array.isArray(saved) || Object.entries(base).some(([key, value]) => JSON.stringify(saved[key]) !== JSON.stringify(value)) ||
    !["planned", "created", "published"].includes(String(saved.state)) || typeof saved.markerBefore !== "string" || !/^[a-f0-9]{64}$/.test(saved.markerBefore)))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const row = marker.inventory.find(row => row.username === lease.slot.username)
  if (row && (!saved || saved.state === "planned" || row.storage_dir !== root || row.owner_nonce !== prepared.nonce))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  if (saved?.state === "published") {
    const observed = await inspectUserStorage(file, lease.identity, lease.slot, prepared.nonce)
    if (["device", "inode", "uid", "gid"].some(key => saved[key] !== observed[key as keyof typeof observed]))
      throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
    return observed
  }
  const markerBefore = new Bun.CryptoHasher("sha256").update(markerBytes).digest("hex")
  if (saved && !row && saved.markerBefore !== markerBefore) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  if (!saved) await writeLeaseReceipt(target, { ...base, state: "planned", markerBefore })
  // Planned intent does not grant ownership of a directory left by an unknown mkdir.
  const created = saved?.state === "created" ? saved : await (async () => {
    const service = await dockerText(["exec", lease.identity.containerId, "cat", "/proc/1/status"])
    const uid = service.match(/^Uid:\s+\d+\s+\d+\s+\d+\s+(\d+)$/m)?.[1]
    const gid = service.match(/^Gid:\s+\d+\s+\d+\s+\d+\s+(\d+)$/m)?.[1]
    if (!uid || !gid) throw new EvalFailure("USER_STORAGE_UNVERIFIED", 2)
    await assertHeld()
    if (JSON.stringify(await readUserOwnership(file, lease, secretFile)) !== JSON.stringify(owned)) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
    const result = await docker(["exec", lease.identity.containerId, "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "sh", "-c",
      'set -eu; for dir in / /workdir /workdir/UserStorage; do test -d "$dir" && ! test -L "$dir" && test "$(readlink -f -- "$dir")" = "$dir" || exit 1; done; ' +
      'test ! -e "$1" && ! test -L "$1" || exit 73; mkdir -m 700 -- "$1"; chown -- "$2:$3" "$1"; stat --printf "%d:%i:%u:%g" -- "$1"', "user-storage", root, uid, gid])
    if (result.code !== 0) throw new EvalFailure(result.code === 73 ? "USER_STORAGE_OWNERSHIP" : "USER_STORAGE_UNVERIFIED", 2)
    const metadata = result.text.split(":")
    if (metadata.length !== 4 || !metadata.every(value => /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) || Number(metadata[1]) < 1 || metadata[2] !== uid || metadata[3] !== gid)
      throw new EvalFailure("USER_STORAGE_UNVERIFIED", 2)
    const created = { ...base, state: "created", markerBefore, device: metadata[0]!, inode: Number(metadata[1]), uid: Number(uid), gid: Number(gid) }
    await writeLeaseReceipt(target, created)
    return created
  })()
  await assertHeld()
  if (JSON.stringify(await readUserOwnership(file, lease, secretFile)) !== JSON.stringify(owned)) throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  const physical = await docker(["exec", lease.identity.containerId, "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "sh", "-c",
    'set -eu; for dir in / /workdir /workdir/UserStorage "$1"; do test -d "$dir" && ! test -L "$dir" && test "$(readlink -f -- "$dir")" = "$dir" || exit 1; done; stat --printf "%d:%i:%u:%g" -- "$1"', "user-storage", root])
  if (physical.code !== 0 || physical.text !== `${created.device}:${created.inode}:${created.uid}:${created.gid}`)
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  if (!row) {
    const updated = { ...marker, inventory: [...marker.inventory, { username: lease.slot.username, storage_dir: root, owner_nonce: prepared.nonce }] }
    const temporary = `${markerFile}.${prepared.nonce}.tmp`
    const result = await docker(["exec", lease.identity.containerId, "env", "-i", "PATH=/usr/bin:/bin", "LC_ALL=C", "sh", "-c",
      'set -eu; test -f "$1" && ! test -L "$1" && test "$(stat -c %h -- "$1")" = 1 || exit 1; hash=$(sha256sum -- "$1"); test "${hash%% *}" = "$4"; ' +
      'if test -e "$3" || test -L "$3"; then test -f "$3" && ! test -L "$3" && test "$(stat -c %u:%g:%a:%h -- "$3")" = "$(id -u):$(id -g):600:1" || exit 1; ' +
      'hash=$(sha256sum -- "$3"); test "${hash%% *}" = "$5"; else set -C; umask 077; printf %s "$2" > "$3"; fi; sync "$3"; mv -T -- "$3" "$1"; sync /workdir',
      "user-storage-marker", markerFile, JSON.stringify(updated), temporary, markerBefore, new Bun.CryptoHasher("sha256").update(JSON.stringify(updated)).digest("hex")])
    if (result.code !== 0) throw new EvalFailure("USER_STORAGE_UNVERIFIED", 2)
  }
  const observed = await inspectUserStorage(file, lease.identity, lease.slot, prepared.nonce)
  if (["device", "inode", "uid", "gid"].some(key => created[key as keyof typeof created] !== observed[key as keyof typeof observed]))
    throw new EvalFailure("USER_STORAGE_OWNERSHIP", 2)
  await assertHeld()
  await writeLeaseReceipt(target, { ...created, state: "published" })
  return observed
}

async function usePair(file: SlotFile, options: PairOptions, action: "create" | "destroy") {
  await privateDirectory(file.controller.stateDir)
  await privateDirectory(options.out)
  const daemonId = (await dockerText(["info", "--format", "{{.ID}}"])).trim()
  const endpoint = process.env.DOCKER_HOST || (await dockerText(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"])).trim()
  if (!ownerNonce.test(daemonId) || !endpoint.startsWith("unix://")) throw new EvalFailure("PAIR_DOCKER_DAEMON", 2)
  const pairFile = path.join(file.controller.stateDir, "pair.json")
  const saved = await readLeaseReceipt(pairFile).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return undefined
    throw error
  }) as PairJournal | undefined
  if (saved && (saved.version !== 2 || saved.kind !== "pair-provision" || !ownerNonce.test(saved.nonce) || saved.purpose !== options.purpose ||
    saved.daemonId !== daemonId || JSON.stringify(saved.server) !== JSON.stringify(file.server) || JSON.stringify(saved.images) !== JSON.stringify(pairImages) ||
    !saved.resources || !["provisioning", "configured", "ready", "destroying", "destroyed"].includes(saved.phase))) throw new EvalFailure("PAIR_OWNERSHIP", 2)
  if (action === "destroy" && !saved) throw new EvalFailure("PAIR_OWNERSHIP", 2)
  if (action === "create" && saved?.phase === "destroyed") throw new EvalFailure("PAIR_DESTROYED", 2)
  const journal: PairJournal = saved ? structuredClone(saved) : { version: 2, kind: "pair-provision", nonce: crypto.randomUUID(), purpose: options.purpose,
    daemonId, server: file.server, images: pairImages, resources: {}, phase: "provisioning" }
  const plan = planPair(file.server, options.purpose, journal.nonce)
  const commandId = crypto.randomUUID()
  const commandFile = path.join(file.controller.stateDir, `pair-command-${commandId}.json`)
  await writeLeaseReceipt(commandFile, { version: 2, kind: "pair-command", pairFile, nonce: journal.nonce, commandId, action })
  const leases: Awaited<ReturnType<typeof acquireResourceLease>>[] = []
  let mutated = false
  let confirmed = false
  const acquire = async (key: string) => {
    const previous = await readLeaseReceipt(path.join(options.lockRoot, `${new Bun.CryptoHasher("sha256").update(key).digest("hex")}.reservation.json`))
      .catch((error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return undefined; throw error }) as Reservation | undefined
    const request = { key, lockRoot: options.lockRoot, journal: commandFile, commandId }
    if (!previous || previous.state === "released") { leases.push(await acquireResourceLease(request)); return }
    const owner = await readLeaseReceipt(previous.journal) as { kind?: string; pairFile?: string; nonce?: string }
    if (owner.kind !== "pair-command" || owner.pairFile !== pairFile || owner.nonce !== journal.nonce) throw new EvalFailure("RECOVERY_REQUIRED", 2)
    leases.push(await recoverResourceLease(request, { token: previous.token, revision: previous.revision }))
  }
  const intent = async (operation: string, target: string) => {
    journal.intent = { operation, target, at: new Date().toISOString() }
    await writeLeaseReceipt(pairFile, journal)
    mutated = true
  }
  try {
    const keys = [`provision:${daemonId}:network:${file.server.network}`, `provision:${daemonId}:container:${file.server.container}`,
      `provision:${daemonId}:container:${file.server.studioContainer}`, `controller:${file.controller.stateDir}`].sort()
    for (const key of keys) await acquire(key)
    // Reread under the shared guards; a concurrent command may have changed the ownership journal.
    if (JSON.stringify(await readLeaseReceipt(pairFile).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })) !== JSON.stringify(saved)) throw new EvalFailure("PAIR_JOURNAL_CHANGED", 2)
    await writeLeaseReceipt(pairFile, journal)
    const resources = [
      { kind: "network", role: "network" as const, name: file.server.network, argv: plan.network },
      { kind: "container", role: "server" as const, name: file.server.container, argv: plan.server },
      { kind: "container", role: "studio" as const, name: file.server.studioContainer, argv: plan.studio },
    ]
    for (const resource of resources) {
      const snapshots = await inspectNamed(resource.kind, resource.name)
      const unresolved = journal.intent?.operation === "create" && journal.intent.target === resource.name
      if (!snapshots.length && unresolved) throw new EvalFailure("PAIR_CREATE_UNKNOWN", 2)
      if (action === "destroy" && !snapshots.length) {
        const id = journal.resources[resource.role]
        if (id && await resourceExists(resource.kind, id)) throw new EvalFailure("PAIR_OWNERSHIP", 2)
        continue
      }
      const id = reconcilePairResource(resource.name, options.purpose, journal.nonce, snapshots, journal.resources[resource.role], unresolved)
      if (id) journal.resources[resource.role] = id
    }
    if (journal.resources.server) await acquire(`server:${journal.resources.server}`)
    if (action === "destroy") {
      for (const name of await readdir(options.lockRoot)) {
        if (!name.endsWith(".reservation.json")) continue
        const reservation = await readLeaseReceipt(path.join(options.lockRoot, name)) as Reservation
        if (reservation.state !== "released" && !leases.some(lease => lease.reservation.token === reservation.token) &&
          (reservation.identity?.containerId === journal.resources.server || reservation.key.startsWith(`user:${journal.resources.server}:`)))
          throw new EvalFailure("PAIR_RETAINED_INCIDENT", 2)
      }
      journal.phase = "destroying"
      await writeLeaseReceipt(pairFile, journal)
      for (const resource of [...resources].reverse()) {
        const id = journal.resources[resource.role]
        if (!id || !(await inspectNamed(resource.kind, resource.name)).length) continue
        reconcilePairResource(resource.name, options.purpose, journal.nonce, await inspectNamed(resource.kind, resource.name), id)
        await intent("remove", id)
        await docker(resource.kind === "network" ? ["network", "rm", id] : ["rm", "--force", id])
        if (await resourceExists(resource.kind, id)) throw new EvalFailure("PAIR_REMOVE_UNKNOWN", 2)
      }
      journal.phase = "destroyed"
      delete journal.intent
      await writeLeaseReceipt(pairFile, journal)
      await writeLeaseReceipt(path.join(options.out, `pair-destroy-${commandId}.json`), { version: 2, status: "destroyed", nonce: journal.nonce, resources: journal.resources })
      confirmed = true
      return { version: 2, status: "destroyed", nonce: journal.nonce, resources: journal.resources }
    }
    for (const role of ["server", "studio"] as const) {
      if ((await dockerText(["image", "inspect", role === "server" ? "loginom-server-7.4.2-test:with-libxml2" : "loginom-client-7.4.2-test:latest", "--format", "{{.Id}}"])).trim() !== pairImages[role])
        throw new EvalFailure("PAIR_IMAGE_PIN", 2)
    }
    if (!journal.resources.studio) {
      const port = Number(new URL(file.server.url).port || "80")
      try {
        const probe = Bun.listen({ hostname: "127.0.0.1", port, socket: { data() {} } })
        probe.stop(true)
      } catch { throw new EvalFailure("PAIR_PORT_BUSY", 2) }
    }
    for (const resource of resources) {
      if (journal.resources[resource.role]) continue
      await intent("create", resource.name)
      // Exit code/stdout alone never prove mutation: always inspect the exact intended name.
      await docker(resource.argv)
      const id = reconcilePairResource(resource.name, options.purpose, journal.nonce, await inspectNamed(resource.kind, resource.name))
      if (!id) throw new EvalFailure("PAIR_CREATE_UNKNOWN", 2)
      journal.resources[resource.role] = id
      delete journal.intent
      await writeLeaseReceipt(pairFile, journal)
      if (resource.role === "server") await acquire(`server:${id}`)
    }
    const serverId = journal.resources.server!
    const studioId = journal.resources.studio!
    const current = await inspectContainer(serverId)
    const currentStudio = await inspectContainer(studioId)
    verifyTopology(file, journal, current, currentStudio)
    if (journal.phase === "provisioning") {
      if (current.State.StartedAt !== "0001-01-01T00:00:00Z" || currentStudio.State.StartedAt !== "0001-01-01T00:00:00Z")
        throw new EvalFailure("PAIR_PRESTART_UNVERIFIED", 2)
      const files = path.join(file.controller.stateDir, "pair-files")
      await privateDirectory(files)
      const originalFile = path.join(files, `components-original-${commandId}.xml`)
      const copied = await docker(["cp", `${serverId}:/workdir/Components.cfg`, originalFile])
      if (copied.code !== 0 && !copied.stderr.includes("Could not find the file /workdir/Components.cfg in container"))
        throw new EvalFailure("PAIR_COMPONENTS_UNAVAILABLE", 2)
      // The pinned image has no Components.cfg; install only the required Python policy.
      const components = copied.code === 0 ? await Bun.file(originalFile).text() :
        '<?xml version="1.0" encoding="UTF-8"?><ComponentSettings xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Item Guid="70a6c99d-a725-4309-b05c-898c8072c3cd" DisplayName="Python"><Settings xsi:type="TBGPythonComponentSettings" Disabled="false"/></Item></ComponentSettings>'
      const python = /(<Item\s+Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"[^>]*>\s*<Settings\b[^>]*Disabled=")false("[^>]*\/?>)/g
      if ([...components.matchAll(python)].length !== 1 && !components.includes('Disabled="true"')) throw new EvalFailure("PAIR_COMPONENTS_UNSUPPORTED", 2)
      const wanted = [
        { local: "Components.cfg", id: serverId, target: "/workdir/Components.cfg", content: components.replace(python, '$1true$2') },
        { local: "marker.json", id: serverId, target: "/workdir/.loginom-evals-isolated.json", content: JSON.stringify(usersMarker(serverId, journal.nonce)) },
        { local: "server.json", id: studioId, target: "/usr/local/apache2/initial-content/server.json", content: JSON.stringify({ wsproxy: true }) },
      ]
      for (const item of wanted) {
        if (item.local === "Components.cfg") await verifyPython(item.content)
        const temporary = path.join(files, `${item.local}.${commandId}.tmp`)
        const handle = await open(temporary, "wx", 0o600)
        try {
          await handle.writeFile(item.content)
          // Apache serves this public config as daemon; the host parent remains private.
          await handle.chmod(item.id === studioId ? 0o644 : 0o600)
          await handle.sync()
        } finally { await handle.close() }
        await rename(temporary, path.join(files, item.local))
        const directory = await open(files, "r")
        try { await directory.sync() } finally { await directory.close() }
        const readback = path.join(files, `readback-${item.local}-${commandId}`)
        const before = await docker(["cp", `${item.id}:${item.target}`, readback])
        if (before.code === 0 && await Bun.file(readback).text() === item.content) continue
        if (saved?.intent?.operation === "copy-config" && saved.intent.target === `${item.id}:${item.target}`)
          throw new EvalFailure("PAIR_CONFIG_UNKNOWN", 2)
        await intent("copy-config", `${item.id}:${item.target}`)
        await docker(["cp", path.join(files, item.local), `${item.id}:${item.target}`])
        await docker(["cp", `${item.id}:${item.target}`, readback])
        if (await Bun.file(readback).text() !== item.content) throw new EvalFailure("PAIR_CONFIG_UNKNOWN", 2)
      }
      journal.phase = "configured"
      delete journal.intent
      await writeLeaseReceipt(pairFile, journal)
    }
    if (journal.phase !== "ready") {
      for (const id of [serverId, studioId]) {
        if ((await inspectContainer(id)).State.Running) continue
        if (saved?.intent?.operation === "start" && saved.intent.target === id) throw new EvalFailure("PAIR_START_UNKNOWN", 2)
        await intent("start", id)
        await docker(["start", id])
        if (!(await inspectContainer(id)).State.Running) throw new EvalFailure("PAIR_START_UNKNOWN", 2)
      }
    }
    const identity = await verifyPair(file, journal)
    journal.phase = "ready"
    delete journal.intent
    await writeLeaseReceipt(pairFile, journal)
    const receipt = { version: 2, status: "infrastructure-ready", purpose: options.purpose, nonce: journal.nonce, resources: journal.resources, identity,
      ownershipJournal: pairFile, browserRouteQualified: false }
    await writeLeaseReceipt(path.join(options.out, `pair-create-${commandId}.json`), receipt)
    confirmed = true
    return receipt
  } finally {
    try {
      if (confirmed || !mutated) {
        for (const lease of leases.reverse()) {
          if (!confirmed && lease.reservation.state === "recovery-only") continue
          const proof = path.join(options.out, `pair-release-${lease.reservation.token}.json`)
          await writeLeaseReceipt(proof, { version: 2, status: "confirmed", key: lease.reservation.key, token: lease.reservation.token,
            revision: lease.reservation.revision, scope: "pair-infrastructure", outcome: confirmed ? action : "not-used" })
          await lease.release(proof)
        }
      }
    } finally { await Promise.all(leases.map(lease => lease.close())) }
  }
}

async function verifyPair(file: SlotFile, journal: PairJournal) {
  const server = await inspectContainer(journal.resources.server!)
  const studio = await inspectContainer(journal.resources.studio!)
  verifyTopology(file, journal, server, studio)
  if ((await docker(["exec", server.Id, "sh", "-c", 'test -f "$1" && ! test -L "$1"', "sh", "/workdir/.loginom-evals-isolated.json"])).code !== 0)
    throw new EvalFailure("PAIR_MARKER", 2)
  const marker = JSON.parse(await dockerText(["exec", server.Id, "cat", "/workdir/.loginom-evals-isolated.json"])) as ReturnType<typeof usersMarker>
  if (!marker || typeof marker !== "object" || Array.isArray(marker) || Object.keys(marker).length !== 6 ||
    marker.kind !== "loginom-evals-users" || marker.version !== 2 || marker.container_id !== server.Id || marker.owner_nonce !== journal.nonce ||
    JSON.stringify(marker.roots) !== JSON.stringify(usersMarker(server.Id, journal.nonce).roots) || !Array.isArray(marker.inventory) ||
    marker.inventory.some(row => !row || typeof row !== "object" || Array.isArray(row) || Object.keys(row).length !== 3 ||
      typeof row.username !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.username) ||
      row.storage_dir !== `/workdir/UserStorage/${row.username}` || typeof row.owner_nonce !== "string" || !ownerNonce.test(row.owner_nonce)) ||
    new Set(marker.inventory.map(row => row.username)).size !== marker.inventory.length) throw new EvalFailure("PAIR_MARKER", 2)
  const components = await dockerText(["exec", server.Id, "cat", "/workdir/Components.cfg"])
  await verifyPython(components)
  const deadline = Date.now() + 30_000
  while (true) {
    const response = await fetch(new URL("server.json", file.server.url), { signal: AbortSignal.timeout(2000) }).catch(() => undefined)
    const config = response?.ok ? await response.json().catch(() => undefined) as { wsproxy?: unknown } | undefined : undefined
    if (config?.wsproxy === true) break
    if (Date.now() >= deadline) throw new EvalFailure("PAIR_HEALTH_TIMEOUT", 2)
    await Bun.sleep(200)
  }
  const dns = await dockerText(["exec", studio.Id, "getent", "hosts", file.server.alias])
  if (!dns.split(/\s+/).includes(server.NetworkSettings.Networks[file.server.network]!.IPAddress)) throw new EvalFailure("PAIR_DNS", 2)
  const proxy = await dockerText(["exec", studio.Id, "cat", "/usr/local/apache2/conf/loginom.site.conf"])
  if (JSON.stringify([...proxy.matchAll(/^\s*ProxyPass\s+([^\n]+)/gm)].map(match => match[1]?.trim())) !==
    JSON.stringify([`"ws://${file.server.alias}:8080/ws/"`])) throw new EvalFailure("PAIR_PROXY", 2)
  const identity = await readServerIdentity(file)
  const served = JSON.parse(await dockerText(["exec", studio.Id, "cat", "/usr/local/apache2/htdocs/client/server.json"])) as { wsproxy?: unknown }
  if (served.wsproxy !== true) throw new EvalFailure("PAIR_STUDIO_CONFIG", 2)
  return identity
}

function verifyTopology(file: SlotFile, journal: PairJournal, server: Container, studio: Container) {
  const port = new URL(file.server.url).port || "80"
  for (const item of [server, studio]) {
    if (item.Mounts.length || item.HostConfig.Privileged || item.HostConfig.RestartPolicy.Name !== "no" ||
      item.HostConfig.NetworkMode !== file.server.network || Object.keys(item.NetworkSettings.Networks).length !== 1 ||
      (item.NetworkSettings.Networks[file.server.network]?.NetworkID !== journal.resources.network &&
        !(item.State.StartedAt === "0001-01-01T00:00:00Z" && item.NetworkSettings.Networks[file.server.network]?.NetworkID === "")))
      throw new EvalFailure("PAIR_TOPOLOGY", 2)
  }
  if (server.Image !== pairImages.server || studio.Image !== pairImages.studio || Object.keys(server.HostConfig.PortBindings ?? {}).length ||
    JSON.stringify(studio.HostConfig.PortBindings) !== JSON.stringify({ "80/tcp": [{ HostIp: "127.0.0.1", HostPort: port }] }) ||
    !server.NetworkSettings.Networks[file.server.network]?.Aliases?.includes(file.server.alias)) throw new EvalFailure("PAIR_TOPOLOGY", 2)
}

async function verifyPython(components: string) {
  const xml = Bun.spawn(["xmllint", "--xpath", 'count(/ComponentSettings/Item[@Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"])=1 and count(/ComponentSettings/Item[@Guid="70a6c99d-a725-4309-b05c-898c8072c3cd"]/Settings[@Disabled="true"])=1', "-"],
    { stdin: "pipe", stdout: "pipe", stderr: "ignore" })
  xml.stdin.write(components)
  xml.stdin.end()
  const validXml = await new Response(xml.stdout).text()
  if (await xml.exited !== 0 || validXml.trim() !== "true") throw new EvalFailure("PAIR_COMPONENTS_UNVERIFIED", 2)
}

async function privateDirectory(directory: string) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const info = await lstat(directory)
  if (!path.isAbsolute(directory) || await realpath(directory) !== directory || !info.isDirectory() || info.isSymbolicLink() ||
    info.uid !== process.getuid?.() || (info.mode & 0o777) !== 0o700) throw new EvalFailure("PAIR_PRIVATE_DIRECTORY", 2)
}

async function inspectContainer(id: string) {
  const items = JSON.parse(await dockerText(["inspect", id])) as Container[]
  if (items.length !== 1 || !items[0] || !/^[a-f0-9]{64}$/.test(items[0].Id)) throw new EvalFailure("PAIR_INSPECT", 2)
  return items[0]
}

async function inspectNamed(kind: string, name: string) {
  const listed = await dockerText(kind === "network" ? ["network", "ls", "--no-trunc", "--format", "{{.ID}} {{.Name}}"] :
    ["container", "ls", "--all", "--no-trunc", "--format", "{{.ID}} {{.Names}}"])
  const ids = listed.trim().split("\n").filter(line => line.split(" ")[1] === name).map(line => line.split(" ")[0]!)
  if (!ids.length) return []
  const items = JSON.parse(await dockerText([...(kind === "network" ? ["network"] : []), "inspect", ...ids])) as (Container & { Labels?: Record<string, string> })[]
  return items.map(item => ({ Id: item.Id, Name: item.Name, Labels: kind === "network" ? item.Labels! : item.Config.Labels }))
}

async function resourceExists(kind: string, id: string) {
  const listed = await dockerText(kind === "network" ? ["network", "ls", "--no-trunc", "--format", "{{.ID}}"] :
    ["container", "ls", "--all", "--no-trunc", "--format", "{{.ID}}"])
  return listed.trim().split("\n").includes(id)
}

async function dockerText(argv: string[]) {
  const result = await docker(argv)
  if (result.code !== 0) throw new EvalFailure("PAIR_DOCKER_READ", 2)
  return result.text
}

async function docker(argv: string[]) {
  const child = Bun.spawn(["docker", ...argv], { stdout: "pipe", stderr: "pipe", stdin: "ignore",
    env: Object.fromEntries(["PATH", "HOME", "DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_CONFIG", "XDG_RUNTIME_DIR"].flatMap(key => process.env[key] ? [[key, process.env[key]!]] : [])) })
  const timer = setTimeout(() => child.kill("SIGKILL"), 20_000)
  try {
    const [text, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
    return { code: await child.exited, text, stderr }
  } finally { clearTimeout(timer) }
}
