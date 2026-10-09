import { expect, test } from "bun:test"
import { join } from "node:path"
import { planColdReplay } from "../script/skills-acceptance/cold-plan"

const fixtures = join(import.meta.dir, "fixtures/skills-cold")
const request = {
  package: join(fixtures, "sales.lgp"),
  packageSha256: "ad9e8e3b8e63597d724a26fc88f1fa17dc0c9b396ada0624a2756d13238b3790",
  packagePath: "/user/ref-sales-by-category-1.lgp",
  resultPrefix: "ref-sales-by-category-1",
  username: "user",
  inputs: [
    {
      path: join(fixtures, "dataset.csv"),
      serverPath: "/user/87f0e1cd3e87995bb64ac2670d82da391ce71b5fedda071f214e443eb68ce067-0-dataset.csv",
      sha256: "673fc3a6482c19baf96a2221a3964c151716a9c5e66837601df3d8de6316d1a8",
    },
  ],
}

test("cold replay keeps the saved export identity and original input binding", async () => {
  const before = await Bun.file(request.package).bytes()
  const plan = await planColdReplay(request)
  expect(plan.packagePath).toBe(request.packagePath)
  expect(plan.export).toEqual({
    module: "Unit_0",
    guid: "c88865ca-8a7f-497e-8b1f-7fa7162812a9",
    label: "CSV: продажи по категориям",
    path: "/user/ref-sales-by-category-1.result.csv",
  })
  expect(plan.inputs).toEqual(request.inputs)
  expect(await Bun.file(request.package).bytes()).toEqual(before)
})

test("cold replay refuses a package belonging to another attempt", async () => {
  await expect(planColdReplay({ ...request, packagePath: "/user/other-attempt.lgp" })).rejects.toThrow(
    "COLD_PACKAGE_OWNERSHIP_INVALID",
  )
})

test("cold replay refuses input bytes that do not match the recorded snapshot", async () => {
  await expect(
    planColdReplay({ ...request, inputs: [{ ...request.inputs[0]!, sha256: "0".repeat(64) }] }),
  ).rejects.toThrow("COLD_INPUT_INTEGRITY_INVALID")
})

test("cold replay requires a recorded binding for the saved import filename", async () => {
  await expect(
    planColdReplay({ ...request, inputs: [{ ...request.inputs[0]!, serverPath: "/user/other.csv" }] }),
  ).rejects.toThrow("COLD_INPUT_BINDING_INVALID")
})

test("cold replay refuses an export outside this attempt's result filename", async () => {
  await expect(
    planColdReplay({ ...request, packagePath: "/user/eval-current.lgp", resultPrefix: "eval-current" }),
  ).rejects.toThrow("COLD_OUTPUT_OWNERSHIP_INVALID")
})

test("cold replay refuses package bytes changed after artifact collection", async () => {
  await expect(planColdReplay({ ...request, packageSha256: "0".repeat(64) })).rejects.toThrow(
    "COLD_PACKAGE_INTEGRITY_INVALID",
  )
})

test("cold replay reports a saved package without a runnable CSV export", async () => {
  await expect(
    planColdReplay({
      ...request,
      package: join(import.meta.dir, "fixtures/package-docs/nested.lgp"),
      packageSha256: "73bca886d6010637becf6cb41ad2fd69ba64269e8251426c4e0a7e7ad2de483c",
    }),
  ).rejects.toThrow("COLD_EXPORT_UNSUPPORTED")
})

test("cold replay refuses even an unused input binding in another account", async () => {
  await expect(
    planColdReplay({
      ...request,
      inputs: [...request.inputs, { ...request.inputs[0]!, serverPath: "/another-user/dataset.csv" }],
    }),
  ).rejects.toThrow("COLD_INPUT_BINDING_INVALID")
})

test("cold replay requires absolute local snapshot paths", async () => {
  await expect(planColdReplay({ ...request, package: "sales.lgp" })).rejects.toThrow("COLD_SOURCE_PATH_INVALID")
})

test("cold replay refuses ambiguous duplicate destinations", async () => {
  await expect(planColdReplay({ ...request, inputs: [...request.inputs, ...request.inputs] })).rejects.toThrow(
    "COLD_INPUT_BINDING_INVALID",
  )
})
