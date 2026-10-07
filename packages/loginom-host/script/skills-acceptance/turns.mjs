export function acceptanceTurns(testcase) {
  const automation = { profile: "loginom-automation", result: "saved-executed-package" }
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
  return [{ ...testcase, scenario: testcase.id === "scenario-create", verification: "sales" }]
}
