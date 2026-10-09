import path from "node:path"
import { mkdir } from "node:fs/promises"
import { validateTextImportAttempt } from "./text-import"

export async function prepareTextImportCold(taskDir: string, attemptDir: string, outputDir: string, packagePath: string) {
  const verdict = await validateTextImportAttempt(taskDir, attemptDir, packagePath)
  if (verdict.errors.length || verdict.failures.length) throw Error(`cold admission: ${[...verdict.errors, ...verdict.failures].join("; ")}`)
  const spec = await Bun.file(path.join(taskDir, "SPEC.json")).json() as {
    id: string; inputs: { path: string; bytes: number; sha256: string }[];
    oracle_recipe: { input: string; expected: string; parse: { settings: unknown; columns: Record<string, unknown>[] } }[]
  }
  const recipe = spec.oracle_recipe.at(-1)
  if (!recipe) throw Error("diagnostic cases have no positive cold table contract")
  const input = spec.inputs.find(item => item.path === recipe.input)
  if (!input) throw Error("cold source not found in case inputs")
  const expected = await Bun.file(path.join(taskDir, recipe.expected)).json() as {
    schema: { name: string; label: string; type: string; data_kind: string }[];
    row_count: number; rows: { type: string; value: string | null }[][]
  }
  const packageBytes = await Bun.file(path.join(attemptDir, "artifact/package.lgp")).bytes()
  const events = await Bun.file(path.join(attemptDir, "events.jsonl")).bytes()
  await mkdir(outputDir, { mode: 0o700 }) // A second preparation cannot replace evidence.
  await Bun.write(path.join(outputDir, "expected.json"), JSON.stringify({ case_id: spec.id,
    source: { ...input, name: path.basename(input.path) }, delivery_count: spec.inputs.length,
    settings: recipe.parse.settings, columns: expected.schema.map(column => ({ ...column, used: true })),
    row_count: expected.row_count, expected_rows: expected.rows.map(row => row.map(cell => cell.value)) }, null, 2) + "\n")
  await Bun.write(path.join(outputDir, "saved.json"), JSON.stringify({ path: packagePath }) + "\n")
  await Bun.write(path.join(outputDir, "preparation.json"), JSON.stringify({ case_id: spec.id, runtime: "NOT_RUN",
    package_sha256: new Bun.CryptoHasher("sha256").update(packageBytes).digest("hex"),
    events_path: path.resolve(attemptDir, "events.jsonl"), events_sha256: new Bun.CryptoHasher("sha256").update(events).digest("hex"),
    cli_sha: "5cd74d8ee5d6125692d953eb327b4d4f833c27a1" }, null, 2) + "\n")
}
