import { expect, test } from "bun:test"
import { PackageSchema, readFinding, type Snapshot } from "./contract"
import { transition, type Request, type State } from "./machine"

const packageGuid = "28978996-a242-4ee9-9070-36c1cc0a4908"

const nodeGuid = "98c84fbe-ad51-491a-bc90-a8bbc87067f8"

const request = { sessionID: "ses_schema", serverID: "local", directory: "/workspace" }

test("only the current conversation's request can finish loading", () => {
  const replaced = { ...request, sessionID: "ses_other" }
  const loading = transition({ status: "closed" }, { type: "open", request })
  const current = transition(loading, { type: "open", request: replaced })

  expect(transition(current, { type: "loaded", request, snapshot: null })).toEqual(current)
  expect(transition(current, { type: "failed", request: replaced })).toEqual({ status: "failed", request: replaced })

  const closed = transition(current, { type: "close" })
  expect(transition(closed, { type: "failed", request: replaced })).toEqual({ status: "closed" })
  expect(transition(loading, { type: "loaded", request, snapshot: null })).toEqual({ status: "empty", request })
})

test("a finding opens its nested saved workflow, not an identically labelled node in another package", async () => {
  const finding = readFinding(
    JSON.stringify({
      text: "Check the input",
      package_guid: "{" + packageGuid.toUpperCase() + "}",
      node_guids: ["{" + nodeGuid.toUpperCase() + "}"],
    }),
  )

  expect(finding).toEqual({ text: "Check the input", packageGuid, nodeGuids: [nodeGuid] })
  const target: Request = { ...request, finding }
  const loading = transition({ status: "closed" }, { type: "open", request: target })

  const decoded = await PackageSchema.methods.schema.output["~standard"].validate({
    snapshot: {
      source: "saved",
      scope: "package",
      complete: true,
      observed_at: "2026-11-27T00:00:00.000Z",
      package: { name: "Sales", guid: packageGuid },
      workflows: [
        {
          key: ["module"],
          label: "Module",
          nodes: [],
          links: [],
          submodels: [
            {
              key: ["module", "child"],
              label: "Child",
              links: [],
              submodels: [],
              nodes: [{ guid: nodeGuid, label: "Check", position: null, type: "TBGFilterDataEngine", ports: [] }],
            },
          ],
        },
      ],
    },
  })

  if (decoded.issues) throw new Error("Invalid snapshot fixture")
  const snapshot = decoded.value.snapshot

  if (!snapshot || snapshot.source !== "saved") throw new Error("Expected a saved snapshot")
  const load = (value: Snapshot): State => transition(loading, { type: "loaded", request: target, snapshot: value })
  expect(load(snapshot)).toMatchObject({
    status: "ready",
    selected: 0,
    path: [{ label: "Module" }, { label: "Child" }],
  })
  expect(load({ ...snapshot, package: { ...snapshot.package, guid: "other-package" } })).toMatchObject({
    status: "empty",
  })
})

test("switches to the original workflow and keeps the selected node by GUID", () => {
  const original = { guid: nodeGuid, label: "Original", position: null, type: "TBGFilterDataEngine", ports: [] }
  const added = { ...original, guid: "added", label: "Added" }
  const workflow = { key: ["module"], label: "Module", links: [], submodels: [], nodes: [original] }

  const before = {
    source: "saved",
    scope: "package",
    complete: true,
    observed_at: "2026-11-27T00:00:00.000Z",
    package: { name: "Sales", guid: packageGuid },
    workflows: [workflow],
  } satisfies Snapshot

  const state = transition(
    { status: "closed" },
    {
      type: "open-changes",
      request,
      changes: {
        v: 1,
        sessionID: request.sessionID,
        turnID: "msg_changes",
        packageName: "Sales",
        copyPath: "Sales — agent copy.lgp",
        edits: [],
        schemaDiff: {
          before,
          after: { ...before, workflows: [{ ...workflow, nodes: [added, { ...original, label: "Renamed" }] }] },
        },
      },
    },
  )

  const showOriginal = (index: number) =>
    transition(transition(state, { type: "select", index }), { type: "mode", mode: "before" })

  expect(showOriginal(1)).toMatchObject({ status: "ready", path: [{ nodes: [original] }], selected: 0 })
  expect(showOriginal(0)).toMatchObject({ status: "ready", selected: undefined })
  expect(transition(showOriginal(1), { type: "mode", mode: "after" })).toMatchObject({ status: "ready", selected: 1 })
})
