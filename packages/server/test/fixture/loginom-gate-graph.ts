import assert from "node:assert/strict"
import { Schema } from "effect"
import { validateFilterConditions } from "../../../loginom-runtime/client/lib/filter-parameters.mjs"
import { prepareNodeTarget } from "../../../loginom-runtime/client/lib/node-target.mjs"
import { doc, nodeRef, originalEdge, salesCsv, workflowRef } from "./loginom-gate-scenarios"

type Edge = typeof originalEdge
const inputLink = Schema.decodeUnknownSync(
  Schema.Tuple([
    Schema.Struct({ source: Schema.Struct({ node_id: Schema.String }), output: Schema.Number, input: Schema.Number }),
  ]),
)
export const output = (operation_id: string, node_id: string, row_count: number, replaced_links?: unknown) => ({
  status: "SUCCEEDED",
  action_key: "node.apply",
  action_revision: "1",
  phase: "verified",
  operation_id,
  cleanup_complete: true,
  effect_possible: true,
  error: null,
  trace: [],
  output: {
    node: nodeRef(node_id),
    replaced_links,
    output: {
      ports: [
        {
          port: 0,
          port_guid: `${node_id}-out`,
          row_count,
          fresh: true,
          schema: [],
          sample: [],
          sample_complete: false,
        },
      ],
    },
  },
})

export function gateGraph() {
  const links: Edge[] = []
  const graph = {
    complete: true,
    document_id: doc,
    workflow_ref: workflowRef,
    dom_epoch: 1,
    foreign_links: [],
    nodes: [
      { ref: nodeRef("import"), type: "imports.text", label: "Импорт", inputs: [], outputs: [0] },
      { ref: nodeRef("filter"), type: "transform.filter_data", label: "Фильтр", inputs: [0], outputs: [0, 1] },
      { ref: nodeRef("result"), type: "transform.sorting", label: "Результат", inputs: [0], outputs: [0] },
    ],
    links,
  }
  const years = salesCsv
    .trim()
    .split("\n")
    .slice(1)
    .map((line) => Number(line.split(";")[0]))
  const rows = new Map<string, number>()

  const connect = (target: string, input: unknown) => {
    const [link] = inputLink(input)
    graph.links.push({ source: link.source.node_id, output: link.output, target, input: link.input })
  }

  const resultRows = () => {
    const inputs = graph.links.filter((edge) => edge.target === "result")
    assert.equal(inputs.length, 1, "Результат must have exactly one incoming edge")
    const count = rows.get(inputs[0].source)
    assert.notEqual(count, undefined, "The input must have a confirmed row count")
    return count ?? 0
  }

  return {
    snapshot() {
      return {
        links: graph.links.map((edge) => `${edge.source}→${edge.target}`),
        resultRows: graph.links.some((edge) => edge.target === "result") ? resultRows() : 0,
      }
    },
    async apply(request: Record<string, unknown>) {
      switch (request.operation_id) {
        case "gate-import":
          rows.set("import", years.length)
          return output(request.operation_id, "import", years.length)
        case "gate-result-initial":
          connect("result", request.inputs)
          return output(request.operation_id, "result", resultRows())
        case "gate-filter": {
          const [[condition]] = validateFilterConditions(request.parameters).groups
          assert.equal(condition.field.name, "year")
          assert.equal(condition.operator, "=")
          const count = years.filter((year) => year === condition.value).length
          connect("filter", request.inputs)
          rows.set("filter", count)
          return output(request.operation_id, "filter", count)
        }
        case "gate-result-relinked": {
          const target = await prepareNodeTarget({
            request: {
              document_id: request.document_id,
              workflow_ref: request.workflow_ref,
              target: request.target,
              inputs: request.inputs,
            },
            beforeTarget: undefined,
            signal: undefined,
            operation: { id: request.operation_id, deadline: Date.now() + 10_000 },
            adapter: {
              observe: async () => structuredClone(graph),
              preflight: async () => {},
              positionMatches: () => true,
              mutate: async (effect: { kind: string; parameters: { edge: Edge } }) => {
                const { edge } = effect.parameters
                if (effect.kind === "remove_link")
                  graph.links = graph.links.filter(
                    (candidate) =>
                      candidate.source !== edge.source ||
                      candidate.target !== edge.target ||
                      candidate.output !== edge.output ||
                      candidate.input !== edge.input,
                  )
                else {
                  assert.equal(effect.kind, "connect")
                  graph.links.push(edge)
                }
                return { status: "SUCCEEDED", cleanup_complete: true, effect_possible: true }
              },
            },
            record: async (event: unknown) => event,
          })
          assert.equal(target.status, "SUCCEEDED", target.error)
          return output(request.operation_id, "result", resultRows(), target.replaced_links)
        }
        default:
          throw Error("Unexpected graph request")
      }
    },
  }
}
