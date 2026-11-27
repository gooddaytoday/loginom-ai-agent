import { expect, test } from "bun:test"
import { SessionID } from "@opencode/schema/session-id"
import { packageReferencesHandlers } from "../src/package-references"
import { referencesNotChecked, type ReadReferences } from "@loginom-ai-agent/loginom-host/package-references-contract"

const call = {
  signal: new AbortController().signal,
  error(): never { throw Error("Unexpected RPC error") },
}

test("references reports not checked when Loginom is not connected", async () => {
  const rpc = packageReferencesHandlers(async () => true, {
    generation: async () => 0,
    references: async () => { throw Error("Must not scan without a connection") },
  })
  expect(await rpc.references({ sessionID: SessionID.create() }, call)).toMatchObject({
    status: "not_checked", reason: "not_connected", complete: false, packages: [], packagesScanned: 0,
  })
})

test("references pins the active generation and refuses to scan another session", async () => {
  const sessionID = SessionID.create()
  const requests: ReadReferences[] = []
  const rpc = packageReferencesHandlers(async (id) => id === sessionID, {
    generation: async () => 17,
    references: async (input) => {
      requests.push(input)
      return referencesNotChecked("no_copy")
    },
  })
  await rpc.references({ sessionID: SessionID.create() }, call)
  expect(await rpc.references({ sessionID }, call)).toMatchObject({ status: "not_checked", reason: "no_copy" })
  expect(requests).toEqual([{ sessionID, generation: 17 }])
})
