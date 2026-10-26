const storeNames = ["Центр", "Север", "Юг", "Запад", "Восток"]

export type RetailParams = {
  stores: number
  year: number
  products: number
  salesPerStore: number
  seed: number
  format: "csv" | "xlsx" | "json"
  defects: boolean
}

export function parseRetailParams(value: unknown): { ok: true; params: RetailParams } | { ok: false; errors: string[] } {
  const root = !value || typeof value !== "object" || Array.isArray(value) ? {} : value as Record<string, unknown>
  const errors: string[] = []
  const stores = integer(root.stores, 3, 1, 12, "stores", errors)
  const year = integer(root.year, 2024, 1990, 2100, "year", errors)
  const products = integer(root.products, 40, 1, 5000, "products", errors)
  const salesPerStore = integer(root.salesPerStore, 200, 1, 20_000, "salesPerStore", errors)
  const seed = integer(root.seed, 1, 0, 0xffffffff, "seed", errors)
  const format = root.format === undefined ? "csv" : root.format
  if (format !== "csv" && format !== "xlsx" && format !== "json") errors.push("format: csv, xlsx или json.")
  if (root.defects !== undefined && typeof root.defects !== "boolean") errors.push("defects должен быть boolean.")
  if (salesPerStore * stores > 100_000) errors.push("salesPerStore * stores больше 100000.")
  if (errors.length || (format !== "csv" && format !== "xlsx" && format !== "json")) return { ok: false, errors }
  return { ok: true, params: { stores, year, products, salesPerStore, seed, format, defects: root.defects !== false } }
}

export function retailSpec(params: RetailParams) {
  const stores = Array.from({ length: params.stores }, (_, index) => storeNames[index] ?? `Магазин ${index + 1}`)
  const extension = params.format
  const output = (file: string) => ({ format: params.format, file })
  const spec = {
    name: `retail-${params.year}`,
    seed: params.seed,
    tables: [
      {
        name: "products",
        rows: params.products,
        columns: [
          { name: "sku", type: "sequence", prefix: "SKU-", width: 4, start: 1 },
          { name: "name", type: "dictionary", dictionary: "products" },
          { name: "category", type: "category", values: ["Молочные", "Бакалея", "Овощи", "Напитки"] },
          { name: "price", type: "decimal", min: 20, max: 800, scale: 2 },
        ],
        output: output(`products.${extension}`),
      },
      {
        name: "sales",
        rows: params.salesPerStore * params.stores,
        columns: [
          { name: "sale_id", type: "sequence", start: 1 },
          { name: "date", type: "date", from: `${params.year}-01-01`, to: `${params.year}-12-31` },
          { name: "store", type: "category", values: stores },
          { name: "sku", type: "ref", table: "products", column: "sku" },
          { name: "qty", type: "int", min: 1, max: 30, distribution: "poisson", lambda: 4 },
          { name: "price", type: "lookup", table: "products", column: "price", match: "sku" },
          { name: "amount", type: "expr", expr: "qty * price" },
        ],
        split: { by: "store", file: `sales-{value}.${extension}` },
        output: { format: params.format },
      },
      {
        name: "warehouse",
        rows: params.products,
        columns: [
          { name: "sku", type: "ref", table: "products", column: "sku", unique: true },
          { name: "stock", type: "int", min: 0, max: 400 },
        ],
        output: output(`warehouse.${extension}`),
      },
      {
        name: "logistics",
        rows: Math.min(params.products * params.stores, 100_000),
        columns: [
          { name: "date", type: "date", from: `${params.year}-01-01`, to: `${params.year}-12-31` },
          { name: "sku", type: "ref", table: "products", column: "sku" },
          { name: "warehouse", type: "category", values: ["Склад"] },
          { name: "store", type: "category", values: stores },
          { name: "qty", type: "int", min: 1, max: 80 },
        ],
        output: output(`logistics.${extension}`),
      },
    ],
    defects: params.defects ? [
      { table: "sales", column: "qty", kind: "missing", rate: 0.03, as: "empty", mechanism: "mcar" },
      { table: "sales", column: "amount", kind: "outlier", rate: 0.02, method: "multiplier", factor: 25, direction: "high" },
      { table: "sales", column: "store", kind: "noise", rate: 0.02, noise: "typo" },
      { table: "sales", kind: "duplicate", rate: 0.01, mode: "exact" },
      { table: "sales", column: "sku", kind: "orphan", rate: 0.01 },
      { table: "sales", column: "amount", kind: "inconsistent", rate: 0.01, factor: 3 },
    ] : [],
  }
  return spec
}

function integer(value: unknown, fallback: number, min: number, max: number, name: string, errors: string[]) {
  if (value === undefined) return fallback
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${name}: целое от ${min} до ${max}.`)
    return fallback
  }
  return value
}
