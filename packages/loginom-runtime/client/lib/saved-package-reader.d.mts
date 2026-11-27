/// <reference lib="dom" />

export type XmlElement = Element

export function normalizePackageGuid(value: string): string
export function requirePackageGuid(value: string): string
export function children(parent?: XmlElement): XmlElement[]
export function child(parent: XmlElement | undefined, name: string): XmlElement | undefined
export function items(parent?: XmlElement): XmlElement[]
export function withSavedPackage<T>(
  bytes: Uint8Array,
  xmlBudget: number | undefined,
  read: (archive: {
    xml: (name: string) => Promise<XmlElement | undefined>
    units: () => Promise<string[]>
  }) => Promise<T>,
): Promise<T>

export type SavedNode = { element: XmlElement; guid: string; name: string; display_name: string; label: string }
export function readSavedNode(element: XmlElement): SavedNode

export type SavedWorkflow = {
  root: XmlElement | undefined
  nodes: (SavedNode & { submodel?: SavedWorkflow })[]
  links: {
    source_node_guid: string
    source_port_guid: string
    target_node_guid: string
    target_port_guid: string
  }[]
}
export function readSavedWorkflow(root?: XmlElement, depth?: number): SavedWorkflow
