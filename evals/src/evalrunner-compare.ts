import path from "node:path"
import { readFile, writeFile } from "node:fs/promises"
import { checkEvalrunnerSeries } from "./evalrunner-controller"
import { readEvalrunnerSeries, evalrunnerHash } from "./evalrunner-series"
import type { EvalrunnerConfig } from "./evalrunner"

type ComparisonRow = { caseKey: string; round: number; verdict: string; status: string; score: number | null;
  durationMs: number; tokens: { input: number; output: number; reasoning: number }; failures: string[]; startedAt: string; finishedAt: string }

export function describeEvalrunnerComparison(baseline: ComparisonRow[], current: ComparisonRow[], pins: { baseline: unknown; current: unknown }) {
  const keys = [...new Set([...baseline, ...current].map(row => row.caseKey))].sort()
  if (keys.some(key => [baseline, current].some(rows => rows.filter(row => row.caseKey === key).length !== 3 ||
    new Set(rows.filter(row => row.caseKey === key).map(row => row.round)).size !== 3))) throw Error("Comparison requires three unique outcomes per case")
  const cases = keys.map(caseKey => ({ caseKey, changedRubric: caseKey === "analytic:category-rating-revenue",
    baseline: baseline.filter(row => row.caseKey === caseKey).sort((a, b) => a.round - b.round),
    current: current.filter(row => row.caseKey === caseKey).sort((a, b) => a.round - b.round) }))
  const group = (selected: typeof cases) => ({ cases: selected.map(item => ({ ...item,
    baselinePassN: item.baseline.filter(row => row.verdict === "PASS").length, currentPassN: item.current.filter(row => row.verdict === "PASS").length })),
    collections: Object.fromEntries(["regular", "analytic", "node"].map(collection => [collection, {
      baseline: aggregate(selected.flatMap(item => item.caseKey.startsWith(collection + ":") ? item.baseline : []), collection === "node"),
      current: aggregate(selected.flatMap(item => item.caseKey.startsWith(collection + ":") ? item.current : []), collection === "node"),
    }])) as Record<"regular" | "analytic" | "node", { baseline: ReturnType<typeof aggregate>; current: ReturnType<typeof aggregate> }> })
  return { kind: "evalrunner-descriptive-comparison", comparison: "DESCRIPTIVE_ONLY/INCOMPARABLE", pins,
    limitations: ["Different CLI/harness and judge; no formal comparability, significance or proved quality change.",
      "47 unchanged cases are reported separately from category-rating-revenue with its changed rubric.",
      "New judge is uncalibrated; no LAB-55 rejudging or automatic baseline promotion.",
      "Product duration sum differs from calendar duration. Judge usage and monetary cost are unknown; historical cost=0 is not evidence of free usage."],
    all: group(cases), unchanged47: group(cases.filter(item => !item.changedRubric)), changedRubric: group(cases.filter(item => item.changedRubric)) }
}

function aggregate(rows: ComparisonRow[], node: boolean) {
  const scores = rows.flatMap(row => !node && row.score !== null ? [row.score] : [])
  return { measured: rows.length, passed: rows.filter(row => row.verdict === "PASS").length,
    completed: rows.filter(row => row.status === "completed").length,
    meanScore: scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null,
    productDurationSumMs: rows.reduce((sum, row) => sum + row.durationMs, 0),
    calendarDurationMs: rows.length ? Math.max(...rows.map(row => Date.parse(row.finishedAt))) - Math.min(...rows.map(row => Date.parse(row.startedAt))) : null,
    productTokens: rows.reduce((sum, row) => ({ input: sum.input + row.tokens.input, output: sum.output + row.tokens.output, reasoning: sum.reasoning + row.tokens.reasoning }), { input: 0, output: 0, reasoning: 0 }),
    judgeTokens: null, monetaryCost: null }
}

export async function compareEvalrunnerSeries(config: EvalrunnerConfig, series: string, baselineArchive: string) {
  const current = await checkEvalrunnerSeries(config, series)
  const manifest = await readEvalrunnerSeries(config, series)
  if (current.status !== "RELEASED" || current.completed !== 144 || manifest.scope !== "full") throw Error("Released full 144 series required")
  const loaded = await Bun.$`python3 ${path.join(config.checkout, "evals/script/evalrunner-baseline.py")} ${baselineArchive}`.quiet()
  const baseline = loaded.json() as { archiveSha256: string; pins: unknown; rows: ComparisonRow[] }
  const rows: ComparisonRow[] = current.measurements.map(item => ({ caseKey: `${item.slot.collection}:${item.slot.case}`, round: item.slot.round,
    verdict: item.verdict, status: item.status, score: item.score, durationMs: item.durationMs, tokens: item.tokens, failures: item.failures,
    startedAt: item.startedAt, finishedAt: item.finishedAt }))
  const report = describeEvalrunnerComparison(baseline.rows, rows, { baseline: baseline.pins, current: manifest.pins })
  if (report.unchanged47.cases.length !== 47 || report.changedRubric.cases.length !== 1) throw Error("Comparison corpus differs")
  const markdown = ["# Descriptive comparison with LAB-55", "", ...report.limitations.map(text => `- ${text}`), "",
    "| Collection | LAB-55 PASS | New PASS | LAB-55 completed | New completed |", "| --- | --- | --- | --- | --- |",
    ...(["regular", "analytic", "node"] as const).map(key => { const item = report.all.collections[key]; return `| ${key} | ${item.baseline.passed}/${item.baseline.measured} | ${item.current.passed}/${item.current.measured} | ${item.baseline.completed} | ${item.current.completed} |` }), "",
    "47 unchanged cases and the changed rubric case have separate complete records in comparison.json.", "",
    "| Case | Rubric | LAB-55 attempts | New attempts | LAB-55 PASS n/3 | New PASS n/3 |", "| --- | --- | --- | --- | --- | --- |",
    ...report.all.cases.map(item => `| ${item.caseKey} | ${item.changedRubric ? "changed" : "unchanged"} | ${item.baseline.map(row => row.verdict).join(", ")} | ${item.current.map(row => row.verdict).join(", ")} | ${item.baselinePassN}/3 | ${item.currentPassN}/3 |`), ""].join("\n")
  const json = JSON.stringify(report, null, 2)
  await writeOnce(path.join(series, "comparison.json"), json)
  await writeOnce(path.join(series, "comparison.md"), markdown)
  await writeOnce(path.join(series, "comparison-receipt.json"), JSON.stringify({ kind: "evalrunner-comparison-receipt", baselineArchiveSha256: baseline.archiveSha256,
    releaseSha256: evalrunnerHash(await readFile(path.join(series, "release.json"))), jsonSha256: evalrunnerHash(json), markdownSha256: evalrunnerHash(markdown) }, null, 2))
  return { status: "DESCRIPTIVE_COMPARISON_WRITTEN", cases: 48, unchanged: 47, changedRubric: 1 }
}

async function writeOnce(file: string, text: string) {
  if (await Bun.file(file).exists()) { if (await Bun.file(file).text() !== text) throw Error("Derived comparison changed"); return }
  await writeFile(file, text, { flag: "wx", mode: 0o600 })
}
