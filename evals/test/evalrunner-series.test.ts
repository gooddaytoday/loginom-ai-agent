import { expect, test } from "bun:test"
import { evalsRoot } from "../src/config"
import { loadEvalrunnerCorpus, buildEvalrunnerSlots } from "../src/evalrunner-series"

test("full series freezes only 48 accepted cases and orders three rounds regular, analytic, node", async () => {
  const corpus = await loadEvalrunnerCorpus(evalsRoot)
  expect(corpus.cases.length).toBe(48)
  expect(["regular", "analytic", "node"].map(collection => corpus.cases.filter(item => item.collection === collection).length)).toEqual([3, 35, 10])
  const slots = buildEvalrunnerSlots(corpus)
  expect(slots.length).toBe(144)
  expect(new Set(slots.map(slot => slot.id)).size).toBe(144)
  for (const round of [1, 2, 3]) {
    const current = slots.filter(slot => slot.round === round)
    expect(current.map(slot => [slot.collection, slot.case])).toEqual(corpus.cases.map(item => [item.collection, item.id]))
    expect(current.slice(0, 3).every(slot => slot.collection === "regular")).toBe(true)
    expect(current.slice(38).every(slot => slot.collection === "node")).toBe(true)
  }
  expect(corpus.files.length).toBeGreaterThan(48)
  expect(corpus.files.every(file => /^[a-f0-9]{64}$/.test(file.sha256))).toBe(true)
  expect((await loadEvalrunnerCorpus(evalsRoot)).sha256).toBe(corpus.sha256)
})
