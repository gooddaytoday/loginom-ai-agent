import type { PackageStructure } from "../package-docs/extract"

type Node = PackageStructure["modules"][number]["workflow_nodes"][number]
type Body = { workflow_nodes: Node[]; submodels: Array<Body & { label: string }> }

export function draftFromPackage(structure: PackageStructure) {
  const imports = structure.modules.flatMap((module) => walk(module))
  const used = new Set<string>()
  const tables = imports.map((node, index) => {
    const base = unique(tableName(node.label, index), used)
    return {
      source: {
        label: node.label,
        engine_type: node.engine_type,
        file: node.settings_main.FileName ?? node.settings_main.File ?? "",
        settings: node.settings_main,
      },
      table: {
        name: base,
        rows: 100,
        columns: [],
        output: { format: "csv", file: `${base}.csv` },
      },
    }
  })
  return {
    note: "Колонки файла в пакете не описаны. Заполни columns по схеме входа сценария или по результату loginom_dock_node_read, затем вызови validate и generate.",
    imports: tables.map((item) => item.source),
    spec: { name: folder(structure.package.name) || "from-package", seed: 1, tables: tables.map((item) => item.table), defects: [] },
  }
}

function walk(body: Body): Node[] {
  return [
    ...body.workflow_nodes.filter((node) => /import/i.test(node.engine_type) || /import/i.test(node.service_name)),
    ...body.submodels.flatMap((submodel) => walk(submodel)),
  ]
}

function tableName(label: string, index: number) {
  const cleaned = label.trim().replace(/[^\p{L}\p{N}_ ]+/gu, " ").replace(/\s+/gu, " ").trim()
  const named = /^\p{L}/u.test(cleaned) ? cleaned.slice(0, 64) : ""
  return named || `import_${index + 1}`
}

function unique(name: string, used: Set<string>) {
  const base = used.has(name) ? `${name.slice(0, 60)} ${used.size + 1}` : name
  used.add(base)
  return base
}

function folder(name: string) {
  return name.trim().replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 64)
}
