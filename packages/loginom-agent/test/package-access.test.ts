import { expect, test } from "bun:test"
import { SessionID } from "@opencode/schema/session-id"
import { packageAccessMetadata } from "../src/package-access"

const packagePath = "/user/shared/plan.lgp"

test("the tool metadata carries the package state and only a resolvable conversation link", async () => {
  const sessionID = SessionID.make("ses_writer")
  const host = { packagePath, kind: "other_conversation", sessionID, account: "private" }
  expect(await packageAccessMetadata(host, async (id) => id === sessionID)).toEqual({
    loginom: { packageAccess: { packagePath, kind: "other_conversation", sessionID } },
  })
  expect(await packageAccessMetadata(host, async () => { throw Error("Session missing") })).toEqual({
    loginom: { packageAccess: { packagePath, kind: "read_only", lockMarker: "unknown" } },
  })
  const external = { packagePath, kind: "other_loginom_session" } as const
  expect(await packageAccessMetadata(external, async () => false)).toEqual({ loginom: { packageAccess: external } })
  expect(await packageAccessMetadata({ ...host, sessionID: "invalid" }, async () => true)).toEqual({})
})
