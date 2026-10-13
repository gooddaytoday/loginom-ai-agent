import { expect, test } from "bun:test"
import path from "node:path"
import { planPair, reconcilePairResource, serverEpoch, usersMarker } from "../src/parallel-pair"

const server = { container: "loginom-evals-users", studioContainer: "loginom-evals-studio", network: "loginom-evals-users",
  alias: "loginom-server-7.4.2-test", url: "http://127.0.0.1:32771/app/", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" }
const nonce = "11111111-1111-4111-8111-111111111111"

test("pair CLI: missing explicit ownership arguments fails before Docker with exit 2", async () => {
  const child = Bun.spawn([process.execPath, path.resolve(import.meta.dir, "../script/parallel-pair.ts"), "destroy"],
    { env: { PATH: "/not-available" }, stdout: "pipe", stderr: "pipe" })
  const [code, stdout, stderr] = await Promise.all([child.exited, new Response(child.stdout).text(), new Response(child.stderr).text()])
  expect(code).toBe(2)
  expect(stdout + stderr).toContain("PAIR_ARGUMENTS")
})

test("pair reconciliation: an unknown create reply adopts only the single intended full ID", () => {
  const snapshot = [{ Id: "a".repeat(64), Name: `/${server.container}`, Labels: {
    "loginom.evals.kind": "users", "loginom.evals.purpose": "research", "loginom.evals.nonce": nonce,
  } }]
  expect(reconcilePairResource(server.container, "research", nonce, snapshot)).toBe("a".repeat(64))
  expect(reconcilePairResource(server.container, "research", nonce, [])).toBeUndefined()
  expect(reconcilePairResource(server.container, "research", nonce, snapshot, "a".repeat(64))).toBe("a".repeat(64))
  expect(() => reconcilePairResource(server.container, "research", nonce, snapshot, "b".repeat(64))).toThrow("PAIR_OWNERSHIP")
})

test("pair reconciliation: foreign labels, missing owned ID and duplicate network names are refused", () => {
  const item = { Id: "a".repeat(64), Name: server.network, Labels: {
    "loginom.evals.kind": "users", "loginom.evals.purpose": "research", "loginom.evals.nonce": nonce,
  } }
  expect(() => reconcilePairResource(server.network, "research", nonce, [item, { ...item, Id: "b".repeat(64) }])).toThrow("PAIR_OWNERSHIP")
  expect(() => reconcilePairResource(server.network, "research", nonce, [], item.Id)).toThrow("PAIR_OWNERSHIP")
  expect(() => reconcilePairResource(server.network, "acceptance", nonce, [item])).toThrow("PAIR_OWNERSHIP")
  expect(() => reconcilePairResource(server.network, "research", nonce, [{ ...item, Labels: {} }])).toThrow("PAIR_OWNERSHIP")
})

test("pair reconciliation: an unresolved create with no visible resource remains unknown", () => {
  expect(() => reconcilePairResource(server.network, "research", nonce, [], undefined, true)).toThrow("PAIR_CREATE_UNKNOWN")
})

test("pair plan: one private network, no server ports and loopback Studio on the configured port", () => {
  const plan = planPair(server, "acceptance", nonce)
  expect(plan.network).toContain(server.network)
  expect(plan.server).toContain("--restart=no")
  expect(plan.server).not.toContain("--publish")
  expect(plan.server).toContain(`--network-alias=${server.alias}`)
  expect(plan.studio).toContain("127.0.0.1:32771:80")
  expect(plan.studio).toContain("--restart=no")
  expect(plan.server.at(-1)).toBe("sha256:d138ce018adb4959282e65f5e5b7fe58265706d6c8c5a432022e4400ca387d1a")
  expect(plan.studio.at(-1)).toBe("sha256:69ce44ac1002dea3d3a78b5e35eb9175a352530ecd3f05bdb727d63895004e28")
})

test("pair plan: unsafe routes, dev network and ambiguous names fail before Docker", () => {
  const invalid = [{ url: "http://10.200.2.58:32771/app/" }, { url: "https://127.0.0.1:32771/app/" },
    { url: "http://127.0.0.1:0/app/" }, { url: "invalid" }, { network: "loginom-net" },
    { studioContainer: server.container }, { container: "--privileged" }]
  invalid.forEach(change => expect(() => planPair({ ...server, ...change }, "research", nonce)).toThrow("PAIR_CONFIGURATION"))
})

test("users marker: version 2 binds full container ID with no premature user ownership", () => {
  expect(usersMarker("a".repeat(64), nonce)).toMatchObject({ kind: "loginom-evals-users", version: 2, container_id: "a".repeat(64),
    owner_nonce: nonce, roots: ["/workdir/UserStorage", "/workdir/SessionBackup"], inventory: [] })
})

test("users marker: shortened IDs and invalid ownership nonces are refused", () => {
  expect(() => usersMarker("short-id", nonce)).toThrow("PAIR_MARKER")
  expect(() => usersMarker("a".repeat(64), "0".repeat(36))).toThrow("PAIR_MARKER")
  expect(() => planPair(server, "acceptance", "0".repeat(36))).toThrow("PAIR_CONFIGURATION")
})

test("server epoch: stable daemon snapshot is reusable, restart with same ID changes epoch", () => {
  const snapshot = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", hostBootId: nonce,
    daemonExe: "/app/loginomd", daemonCmdline: "/app/loginomd\0", daemonStat: `1 (loginomd) S ${Array(18).fill("0").join(" ")} 12345` }
  expect(serverEpoch(snapshot)).toMatch(/^[a-f0-9]{64}$/)
  expect(serverEpoch({ ...snapshot })).toBe(serverEpoch(snapshot))
  expect(serverEpoch({ ...snapshot, startedAt: "2026-10-13T11:00:00Z" })).not.toBe(serverEpoch(snapshot))
})

test("server epoch: unreadable or unknown daemon identity is refused", () => {
  const snapshot = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", hostBootId: nonce,
    daemonExe: "/app/loginomd", daemonCmdline: "/app/loginomd\0--run\0-workdir=/workdir\0", daemonStat: `1 (loginomd) S ${Array(18).fill("0").join(" ")} 12345` }
  const invalid = [{ containerId: "server" }, { startedAt: "invalid" }, { hostBootId: "" }, { daemonExe: "/bin/sh" },
    { daemonCmdline: "/bin/sh\0" }, { daemonStat: "unreadable" }, { daemonStat: snapshot.daemonStat.replace("12345", "unknown") }]
  invalid.forEach(change => expect(() => serverEpoch({ ...snapshot, ...change })).toThrow("SERVER_IDENTITY_UNVERIFIED"))
})

test("server epoch: volatile stat fields preserve epoch while daemon starttime or host boot changes it", () => {
  const snapshot = { containerId: "a".repeat(64), startedAt: "2026-10-13T10:00:00Z", hostBootId: nonce,
    daemonExe: "/app/loginomd", daemonCmdline: "/app/loginomd\0--run\0-workdir=/workdir\0", daemonStat: `1 (loginomd worker) S ${Array(18).fill("0").join(" ")} 12345` }
  expect(serverEpoch({ ...snapshot, daemonStat: snapshot.daemonStat.replace(") S 0", ") R 99") })).toBe(serverEpoch(snapshot))
  expect(serverEpoch({ ...snapshot, daemonStat: snapshot.daemonStat.replace("12345", "12346") })).not.toBe(serverEpoch(snapshot))
  expect(serverEpoch({ ...snapshot, hostBootId: "22222222-2222-4222-8222-222222222222" })).not.toBe(serverEpoch(snapshot))
})
