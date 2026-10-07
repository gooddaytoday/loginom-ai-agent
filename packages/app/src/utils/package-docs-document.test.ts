import { expect, test } from "bun:test"
import { completedPackageDocument } from "./package-docs-document"

test("a completed document exposes the actual emitted path with URL-safe Unicode and spaces", () => {
  const document = completedPackageDocument({
    status: "completed",
    input: { operation: "emit", format: "pdf" },
    output: JSON.stringify({
      structure: "/workspace/.work/package-docs/demo/structure.json",
      report: "/workspace/.work/package-docs/demo/report.md",
      output: "/workspace/Отчёт #1%?.lgp_report.pdf",
    }),
    directory: "/workspace",
  })
  expect(document).toEqual({
    filename: "Отчёт #1%?.lgp_report.pdf",
    url: "file:///workspace/%D0%9E%D1%82%D1%87%D1%91%D1%82%20%231%25%3F.lgp_report.pdf",
  })
})

test("unfinished or non-emission tool results do not offer an output document", () => {
  const result = {
    status: "completed",
    input: { operation: "emit" },
    output: '{"output":"/workspace/report.pdf"}',
    directory: "/workspace",
  }
  for (const status of ["pending", "running", "error", undefined])
    expect(completedPackageDocument({ ...result, status })).toBeUndefined()
  for (const operation of ["extract", "skeleton", undefined])
    expect(completedPackageDocument({ ...result, input: { operation } })).toBeUndefined()
})

test("only report files in the current directory can reach the native opener", () => {
  const result = { status: "completed", input: { operation: "emit" }, directory: "/workspace" }
  for (const path of [
    "/workspace-other/report.pdf",
    "/workspace/../report.pdf",
    "/workspace/sub/report.pdf",
    "/workspace/report.sh",
    "/workspace//report.pdf",
    "file:///workspace/report.pdf",
    "https://example.com/report.pdf",
    "report.pdf",
  ])
    expect(completedPackageDocument({ ...result, output: JSON.stringify({ output: path }) })).toBeUndefined()
  for (const format of ["pdf", "docx", "md"])
    expect(
      completedPackageDocument({ ...result, output: JSON.stringify({ output: `/workspace/report.${format}` }) }),
    ).toMatchObject({ filename: `report.${format}` })
  for (const output of ["not JSON", "[]", "null", '{"output":13}'])
    expect(completedPackageDocument({ ...result, output })).toBeUndefined()
})
