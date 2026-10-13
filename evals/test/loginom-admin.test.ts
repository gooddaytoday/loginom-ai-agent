import { expect, test } from "bun:test"
import { selectOwnedSessions } from "../src/loginom-admin"

const owned = { remoteKey: "session-41", userKey: "user-a", username: "eval-a", serverEpoch: "epoch-1", pendingDisconnect: true, activeOperations: 0 }

test("owned sessions: selection returns a fresh observed row for the recorded identity", () => {
  const observed = { ...owned, pendingDisconnect: false, activeOperations: 1 }
  expect(selectOwnedSessions([observed], [owned])).toEqual([observed])
  expect(selectOwnedSessions([observed], [])).toEqual([])
})

test("owned sessions: equal remote keys do not authorize a changed user or epoch", () => {
  expect(() => selectOwnedSessions([{ ...owned, userKey: "user-b" }], [owned])).toThrow("SESSION_IDENTITY_CHANGED")
  expect(() => selectOwnedSessions([{ ...owned, username: "eval-b" }], [owned])).toThrow("SESSION_IDENTITY_CHANGED")
  expect(() => selectOwnedSessions([{ ...owned, serverEpoch: "epoch-2" }], [owned])).toThrow("SERVER_EPOCH_CHANGED")
})

test("owned sessions: duplicate remote identities are ambiguous in observations and claims", () => {
  expect(() => selectOwnedSessions([owned, owned], [owned])).toThrow("SESSION_IDENTITY_AMBIGUOUS")
  expect(() => selectOwnedSessions([owned], [owned, owned])).toThrow("SESSION_IDENTITY_AMBIGUOUS")
})

test("owned sessions: a username alone cannot substitute a recorded remote identity", () => {
  expect(selectOwnedSessions([{ ...owned, remoteKey: "session-42" }], [owned])).toEqual([])
  expect(selectOwnedSessions([], [owned])).toEqual([])
})
