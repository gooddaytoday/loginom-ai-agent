import { expect, test } from "bun:test"
import { planPair, serverEpoch, usersMarker } from "../src/parallel-pair"

const server = { container: "loginom-evals-users", studioContainer: "loginom-evals-studio", network: "loginom-evals-users",
  alias: "loginom-server-7.4.2-test", url: "http://127.0.0.1:32771/app/", storageRoot: "/workdir/UserStorage", backupRoot: "/workdir/SessionBackup" }
const nonce = "11111111-1111-4111-8111-111111111111"

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
