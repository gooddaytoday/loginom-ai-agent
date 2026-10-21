import { cp } from "node:fs/promises"
import { dirname, join } from "node:path"

export function acceptanceInputPath(turn, paths) {
  if (["csv-path", "csv-attachment", "own-created-server-package"].includes(turn.input)) return paths.csv
  return paths[{ "workspace-path": "local", "text-path": "text", "created-lgp-path": "created" }[turn.input] ?? "lgp"]
}

export function acceptanceCliPermission(testcase, turn, path) {
  return !turn.scenario && ["text-read", "edit-after-docs"].includes(testcase.id)
    ? { permission: { external_directory: { [join(dirname(path), "*")]: "allow" } } } : {}
}

export async function prepareAcceptanceInputs(turns, fixtures, paths) {
  const first = turns[0]
  if (turns.some(turn => ["csv-attachment", "csv-path"].includes(turn.input))) await cp(fixtures.csv, paths.csv)
  if (first.input === "workspace-path") await cp(fixtures.lgp, paths.local)
  if (["lgp-attachment", "lgp-and-png-attachments", "external-text-path"].includes(first.input))
    await cp(fixtures[first.fixture ?? "lgp"], paths.lgp)
  if (first.input === "lgp-and-png-attachments") await cp(fixtures.png, paths.png)
  if (first.input === "text-path") await cp(fixtures.text, paths.text)
}

export function acceptanceTurns(testcase) {
  const automation = { profile: "loginom-automation", result: "saved-executed-package" }
  if (testcase.id === "edit-after-docs")
    return [
      { ...testcase.setup, fixture: testcase.fixture, expected: { profile: "package-docs", result: "md" }, scenario: false },
      { ...testcase, scenario: true, verification: "local-calculator" },
    ]
  if (testcase.id === "docs-after-edit")
    return [
      { ...testcase.setup, fixture: testcase.fixture, expected: automation, scenario: true, verification: "local-calculator" },
      { ...testcase, scenario: false },
    ]
  if (["scenario-modify", "scenario-execute-save"].includes(testcase.id))
    return [
      { ...testcase.setup, expected: automation, scenario: true, verification: "import" },
      { ...testcase, scenario: true, verification: testcase.id === "scenario-modify" ? "calculator" : "execution" },
    ]
  if (testcase.id === "scenario-after-docs")
    return [
      { ...testcase.setup, expected: { profile: "package-docs", result: "pdf" }, scenario: false },
      { ...testcase, scenario: true, verification: "sales" },
    ]
  if (["docs-after-build", "scenario-then-docs"].includes(testcase.id))
    return [
      { ...(testcase.setup ?? testcase), expected: automation, scenario: true, verification: "sales" },
      { ...(testcase.setup ? testcase : testcase.followup), input: "lgp-attachment", scenario: false },
    ]
  return [{ ...testcase, scenario: ["scenario-create", "scenario-create-path"].includes(testcase.id), verification: "sales" }]
}
