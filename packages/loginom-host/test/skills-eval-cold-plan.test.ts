import { expect, test } from "bun:test"
import { join } from "node:path"
import { planEvalColdReplay } from "../script/skills-acceptance/cold-plan"

const fixtures = join(import.meta.dir, "fixtures/skills-cold")
const request = {
  package: join(fixtures, "sales.lgp"),
  packageSha256: "ad9e8e3b8e63597d724a26fc88f1fa17dc0c9b396ada0624a2756d13238b3790",
  packagePath: "/user/ref-sales-by-category-1.lgp",
  resultPrefix: "ref-sales-by-category-1",
  username: "user",
  inputs: [{ path: join(fixtures, "dataset.csv"), sha256: "673fc3a6482c19baf96a2221a3964c151716a9c5e66837601df3d8de6316d1a8" }],
}

test("eval replay binds the saved admission filename to the exact task snapshot bytes", async () => {
  const before = await Bun.file(request.package).bytes()
  const plan = await planEvalColdReplay(request)
  expect(plan.inputs).toEqual([{ ...request.inputs[0], serverPath: "/user/87f0e1cd3e87995bb64ac2670d82da391ce71b5fedda071f214e443eb68ce067-0-dataset.csv" }])
  expect(plan.export.path).toBe("/user/ref-sales-by-category-1.result.csv")
  expect(await Bun.file(request.package).bytes()).toEqual(before)
})

test("eval replay rejects changed snapshot bytes even for an unused attachment", async () => {
  await expect(planEvalColdReplay({
    ...request,
    inputs: [...request.inputs, { path: request.package, sha256: "0".repeat(64) }],
  })).rejects.toThrow("COLD_INPUT_INTEGRITY_INVALID")
})

test("eval replay rejects ambiguous task inputs sharing the saved basename", async () => {
  await expect(planEvalColdReplay({ ...request, inputs: [...request.inputs, ...request.inputs] }))
    .rejects.toThrow("COLD_INPUT_BINDING_INVALID")
})

test("eval replay preserves exact saved export ownership checks", async () => {
  await expect(planEvalColdReplay({ ...request, packagePath: "/user/eval-current.lgp", resultPrefix: "eval-current" }))
    .rejects.toThrow("COLD_OUTPUT_OWNERSHIP_INVALID")
})

test("eval replay rejects changed saved package bytes before execution", async () => {
  await expect(planEvalColdReplay({ ...request, packageSha256: "0".repeat(64) }))
    .rejects.toThrow("COLD_PACKAGE_INTEGRITY_INVALID")
})

test("eval replay refuses relative task snapshot paths", async () => {
  await expect(planEvalColdReplay({ ...request, inputs: [{ ...request.inputs[0]!, path: "dataset.csv" }] }))
    .rejects.toThrow("COLD_SOURCE_PATH_INVALID")
})
