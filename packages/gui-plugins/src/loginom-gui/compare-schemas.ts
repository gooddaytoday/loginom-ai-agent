import type { Endpoint, Link, Node, SchemaPair, Workflow } from "./contract"
import { cardHeight, cardWidth } from "./graph"

function key(workflow: Workflow) {
  return JSON.stringify(workflow.key)
}

function endpointKey(endpoint: Endpoint) {
  return [endpoint.node_guid, endpoint.port_guid ?? [endpoint.kind, endpoint.index]]
}

export function linkKey(link: Link) {
  return JSON.stringify([endpointKey(link.source), endpointKey(link.target)])
}

function nodeID(node: Node) {
  return node.boundary_role ? null : node.guid
}

function removedNodes(before: Workflow, after?: Workflow) {
  const retained = new Set(after?.nodes.map(nodeID))

  return before.nodes.filter((node) => {
    const guid = nodeID(node)

    return guid !== null && !retained.has(guid)
  })
}

type WorkflowPair = { before?: Workflow; after?: Workflow }

type NodeStatus = "added" | "changed" | "removed"

function pairWorkflows(before: readonly Workflow[], after: readonly Workflow[]): WorkflowPair[] {
  const originals = new Map(before.map((workflow) => [key(workflow), workflow]))

  const pairs: WorkflowPair[] = after.map((workflow) => {
    const original = originals.get(key(workflow))
    originals.delete(key(workflow))

    return { before: original, after: workflow }
  })

  return [...pairs, ...Array.from(originals.values(), (workflow) => ({ before: workflow }))]
}

export function overlayWorkflows(before: readonly Workflow[], after: readonly Workflow[]): Workflow[] {
  return pairWorkflows(before, after).flatMap((pair) => {
    if (!pair.after) return pair.before ? [pair.before] : []

    if (!pair.before) return [pair.after]
    const after = pair.after
    const removed = removedNodes(pair.before, after)
    const removedIDs = new Set(removed.map(nodeID))

    const links = pair.before.links.filter(
      (link) => removedIDs.has(link.source.node_guid) || removedIDs.has(link.target.node_guid),
    )

    return [
      {
        ...after,
        nodes: [
          ...after.nodes,
          ...removed.map((node) => ({
            ...node,
            position: after.nodes.some(
              (current) =>
                current.position &&
                node.position &&
                Math.abs(current.position.x - node.position.x) < cardWidth &&
                Math.abs(current.position.y - node.position.y) < cardHeight,
            )
              ? null
              : node.position,
          })),
        ],
        links: [...after.links, ...links],
        submodels: overlayWorkflows(pair.before.submodels, after.submodels),
      },
    ]
  })
}

export function pathIn(workflows: readonly Workflow[], previous: readonly Workflow[]) {
  const root = workflows.find((workflow) => key(workflow) === JSON.stringify(previous[0]?.key)) ?? workflows[0]

  if (!root) return []
  const path = [root]

  for (const workflow of previous.slice(1)) {
    const child = path.at(-1)?.submodels.find((model) => key(model) === key(workflow))

    if (!child) break
    path.push(child)
  }

  return path
}

export function findNodePath(workflows: readonly Workflow[], guid: string): readonly Workflow[] | undefined {
  for (const workflow of workflows) {
    if (workflow.nodes.some((node) => nodeID(node) === guid)) return [workflow]
    const nested = findNodePath(workflow.submodels, guid)

    if (nested) return [workflow, ...nested]
  }
}

export function workflowAt(workflows: readonly Workflow[], path: readonly Workflow[]) {
  const keys = path.map(key)
  let candidates = workflows
  let current: Workflow | undefined

  for (const id of keys) {
    current = candidates.find((workflow) => key(workflow) === id)

    if (!current) return
    candidates = current.submodels
  }

  return current
}

export function schemaNodeChanges(pair: SchemaPair) {
  const changes = new Map<string, { guid: string; label: string; kind: NodeStatus }>()

  const set = (node: Node, kind: NodeStatus) => {
    const guid = nodeID(node)

    if (guid) changes.set(guid, { guid, label: node.label, kind })
  }

  function compare(before: readonly Workflow[], after: readonly Workflow[]) {
    for (const pair of pairWorkflows(before, after)) {
      const prior = new Map(pair.before?.nodes.map((node) => [nodeID(node), node]))
      const current = new Map(pair.after?.nodes.map((node) => [nodeID(node), node]))

      for (const node of pair.after?.nodes ?? []) {
        const guid = nodeID(node)

        if (!guid) continue
        const old = prior.get(guid)

        if (!old) set(node, "added")
        else if (JSON.stringify(old) !== JSON.stringify(node)) set(node, "changed")
      }

      if (pair.before) for (const node of removedNodes(pair.before, pair.after)) set(node, "removed")

      const beforeLinks = new Set(pair.before?.links.map(linkKey))
      const afterLinks = new Set(pair.after?.links.map(linkKey))

      const markEndpoints = (link: Link) => {
        for (const guid of [link.source.node_guid, link.target.node_guid]) {
          if (!guid || changes.has(guid)) continue
          const node = current.get(guid)

          if (node) set(node, "changed")
        }
      }

      for (const link of pair.before?.links ?? []) if (!afterLinks.has(linkKey(link))) markEndpoints(link)

      for (const link of pair.after?.links ?? []) if (!beforeLinks.has(linkKey(link))) markEndpoints(link)
      compare(pair.before?.submodels ?? [], pair.after?.submodels ?? [])
    }
  }

  compare(pair.before.workflows, pair.after.workflows)

  return changes
}
