import type { DraftEntry } from "../../src/draft/server.ts"

const parameters = (value: DraftEntry["data"]["parameters"]) => value
parameters([{ name: "MinBudget", value: 7 }, { name: "Empty", value: null }])
// @ts-expect-error Draft SDK parameters accept numbers or null only.
parameters([{ name: "Text", value: "sample" }])
// @ts-expect-error Draft SDK parameters accept numbers or null only.
parameters([{ name: "Boolean", value: true }])
