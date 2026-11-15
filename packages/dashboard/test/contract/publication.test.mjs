import assert from "node:assert/strict"
import test from "node:test"
import { parsePublication } from "../../src/contract/publication.ts"

const publication = () => ({
  format: 1, template: 1,
  binding: { packagePath: "/fixture/orders.lgp", workflowGuid: "11111111-1111-1111-1111-111111111111", nodeGuid: "22222222-2222-2222-2222-222222222222" },
  title: "Заказы", parameters: [{ name: "Budget", label: "Бюджет", min: 0, step: 1000 }],
  files: [
    { path: "src/main.tsx", encoding: "utf8", content: 'document.body.textContent = "🟢 Привет\\n"' },
    { path: "src/logo.png", encoding: "base64", content: Buffer.from([0, 255, 128, 10]).toString("base64") },
  ],
})

test("v1 preserves text and binary source bytes exactly", () => {
  const input = publication()
  const result = parsePublication(JSON.stringify(input))
  assert.deepEqual(result, input)
  assert.deepEqual(Buffer.from(result.files[1].content, "base64"), Buffer.from([0, 255, 128, 10]))
})

test("the complete UTF-8 JSON including metadata fits one MiB", () => {
  const input = publication()
  input.title = ""
  const remaining = 1_048_576 - Buffer.byteLength(JSON.stringify(input))
  input.title = "Я".repeat(Math.floor(remaining / 2)) + "a".repeat(remaining % 2)
  const exact = JSON.stringify(input)
  assert.equal(Buffer.byteLength(exact), 1_048_576)
  assert.equal(parsePublication(exact).title, input.title)
  assert.throws(() => parsePublication(exact + " "), /DASHBOARD_PUBLICATION/)
})

test("only unambiguous permitted source paths and encodings are accepted", () => {
  for (const path of ["../main.tsx", "src/../main.tsx", "src/.hidden/a.ts", "src\\evil.ts", "src//evil.ts", "/src/evil.ts", "src/evil.js", "src/evil\0.ts"]) {
    const input = publication()
    input.files.push({ path, encoding: "utf8", content: "" })
    assert.throws(() => parsePublication(JSON.stringify(input)), /DASHBOARD_PUBLICATION/, path)
  }
  for (const file of [
    { path: "src/logo.png", encoding: "utf8", content: "image" },
    { path: "src/file.ts", encoding: "base64", content: "YQ==" },
    { path: "src/logo.png", encoding: "base64", content: "%%%" },
    { path: "src/logo.png", encoding: "base64", content: "YR==" },
  ]) {
    const input = publication()
    input.files[1] = file
    assert.throws(() => parsePublication(JSON.stringify(input)), /DASHBOARD_PUBLICATION/)
  }
})

test("v1 requires an entry point and at most 200 unique files with no extra fields", () => {
  const input = publication()
  input.files = [input.files[0], ...Array.from({ length: 199 }, (_, i) => ({ path: `src/f${i}.ts`, encoding: "utf8", content: "" }))]
  assert.equal(parsePublication(JSON.stringify(input)).files.length, 200)
  for (const invalid of [
    { ...input, files: [...input.files, { path: "src/extra.ts", encoding: "utf8", content: "" }] },
    { ...input, files: [input.files[0], input.files[0]] },
    { ...input, files: input.files.slice(1) },
    { ...input, format: 2 }, { ...input, template: 2 }, { ...input, sample: [] },
    { ...input, binding: { ...input.binding, secret: "no" } },
    { ...input, parameters: [{ name: "n", label: "n", value: "no" }] },
    { ...input, files: [{ ...input.files[0], extra: true }] },
  ]) assert.throws(() => parsePublication(JSON.stringify(invalid)), /DASHBOARD_PUBLICATION/)
})
